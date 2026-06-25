import { useState } from "react";

import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Loader2, RotateCcw, SkipForward, X } from "lucide-react";

import {
  displayWorkspaceTaskItems,
  latestWorkspaceTask,
  summarizeWorkspaceTaskForDisplay,
  taskItemStatusLabel,
  taskStatusTone,
  taskTypeLabel,
  type WorkspaceTask,
  type WorkspaceTaskItem,
  type WorkspacePendingTask,
} from "../../domain/workspaceTasks";
import { codexFinalQualityArtifactBadge } from "../../domain/workspaceTaskArtifacts";

type WorkspaceTaskPanelProps = {
  pendingTask?: WorkspacePendingTask | null;
  tasks: WorkspaceTask[];
  onRetryFailedTask: (taskId: string) => void;
};

export function WorkspaceTaskPanel({ pendingTask = null, tasks, onRetryFailedTask }: WorkspaceTaskPanelProps) {
  const [dismissedTaskId, setDismissedTaskId] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const task = latestWorkspaceTask(tasks) ?? pendingTaskToWorkspaceTask(pendingTask);
  if (!task || task.taskId === dismissedTaskId) {
    return null;
  }

  const summary = summarizeWorkspaceTaskForDisplay(task);
  const hasFailures = summary.failed > 0;
  const displayItems = displayWorkspaceTaskItems(task);

  return (
    <WorkspaceTaskPanelSurface
      task={task}
      summary={summary}
      hasFailures={hasFailures}
      isCollapsed={isCollapsed}
      displayItems={displayItems}
      onCollapsedChange={setIsCollapsed}
      onDismiss={() => setDismissedTaskId(task.taskId)}
      onRetryFailedTask={onRetryFailedTask}
    />
  );
}

function WorkspaceTaskPanelSurface({
  task,
  summary,
  hasFailures,
  isCollapsed,
  displayItems,
  onCollapsedChange,
  onDismiss,
  onRetryFailedTask,
}: {
  task: WorkspaceTask;
  summary: ReturnType<typeof summarizeWorkspaceTaskForDisplay>;
  hasFailures: boolean;
  isCollapsed: boolean;
  displayItems: WorkspaceTaskItem[];
  onCollapsedChange: (nextValue: boolean) => void;
  onDismiss: () => void;
  onRetryFailedTask: (taskId: string) => void;
}) {
  const controllerSummary = codexControllerSummary(task);
  return (
    <section
      className={`workspace-task-panel${isCollapsed ? " is-collapsed" : ""}`}
      aria-label="Workspace tasks"
    >
      <div className="workspace-task-panel-header">
        <div className="workspace-task-panel-drag-handle">
          <span className={`workspace-task-icon is-${task.status}`}>
            {task.status === "running" || task.status === "queued" ? (
              <Loader2 size={15} aria-hidden="true" className="is-spinning" />
            ) : task.status === "failed" ? (
              <AlertTriangle size={15} aria-hidden="true" />
            ) : (
              <CheckCircle2 size={15} aria-hidden="true" />
            )}
          </span>
          <div>
            <h2>{taskTypeLabel(task.type)}</h2>
            <p>
              {summary.done}/{summary.total} succeeded
              {summary.running > 0 ? `, ${summary.running} running` : ""}
              {summary.claimed > 0 ? `, ${summary.claimed} claimed` : ""}
              {summary.queued > 0 ? `, ${summary.queued} queued` : ""}
              {summary.failed > 0 ? `, ${summary.failed} failed` : ""}
              {summary.skipped > 0 ? `, ${summary.skipped} skipped` : ""}
              {summary.unchanged > 0 ? `, ${summary.unchanged} unchanged` : ""}
              {controllerSummary ? ` · ${controllerSummary}` : ""}
            </p>
          </div>
        </div>
        {hasFailures && task.taskId !== "__pending_task__" ? (
          <button type="button" className="task-retry-button" onClick={() => onRetryFailedTask(task.taskId)}>
            <RotateCcw size={14} aria-hidden="true" />
            Retry failed
          </button>
        ) : null}
        <button
          type="button"
          className="task-panel-close-button"
          aria-label={`${isCollapsed ? "Expand" : "Collapse"} task progress`}
          aria-pressed={isCollapsed}
          onClick={() => onCollapsedChange(!isCollapsed)}
        >
          {isCollapsed ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronUp size={15} aria-hidden="true" />}
        </button>
        <button
          type="button"
          className="task-panel-close-button"
          aria-label="Dismiss task progress"
          onClick={onDismiss}
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>
      <div
        className="workspace-task-progress"
        aria-label={taskProgressAriaLabel(summary)}
      >
        {taskProgressSegments(summary).map((segment) => (
          <span
            key={segment.key}
            className={`is-${segment.key}`}
            style={{ width: `${segment.percent}%` }}
          />
        ))}
      </div>
      {!isCollapsed && displayItems.length > 0 ? (
        <>
          <div className="workspace-task-items-summary">
            Showing {displayItems.length}/{summary.total} items
          </div>
          <ul className="workspace-task-items">
            {displayItems.map((item) => (
              <TaskItemRow key={`${task.taskId}-${item.elementId}`} item={item} />
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function TaskItemRow({ item }: { item: WorkspaceTaskItem }) {
  const compactMetadata = compactTaskItemMetadata(item);
  const qualityBadge = codexFinalQualityArtifactBadge(item.artifactPaths);
  const failedQualityBadge = qualityBadge?.status === "failed" ? qualityBadge : null;
  const rowTone = failedQualityBadge ? `is-${failedQualityBadge.tone}` : taskStatusTone(item.status);
  return (
    <li className={`workspace-task-item ${rowTone}`}>
      <span className="task-item-status">
        {item.status === "skipped" ? <SkipForward size={13} aria-hidden="true" /> : null}
        {failedQualityBadge?.label ?? taskItemStatusLabel(item.status)}
      </span>
      <strong>{item.name}</strong>
      {item.message ? <span>{item.message}</span> : null}
      {compactMetadata ? <span className="task-item-compact-meta">{compactMetadata}</span> : null}
    </li>
  );
}

function codexControllerSummary(task: WorkspaceTask): string {
  const metadata = task.metadata ?? {};
  const controllerCount = metadata.codexFinalControllerCount;
  const capacity = metadata.codexFinalCapacity;
  if (typeof controllerCount !== "number" || controllerCount <= 0) {
    return "";
  }
  return typeof capacity === "number" && capacity > 0
    ? `${controllerCount} controllers · capacity ${capacity}`
    : `${controllerCount} controllers`;
}

function compactTaskItemMetadata(item: WorkspaceTaskItem): string {
  const controllerId = item.artifactPaths.controllerId;
  const attempt = item.artifactPaths.attempt;
  const jobStatus = item.artifactPaths.jobStatus;
  const leaseExpiresAt = item.artifactPaths.leaseExpiresAt;
  const parts: string[] = [];
  if (typeof controllerId === "string" && controllerId.trim()) {
    parts.push(controllerId);
  }
  if (typeof attempt === "number" && attempt > 0) {
    parts.push(`attempt ${attempt}`);
  }
  if (typeof jobStatus === "string" && jobStatus.trim()) {
    parts.push(formatJobStatus(jobStatus));
  }
  const leaseStatus = formatLeaseStatus(leaseExpiresAt);
  if (leaseStatus) {
    parts.push(leaseStatus);
  }
  return parts.join(" · ");
}

type ProgressSegmentKey = "succeeded" | "running" | "claimed" | "failed" | "skipped" | "queued";

function taskProgressSegments(summary: ReturnType<typeof summarizeWorkspaceTaskForDisplay>) {
  const total = Math.max(0, summary.total);
  const segments: Array<{ key: ProgressSegmentKey; value: number }> = [
    { key: "succeeded", value: summary.done },
    { key: "running", value: summary.running },
    { key: "claimed", value: summary.claimed },
    { key: "failed", value: summary.failed },
    { key: "skipped", value: summary.skipped },
    { key: "queued", value: summary.queued },
  ];
  return segments
    .filter((segment) => total > 0 && segment.value > 0)
    .map((segment) => ({
      key: segment.key,
      percent: (segment.value / total) * 100,
    }));
}

function taskProgressAriaLabel(summary: ReturnType<typeof summarizeWorkspaceTaskForDisplay>): string {
  const counts = [
    `${summary.done} succeeded`,
    `${summary.running} running`,
    `${summary.claimed} claimed`,
    `${summary.queued} queued`,
    `${summary.failed} failed`,
    `${summary.skipped} skipped`,
  ].join(", ");
  return `${counts} out of ${summary.total} task items`;
}

function formatJobStatus(value: string): string {
  return value.replace(/_/g, " ").trim();
}

function formatLeaseStatus(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }
  const expiresAt = Date.parse(value);
  if (!Number.isFinite(expiresAt)) {
    return "";
  }
  const deltaMs = expiresAt - Date.now();
  const duration = formatLeaseDuration(Math.abs(deltaMs));
  return deltaMs >= 0 ? `lease expires in ${duration}` : `lease expired ${duration} ago`;
}

function formatLeaseDuration(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function pendingTaskToWorkspaceTask(pendingTask: WorkspacePendingTask | null): WorkspaceTask | null {
  if (!pendingTask) {
    return null;
  }
  return {
    taskId: "__pending_task__",
    type: pendingTask.type,
    status: "running",
    createdAt: "",
    updatedAt: "",
    total: 1,
    done: 0,
    failed: 0,
    skipped: 0,
    items: [
      {
        elementId: "pending_task",
        name: taskTypeLabel(pendingTask.type),
        status: "running",
        message: pendingTask.message,
        startedAt: null,
        finishedAt: null,
        artifactPaths: {},
      },
    ],
    metadata: {},
  };
}
