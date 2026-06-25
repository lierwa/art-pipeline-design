import { App, assetSelectButton, completionState, confirmMergeDialog, createGestureEvent, createdChildElement, createdManualElement, describe, detectedElement, detectedState, drawRectangle, duplicateMergeNameState, expect, exportReadyState, exportSummary, extractedState, extractMergedState, fireEvent, installFetchMock, it, jsonResponse, legacyStatusRejectedState, loadedState, loadedStateWithoutElements, mergeSourceState, mergedState, mockElementRect, mockRect, openAssetContextMenu, overlappingMergeState, partiallyReviewedState, persistedWorkspaceState, pipelineStage, rejectedTreeState, render, repairCompleteState, repairPendingState, screen, setCanvasRect, splitState, toggleAssetSelection, treeState, userEvent, vi, waitFor, within } from "./appTestHarness";

describe("App flow 04", () => {
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

      setCanvasRect(await screen.findByTestId("canvas-artboard"));
      const surface = screen.getByTestId("canvas-drawing-surface");
      fireEvent.mouseDown(surface, { clientX: 270, clientY: 130, shiftKey: true, button: 0 });

      expect(assetSelectButton(/select region 1/i)).toHaveAttribute("aria-pressed", "true");
      expect(assetSelectButton(/select region 2/i)).toHaveAttribute("aria-pressed", "true");
      const contextMenu = openAssetContextMenu();
      expect(within(contextMenu).getByRole("menuitem", { name: /merge selected/i })).toBeEnabled();
    } finally {
      restoreFetch();
    }
  });

  it("shift-selects the smaller overlapped box instead of the enclosing box", async () => {
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(overlappingMergeState);
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      setCanvasRect(await screen.findByTestId("canvas-artboard"));
      const surface = screen.getByTestId("canvas-drawing-surface");
      fireEvent.mouseDown(surface, { clientX: 250, clientY: 250, shiftKey: true, button: 0 });

      expect(assetSelectButton(/select basket/i)).toHaveAttribute("aria-pressed", "true");
      expect(assetSelectButton(/select towel/i)).toHaveAttribute("aria-pressed", "true");
      expect(within(openAssetContextMenu({ x: 250, y: 250 })).getByRole(
        "menuitem",
        { name: /merge selected/i },
      )).toBeEnabled();
    } finally {
      restoreFetch();
    }
  });

  it("clears selection when clicking empty canvas space in select mode", async () => {
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(loadedState);
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByTestId("canvas-artboard");

      expect(assetSelectButton(/select region 1/i)).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByTestId("overlay-region-element_001")).toHaveClass("is-selected");

      setCanvasRect(screen.getByTestId("canvas-artboard"));
      fireEvent.mouseDown(screen.getByTestId("canvas-drawing-surface"), {
        clientX: 590,
        clientY: 440,
        button: 0,
      });

      expect(assetSelectButton(/select region 1/i)).toHaveAttribute("aria-pressed", "false");
      expect(screen.getByTestId("overlay-region-element_001")).not.toHaveClass("is-selected");
      expect(screen.queryByLabelText(/element name/i)).not.toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("only pans the canvas for asset-tree focus, not direct canvas selection", async () => {
    const user = userEvent.setup();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(mergeSourceState);
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);
      scrollIntoView.mockClear();

      const artboard = await screen.findByTestId("canvas-artboard");
      const stage = screen.getByTestId("canvas-area").querySelector(".canvas-stage");
      const viewport = screen.getByTestId("canvas-area").querySelector<HTMLElement>(".canvas-pan-viewport");
      if (!stage || !viewport) {
        throw new Error("Canvas stage was not rendered.");
      }

      mockRect(artboard, { left: 0, top: 0, width: 600, height: 450 });
      mockRect(stage, { left: 0, top: 0, width: 300, height: 300 });

      fireEvent.mouseDown(screen.getByTestId("canvas-drawing-surface"), {
        clientX: 270,
        clientY: 130,
        button: 0,
      });
      expect(assetSelectButton(/select region 2/i)).toHaveAttribute("aria-pressed", "true");
      expect(scrollIntoView).toHaveBeenCalledWith(
        expect.objectContaining({ block: "nearest", inline: "nearest" }),
      );
      expect(viewport.style.transform).toBe("translate(0px, 0px) scale(1)");

      await user.click(assetSelectButton(/select region 2/i));

      await waitFor(() => {
        expect(viewport).toHaveClass("is-focus-panning");
        expect(viewport.style.transform).toContain("translate(-");
      });
    } finally {
      if (originalScrollIntoView) {
        HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
      } else {
        delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
      }
      restoreFetch();
    }
  });

  it("recenters a fully visible artboard instead of over-panning to an asset center", async () => {
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

      const artboard = await screen.findByTestId("canvas-artboard");
      const stage = screen.getByTestId("canvas-area").querySelector(".canvas-stage");
      const viewport = screen.getByTestId("canvas-area").querySelector<HTMLElement>(".canvas-pan-viewport");
      if (!stage || !viewport) {
        throw new Error("Canvas stage was not rendered.");
      }

      mockRect(artboard, { left: 500, top: 400, width: 600, height: 450 });
      mockRect(stage, { left: 0, top: 0, width: 900, height: 700 });

      await user.click(assetSelectButton(/select region 1/i));

      await waitFor(() => {
        expect(viewport.style.transform).toBe("translate(-350px, -376px) scale(1)");
      });
    } finally {
      restoreFetch();
    }
  });

  it("merges an overlapped asset with the current merge selection from the context menu", async () => {
    const user = userEvent.setup();
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(overlappingMergeState);
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
      await screen.findByTestId("canvas-artboard");

      openAssetContextMenu({ x: 100, y: 100 });
      const contextMenu = openAssetContextMenu({ x: 250, y: 250 });
      expect(within(contextMenu).getByText("towel")).toBeInTheDocument();
      await user.click(within(contextMenu).getByRole("menuitem", { name: /merge with selected/i }));
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
      // WHY: 父子展开由 AssetTreePanel 的元素树 effect 收敛，测试应等待业务可见状态而不是依赖前序测试残留。
      expect(parentItem).toHaveAttribute("aria-expanded", "true");
      expect(await within(assetTree).findByRole("treeitem", { name: /plant/i })).toHaveAttribute("aria-level", "2");
      expect(screen.queryByText("old towel")).not.toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("marks active asset rows as draggable for parent editing", async () => {
    const looseChild = {
      ...detectedElement,
      id: "element_005",
      name: "bottle + plant 2",
      label: "bottle + plant 2",
      status: "accepted",
      bbox: { x: 30, y: 20, w: 24, h: 24 },
      canvas: { x: 30, y: 20, w: 24, h: 24 },
      parentId: null,
      assetRole: "sticker",
      removeFromParent: null,
      thumbnail: "elements/element_005/thumb.png",
    };
    const initialState = {
      ...treeState,
      elements: [...treeState.elements, looseChild],
    };
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(initialState);
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      const assetTree = await screen.findByRole("tree", { name: /asset tree/i });
      const childItem = within(assetTree).getByRole("treeitem", { name: /bottle \+ plant 2/i });
      expect(childItem.querySelector(".asset-tree-row")).toHaveAttribute("draggable", "true");
    } finally {
      restoreFetch();
    }
  });

  it("keeps root rows draggable for Arborist reorder", async () => {
    const looseRoot = {
      ...detectedElement,
      id: "element_006",
      name: "towel",
      label: "towel",
      status: "accepted",
      bbox: { x: 56, y: 24, w: 18, h: 20 },
      canvas: { x: 56, y: 24, w: 18, h: 20 },
      parentId: null,
      assetRole: "sticker",
      removeFromParent: null,
      thumbnail: "elements/element_006/thumb.png",
    };
    const initialState = {
      ...treeState,
      elements: [looseRoot, ...treeState.elements],
    };
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(initialState);
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      const assetTree = await screen.findByRole("tree", { name: /asset tree/i });
      const towelItem = within(assetTree).getByRole("treeitem", { name: /towel/i });
      expect(towelItem.querySelector(".asset-tree-row")).toHaveAttribute("draggable", "true");
    } finally {
      restoreFetch();
    }
  });

  it("shows single-candidate actions from the canvas context menu", async () => {
    const user = userEvent.setup();
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(treeState);
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      await user.click(await screen.findByRole("button", { name: /select cabinet/i }));
      expect(screen.queryByRole("region", { name: /selection actions/i })).not.toBeInTheDocument();

      const contextMenu = openAssetContextMenu({ x: 250, y: 150 });
      expect(within(contextMenu).getByText("cabinet")).toBeInTheDocument();
      expect(within(contextMenu).getByRole("menuitem", { name: /^edit box$/i })).toBeInTheDocument();
      expect(within(contextMenu).getByRole("menuitem", { name: /rename/i })).toBeInTheDocument();
      expect(within(contextMenu).getByRole("menuitem", { name: /^add child$/i })).toBeInTheDocument();
      expect(within(contextMenu).queryByRole("menuitem", { name: /run detect inside/i })).not.toBeInTheDocument();
      expect(within(contextMenu).getByRole("menuitem", { name: /^split asset$/i })).toBeInTheDocument();
      expect(within(contextMenu).getByRole("menuitem", { name: /^accept$/i })).toBeInTheDocument();
      expect(within(contextMenu).getByRole("menuitem", { name: /^reject$/i })).toBeInTheDocument();
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

      await screen.findByText(/original\.png - 120 x 90/i);
      expect(screen.queryByRole("region", { name: /selection actions/i })).not.toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: /run detection/i })).toHaveLength(1);
    } finally {
      restoreFetch();
    }
  });
});
