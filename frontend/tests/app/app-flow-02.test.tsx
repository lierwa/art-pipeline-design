import { App, assetSelectButton, completionState, confirmMergeDialog, createGestureEvent, createdChildElement, createdManualElement, describe, detectedElement, detectedState, drawRectangle, dragSortableAssetTreeItem, duplicateMergeNameState, expect, exportReadyState, exportSummary, extractedState, extractMergedState, fireEvent, installFetchMock, it, jsonResponse, legacyStatusRejectedState, loadedState, loadedStateWithoutElements, mergeSourceState, mergedState, mockElementRect, mockRect, openAssetContextMenu, overlappingMergeState, partiallyReviewedState, persistedWorkspaceState, pipelineStage, rejectedTreeState, render, repairCompleteState, repairPendingState, screen, setCanvasRect, splitState, toggleAssetSelection, treeState, userEvent, vi, waitFor, within } from "./appTestHarness";

describe("App flow 02", () => {
  const workflowState = (stage: "upload" | "detect" | "mask" | "generate") => ({
    stage,
    generateSelection: {},
    stageSnapshots: {},
    taskIds: {
      sam2MaskBatch: null,
      codexFinalBatches: [],
    },
    lastExportSummary: null,
  });

  it("uses the Detect stage CTA to create a SAM2 mask batch", async () => {
    const user = userEvent.setup();
    const maskWorkflow = {
      ...workflowState("mask"),
      generateSelection: Object.fromEntries(detectedState.elements.map((element) => [element.id, true])),
      taskIds: {
        sam2MaskBatch: "task_sam2",
        codexFinalBatches: [],
      },
    };
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(detectedState);
      }

      if (String(input).startsWith("/api/workspace/workflow") && (!init || init.method === "GET")) {
        return jsonResponse(workflowState("detect"));
      }

      if (input === "/api/workspace/stage/mask" && init?.method === "POST") {
        return jsonResponse({
          state: detectedState,
          workflow: maskWorkflow,
          task: {
            taskId: "task_sam2",
            type: "sam2_mask_batch",
            status: "queued",
            createdAt: "2026-06-21T00:00:00Z",
            updatedAt: "2026-06-21T00:00:00Z",
            total: detectedState.elements.length,
            done: 0,
            failed: 0,
            skipped: 0,
            items: detectedState.elements.map((element) => ({
              elementId: element.id,
              name: element.name,
              status: "queued",
              message: "",
              artifactPaths: {},
            })),
          },
        });
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      const topAppBar = await screen.findByRole("banner");
      const generateMasksButton = await within(topAppBar).findByRole("button", { name: /generate masks/i });
      expect(generateMasksButton).toBeEnabled();
      expect(within(topAppBar).queryByRole("button", { name: /redo detection/i })).not.toBeInTheDocument();
      expect(within(topAppBar).queryByRole("button", { name: /use detected assets/i })).not.toBeInTheDocument();
      expect(within(topAppBar).queryByRole("button", { name: /export asset pack/i })).not.toBeInTheDocument();

      await user.click(generateMasksButton);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/workspace/stage/mask",
        expect.objectContaining({ method: "POST" }),
      );
      expect(await screen.findByRole("heading", { name: /sam2 mask batch/i })).toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("uses Back Step to return from Detect to Upload without mutating element state locally", async () => {
    const user = userEvent.setup();
    const uploadState = {
      source: detectedState.source,
      detectionVocabulary: detectedState.detectionVocabulary,
      elements: [],
    };
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(detectedState);
      }

      if (String(input).startsWith("/api/workspace/workflow") && (!init || init.method === "GET")) {
        return jsonResponse(workflowState("detect"));
      }

      if (input === "/api/workspace/stage/back" && init?.method === "POST") {
        return jsonResponse({
          state: uploadState,
          workflow: workflowState("upload"),
        });
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      const pipelineRail = await screen.findByRole("navigation", { name: /pipeline stages/i });
      const backStep = within(pipelineRail).getByRole("button", { name: /back step/i });
      await waitFor(() => {
        expect(backStep).toBeEnabled();
      });

      await user.click(backStep);

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith(
          "/api/workspace/stage/back",
          expect.objectContaining({ method: "POST" }),
        );
      });
      expect(await screen.findByRole("button", { name: /run detection/i })).toBeEnabled();
    } finally {
      restoreFetch();
    }
  });

  it.each([
    {
      label: "mask to detect",
      initialWorkflow: workflowState("mask"),
      restoredWorkflow: workflowState("detect"),
      state: detectedState,
      nextAction: /generate masks/i,
    },
    {
      label: "generate to mask",
      initialWorkflow: workflowState("generate"),
      restoredWorkflow: workflowState("mask"),
      state: loadedState,
      nextAction: /^generate$/i,
    },
  ])("uses Back Step to restore the previous workflow stage: $label", async ({
    state,
    initialWorkflow,
    restoredWorkflow,
    nextAction,
  }) => {
    const user = userEvent.setup();
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(state);
      }

      if (String(input).startsWith("/api/workspace/workflow") && (!init || init.method === "GET")) {
        return jsonResponse(initialWorkflow);
      }

      if (input === "/api/workspace/stage/back" && init?.method === "POST") {
        return jsonResponse({
          state,
          workflow: restoredWorkflow,
        });
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      const pipelineRail = await screen.findByRole("navigation", { name: /pipeline stages/i });
      await user.click(within(pipelineRail).getByRole("button", { name: /back step/i }));

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith(
          "/api/workspace/stage/back",
          expect.objectContaining({ method: "POST" }),
        );
      });
      expect(within(screen.getByRole("banner")).getByRole("button", { name: nextAction })).toBeEnabled();
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
      await screen.findByTestId("canvas-artboard");

      const canvasArea = screen.getByTestId("canvas-area");
      const canvasToolbar = screen.getByRole("toolbar", { name: /canvas tools/i });

      const smallWheel = new WheelEvent("wheel", { deltaY: -20, cancelable: true });
      fireEvent(canvasArea, smallWheel);
      expect(smallWheel.defaultPrevented).toBe(true);
      expect(within(canvasToolbar).getByText("81%")).toBeInTheDocument();

      const pinchWheel = new WheelEvent("wheel", { deltaY: -100, ctrlKey: true, cancelable: true });
      fireEvent(canvasArea, pinchWheel);
      expect(pinchWheel.defaultPrevented).toBe(true);
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

  it("handles native pinch gestures on the canvas without browser page zoom", async () => {
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(loadedState);
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);
      await waitFor(() => {
        expect(within(screen.getByRole("toolbar", { name: /canvas tools/i })).getByText("80%")).toBeInTheDocument();
      });

      const canvasArea = screen.getByTestId("canvas-area");
      const gestureStart = createGestureEvent("gesturestart", 1);
      const gestureChange = createGestureEvent("gesturechange", 1.1);

      fireEvent(canvasArea, gestureStart);
      fireEvent(canvasArea, gestureChange);

      expect(gestureStart.defaultPrevented).toBe(true);
      expect(gestureChange.defaultPrevented).toBe(true);
      expect(within(screen.getByRole("toolbar", { name: /canvas tools/i })).getByText("86%")).toBeInTheDocument();
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
      await screen.findByTestId("canvas-artboard");

      const contextMenu = openAssetContextMenu();
      await user.click(within(contextMenu).getByRole("menuitem", { name: /^edit box$/i }));

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
});
