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
        "/api/workspace/assets/elements/element_001/source_crop.png",
      );
      expect(screen.getByAltText("Region 1 mask overlay")).toHaveAttribute(
        "src",
        "/api/workspace/assets/elements/element_001/mask.png",
      );
      expect(screen.getByAltText("Region 1 transparent asset")).toHaveAttribute(
        "src",
        "/api/workspace/assets/elements/element_001/asset_incomplete.png",
      );
      expect(screen.getAllByText(/canvas 46 x 48 at 4, 8/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/bbox 30 x 32 at 12, 16/i).length).toBeGreaterThan(0);
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

      expect(screen.getByRole("button", { name: /replace mask by bbox/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /re-extract/i })).toBeInTheDocument();
      await user.click(screen.getByRole("checkbox", { name: /show masks/i }));

      expect(screen.getByTestId("overlay-mask-element_001")).toHaveAttribute(
        "src",
        "/api/workspace/assets/elements/element_001/mask.png",
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
