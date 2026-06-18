import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { App } from "./App";

const loadedState = {
  source: {
    filename: "original.png",
    path: "source/original.png",
    width: 120,
    height: 90,
  },
  elements: [
    {
      id: "element_001",
      name: "Region 1",
      status: "accepted",
      mode: "visible_only",
      bbox: { x: 12, y: 16, w: 30, h: 32 },
      canvas: { x: 4, y: 8, w: 46, h: 48 },
      layer: 1,
      thumbnail: "elements/element_001/thumb.png",
      mask: null,
      parentId: null,
      source: "model_detection",
      sourceProvider: "test_provider",
      sourcePrompt: "Region 1",
      history: [],
      notes: "",
      visible: true,
      confidence: 0.84,
      mergedInto: null,
      exportParent: false,
    },
  ],
};

const loadedStateWithoutElements = {
  source: loadedState.source,
  elements: [],
};

const detectedElement = {
  ...loadedState.elements[0],
  id: "element_010",
  name: "cabinet",
  label: "cabinet",
  status: "model_detected",
  source: "model_detection",
  sourceProvider: "test_provider",
  sourcePrompt: "cabinet",
  history: [
    {
      kind: "model_detected",
      at: "2026-06-17T00:00:00+00:00",
      before: {},
      after: { status: "model_detected" },
    },
  ],
  mergedInto: null,
  exportParent: false,
};

const detectedState = {
  source: loadedState.source,
  elements: [detectedElement],
};

const detectedReplacementState = {
  source: loadedState.source,
  elements: [
    {
      ...detectedElement,
      id: "element_001",
      thumbnail: "elements/element_001/thumb.png",
    },
  ],
};

const createdManualElement = {
  id: "element_002",
  name: "Manual Lamp",
  status: "accepted",
  mode: "visible_only",
  bbox: { x: 20, y: 18, w: 24, h: 20 },
  canvas: { x: 12, y: 10, w: 40, h: 36 },
  layer: 2,
  thumbnail: "elements/element_002/thumb.png",
  mask: null,
  parentId: null,
  source: "manual",
  notes: "",
  visible: true,
  confidence: null,
};

const createdChildElement = {
  id: "element_002",
  name: "Shelf Handle",
  label: "Shelf Handle",
  status: "child",
  mode: "visible_only",
  bbox: { x: 16, y: 20, w: 10, h: 12 },
  canvas: { x: 16, y: 20, w: 10, h: 12 },
  layer: 2,
  thumbnail: "elements/element_002/thumb.png",
  mask: null,
  parentId: "element_001",
  source: "manual_child",
  sourceProvider: "manual",
  sourcePrompt: "Shelf Handle",
  notes: "",
  visible: true,
  confidence: null,
  history: [],
  mergedInto: null,
  exportParent: false,
};

const splitState = {
  source: loadedState.source,
  elements: [
    {
      ...loadedState.elements[0],
      status: "split_parent",
    },
    {
      id: "element_002",
      name: "Left Shelf",
      status: "accepted",
      mode: "visible_only",
      bbox: { x: 12, y: 16, w: 14, h: 32 },
      canvas: { x: 4, y: 8, w: 30, h: 48 },
      layer: 1,
      thumbnail: "elements/element_002/thumb.png",
      mask: null,
      parentId: "element_001",
      source: "split",
      notes: "",
      visible: true,
      confidence: null,
    },
    {
      id: "element_003",
      name: "Right Shelf",
      status: "accepted",
      mode: "visible_only",
      bbox: { x: 26, y: 16, w: 16, h: 32 },
      canvas: { x: 18, y: 8, w: 24, h: 48 },
      layer: 2,
      thumbnail: "elements/element_003/thumb.png",
      mask: null,
      parentId: "element_001",
      source: "split",
      notes: "",
      visible: true,
      confidence: null,
    },
  ],
};

const mergeSourceState = {
  source: loadedState.source,
  elements: [
    loadedState.elements[0],
    {
      ...loadedState.elements[0],
      id: "element_002",
      name: "Region 2",
      bbox: { x: 48, y: 20, w: 18, h: 22 },
      canvas: { x: 44, y: 16, w: 26, h: 30 },
      layer: 2,
      thumbnail: "elements/element_002/thumb.png",
      confidence: 0.8,
    },
  ],
};

const mergedState = {
  source: loadedState.source,
  elements: [
    {
      ...mergeSourceState.elements[0],
      visible: false,
      mergedInto: "element_003",
    },
    {
      ...mergeSourceState.elements[1],
      visible: false,
      mergedInto: "element_003",
    },
    {
      id: "element_003",
      name: "Fixture group",
      label: "Fixture group",
      status: "merged",
      mode: "visible_only",
      bbox: { x: 12, y: 16, w: 54, h: 32 },
      canvas: { x: 8, y: 12, w: 62, h: 40 },
      layer: 3,
      thumbnail: "elements/element_003/thumb.png",
      mask: null,
      parentId: null,
      source: "manual_merge",
      sourceProvider: "manual",
      sourcePrompt: "Fixture group",
      notes: "",
      visible: true,
      confidence: null,
      history: [
        {
          kind: "manual_merge",
          at: "2026-06-17T00:00:00+00:00",
          before: { sourceIds: ["element_001", "element_002"] },
          after: { status: "merged" },
        },
      ],
      mergedInto: null,
      exportParent: false,
    },
  ],
};

const treeState = {
  source: loadedState.source,
  elements: [
    {
      ...detectedElement,
      id: "element_001",
      name: "cabinet",
      label: "cabinet",
      status: "edited",
      bbox: { x: 10, y: 10, w: 80, h: 90 },
      canvas: { x: 10, y: 10, w: 80, h: 90 },
      parentId: null,
      sourceProvider: "grounding_dino",
      sourcePrompt: "cabinet",
      confidence: 0.88,
      thumbnail: "elements/element_001/thumb.png",
    },
    {
      ...detectedElement,
      id: "element_002",
      name: "plant",
      label: "plant",
      status: "child",
      bbox: { x: 20, y: 20, w: 20, h: 20 },
      canvas: { x: 20, y: 20, w: 20, h: 20 },
      parentId: "element_001",
      source: "manual_child",
      sourceProvider: "manual",
      sourcePrompt: "plant",
      confidence: 0.86,
      thumbnail: "elements/element_002/thumb.png",
    },
    {
      ...detectedElement,
      id: "element_003",
      name: "old towel",
      label: "old towel",
      status: "model_detected",
      bbox: { x: 50, y: 50, w: 14, h: 14 },
      canvas: { x: 50, y: 50, w: 14, h: 14 },
      parentId: null,
      visible: false,
      mergedInto: "element_004",
      thumbnail: "elements/element_003/thumb.png",
    },
  ],
};

const rejectedTreeState = {
  source: loadedState.source,
  elements: [
    {
      ...detectedElement,
      id: "element_020",
      name: "Rejected Vase",
      label: "Rejected Vase",
      status: "rejected",
      mode: "rejected",
      visible: false,
      thumbnail: "elements/element_020/thumb.png",
    },
  ],
};

const legacyStatusRejectedState = {
  source: loadedState.source,
  elements: [
    {
      ...detectedElement,
      id: "element_021",
      name: "Legacy Reject",
      label: "Legacy Reject",
      status: "rejected",
      mode: "visible_only",
      visible: true,
      thumbnail: "elements/element_021/thumb.png",
    },
  ],
};

const extractMergedState = {
  source: loadedState.source,
  elements: [
    {
      ...mergeSourceState.elements[0],
      status: "accepted",
      visible: false,
      mergedInto: "element_003",
    },
    {
      ...mergedState.elements[2],
      status: "accepted",
    },
  ],
};

const extractedState = {
  source: loadedState.source,
  elements: [
    {
      ...loadedState.elements[0],
      status: "extracted",
      mask: "elements/element_001/mask.png",
    },
  ],
};

const exportSummary = {
  exportableCount: 1,
  blockedCount: 1,
  warnings: [
    "element_002 needs_completion is blocked until repair QA passes.",
  ],
  outputDir: "D:/work/art-pipeline-v2-demo/workspace/export",
  paths: {
    assetsDir: "export/assets",
    masksDir: "export/masks",
    manifest: "export/manifest.json",
    level: "export/level.json",
    contactSheet: "export/contact_sheet.png",
    qaReport: "export/qa_report.json",
  },
  exportedElements: [
    {
      elementId: "element_001",
      name: "Region 1",
      assetPath: "export/assets/element_001.png",
      maskPath: "export/masks/element_001.png",
      sourceAssetPath: "elements/element_001/asset_incomplete.png",
      warnings: [],
    },
  ],
  blockedElements: [
    {
      elementId: "element_002",
      name: "Gap",
      reason: "needs_completion_without_valid_repair",
    },
  ],
};

const completionState = {
  source: loadedState.source,
  elements: [
    {
      ...loadedState.elements[0],
      status: "extracted",
      mode: "needs_completion",
      mask: "elements/element_001/mask.png",
    },
  ],
};

const repairPendingState = {
  source: loadedState.source,
  elements: [
    {
      ...completionState.elements[0],
      status: "repair_pending",
    },
  ],
};

const repairCompleteState = {
  source: loadedState.source,
  elements: [
    {
      ...completionState.elements[0],
      status: "repair_complete",
      mode: "completed_by_codex",
    },
  ],
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installFetchMock(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(handler) as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

function setCanvasRect(surface: HTMLElement) {
  vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 600,
    bottom: 450,
    width: 600,
    height: 450,
    toJSON() {
      return {};
    },
  });
}

async function drawRectangle(surface: HTMLElement, start: { x: number; y: number }, end: { x: number; y: number }) {
  setCanvasRect(surface);
  fireEvent.mouseDown(surface, { clientX: start.x, clientY: start.y, button: 0 });
  fireEvent.mouseMove(surface, { clientX: end.x, clientY: end.y, button: 0 });
  fireEvent.mouseUp(surface, { clientX: end.x, clientY: end.y, button: 0 });
}

describe("App", () => {
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

  it("declares shared UI libraries for icons, tooltips, and resizable panes", async () => {
    // The app tsconfig omits Node typings, but this regression reads package metadata in Vitest.
    // @ts-expect-error Test-only Node import without widening app compiler types.
    const { readFileSync } = await import("node:fs");
    // @ts-expect-error Test-only Node import without widening app compiler types.
    const { dirname, resolve } = await import("node:path");
    // @ts-expect-error Test-only Node import without widening app compiler types.
    const { fileURLToPath } = await import("node:url");
    const packageJson = JSON.parse(
      readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };

    expect(packageJson.dependencies).toEqual(expect.objectContaining({
      "@radix-ui/react-tooltip": expect.any(String),
      "lucide-react": expect.any(String),
      "react-resizable-panels": expect.any(String),
    }));
  });

  it("allows the stacked shell to grow without clipping", async () => {
    // The app tsconfig omits Node typings, but this regression reads authored CSS in Vitest.
    // @ts-expect-error Test-only Node import without widening app compiler types.
    const { readFileSync } = await import("node:fs");
    // @ts-expect-error Test-only Node import without widening app compiler types.
    const { dirname, resolve } = await import("node:path");
    // @ts-expect-error Test-only Node import without widening app compiler types.
    const { fileURLToPath } = await import("node:url");
    const stylesheet = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "styles.css"), "utf8");
    const desktopMinimumWidth = 228 + 520 + 392;
    const responsiveShellRules = stylesheet.match(/@media\s*\(max-width:\s*(\d+)px\)\s*\{([\s\S]*)\n\}/);

    expect(responsiveShellRules).not.toBeNull();
    expect(Number(responsiveShellRules?.[1] ?? 0)).toBeGreaterThanOrEqual(desktopMinimumWidth);

    const responsiveCss = responsiveShellRules?.[2] ?? "";
    expect(responsiveCss).toMatch(/\.app-shell\s*\{[\s\S]*grid-template-rows:\s*auto\s+auto\s+auto;/);
    expect(responsiveCss).toMatch(/\.app-shell\s*\{[\s\S]*min-height:\s*auto;/);
    expect(responsiveCss).toMatch(/\.app-shell\s*\{[\s\S]*overflow:\s*auto;/);
    expect(responsiveCss).toMatch(/\.workbench-grid\s*\{[\s\S]*display:\s*grid\s*!important;/);
    expect(responsiveCss).toMatch(/\.workbench-panel\s*\{[\s\S]*width:\s*100%\s*!important;[\s\S]*flex:\s*none\s*!important;/);
    expect(responsiveCss).toMatch(/\.workbench-panel-resize-handle\s*\{[\s\S]*display:\s*none\s*!important;/);

    expect(stylesheet).toMatch(/\.top-app-bar\s*\{[\s\S]*grid-template-columns:\s*228px\s+minmax\(200px,\s*260px\)\s+minmax\(0,\s*1fr\);/);
    expect(stylesheet).toMatch(/\.source-control\s*\{[\s\S]*cursor:\s*pointer;/);
    expect(stylesheet).toMatch(/\.right-review-panel\s*\{[\s\S]*grid-template-rows:\s*minmax\(0,\s*1fr\)\s+auto;/);
    expect(stylesheet).toMatch(/\.right-review-panel\s+\.panel\s*\{[\s\S]*overflow:\s*hidden;[\s\S]*grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\);/);
    expect(stylesheet).toMatch(/\.right-review-panel\s+\.inspector-panel\s*\{[\s\S]*position:\s*absolute;[\s\S]*clip:\s*rect\(0,\s*0,\s*0,\s*0\);/);
    expect(stylesheet).toMatch(/\.asset-tree-panel\s*\{[\s\S]*min-height:\s*0;[\s\S]*grid-template-rows:\s*auto\s+auto\s+auto\s+minmax\(0,\s*1fr\);/);
    expect(stylesheet).toMatch(/\.right-review-panel\s+\.asset-tree-panel\s*\{[\s\S]*grid-template-rows:\s*auto\s+auto\s+auto\s+minmax\(0,\s*1fr\);/);
    expect(stylesheet).toMatch(/\.asset-tree-select\s*\{[\s\S]*min-height:\s*34px;/);
    expect(stylesheet).toMatch(/\.asset-tree-badges\s*\{[\s\S]*grid-column:\s*auto;/);
    expect(stylesheet).toMatch(/\.asset-visibility-toggle\s+span\s*\{[\s\S]*clip:\s*rect\(0,\s*0,\s*0,\s*0\);/);
    expect(stylesheet).toMatch(/\.canvas-overlay-switches\s+\.overlay-toggle\s+input\s*\{[\s\S]*opacity:\s*0;/);
    expect(stylesheet).toMatch(/\.selection-action-panel\s*\{[\s\S]*min-height:\s*0;[\s\S]*overflow:\s*hidden;/);
    expect(stylesheet).toMatch(/\.selection-action-panel\s*>\s*\.panel-header\s*\{[\s\S]*display:\s*none;/);
    expect(stylesheet).toMatch(/\.selection-action-panel\s+\.panel-body\s*\{[\s\S]*overflow:\s*auto;/);
    expect(stylesheet).toMatch(/\.selection-action-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);/);
    expect(stylesheet).toMatch(/\.canvas-panel\s*\{[\s\S]*grid-template-rows:\s*minmax\(0,\s*1fr\)\s+auto;/);
    expect(stylesheet).toMatch(/\.canvas-panel\s*>\s*\.canvas-header\s*\{[\s\S]*position:\s*absolute;[\s\S]*clip:\s*rect\(0,\s*0,\s*0,\s*0\);/);
    expect(stylesheet).toMatch(/\.canvas-stage\s*\{[\s\S]*align-items:\s*flex-start;/);
    expect(stylesheet).toMatch(/\.canvas-artboard\s*\{[\s\S]*width:\s*min\(100%,\s*calc\(\(100vh - 100px\) \* var\(--source-aspect,\s*1\)\),\s*960px\);/);
    expect(stylesheet).toMatch(/\.workbench-panel-resize-handle\s*\{/);
    expect(stylesheet).toMatch(/\.canvas-pan-viewport\s*\{[\s\S]*transform:/);
    expect(stylesheet).toMatch(/@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*\.canvas-workspace\s*>\s*\.canvas-toolbar\s*\{[\s\S]*overflow-x:\s*auto;/);
    expect(stylesheet).toMatch(/@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*\.selection-action-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
    expect(stylesheet).toMatch(/@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*\.canvas-artboard\s*\{[\s\S]*width:\s*min\(calc\(100vw - 1\.5rem\),\s*calc\(\(100vh - 260px\) \* var\(--source-aspect,\s*1\)\),\s*960px\);/);
  });

  it("renders pipeline rail with stage progress", async () => {
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(detectedState);
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      const topAppBar = await screen.findByRole("banner");
      expect(within(topAppBar).getByText("Art Asset Pipeline")).toBeInTheDocument();
      expect(within(topAppBar).getByText("original.png")).toBeInTheDocument();
      expect(within(topAppBar).getByLabelText(/upload png/i)).toHaveAttribute("type", "file");
      expect(within(topAppBar).queryByRole("combobox", { name: /source file/i })).not.toBeInTheDocument();

      const pipelineRail = screen.getByRole("navigation", { name: /pipeline stages/i });
      expect(within(pipelineRail).getByText("Upload")).toBeInTheDocument();
      expect(within(pipelineRail).getByText("Detect")).toBeInTheDocument();
      expect(within(pipelineRail).getByText("Review")).toBeInTheDocument();
      expect(within(pipelineRail).getByText("Segment")).toBeInTheDocument();
      expect(within(pipelineRail).getByText("Export")).toBeInTheDocument();
      expect(within(pipelineRail).getByText(/1 candidate/i)).toBeInTheDocument();
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

  it("renders reference-style model status metric details", async () => {
    const statusState = {
      source: loadedState.source,
      elements: [
        loadedState.elements[0],
        {
          ...createdManualElement,
          id: "element_accepted_002",
          label: "Manual Lamp",
          sourceProvider: "manual",
          sourcePrompt: "Manual Lamp",
          history: [],
          mergedInto: null,
          exportParent: false,
        },
        {
          ...detectedElement,
          id: "element_proposal_001",
          status: "proposal",
          name: "plant",
          label: "plant",
        },
        {
          ...detectedElement,
          id: "element_proposal_002",
          status: "edited",
          name: "mirror",
          label: "mirror",
        },
      ],
    };
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(statusState);
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      const providerLabel = await screen.findByText("Model Provider");
      const statusStrip = providerLabel.closest("footer");
      expect(statusStrip).not.toBeNull();
      const metrics = within(statusStrip as HTMLElement);

      expect(metrics.getByText("Total")).toBeInTheDocument();
      expect(metrics.getByText("50%")).toBeInTheDocument();
      expect(metrics.getByText("100% of reviewed")).toBeInTheDocument();
      expect(metrics.getByText("50% of total")).toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("keeps the uploaded-source workspace focused on the canvas before detection", async () => {
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(loadedStateWithoutElements);
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      await screen.findByText(/original\.png - 120 x 90/i);

      expect(screen.getAllByRole("button", { name: /run detection/i })).toHaveLength(1);
      expect(screen.getByText(/model proposals pending/i)).toBeInTheDocument();
      expect(screen.queryByText(/extraction preview/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/export pack/i)).not.toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("runs detection from the top app bar", async () => {
    const user = userEvent.setup();
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(loadedStateWithoutElements);
      }

      if (input === "/api/workspace/detect" && init?.method === "POST") {
        return jsonResponse(detectedState);
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      const topAppBar = await screen.findByRole("banner");
      await user.click(within(topAppBar).getByRole("button", { name: /run detection/i }));

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/workspace/detect",
        expect.objectContaining({ method: "POST" }),
      );
    } finally {
      restoreFetch();
    }
  });

  it("renders canvas toolbar controls", async () => {
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(mergeSourceState);
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      const canvasToolbar = await screen.findByRole("toolbar", { name: /canvas tools/i });
      expect(within(canvasToolbar).getByRole("button", { name: /^select$/i })).toBeInTheDocument();
      expect(within(canvasToolbar).getByRole("button", { name: /^edit box$/i })).toBeInTheDocument();
      expect(within(canvasToolbar).getByRole("button", { name: /^draw element$/i })).toBeInTheDocument();
      expect(within(canvasToolbar).getByRole("button", { name: /^split selected$/i })).toBeInTheDocument();
      expect(within(canvasToolbar).getByRole("button", { name: /^merge$/i })).toBeInTheDocument();
      expect(within(canvasToolbar).getByRole("button", { name: /^delete$/i })).toBeDisabled();
      expect(within(canvasToolbar).queryByText(/^Select$/i)).not.toBeInTheDocument();
      expect(within(canvasToolbar).queryByText(/^Draw$/i)).not.toBeInTheDocument();
      expect(within(canvasToolbar).getByText("80%")).toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("zooms and enters pan mode from the canvas toolbar", async () => {
    const user = userEvent.setup();
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(loadedState);
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      const canvasToolbar = screen.getByRole("toolbar", { name: /canvas tools/i });
      await user.click(within(canvasToolbar).getByRole("button", { name: /zoom in/i }));
      expect(within(canvasToolbar).getByText("85%")).toBeInTheDocument();

      const panButton = within(canvasToolbar).getByRole("button", { name: /pan canvas/i });
      await user.click(panButton);
      expect(panButton).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByTestId("canvas-area")).toHaveAttribute("data-pan-mode", "true");
    } finally {
      restoreFetch();
    }
  });

  it("zooms with the canvas wheel and switches canvas tools with shortcuts", async () => {
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(loadedState);
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      const canvasArea = screen.getByTestId("canvas-area");
      fireEvent.wheel(canvasArea, { deltaY: -120 });

      const canvasToolbar = screen.getByRole("toolbar", { name: /canvas tools/i });
      expect(within(canvasToolbar).getByText("85%")).toBeInTheDocument();

      fireEvent.keyDown(window, { key: " ", code: "Space" });
      expect(within(canvasToolbar).getByRole("button", { name: /pan canvas/i })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(canvasArea).toHaveAttribute("data-pan-mode", "true");

      fireEvent.keyUp(window, { key: " ", code: "Space" });
      expect(within(canvasToolbar).getByRole("button", { name: /pan canvas/i })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      expect(canvasArea).toHaveAttribute("data-pan-mode", "false");

      fireEvent.keyDown(window, { key: "w" });
      expect(await screen.findByTestId("canvas-edit-region-element_001")).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "e" });
      expect(within(canvasToolbar).getByRole("button", { name: /draw element/i })).toHaveAttribute(
        "aria-pressed",
        "true",
      );

      fireEvent.keyDown(window, { key: "r" });
      expect(within(canvasToolbar).getByRole("button", { name: /pan canvas/i })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.getByTestId("canvas-area")).toHaveAttribute("data-pan-mode", "true");

      fireEvent.keyDown(window, { key: "q" });
      expect(within(canvasToolbar).getByRole("button", { name: /^select/i })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    } finally {
      restoreFetch();
    }
  });

  it("exposes edit handles for the selected canvas box", async () => {
    const user = userEvent.setup();
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(loadedState);
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      const actionPanel = screen.getByRole("region", { name: /selection actions/i });
      await user.click(within(actionPanel).getByRole("button", { name: /^edit box$/i }));

      expect(await screen.findByTestId("canvas-edit-region-element_001")).toHaveAttribute(
        "aria-label",
        "Edit Region 1 box",
      );
      expect(screen.getByRole("region", { name: /edit region 1 box/i })).toBeInTheDocument();
      expect(screen.getByTestId("resize-handle-element_001-se")).toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("does not show the selected asset thumbnail on top of the canvas by default", async () => {
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(loadedState);
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      const { container } = render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      expect(container.querySelector(".overlay-thumb")).toBeNull();
    } finally {
      restoreFetch();
    }
  });

  it("enters box editing from the canvas toolbar edit button", async () => {
    const user = userEvent.setup();
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(loadedState);
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      const canvasToolbar = screen.getByRole("toolbar", { name: /canvas tools/i });
      await user.click(within(canvasToolbar).getByRole("button", { name: /^edit box$/i }));

      expect(await screen.findByTestId("resize-handle-element_001-se")).toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("undoes and redoes unsaved canvas box edits before applying them", async () => {
    const user = userEvent.setup();
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(loadedState);
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      const actionPanel = screen.getByRole("region", { name: /selection actions/i });
      await user.click(within(actionPanel).getByRole("button", { name: /^edit box$/i }));
      const editRegion = await screen.findByTestId("canvas-edit-region-element_001");
      editRegion.focus();
      fireEvent.keyDown(editRegion, { key: "ArrowRight", shiftKey: true });

      expect(screen.getByRole("group", { name: /confirm region 1 box edit/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/bbox x/i)).toHaveValue(22);

      fireEvent.keyDown(window, { key: "z", ctrlKey: true });

      expect(screen.queryByRole("group", { name: /confirm region 1 box edit/i })).not.toBeInTheDocument();
      expect(screen.getByLabelText(/bbox x/i)).toHaveValue(12);

      fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });

      expect(screen.getByRole("group", { name: /confirm region 1 box edit/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/bbox x/i)).toHaveValue(22);
    } finally {
      restoreFetch();
    }
  });

  it("edits the selected box with drag handles and sends a patch request", async () => {
    const user = userEvent.setup();
    const originalPointerEvent = window.PointerEvent;
    window.PointerEvent = window.MouseEvent as unknown as typeof PointerEvent;
    const patchedElement = {
      ...loadedState.elements[0],
      status: "edited",
      bbox: { x: 12, y: 16, w: 40, h: 42 },
    };
    let patchRequest: unknown = null;
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(loadedState);
      }

      if (input === "/api/workspace/elements/element_001" && init?.method === "PATCH") {
        patchRequest = JSON.parse(String(init.body));
        return jsonResponse({
          element: patchedElement,
          state: {
            source: loadedState.source,
            elements: [patchedElement],
          },
        });
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      const canvasToolbar = screen.getByRole("toolbar", { name: /canvas tools/i });
      await user.click(within(canvasToolbar).getByRole("button", { name: /^edit box$/i }));
      setCanvasRect(await screen.findByTestId("canvas-artboard"));

      const handle = await screen.findByTestId("resize-handle-element_001-se");
      fireEvent.pointerDown(handle, {
        buttons: 1,
        clientX: 210,
        clientY: 240,
        pointerId: 1,
        pointerType: "mouse",
      });
      fireEvent.pointerMove(handle, {
        buttons: 1,
        clientX: 260,
        clientY: 290,
        pointerId: 1,
        pointerType: "mouse",
      });
      fireEvent.pointerUp(handle, {
        buttons: 0,
        clientX: 260,
        clientY: 290,
        pointerId: 1,
        pointerType: "mouse",
      });
      await user.click(within(screen.getByRole("banner")).getByRole("button", { name: /^save$/i }));

      await waitFor(() => {
        expect(patchRequest).toEqual({
          bbox: expect.objectContaining({
            x: 12,
            y: 16,
            w: expect.any(Number),
            h: expect.any(Number),
          }),
        });
      });
      expect((patchRequest as { bbox: { w: number; h: number } }).bbox.w).toBeGreaterThan(30);
      expect((patchRequest as { bbox: { w: number; h: number } }).bbox.h).toBeGreaterThan(32);
    } finally {
      window.PointerEvent = originalPointerEvent;
      restoreFetch();
    }
  });

  it("confirms or cancels canvas box edits and refreshes the selected thumbnail", async () => {
    const user = userEvent.setup();
    const patchedElement = {
      ...loadedState.elements[0],
      status: "edited",
      bbox: { x: 22, y: 16, w: 30, h: 32 },
      thumbnail: "elements/element_001/thumb.png",
    };
    let patchRequest: unknown = null;
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(loadedState);
      }

      if (input === "/api/workspace/elements/element_001" && init?.method === "PATCH") {
        patchRequest = JSON.parse(String(init.body));
        return jsonResponse({
          element: patchedElement,
          state: {
            source: loadedState.source,
            elements: [patchedElement],
          },
        });
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      const actionPanel = screen.getByRole("region", { name: /selection actions/i });
      await user.click(within(actionPanel).getByRole("button", { name: /^edit box$/i }));
      const editRegion = await screen.findByTestId("canvas-edit-region-element_001");
      editRegion.focus();
      fireEvent.keyDown(editRegion, { key: "ArrowRight", shiftKey: true });

      expect(screen.getByRole("group", { name: /confirm region 1 box edit/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /apply box edit/i })).toBeEnabled();
      await user.click(screen.getByRole("button", { name: /cancel box edit/i }));

      expect(patchRequest).toBeNull();
      expect(screen.queryByRole("group", { name: /confirm region 1 box edit/i })).not.toBeInTheDocument();

      await user.click(within(actionPanel).getByRole("button", { name: /^edit box$/i }));
      const nextEditRegion = await screen.findByTestId("canvas-edit-region-element_001");
      nextEditRegion.focus();
      fireEvent.keyDown(nextEditRegion, { key: "ArrowRight", shiftKey: true });
      await user.click(screen.getByRole("button", { name: /apply box edit/i }));

      await waitFor(() => {
        expect(patchRequest).toEqual({
          bbox: { x: 22, y: 16, w: 30, h: 32 },
        });
      });
      expect(screen.getByAltText("Region 1 thumbnail")).toHaveAttribute(
        "src",
        expect.stringMatching(/^\/api\/workspace\/assets\/elements\/element_001\/thumb\.png\?cache=\d+$/),
      );
      expect(screen.queryByRole("group", { name: /confirm region 1 box edit/i })).not.toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("nudges the selected canvas box and saves the draft with PATCH", async () => {
    const user = userEvent.setup();
    const patchedElement = {
      ...loadedState.elements[0],
      status: "edited",
      bbox: { x: 22, y: 16, w: 30, h: 32 },
    };
    let patchRequest: unknown = null;
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(loadedState);
      }

      if (input === "/api/workspace/elements/element_001" && init?.method === "PATCH") {
        patchRequest = JSON.parse(String(init.body));
        return jsonResponse({
          element: patchedElement,
          state: {
            source: loadedState.source,
            elements: [patchedElement],
          },
        });
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      const actionPanel = screen.getByRole("region", { name: /selection actions/i });
      await user.click(within(actionPanel).getByRole("button", { name: /^edit box$/i }));
      const editRegion = await screen.findByTestId("canvas-edit-region-element_001");
      editRegion.focus();
      fireEvent.keyDown(editRegion, { key: "ArrowRight", shiftKey: true });

      await user.click(within(screen.getByRole("banner")).getByRole("button", { name: /^save$/i }));

      await waitFor(() => {
        expect(patchRequest).toEqual({
          bbox: { x: 22, y: 16, w: 30, h: 32 },
        });
      });
      expect(screen.getAllByText(/element details updated\./i)).toHaveLength(2);
    } finally {
      restoreFetch();
    }
  });

  it("resizes the selected canvas box with keyboard handles and saves PATCH", async () => {
    const user = userEvent.setup();
    const patchedElement = {
      ...loadedState.elements[0],
      status: "edited",
      bbox: { x: 12, y: 16, w: 40, h: 42 },
    };
    let patchRequest: unknown = null;
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(loadedState);
      }

      if (input === "/api/workspace/elements/element_001" && init?.method === "PATCH") {
        patchRequest = JSON.parse(String(init.body));
        return jsonResponse({
          element: patchedElement,
          state: {
            source: loadedState.source,
            elements: [patchedElement],
          },
        });
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      const actionPanel = screen.getByRole("region", { name: /selection actions/i });
      await user.click(within(actionPanel).getByRole("button", { name: /^edit box$/i }));
      const resizeHandle = await screen.findByTestId("resize-handle-element_001-se");
      resizeHandle.focus();
      fireEvent.keyDown(resizeHandle, { key: "ArrowRight", shiftKey: true });
      fireEvent.keyDown(resizeHandle, { key: "ArrowDown", shiftKey: true });

      await user.click(within(screen.getByRole("banner")).getByRole("button", { name: /^save$/i }));

      await waitFor(() => {
        expect(patchRequest).toEqual({
          bbox: { x: 12, y: 16, w: 40, h: 42 },
        });
      });
    } finally {
      restoreFetch();
    }
  });

  it("renames the selected asset from the contextual action panel", async () => {
    const user = userEvent.setup();
    const renamedElement = {
      ...loadedState.elements[0],
      name: "Main tub",
      label: "Main tub",
    };
    let patchRequest: unknown = null;
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(loadedState);
      }

      if (input === "/api/workspace/elements/element_001" && init?.method === "PATCH") {
        patchRequest = JSON.parse(String(init.body));
        return jsonResponse({
          element: renamedElement,
          state: {
            source: loadedState.source,
            elements: [renamedElement],
          },
        });
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      const nameField = screen.getByLabelText(/selected asset name/i);
      fireEvent.change(nameField, { target: { value: "Main tub" } });
      expect(nameField).toHaveValue("Main tub");
      await user.click(screen.getByRole("button", { name: /save name/i }));

      await waitFor(() => {
        expect(patchRequest).toEqual({ label: "Main tub" });
      });
      expect(await screen.findAllByText(/element details updated/i)).toHaveLength(2);
    } finally {
      restoreFetch();
    }
  });

  it("renders a merge preview outline for multiple selected assets", async () => {
    const user = userEvent.setup();
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(mergeSourceState);
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      expect(screen.queryByTestId("merge-preview-outline")).not.toBeInTheDocument();

      await user.click(screen.getByRole("checkbox", { name: /select region 1 for merge/i }));
      await user.click(screen.getByRole("checkbox", { name: /select region 2 for merge/i }));

      expect(screen.getByTestId("merge-preview-outline")).toHaveClass("overlay-box-merge-preview");

      await user.click(screen.getByRole("checkbox", { name: /select region 2 for merge/i }));

      expect(screen.queryByTestId("merge-preview-outline")).not.toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("renders the workbench shell", async () => {
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse({ source: null, elements: [] });
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      expect(screen.getByRole("heading", { name: /elements/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/upload png/i)).toBeInTheDocument();
      expect(screen.getByTestId("canvas-area")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /inspector/i })).toBeInTheDocument();
      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith("/api/workspace/state");
      });
    } finally {
      restoreFetch();
    }
  });

  it("toggles merge selection from the canvas with shift-click", async () => {
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(mergeSourceState);
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      setCanvasRect(screen.getByTestId("canvas-artboard"));
      const surface = screen.getByTestId("canvas-drawing-surface");
      fireEvent.mouseDown(surface, { clientX: 100, clientY: 120, shiftKey: true, button: 0 });
      fireEvent.mouseDown(surface, { clientX: 270, clientY: 130, shiftKey: true, button: 0 });

      expect(screen.getByRole("checkbox", { name: /select region 1 for merge/i })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: /select region 2 for merge/i })).toBeChecked();
      const actionPanel = screen.getByRole("region", { name: /selection actions/i });
      expect(within(actionPanel).getByText(/merge selection/i)).toBeInTheDocument();
      expect(within(actionPanel).getByRole("button", { name: /merge into one asset/i })).toBeEnabled();
    } finally {
      restoreFetch();
    }
  });

  it("renders parent children in the asset tree and hides merged-away sources", async () => {
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(treeState);
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      const assetTree = await screen.findByRole("tree", { name: /asset tree/i });
      const parentItem = within(assetTree).getByRole("treeitem", { name: /cabinet/i });
      expect(within(parentItem).getByRole("treeitem", { name: /plant/i })).toBeInTheDocument();
      expect(screen.queryByText("old towel")).not.toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("shows single-candidate actions after selecting one asset tree item", async () => {
    const user = userEvent.setup();
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(treeState);
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      await user.click(await screen.findByRole("button", { name: /select cabinet asset/i }));
      const actionPanel = screen.getByRole("region", { name: /selection actions/i });

      expect(within(actionPanel).getByRole("button", { name: /^edit box$/i })).toBeInTheDocument();
      expect(within(actionPanel).getByRole("button", { name: /^add child$/i })).toBeInTheDocument();
      expect(within(actionPanel).getByRole("button", { name: /run detect inside/i })).toBeDisabled();
      expect(within(actionPanel).getByRole("button", { name: /^split asset$/i })).toBeInTheDocument();
      expect(within(actionPanel).getByRole("button", { name: /^accept$/i })).toBeInTheDocument();
      expect(within(actionPanel).getByRole("button", { name: /^reject$/i })).toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("uses the top bar as the only run detection CTA when nothing is selected", async () => {
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(loadedStateWithoutElements);
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      const actionPanel = await screen.findByRole("region", { name: /selection actions/i });
      expect(within(actionPanel).getByText(/run detection from the top bar/i)).toBeInTheDocument();
      expect(within(actionPanel).queryByRole("button", { name: /run detection/i })).not.toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: /run detection/i })).toHaveLength(1);
    } finally {
      restoreFetch();
    }
  });

  it("clears display-only actions when a selected rejected asset is hidden again", async () => {
    const user = userEvent.setup();
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(rejectedTreeState);
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      await user.click(screen.getByRole("checkbox", { name: /show rejected/i }));
      await user.click(await screen.findByRole("button", { name: /select rejected vase asset/i }));
      expect(screen.getByText(/rejected or merged assets are shown for review only/i)).toBeInTheDocument();

      await user.click(screen.getByRole("checkbox", { name: /show rejected/i }));

      expect(screen.queryByText("Rejected Vase")).not.toBeInTheDocument();
      expect(screen.queryByText(/rejected or merged assets are shown for review only/i)).not.toBeInTheDocument();
      const actionPanel = screen.getByRole("region", { name: /selection actions/i });
      expect(within(actionPanel).getByText(/run detection from the top bar/i)).toBeInTheDocument();
      expect(within(actionPanel).queryByRole("button", { name: /run detection/i })).not.toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("keeps legacy status-rejected assets out of normal selection and actions", async () => {
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(legacyStatusRejectedState);
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      expect(screen.queryByText("Legacy Reject")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /select legacy reject asset/i })).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/element name/i)).not.toBeInTheDocument();
      const actionPanel = screen.getByRole("region", { name: /selection actions/i });
      expect(within(actionPanel).queryByRole("button", { name: /^edit box$/i })).not.toBeInTheDocument();
      expect(within(actionPanel).getByText(/run detection from the top bar/i)).toBeInTheDocument();
      expect(within(actionPanel).queryByRole("button", { name: /run detection/i })).not.toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("merges multiple selected assets from the contextual action panel", async () => {
    const user = userEvent.setup();
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(mergeSourceState);
      }

      if (input === "/api/workspace/elements/merge" && init?.method === "POST") {
        return jsonResponse({
          element: mergedState.elements[2],
          state: mergedState,
        });
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      await user.click(screen.getByRole("checkbox", { name: /select region 1 for merge/i }));
      await user.click(screen.getByRole("checkbox", { name: /select region 2 for merge/i }));

      const actionPanel = screen.getByRole("region", { name: /selection actions/i });
      expect(within(actionPanel).getByText("Region 1")).toBeInTheDocument();
      expect(within(actionPanel).getByText("Region 2")).toBeInTheDocument();
      await user.click(within(actionPanel).getByRole("button", { name: /merge into one asset/i }));

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/workspace/elements/merge",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            elementIds: ["element_001", "element_002"],
            label: "Merged Asset",
          }),
        }),
      );
    } finally {
      restoreFetch();
    }
  });

  it("loads existing state on mount and renders the saved source and element", async () => {
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(loadedState);
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      expect(await screen.findByText(/original\.png - 120 x 90/i)).toBeInTheDocument();
      expect(await screen.findByRole("img", { name: /workspace source/i })).toHaveAttribute(
        "src",
        expect.stringContaining("/api/workspace/source"),
      );
      expect(screen.getByAltText("Region 1 thumbnail")).toBeInTheDocument();
      expect(screen.getByTestId("overlay-label-element_001")).toHaveTextContent("Region 1");
    } finally {
      restoreFetch();
    }
  });

  it("runs model detection and renders returned model-detected elements", async () => {
    const user = userEvent.setup();
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(loadedStateWithoutElements);
      }

      if (input === "/api/workspace/detect" && init?.method === "POST") {
        return jsonResponse(detectedState);
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      const topAppBar = screen.getByRole("banner");
      await user.click(within(topAppBar).getByRole("button", { name: /run detection/i }));

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/workspace/detect",
        expect.objectContaining({ method: "POST" }),
      );
      expect(await screen.findByAltText("cabinet thumbnail")).toBeInTheDocument();
      expect(screen.getByText("model_detected")).toBeInTheDocument();
      expect(screen.getByTestId("overlay-label-element_010")).toHaveTextContent("cabinet");
    } finally {
      restoreFetch();
    }
  });

  it("clears stale repair metadata when detection replaces candidates with reused ids", async () => {
    const user = userEvent.setup();
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(completionState);
      }

      if (
        input === "/api/workspace/elements/element_001/repair/metadata"
        && (!init || init.method === "GET")
      ) {
        return jsonResponse({
          elementId: "element_001",
          files: {
            missingMask: true,
            repairPackage: false,
            completedAsset: false,
            repairReport: false,
            qaReport: false,
            changedPixelsOverlay: false,
          },
          paths: {
            missingMaskPath: "elements/element_001/missing_mask.png",
            completedAssetPath: null,
            repairReportPath: null,
            qaReportPath: null,
            changedPixelsOverlayPath: null,
          },
          qaReport: null,
        });
      }

      if (input === "/api/workspace/detect" && init?.method === "POST") {
        return jsonResponse(detectedReplacementState);
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByAltText("Region 1 missing mask overlay");
      expect(screen.getByText(/QA pending/i)).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /run detection/i }));

      expect(await screen.findByAltText("cabinet thumbnail")).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.queryByText(/QA pending/i)).not.toBeInTheDocument();
      });
      expect(screen.queryByAltText("cabinet missing mask overlay")).not.toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("allows model-detected candidates to be rejected from the element panel", async () => {
    const user = userEvent.setup();
    const rejectedState = {
      source: detectedState.source,
      elements: [
        {
          ...detectedElement,
          status: "rejected",
          mode: "rejected",
          visible: false,
        },
      ],
    };
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(detectedState);
      }

      if (input === "/api/workspace/state" && init?.method === "PUT") {
        expect(init.body).toBe(JSON.stringify(rejectedState));
        return jsonResponse(rejectedState);
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByAltText("cabinet thumbnail");

      await user.click(screen.getByRole("button", { name: /^reject$/i }));

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/workspace/state",
        expect.objectContaining({ method: "PUT" }),
      );
      expect(await screen.findAllByText(/element rejected\./i)).toHaveLength(2);
      expect(screen.queryByAltText("cabinet thumbnail")).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/element name/i)).not.toBeInTheDocument();

      await user.click(screen.getByRole("checkbox", { name: /show rejected/i }));

      expect(await screen.findByAltText("cabinet thumbnail")).toBeInTheDocument();
      expect(screen.getByTestId("overlay-label-element_010")).toHaveTextContent("cabinet");
      expect(screen.getByText("rejected")).toBeInTheDocument();
      expect(screen.queryByRole("checkbox", { name: /select cabinet for merge/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("checkbox", { name: /toggle visibility for cabinet/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^accept$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^reject$/i })).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/element name/i)).not.toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("creates a manual element from a drawn rectangle", async () => {
    const user = userEvent.setup();
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(loadedState);
      }

      if (input === "/api/workspace/elements" && init?.method === "POST") {
        return jsonResponse({
          element: createdManualElement,
          state: {
            source: loadedState.source,
            elements: [...loadedState.elements, createdManualElement],
          },
        });
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      await user.click(screen.getByRole("button", { name: /draw element/i }));

      const surface = screen.getByTestId("canvas-drawing-surface");
      await drawRectangle(surface, { x: 100, y: 90 }, { x: 220, y: 190 });

      const nameField = screen.getByLabelText(/new element name/i);
      expect(nameField.closest(".draft-inline-editor")).not.toBeNull();
      expect(screen.queryByText(/Draft region/i)).not.toBeInTheDocument();
      fireEvent.change(nameField, { target: { value: "Manual Lamp" } });
      await user.click(screen.getByRole("button", { name: /create element/i }));

      await screen.findByAltText("Manual Lamp thumbnail");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/workspace/elements",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            name: "Manual Lamp",
            bbox: { x: 20, y: 18, w: 24, h: 20 },
          }),
        }),
      );
      expect(screen.getByTestId("overlay-label-element_002")).toHaveTextContent("Manual Lamp");
    } finally {
      restoreFetch();
    }
  });

  it("creates a child element from a drawn rectangle", async () => {
    const user = userEvent.setup();
    const childState = {
      source: loadedState.source,
      elements: [...loadedState.elements, createdChildElement],
    };
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(loadedState);
      }

      if (input === "/api/workspace/elements/element_001/children" && init?.method === "POST") {
        return jsonResponse({
          element: createdChildElement,
          state: childState,
        });
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      await user.click(screen.getByRole("button", { name: /draw element/i }));

      const surface = screen.getByTestId("canvas-drawing-surface");
      await drawRectangle(surface, { x: 80, y: 100 }, { x: 130, y: 160 });

      const nameField = screen.getByLabelText(/new element name/i);
      fireEvent.change(nameField, { target: { value: "Shelf Handle" } });
      await user.click(screen.getByRole("button", { name: /create child/i }));

      await screen.findByAltText("Shelf Handle thumbnail");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/workspace/elements/element_001/children",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            label: "Shelf Handle",
            bbox: { x: 16, y: 20, w: 10, h: 12 },
          }),
        }),
      );
      expect(screen.getByTestId("overlay-label-element_002")).toHaveTextContent("Shelf Handle");
    } finally {
      restoreFetch();
    }
  });

  it("edits inspector fields for the selected element and persists them", async () => {
    const user = userEvent.setup();
    const patchedElement = {
      ...loadedState.elements[0],
      name: "Hero Shelf",
      label: "Hero Shelf",
      status: "edited",
      bbox: { x: 12, y: 16, w: 34, h: 32 },
      canvas: { x: 12, y: 16, w: 34, h: 32 },
      visible: false,
      history: [
        {
          kind: "manual_edit",
          at: "2026-06-17T00:00:00+00:00",
          before: {},
          after: {},
        },
      ],
      mergedInto: null,
      exportParent: false,
    };
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(loadedState);
      }

      if (input === "/api/workspace/elements/element_001" && init?.method === "PATCH") {
        return jsonResponse({
          element: patchedElement,
          state: {
            source: loadedState.source,
            elements: [patchedElement],
          },
        });
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      const nameField = screen.getByLabelText(/element name/i);
      const bboxWidthField = screen.getByLabelText(/bbox width/i);
      const visibilityField = screen.getByRole("checkbox", { name: /element visible/i });

      fireEvent.change(nameField, { target: { value: "Hero Shelf" } });
      fireEvent.change(bboxWidthField, { target: { value: "34" } });
      await user.click(visibilityField);
      await user.click(screen.getByRole("button", { name: /save element/i }));

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/workspace/elements/element_001",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            bbox: { x: 12, y: 16, w: 34, h: 32 },
            label: "Hero Shelf",
            visible: false,
          }),
        }),
      );
      expect(screen.getAllByText(/element details updated\./i)).toHaveLength(2);
      expect(screen.getByAltText("Hero Shelf thumbnail")).toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("saves legacy visibility-only edits without sending an implicit label", async () => {
    const user = userEvent.setup();
    const acceptedHiddenElement = {
      ...loadedState.elements[0],
      visible: false,
    };
    const acceptedHiddenState = {
      source: loadedState.source,
      elements: [acceptedHiddenElement],
    };
    let patchRequest: unknown = null;
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(loadedState);
      }

      if (input === "/api/workspace/elements/element_001" && init?.method === "PATCH") {
        patchRequest = JSON.parse(String(init.body));
        return jsonResponse({
          element: acceptedHiddenElement,
          state: acceptedHiddenState,
        });
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      await user.click(screen.getByRole("checkbox", { name: /element visible/i }));
      await user.click(screen.getByRole("button", { name: /save element/i }));

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/workspace/elements/element_001",
        expect.objectContaining({ method: "PATCH" }),
      );
      expect(patchRequest).toEqual({ visible: false });
      expect(screen.getAllByText("accepted").length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: /^extract$/i })).not.toBeDisabled();
    } finally {
      restoreFetch();
    }
  });

  it("saves bbox-only candidate edits with PATCH", async () => {
    const user = userEvent.setup();
    const patchedElement = {
      ...detectedElement,
      status: "edited",
      bbox: { x: 12, y: 16, w: 34, h: 32 },
    };
    let statePuts = 0;
    let patchRequest: unknown = null;
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(detectedState);
      }

      if (input === "/api/workspace/state" && init?.method === "PUT") {
        statePuts += 1;
        return jsonResponse(detectedState);
      }

      if (input === "/api/workspace/elements/element_010" && init?.method === "PATCH") {
        patchRequest = JSON.parse(String(init.body));
        return jsonResponse({
          element: patchedElement,
          state: {
            source: detectedState.source,
            elements: [patchedElement],
          },
        });
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      const bboxWidthField = screen.getByLabelText(/bbox width/i);
      fireEvent.change(bboxWidthField, { target: { value: "34" } });
      await user.click(screen.getByRole("button", { name: /save element/i }));

      await waitFor(() => {
        expect(patchRequest).toEqual({
          bbox: { x: 12, y: 16, w: 34, h: 32 },
        });
      });
      expect(statePuts).toBe(0);
      expect(screen.getAllByText(/element details updated\./i)).toHaveLength(2);
    } finally {
      restoreFetch();
    }
  });

  it("blocks mixed candidate patch and legacy edits instead of falling back to PUT", async () => {
    const user = userEvent.setup();
    let statePuts = 0;
    let patchRequests = 0;
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(detectedState);
      }

      if (input === "/api/workspace/state" && init?.method === "PUT") {
        statePuts += 1;
        return jsonResponse(detectedState);
      }

      if (input === "/api/workspace/elements/element_010" && init?.method === "PATCH") {
        patchRequests += 1;
        return jsonResponse({
          element: detectedElement,
          state: detectedState,
        });
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      const bboxWidthField = screen.getByLabelText(/bbox width/i);
      fireEvent.change(bboxWidthField, { target: { value: "34" } });
      fireEvent.change(screen.getByLabelText(/element notes/i), { target: { value: "Needs legacy review" } });
      await user.click(screen.getByRole("button", { name: /save element/i }));

      await waitFor(() => {
        expect(statePuts).toBe(0);
        expect(patchRequests).toBe(0);
      });
      expect(screen.getAllByText(/state save failed\./i)).toHaveLength(2);
      expect(screen.getByText(/save geometry or label changes separately from legacy fields\./i)).toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("keeps the last persisted element when inspector save is rejected by validation", async () => {
    const user = userEvent.setup();
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(loadedState);
      }

      if (input === "/api/workspace/elements/element_001" && init?.method === "PATCH") {
        return jsonResponse(
          { detail: "Element element_001 bbox width/height must be > 0." },
          400,
        );
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      const bboxWidthField = screen.getByLabelText(/bbox width/i);
      fireEvent.change(bboxWidthField, { target: { value: "0" } });
      await user.click(screen.getByRole("button", { name: /save element/i }));

      expect(await screen.findByText(/element element_001 bbox width\/height must be > 0\./i)).toBeInTheDocument();
      expect(screen.getAllByText(/state save failed\./i)).toHaveLength(2);
      expect(screen.getByTestId("overlay-box-element_001")).toBeInTheDocument();
      expect(screen.getByLabelText(/bbox width/i)).toHaveValue(30);
    } finally {
      restoreFetch();
    }
  });

  it("merges selected element ids with the merge endpoint", async () => {
    const user = userEvent.setup();
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(mergeSourceState);
      }

      if (input === "/api/workspace/elements/merge" && init?.method === "POST") {
        return jsonResponse({
          element: mergedState.elements[2],
          state: mergedState,
        });
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      expect(screen.getByRole("checkbox", { name: /select region 1 for merge/i })).not.toBeChecked();
      expect(screen.getByRole("checkbox", { name: /select region 2 for merge/i })).not.toBeChecked();
      await user.click(screen.getByRole("checkbox", { name: /select region 1 for merge/i }));
      await user.click(screen.getByRole("checkbox", { name: /select region 2 for merge/i }));
      const labelField = screen.getByLabelText(/merge label/i);
      fireEvent.change(labelField, { target: { value: "Fixture group" } });
      await user.click(screen.getByRole("button", { name: /merge selected/i }));

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/workspace/elements/merge",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            elementIds: ["element_001", "element_002"],
            label: "Fixture group",
          }),
        }),
      );
      expect(await screen.findByAltText("Fixture group thumbnail")).toBeInTheDocument();
      expect(screen.getByTestId("overlay-label-element_003")).toHaveTextContent("Fixture group");
    } finally {
      restoreFetch();
    }
  });

  it("blocks merge while selected geometry edits are unsaved", async () => {
    const user = userEvent.setup();
    let mergePosts = 0;
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(mergeSourceState);
      }

      if (input === "/api/workspace/elements/merge" && init?.method === "POST") {
        mergePosts += 1;
        return jsonResponse({
          element: mergedState.elements[2],
          state: mergedState,
        });
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      const bboxWidthField = screen.getByLabelText(/bbox width/i);
      await user.clear(bboxWidthField);
      await user.type(bboxWidthField, "34");
      await user.click(screen.getByRole("checkbox", { name: /select region 1 for merge/i }));
      await user.click(screen.getByRole("checkbox", { name: /select region 2 for merge/i }));

      const mergeButton = screen.getByRole("button", { name: /merge selected/i });
      expect(mergeButton).toBeDisabled();

      await user.click(mergeButton);

      expect(mergePosts).toBe(0);
      expect(globalThis.fetch).not.toHaveBeenCalledWith(
        "/api/workspace/elements/merge",
        expect.objectContaining({ method: "POST" }),
      );
    } finally {
      restoreFetch();
    }
  });

  it("excludes rejected hidden candidates from merge controls", async () => {
    const stateWithRejectedCandidate = {
      source: loadedState.source,
      elements: [
        mergeSourceState.elements[0],
        {
          ...mergeSourceState.elements[1],
          status: "rejected",
          mode: "rejected",
          visible: false,
        },
      ],
    };
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(stateWithRejectedCandidate);
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      expect(screen.queryByRole("checkbox", { name: /select region 2 for merge/i })).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/merge label/i)).not.toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("keeps browse selection separate from merge selection", async () => {
    const user = userEvent.setup();
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(mergeSourceState);
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      await user.click(screen.getByRole("button", { name: /region 2 thumbnail/i }));

      expect(screen.getByLabelText(/element name/i)).toHaveValue("Region 2");
      expect(screen.getByRole("button", { name: /merge selected/i })).toBeDisabled();
      expect(screen.getByRole("checkbox", { name: /select region 1 for merge/i })).not.toBeChecked();
      expect(screen.getByRole("checkbox", { name: /select region 2 for merge/i })).not.toBeChecked();
    } finally {
      restoreFetch();
    }
  });

  it("extracts all only for actionable accepted elements", async () => {
    const user = userEvent.setup();
    const extractedMergedOnlyState = {
      source: extractMergedState.source,
      elements: extractMergedState.elements.map((element) =>
        element.id === "element_003"
          ? {
            ...element,
            status: "extracted",
            mask: "elements/element_003/mask.png",
          }
          : element,
      ),
    };
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(extractMergedState);
      }

      if (input === "/api/workspace/extract" && init?.method === "POST") {
        expect(init.body).toBe(JSON.stringify({
          elementIds: ["element_003"],
          strategy: "bbox_alpha",
        }));
        return jsonResponse({
          extractions: [
            {
              elementId: "element_003",
              strategy: "bbox_alpha",
              maskPath: "elements/element_003/mask.png",
              assetPath: "elements/element_003/asset_incomplete.png",
              sourceCropPath: "elements/element_003/source_crop.png",
            },
          ],
          state: extractedMergedOnlyState,
        });
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByAltText("Fixture group thumbnail");

      await user.click(screen.getByRole("button", { name: /extract all/i }));

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/workspace/extract",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            elementIds: ["element_003"],
            strategy: "bbox_alpha",
          }),
        }),
      );
      expect(await screen.findAllByText(/extracted 1 element\./i)).toHaveLength(2);
    } finally {
      restoreFetch();
    }
  });

  it("hides merged-away source elements from normal actions and merge selection", async () => {
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(mergedState);
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByAltText("Fixture group thumbnail");

      expect(screen.queryByAltText("Region 1 thumbnail")).not.toBeInTheDocument();
      expect(screen.queryByAltText("Region 2 thumbnail")).not.toBeInTheDocument();
      expect(screen.queryByRole("checkbox", { name: /select region 1 for merge/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("checkbox", { name: /select region 2 for merge/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("checkbox", { name: /toggle visibility for region 1/i })).not.toBeInTheDocument();
      expect(screen.queryByTestId("overlay-label-element_001")).not.toBeInTheDocument();
      expect(screen.queryByTestId("overlay-label-element_002")).not.toBeInTheDocument();
      expect(screen.getByTestId("overlay-label-element_003")).toHaveTextContent("Fixture group");
    } finally {
      restoreFetch();
    }
  });

  it("splits the selected element and overlay toggles still work afterward", async () => {
    const user = userEvent.setup();
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(loadedState);
      }

      if (input === "/api/workspace/elements/element_001/split" && init?.method === "POST") {
        return jsonResponse({
          children: splitState.elements.slice(1),
          state: splitState,
        });
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      await user.click(screen.getByRole("button", { name: /split selected/i }));
      const surface = screen.getByTestId("canvas-drawing-surface");
      await drawRectangle(surface, { x: 60, y: 80 }, { x: 130, y: 240 });
      await drawRectangle(surface, { x: 130, y: 80 }, { x: 210, y: 240 });

      expect(await screen.findByRole("group", { name: /split draft controls/i })).toBeInTheDocument();
      await user.click(await screen.findByRole("button", { name: /apply split regions/i }));

      await screen.findByAltText("Left Shelf thumbnail");
      expect(screen.getByText("split_parent")).toBeInTheDocument();
      expect(screen.getByTestId("overlay-label-element_002")).toHaveTextContent("Left Shelf");
      expect(screen.getByTestId("overlay-label-element_003")).toHaveTextContent("Right Shelf");

      await user.click(screen.getByRole("checkbox", { name: /show boxes/i }));

      expect(screen.queryByTestId("overlay-box-element_002")).not.toBeInTheDocument();
      expect(screen.queryByTestId("overlay-box-element_003")).not.toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("undoes and redoes persisted workspace operations from the history stack", async () => {
    const user = userEvent.setup();
    const acceptedState = {
      source: detectedState.source,
      elements: [
        {
          ...detectedElement,
          status: "accepted",
          mode: "visible_only",
          visible: true,
        },
      ],
    };
    const savedStates: unknown[] = [];
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(detectedState);
      }

      if (input === "/api/workspace/state" && init?.method === "PUT") {
        const parsed = JSON.parse(String(init.body));
        savedStates.push(parsed);
        return jsonResponse(parsed);
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByAltText("cabinet thumbnail");

      await user.click(screen.getByRole("button", { name: /^accept$/i }));
      expect(await screen.findAllByText(/element accepted\./i)).toHaveLength(2);

      const canvasToolbar = screen.getByRole("toolbar", { name: /canvas tools/i });
      const undoButton = within(canvasToolbar).getByRole("button", { name: /undo/i });
      const redoButton = within(canvasToolbar).getByRole("button", { name: /redo/i });
      expect(undoButton).toBeEnabled();
      expect(redoButton).toBeDisabled();

      await user.click(undoButton);
      expect(await screen.findAllByText(/undone\./i)).toHaveLength(2);
      expect(screen.getByText("model_detected")).toBeInTheDocument();
      expect(redoButton).toBeEnabled();

      fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
      await waitFor(() => {
        expect(screen.getAllByText(/redone\./i)).toHaveLength(2);
      });
      expect(screen.getByText("accepted")).toBeInTheDocument();

      expect(savedStates).toEqual([
        acceptedState,
        detectedState,
        acceptedState,
      ]);
    } finally {
      restoreFetch();
    }
  });

  it("submits an AI split request contract for the selected element", async () => {
    const user = userEvent.setup();
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(loadedState);
      }

      if (input === "/api/workspace/split-requests" && init?.method === "POST") {
        return jsonResponse({
          requestId: "split_request_123",
          path: "split_requests/split_request_123.json",
        });
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      const descriptionField = screen.getByLabelText(/split selected element into/i);
      fireEvent.change(descriptionField, { target: { value: "frame and glass" } });
      await user.click(screen.getByRole("button", { name: /create split request/i }));

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/workspace/split-requests",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            elementId: "element_001",
            description: "frame and glass",
          }),
        }),
      );
      expect(screen.getAllByText(/split request saved: split_request_123/i)).toHaveLength(2);
    } finally {
      restoreFetch();
    }
  });

  it("extracts the selected element and renders the extraction preview", async () => {
    const user = userEvent.setup();
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(loadedState);
      }

      if (input === "/api/workspace/extract" && init?.method === "POST") {
        return jsonResponse({
          extractions: [
            {
              elementId: "element_001",
              strategy: "bbox_alpha",
              maskPath: "elements/element_001/mask.png",
              assetPath: "elements/element_001/asset_incomplete.png",
              sourceCropPath: "elements/element_001/source_crop.png",
            },
          ],
          state: extractedState,
        });
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      await user.click(screen.getByRole("button", { name: /^extract$/i }));

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/workspace/extract",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            elementIds: ["element_001"],
            strategy: "bbox_alpha",
          }),
        }),
      );
      expect(await screen.findAllByText(/extracted 1 element\./i)).toHaveLength(2);
      expect(screen.getByAltText("Region 1 source crop")).toHaveAttribute(
        "src",
        expect.stringMatching(
          /^\/api\/workspace\/assets\/elements\/element_001\/source_crop\.png\?cache=\d+$/,
        ),
      );
      expect(screen.getByAltText("Region 1 mask overlay")).toHaveAttribute(
        "src",
        expect.stringMatching(
          /^\/api\/workspace\/assets\/elements\/element_001\/mask\.png\?cache=\d+$/,
        ),
      );
      expect(screen.getByAltText("Region 1 transparent asset")).toHaveAttribute(
        "src",
        expect.stringMatching(
          /^\/api\/workspace\/assets\/elements\/element_001\/asset_incomplete\.png\?cache=\d+$/,
        ),
      );
      expect(screen.getAllByText(/canvas 46 x 48 at 4, 8/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/bbox 30 x 32 at 12, 16/i).length).toBeGreaterThan(0);
    } finally {
      restoreFetch();
    }
  });

  it("exports the asset pack and shows the export summary panel", async () => {
    const user = userEvent.setup();
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(extractedState);
      }

      if (input === "/api/workspace/export" && init?.method === "POST") {
        expect(init.body).toBe(JSON.stringify({ allowIncompleteVisibleOnly: false }));
        return jsonResponse(exportSummary);
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      await user.click(screen.getByRole("button", { name: /export asset pack/i }));

      expect(await screen.findAllByText(/exported 1 asset\. 1 blocked\./i)).toHaveLength(2);
      expect(screen.getByRole("heading", { name: /export pack/i })).toBeInTheDocument();
      expect(screen.getByText("1 exportable")).toBeInTheDocument();
      expect(screen.getByText("1 blocked")).toBeInTheDocument();
      expect(screen.getByText(/element_002 needs_completion is blocked/i)).toBeInTheDocument();
      expect(screen.getByText(/blocked elements/i)).toBeInTheDocument();
      expect(screen.getByText("element_002")).toBeInTheDocument();
      expect(screen.getByText("Gap")).toBeInTheDocument();
      expect(screen.getByText("needs_completion_without_valid_repair")).toBeInTheDocument();
      expect(screen.getByText("D:/work/art-pipeline-v2-demo/workspace/export")).toBeInTheDocument();
      expect(screen.getByAltText("Export contact sheet preview")).toHaveAttribute(
        "src",
        expect.stringMatching(/^\/api\/workspace\/assets\/export\/contact_sheet\.png\?cache=\d+$/),
      );
    } finally {
      restoreFetch();
    }
  });

  it("clears the previous export summary when a later export fails", async () => {
    const user = userEvent.setup();
    let exportCalls = 0;
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(extractedState);
      }

      if (input === "/api/workspace/export" && init?.method === "POST") {
        exportCalls += 1;
        if (exportCalls === 1) {
          return jsonResponse(exportSummary);
        }
        return jsonResponse({ detail: "Export source file is missing." }, 400);
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      await user.click(screen.getByRole("button", { name: /export asset pack/i }));
      expect(await screen.findByAltText("Export contact sheet preview")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /export asset pack/i }));

      expect(await screen.findByText(/export source file is missing\./i)).toBeInTheDocument();
      expect(screen.queryByText(/no export yet/i)).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: /export pack/i })).not.toBeInTheDocument();
      expect(screen.queryByAltText("Export contact sheet preview")).not.toBeInTheDocument();
      expect(screen.queryByText("D:/work/art-pipeline-v2-demo/workspace/export")).not.toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("replaces the selected mask from the current rectangle shape", async () => {
    const user = userEvent.setup();
    const shapeMaskState = {
      source: loadedState.source,
      elements: [
        {
          ...loadedState.elements[0],
          status: "extract_ready",
          mask: "elements/element_001/mask.png",
        },
      ],
    };
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(loadedState);
      }

      if (input === "/api/workspace/elements/element_001/mask/replace" && init?.method === "POST") {
        return jsonResponse({
          state: shapeMaskState,
        });
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      await user.click(await screen.findByRole("button", { name: /replace mask by current shape/i }));

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/workspace/elements/element_001/mask/replace",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            shape: {
              type: "rectangle",
              coordinateSpace: "source",
              bbox: { x: 12, y: 16, w: 30, h: 32 },
            },
          }),
        }),
      );
      expect(await screen.findAllByText(/mask replaced\./i)).toHaveLength(2);
      expect(screen.getByText("extract_ready")).toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("disables extraction and mask controls while geometry edits are unsaved", async () => {
    const user = userEvent.setup();
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(extractedState);
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      const bboxWidthField = screen.getByLabelText(/bbox width/i);
      await user.clear(bboxWidthField);
      await user.type(bboxWidthField, "31");

      expect(screen.getByRole("button", { name: /^extract$/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /replace mask by current shape/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /clear mask/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /re-extract/i })).toBeDisabled();
      expect(screen.getByText(/save geometry changes before mask or extraction actions/i)).toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("shows mask overlays and clears the selected extraction mask", async () => {
    const user = userEvent.setup();
    const clearedState = {
      source: loadedState.source,
      elements: [
        {
          ...loadedState.elements[0],
          status: "extract_ready",
          mask: null,
        },
      ],
    };
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(extractedState);
      }

      if (input === "/api/workspace/elements/element_001/mask/clear" && init?.method === "POST") {
        return jsonResponse({
          state: clearedState,
        });
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      expect(screen.getByRole("button", { name: /replace mask by current shape/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /re-extract/i })).toBeInTheDocument();
      await user.click(screen.getByRole("checkbox", { name: /show masks/i }));

      expect(screen.getByTestId("overlay-mask-element_001")).toHaveAttribute(
        "src",
        expect.stringMatching(
          /^\/api\/workspace\/assets\/elements\/element_001\/mask\.png\?cache=\d+$/,
        ),
      );

      await user.click(screen.getByRole("button", { name: /clear mask/i }));

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/workspace/elements/element_001/mask/clear",
        expect.objectContaining({ method: "POST" }),
      );
      expect(await screen.findAllByText(/mask cleared\./i)).toHaveLength(2);
      expect(screen.queryByAltText("Region 1 mask overlay")).not.toBeInTheDocument();
      expect(screen.queryByTestId("overlay-mask-element_001")).not.toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("creates and validates a needs-completion repair task from the inspector", async () => {
    const user = userEvent.setup();
    const qaReport = {
      elementId: "element_001",
      status: "pass",
      reasons: [],
      warnings: [],
      metrics: {
        totalPixels: 2208,
        missingMaskPixels: 960,
        changedPixels: 24,
        insideMissingChangedPixels: 24,
        outsideMissingChangedPixels: 0,
        preserveChangedPixels: 0,
        missingAreaRatio: 0.43,
        changedAreaRatio: 0.01,
      },
      reportPath: "elements/element_001/repair/qa_report.json",
      changedPixelsOverlayPath: "elements/element_001/repair/changed_pixels_overlay.png",
    };
    let repairMetadata: unknown = {
      elementId: "element_001",
      files: {
        missingMask: false,
        repairPackage: false,
        completedAsset: false,
        repairReport: false,
        qaReport: false,
        changedPixelsOverlay: false,
      },
      paths: {
        missingMaskPath: null,
        completedAssetPath: null,
        repairReportPath: null,
        qaReportPath: null,
        changedPixelsOverlayPath: null,
      },
      qaReport: null,
    };
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(completionState);
      }

      if (
        input === "/api/workspace/elements/element_001/repair/metadata"
        && (!init || init.method === "GET")
      ) {
        return jsonResponse(repairMetadata);
      }

      if (
        input === "/api/workspace/elements/element_001/repair/missing-mask"
        && init?.method === "POST"
      ) {
        expect(init.body).toBe(
          JSON.stringify({
            shape: {
              type: "rectangle",
              coordinateSpace: "canvas",
              bbox: { x: 10, y: 10, w: 20, h: 20 },
            },
          }),
        );
        repairMetadata = {
          elementId: "element_001",
          files: {
            missingMask: true,
            repairPackage: false,
            completedAsset: false,
            repairReport: false,
            qaReport: false,
            changedPixelsOverlay: false,
          },
          paths: {
            missingMaskPath: "elements/element_001/missing_mask.png",
            completedAssetPath: null,
            repairReportPath: null,
            qaReportPath: null,
            changedPixelsOverlayPath: null,
          },
          qaReport: null,
        };
        return jsonResponse({
          missingMaskPath: "elements/element_001/missing_mask.png",
          repair: repairMetadata,
          state: completionState,
        });
      }

      if (
        input === "/api/workspace/elements/element_001/repair/task"
        && init?.method === "POST"
      ) {
        repairMetadata = {
          elementId: "element_001",
          files: {
            missingMask: true,
            repairPackage: true,
            completedAsset: false,
            repairReport: false,
            qaReport: false,
            changedPixelsOverlay: false,
          },
          paths: {
            missingMaskPath: "elements/element_001/missing_mask.png",
            completedAssetPath: null,
            repairReportPath: null,
            qaReportPath: null,
            changedPixelsOverlayPath: null,
          },
          qaReport: null,
        };
        return jsonResponse({
          paths: {
            sourceCropPath: "elements/element_001/repair/source_crop.png",
            sceneContextPath: "elements/element_001/repair/scene_context.png",
            incompleteAssetPath: "elements/element_001/repair/incomplete_asset.png",
            preserveMaskPath: "elements/element_001/repair/preserve_mask.png",
            missingMaskPath: "elements/element_001/repair/missing_mask.png",
            guideOverlayPath: "elements/element_001/repair/guide_overlay.png",
            repairPromptPath: "elements/element_001/repair/repair_prompt.md",
          },
          repair: repairMetadata,
          state: repairPendingState,
        });
      }

      if (
        input === "/api/workspace/elements/element_001/repair/validate"
        && init?.method === "POST"
      ) {
        repairMetadata = {
          elementId: "element_001",
          files: {
            missingMask: true,
            repairPackage: true,
            completedAsset: true,
            repairReport: true,
            qaReport: true,
            changedPixelsOverlay: true,
          },
          paths: {
            missingMaskPath: "elements/element_001/missing_mask.png",
            completedAssetPath: "elements/element_001/repair/completed_asset.png",
            repairReportPath: "elements/element_001/repair/repair_report.json",
            qaReportPath: "elements/element_001/repair/qa_report.json",
            changedPixelsOverlayPath: "elements/element_001/repair/changed_pixels_overlay.png",
          },
          qaReport,
        };
        return jsonResponse({
          qa: qaReport,
          repair: repairMetadata,
          state: repairCompleteState,
        });
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      expect(screen.getByRole("button", { name: /draw missing mask/i })).toBeInTheDocument();
      expect(screen.getByText(/preview preserve mask/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /create codex repair task/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /validate repair output/i })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /draw missing mask/i }));
      expect(globalThis.fetch).not.toHaveBeenCalledWith(
        "/api/workspace/elements/element_001/repair/missing-mask",
        expect.anything(),
      );

      const surface = screen.getByTestId("canvas-drawing-surface");
      await drawRectangle(surface, { x: 70, y: 90 }, { x: 170, y: 190 });

      expect(await screen.findAllByText(/missing mask saved\./i)).toHaveLength(2);
      expect(screen.getByLabelText(/missing x/i)).toHaveValue(10);
      expect(screen.getByLabelText(/missing y/i)).toHaveValue(10);
      expect(screen.getByLabelText(/missing width/i)).toHaveValue(20);
      expect(screen.getByLabelText(/missing height/i)).toHaveValue(20);
      expect(screen.getByAltText("Region 1 missing mask overlay")).toHaveAttribute(
        "src",
        expect.stringMatching(
          /^\/api\/workspace\/assets\/elements\/element_001\/missing_mask\.png\?cache=\d+$/,
        ),
      );

      await user.click(screen.getByRole("button", { name: /create codex repair task/i }));

      expect(await screen.findAllByText(/codex repair task created\./i)).toHaveLength(2);
      expect(screen.getByAltText("Region 1 preserve mask preview")).toHaveAttribute(
        "src",
        expect.stringMatching(
          /^\/api\/workspace\/assets\/elements\/element_001\/repair\/preserve_mask\.png\?cache=\d+$/,
        ),
      );

      await user.click(screen.getByRole("button", { name: /validate repair output/i }));

      expect(await screen.findByText(/QA pass/i)).toBeInTheDocument();
      expect(screen.getByAltText("Region 1 before asset")).toHaveAttribute(
        "src",
        expect.stringMatching(
          /^\/api\/workspace\/assets\/elements\/element_001\/asset_incomplete\.png\?cache=\d+$/,
        ),
      );
      expect(screen.getByAltText("Region 1 after asset")).toHaveAttribute(
        "src",
        expect.stringMatching(
          /^\/api\/workspace\/assets\/elements\/element_001\/repair\/completed_asset\.png\?cache=\d+$/,
        ),
      );
      expect(screen.getByAltText("Region 1 changed pixels overlay")).toHaveAttribute(
        "src",
        expect.stringMatching(
          /^\/api\/workspace\/assets\/elements\/element_001\/repair\/changed_pixels_overlay\.png\?cache=\d+$/,
        ),
      );
      expect(screen.getByText(/inside missing changed pixels: 24/i)).toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("discovers pending repair metadata on reload without showing a missing completed asset", async () => {
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(repairPendingState);
      }

      if (
        input === "/api/workspace/elements/element_001/repair/metadata"
        && (!init || init.method === "GET")
      ) {
        return jsonResponse({
          elementId: "element_001",
          files: {
            missingMask: true,
            repairPackage: true,
            completedAsset: false,
            repairReport: false,
            qaReport: false,
            changedPixelsOverlay: false,
          },
          paths: {
            missingMaskPath: "elements/element_001/missing_mask.png",
            completedAssetPath: null,
            repairReportPath: null,
            qaReportPath: null,
            changedPixelsOverlayPath: null,
          },
          qaReport: null,
        });
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      expect(await screen.findByAltText("Region 1 inspector missing mask overlay")).toHaveAttribute(
        "src",
        expect.stringMatching(
          /^\/api\/workspace\/assets\/elements\/element_001\/missing_mask\.png\?cache=\d+$/,
        ),
      );
      expect(screen.getByAltText("Region 1 preserve mask preview")).toHaveAttribute(
        "src",
        expect.stringMatching(
          /^\/api\/workspace\/assets\/elements\/element_001\/repair\/preserve_mask\.png\?cache=\d+$/,
        ),
      );
      expect(screen.queryByAltText("Region 1 after asset")).not.toBeInTheDocument();
      expect(screen.getByText(/QA pending/i)).toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("discovers completed repair QA metadata on reload", async () => {
    const qaReport = {
      elementId: "element_001",
      status: "pass",
      reasons: [],
      warnings: [],
      metrics: {
        totalPixels: 2208,
        missingMaskPixels: 960,
        changedPixels: 24,
        insideMissingChangedPixels: 24,
        outsideMissingChangedPixels: 0,
        preserveChangedPixels: 0,
        missingAreaRatio: 0.43,
        changedAreaRatio: 0.01,
      },
      reportPath: "elements/element_001/repair/qa_report.json",
      changedPixelsOverlayPath: "elements/element_001/repair/changed_pixels_overlay.png",
    };
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(repairCompleteState);
      }

      if (
        input === "/api/workspace/elements/element_001/repair/metadata"
        && (!init || init.method === "GET")
      ) {
        return jsonResponse({
          elementId: "element_001",
          files: {
            missingMask: true,
            repairPackage: true,
            completedAsset: true,
            repairReport: true,
            qaReport: true,
            changedPixelsOverlay: true,
          },
          paths: {
            missingMaskPath: "elements/element_001/missing_mask.png",
            completedAssetPath: "elements/element_001/repair/completed_asset.png",
            repairReportPath: "elements/element_001/repair/repair_report.json",
            qaReportPath: "elements/element_001/repair/qa_report.json",
            changedPixelsOverlayPath: "elements/element_001/repair/changed_pixels_overlay.png",
          },
          qaReport,
        });
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      expect(await screen.findByText(/QA pass/i)).toBeInTheDocument();
      expect(screen.getByAltText("Region 1 after asset")).toHaveAttribute(
        "src",
        expect.stringMatching(
          /^\/api\/workspace\/assets\/elements\/element_001\/repair\/completed_asset\.png\?cache=\d+$/,
        ),
      );
      expect(screen.getByAltText("Region 1 changed pixels overlay")).toHaveAttribute(
        "src",
        expect.stringMatching(
          /^\/api\/workspace\/assets\/elements\/element_001\/repair\/changed_pixels_overlay\.png\?cache=\d+$/,
        ),
      );
      expect(screen.getByText(/latest QA: pass/i)).toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });
});
