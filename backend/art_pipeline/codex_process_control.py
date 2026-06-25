from __future__ import annotations

import json
import os
import platform
import re
import signal
import subprocess
from dataclasses import dataclass, field


@dataclass(frozen=True)
class ProcessInfo:
    pid: int
    parent_pid: int
    command_line: str


@dataclass(frozen=True)
class CodexProcessStopResult:
    matched_process_count: int
    terminated_process_count: int
    errors: list[str] = field(default_factory=list)


_CODEX_EXEC_PATTERNS = (
    re.compile(r"\bcodex(?:\.cmd|\.exe)?\s+exec\b", re.IGNORECASE),
    re.compile(r"@openai[\\/]+codex.*\bexec\b", re.IGNORECASE),
    re.compile(r"bin[\\/]+codex(?:\.js)?\s+exec\b", re.IGNORECASE),
)


def stop_codex_exec_processes() -> CodexProcessStopResult:
    processes = _list_processes()
    target_pids = {
        process.pid
        for process in processes
        if _is_codex_exec_process(process.command_line)
    }
    if not target_pids:
        return CodexProcessStopResult(matched_process_count=0, terminated_process_count=0)

    children_by_parent = _children_by_parent(processes)
    expanded_pids = _expand_with_descendants(target_pids, children_by_parent)
    kill_roots = _root_targets(target_pids, {process.pid: process.parent_pid for process in processes})
    errors = (
        _kill_windows_process_trees(kill_roots)
        if platform.system().lower() == "windows"
        else _kill_posix_processes(expanded_pids, children_by_parent)
    )
    return CodexProcessStopResult(
        matched_process_count=len(target_pids),
        terminated_process_count=len(expanded_pids) - len(errors),
        errors=errors,
    )


def _is_codex_exec_process(command_line: str) -> bool:
    return any(pattern.search(command_line) for pattern in _CODEX_EXEC_PATTERNS)


def _list_processes() -> list[ProcessInfo]:
    if platform.system().lower() == "windows":
        return _list_windows_processes()
    return _list_posix_processes()


def _list_windows_processes() -> list[ProcessInfo]:
    script = (
        "Get-CimInstance Win32_Process | "
        "Select-Object ProcessId,ParentProcessId,CommandLine | "
        "ConvertTo-Json -Compress"
    )
    completed = subprocess.run(
        ["powershell", "-NoProfile", "-Command", script],
        check=False,
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0 or not completed.stdout.strip():
        return []
    payload = json.loads(completed.stdout)
    rows = payload if isinstance(payload, list) else [payload]
    processes: list[ProcessInfo] = []
    for row in rows:
        command_line = row.get("CommandLine")
        if not isinstance(command_line, str) or not command_line:
            continue
        processes.append(
            ProcessInfo(
                pid=int(row["ProcessId"]),
                parent_pid=int(row.get("ParentProcessId") or 0),
                command_line=command_line,
            )
        )
    return processes


def _list_posix_processes() -> list[ProcessInfo]:
    completed = subprocess.run(
        ["ps", "-axo", "pid=,ppid=,command="],
        check=False,
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        return []
    processes: list[ProcessInfo] = []
    for line in completed.stdout.splitlines():
        parts = line.strip().split(None, 2)
        if len(parts) < 3:
            continue
        processes.append(ProcessInfo(pid=int(parts[0]), parent_pid=int(parts[1]), command_line=parts[2]))
    return processes


def _children_by_parent(processes: list[ProcessInfo]) -> dict[int, set[int]]:
    children: dict[int, set[int]] = {}
    for process in processes:
        children.setdefault(process.parent_pid, set()).add(process.pid)
    return children


def _expand_with_descendants(target_pids: set[int], children_by_parent: dict[int, set[int]]) -> set[int]:
    expanded = set(target_pids)
    stack = list(target_pids)
    while stack:
        pid = stack.pop()
        for child_pid in children_by_parent.get(pid, set()):
            if child_pid in expanded:
                continue
            expanded.add(child_pid)
            stack.append(child_pid)
    return expanded


def _root_targets(target_pids: set[int], parent_by_pid: dict[int, int]) -> set[int]:
    roots: set[int] = set()
    for pid in target_pids:
        parent_pid = parent_by_pid.get(pid)
        while parent_pid:
            if parent_pid in target_pids:
                break
            parent_pid = parent_by_pid.get(parent_pid)
        else:
            roots.add(pid)
    return roots


def _kill_windows_process_trees(root_pids: set[int]) -> list[str]:
    errors: list[str] = []
    for pid in sorted(root_pids):
        completed = subprocess.run(
            ["taskkill", "/PID", str(pid), "/T", "/F"],
            check=False,
            capture_output=True,
            text=True,
        )
        if completed.returncode != 0 and "not found" not in completed.stderr.lower():
            errors.append((completed.stderr or completed.stdout).strip())
    return errors


def _kill_posix_processes(
    pids: set[int],
    children_by_parent: dict[int, set[int]],
) -> list[str]:
    errors: list[str] = []
    for pid in sorted(pids, key=lambda value: _process_depth(value, children_by_parent), reverse=True):
        if pid == os.getpid():
            continue
        try:
            os.kill(pid, signal.SIGKILL)
        except ProcessLookupError:
            continue
        except PermissionError as exc:
            errors.append(f"Could not terminate process {pid}: {exc}")
    return errors


def _process_depth(pid: int, children_by_parent: dict[int, set[int]]) -> int:
    children = children_by_parent.get(pid, set())
    if not children:
        return 0
    return 1 + max(_process_depth(child_pid, children_by_parent) for child_pid in children)
