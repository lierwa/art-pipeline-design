from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import threading
from typing import Any

from pydantic import BaseModel
from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer

from art_pipeline.codex_final_jobs import (
    CodexFinalJob,
    codex_final_job_manifest_path,
    read_codex_final_job_manifest,
    update_codex_final_job_manifest,
)
from art_pipeline.codex_final_sources import default_codex_generated_images_root
from art_pipeline.workspace.codex_final_tasks import (
    CODEX_FINAL_MANUAL_STOP_MESSAGE,
    CodexFinalIngestRequest,
    _codex_final_task_artifacts,
    ingest_codex_final_agent_job,
)
from art_pipeline.workspace.tasks import WorkspaceTask, read_workspace_task, set_task_item_status


RECOVERY_QA_NOTE = "Recovered from Codex generated_images fallback."
RECOVERY_TIMEOUT_MESSAGE = "Codex worker image was not recovered before timeout."
_JOB_ID_PATTERNS = (
    re.compile(r"\bjobId:\s*(job_[^\s,\r\n]+)"),
    re.compile(r"\bJob:\s*(job_[^\s,\r\n]+)"),
)
_TERMINAL_JOB_STATUSES = {"finalized", "failed", "skipped"}
_ACTIVE_MONITORS: dict[tuple[str, str], "CodexFinalRecoveryEventMonitor"] = {}
_MONITOR_LOCK = threading.Lock()


class CodexFinalRecoveryResult(BaseModel):
    task: WorkspaceTask
    scannedThreadCount: int
    foundImageCount: int
    recoveredJobCount: int
    skippedJobCount: int
    errors: list[str]


@dataclass(frozen=True)
class _WorkerImageCandidate:
    job_id: str
    worker_thread_id: str
    image_path: Path | None


def recover_codex_final_generated_images(
    root: Path,
    task_id: str,
    *,
    include_failed_manual_stops: bool = False,
) -> CodexFinalRecoveryResult:
    candidates = _worker_image_candidates(root, task_id)
    return _recover_worker_image_candidates(
        root,
        task_id,
        candidates,
        include_failed_manual_stops=include_failed_manual_stops,
    )


class CodexFinalRecoveryEventMonitor:
    def __init__(
        self,
        root: Path,
        task_id: str,
        *,
        include_failed_manual_stops: bool = False,
        timeout_seconds: float | None = None,
        on_stop: Callable[[], None] | None = None,
    ) -> None:
        self.root = Path(root)
        self.task_id = task_id
        self.include_failed_manual_stops = include_failed_manual_stops
        self.timeout_seconds = timeout_seconds or _positive_float_env(
            "CODEX_FINAL_RECOVERY_TIMEOUT_SECONDS",
            1800.0,
        )
        self.generated_root = default_codex_generated_images_root()
        self._job_threads: dict[str, str] = {}
        self._lock = threading.Lock()
        self._observer: Observer | None = None
        self._timeout_timer: threading.Timer | None = None
        self._on_stop = on_stop
        self._stopped = False

    def start(self) -> None:
        controller_root = codex_final_job_manifest_path(self.root, self.task_id).parent / "controllers"
        controller_root.mkdir(parents=True, exist_ok=True)
        self.generated_root.mkdir(parents=True, exist_ok=True)
        handler = _CodexFinalRecoveryWatchdogHandler(self)
        observer = Observer()
        observer.schedule(handler, str(controller_root), recursive=True)
        observer.schedule(handler, str(self.generated_root), recursive=True)
        self._observer = observer
        observer.start()
        self._timeout_timer = threading.Timer(self.timeout_seconds, self._handle_timeout)
        self._timeout_timer.daemon = True
        self._timeout_timer.start()

        # WHY: controller 和 worker 可能在 monitor 启动前已经各自写入文件；
        # 事件监听只负责后续变化，启动时必须消费一次已有事实。
        for event_path in _controller_event_paths(self.root, self.task_id):
            self.process_controller_event_path(event_path)
        for worker_thread_id in self._known_worker_thread_ids():
            self.process_worker_thread(worker_thread_id)

    def stop(self) -> None:
        with self._lock:
            if self._stopped:
                return
            self._stopped = True
            observer = self._observer
            timer = self._timeout_timer
        if timer is not None:
            timer.cancel()
        if observer is not None:
            observer.stop()
            if threading.current_thread() is not observer:
                observer.join(timeout=2.0)
        if self._on_stop is not None:
            self._on_stop()

    def process_controller_event_path(self, event_path: Path) -> CodexFinalRecoveryResult | None:
        candidates = _worker_image_candidates_from_events(
            _read_jsonl_events(event_path),
            self.generated_root,
        )
        if not candidates:
            return None
        with self._lock:
            for candidate in candidates:
                self._job_threads[candidate.job_id] = candidate.worker_thread_id
        result = _recover_worker_image_candidates(
            self.root,
            self.task_id,
            candidates,
            include_failed_manual_stops=self.include_failed_manual_stops,
        )
        self._stop_if_terminal(result.task)
        return result

    def process_worker_thread(self, worker_thread_id: str) -> CodexFinalRecoveryResult | None:
        with self._lock:
            job_ids = [
                job_id
                for job_id, known_worker_thread_id in self._job_threads.items()
                if known_worker_thread_id == worker_thread_id
            ]
        if not job_ids:
            return None
        candidates = [
            _WorkerImageCandidate(
                job_id=job_id,
                worker_thread_id=worker_thread_id,
                image_path=_latest_worker_png(self.generated_root, worker_thread_id),
            )
            for job_id in job_ids
        ]
        result = _recover_worker_image_candidates(
            self.root,
            self.task_id,
            candidates,
            include_failed_manual_stops=self.include_failed_manual_stops,
        )
        self._stop_if_terminal(result.task)
        return result

    def handle_filesystem_path(self, path: Path, *, is_directory: bool) -> None:
        if path.name == "events.jsonl":
            self.process_controller_event_path(path)
            return
        worker_thread_id = _worker_thread_id_for_generated_path(
            self.generated_root,
            path,
            is_directory=is_directory,
        )
        if worker_thread_id is not None:
            self.process_worker_thread(worker_thread_id)

    def _known_worker_thread_ids(self) -> list[str]:
        with self._lock:
            return sorted(set(self._job_threads.values()))

    def _stop_if_terminal(self, task: WorkspaceTask) -> None:
        if task.status in {"succeeded", "failed"}:
            self.stop()

    def _handle_timeout(self) -> None:
        try:
            task = read_workspace_task(self.root, self.task_id)
        except FileNotFoundError:
            self.stop()
            return
        if task.status not in {"succeeded", "failed"}:
            _fail_unrecovered_jobs(self.root, self.task_id, RECOVERY_TIMEOUT_MESSAGE)
        self.stop()


class _CodexFinalRecoveryWatchdogHandler(FileSystemEventHandler):
    def __init__(self, monitor: CodexFinalRecoveryEventMonitor) -> None:
        self.monitor = monitor

    def on_created(self, event: FileSystemEvent) -> None:
        self._handle(event)

    def on_modified(self, event: FileSystemEvent) -> None:
        self._handle(event)

    def on_moved(self, event: FileSystemEvent) -> None:
        dest_path = getattr(event, "dest_path", "")
        if dest_path:
            self.monitor.handle_filesystem_path(Path(dest_path), is_directory=event.is_directory)

    def _handle(self, event: FileSystemEvent) -> None:
        self.monitor.handle_filesystem_path(Path(event.src_path), is_directory=event.is_directory)


def _recover_worker_image_candidates(
    root: Path,
    task_id: str,
    candidates: list[_WorkerImageCandidate],
    *,
    include_failed_manual_stops: bool,
) -> CodexFinalRecoveryResult:
    manifest = read_codex_final_job_manifest(root, task_id)
    candidates_by_job: dict[str, _WorkerImageCandidate] = {}
    found_image_count = 0
    for candidate in candidates:
        if candidate.image_path is None:
            continue
        found_image_count += 1
        candidates_by_job[candidate.job_id] = candidate

    recovered_job_count = 0
    skipped_job_count = 0
    errors: list[str] = []
    for job in manifest.jobs:
        candidate = candidates_by_job.get(job.jobId)
        if candidate is None or candidate.image_path is None:
            continue
        if not _can_recover_job(job, include_failed_manual_stops):
            skipped_job_count += 1
            continue
        try:
            # WHY: controller lease 只是防重复消费的外部协议；generated_images 回收是
            # backend 内部可信路径，复用 agent ingest 让 finalizer 成为唯一入库权威。
            ingest_codex_final_agent_job(
                root,
                task_id,
                job.elementId,
                CodexFinalIngestRequest(
                    selectedSourcePath=candidate.image_path.as_posix(),
                    qaNote=RECOVERY_QA_NOTE,
                    codexThreadId=candidate.worker_thread_id,
                ),
            )
            recovered_job_count += 1
        except Exception as exc:  # noqa: BLE001 - one broken image must not stop the whole batch.
            errors.append(f"{job.jobId}: {type(exc).__name__}: {exc}")

    return CodexFinalRecoveryResult(
        task=read_workspace_task(root, task_id),
        scannedThreadCount=len({candidate.worker_thread_id for candidate in candidates}),
        foundImageCount=found_image_count,
        recoveredJobCount=recovered_job_count,
        skippedJobCount=skipped_job_count,
        errors=errors,
    )


def start_codex_final_recovery_monitor(
    root: Path,
    task_id: str,
    *,
    include_failed_manual_stops: bool = False,
) -> bool:
    key = (str(root.resolve()), task_id)
    monitor: CodexFinalRecoveryEventMonitor | None = None

    def release_monitor() -> None:
        with _MONITOR_LOCK:
            if _ACTIVE_MONITORS.get(key) is monitor:
                _ACTIVE_MONITORS.pop(key, None)

    with _MONITOR_LOCK:
        if key in _ACTIVE_MONITORS:
            return False
        monitor = CodexFinalRecoveryEventMonitor(
            root,
            task_id,
            include_failed_manual_stops=include_failed_manual_stops,
            on_stop=release_monitor,
        )
        _ACTIVE_MONITORS[key] = monitor
    try:
        monitor.start()
    except Exception:
        release_monitor()
        return False
    return True


def _worker_thread_id_for_generated_path(
    generated_root: Path,
    path: Path,
    *,
    is_directory: bool,
) -> str | None:
    try:
        relative = path.resolve().relative_to(generated_root.resolve())
    except ValueError:
        return None
    parts = relative.parts
    if not parts:
        return None
    worker_thread_id = parts[0] if not is_directory or len(parts) > 1 else path.name
    if Path(worker_thread_id).name != worker_thread_id:
        return None
    return worker_thread_id


def _worker_image_candidates(root: Path, task_id: str) -> list[_WorkerImageCandidate]:
    generated_root = default_codex_generated_images_root()
    candidates: list[_WorkerImageCandidate] = []
    for event_path in _controller_event_paths(root, task_id):
        candidates.extend(_worker_image_candidates_from_events(_read_jsonl_events(event_path), generated_root))
    return candidates


def _worker_image_candidates_from_events(
    events: list[dict[str, Any]],
    generated_root: Path,
) -> list[_WorkerImageCandidate]:
    candidates: list[_WorkerImageCandidate] = []
    for event in events:
        spawn = _spawn_agent_event_payload(event)
        if spawn is None:
            continue
        job_id = _job_id_from_prompt(spawn["prompt"])
        worker_thread_id = _first_receiver_thread_id(spawn["receiver_thread_ids"])
        if job_id is None or worker_thread_id is None:
            continue
        candidates.append(
            _WorkerImageCandidate(
                job_id=job_id,
                worker_thread_id=worker_thread_id,
                image_path=_latest_worker_png(generated_root, worker_thread_id),
            )
        )
    return candidates


def _spawn_agent_event_payload(event: dict[str, Any]) -> dict[str, Any] | None:
    item = event.get("item") if isinstance(event.get("item"), dict) else event
    if not isinstance(item, dict):
        return None
    item_type = item.get("type")
    tool = item.get("tool") or item.get("tool_name")
    status = item.get("status") or event.get("status")
    if item_type != "collab_tool_call" or tool != "spawn_agent":
        return None
    if status is not None and status != "completed":
        return None
    input_payload = item.get("input") if isinstance(item.get("input"), dict) else {}
    result_payload = item.get("result") if isinstance(item.get("result"), dict) else {}
    return {
        "prompt": item.get("prompt") or input_payload.get("prompt"),
        "receiver_thread_ids": item.get("receiver_thread_ids") or result_payload.get("receiver_thread_ids"),
    }


def _controller_event_paths(root: Path, task_id: str) -> list[Path]:
    controller_root = codex_final_job_manifest_path(root, task_id).parent / "controllers"
    if not controller_root.exists():
        return []
    return sorted(controller_root.glob("*/events.jsonl"))


def _read_jsonl_events(path: Path) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    try:
        lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    except OSError:
        return events
    for line in lines:
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(event, dict):
            events.append(event)
    return events


def _job_id_from_prompt(prompt: Any) -> str | None:
    if not isinstance(prompt, str):
        return None
    for pattern in _JOB_ID_PATTERNS:
        match = pattern.search(prompt)
        if match:
            return match.group(1).strip().rstrip(".,;")
    return None


def _first_receiver_thread_id(receiver_thread_ids: Any) -> str | None:
    if not isinstance(receiver_thread_ids, list) or not receiver_thread_ids:
        return None
    worker_thread_id = receiver_thread_ids[0]
    if not isinstance(worker_thread_id, str) or not worker_thread_id.strip():
        return None
    return worker_thread_id.strip()


def _latest_worker_png(generated_root: Path, worker_thread_id: str) -> Path | None:
    if Path(worker_thread_id).name != worker_thread_id:
        return None
    worker_dir = generated_root / worker_thread_id
    if not worker_dir.is_dir():
        return None
    images = [path for path in worker_dir.iterdir() if path.is_file() and path.suffix.lower() == ".png"]
    if not images:
        return None
    return max(images, key=lambda path: path.stat().st_mtime_ns)


def _can_recover_job(job: CodexFinalJob, include_failed_manual_stops: bool) -> bool:
    if job.status in {"finalized", "skipped"}:
        return False
    if job.status != "failed":
        return True
    return include_failed_manual_stops and _is_manual_stop_failure(job)


def _is_manual_stop_failure(job: CodexFinalJob) -> bool:
    return CODEX_FINAL_MANUAL_STOP_MESSAGE in {job.message, job.lastError}


def _fail_unrecovered_jobs(root: Path, task_id: str, message: str) -> WorkspaceTask:
    now = datetime.now(timezone.utc).isoformat()
    failed_jobs: list[CodexFinalJob] = []

    def fail_jobs(manifest):
        jobs: list[CodexFinalJob] = []
        for job in manifest.jobs:
            if job.status in _TERMINAL_JOB_STATUSES:
                jobs.append(job)
                continue
            next_job = job.model_copy(
                update={
                    "status": "failed",
                    "message": message,
                    "lastError": message,
                    "finishedAt": now,
                    "controllerId": None,
                    "leaseToken": None,
                    "leaseExpiresAt": None,
                    "heartbeatAt": None,
                }
            )
            failed_jobs.append(next_job)
            jobs.append(next_job)
        return manifest.model_copy(update={"jobs": jobs})

    update_codex_final_job_manifest(root, task_id, fail_jobs)
    task = read_workspace_task(root, task_id)
    for job in failed_jobs:
        task = set_task_item_status(
            root,
            task_id,
            job.elementId,
            "failed",
            message,
            _codex_final_task_artifacts(root, task_id, job),
        )
    return task


def _positive_float_env(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = float(raw)
    except ValueError:
        return default
    return max(0.1, value)
