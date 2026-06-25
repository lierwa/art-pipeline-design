import { App, assetSelectButton, completionState, confirmMergeDialog, createGestureEvent, createdChildElement, createdManualElement, describe, detectedElement, detectedState, drawRectangle, duplicateMergeNameState, expect, exportReadyState, exportSummary, extractedState, extractMergedState, fireEvent, installFetchMock, it, jsonResponse, legacyStatusRejectedState, loadedState, loadedStateWithoutElements, mergeSourceState, mergedState, mockElementRect, mockRect, openAssetContextMenu, overlappingMergeState, partiallyReviewedState, persistedWorkspaceState, pipelineStage, rejectedTreeState, render, repairCompleteState, repairPendingState, screen, setCanvasRect, splitState, toggleAssetSelection, treeState, userEvent, vi, waitFor, within } from "./appTestHarness";

describe("App flow 09", () => {
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

      expect(await screen.findByRole("button", { name: /draw missing mask/i })).toBeInTheDocument();
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
