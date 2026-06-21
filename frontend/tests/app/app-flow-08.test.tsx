import { App, assetSelectButton, completionState, confirmMergeDialog, createGestureEvent, createdChildElement, createdManualElement, describe, detectedElement, detectedState, drawRectangle, dragSortableAssetTreeItem, duplicateMergeNameState, expect, exportReadyState, exportSummary, extractedState, extractMergedState, fireEvent, installFetchMock, it, jsonResponse, legacyStatusRejectedState, loadedState, loadedStateWithoutElements, mergeSourceState, mergedState, mockElementRect, mockRect, openAssetContextMenu, overlappingMergeState, partiallyReviewedState, persistedWorkspaceState, pipelineStage, rejectedTreeState, render, repairCompleteState, repairPendingState, screen, setCanvasRect, splitState, toggleAssetSelection, treeState, userEvent, vi, waitFor, within } from "./appTestHarness";

describe("App flow 08", () => {
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

      const descriptionField = await screen.findByLabelText(/split selected element into/i);
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
    const extractableState = {
      source: loadedState.source,
      elements: [
        {
          ...loadedState.elements[0],
          segmentationStatus: "mask_accepted",
        },
      ],
    };
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(extractableState);
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

      await user.click(screen.getByRole("button", { name: /re-extract/i }));

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
      expect(
        screen
          .getAllByAltText("Region 1 source crop")
          .some((image) =>
            /^\/api\/workspace\/assets\/elements\/element_001\/source_crop\.png\?cache=\d+$/.test(
              image.getAttribute("src") ?? "",
            ),
          ),
      ).toBe(true);
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
        return jsonResponse(exportReadyState);
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

      await user.click(screen.getByRole("button", { name: /download pack/i }));

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
        return jsonResponse(exportReadyState);
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

      await user.click(screen.getByRole("button", { name: /download pack/i }));
      expect(await screen.findByAltText("Export contact sheet preview")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /download pack/i }));

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
    const maskAcceptedState = {
      source: loadedState.source,
      elements: [
        {
          ...loadedState.elements[0],
          segmentationStatus: "mask_accepted",
        },
      ],
    };
    const shapeMaskState = {
      source: loadedState.source,
      elements: [
        {
          ...loadedState.elements[0],
          status: "extract_ready",
          mask: "elements/element_001/mask.png",
          segmentationStatus: "mask_accepted",
        },
      ],
    };
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(maskAcceptedState);
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
      expect(screen.getAllByText(/mask accepted/i).length).toBeGreaterThan(0);
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

      const bboxWidthField = await screen.findByLabelText(/bbox width/i);
      await user.clear(bboxWidthField);
      await user.type(bboxWidthField, "31");

      expect(within(screen.getByRole("banner")).getByRole("button", { name: /generate selected/i })).toBeDisabled();
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
});
