import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";

import {
  fetchWorkspaceTasks,
  hasRunningWorkspaceTask,
  retryFailedWorkspaceTask,
  startCodexFinalTask,
  startSam2MaskTask,
  type WorkspaceTask,
  type WorkspaceTaskEventPayload,
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
  workspaceHasSource: boolean;
};

export function useWorkspaceTaskController({
  activeRunId,
  setAssetCacheKey,
  setError,
  setStatus,
  setWorkspace,
  workspaceHasSource,
}: UseWorkspaceTaskControllerInput) {
  const [tasks, setTasks] = useState<WorkspaceTask[]>([]);
  const [isStartingSam2MaskTask, setIsStartingSam2MaskTask] = useState(false);
  const [isStartingCodexFinalTask, setIsStartingCodexFinalTask] = useState(false);
  const hasActiveTask = useMemo(() => hasRunningWorkspaceTask(tasks), [tasks]);

  useEffect(() => {
    if (!workspaceHasSource) {
      setTasks([]);
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
      if (payload.changedElementIds.length > 0) {
        void refreshWorkspaceState();
      }
    });
    events.onerror = () => {
      void refreshTasks({ silent: true, refreshWorkspace: true });
    };
    return () => events.close();
  }, [activeRunId, workspaceHasSource]);

  async function handleStartSam2MaskTask() {
    if (isStartingSam2MaskTask) {
      return;
    }
    setIsStartingSam2MaskTask(true);
    setStatus("Starting SAM2 mask batch...");
    setError(null);
    try {
      const task = await startSam2MaskTask(activeRunId);
      setTasks((current) => prependTask(task, current));
      if (!hasRunningWorkspaceTask([task])) {
        await refreshWorkspaceState();
      }
      setStatus("SAM2 mask batch started.");
    } catch (taskError) {
      setStatus("SAM2 mask batch failed to start.");
      setError(taskError instanceof Error ? taskError.message : "Could not start SAM2 mask task.");
    } finally {
      setIsStartingSam2MaskTask(false);
    }
  }

  async function handleStartCodexFinalTask() {
    if (isStartingCodexFinalTask) {
      return;
    }
    setIsStartingCodexFinalTask(true);
    setStatus("Starting Codex final batch...");
    setError(null);
    try {
      const task = await startCodexFinalTask(activeRunId);
      setTasks((current) => prependTask(task, current));
      if (!hasRunningWorkspaceTask([task])) {
        await refreshWorkspaceState();
      }
      setStatus("Codex final batch started.");
    } catch (taskError) {
      setStatus("Codex final batch failed to start.");
      setError(taskError instanceof Error ? taskError.message : "Could not start Codex final task.");
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

  async function handleTaskStarted(task: WorkspaceTask) {
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
    setWorkspace(normalizeWorkspaceState((await response.json()) as WorkspaceState));
    setAssetCacheKey((current) => current + 1);
  }

  return {
    handleRetryFailedTask,
    handleStartCodexFinalTask,
    handleStartSam2MaskTask,
    handleTaskStarted,
    hasActiveTask,
    isStartingCodexFinalTask,
    isStartingSam2MaskTask,
    refreshTasks,
    tasks,
  };
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
