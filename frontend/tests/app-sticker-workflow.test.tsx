import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { App } from "../src/App";
import { normalizeWorkspaceState, type WorkspaceElement, type WorkspaceState } from "../src/workspace";

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

function workspace(overrides: Partial<WorkspaceState> = {}): WorkspaceState {
  return normalizeWorkspaceState({
    source: {
      filename: "scene.png",
      path: "source/scene.png",
      width: 120,
      height: 90,
    },
    elements: [baseElement],
    detectionVocabulary: ["cat"],
    ...overrides,
  });
}

const baseElement: WorkspaceElement = normalizeWorkspaceState({
  source: null,
  detectionVocabulary: [],
  elements: [
    {
      id: "element_001",
      name: "Sticker",
      label: "Sticker",
      status: "accepted",
      mode: "visible_only",
      assetRole: "sticker",
      removeFromParent: null,
      segmentationStatus: "not_started",
      repairStatus: "not_required",
      exportStatus: "not_ready",
      bbox: { x: 12, y: 16, w: 30, h: 32 },
      canvas: { x: 4, y: 8, w: 46, h: 48 },
      layer: 1,
      thumbnail: "elements/element_001/thumb.png",
      mask: null,
      parentId: null,
      source: "model_detection",
      sourceProvider: "grounding_dino",
      sourcePrompt: "Sticker",
      notes: "",
      visible: true,
      confidence: 0.84,
      history: [],
      mergedInto: null,
      exportParent: false,
    },
  ],
}).elements[0];

describe("App sticker workflow wiring", () => {
  it("renders the detection vocabulary after source load and saves normalized labels", async () => {
    const initialState = workspace();
    const savedState = workspace({ detectionVocabulary: ["cat", "bucket"] });
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/runs" && (!init || init.method === "GET")) {
        return jsonResponse({ detail: "legacy mode" }, 500);
      }
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(initialState);
      }
      if (input === "/api/workspace/detection-vocabulary" && init?.method === "POST") {
        expect(init.body).toBe(JSON.stringify(["cat", "bucket"]));
        return jsonResponse(savedState);
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      const panel = await screen.findByRole("region", { name: /detection vocabulary/i });
      expect(within(panel).getByText("cat")).toBeInTheDocument();

      const input = within(panel).getByRole("textbox", { name: /detection label/i });
      fireEvent.change(input, { target: { value: "Bucket" } });
      fireEvent.submit(input.closest("form") as HTMLFormElement);

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith(
          "/api/workspace/detection-vocabulary",
          expect.objectContaining({ method: "POST" }),
        );
      });
      expect(await within(panel).findByText("bucket")).toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("saves detection vocabulary after removing a label", async () => {
    const initialState = workspace({ detectionVocabulary: ["cat", "bucket", "mirror"] });
    const savedState = workspace({ detectionVocabulary: ["cat", "mirror"] });
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/runs" && (!init || init.method === "GET")) {
        return jsonResponse({ detail: "legacy mode" }, 500);
      }
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(initialState);
      }
      if (input === "/api/workspace/detection-vocabulary" && init?.method === "POST") {
        expect(init.body).toBe(JSON.stringify(["cat", "mirror"]));
        expect(String(init.body)).not.toContain("bucket");
        return jsonResponse(savedState);
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      const panel = await screen.findByRole("region", { name: /detection vocabulary/i });
      fireEvent.click(within(panel).getByRole("button", { name: /remove bucket/i }));

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith(
          "/api/workspace/detection-vocabulary",
          expect.objectContaining({ method: "POST" }),
        );
      });
    } finally {
      restoreFetch();
    }
  });

  it("posts click-detect source coordinates and refreshes the selected asset", async () => {
    const user = userEvent.setup();
    const clickedElement = {
      ...baseElement,
      id: "element_002",
      name: "Click candidate",
      label: "Click candidate",
      status: "model_detected" as const,
      source: "click_detect",
      sourceProvider: "sam2",
      sourcePrompt: "Sticker",
    };
    const clickedState = workspace({ elements: [baseElement, clickedElement] });
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/runs" && (!init || init.method === "GET")) {
        return jsonResponse({ detail: "legacy mode" }, 500);
      }
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(workspace());
      }
      if (input === "/api/workspace/click-detect" && init?.method === "POST") {
        expect(init.body).toBe(JSON.stringify({ x: 60, y: 45, label: "Sticker" }));
        return jsonResponse({ element: clickedElement, state: clickedState });
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);
      await screen.findByText(/scene\.png - 120 x 90/i);

      await user.click(screen.getByRole("button", { name: /click detect/i }));
      const surface = screen.getByTestId("canvas-drawing-surface");
      setCanvasRect(surface);
      fireEvent.mouseDown(surface, { clientX: 300, clientY: 225, button: 0 });

      expect((await screen.findAllByText("Click candidate")).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/click-detected asset added/i).length).toBeGreaterThan(0);
    } finally {
      restoreFetch();
    }
  });

  it("renders the floating segment drawer in the canvas workspace and wires suggest and accept", async () => {
    const user = userEvent.setup();
    const suggestedElement = {
      ...baseElement,
      segmentationStatus: "mask_suggested" as const,
      mask: "elements/element_001/sam2_edge/mask.png",
    };
    const acceptedElement = {
      ...suggestedElement,
      segmentationStatus: "mask_accepted" as const,
      exportStatus: "ready" as const,
    };
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/runs" && (!init || init.method === "GET")) {
        return jsonResponse({ detail: "legacy mode" }, 500);
      }
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(workspace());
      }
      if (input === "/api/workspace/elements/element_001/segment/suggest" && init?.method === "POST") {
        return jsonResponse({
          element: suggestedElement,
          segmentation: { maskPath: "elements/element_001/sam2_edge/mask.png" },
          state: workspace({ elements: [suggestedElement] }),
        });
      }
      if (input === "/api/workspace/elements/element_001/segment/accept" && init?.method === "POST") {
        return jsonResponse({
          element: acceptedElement,
          state: workspace({ elements: [acceptedElement] }),
        });
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      const drawer = await screen.findByRole("dialog", { name: /segment/i });
      const canvasWorkspace = screen.getByRole("region", { name: /canvas workspace/i });
      expect(canvasWorkspace).toContainElement(drawer);
      expect(drawer).toHaveClass("floating-stage-drawer");
      expect(screen.getByRole("img", { name: /sticker sam2 edge mask/i })).toBeInTheDocument();
      const exportButton = screen.getByRole("button", { name: /export asset pack/i });
      expect(exportButton).toBeDisabled();

      await user.click(screen.getByRole("button", { name: /suggest mask/i }));
      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith(
          "/api/workspace/elements/element_001/segment/suggest",
          expect.objectContaining({ method: "POST" }),
        );
      });
      expect(screen.getAllByText(/mask suggestion ready/i).length).toBeGreaterThan(0);
      expect(exportButton).toBeDisabled();

      await user.click(screen.getByRole("button", { name: /accept mask/i }));
      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith(
          "/api/workspace/elements/element_001/segment/accept",
          expect.objectContaining({ method: "POST" }),
        );
      });
      expect(screen.getAllByText(/mask accepted/i).length).toBeGreaterThan(0);
      expect(exportButton).toBeEnabled();
    } finally {
      restoreFetch();
    }
  });

  it("does not treat suggested masks or legacy extracted assets as export-ready stickers", async () => {
    const legacyExtractedElement = {
      ...baseElement,
      status: "extracted" as const,
      mask: "elements/element_001/bbox_alpha.png",
      segmentationStatus: "not_started" as const,
      exportStatus: "not_ready" as const,
    };
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/runs" && (!init || init.method === "GET")) {
        return jsonResponse({ detail: "legacy mode" }, 500);
      }
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(workspace({ elements: [legacyExtractedElement] }));
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      await screen.findByText(/scene\.png - 120 x 90/i);
      expect(screen.getByRole("button", { name: /export asset pack/i })).toBeDisabled();
    } finally {
      restoreFetch();
    }
  });

  it("keeps the app rail to Upload, Detect, Segment, Generate, Repair, Export", async () => {
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/runs" && (!init || init.method === "GET")) {
        return jsonResponse({ detail: "legacy mode" }, 500);
      }
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(workspace());
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      const rail = await screen.findByRole("navigation", { name: /pipeline stages/i });
      const stageNames = Array.from(rail.querySelectorAll(".stage-copy strong")).map((stage) => stage.textContent);

      expect(stageNames).toEqual(["Upload", "Detect", "Segment", "Generate", "Repair", "Export"]);
      expect(within(rail).queryByText("Review")).not.toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });
});
