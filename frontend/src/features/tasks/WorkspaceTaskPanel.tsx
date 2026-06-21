import { useRef, useState, type MutableRefObject } from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";

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
} from "../../domain/workspaceTasks";

type WorkspaceTaskPanelProps = {
  tasks: WorkspaceTask[];
  onRetryFailedTask: (taskId: string) => void;
};

export function WorkspaceTaskPanel({ tasks, onRetryFailedTask }: WorkspaceTaskPanelProps) {
  const [dismissedTaskId, setDismissedTaskId] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [panelPosition, setPanelPosition] = useState<{ left: number; top: number } | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const task = latestWorkspaceTask(tasks);
  if (!task || task.taskId === dismissedTaskId) {
    return null;
  }

  const summary = summarizeWorkspaceTaskForDisplay(task);
  const hasFailures = summary.failed > 0;
  const notableItems = displayWorkspaceTaskItems(task).slice(0, 6);

  return (
    <DndContext
      sensors={sensors}
      onDragEnd={handleDragEnd}
    >
      <WorkspaceTaskPanelSurface
        panelRef={panelRef}
        position={panelPosition}
        task={task}
        summary={summary}
        hasFailures={hasFailures}
        isCollapsed={isCollapsed}
        notableItems={notableItems}
        onCollapsedChange={setIsCollapsed}
        onDismiss={() => setDismissedTaskId(task.taskId)}
        onRetryFailedTask={onRetryFailedTask}
      />
    </DndContext>
  );

  function handleDragEnd(_event: DragEndEvent) {
    const panel = panelRef.current;
    if (!panel) {
      return;
    }
    const rect = panel.getBoundingClientRect();
    setPanelPosition({
      left: clamp(rect.left, 8, window.innerWidth - rect.width - 8),
      top: clamp(rect.top, 8, window.innerHeight - rect.height - 8),
    });
  }
}

function WorkspaceTaskPanelSurface({
  panelRef,
  position,
  task,
  summary,
  hasFailures,
  isCollapsed,
  notableItems,
  onCollapsedChange,
  onDismiss,
  onRetryFailedTask,
}: {
  panelRef: MutableRefObject<HTMLElement | null>;
  position: { left: number; top: number } | null;
  task: WorkspaceTask;
  summary: ReturnType<typeof summarizeWorkspaceTaskForDisplay>;
  hasFailures: boolean;
  isCollapsed: boolean;
  notableItems: WorkspaceTaskItem[];
  onCollapsedChange: (nextValue: boolean) => void;
  onDismiss: () => void;
  onRetryFailedTask: (taskId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: "workspace-task-panel",
  });

  function setPanelNode(node: HTMLElement | null) {
    setNodeRef(node);
    panelRef.current = node;
  }

  return (
    <section
      ref={setPanelNode}
      className={`workspace-task-panel${isCollapsed ? " is-collapsed" : ""}`}
      aria-label="Workspace tasks"
      style={{
        ...(position ? { left: position.left, top: position.top, right: "auto" } : {}),
        transform: transform ? toDragTransform(transform.x, transform.y) : undefined,
      }}
    >
      <div className="workspace-task-panel-header">
        <div className="workspace-task-panel-drag-handle" {...attributes} {...listeners}>
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
              {summary.queued > 0 ? `, ${summary.queued} queued` : ""}
              {summary.failed > 0 ? `, ${summary.failed} failed` : ""}
              {summary.skipped > 0 ? `, ${summary.skipped} skipped` : ""}
              {summary.unchanged > 0 ? `, ${summary.unchanged} unchanged` : ""}
            </p>
          </div>
        </div>
        {hasFailures ? (
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
        aria-label={`${summary.done} of ${summary.total} task items succeeded`}
      >
        <span style={{ width: `${summary.total > 0 ? (summary.done / summary.total) * 100 : 0}%` }} />
      </div>
      {!isCollapsed && notableItems.length > 0 ? (
        <ul className="workspace-task-items">
          {notableItems.map((item) => (
            <TaskItemRow key={`${task.taskId}-${item.elementId}`} item={item} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function TaskItemRow({ item }: { item: WorkspaceTaskItem }) {
  return (
    <li className={`workspace-task-item ${taskStatusTone(item.status)}`}>
      <span className="task-item-status">
        {item.status === "skipped" ? <SkipForward size={13} aria-hidden="true" /> : null}
        {taskItemStatusLabel(item.status)}
      </span>
      <strong>{item.name}</strong>
      {item.message ? <span>{item.message}</span> : null}
    </li>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toDragTransform(x: number, y: number): string {
  return `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
}
