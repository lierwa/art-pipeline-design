import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { App } from "../../src/App";
import { normalizeWorkspaceState, type WorkspaceElement, type WorkspaceState } from "../../src/domain/workspace";
import type { WorkspaceTask } from "../../src/domain/workspaceTasks";

vi.mock("@yaireo/tagify/react", async () => ({
  default: (await import("../helpers/tagifyMock")).MockTagify,
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

function installEventSourceMock() {
  const originalEventSource = globalThis.EventSource;
  const instances: MockEventSource[] = [];

  class MockEventSource {
    listeners: Record<string, Array<(event: MessageEvent) => void>> = {};

    constructor(public url: string | URL) {
      instances.push(this);
    }

    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      const callback = typeof listener === "function"
        ? listener
        : (event: Event) => listener.handleEvent(event);
      this.listeners[type] = [...(this.listeners[type] ?? []), callback as (event: MessageEvent) => void];
    }

    close() {}

    dispatchSnapshot(payload: unknown) {
      for (const listener of this.listeners.snapshot ?? []) {
        listener(new MessageEvent("snapshot", { data: JSON.stringify(payload) }));
      }
    }
  }

  Object.defineProperty(globalThis, "EventSource", {
    configurable: true,
    writable: true,
    value: MockEventSource,
  });

  return {
    instances,
    restore() {
      if (originalEventSource) {
        Object.defineProperty(globalThis, "EventSource", {
          configurable: true,
          writable: true,
          value: originalEventSource,
        });
        return;
      }
      Reflect.deleteProperty(globalThis, "EventSource");
    },
  };
}

describe("detection task SSE canvas refresh", () => {
  it("shows one collapsed canvas-anchored pending panel immediately after Run Detection", async () => {
    const user = userEvent.setup();
    const events = installEventSourceMock();
    let currentState = workspace({ elements: [] });
    let currentTasks: WorkspaceTask[] = [];
    const task = detectionTask("running", []);
    const stageDetect = deferred<Response>();
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/workspace/runs" && (!init || init.method === "GET")) {
        return jsonResponse({ detail: "legacy mode" }, 500);
      }
      if (url === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(currentState);
      }
      if (url === "/api/workspace/tasks" && (!init || init.method === "GET")) {
        return jsonResponse({ tasks: currentTasks });
      }
      if (url.startsWith("/api/workspace/workflow") && (!init || init.method === "GET")) {
        return jsonResponse(workflowPayload("upload"));
      }
      if (url.startsWith("/api/workspace/stage/detect") && init?.method === "POST") {
        return stageDetect.promise;
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });

    try {
      render(<App />);
      await waitFor(() => expect(events.instances.length).toBeGreaterThan(0));

      const topAppBar = await screen.findByRole("banner");
      await user.click(within(topAppBar).getByRole("button", { name: /run detection/i }));

      const panel = await screen.findByRole("region", { name: /workspace tasks/i });
      expect(panel).toHaveClass("is-collapsed");
      expect(panel).toHaveTextContent(/Detection batch/i);
      expect(screen.queryByText(/Model request in progress/i)).not.toBeInTheDocument();
      const canvasWorkspace = screen.getByRole("region", { name: /canvas workspace/i });
      const stageShell = canvasWorkspace.querySelector(".canvas-stage-shell");
      expect(stageShell).toContainElement(panel);
      expect(document.querySelectorAll(".workspace-task-panel")).toHaveLength(1);

      currentTasks = [task];
      await act(async () => {
        stageDetect.resolve(jsonResponse({
          state: currentState,
          workflow: workflowPayload("detect", task.taskId),
          task,
        }));
        await stageDetect.promise;
      });
      expect(await screen.findByRole("region", { name: /workspace tasks/i })).toHaveTextContent(/Detection batch/i);
    } finally {
      restoreFetch();
      events.restore();
    }
  });

  it("renders detection boxes one by one as task snapshots refresh workspace state", async () => {
    const user = userEvent.setup();
    const events = installEventSourceMock();
    let currentState = workspace({ elements: [] });
    let currentTasks: WorkspaceTask[] = [];
    const task = detectionTask("running", []);
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/workspace/runs" && (!init || init.method === "GET")) {
        return jsonResponse({ detail: "legacy mode" }, 500);
      }
      if (url === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(currentState);
      }
      if (url === "/api/workspace/tasks" && (!init || init.method === "GET")) {
        return jsonResponse({ tasks: currentTasks });
      }
      if (url.startsWith("/api/workspace/workflow") && (!init || init.method === "GET")) {
        return jsonResponse(workflowPayload("upload"));
      }
      if (url.startsWith("/api/workspace/stage/detect") && init?.method === "POST") {
        currentTasks = [task];
        return jsonResponse({
          state: currentState,
          workflow: workflowPayload("detect", task.taskId),
          task,
        });
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });

    try {
      render(<App />);
      await waitFor(() => expect(events.instances.length).toBeGreaterThan(0));

      const topAppBar = await screen.findByRole("banner");
      await user.click(within(topAppBar).getByRole("button", { name: /run detection/i }));
      const taskPanel = await screen.findByRole("region", { name: /workspace tasks/i });
      expect(taskPanel).toHaveClass("is-collapsed");
      expect(taskPanel).toHaveTextContent(/Detection batch/i);

      currentState = workspace({ elements: [detectedElement("element_001", "Cat", 8)] });
      currentTasks = [detectionTask("running", [taskItem("element_001", "Cat", "succeeded")])];
      await act(async () => {
        events.instances[0].dispatchSnapshot({
          tasks: currentTasks,
          changedElementIds: ["element_001"],
        });
        await Promise.resolve();
      });
      expect(await screen.findByTestId("overlay-box-element_001")).toBeInTheDocument();
      expect(screen.queryByTestId("overlay-box-element_002")).not.toBeInTheDocument();

      currentState = workspace({
        elements: [
          detectedElement("element_001", "Cat", 8),
          detectedElement("element_002", "Sink", 54),
        ],
      });
      currentTasks = [
        detectionTask(
          "succeeded",
          [
            taskItem("element_001", "Cat", "succeeded"),
            taskItem("element_002", "Sink", "succeeded"),
          ],
          2,
        ),
      ];
      await act(async () => {
        events.instances[0].dispatchSnapshot({
          tasks: currentTasks,
          changedElementIds: ["element_002"],
        });
        await Promise.resolve();
      });
      expect(await screen.findByTestId("overlay-box-element_002")).toBeInTheDocument();
    } finally {
      restoreFetch();
      events.restore();
    }
  });

  it("keeps the task panel fixed to the canvas stage shell at one width", () => {
    const stylesheet = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    const collapsedBlock = stylesheet.match(/\.workspace-task-panel\.is-collapsed\s*\{[^}]*\}/)?.[0] ?? "";

    expect(stylesheet).toMatch(/\.canvas-stage-shell\s*\{[\s\S]*position:\s*relative;/);
    expect(stylesheet).toMatch(/\.workspace-task-panel\s*\{[\s\S]*position:\s*absolute;[\s\S]*right:\s*0\.75rem;/);
    expect(collapsedBlock).not.toContain("width:");
  });
});

function workspace(overrides: Partial<WorkspaceState> = {}): WorkspaceState {
  return normalizeWorkspaceState({
    source: {
      filename: "scene.png",
      path: "source/scene.png",
      width: 120,
      height: 90,
    },
    elements: [],
    detectionVocabulary: ["cat", "sink"],
    ...overrides,
  });
}

function detectedElement(id: string, label: string, x: number): WorkspaceElement {
  return normalizeWorkspaceState({
    source: null,
    detectionVocabulary: [],
    elements: [
      {
        id,
        name: label,
        label,
        status: "model_detected",
        mode: "visible_only",
        assetRole: "sticker",
        removeFromParent: null,
        segmentationStatus: "not_started",
        repairStatus: "not_required",
        exportStatus: "not_ready",
        bbox: { x, y: 12, w: 24, h: 24 },
        canvas: { x, y: 12, w: 24, h: 24 },
        layer: 1,
        thumbnail: `elements/${id}/thumb.png`,
        mask: null,
        parentId: null,
        source: "model_detection",
        sourceProvider: "fake_detector",
        sourcePrompt: label,
        notes: "",
        visible: true,
        confidence: 0.9,
        history: [],
        mergedInto: null,
        exportParent: false,
      },
    ],
  }).elements[0];
}

function workflowPayload(stage: "upload" | "detect", detectionBatch: string | null = null) {
  return {
    stage,
    generateSelection: {},
    generatePromptHints: {},
    stageSnapshots: {},
    taskIds: {
      detectionBatch,
      sam2MaskBatch: null,
      codexFinalBatches: [],
    },
    lastExportSummary: null,
  };
}

function detectionTask(
  status: WorkspaceTask["status"],
  items: WorkspaceTask["items"],
  done = 0,
): WorkspaceTask {
  return {
    taskId: "task_202606221100000000_detection-batch",
    type: "detection_batch",
    status,
    createdAt: "2026-06-22T11:00:00+00:00",
    updatedAt: "2026-06-22T11:00:00+00:00",
    total: Math.max(items.length, 1),
    done,
    failed: 0,
    skipped: 0,
    items: items.length > 0 ? items : [taskItem("__detection_provider__", "Detection provider", "running")],
  };
}

function taskItem(
  elementId: string,
  name: string,
  status: WorkspaceTask["items"][number]["status"],
): WorkspaceTask["items"][number] {
  return {
    elementId,
    name,
    status,
    message: status === "running" ? "Running detection provider." : "Detection candidate ready.",
    startedAt: null,
    finishedAt: status === "succeeded" ? "2026-06-22T11:00:01+00:00" : null,
    artifactPaths: {},
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}
