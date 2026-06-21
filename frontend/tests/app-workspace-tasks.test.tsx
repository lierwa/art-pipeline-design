import { useState } from "react";

import { App, describe, expect, installFetchMock, it, jsonResponse, render, screen, userEvent, waitFor, within } from "./app/appTestHarness";
import { normalizeWorkspaceState, type WorkspaceElement, type WorkspaceState } from "../src/domain/workspace";
import { buildTaskItemIndex, type WorkspaceTask } from "../src/domain/workspaceTasks";
import { useWorkspaceTaskController } from "../src/app/useWorkspaceTaskController";
import { WorkspaceTaskPanel } from "../src/features/tasks/WorkspaceTaskPanel";

const source = {
  filename: "scene.png",
  path: "source/scene.png",
  width: 120,
  height: 90,
};

const baseElement: WorkspaceElement = normalizeWorkspaceState({
  source: null,
  detectionVocabulary: [],
  elements: [
    {
      id: "element_001",
      name: "cat",
      label: "cat",
      status: "accepted",
      mode: "visible_only",
      assetRole: "sticker",
      removeFromParent: null,
      segmentationStatus: "mask_accepted",
      repairStatus: "not_required",
      exportStatus: "not_ready",
      bbox: { x: 12, y: 16, w: 30, h: 32 },
      canvas: { x: 4, y: 8, w: 46, h: 48 },
      layer: 1,
      thumbnail: "elements/element_001/thumb.png",
      mask: "elements/element_001/sam2_edge/mask.png",
      parentId: null,
      source: "model_detection",
      sourceProvider: "grounding_dino",
      sourcePrompt: "cat",
      notes: "",
      visible: true,
      confidence: 0.84,
      history: [],
      mergedInto: null,
      exportParent: false,
    },
  ],
}).elements[0];

function workspace(elements: WorkspaceElement[]): WorkspaceState {
  return normalizeWorkspaceState({
    source,
    elements,
    detectionVocabulary: ["cat"],
  });
}

function taskFixture(overrides: Partial<WorkspaceTask>): WorkspaceTask {
  return {
    taskId: "task_202606210930000000_sam2-mask-batch",
    type: "sam2_mask_batch",
    status: "succeeded",
    createdAt: "2026-06-21T09:30:00+00:00",
    updatedAt: "2026-06-21T09:31:00+00:00",
    total: 28,
    done: 18,
    failed: 0,
    skipped: 10,
    items: [
      {
        elementId: "element_001",
        name: "cat",
        status: "succeeded",
        message: "SAM2 mask ready.",
        startedAt: "2026-06-21T09:30:01+00:00",
        finishedAt: "2026-06-21T09:30:03+00:00",
        artifactPaths: { maskPath: "elements/element_001/sam2_edge/mask.png" },
      },
      {
        elementId: "element_hidden",
        name: "merged source",
        status: "skipped",
        message: "Skipped because this source box is merged into element_001.",
        startedAt: null,
        finishedAt: "2026-06-21T09:30:03+00:00",
        artifactPaths: {},
      },
    ],
    ...overrides,
  };
}

describe("workspace task progress UI", () => {
  it("separates real task results from unchanged assets in the progress UI", async () => {
    const readyElement = {
      ...baseElement,
      id: "element_002",
      name: "stool",
      label: "stool",
      thumbnail: "elements/element_002/thumb.png",
      segmentationStatus: "mask_suggested",
      mask: "elements/element_002/sam2_edge/mask.png",
    } satisfies WorkspaceElement;
    const task = taskFixture({
      total: 28,
      done: 1,
      skipped: 27,
      items: [
        {
          elementId: "element_001",
          name: "cat",
          status: "succeeded",
          message: "SAM2 mask ready.",
          startedAt: "2026-06-21T09:30:01+00:00",
          finishedAt: "2026-06-21T09:30:03+00:00",
          artifactPaths: { maskPath: "elements/element_001/sam2_edge/mask.png" },
        },
        {
          elementId: "element_002",
          name: "stool",
          status: "skipped",
          message: "Skipped because this mask is already ready for review.",
          startedAt: null,
          finishedAt: "2026-06-21T09:30:03+00:00",
          artifactPaths: {},
        },
      ],
    });

    render(<WorkspaceTaskPanel tasks={[task]} onRetryFailedTask={() => {}} />);

    const taskPanel = screen.getByRole("region", { name: /workspace tasks/i });
    expect(taskPanel).toHaveTextContent(/SAM2 mask batch/i);
    expect(taskPanel).toHaveTextContent(/1\/1 succeeded/i);
    expect(taskPanel).toHaveTextContent(/27 unchanged/i);
    expect(taskPanel).toHaveTextContent(/cat/i);
    expect(taskPanel).not.toHaveTextContent(/already ready for review/i);

    const taskItemsByElementId = buildTaskItemIndex([task], [baseElement, readyElement]);
    expect(taskItemsByElementId.element_001?.status).toBe("succeeded");
    expect(taskItemsByElementId.element_002).toBeUndefined();
    expect(readyElement.segmentationStatus).toBe("mask_suggested");

    const staleElement = {
      ...baseElement,
      segmentationStatus: "not_started",
      mask: null,
    } satisfies WorkspaceElement;
    expect(buildTaskItemIndex([task], [staleElement]).element_001).toBeUndefined();
  });

  it("lets the operator dismiss the task progress panel", async () => {
    const user = userEvent.setup();
    const task = taskFixture({
      total: 1,
      done: 1,
      skipped: 0,
      items: [
        {
          elementId: "element_001",
          name: "cat",
          status: "succeeded",
          message: "SAM2 mask ready.",
          startedAt: "2026-06-21T09:30:01+00:00",
          finishedAt: "2026-06-21T09:30:03+00:00",
          artifactPaths: { maskPath: "elements/element_001/sam2_edge/mask.png" },
        },
      ],
    });

    render(<WorkspaceTaskPanel tasks={[task]} onRetryFailedTask={() => {}} />);

    expect(screen.getByRole("region", { name: /workspace tasks/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /dismiss task progress/i }));
    expect(screen.queryByRole("region", { name: /workspace tasks/i })).not.toBeInTheDocument();
  });

  it("starts a Codex final batch when every visible asset has an accepted mask", async () => {
    const user = userEvent.setup();
    const state = workspace([
      baseElement,
      {
        ...baseElement,
        id: "element_002",
        name: "stool",
        label: "stool",
        thumbnail: "elements/element_002/thumb.png",
        mask: "elements/element_002/sam2_edge/mask.png",
      },
    ]);
    const codexTask = taskFixture({
      taskId: "task_202606210940000000_codex-final-batch",
      type: "codex_final_batch",
      status: "queued",
      total: 2,
      done: 0,
      skipped: 0,
      items: state.elements.map((element) => ({
        elementId: element.id,
        name: element.name,
        status: "queued",
        message: "Waiting for Codex final.",
        startedAt: null,
        finishedAt: null,
        artifactPaths: {},
      })),
    });
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/runs" && (!init || init.method === "GET")) {
        return jsonResponse({ detail: "legacy mode" }, 500);
      }
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(state);
      }
      if (input === "/api/workspace/tasks" && (!init || init.method === "GET")) {
        return jsonResponse({ tasks: [] });
      }
      if (input === "/api/workspace/workflow" && (!init || init.method === "GET")) {
        return jsonResponse({
          stage: "generate",
          generateSelection: Object.fromEntries(state.elements.map((element) => [element.id, true])),
          stageSnapshots: {},
          taskIds: {
            sam2MaskBatch: null,
            codexFinalBatches: [],
          },
          lastExportSummary: null,
        });
      }
      if (input === "/api/workspace/stage/generate" && init?.method === "POST") {
        return jsonResponse({
          state,
          workflow: {
            stage: "generate",
            generateSelection: Object.fromEntries(state.elements.map((element) => [element.id, true])),
            stageSnapshots: {},
            taskIds: {
              sam2MaskBatch: null,
              codexFinalBatches: [codexTask.taskId],
            },
            lastExportSummary: null,
          },
          task: codexTask,
        });
      }
      if (String(input).includes("/codex-final/generate")) {
        throw new Error("Generate stage must create a Codex batch task, not run one selected element.");
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      const topAppBar = await screen.findByRole("banner");
      await user.click(await within(topAppBar).findByRole("button", { name: /generate selected/i }));

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith(
          "/api/workspace/stage/generate",
          expect.objectContaining({ method: "POST" }),
        );
      });
      expect(await screen.findByRole("region", { name: /workspace tasks/i })).toHaveTextContent(/Codex final batch/i);
    } finally {
      restoreFetch();
    }
  });

  it("refreshes workspace state immediately when a SAM2 batch returns already completed", async () => {
    const user = userEvent.setup();
    const pending = workspace([
      {
        ...baseElement,
        segmentationStatus: "not_started",
        mask: null,
      },
    ]);
    const updated = workspace([
      {
        ...baseElement,
        segmentationStatus: "mask_suggested",
        mask: "elements/element_001/sam2_edge/mask.png",
      },
    ]);
    const completedTask = taskFixture({
      status: "succeeded",
      total: 1,
      done: 1,
      skipped: 0,
      items: [
        {
          elementId: "element_001",
          name: "cat",
          status: "succeeded",
          message: "SAM2 mask ready.",
          startedAt: "2026-06-21T09:30:01+00:00",
          finishedAt: "2026-06-21T09:30:03+00:00",
          artifactPaths: { maskPath: "elements/element_001/sam2_edge/mask.png" },
        },
      ],
    });
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/tasks" && (!init || init.method === "GET")) {
        return jsonResponse({ tasks: [] });
      }
      if (input === "/api/workspace/tasks/sam2-masks" && init?.method === "POST") {
        return jsonResponse(completedTask);
      }
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(updated);
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<TaskControllerProbe initialWorkspace={pending} />);

      await user.click(screen.getByRole("button", { name: /start sam2/i }));

      await waitFor(() => {
        expect(screen.getByTestId("segmentation-status")).toHaveTextContent("mask_suggested");
      });
      expect(screen.getByTestId("asset-cache-key")).toHaveTextContent("1");
    } finally {
      restoreFetch();
    }
  });
});

function TaskControllerProbe({ initialWorkspace }: { initialWorkspace: WorkspaceState }) {
  const [workspaceState, setWorkspaceState] = useState(initialWorkspace);
  const [assetCacheKey, setAssetCacheKey] = useState(0);
  const [, setError] = useState<string | null>(null);
  const [, setStatus] = useState("");
  const controller = useWorkspaceTaskController({
    activeRunId: null,
    setAssetCacheKey,
    setError,
    setStatus,
    setWorkspace: setWorkspaceState,
    workspaceHasSource: true,
  });

  return (
    <div>
      <button type="button" onClick={() => void controller.handleStartSam2MaskTask()}>
        Start SAM2
      </button>
      <span data-testid="segmentation-status">{workspaceState.elements[0]?.segmentationStatus}</span>
      <span data-testid="asset-cache-key">{assetCacheKey}</span>
    </div>
  );
}
