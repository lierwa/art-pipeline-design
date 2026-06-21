from __future__ import annotations

import json
import os
import re
import threading
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field


TaskType = Literal["sam2_mask_batch", "codex_final_batch"]
TaskStatus = Literal["queued", "running", "succeeded", "failed"]
TaskItemStatus = Literal["queued", "running", "succeeded", "failed", "skipped"]


class WorkspaceTaskItem(BaseModel):
    elementId: str
    name: str
    status: TaskItemStatus = "queued"
    message: str = ""
    startedAt: str | None = None
    finishedAt: str | None = None
    artifactPaths: dict[str, Any] = Field(default_factory=dict)


class WorkspaceTask(BaseModel):
    taskId: str
    type: TaskType
    status: TaskStatus = "queued"
    createdAt: str
    updatedAt: str
    total: int
    done: int = 0
    failed: int = 0
    skipped: int = 0
    items: list[WorkspaceTaskItem]


_LOCKS: dict[str, threading.Lock] = {}
_LOCKS_GUARD = threading.Lock()
_TASK_ID_PATTERN = re.compile(r"^task_[A-Za-z0-9_-]+$")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_workspace_task(
    workspace_root: Path,
    task_type: TaskType,
    items: list[WorkspaceTaskItem],
) -> WorkspaceTask:
    now = utc_now()
    task = summarize_workspace_task(WorkspaceTask(
        taskId=_next_task_id(workspace_root, task_type),
        type=task_type,
        createdAt=now,
        updatedAt=now,
        total=len(items),
        items=items,
    ))
    write_workspace_task(workspace_root, task)
    return task


def read_workspace_task(workspace_root: Path, task_id: str) -> WorkspaceTask:
    with _workspace_lock(workspace_root):
        return _read_task_unlocked(workspace_root, task_id)


def list_workspace_tasks(workspace_root: Path) -> list[WorkspaceTask]:
    with _workspace_lock(workspace_root):
        root = _tasks_root(workspace_root)
        if not root.exists():
            return []
        tasks = [
            WorkspaceTask.model_validate_json(path.read_text(encoding="utf-8"))
            for path in root.glob("task_*.json")
        ]
    return sorted(tasks, key=lambda task: task.createdAt, reverse=True)


def write_workspace_task(workspace_root: Path, task: WorkspaceTask) -> None:
    with _workspace_lock(workspace_root):
        _write_task_unlocked(workspace_root, task)


def update_workspace_task(
    workspace_root: Path,
    task_id: str,
    updater: Callable[[WorkspaceTask], WorkspaceTask],
) -> WorkspaceTask:
    with _workspace_lock(workspace_root):
        task = _read_task_unlocked(workspace_root, task_id)
        next_task = updater(task)
        summarized = summarize_workspace_task(next_task)
        _write_task_unlocked(workspace_root, summarized)
        return summarized


def summarize_workspace_task(task: WorkspaceTask) -> WorkspaceTask:
    done = sum(1 for item in task.items if item.status == "succeeded")
    failed = sum(1 for item in task.items if item.status == "failed")
    skipped = sum(1 for item in task.items if item.status == "skipped")
    terminal = done + failed + skipped
    if terminal >= task.total:
        status: TaskStatus = "failed" if failed > 0 else "succeeded"
    elif any(item.status == "running" for item in task.items):
        status = "running"
    else:
        status = "queued"
    return task.model_copy(
        update={
            "status": status,
            "updatedAt": utc_now(),
            "done": done,
            "failed": failed,
            "skipped": skipped,
        }
    )


def set_task_item_status(
    workspace_root: Path,
    task_id: str,
    element_id: str,
    status: TaskItemStatus,
    message: str = "",
    artifact_paths: dict[str, Any] | None = None,
) -> WorkspaceTask:
    now = utc_now()

    def update(task: WorkspaceTask) -> WorkspaceTask:
        items = []
        for item in task.items:
            if item.elementId != element_id:
                items.append(item)
                continue
            started_at = item.startedAt
            if status == "running" and not started_at:
                started_at = now
            finished_at = item.finishedAt
            if status in {"succeeded", "failed", "skipped"}:
                finished_at = now
            items.append(
                item.model_copy(
                    update={
                        "status": status,
                        "message": message,
                        "startedAt": started_at,
                        "finishedAt": finished_at,
                        "artifactPaths": artifact_paths or item.artifactPaths,
                    }
                )
            )
        return task.model_copy(update={"items": items})

    return update_workspace_task(workspace_root, task_id, update)


def mark_task_running(workspace_root: Path, task_id: str) -> WorkspaceTask:
    return update_workspace_task(
        workspace_root,
        task_id,
        lambda task: task.model_copy(update={"status": "running"}),
    )


def failed_task_element_ids(task: WorkspaceTask) -> list[str]:
    return [item.elementId for item in task.items if item.status == "failed"]


def _write_task_unlocked(workspace_root: Path, task: WorkspaceTask) -> None:
    path = _task_path(workspace_root, task.taskId)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(".json.tmp")
    temp_path.write_text(json.dumps(task.model_dump(mode="json"), indent=2), encoding="utf-8")
    os.replace(temp_path, path)


def _read_task_unlocked(workspace_root: Path, task_id: str) -> WorkspaceTask:
    path = _task_path(workspace_root, task_id)
    if not path.exists():
        raise FileNotFoundError(task_id)
    return WorkspaceTask.model_validate_json(path.read_text(encoding="utf-8"))


def _tasks_root(workspace_root: Path) -> Path:
    return workspace_root / "tasks"


def _task_path(workspace_root: Path, task_id: str) -> Path:
    if not _TASK_ID_PATTERN.fullmatch(task_id):
        raise FileNotFoundError(task_id)
    path = (_tasks_root(workspace_root) / f"{task_id}.json").resolve()
    path.relative_to(_tasks_root(workspace_root).resolve())
    return path


def _next_task_id(workspace_root: Path, task_type: TaskType) -> str:
    slug = task_type.replace("_", "-")
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
    base = f"task_{timestamp}_{slug}"
    candidate = base
    suffix = 2
    while _task_path(workspace_root, candidate).exists():
        candidate = f"{base}_{suffix}"
        suffix += 1
    return candidate


def _workspace_lock(workspace_root: Path) -> threading.Lock:
    key = str(workspace_root.resolve())
    with _LOCKS_GUARD:
        if key not in _LOCKS:
            _LOCKS[key] = threading.Lock()
        return _LOCKS[key]
