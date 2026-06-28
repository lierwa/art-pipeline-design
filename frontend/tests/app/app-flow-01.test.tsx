import { App, assetSelectButton, completionState, confirmMergeDialog, createGestureEvent, createdChildElement, createdManualElement, describe, detectedElement, detectedState, drawRectangle, duplicateMergeNameState, expect, exportReadyState, exportSummary, extractedState, extractMergedState, fireEvent, installFetchMock, it, jsonResponse, legacyStatusRejectedState, loadedState, loadedStateWithoutElements, mergeSourceState, mergedState, mockElementRect, mockRect, openAssetContextMenu, overlappingMergeState, partiallyReviewedState, persistedWorkspaceState, pipelineStage, rejectedTreeState, render, repairCompleteState, repairPendingState, screen, setCanvasRect, splitState, toggleAssetSelection, treeState, userEvent, vi, waitFor, within } from "./appTestHarness";

describe("App flow 01", () => {
  it("starts on a new pending workspace with processing records in a floating list", async () => {
    const user = userEvent.setup();
    const runsPayload = {
      runs: [
        {
          id: "run_scene_001",
          title: "scene-a.png",
          sourceFilename: "scene-a.png",
          createdAt: "2026-06-17T12:00:00+00:00",
          updatedAt: "2026-06-17T12:01:00+00:00",
          status: "uploaded",
          elementCount: 0,
        },
      ],
    };
    const emptyRunsPayload = { runs: [] };
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/runs" && (!init || init.method === "GET")) {
        return jsonResponse(runsPayload);
      }

      if (input === "/api/workspace/state?runId=run_scene_001" && (!init || init.method === "GET")) {
        return jsonResponse(loadedStateWithoutElements);
      }

      if (input === "/api/workspace/runs/run_scene_001" && init?.method === "DELETE") {
        return jsonResponse(emptyRunsPayload);
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      const pipelineRail = await screen.findByRole("navigation", { name: /pipeline stages/i });
      expect(within(pipelineRail).queryByText(/processing records/i)).not.toBeInTheDocument();
      expect(screen.queryByText("scene-a.png")).not.toBeInTheDocument();
      expect(screen.getByText(/upload a png to populate the workbench canvas/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/upload png/i)).toBeInTheDocument();
      expect(globalThis.fetch).not.toHaveBeenCalledWith("/api/workspace/state");

      await user.click(screen.getByRole("button", { name: /processing records/i }));
      const recordsList = await screen.findByRole("dialog", { name: /processing records/i });
      expect(within(recordsList).getByText("scene-a.png")).toBeInTheDocument();

      await user.click(within(recordsList).getByRole("button", { name: /open scene-a\.png processing record/i }));

      expect(await screen.findByText(/original\.png - 120 x 90/i)).toBeInTheDocument();
      expect(screen.getByRole("img", { name: /workspace source/i })).toHaveAttribute(
        "src",
        expect.stringContaining("runId=run_scene_001"),
      );

      await user.click(screen.getByRole("button", { name: /processing records/i }));
      const reopenedRecordsList = await screen.findByRole("dialog", { name: /processing records/i });
      await user.click(
        within(reopenedRecordsList).getByRole("button", { name: /delete scene-a\.png processing record/i }),
      );
      await user.click(
        within(await screen.findByRole("alertdialog", { name: /delete processing record/i }))
          .getByRole("button", { name: /delete record/i }),
      );

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith(
          "/api/workspace/runs/run_scene_001",
          expect.objectContaining({ method: "DELETE" }),
        );
      });
      await waitFor(() => {
        expect(screen.getAllByText(/processing record deleted/i).length).toBeGreaterThan(0);
      });
      expect(within(reopenedRecordsList).getByText(/no processing records/i)).toBeInTheDocument();
      expect(screen.getByText(/upload a png to populate the workbench canvas/i)).toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("duplicates a processing record into a checkpoint and switches to the copy", async () => {
    const user = userEvent.setup();
    const sourceRun = {
      id: "run_scene_001",
      title: "scene-a.png",
      sourceFilename: "scene-a.png",
      createdAt: "2026-06-17T12:00:00+00:00",
      updatedAt: "2026-06-17T12:01:00+00:00",
      status: "reviewing",
      elementCount: 1,
    };
    const checkpointRun = {
      ...sourceRun,
      id: "run_scene_002",
      title: "scene-a.png - checkpoint",
      updatedAt: "2026-06-17T12:02:00+00:00",
    };
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/runs" && (!init || init.method === "GET")) {
        return jsonResponse({ runs: [sourceRun] });
      }

      if (input === "/api/workspace/runs/run_scene_001/duplicate" && init?.method === "POST") {
        return jsonResponse({
          run: checkpointRun,
          runs: [checkpointRun, sourceRun],
          state: loadedState,
        });
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      await user.click(await screen.findByRole("button", { name: /processing records/i }));
      const recordsList = await screen.findByRole("dialog", { name: /processing records/i });
      await user.click(
        within(recordsList).getByRole("button", { name: /duplicate scene-a\.png processing record/i }),
      );

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith(
          "/api/workspace/runs/run_scene_001/duplicate",
          expect.objectContaining({ method: "POST" }),
        );
      });
      await waitFor(() => {
        expect(screen.getAllByText(/processing record duplicated/i).length).toBeGreaterThan(0);
      });
      expect(within(recordsList).getByText("scene-a.png - checkpoint")).toBeInTheDocument();
      expect(screen.getByRole("img", { name: /workspace source/i })).toHaveAttribute(
        "src",
        expect.stringContaining("runId=run_scene_002"),
      );
    } finally {
      restoreFetch();
    }
  });

  it("requires confirmation before deleting a processing record", async () => {
    const user = userEvent.setup();
    const runsPayload = {
      runs: [
        {
          id: "run_scene_001",
          title: "scene-a.png",
          sourceFilename: "scene-a.png",
          createdAt: "2026-06-17T12:00:00+00:00",
          updatedAt: "2026-06-17T12:01:00+00:00",
          status: "uploaded",
          elementCount: 0,
        },
      ],
    };
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/runs" && (!init || init.method === "GET")) {
        return jsonResponse(runsPayload);
      }

      if (input === "/api/workspace/runs/run_scene_001" && init?.method === "DELETE") {
        return jsonResponse({ runs: [] });
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      await user.click(await screen.findByRole("button", { name: /processing records/i }));
      const recordsList = await screen.findByRole("dialog", { name: /processing records/i });
      await user.click(
        within(recordsList).getByRole("button", { name: /delete scene-a\.png processing record/i }),
      );

      const dialog = await screen.findByRole("alertdialog", { name: /delete processing record/i });
      expect(within(dialog).getByText(/delete this processing record and its files/i)).toBeInTheDocument();
      expect(globalThis.fetch).not.toHaveBeenCalledWith(
        "/api/workspace/runs/run_scene_001",
        expect.objectContaining({ method: "DELETE" }),
      );

      await user.click(within(dialog).getByRole("button", { name: /cancel/i }));
      expect(screen.queryByRole("alertdialog", { name: /delete processing record/i })).not.toBeInTheDocument();

      await user.click(
        within(recordsList).getByRole("button", { name: /delete scene-a\.png processing record/i }),
      );
      await user.click(
        within(await screen.findByRole("alertdialog", { name: /delete processing record/i }))
          .getByRole("button", { name: /delete record/i }),
      );

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith(
          "/api/workspace/runs/run_scene_001",
          expect.objectContaining({ method: "DELETE" }),
        );
      });
    } finally {
      restoreFetch();
    }
  });

  it("keeps Codex final assets visible in the stage workbench after generation", async () => {
    const codexFinalState = {
      source: loadedState.source,
      elements: [
        {
          ...loadedState.elements[0],
          id: "element_codex_cat",
          name: "cat",
          label: "cat",
          status: "repair_complete",
          sourceProvider: "codex_cli",
          sourcePrompt: "$imagegen repair cat",
          mask: "elements/element_codex_cat/mask.png",
          segmentationStatus: "mask_accepted",
          repairStatus: "repair_complete",
          exportStatus: "ready",
        },
      ],
    };
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(codexFinalState);
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      const stageDrawer = await screen.findByRole("dialog", { name: /generate/i });
      expect(within(stageDrawer).getByText(/stage workbench/i)).toBeInTheDocument();
      expect(within(stageDrawer).getByRole("img", { name: /cat codex final/i })).toHaveAttribute(
        "src",
        expect.stringContaining("/api/workspace/assets/elements/element_codex_cat/codex_final/transparent_asset.png"),
      );
    } finally {
      restoreFetch();
    }
  });

  it("declares shared UI libraries for icons, tooltips, and resizable panes", async () => {
    // The app tsconfig omits Node typings, but this regression reads package metadata in Vitest.
    // @ts-expect-error Test-only Node import without widening app compiler types.
    const { readFileSync } = await import("node:fs");
    // @ts-expect-error Test-only Node import without widening app compiler types.
    const { dirname, resolve } = await import("node:path");
    // @ts-expect-error Test-only Node import without widening app compiler types.
    const { fileURLToPath } = await import("node:url");
    const packageJson = JSON.parse(
      readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };

    expect(packageJson.dependencies).toEqual(expect.objectContaining({
      "@radix-ui/react-tooltip": expect.any(String),
      "lucide-react": expect.any(String),
      "react-resizable-panels": expect.any(String),
    }));
  });

  it("allows the stacked shell to grow without clipping", async () => {
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/runs" && (!init || init.method === "GET")) {
        return jsonResponse({ runs: [] });
      }
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse({ source: null, elements: [], detectionVocabulary: [] });
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    // The app tsconfig omits Node typings, but this regression reads authored CSS in Vitest.
    // @ts-expect-error Test-only Node import without widening app compiler types.
    const { readFileSync } = await import("node:fs");
    // @ts-expect-error Test-only Node import without widening app compiler types.
    const { dirname, resolve } = await import("node:path");
    // @ts-expect-error Test-only Node import without widening app compiler types.
    const { fileURLToPath } = await import("node:url");
    const stylesheet = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../src/styles.css"), "utf8");
    const desktopMinimumWidth = 96 + 720 + 320;
    const responsiveShellRules = stylesheet.match(/@media\s*\(max-width:\s*(\d+)px\)\s*\{([\s\S]*)\n\}/);

    window.history.pushState({}, "", "/pipeline");
    render(<App />);
    const topAppBar = await screen.findByRole("banner");
    const productNav = within(topAppBar).getByRole("navigation", { name: /product areas/i });
    const brandLockup = topAppBar.querySelector(".brand-lockup");

    expect(topAppBar.closest(".app-shell")).not.toBeNull();
    expect(brandLockup).not.toBeNull();
    expect(brandLockup).toContainElement(productNav);
    expect(within(topAppBar).queryByLabelText(/workbench switcher/i)).not.toBeInTheDocument();

    expect(responsiveShellRules).not.toBeNull();
    expect(Number(responsiveShellRules?.[1] ?? 0)).toBeGreaterThanOrEqual(desktopMinimumWidth);

    const responsiveCss = responsiveShellRules?.[2] ?? "";
    expect(responsiveCss).toMatch(/\.app-shell\s*\{[\s\S]*grid-template-rows:\s*auto\s+auto\s+auto;/);
    expect(responsiveCss).toMatch(/\.app-shell\s*\{[\s\S]*min-height:\s*auto;/);
    expect(responsiveCss).toMatch(/\.app-shell\s*\{[\s\S]*overflow:\s*auto;/);
    expect(responsiveCss).toMatch(/\.workbench-grid\s*\{[\s\S]*display:\s*grid\s*!important;/);
    expect(responsiveCss).toMatch(/\.workbench-panel\s*\{[\s\S]*width:\s*100%\s*!important;[\s\S]*flex:\s*none\s*!important;/);
    expect(responsiveCss).toMatch(/\.workbench-panel-resize-handle\s*\{[\s\S]*display:\s*none\s*!important;/);

    expect(stylesheet).toMatch(/\.top-app-bar\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+max-content;/);
    expect(stylesheet).toMatch(/\.brand-lockup\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-wrap:\s*wrap;/);
    expect(stylesheet).toMatch(/\.product-nav\s*\{[\s\S]*max-width:\s*100%;[\s\S]*display:\s*inline-flex;[\s\S]*flex-wrap:\s*wrap;/);
    expect(stylesheet).not.toMatch(/\.workbench-switcher\s*\{/);
    expect(stylesheet).not.toMatch(/\.source-control\s*\{/);
    expect(stylesheet).toMatch(/\.source-upload-button\s*\{[\s\S]*width:\s*36px;[\s\S]*height:\s*36px;/);
    expect(stylesheet).toMatch(/\.right-review-panel\s*\{[\s\S]*grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)\s+auto;/);
    expect(stylesheet).toMatch(/\.right-review-panel\s+\.panel\s*\{[\s\S]*overflow:\s*hidden;[\s\S]*grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\);/);
    expect(stylesheet).toMatch(/\.right-review-panel\s+\.inspector-panel\s*\{[\s\S]*position:\s*absolute;[\s\S]*clip:\s*rect\(0,\s*0,\s*0,\s*0\);/);
    expect(stylesheet).toMatch(/\.asset-tree-panel\s*\{[\s\S]*min-height:\s*0;[\s\S]*grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\);/);
    expect(stylesheet).toMatch(/\.asset-tree-panel\.has-rejected-filter\s*\{[\s\S]*grid-template-rows:\s*auto\s+auto\s+minmax\(0,\s*1fr\);/);
    expect(stylesheet).toMatch(/\.right-review-panel\s+\.asset-tree-panel\s*\{[\s\S]*grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\);/);
    expect(stylesheet).toMatch(/\.right-review-panel\s+\.asset-tree-panel\.has-rejected-filter\s*\{[\s\S]*grid-template-rows:\s*auto\s+auto\s+minmax\(0,\s*1fr\);/);
    expect(stylesheet).toMatch(/\.asset-tree-select\s*\{[\s\S]*min-height:\s*54px;/);
    expect(stylesheet).toMatch(/\.asset-tree-badges\s*\{[\s\S]*grid-column:\s*2;/);
    expect(stylesheet).toMatch(/\.asset-tree-row\s*\{[\s\S]*border:\s*1px solid transparent;/);
    expect(stylesheet).toMatch(/\.asset-tag\s*\{[\s\S]*display:\s*inline-flex;[\s\S]*align-items:\s*center;[\s\S]*font-size:\s*0\.62rem;/);
    expect(stylesheet).not.toMatch(/\.asset-badge\s*\{/);
    expect(stylesheet).not.toMatch(/\.asset-task-badge\s*\{/);
    expect(stylesheet).toMatch(/\.asset-visibility-toggle,\s*[\s\S]*\.asset-delete-button,\s*[\s\S]*\.asset-tree-action-spacer\s*\{[\s\S]*width:\s*27px;[\s\S]*height:\s*27px;/);
    expect(stylesheet).toMatch(/\.canvas-overlay-switches\s+\.overlay-toggle\s+input\s*\{[\s\S]*opacity:\s*0;/);
    expect(stylesheet).toMatch(/\.asset-context-menu\s*\{[\s\S]*position:\s*fixed;[\s\S]*z-index:\s*80;/);
    expect(stylesheet).toMatch(/\.asset-context-menu\s+button\s*\{[\s\S]*justify-content:\s*flex-start;/);
    expect(stylesheet).toMatch(/\.canvas-panel\s*\{[\s\S]*grid-template-rows:\s*minmax\(0,\s*1fr\)\s+auto;/);
    expect(stylesheet).toMatch(/\.canvas-panel\s*\{[\s\S]*overscroll-behavior:\s*contain;[\s\S]*touch-action:\s*none;/);
    expect(stylesheet).toMatch(/\.canvas-panel\s*>\s*\.canvas-header\s*\{[\s\S]*position:\s*absolute;[\s\S]*clip:\s*rect\(0,\s*0,\s*0,\s*0\);/);
    expect(stylesheet).toMatch(/\.canvas-stage\s*\{[\s\S]*align-items:\s*flex-start;[\s\S]*overscroll-behavior:\s*contain;[\s\S]*touch-action:\s*none;/);
    expect(stylesheet).toMatch(/\.canvas-artboard\s*\{[\s\S]*width:\s*min\(100%,\s*calc\(\(100vh - 250px\) \* var\(--source-aspect,\s*1\)\),\s*960px\);/);
    expect(stylesheet).toMatch(/\.canvas-workspace\.has-stage-drawer\s+\.canvas-artboard\s*\{[\s\S]*width:\s*min\(100%,\s*calc\(\(100vh - 500px\) \* var\(--source-aspect,\s*1\)\),\s*960px\);/);
    expect(stylesheet).toMatch(/\.workbench-panel-resize-handle\s*\{/);
    expect(stylesheet).toMatch(/\.canvas-pan-viewport\s*\{[\s\S]*transform:/);
    expect(stylesheet).toMatch(/@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*\.canvas-workspace\s*>\s*\.canvas-toolbar\s*\{[\s\S]*overflow-x:\s*auto;/);
    expect(stylesheet).toMatch(/@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*\.canvas-artboard\s*\{[\s\S]*width:\s*min\(calc\(100vw - 1\.5rem\),\s*calc\(\(100vh - 260px\) \* var\(--source-aspect,\s*1\)\),\s*960px\);/);
    restoreFetch();
    window.history.pushState({}, "", "/");
  });

  it("prioritizes the canvas in the desktop workbench layout", async () => {
    // The app tsconfig omits Node typings, but this regression reads authored CSS in Vitest.
    // @ts-expect-error Test-only Node import without widening app compiler types.
    const { readFileSync } = await import("node:fs");
    // @ts-expect-error Test-only Node import without widening app compiler types.
    const { dirname, resolve } = await import("node:path");
    // @ts-expect-error Test-only Node import without widening app compiler types.
    const { fileURLToPath } = await import("node:url");
    const stylesheet = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../src/styles.css"), "utf8");

    expect(stylesheet).toMatch(/\.app-shell\s*\{[\s\S]*grid-template-rows:\s*56px\s+minmax\(0,\s*1fr\)\s+44px;/);
    expect(stylesheet).toMatch(/\.pipeline-stage\s*\{[\s\S]*grid-template-columns:\s*1fr;/);
    expect(stylesheet).toMatch(/\.workbench-panel-rail\s+\.stage-copy\s+span\s*\{[\s\S]*clip:\s*rect\(0,\s*0,\s*0,\s*0\);/);
    expect(stylesheet).toMatch(/\.canvas-prompt-board-dock\s*\{[\s\S]*left:\s*50%;[\s\S]*bottom:\s*1rem;/);
    expect(stylesheet).toMatch(/\.detection-vocabulary-input\s*\{[\s\S]*width:\s*100%;/);
    expect(stylesheet).toMatch(/\.canvas-prompt-board-collapse\s*\{[\s\S]*border:\s*0;/);
    expect(stylesheet).toMatch(/\.floating-stage-drawer\s*\{[\s\S]*height:\s*calc\(100% - 1rem\);/);
    expect(stylesheet).toMatch(/\.floating-stage-drawer\s*\{[\s\S]*min-height:\s*min\(520px,\s*calc\(100% - 1rem\)\);/);
    expect(stylesheet).not.toMatch(/\.floating-stage-drawer\s*\{[\s\S]*max-height:\s*240px;/);
    expect(stylesheet).toMatch(/\.canvas-workspace\.has-stage-drawer\s+\.canvas-prompt-board-dock\s*\{[\s\S]*bottom:\s*1rem;[\s\S]*z-index:\s*2;/);
    expect(stylesheet).not.toMatch(/\.canvas-workspace\.has-stage-drawer\s+\.canvas-prompt-board-dock\s*\{[\s\S]*bottom:\s*calc\(420px \+ 1rem\);/);
    expect(stylesheet).toMatch(/\.segment-mask-review\s*\{[\s\S]*grid-template-columns:\s*minmax\(340px,\s*1\.18fr\)\s*minmax\(300px,\s*1fr\);[\s\S]*grid-template-rows:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
    expect(stylesheet).toMatch(/\.segment-mask-review-primary\s*\{[\s\S]*grid-row:\s*1 \/ span 2;/);
    expect(stylesheet).toMatch(/\.segment-edge-board-header > div:first-child\s*\{[\s\S]*display:\s*flex;[\s\S]*align-items:\s*center;[\s\S]*flex-wrap:\s*wrap;/);
    expect(stylesheet).toMatch(/\.segment-edge-preview\s*\{[\s\S]*position:\s*relative;[\s\S]*grid-template-rows:\s*minmax\(0,\s*1fr\);/);
    expect(stylesheet).toMatch(/\.segment-edge-preview-frame\s*\{[\s\S]*position:\s*relative;[\s\S]*height:\s*clamp\(200px,\s*26vh,\s*320px\);/);
    expect(stylesheet).not.toMatch(/\.segment-edge-preview\[data-emphasis="primary"\]\s+\.segment-edge-preview-frame\s*\{/);
    expect(stylesheet).toMatch(/\.segment-edge-preview figcaption\s*\{[\s\S]*position:\s*absolute;[\s\S]*pointer-events:\s*none;/);
    const segmentPreviewFrameRule = stylesheet.match(/^\.segment-edge-preview-frame\s*\{[^}]*\}/m)?.[0] ?? "";
    expect(segmentPreviewFrameRule).not.toMatch(/min-height:/);
    expect(segmentPreviewFrameRule).not.toMatch(/height:\s*82px;/);
    expect(stylesheet).toMatch(/\.segment-edge-preview img\s*\{[\s\S]*position:\s*absolute;[\s\S]*inset:\s*0;[\s\S]*width:\s*100%;[\s\S]*height:\s*100%;[\s\S]*object-fit:\s*contain;[\s\S]*box-sizing:\s*border-box;/);
    expect(stylesheet).not.toMatch(/\.segment-edge-preview img\s*\{[^}]*max-height:\s*calc/);
    expect(stylesheet).toMatch(/\.workspace-preview-panels\s*\{[\s\S]*display:\s*none;/);
    expect(stylesheet).toMatch(/\.model-status-strip\s*\{[\s\S]*min-height:\s*44px;/);
  });

  it("renders pipeline rail with stage progress", async () => {
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(partiallyReviewedState);
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      const topAppBar = await screen.findByRole("banner");
      expect(within(topAppBar).getByText("Art Asset Pipeline")).toBeInTheDocument();
      expect(within(topAppBar).getByLabelText(/upload png/i)).toHaveAttribute("type", "file");
      expect(within(topAppBar).queryByRole("combobox", { name: /source file/i })).not.toBeInTheDocument();

      const pipelineRail = screen.getByRole("navigation", { name: /pipeline stages/i });
      expect(within(pipelineRail).getByRole("button", { name: /back step/i })).toBeDisabled();
      expect(within(pipelineRail).getByText("Upload")).toBeInTheDocument();
      expect(within(pipelineRail).getByText("Detect")).toBeInTheDocument();
      expect(within(pipelineRail).getByText("Mask")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /edit detection prompt/i })).toBeInTheDocument();
      expect(within(pipelineRail).queryByText("Repair")).not.toBeInTheDocument();
      expect(within(pipelineRail).queryByText("Export")).not.toBeInTheDocument();
      expect(within(pipelineRail).queryByText("Review")).not.toBeInTheDocument();
      expect(within(pipelineRail).getByText(/2 candidates/i)).toBeInTheDocument();
      expect(within(pipelineRail).getByText(/await masks/i)).toBeInTheDocument();
      // WHY: 老记录没有 workflow.json 时，已有框但还没触发批量遮罩，应停在 Detect 等待阶段推进。
      await waitFor(() => {
        expect(pipelineStage(pipelineRail, "Detect")).toHaveClass("is-active");
      });
      expect(pipelineStage(pipelineRail, "Mask")).toHaveClass("is-pending");
      expect(pipelineStage(pipelineRail, "Generate")).toHaveClass("is-pending");
    } finally {
      restoreFetch();
    }
  });

  it("activates segmentation once assets are accepted", async () => {
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(loadedState);
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      const pipelineRail = screen.getByRole("navigation", { name: /pipeline stages/i });
      expect(within(pipelineRail).queryByText("Review")).not.toBeInTheDocument();
      await waitFor(() => {
        expect(pipelineStage(pipelineRail, "Mask")).toHaveClass("is-active");
      });
      expect(pipelineStage(pipelineRail, "Detect")).toHaveClass("is-done");
      expect(pipelineStage(pipelineRail, "Mask")).toHaveClass("is-active");
      expect(pipelineStage(pipelineRail, "Generate")).toHaveClass("is-pending");
      expect(within(pipelineRail).queryByText("Repair")).not.toBeInTheDocument();
      expect(within(pipelineRail).queryByText("Export")).not.toBeInTheDocument();
      expect(within(pipelineRail).getByText(/1 asset needs masks/i)).toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("renders draggable separators for the three workbench columns", async () => {
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(detectedState);
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      expect(screen.getByRole("separator", { name: /resize pipeline rail/i })).toBeInTheDocument();
      expect(screen.getByRole("separator", { name: /resize review panel/i })).toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

});
