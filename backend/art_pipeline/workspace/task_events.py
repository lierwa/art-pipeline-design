from __future__ import annotations

import threading
from pathlib import Path


_CONDITIONS: dict[str, threading.Condition] = {}
_VERSIONS: dict[str, int] = {}
_GUARD = threading.Lock()


def notify_workspace_task_change(workspace_root: Path) -> None:
    key = _workspace_key(workspace_root)
    condition = _condition_for_key(key)
    with condition:
        _VERSIONS[key] = _VERSIONS.get(key, 0) + 1
        condition.notify_all()


def task_event_version(workspace_root: Path) -> int:
    key = _workspace_key(workspace_root)
    with _GUARD:
        return _VERSIONS.get(key, 0)


def wait_for_workspace_task_change(
    workspace_root: Path,
    previous_version: int,
    timeout_seconds: float,
) -> int:
    key = _workspace_key(workspace_root)
    condition = _condition_for_key(key)
    with condition:
        condition.wait_for(
            lambda: _VERSIONS.get(key, 0) != previous_version,
            timeout=timeout_seconds,
        )
        return _VERSIONS.get(key, 0)


def _condition_for_key(key: str) -> threading.Condition:
    with _GUARD:
        condition = _CONDITIONS.get(key)
        if condition is None:
            condition = threading.Condition()
            _CONDITIONS[key] = condition
            _VERSIONS.setdefault(key, 0)
        return condition


def _workspace_key(workspace_root: Path) -> str:
    return str(workspace_root.resolve())
