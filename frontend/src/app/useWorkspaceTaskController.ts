import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

import {
  fetchWorkspaceTasks,
  hasRunningCodexFinalTask,
  hasRunningWorkspaceTask,
  retryFailedWorkspaceTask,
  startCodexFinalTask,
  startSam2MaskTask,
  stopCodexFinalTasks,
  type Sam2MaskTaskRequest,
  type WorkspaceTask,
  type WorkspaceTaskEventPayload,
  type WorkspacePendingTask,
} from "../domain/workspaceTasks";
import {
  normalizeWorkspaceState,
  workspaceApiUrl,
  type WorkspaceState,
} from "../domain/workspace";

type SetState<T> = Dispatch<SetStateAction<T>>;

type UseWorkspaceTaskControllerInput = {
  activeRunId: string | null;
  setAssetCacheKey: SetState<number>;
  setError: SetState<string | null>;
  setStatus: SetState<string>;
  setWorkspace: SetState<WorkspaceState>;
  workspace: WorkspaceState;
  workspaceHasSource: boolean;
};

export function useWorkspaceTaskController({
  activeRunId,
  setAssetCacheKey,
  setError,
  setStatus,
  setWorkspace,
  workspace,
  workspaceHasSource,
}: UseWorkspaceTaskControllerInput) {
  const [tasks, setTasks] = useState<WorkspaceTask[]>([]);
  const [pendingTask, setPendingTask] = useState<WorkspacePendingTask | null>(null);
  const [isStartingSam2MaskTask, setIsStartingSam2MaskTask] = useState(false);
  const [isStartingCodexFinalTask, setIsStartingCodexFinalTask] = useState(false);
  const [isStoppingCodexFinalTask, setIsStoppingCodexFinalTask] = useState(false);
  const workspaceAssetSignatureRef = useRef(workspaceAssetSignature(workspace));
  const hasActiveTask = useMemo(() => pendingTask !== null || hasRunningWorkspaceTask(tasks), [pendingTask, tasks]);
  const hasActiveCodexFinalTask = useMemo(
    () => pendingTask?.type === "codex_final_batch" || hasRunningCodexFinalTask(tasks),
    [pendingTask, tasks],
  );

  useEffect(() => {
    workspaceAssetSignatureRef.current = workspaceAssetSignature(workspace);
  }, [workspace]);

  useEffect(() => {
    if (!workspaceHasSource) {
      setTasks([]);
      setPendingTask(null);
      return;
    }
    void refreshTasks({ silent: true });
  }, [activeRunId, workspaceHasSource]);

  useEffect(() => {
    if (!workspaceHasSource || !hasActiveTask) {
      return;
    }
    if (typeof EventSource !== "undefined") {
      return;
    }
    const intervalId = window.setInterval(() => {
      void refreshTasks({ silent: true, refreshWorkspace: true });
    }, 5000);
    return () => window.clearInterval(intervalId);
  }, [activeRunId, hasActiveTask, workspaceHasSource]);

  useEffect(() => {
    if (!workspaceHasSource || typeof EventSource === "undefined") {
      return;
    }
    const events = new EventSource(workspaceApiUrl("/api/workspace/tasks/events", activeRunId));
    events.addEventListener("snapshot", (event) => {
      const payload = parseTaskEventPayload(event);
      if (!payload) {
        return;
      }
      setTasks(payload.tasks);
      setPendingTask((current) =>
        current && payload.tasks.some((task) => task.type === current.type)
          ? null
          : current
      );
      if (payload.changedElementIds.length > 0) {
        void refreshWorkspaceState();
      }
    });
    events.onerror = () => {
      void refreshTasks({ silent: true, refreshWorkspace: true });
    };
    return () => events.close();
  }, [activeRunId, workspaceHasSource]);

  async function handleStartSam2MaskTask(request: Sam2MaskTaskRequest = {}) {
    if (isStartingSam2MaskTask) {
      return;
    }
    const isForcedRerun = request.force === true;
    setIsStartingSam2MaskTask(true);
    setPendingTask({
      type: "sam2_mask_batch",
      message: isForcedRerun ? "Rerunning selected SAM2 masks." : "Starting SAM2 mask batch.",
    });
    setStatus(isForcedRerun ? "Rerunning selected SAM2 masks..." : "Starting SAM2 mask batch...");
    setError(null);
    try {
      const task = await startSam2MaskTask(activeRunId, request);
      setPendingTask(null);
      setTasks((current) => prependTask(task, current));
      if (!hasRunningWorkspaceTask([task])) {
        await refreshWorkspaceState();
      }
      setStatus(isForcedRerun ? "SAM2 mask rerun started." : "SAM2 mask batch started.");
    } catch (taskError) {
      setStatus(isForcedRerun ? "SAM2 mask rerun failed to start." : "SAM2 mask batch failed to start.");
      setError(taskError instanceof Error ? taskError.message : "Could not start SAM2 mask task.");
      setPendingTask(null);
    } finally {
      setIsStartingSam2MaskTask(false);
    }
  }

  async function handleStartCodexFinalTask() {
    if (isStartingCodexFinalTask) {
      return;
    }
    setIsStartingCodexFinalTask(true);
    setPendingTask({ type: "codex_final_batch", message: "Starting Codex final batch." });
    setStatus("Starting Codex final batch...");
    setError(null);
    try {
      const task = await startCodexFinalTask(activeRunId);
      setPendingTask(null);
      setTasks((current) => prependTask(task, current));
      if (!hasRunningWorkspaceTask([task])) {
        await refreshWorkspaceState();
      }
      setStatus("Codex final batch started.");
    } catch (taskError) {
      setStatus("Codex final batch failed to start.");
      setError(taskError instanceof Error ? taskError.message : "Could not start Codex final task.");
      setPendingTask(null);
    } finally {
      setIsStartingCodexFinalTask(false);
    }
  }

  async function handleRetryFailedTask(taskId: string) {
    setStatus("Retrying failed task items...");
    setError(null);
    try {
      const task = await retryFailedWorkspaceTask(taskId, activeRunId);
      setTasks((current) => prependTask(task, current));
      if (!hasRunningWorkspaceTask([task])) {
        await refreshWorkspaceState();
      }
      setStatus("Retry task started.");
    } catch (taskError) {
      setStatus("Retry failed.");
      setError(taskError instanceof Error ? taskError.message : "Could not retry failed task items.");
    }
  }

  async function handleStopCodexFinalTasks() {
    if (isStoppingCodexFinalTask) {
      return;
    }
    setIsStoppingCodexFinalTask(true);
    setStatus("Stopping Codex generation...");
    setError(null);
    try {
      const result = await stopCodexFinalTasks(activeRunId);
      setPendingTask(null);
      setTasks((current) => mergeStoppedTasks(result.tasks, current));
      setStatus(
        `Codex generation stopped. ${result.terminatedProcessCount} processes terminated, ${result.failedJobCount} jobs failed.`,
      );
      if (result.errors.length > 0) {
        setError(result.errors.join("\n"));
      }
    } catch (taskError) {
      setStatus("Codex generation stop failed.");
      setError(taskError instanceof Error ? taskError.message : "Could not stop Codex generation.");
    } finally {
      setIsStoppingCodexFinalTask(false);
    }
  }

  async function handleTaskStarted(task: WorkspaceTask) {
    setPendingTask(null);
    setTasks((current) => prependTask(task, current));
    if (!hasRunningWorkspaceTask([task])) {
      await refreshWorkspaceState();
    }
  }

  async function refreshTasks({
    silent = false,
    refreshWorkspace = false,
  }: {
    silent?: boolean;
    refreshWorkspace?: boolean;
  } = {}) {
    try {
      const response = await fetchWorkspaceTasks(activeRunId);
      setTasks(response.tasks);
      if (refreshWorkspace) {
        await refreshWorkspaceState();
      }
    } catch (taskError) {
      // WHY: 旧版单 workspace 和测试环境可能没有 task API；任务进度是增强面板，
      // 不能因为进度拉取失败阻断主画布加载。
      if (!silent) {
        setStatus("Task progress load failed.");
        setError(taskError instanceof Error ? taskError.message : "Could not load workspace tasks.");
      }
    }
  }

  async function refreshWorkspaceState() {
    const response = await fetch(workspaceApiUrl("/api/workspace/state", activeRunId));
    if (!response.ok) {
      return;
    }
    const nextWorkspace = normalizeWorkspaceState((await response.json()) as WorkspaceState);
    const nextSignature = workspaceAssetSignature(nextWorkspace);
    const shouldRefreshAssets = workspaceAssetSignatureRef.current !== nextSignature;
    workspaceAssetSignatureRef.current = nextSignature;
    setWorkspace(nextWorkspace);
    if (shouldRefreshAssets) {
      setAssetCacheKey((current) => current + 1);
    }
  }

  return {
    clearPendingTask: () => setPendingTask(null),
    handleRetryFailedTask,
    handleStopCodexFinalTasks,
    handleStartCodexFinalTask,
    handleStartSam2MaskTask,
    handleTaskStarted,
    hasActiveTask,
    hasActiveCodexFinalTask,
    isStartingCodexFinalTask,
    isStartingSam2MaskTask,
    isStoppingCodexFinalTask,
    pendingTask,
    refreshTasks,
    startPendingTask: setPendingTask,
    tasks,
  };
}

function workspaceAssetSignature(state: WorkspaceState): string {
  return JSON.stringify({
    source: state.source?.path ?? null,
    elements: state.elements.map((element) => ({
      id: element.id,
      thumbnail: element.thumbnail ?? null,
      mask: element.mask ?? null,
      sourceProvider: element.sourceProvider ?? null,
      sourcePrompt: element.sourcePrompt ?? null,
      sourcePromptHint: element.sourcePromptHint ?? null,
      generationProfile: element.generationProfile ?? null,
      exportStatus: element.exportStatus ?? null,
    })),
  });
}

function mergeStoppedTasks(stoppedTasks: WorkspaceTask[], tasks: WorkspaceTask[]): WorkspaceTask[] {
  if (stoppedTasks.length === 0) {
    return tasks;
  }
  const stoppedById = new Map(stoppedTasks.map((task) => [task.taskId, task]));
  return [
    ...stoppedTasks,
    ...tasks.filter((task) => !stoppedById.has(task.taskId)),
  ];
}

function prependTask(task: WorkspaceTask, tasks: WorkspaceTask[]): WorkspaceTask[] {
  return [
    task,
    ...tasks.filter((current) => current.taskId !== task.taskId),
  ];
}

function parseTaskEventPayload(event: Event): WorkspaceTaskEventPayload | null {
  if (!("data" in event) || typeof event.data !== "string") {
    return null;
  }
  try {
    const payload = JSON.parse(event.data) as WorkspaceTaskEventPayload;
    return {
      tasks: Array.isArray(payload.tasks) ? payload.tasks : [],
      changedElementIds: Array.isArray(payload.changedElementIds) ? payload.changedElementIds : [],
    };
  } catch {
    return null;
  }
}
