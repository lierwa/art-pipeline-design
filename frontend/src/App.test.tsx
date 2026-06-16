import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
      source: "auto_cv",
      notes: "",
      visible: true,
      confidence: 0.84,
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
      await user.clear(nameField);
      await user.type(nameField, "Manual Lamp");
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

  it("edits inspector fields for the selected element and persists them", async () => {
    const user = userEvent.setup();
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(loadedState);
      }

      if (input === "/api/workspace/state" && init?.method === "PUT") {
        return jsonResponse(JSON.parse(String(init.body)));
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/original\.png - 120 x 90/i);

      const nameField = screen.getByLabelText(/element name/i);
      const modeField = screen.getByLabelText(/element mode/i);
      const layerField = screen.getByLabelText(/element layer/i);
      const bboxWidthField = screen.getByLabelText(/bbox width/i);
      const notesField = screen.getByLabelText(/element notes/i);
      const visibilityField = screen.getByRole("checkbox", { name: /element visible/i });

      await user.clear(nameField);
      await user.type(nameField, "Hero Shelf");
      await user.selectOptions(modeField, "needs_completion");
      await user.clear(layerField);
      await user.type(layerField, "7");
      await user.clear(bboxWidthField);
      await user.type(bboxWidthField, "34");
      await user.type(notesField, "Need to preserve the handle");
      await user.click(visibilityField);
      await user.click(screen.getByRole("button", { name: /save element/i }));

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/workspace/state",
        expect.objectContaining({ method: "PUT" }),
      );
      expect(screen.getAllByText(/element details updated\./i)).toHaveLength(2);
      expect(screen.getByAltText("Hero Shelf thumbnail")).toBeInTheDocument();
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

      if (input === "/api/workspace/state" && init?.method === "PUT") {
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
      await user.clear(bboxWidthField);
      await user.type(bboxWidthField, "0");
      await user.click(screen.getByRole("button", { name: /save element/i }));

      expect(await screen.findByText(/element element_001 bbox width\/height must be > 0\./i)).toBeInTheDocument();
      expect(screen.getAllByText(/state save failed\./i)).toHaveLength(2);
      expect(screen.getByTestId("overlay-box-element_001")).toBeInTheDocument();
      expect(screen.getByLabelText(/bbox width/i)).toHaveValue(30);
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

      await user.click(await screen.findByRole("button", { name: /apply split/i }));

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
      await user.type(descriptionField, "frame and glass");
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
      expect(screen.getByText("D:/work/art-pipeline-v2-demo/workspace/export")).toBeInTheDocument();
      expect(screen.getByAltText("Export contact sheet preview")).toHaveAttribute(
        "src",
        expect.stringMatching(/^\/api\/workspace\/assets\/export\/contact_sheet\.png\?cache=\d+$/),
      );
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

      await user.click(screen.getByRole("button", { name: /replace mask by current shape/i }));

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
