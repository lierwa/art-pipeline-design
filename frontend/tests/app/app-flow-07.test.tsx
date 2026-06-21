import { App, assetSelectButton, completionState, confirmMergeDialog, createGestureEvent, createdChildElement, createdManualElement, describe, detectedElement, detectedState, drawRectangle, dragSortableAssetTreeItem, duplicateMergeNameState, expect, exportReadyState, exportSummary, extractedState, extractMergedState, fireEvent, installFetchMock, it, jsonResponse, legacyStatusRejectedState, loadedState, loadedStateWithoutElements, mergeSourceState, mergedState, mockElementRect, mockRect, openAssetContextMenu, overlappingMergeState, partiallyReviewedState, persistedWorkspaceState, pipelineStage, rejectedTreeState, render, repairCompleteState, repairPendingState, screen, setCanvasRect, splitState, toggleAssetSelection, treeState, userEvent, vi, waitFor, within } from "./appTestHarness";

describe("App flow 07", () => {
  it("adds a numeric suffix to default merge names when the joined label already exists", async () => {
    const user = userEvent.setup();
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(duplicateMergeNameState);
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      await user.click(screen.getByRole("button", { name: /select bottle$/i }));
      fireEvent.click(screen.getByRole("button", { name: /select plant$/i }), { shiftKey: true });
      await user.click(screen.getByRole("button", { name: /^merge$/i }));

      const dialog = await screen.findByRole("dialog", { name: /name merged asset/i });
      expect(within(dialog).getByRole("textbox", { name: /merged asset name/i })).toHaveValue(
        "bottle + plant 2",
      );
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

      toggleAssetSelection(/select region 2/i);
      const bboxWidthField = await screen.findByLabelText(/bbox width/i);
      await user.clear(bboxWidthField);
      await user.type(bboxWidthField, "34");

      const contextMenu = openAssetContextMenu({ x: 270, y: 130 });
      const mergeButton = within(contextMenu).getByRole("menuitem", { name: /merge selected/i });
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

      expect(screen.queryByRole("button", { name: /select region 2/i })).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/merge label/i)).not.toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("keeps single selection from enabling merge until another asset is added", async () => {
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

      await user.click(screen.getByRole("button", { name: /select region 2/i }));

      expect(screen.getByLabelText(/element name/i)).toHaveValue("Region 2");
      expect(screen.getByRole("button", { name: /^merge$/i })).toBeDisabled();
      expect(screen.getByRole("treeitem", { name: /region 1/i })).toHaveAttribute("aria-selected", "false");
      expect(screen.getByRole("treeitem", { name: /region 2/i })).toHaveAttribute("aria-selected", "true");

      toggleAssetSelection(/select region 1/i);

      expect(screen.getByRole("button", { name: /^merge$/i })).toBeEnabled();
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
            segmentationStatus: "mask_accepted",
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

      await user.click(screen.getByRole("button", { name: /re-extract/i }));

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
      expect(screen.queryByRole("button", { name: /select region 1/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /select region 2/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /hide region 1/i })).not.toBeInTheDocument();
      expect(screen.queryByTestId("overlay-label-element_001")).not.toBeInTheDocument();
      expect(screen.queryByTestId("overlay-label-element_002")).not.toBeInTheDocument();
      expect(screen.getByTestId("overlay-region-element_003")).toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("uses compact single-line label placement for narrow edge assets", async () => {
    const edgeLabelState = {
      source: loadedState.source,
      elements: [
        {
          ...loadedState.elements[0],
          id: "element_edge",
          name: "very long bottle label",
          label: "very long bottle label",
          bbox: { x: 100, y: 2, w: 8, h: 18 },
          canvas: { x: 100, y: 2, w: 8, h: 18 },
        },
      ],
    };
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(edgeLabelState);
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      const label = await screen.findByTestId("overlay-label-element_edge");
      expect(label).toHaveClass("overlay-label");
      expect(label).toHaveClass("is-compact");
      expect(label).toHaveClass("is-align-right");
      expect(label).toHaveClass("is-below");
      expect(label).toHaveTextContent("very long bottle label");
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
      expect(screen.getByText("Split source")).toBeInTheDocument();
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
      await screen.findByTestId("canvas-artboard");

      const contextMenu = openAssetContextMenu();
      await user.click(within(contextMenu).getByRole("menuitem", { name: /^accept$/i }));
      expect(await screen.findAllByText(/element accepted\./i)).toHaveLength(2);

      const canvasToolbar = screen.getByRole("toolbar", { name: /canvas tools/i });
      const undoButton = within(canvasToolbar).getByRole("button", { name: /undo/i });
      const redoButton = within(canvasToolbar).getByRole("button", { name: /redo/i });
      expect(undoButton).toBeEnabled();
      expect(redoButton).toBeDisabled();

      await user.click(undoButton);
      expect(await screen.findAllByText(/undone\./i)).toHaveLength(2);
      expect(screen.getAllByText("Detected").length).toBeGreaterThan(0);
      expect(redoButton).toBeEnabled();

      fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
      await waitFor(() => {
        expect(screen.getAllByText(/redone\./i)).toHaveLength(2);
      });
      expect(screen.getAllByText("Ready for mask").length).toBeGreaterThan(0);

      expect(savedStates).toEqual([
        persistedWorkspaceState(acceptedState),
        persistedWorkspaceState(detectedState),
        persistedWorkspaceState(acceptedState),
      ]);
    } finally {
      restoreFetch();
    }
  });

  it("undoes and redoes auto-saved Segment mask edits from workspace history", async () => {
    const segmentMaskState = {
      source: loadedState.source,
      elements: [
        {
          ...loadedState.elements[0],
          status: "accepted",
          mask: "elements/element_001/sam2_edge/mask.png",
          segmentationStatus: "mask_suggested",
          sourceProvider: "sam2",
          repairStatus: "not_required",
          exportStatus: "not_ready",
        },
      ],
    };
    const editedSegmentMaskState = {
      ...segmentMaskState,
      elements: [
        {
          ...segmentMaskState.elements[0],
          mask: "elements/element_001/sam2_edge/mask-edited.png",
          segmentationStatus: "mask_editing" as const,
        },
      ],
    };
    const savedStates: unknown[] = [];
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(segmentMaskState);
      }

      if (input === "/api/workspace/elements/element_001/segment/mask" && init?.method === "PATCH") {
        return jsonResponse({
          element: editedSegmentMaskState.elements[0],
          state: editedSegmentMaskState,
        });
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

      const sourceFrame = await screen.findByTestId("segment-source-frame");
      await userEvent.click(within(sourceFrame).getByRole("button", { name: /brush add/i }));
      mockElementRect(sourceFrame, { left: 10, top: 20, width: 460, height: 480 });
      fireEvent.pointerDown(sourceFrame, { clientX: 210, clientY: 240, pointerId: 25 });
      fireEvent.pointerUp(sourceFrame, { clientX: 210, clientY: 240, pointerId: 25 });

      expect(within(sourceFrame).getByTestId("segment-draft-mask-overlay")).toBeInTheDocument();
      const canvasToolbar = screen.getByRole("toolbar", { name: /canvas tools/i });
      await waitFor(() => {
        expect(within(canvasToolbar).getByRole("button", { name: /undo/i })).toBeEnabled();
      });
      expect(screen.getAllByText(/mask edit applied\./i).length).toBeGreaterThan(0);

      fireEvent.keyDown(window, { key: "z", ctrlKey: true });

      await waitFor(() => {
        expect(within(sourceFrame).queryByTestId("segment-draft-mask-overlay")).not.toBeInTheDocument();
      });
      expect(screen.getAllByText(/undone\./i).length).toBeGreaterThan(0);

      fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });

      await waitFor(() => {
        expect(screen.getAllByText(/redone\./i).length).toBeGreaterThan(0);
      });
      expect(savedStates).toEqual([
        persistedWorkspaceState(segmentMaskState),
        persistedWorkspaceState(editedSegmentMaskState),
      ]);
    } finally {
      restoreFetch();
    }
  });
});
