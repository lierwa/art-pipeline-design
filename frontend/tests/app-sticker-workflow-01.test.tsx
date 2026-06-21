import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { App } from "../src/App";
import { normalizeWorkspaceState, type WorkspaceElement, type WorkspaceState } from "../src/domain/workspace";
import type { WorkspaceTask } from "../src/domain/workspaceTasks";

vi.mock("@yaireo/tagify/react", async () => ({
  default: (await import("./helpers/tagifyMock")).MockTagify,
}));

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

function taskFixture(overrides: Partial<WorkspaceTask> = {}): WorkspaceTask {
  return {
    taskId: "task_202606210900000000_sam2-mask-batch",
    type: "sam2_mask_batch",
    status: "queued",
    createdAt: "2026-06-21T09:00:00+00:00",
    updatedAt: "2026-06-21T09:00:00+00:00",
    total: 1,
    done: 0,
    failed: 0,
    skipped: 0,
    items: [
      {
        elementId: "element_001",
        name: "Sticker",
        status: "queued",
        message: "Waiting for SAM2 mask.",
        startedAt: null,
        finishedAt: null,
        artifactPaths: {},
      },
    ],
    ...overrides,
  };
}

describe("App sticker workflow wiring 01", () => {
  it("renders the detection vocabulary as a canvas prompt board instead of a right-panel block", async () => {
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/runs" && (!init || init.method === "GET")) {
        return jsonResponse({ detail: "legacy mode" }, 500);
      }
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(workspace({ elements: [], detectionVocabulary: ["cat", "bathtub"] }));
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      const canvasWorkspace = await screen.findByRole("region", { name: /canvas workspace/i });
      const promptBoard = within(canvasWorkspace).getByRole("region", { name: /detection vocabulary/i });
      const reviewPanel = screen.getByRole("region", { name: /review panel/i });

      expect(promptBoard).toHaveClass("detection-prompt-board");
      expect(within(promptBoard).getByText("cat")).toBeInTheDocument();
      expect(within(promptBoard).getByText("bathtub")).toBeInTheDocument();
      expect(reviewPanel).not.toContainElement(promptBoard);
      expect(within(reviewPanel).queryByRole("region", { name: /detection vocabulary/i })).not.toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("starts Mask from detected assets with one stage-level SAM2 task", async () => {
    const user = userEvent.setup();
    const detectedElement: WorkspaceElement = {
      ...baseElement,
      status: "model_detected",
      mode: "visible_only",
      exportStatus: "not_ready",
    };
    const initialState = workspace({ elements: [detectedElement] });
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/runs" && (!init || init.method === "GET")) {
        return jsonResponse({ detail: "legacy mode" }, 500);
      }
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(initialState);
      }
      if (String(input).startsWith("/api/workspace/workflow") && (!init || init.method === "GET")) {
        return jsonResponse({
          stage: "detect",
          generateSelection: { element_001: true },
          stageSnapshots: {},
          taskIds: {
            sam2MaskBatch: null,
            codexFinalBatches: [],
          },
          lastExportSummary: null,
        });
      }
      if (input === "/api/workspace/tasks" && (!init || init.method === "GET")) {
        return jsonResponse({ tasks: [] });
      }
      if (String(input).startsWith("/api/workspace/stage/mask") && init?.method === "POST") {
        return jsonResponse({
          state: initialState,
          workflow: {
            stage: "mask",
            generateSelection: { element_001: true },
            stageSnapshots: {},
            taskIds: {
              sam2MaskBatch: "task_202606210900000000_sam2-mask-batch",
              codexFinalBatches: [],
            },
            lastExportSummary: null,
          },
          task: taskFixture(),
        });
      }
      if (input === "/api/workspace/segment/suggest" && init?.method === "POST") {
        throw new Error("Batch SAM2 must create a workspace task, not call the legacy synchronous endpoint.");
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      const topAppBar = await screen.findByRole("banner");
      await user.click(await within(topAppBar).findByRole("button", { name: /generate masks/i }));

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith(
          expect.stringMatching(/^\/api\/workspace\/stage\/mask/),
          expect.objectContaining({ method: "POST" }),
        );
      });
      expect(await screen.findByRole("region", { name: /workspace tasks/i })).toHaveTextContent(/SAM2 mask batch/i);
      expect(screen.queryByRole("button", { name: /extract all/i })).not.toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("runs pending Mask jobs by creating one workspace task from the top workflow action", async () => {
    const user = userEvent.setup();
    const secondElement: WorkspaceElement = {
      ...baseElement,
      id: "element_002",
      name: "Cat",
      label: "Cat",
      bbox: { x: 58, y: 14, w: 24, h: 28 },
      canvas: { x: 54, y: 10, w: 32, h: 36 },
      thumbnail: "elements/element_002/thumb.png",
    };
    const initialState = workspace({ elements: [baseElement, secondElement] });
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/runs" && (!init || init.method === "GET")) {
        return jsonResponse({ detail: "legacy mode" }, 500);
      }
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(initialState);
      }
      if (String(input).startsWith("/api/workspace/workflow") && (!init || init.method === "GET")) {
        return jsonResponse({
          stage: "detect",
          generateSelection: { element_001: true, element_002: true },
          stageSnapshots: {},
          taskIds: {
            sam2MaskBatch: null,
            codexFinalBatches: [],
          },
          lastExportSummary: null,
        });
      }
      if (input === "/api/workspace/tasks" && (!init || init.method === "GET")) {
        return jsonResponse({ tasks: [] });
      }
      if (String(input).startsWith("/api/workspace/stage/mask") && init?.method === "POST") {
        const task = taskFixture({
          total: 2,
          items: [
            {
              elementId: "element_001",
              name: "Sticker",
              status: "queued",
              message: "Waiting for SAM2 mask.",
              startedAt: null,
              finishedAt: null,
              artifactPaths: {},
            },
            {
              elementId: "element_002",
              name: "Cat",
              status: "queued",
              message: "Waiting for SAM2 mask.",
              startedAt: null,
              finishedAt: null,
              artifactPaths: {},
            },
          ],
        });
        return jsonResponse({
          state: initialState,
          workflow: {
            stage: "mask",
            generateSelection: { element_001: true, element_002: true },
            stageSnapshots: {},
            taskIds: {
              sam2MaskBatch: task.taskId,
              codexFinalBatches: [],
            },
            lastExportSummary: null,
          },
          task,
        });
      }
      if (String(input).includes("/api/workspace/elements/") && String(input).includes("/segment/suggest")) {
        throw new Error("Top Segment action must not call the single-element SAM2 endpoint.");
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      const topAppBar = await screen.findByRole("banner");
      await user.click(await within(topAppBar).findByRole("button", { name: /generate masks/i }));

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith(
          expect.stringMatching(/^\/api\/workspace\/stage\/mask/),
          expect.objectContaining({ method: "POST" }),
        );
      });
      expect(await screen.findByRole("region", { name: /workspace tasks/i })).toHaveTextContent(/0\/2 succeeded/i);
      expect(within(topAppBar).queryByRole("button", { name: /accept mask/i })).not.toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

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

      const input = within(panel).getByLabelText(/detection label/i);
      fireEvent.change(input, { target: { value: "Bucket" } });
      fireEvent.keyDown(input, { key: "Enter" });

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

  it("shows model detection progress in the workflow toast", async () => {
    const user = userEvent.setup();
    let resolveDetection: ((response: Response) => void) | null = null;
    const detectionResponse = new Promise<Response>((resolve) => {
      resolveDetection = resolve;
    });
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/runs" && (!init || init.method === "GET")) {
        return jsonResponse({ detail: "legacy mode" }, 500);
      }
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(workspace({ elements: [] }));
      }
      if (input === "/api/workspace/detect" && init?.method === "POST") {
        return detectionResponse;
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      await user.click(await screen.findByRole("button", { name: /run detection/i }));

      const progress = await screen.findByText(/model request in progress/i);
      expect(progress.closest(".workflow-toast")).toHaveTextContent(/running detection/i);

      resolveDetection?.(jsonResponse(workspace({ elements: [] })));
      await waitFor(() => {
        expect(screen.queryByText(/model request in progress/i)).not.toBeInTheDocument();
      });
    } finally {
      restoreFetch();
    }
  });

  it("collapses the detection prompt board after model detection and reopens it from the canvas corner", async () => {
    const user = userEvent.setup();
    const detectedElement: WorkspaceElement = {
      ...baseElement,
      status: "model_detected",
      mode: "visible_only",
      sourceProvider: "grounding_dino",
    };
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/runs" && (!init || init.method === "GET")) {
        return jsonResponse({ detail: "legacy mode" }, 500);
      }
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(workspace({ elements: [], detectionVocabulary: ["cat", "bathtub"] }));
      }
      if (input === "/api/workspace/detect" && init?.method === "POST") {
        return jsonResponse(workspace({ elements: [detectedElement], detectionVocabulary: ["cat", "bathtub"] }));
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      const canvasWorkspace = await screen.findByRole("region", { name: /canvas workspace/i });
      expect(within(canvasWorkspace).getByRole("region", { name: /detection vocabulary/i })).toBeInTheDocument();

      await user.click(await screen.findByRole("button", { name: /run detection/i }));

      await waitFor(() => {
        expect(within(canvasWorkspace).queryByRole("region", { name: /detection vocabulary/i })).not.toBeInTheDocument();
      });
      const promptButton = within(canvasWorkspace).getByRole("button", { name: /edit detection prompt/i });
      expect(promptButton).toHaveClass("canvas-prompt-board-toggle");

      await user.click(promptButton);

      const promptBoard = within(canvasWorkspace).getByRole("region", { name: /detection vocabulary/i });
      expect(promptBoard).toHaveClass("detection-prompt-board");
      expect(within(promptBoard).getByText("cat")).toBeInTheDocument();

      const collapseButton = within(canvasWorkspace).getByRole("button", { name: /collapse detection prompt/i });
      expect(collapseButton.querySelector("svg")).toHaveClass("lucide-minimize-2");

      await user.click(collapseButton);

      expect(within(canvasWorkspace).queryByRole("region", { name: /detection vocabulary/i })).not.toBeInTheDocument();
      expect(within(canvasWorkspace).getByRole("button", { name: /edit detection prompt/i })).toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("shows model detection failures in the workflow toast", async () => {
    const user = userEvent.setup();
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/runs" && (!init || init.method === "GET")) {
        return jsonResponse({ detail: "legacy mode" }, 500);
      }
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(workspace({ elements: [] }));
      }
      if (input === "/api/workspace/detect" && init?.method === "POST") {
        return jsonResponse({ detail: "Detection provider is not configured." }, 503);
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      await user.click(await screen.findByRole("button", { name: /run detection/i }));

      const toast = (await screen.findByText("Detection provider is not configured.")).closest(".workflow-toast");
      expect(toast).toHaveTextContent(/detection failed/i);
      expect(toast?.closest(".canvas-workspace")).toBeNull();
      expect(screen.queryByRole("alert", { name: /detection failed/i })).not.toBeInTheDocument();
      expect(document.querySelector(".workflow-feedback")).not.toBeInTheDocument();
      expect(document.querySelector(".error-text")).not.toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });
});
