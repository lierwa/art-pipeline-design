import { workspaceApiUrl, type WorkspaceElement } from "./workspace";
import { isPendingCodexFinalElement } from "./workspaceDerived";
import type { CodexFinalTaskRequest, Fetcher } from "./workspaceApi";

export type WorkspaceTaskType = "sam2_mask_batch" | "codex_final_batch";
export type WorkspaceTaskStatus = "queued" | "running" | "succeeded" | "failed";
export type WorkspaceTaskItemStatus = "queued" | "running" | "succeeded" | "failed" | "skipped";

export type WorkspaceTaskItem = {
  elementId: string;
  name: string;
  status: WorkspaceTaskItemStatus;
  message: string;
  startedAt: string | null;
  finishedAt: string | null;
  artifactPaths: Record<string, unknown>;
};

export type WorkspaceTask = {
  taskId: string;
  type: WorkspaceTaskType;
  status: WorkspaceTaskStatus;
  createdAt: string;
  updatedAt: string;
  total: number;
  done: number;
  failed: number;
  skipped: number;
  items: WorkspaceTaskItem[];
};

export type WorkspaceTasksResponse = {
  tasks: WorkspaceTask[];
};

export type WorkspaceTaskEventPayload = WorkspaceTasksResponse & {
  changedElementIds: string[];
};

export type WorkspaceTaskItemIndex = Record<string, WorkspaceTaskItem>;

export type WorkspaceTaskDisplaySummary = {
  total: number;
  done: number;
  failed: number;
  skipped: number;
  queued: number;
  running: number;
  unchanged: number;
};

export async function fetchWorkspaceTasks(
  runId: string | null = null,
  fetcher: Fetcher = fetch,
): Promise<WorkspaceTasksResponse> {
  return requestTaskJson<WorkspaceTasksResponse>(
    fetcher,
    workspaceApiUrl("/api/workspace/tasks", runId),
    { method: "GET" },
    "Could not load workspace tasks.",
  );
}

export async function startSam2MaskTask(
  runId: string | null = null,
  fetcher: Fetcher = fetch,
): Promise<WorkspaceTask> {
  return requestTaskJson<WorkspaceTask>(
    fetcher,
    workspaceApiUrl("/api/workspace/tasks/sam2-masks", runId),
    { method: "POST" },
    "Could not start SAM2 mask task.",
  );
}

export async function startCodexFinalTask(
  runId: string | null = null,
  request: CodexFinalTaskRequest = {},
  fetcher: Fetcher = fetch,
): Promise<WorkspaceTask> {
  return requestTaskJson<WorkspaceTask>(
    fetcher,
    workspaceApiUrl("/api/workspace/tasks/codex-finals", runId),
    jsonTaskRequest("POST", request),
    "Could not start Codex final task.",
  );
}

export async function retryFailedWorkspaceTask(
  taskId: string,
  runId: string | null = null,
  fetcher: Fetcher = fetch,
): Promise<WorkspaceTask> {
  return requestTaskJson<WorkspaceTask>(
    fetcher,
    workspaceApiUrl(`/api/workspace/tasks/${taskId}/retry-failed`, runId),
    { method: "POST" },
    "Could not retry failed task items.",
  );
}

export function hasRunningWorkspaceTask(tasks: WorkspaceTask[]): boolean {
  return tasks.some((task) => task.status === "queued" || task.status === "running");
}

export function latestWorkspaceTask(tasks: WorkspaceTask[]): WorkspaceTask | null {
  return tasks[0] ?? null;
}

export function buildTaskItemIndex(
  tasks: WorkspaceTask[],
  elements: WorkspaceElement[] = [],
): WorkspaceTaskItemIndex {
  const index: WorkspaceTaskItemIndex = {};
  const elementById = new Map(elements.map((element) => [element.id, element]));
  for (const task of tasks) {
    for (const item of task.items) {
      if (isInformationalTaskSkip(item)) {
        continue;
      }
      if (!isTaskItemConsistentWithElement(task, item, elementById.get(item.elementId))) {
        continue;
      }
      // WHY: 右侧资产列表只展示最新任务语义；列表已按 updatedAt/createdAt 倒序，
      // 所以第一次写入就是当前用户最需要解释的状态。
      if (!index[item.elementId]) {
        index[item.elementId] = item;
      }
    }
  }
  return index;
}

export function summarizeWorkspaceTaskForDisplay(task: WorkspaceTask): WorkspaceTaskDisplaySummary {
  const activeItems = task.items.filter((item) => !isInformationalTaskSkip(item));
  const done = activeItems.filter((item) => item.status === "succeeded").length;
  const failed = activeItems.filter((item) => item.status === "failed").length;
  const skipped = activeItems.filter((item) => item.status === "skipped").length;
  const queued = activeItems.filter((item) => item.status === "queued").length;
  const running = activeItems.filter((item) => item.status === "running").length;
  // WHY: 旧任务记录可能已经把“已有 mask / 合并源框”计入 total 和 skipped；
  // 展示层把这些还原成 unchanged，避免用户误读成 SAM2 漏跑或失败。
  const unchanged = Math.max(0, task.total - activeItems.length);
  return {
    total: Math.max(activeItems.length, task.total - unchanged),
    done,
    failed,
    skipped,
    queued,
    running,
    unchanged,
  };
}

export function displayWorkspaceTaskItems(task: WorkspaceTask): WorkspaceTaskItem[] {
  const activeItems = task.items.filter((item) => !isInformationalTaskSkip(item));
  return [
    ...activeItems.filter((item) => item.status === "running"),
    ...activeItems.filter((item) => item.status === "failed"),
    ...activeItems.filter((item) => item.status === "succeeded"),
    ...activeItems.filter((item) => item.status === "skipped"),
    ...activeItems.filter((item) => item.status === "queued"),
  ];
}

export function isInformationalTaskSkip(item: WorkspaceTaskItem): boolean {
  if (item.status !== "skipped") {
    return false;
  }
  const message = item.message.toLowerCase();
  return [
    "already ready for review",
    "already accepted",
    "already exists",
    "source box is merged into",
    "asset is hidden",
  ].some((token) => message.includes(token));
}

function isTaskItemConsistentWithElement(
  task: WorkspaceTask,
  item: WorkspaceTaskItem,
  element: WorkspaceElement | undefined,
): boolean {
  if (!element || item.status !== "succeeded") {
    return true;
  }
  if (task.type === "sam2_mask_batch") {
    return (
      ["mask_suggested", "mask_accepted"].includes(element.segmentationStatus)
      && Boolean(element.mask)
    );
  }
  return (
    element.sourceProvider === "codex_cli"
    && ["ready", "exported"].includes(element.exportStatus)
  );
}

export function countRunningTaskItems(task: WorkspaceTask): number {
  return task.items.filter((item) => item.status === "running").length;
}

export function countQueuedTaskItems(task: WorkspaceTask): number {
  return task.items.filter((item) => item.status === "queued").length;
}

export function taskTypeLabel(type: WorkspaceTaskType): string {
  return type === "sam2_mask_batch" ? "SAM2 mask batch" : "Codex final batch";
}

export function taskItemStatusLabel(status: WorkspaceTaskItemStatus): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "succeeded":
      return "Done";
    case "failed":
      return "Failed";
    case "skipped":
      return "Skipped";
  }
}

export function taskStatusTone(status: WorkspaceTaskItemStatus): string {
  switch (status) {
    case "succeeded":
      return "is-success";
    case "failed":
      return "is-danger";
    case "skipped":
      return "is-muted";
    case "running":
      return "is-progress";
    case "queued":
      return "is-queued";
  }
}

export function buildCodexFinalTargetIds(elements: WorkspaceElement[]): string[] {
  return elements.filter(isPendingCodexFinalElement).map((element) => element.id);
}

async function requestTaskJson<T>(
  fetcher: Fetcher,
  input: RequestInfo | URL,
  init: RequestInit,
  fallbackError: string,
): Promise<T> {
  const response = await fetcher(input, init);
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail ?? fallbackError);
  }
  return (await response.json()) as T;
}

function jsonTaskRequest(method: "POST", body: unknown): RequestInit {
  return {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}
