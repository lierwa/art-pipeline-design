import { App, assetSelectButton, completionState, confirmMergeDialog, createGestureEvent, createdChildElement, createdManualElement, describe, detectedElement, detectedState, drawRectangle, duplicateMergeNameState, expect, exportReadyState, exportSummary, extractedState, extractMergedState, fireEvent, installFetchMock, it, jsonResponse, legacyStatusRejectedState, loadedState, loadedStateWithoutElements, mergeSourceState, mergedState, mockElementRect, mockRect, openAssetContextMenu, overlappingMergeState, partiallyReviewedState, persistedWorkspaceState, pipelineStage, rejectedTreeState, render, repairCompleteState, repairPendingState, screen, setCanvasRect, splitState, toggleAssetSelection, treeState, userEvent, vi, waitFor, within } from "./appTestHarness";

describe("App flow 03", () => {
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

      const canvasToolbar = screen.getByRole("toolbar", { name: /canvas tools/i });
      await user.click(within(canvasToolbar).getByRole("button", { name: /^edit box$/i }));
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
      await user.click(screen.getByRole("button", { name: /apply box edit/i }));

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

      const canvasToolbar = screen.getByRole("toolbar", { name: /canvas tools/i });
      await user.click(within(canvasToolbar).getByRole("button", { name: /^edit box$/i }));
      const editRegion = await screen.findByTestId("canvas-edit-region-element_001");
      editRegion.focus();
      fireEvent.keyDown(editRegion, { key: "ArrowRight", shiftKey: true });

      expect(screen.getByRole("group", { name: /confirm region 1 box edit/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /apply box edit/i })).toBeEnabled();
      await user.click(screen.getByRole("button", { name: /cancel box edit/i }));

      expect(patchRequest).toBeNull();
      expect(screen.queryByRole("group", { name: /confirm region 1 box edit/i })).not.toBeInTheDocument();

      await user.click(within(canvasToolbar).getByRole("button", { name: /^edit box$/i }));
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

      const canvasToolbar = screen.getByRole("toolbar", { name: /canvas tools/i });
      await user.click(within(canvasToolbar).getByRole("button", { name: /^edit box$/i }));
      const editRegion = await screen.findByTestId("canvas-edit-region-element_001");
      editRegion.focus();
      fireEvent.keyDown(editRegion, { key: "ArrowRight", shiftKey: true });

      await user.click(screen.getByRole("button", { name: /apply box edit/i }));

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

      const canvasToolbar = screen.getByRole("toolbar", { name: /canvas tools/i });
      await user.click(within(canvasToolbar).getByRole("button", { name: /^edit box$/i }));
      const resizeHandle = await screen.findByTestId("resize-handle-element_001-se");
      resizeHandle.focus();
      fireEvent.keyDown(resizeHandle, { key: "ArrowRight", shiftKey: true });
      fireEvent.keyDown(resizeHandle, { key: "ArrowDown", shiftKey: true });

      await user.click(screen.getByRole("button", { name: /apply box edit/i }));

      await waitFor(() => {
        expect(patchRequest).toEqual({
          bbox: { x: 12, y: 16, w: 40, h: 42 },
        });
      });
    } finally {
      restoreFetch();
    }
  });

  it("renames the selected asset from the canvas context menu", async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("Main tub");
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

      const contextMenu = openAssetContextMenu();
      await user.click(within(contextMenu).getByRole("menuitem", { name: /rename/i }));

      await waitFor(() => {
        expect(patchRequest).toEqual({ label: "Main tub" });
      });
      expect(promptSpy).toHaveBeenCalledWith("Rename asset", "Region 1");
      expect(await screen.findAllByText(/element details updated/i)).toHaveLength(2);
    } finally {
      promptSpy.mockRestore();
      restoreFetch();
    }
  });

  it("renames an asset inline from the canvas label", async () => {
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

      // WHY: overlay label 依赖画布坐标投影完成，完整套件并行运行时需要等待真实可点击标签出现。
      const overlayLabel = await screen.findByTestId("overlay-label-element_001");
      await user.click(overlayLabel);
      const inlineName = await screen.findByLabelText(/rename region 1/i);
      fireEvent.change(inlineName, { target: { value: "Main tub" } });
      fireEvent.blur(inlineName);

      await waitFor(() => {
        expect(patchRequest).toEqual({ label: "Main tub" });
      });
      await waitFor(() => {
        expect(screen.getByTestId("overlay-label-element_001")).toHaveTextContent("Main tub");
      });
    } finally {
      restoreFetch();
    }
  });

  it("starts mask generation for detected assets from the stage action", async () => {
    const user = userEvent.setup();
    let maskStageStarted = false;
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(detectedState);
      }

      if (String(input).startsWith("/api/workspace/stage/mask") && init?.method === "POST") {
        maskStageStarted = true;
        return jsonResponse({
          state: detectedState,
          workflow: {
            stage: "mask",
            generateSelection: Object.fromEntries(detectedState.elements.map((element) => [element.id, true])),
            stageSnapshots: {},
            taskIds: {
              sam2MaskBatch: "task_202606211200000000_sam2-mask-batch",
              codexFinalBatches: [],
            },
            lastExportSummary: null,
          },
          task: {
            taskId: "task_202606211200000000_sam2-mask-batch",
            type: "sam2_mask_batch",
            status: "queued",
            createdAt: "2026-06-21T12:00:00+00:00",
            updatedAt: "2026-06-21T12:00:00+00:00",
            total: detectedState.elements.length,
            done: 0,
            failed: 0,
            skipped: 0,
            items: detectedState.elements.map((element) => ({
              elementId: element.id,
              name: element.name,
              status: "queued",
              message: "Waiting for SAM2 mask.",
              startedAt: null,
              finishedAt: null,
              artifactPaths: {},
            })),
          },
        });
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByAltText("cabinet thumbnail");

      expect(screen.queryByRole("button", { name: /use detected assets/i })).not.toBeInTheDocument();
      await user.click(await screen.findByRole("button", { name: /generate masks/i }));

      await waitFor(() => {
        expect(maskStageStarted).toBe(true);
      });
      expect(await screen.findByRole("region", { name: /workspace tasks/i })).toHaveTextContent(/SAM2 mask batch/i);
      const pipelineRail = screen.getByRole("navigation", { name: /pipeline stages/i });
      expect(within(pipelineRail).getByText("Mask").closest("li")).toHaveClass("is-active");
    } finally {
      restoreFetch();
    }
  });

  it("renders a merge preview outline for multiple selected assets", async () => {
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

      toggleAssetSelection(/select region 2/i);

      expect(screen.getByTestId("merge-preview-outline")).toHaveClass("overlay-box-merge-preview");

      toggleAssetSelection(/select region 2/i);

      expect(screen.queryByTestId("merge-preview-outline")).not.toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });
});
