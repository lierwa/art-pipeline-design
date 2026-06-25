import { App, assetSelectButton, completionState, confirmMergeDialog, createGestureEvent, createdChildElement, createdManualElement, describe, detectedElement, detectedState, drawRectangle, duplicateMergeNameState, expect, exportReadyState, exportSummary, extractedState, extractMergedState, fireEvent, installFetchMock, it, jsonResponse, legacyStatusRejectedState, loadedState, loadedStateWithoutElements, mergeSourceState, mergedState, mockElementRect, mockRect, openAssetContextMenu, overlappingMergeState, partiallyReviewedState, persistedWorkspaceState, pipelineStage, rejectedTreeState, render, repairCompleteState, repairPendingState, screen, setCanvasRect, splitState, toggleAssetSelection, treeState, userEvent, vi, waitFor, within } from "./appTestHarness";

describe("App flow 05", () => {
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
      await user.click(await screen.findByRole("button", { name: /select rejected vase/i }));
      expect(screen.getByText("Rejected")).toBeInTheDocument();

      await user.click(screen.getByRole("checkbox", { name: /show rejected/i }));

      expect(screen.queryByText("Rejected Vase")).not.toBeInTheDocument();
      expect(screen.queryByText("Rejected")).not.toBeInTheDocument();
      expect(screen.queryByRole("region", { name: /selection actions/i })).not.toBeInTheDocument();
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
      expect(screen.queryByRole("button", { name: /select legacy reject/i })).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/element name/i)).not.toBeInTheDocument();
      expect(screen.queryByRole("region", { name: /selection actions/i })).not.toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("merges multiple selected assets from the canvas context menu", async () => {
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

      toggleAssetSelection(/select region 2/i);

      const contextMenu = openAssetContextMenu();
      await user.click(within(contextMenu).getByRole("menuitem", { name: /merge selected/i }));
      await confirmMergeDialog(user, "Fixture group");

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
      expect(screen.getAllByText("Detected").length).toBeGreaterThan(0);
      expect(screen.getByTestId("overlay-label-element_010")).toHaveTextContent("cabinet");
    } finally {
      restoreFetch();
    }
  });

  it("locks model detection once a workspace already has review or extraction state", async () => {
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

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByAltText("Region 1 missing mask overlay");
      expect(screen.getByText(/QA pending/i)).toBeInTheDocument();

      const topAppBar = screen.getByRole("banner");
      expect(within(topAppBar).getByRole("button", { name: /^generate$/i })).toBeEnabled();
      expect(within(topAppBar).queryByRole("button", { name: /create repair task/i })).not.toBeInTheDocument();
      expect(globalThis.fetch).not.toHaveBeenCalledWith(
        "/api/workspace/detect",
        expect.objectContaining({ method: "POST" }),
      );
    } finally {
      restoreFetch();
    }
  });

  it("allows model-detected candidates to be rejected from the canvas context menu", async () => {
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
        expect(init.body).toBe(JSON.stringify(persistedWorkspaceState(rejectedState)));
        return jsonResponse(rejectedState);
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByAltText("cabinet thumbnail");
      // WHY: 新布局中资产面板可早于 sourceUrl effect 驱动画布提交，拒绝行为仍应从 canvas menu 覆盖。
      await screen.findByTestId("canvas-artboard");

      const contextMenu = openAssetContextMenu();
      await user.click(within(contextMenu).getByRole("menuitem", { name: /^reject$/i }));

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
      expect(screen.getByText("Rejected")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /hide cabinet/i })).not.toBeInTheDocument();
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

  it("does not open the segment drawer for a newly created manual element", async () => {
    const user = userEvent.setup();
    const manualSoapElement = {
      ...createdManualElement,
      name: "soap",
      label: "soap",
      sourceProvider: "manual",
      sourcePrompt: "soap",
    };
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(loadedStateWithoutElements);
      }

      if (input === "/api/workspace/elements" && init?.method === "POST") {
        return jsonResponse({
          element: manualSoapElement,
          state: {
            source: loadedState.source,
            elements: [manualSoapElement],
          },
        });
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      await user.click(screen.getByRole("button", { name: /draw element/i }));
      await drawRectangle(screen.getByTestId("canvas-drawing-surface"), { x: 100, y: 90 }, { x: 220, y: 190 });

      fireEvent.change(screen.getByLabelText(/new element name/i), { target: { value: "soap" } });
      await user.click(screen.getByRole("button", { name: /create element/i }));

      await screen.findByAltText("soap thumbnail");
      expect(screen.getByTestId("overlay-label-element_002")).toHaveTextContent("soap");
      expect(screen.queryByRole("dialog", { name: /segment/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /suggest mask/i })).not.toBeInTheDocument();
      expect(within(screen.getByRole("banner")).getByRole("button", { name: /run detection/i })).toBeDisabled();
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
});
