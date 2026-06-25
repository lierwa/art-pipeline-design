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
    metadata: {},
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
    expect(taskPanel).toHaveClass("is-collapsed");
    await userEvent.click(within(taskPanel).getByRole("button", { name: /expand task progress/i }));
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

  it("summarizes Codex controller capacity without dumping artifact paths", async () => {
    const task = taskFixture({
      taskId: "task_202606240940000000_codex-final-batch",
      type: "codex_final_batch",
      status: "running",
      total: 3,
      done: 0,
      skipped: 0,
      metadata: {
        codexFinalControllerCount: 3,
        codexFinalCapacity: 18,
      },
      items: [
        {
          elementId: "element_001",
          name: "cat",
          status: "claimed",
          message: "Claimed by Codex controller.",
          startedAt: "2026-06-24T09:40:01+00:00",
          finishedAt: null,
          artifactPaths: {
            controllerId: "controller-a",
            attempt: 1,
            manifestPath: "tasks/task_202606240940000000_codex-final-batch/codex-final-jobs.json",
            promptPath: "elements/element_001/codex_final/job/job_a/prompt.md",
            rawOutputPath: "elements/element_001/codex_final/job/job_a/codex_raw.png",
          },
        },
        {
          elementId: "element_002",
          name: "toilet",
          status: "running",
          message: "Codex subagent is generating raw image.",
          startedAt: "2026-06-24T09:40:02+00:00",
          finishedAt: null,
          artifactPaths: {
            controllerId: "controller-b",
            attempt: 1,
            promptPath: "elements/element_002/codex_final/job/job_b/prompt.md",
          },
        },
        {
          elementId: "element_003",
          name: "plant",
          status: "queued",
          message: "Queued for Codex controller.",
          startedAt: null,
          finishedAt: null,
          artifactPaths: {},
        },
      ],
    });

    render(<WorkspaceTaskPanel tasks={[task]} onRetryFailedTask={() => {}} />);

    const taskPanel = screen.getByRole("region", { name: /workspace tasks/i });
    expect(taskPanel).toHaveTextContent(/0\/3 succeeded/i);
    expect(taskPanel).toHaveTextContent(/1 running/i);
    expect(taskPanel).toHaveTextContent(/1 claimed/i);
    expect(taskPanel).toHaveTextContent(/1 queued/i);
    expect(taskPanel).toHaveTextContent(/3 controllers · capacity 18/i);

    await userEvent.click(within(taskPanel).getByRole("button", { name: /expand task progress/i }));

    expect(taskPanel).toHaveTextContent(/cat/i);
    expect(taskPanel).toHaveTextContent(/controller-a · attempt 1/i);
    expect(taskPanel).not.toHaveTextContent(/prompt\.md/i);
    expect(taskPanel).not.toHaveTextContent(/codex-final-jobs\.json/i);
    expect(taskPanel).not.toHaveTextContent(/codex_raw\.png/i);
  });

  it("marks QA failed Codex final rows without exposing long candidate artifact paths", async () => {
    const task = taskFixture({
      taskId: "task_202606250940000000_codex-final-batch",
      type: "codex_final_batch",
      status: "succeeded",
      total: 1,
      done: 1,
      failed: 0,
      skipped: 0,
      items: [
        {
          elementId: "element_001",
          name: "cat",
          status: "succeeded",
          message: "Codex final candidate needs repair.",
          startedAt: "2026-06-25T09:40:01+00:00",
          finishedAt: "2026-06-25T09:40:02+00:00",
          artifactPaths: {
            qualityStatus: "failed",
            repairNote: "Candidate appears clipped at the output edge.",
            finalOutputPath: "elements/element_001/codex_final/job/job_failed/final_asset.png",
            qualityReportPath: "elements/element_001/codex_final/job/job_failed/quality_report.json",
            promptPath: "elements/element_001/codex_final/job/job_failed/prompt.md",
            rawOutputPath: "elements/element_001/codex_final/job/job_failed/codex_raw.png",
          },
        },
      ],
    });

    render(<WorkspaceTaskPanel tasks={[task]} onRetryFailedTask={() => {}} />);

    const taskPanel = screen.getByRole("region", { name: /workspace tasks/i });
    await userEvent.click(within(taskPanel).getByRole("button", { name: /expand task progress/i }));

    const row = within(taskPanel).getByRole("listitem");
    expect(within(row).getByText("QA failed")).toBeInTheDocument();
    expect(within(row).queryByText("Done")).not.toBeInTheDocument();
    expect(taskPanel).not.toHaveTextContent(/final_asset\.png/i);
    expect(taskPanel).not.toHaveTextContent(/quality_report\.json/i);
    expect(taskPanel).not.toHaveTextContent(/prompt\.md/i);
    expect(taskPanel).not.toHaveTextContent(/codex_raw\.png/i);
    expect(taskPanel).not.toHaveTextContent(/Candidate appears clipped at the output edge/i);
  });

  it("shows every expanded Codex final item with segmented progress and compact runtime metadata", async () => {
    const leaseExpiresInFiveMinutes = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const leaseExpiresInThreeMinutes = new Date(Date.now() + 3 * 60 * 1000).toISOString();
    const claimedItems = Array.from({ length: 17 }, (_, index) => ({
      elementId: `element_claimed_${index + 1}`,
      name: `claimed ${index + 1}`,
      status: "claimed" as const,
      message: "Claimed by Codex controller.",
      startedAt: null,
      finishedAt: null,
      artifactPaths: {
        controllerId: "controller-a",
        attempt: 1,
        jobStatus: "claimed",
        leaseExpiresAt: leaseExpiresInFiveMinutes,
        claimedAt: "2026-06-24T09:39:30+00:00",
        heartbeatAt: "2026-06-24T09:40:00+00:00",
        manifestPath: "tasks/task_202606240940000000_codex-final-batch/codex-final-jobs.json",
        promptPath: "elements/element_001/codex_final/job/job_a/prompt.md",
        rawOutputPath: "elements/element_001/codex_final/job/job_a/codex_raw.png",
      },
    }));
    const queuedItems = Array.from({ length: 4 }, (_, index) => ({
      elementId: `element_queued_${index + 1}`,
      name: `queued ${index + 1}`,
      status: "queued" as const,
      message: "Queued for Codex controller.",
      startedAt: null,
      finishedAt: null,
      artifactPaths: {},
    }));
    const task = taskFixture({
      taskId: "task_202606240940000000_codex-final-batch",
      type: "codex_final_batch",
      status: "running",
      total: 22,
      done: 0,
      skipped: 0,
      metadata: {
        codexFinalControllerCount: 3,
        codexFinalCapacity: 18,
      },
      items: [
        {
          elementId: "element_running",
          name: "running item",
          status: "running",
          message: "Codex subagent is generating raw image.",
          startedAt: "2026-06-24T09:39:45+00:00",
          finishedAt: null,
          artifactPaths: {
            controllerId: "controller-b",
            attempt: 2,
            jobStatus: "agent_running",
            leaseExpiresAt: leaseExpiresInThreeMinutes,
            startedAt: "2026-06-24T09:39:45+00:00",
            heartbeatAt: "2026-06-24T09:40:00+00:00",
          },
        },
        ...claimedItems,
        ...queuedItems,
      ],
    });

    render(<WorkspaceTaskPanel tasks={[task]} onRetryFailedTask={() => {}} />);

    const taskPanel = screen.getByRole("region", { name: /workspace tasks/i });
    expect(within(taskPanel).getByLabelText(/0 succeeded, 1 running, 17 claimed, 4 queued, 0 failed, 0 skipped out of 22 task items/i)).toBeInTheDocument();
    expect(within(taskPanel).queryByText(/Showing 22\/22 items/i)).not.toBeInTheDocument();
    await userEvent.click(within(taskPanel).getByRole("button", { name: /expand task progress/i }));

    expect(within(taskPanel).getByText(/Showing 22\/22 items/i)).toBeInTheDocument();
    expect(within(taskPanel).getAllByRole("listitem")).toHaveLength(22);
    expect(taskPanel).toHaveTextContent(/controller-a · attempt 1 · claimed · lease expires in 5m/i);
    expect(taskPanel).toHaveTextContent(/controller-b · attempt 2 · agent running · lease expires in 3m/i);
    expect(taskPanel).not.toHaveTextContent(/prompt\.md/i);
    expect(taskPanel).not.toHaveTextContent(/codex-final-jobs\.json/i);
    expect(taskPanel).not.toHaveTextContent(/codex_raw\.png/i);
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

  it("lets the operator stop active Codex generation from the top bar", async () => {
    const user = userEvent.setup();
    const state = workspace([baseElement]);
    const runningTask = taskFixture({
      taskId: "task_running_codex_final",
      type: "codex_final_batch",
      status: "running",
      total: 1,
      done: 0,
      failed: 0,
      skipped: 0,
      items: [
        {
          elementId: "element_001",
          name: "cat",
          status: "running",
          message: "Codex subagent is generating raw image.",
          startedAt: "2026-06-24T09:40:01+00:00",
          finishedAt: null,
          artifactPaths: {
            controllerId: "controller-a",
            jobId: "job-a",
          },
        },
      ],
    });
    const failedTask = {
      ...runningTask,
      status: "failed",
      failed: 1,
      items: runningTask.items.map((item) => ({
        ...item,
        status: "failed",
        message: "Manually stopped: Codex generation was stopped by the operator.",
        finishedAt: "2026-06-24T09:42:00+00:00",
      })),
    } satisfies WorkspaceTask;
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/runs" && (!init || init.method === "GET")) {
        return jsonResponse({ detail: "legacy mode" }, 500);
      }
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(state);
      }
      if (input === "/api/workspace/tasks" && (!init || init.method === "GET")) {
        return jsonResponse({ tasks: [runningTask] });
      }
      if (input === "/api/workspace/workflow" && (!init || init.method === "GET")) {
        return jsonResponse({
          stage: "generate",
          generateSelection: { element_001: true },
          stageSnapshots: {},
          taskIds: {
            sam2MaskBatch: null,
            codexFinalBatches: [runningTask.taskId],
          },
          lastExportSummary: null,
        });
      }
      if (input === "/api/workspace/tasks/codex-final/stop-all" && init?.method === "POST") {
        return jsonResponse({
          matchedProcessCount: 3,
          terminatedProcessCount: 3,
          failedTaskCount: 1,
          failedJobCount: 1,
          errors: [],
          tasks: [failedTask],
        });
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      const topAppBar = await screen.findByRole("banner");
      await user.click(await within(topAppBar).findByRole("button", { name: /stop codex generation/i }));
      const dialog = await screen.findByRole("alertdialog", { name: /stop codex generation/i });
      await user.click(within(dialog).getByRole("button", { name: /stop codex generation/i }));

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith(
          "/api/workspace/tasks/codex-final/stop-all",
          expect.objectContaining({ method: "POST" }),
        );
      });
      expect(await screen.findByRole("region", { name: /workspace tasks/i })).toHaveTextContent(/1 failed/i);
    } finally {
      restoreFetch();
    }
  });

  it("reruns the selected Codex final from the prompt send button while another final is running", async () => {
    const user = userEvent.setup();
    const bathtub = {
      ...baseElement,
      id: "element_001",
      name: "bathtub",
      label: "bathtub",
      sourceProvider: "codex_cli",
      sourcePrompt: "bathtub final",
      exportStatus: "ready",
    } satisfies WorkspaceElement;
    const toilet = {
      ...baseElement,
      id: "element_002",
      name: "toilet",
      label: "toilet",
      thumbnail: "elements/element_002/thumb.png",
      mask: "elements/element_002/sam2_edge/mask.png",
    } satisfies WorkspaceElement;
    const state = workspace([bathtub, toilet]);
    const workflow = {
      stage: "generate",
      generateSelection: { element_001: true, element_002: true },
      generatePromptHints: {},
      stageSnapshots: {},
      taskIds: {
        sam2MaskBatch: null,
        codexFinalBatches: ["task_running"],
      },
      lastExportSummary: null,
    };
    const runningTask = taskFixture({
      taskId: "task_running",
      type: "codex_final_batch",
      status: "running",
      total: 1,
      done: 0,
      items: [
        {
          elementId: "element_002",
          name: "toilet",
          status: "running",
          message: "Generating Codex final asset.",
          startedAt: "2026-06-23T04:10:00+00:00",
          finishedAt: null,
          artifactPaths: {},
        },
      ],
    });
    const rerunTask = taskFixture({
      taskId: "task_rerun_bathtub",
      type: "codex_final_batch",
      status: "running",
      total: 1,
      done: 0,
      items: [
        {
          elementId: "element_001",
          name: "bathtub",
          status: "queued",
          message: "Waiting for Codex final.",
          startedAt: null,
          finishedAt: null,
          artifactPaths: {
            promptHint: "remove the metal valve",
          },
        },
      ],
    });
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/runs" && (!init || init.method === "GET")) {
        return jsonResponse({ detail: "legacy mode" }, 500);
      }
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(state);
      }
      if (input === "/api/workspace/tasks" && (!init || init.method === "GET")) {
        return jsonResponse({ tasks: [runningTask] });
      }
      if (input === "/api/workspace/workflow" && (!init || init.method === "GET")) {
        return jsonResponse(workflow);
      }
      if (input === "/api/workspace/workflow/generate-prompts" && init?.method === "PATCH") {
        return jsonResponse({
          ...workflow,
          generatePromptHints: { element_001: "remove the metal valve" },
        });
      }
      if (String(input).includes("/codex-final/request") && (!init || init.method === "GET")) {
        return jsonResponse({ detail: "Codex request metadata not found." }, 404);
      }
      if (input === "/api/workspace/stage/generate" && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toMatchObject({
          elementIds: ["element_001"],
          force: true,
          promptHints: { element_001: "remove the metal valve" },
        });
        return jsonResponse({
          state,
          workflow: {
            ...workflow,
            generatePromptHints: { element_001: "remove the metal valve" },
            taskIds: {
              sam2MaskBatch: null,
              codexFinalBatches: ["task_rerun_bathtub", "task_running"],
            },
          },
          task: rerunTask,
        });
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      const promptBox = await screen.findByRole("textbox", { name: /prompt hint/i });
      await user.type(promptBox, "remove the metal valve");
      await user.click(await screen.findByRole("button", { name: /rerun bathtub with prompt hint/i }));

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith(
          "/api/workspace/stage/generate",
          expect.objectContaining({ method: "POST" }),
        );
      });
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

  it("does not bump asset cache when task polling reloads unchanged workspace images", async () => {
    const state = workspace([baseElement]);
    const runningTask = taskFixture({
      taskId: "task_202606240940000000_codex-final-batch",
      type: "codex_final_batch",
      status: "running",
      total: 1,
      done: 0,
      skipped: 0,
      items: [
        {
          elementId: "element_001",
          name: "cat",
          status: "running",
          message: "Codex subagent is generating raw image.",
          startedAt: "2026-06-24T09:40:01+00:00",
          finishedAt: null,
          artifactPaths: {},
        },
      ],
    });
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/tasks" && (!init || init.method === "GET")) {
        return jsonResponse({ tasks: [runningTask] });
      }
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(state);
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<TaskControllerProbe initialWorkspace={state} />);

      await userEvent.click(screen.getByRole("button", { name: /refresh tasks with workspace/i }));

      await waitFor(() => {
        expect(screen.getByTestId("task-count")).toHaveTextContent("1");
      });
      expect(screen.getByTestId("asset-cache-key")).toHaveTextContent("0");
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
    workspace: workspaceState,
    workspaceHasSource: true,
  });

  return (
    <div>
      <button type="button" onClick={() => void controller.handleStartSam2MaskTask()}>
        Start SAM2
      </button>
      <button type="button" onClick={() => void controller.refreshTasks({ refreshWorkspace: true })}>
        Refresh tasks with workspace
      </button>
      <span data-testid="segmentation-status">{workspaceState.elements[0]?.segmentationStatus}</span>
      <span data-testid="asset-cache-key">{assetCacheKey}</span>
      <span data-testid="task-count">{controller.tasks.length}</span>
    </div>
  );
}
