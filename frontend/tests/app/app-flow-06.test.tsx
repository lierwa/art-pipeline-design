import { App, assetSelectButton, completionState, confirmMergeDialog, createGestureEvent, createdChildElement, createdManualElement, describe, detectedElement, detectedState, drawRectangle, dragSortableAssetTreeItem, duplicateMergeNameState, expect, exportReadyState, exportSummary, extractedState, extractMergedState, fireEvent, installFetchMock, it, jsonResponse, legacyStatusRejectedState, loadedState, loadedStateWithoutElements, mergeSourceState, mergedState, mockElementRect, mockRect, openAssetContextMenu, overlappingMergeState, partiallyReviewedState, persistedWorkspaceState, pipelineStage, rejectedTreeState, render, repairCompleteState, repairPendingState, screen, setCanvasRect, splitState, toggleAssetSelection, treeState, userEvent, vi, waitFor, within } from "./appTestHarness";

describe("App flow 06", () => {
  it("starts add-child as a named draft instead of creating a generic child immediately", async () => {
    const user = userEvent.setup();
    const childState = {
      source: loadedState.source,
      elements: [...loadedState.elements, createdChildElement],
    };
    let childPostBody: unknown = null;
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(loadedState);
      }

      if (input === "/api/workspace/elements/element_001/children" && init?.method === "POST") {
        childPostBody = JSON.parse(String(init.body));
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
      await screen.findByTestId("canvas-artboard");

      const contextMenu = openAssetContextMenu();
      await user.click(within(contextMenu).getByRole("menuitem", { name: /add child/i }));

      const nameField = screen.getByLabelText(/new element name/i);
      expect(nameField).toHaveValue("Region 1 detail");
      expect(childPostBody).toBeNull();

      fireEvent.change(nameField, { target: { value: "Shelf Handle" } });
      await user.click(screen.getByRole("button", { name: /create child/i }));

      await waitFor(() => {
        expect(childPostBody).toEqual({
          label: "Shelf Handle",
          bbox: { x: 22, y: 27, w: 10, h: 10 },
        });
      });
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

      const nameField = await screen.findByLabelText(/element name/i);
      const bboxWidthField = await screen.findByLabelText(/bbox width/i);
      const visibilityField = await screen.findByRole("checkbox", { name: /element visible/i });

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

      await user.click(await screen.findByRole("checkbox", { name: /element visible/i }));
      await user.click(screen.getByRole("button", { name: /save element/i }));

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/workspace/elements/element_001",
        expect.objectContaining({ method: "PATCH" }),
      );
      expect(patchRequest).toEqual({ visible: false });
      expect(screen.getAllByText("Ready for mask").length).toBeGreaterThan(0);
      expect(screen.queryByRole("button", { name: /^extract$/i })).not.toBeInTheDocument();
      expect(within(screen.getByRole("banner")).queryByRole("button", { name: /suggest mask/i })).not.toBeInTheDocument();
      expect(within(screen.getByRole("banner")).getByRole("button", { name: /^generate$/i })).toBeDisabled();
    } finally {
      restoreFetch();
    }
  });

  it("lets the real inspector switch to removable child before choosing a parent", async () => {
    const user = userEvent.setup();
    const cabinetElement = {
      ...loadedState.elements[0],
      id: "element_001",
      name: "Cabinet",
      label: "Cabinet",
      assetRole: "parent",
      removeFromParent: null,
    };
    const stickerElement = {
      ...loadedState.elements[0],
      id: "element_002",
      name: "Sticker",
      label: "Sticker",
      assetRole: "sticker",
      removeFromParent: null,
      bbox: { x: 40, y: 20, w: 16, h: 18 },
      canvas: { x: 36, y: 18, w: 24, h: 24 },
      layer: 2,
      thumbnail: "elements/element_002/thumb.png",
    };
    const initialState = {
      source: loadedState.source,
      elements: [cabinetElement, stickerElement],
    };
    const pendingChildElement = {
      ...stickerElement,
      assetRole: "removable_child",
      removeFromParent: null,
    };
    const finalChildElement = {
      ...pendingChildElement,
      removeFromParent: "element_001",
    };
    const patchRequests: unknown[] = [];
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(initialState);
      }

      if (input === "/api/workspace/elements/element_002" && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        patchRequests.push(body);
        const element = body.removeFromParent === "element_001"
          ? finalChildElement
          : pendingChildElement;

        return jsonResponse({
          element,
          state: {
            source: loadedState.source,
            elements: [cabinetElement, element],
          },
        });
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);
      await user.click(screen.getByRole("button", { name: /select sticker$/i }));

      await user.selectOptions(screen.getByRole("combobox", { name: /asset role/i }), "removable_child");
      expect(await screen.findByRole("combobox", { name: /remove from parent/i })).toBeInTheDocument();
      expect(patchRequests[0]).toEqual({
        assetRole: "removable_child",
        removeFromParent: null,
      });

      await user.selectOptions(screen.getByRole("combobox", { name: /remove from parent/i }), "element_001");
      await waitFor(() => {
        expect(patchRequests[1]).toEqual({
          assetRole: "removable_child",
          removeFromParent: "element_001",
        });
      });
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

      const bboxWidthField = await screen.findByLabelText(/bbox width/i);
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

      const bboxWidthField = await screen.findByLabelText(/bbox width/i);
      fireEvent.change(bboxWidthField, { target: { value: "34" } });
      fireEvent.change(screen.getByLabelText(/element notes/i), { target: { value: "Needs legacy review" } });
      await user.click(screen.getByRole("button", { name: /save element/i }));

      await waitFor(() => {
        expect(statePuts).toBe(0);
        expect(patchRequests).toBe(0);
      });
      const toast = document.querySelector(".workflow-toast");
      expect(toast).toHaveTextContent(/state save failed\./i);
      expect(toast).toHaveTextContent(/save geometry or label changes separately from legacy fields\./i);
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

      const bboxWidthField = await screen.findByLabelText(/bbox width/i);
      fireEvent.change(bboxWidthField, { target: { value: "0" } });
      await user.click(screen.getByRole("button", { name: /save element/i }));

      await screen.findByText(/element element_001 bbox width\/height must be > 0\./i);
      const toast = document.querySelector(".workflow-toast");
      expect(toast).toHaveTextContent(/state save failed\./i);
      expect(toast).toHaveTextContent(/element element_001 bbox width\/height must be > 0\./i);
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

      expect(screen.getByRole("treeitem", { name: /region 1/i })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("treeitem", { name: /region 2/i })).toHaveAttribute("aria-selected", "false");
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
      expect(screen.getByTestId("overlay-label-element_003")).toHaveTextContent("Fixture group");
    } finally {
      restoreFetch();
    }
  });
});
