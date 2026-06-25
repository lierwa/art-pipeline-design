from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import time
from typing import Any
from uuid import uuid4

from pydantic import BaseModel

from art_pipeline.codex_assets import (
    PreparedCodexFinalJob,
    finalize_codex_final_job,
    prepare_codex_final_job,
    prepared_codex_final_job_from_manifest_job,
)
from art_pipeline.codex_final_inputs import codex_final_job_inputs
from art_pipeline.codex_final_jobs import (
    CodexFinalJob,
    CodexFinalJobManifest,
    CodexFinalJobStatus,
    CodexFinalRemovedChild,
    codex_final_agent_handoff_path,
    codex_final_job_manifest_path,
    read_codex_final_job_manifest,
    update_codex_final_job_manifest,
    write_codex_final_job_manifest,
)
from art_pipeline.elements import ElementRecord, WorkspaceState
from art_pipeline.exporting.files import resolve_workspace_path
from art_pipeline.workspace.store import read_state as _read_state
from art_pipeline.workspace.store import update_state as _update_state
from art_pipeline.workspace.tasks import (
    WorkspaceTask,
    list_workspace_tasks,
    read_workspace_task,
    set_task_item_status,
    update_workspace_task,
)


def _positive_int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return max(1, value)


CODEX_FINAL_AGENT_WAIT_MESSAGE = "Waiting for Codex agent raw image."
CODEX_FINAL_QUEUED_MESSAGE = "Queued for Codex controller."
CODEX_FINAL_CLAIMED_MESSAGE = "Claimed by Codex controller."
CODEX_FINAL_RUNNING_MESSAGE = "Codex subagent is generating raw image."
CODEX_FINAL_CONTROLLER_LAUNCH_FAILED_MESSAGE = "Codex controller launch failed."
CODEX_FINAL_MANUAL_STOP_MESSAGE = (
    "Manually stopped: Codex generation was stopped by the operator."
)
CODEX_FINAL_AGENT_PROVIDER = "codex_agent"
CODEX_FINAL_LEASE_SECONDS = _positive_int_env("CODEX_FINAL_LEASE_SECONDS", 900)
CODEX_FINAL_MAX_ATTEMPTS = 2
CodexSkipReason = Callable[[ElementRecord, bool], str | None]
_CODEX_FINAL_TERMINAL_JOB_STATUSES = {"finalized", "failed", "skipped"}
_CODEX_FINAL_ACTIVE_ITEM_STATUSES = {"queued", "claimed", "running"}


class CodexFinalIngestRequest(BaseModel):
    selectedSourcePath: str
    qaNote: str = ""
    codexThreadId: str | None = None
    controllerId: str | None = None
    leaseToken: str | None = None


class CodexFinalClaimRequest(BaseModel):
    controllerId: str
    capacity: int
    leaseSeconds: int = CODEX_FINAL_LEASE_SECONDS


class CodexFinalHeartbeatRequest(BaseModel):
    controllerId: str
    leaseToken: str
    phase: str = "agent_running"
    leaseSeconds: int = CODEX_FINAL_LEASE_SECONDS


class CodexFinalFailRequest(BaseModel):
    controllerId: str
    leaseToken: str
    error: str
    retryable: bool = True


class CodexFinalIngestResult(BaseModel):
    task: WorkspaceTask
    state: WorkspaceState
    job: CodexFinalJob
    generation: dict[str, Any]


class CodexFinalClaimResult(BaseModel):
    task: WorkspaceTask
    jobs: list[CodexFinalJob]


class CodexFinalJobUpdateResult(BaseModel):
    task: WorkspaceTask
    job: CodexFinalJob


class CodexFinalStopResult(BaseModel):
    tasks: list[WorkspaceTask]
    failedTaskCount: int
    failedJobCount: int
    failedItemCount: int


class CodexFinalJobNotFoundError(LookupError):
    pass


class CodexFinalIngestError(RuntimeError):
    pass


class CodexFinalLeaseError(RuntimeError):
    pass


def run_codex_final_agent_task(
    root: Path,
    task_id: str,
    skip_reason: CodexSkipReason,
    force: bool = False,
) -> None:
    task = read_workspace_task(root, task_id)
    for item in task.items:
        element = _find_element(_read_state(root), item.elementId)
        reason = skip_reason(element, force)
        if reason:
            set_task_item_status(root, task_id, element.id, "skipped", reason)

    # WHY: Codex 桌面 subagent 才是并发生图的正确执行层；
    # 后端只准备可追踪 job 并等待 raw output，避免并发启动多个孤立 codex cli 进程。
    task_snapshot = read_workspace_task(root, task_id)
    prompt_hints = codex_final_prompt_hints_from_task(task_snapshot)
    prepared_jobs: list[PreparedCodexFinalJob] = []
    manifest_jobs: list[CodexFinalJob] = []
    for item in task_snapshot.items:
        if item.status != "queued":
            continue
        try:
            prepared = prepare_codex_final_job(
                root,
                _read_state(root),
                item.elementId,
                prompt_hints.get(item.elementId),
            )
        except Exception as exc:  # noqa: BLE001 - one bad prepared job must not block siblings.
            set_task_item_status(root, task_id, item.elementId, "failed", str(exc))
            continue
        prepared_jobs.append(prepared)
        manifest_jobs.append(_codex_final_job_from_prepared(root, prepared))

    if not manifest_jobs:
        return

    manifest = CodexFinalJobManifest(
        version=1,
        taskId=task_id,
        createdAt=read_workspace_task(root, task_id).createdAt,
        jobs=manifest_jobs,
    )
    for prepared, job in zip(prepared_jobs, manifest_jobs, strict=True):
        set_task_item_status(
            root,
            task_id,
            prepared.element.id,
            "queued",
            CODEX_FINAL_QUEUED_MESSAGE,
            _codex_final_task_artifacts(root, task_id, job),
        )
    # WHY: manifest 一旦出现，controller 就可能 claim；必须等 task item 的
    # queued/artifact 状态先落盘，避免准备线程后续写回覆盖 claimed/running 状态。
    write_codex_final_job_manifest(root, manifest)
    _write_codex_final_agent_handoff(root, task_id, manifest_jobs)


def mark_codex_final_controller_launch_failed(
    root: Path,
    task_id: str,
    error: str,
) -> WorkspaceTask:
    now = _utc_now()
    message = f"{CODEX_FINAL_CONTROLLER_LAUNCH_FAILED_MESSAGE} {error}".strip()
    failed_jobs: list[CodexFinalJob] = []

    def fail_unclaimed_jobs(manifest: CodexFinalJobManifest) -> CodexFinalJobManifest:
        jobs: list[CodexFinalJob] = []
        for job in manifest.jobs:
            # WHY: 启动失败只证明还没交给 controller 的 job 无法继续；已 claim 的 job
            # 可能已有独立 controller 在跑，不能被后来一次启动失败覆盖。
            if job.status != "queued" or job.controllerId is not None:
                jobs.append(job)
                continue
            next_job = job.model_copy(
                update={
                    "status": "failed",
                    "message": message,
                    "lastError": message,
                    "finishedAt": _iso(now),
                }
            )
            failed_jobs.append(next_job)
            jobs.append(next_job)
        return manifest.model_copy(update={"jobs": jobs})

    update_codex_final_job_manifest(root, task_id, fail_unclaimed_jobs)
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


def stop_active_codex_final_tasks(
    root: Path,
    message: str = CODEX_FINAL_MANUAL_STOP_MESSAGE,
) -> CodexFinalStopResult:
    failed_tasks: list[WorkspaceTask] = []
    failed_job_count = 0
    failed_item_count = 0
    for task in list_workspace_tasks(root):
        if task.type != "codex_final_batch" or task.status not in {"queued", "running"}:
            continue
        job_count, item_count = _stop_active_codex_final_task(root, task.taskId, message)
        if job_count == 0 and item_count == 0:
            continue
        failed_job_count += job_count
        failed_item_count += item_count
        failed_tasks.append(read_workspace_task(root, task.taskId))
    return CodexFinalStopResult(
        tasks=failed_tasks,
        failedTaskCount=len(failed_tasks),
        failedJobCount=failed_job_count,
        failedItemCount=failed_item_count,
    )


def _stop_active_codex_final_task(root: Path, task_id: str, message: str) -> tuple[int, int]:
    now = _utc_now()
    failed_jobs: list[CodexFinalJob] = []

    def fail_jobs(manifest: CodexFinalJobManifest) -> CodexFinalJobManifest:
        jobs: list[CodexFinalJob] = []
        for job in manifest.jobs:
            if job.status in _CODEX_FINAL_TERMINAL_JOB_STATUSES:
                jobs.append(job)
                continue
            next_job = job.model_copy(
                update={
                    "status": "failed",
                    "message": message,
                    "controllerId": None,
                    "leaseToken": None,
                    "leaseExpiresAt": None,
                    "heartbeatAt": None,
                    "finishedAt": _iso(now),
                    "lastError": message,
                }
            )
            failed_jobs.append(next_job)
            jobs.append(next_job)
        return manifest.model_copy(update={"jobs": jobs})

    manifest_path = codex_final_job_manifest_path(root, task_id)
    if manifest_path.exists():
        update_codex_final_job_manifest(root, task_id, fail_jobs)

    failed_job_element_ids = set()
    for job in failed_jobs:
        failed_job_element_ids.add(job.elementId)
        set_task_item_status(
            root,
            task_id,
            job.elementId,
            "failed",
            message,
            _codex_final_task_artifacts(root, task_id, job),
        )

    item_count = len(failed_jobs)
    # WHY: 强停是外部运维动作，可能发生在 manifest 写出前或部分 job 已丢 lease；
    # 这里补齐 task item 终态，避免 UI 继续从 claimed/running 推导 Working。
    task = read_workspace_task(root, task_id)
    for item in task.items:
        if item.elementId in failed_job_element_ids or item.status not in _CODEX_FINAL_ACTIVE_ITEM_STATUSES:
            continue
        set_task_item_status(root, task_id, item.elementId, "failed", message, item.artifactPaths)
        item_count += 1
    return len(failed_jobs), item_count


def claim_codex_final_agent_jobs(
    root: Path,
    task_id: str,
    request: CodexFinalClaimRequest,
) -> CodexFinalClaimResult:
    if request.capacity <= 0:
        return CodexFinalClaimResult(task=read_workspace_task(root, task_id), jobs=[])
    now = _utc_now()
    lease_expires_at = _iso(now + timedelta(seconds=max(1, request.leaseSeconds)))
    claimed_jobs: list[CodexFinalJob] = []

    def claim_ready_jobs(manifest: CodexFinalJobManifest) -> CodexFinalJobManifest:
        jobs: list[CodexFinalJob] = []
        for job in manifest.jobs:
            if len(claimed_jobs) >= request.capacity or not _is_claimable(job, now):
                jobs.append(job)
                continue
            next_job = job.model_copy(
                update={
                    "status": "claimed",
                    "message": CODEX_FINAL_CLAIMED_MESSAGE,
                    "controllerId": request.controllerId,
                    "leaseToken": uuid4().hex,
                    "leaseExpiresAt": lease_expires_at,
                    "attempt": job.attempt + 1,
                    "claimedAt": _iso(now),
                    "heartbeatAt": _iso(now),
                    "startedAt": None,
                    "finishedAt": None,
                    "lastError": None,
                    "selectedSourcePath": None,
                    "qaNote": None,
                    "codexThreadId": None,
                    "qualityStatus": "pending",
                    "qualityErrors": [],
                    "qualityWarnings": [],
                    "repairNote": None,
                }
            )
            claimed_jobs.append(next_job)
            jobs.append(next_job)
        return manifest.model_copy(update={"jobs": jobs})

    read_workspace_task(root, task_id)
    update_codex_final_job_manifest(root, task_id, claim_ready_jobs)
    for job in claimed_jobs:
        set_task_item_status(
            root,
            task_id,
            job.elementId,
            "claimed",
            CODEX_FINAL_CLAIMED_MESSAGE,
            _codex_final_task_artifacts(root, task_id, job),
        )
    task = _record_controller_metadata(root, task_id, request.controllerId, request.capacity)
    return CodexFinalClaimResult(task=task, jobs=claimed_jobs)


def heartbeat_codex_final_agent_job(
    root: Path,
    task_id: str,
    job_id: str,
    request: CodexFinalHeartbeatRequest,
) -> CodexFinalJobUpdateResult:
    now = _utc_now()
    lease_expires_at = _iso(now + timedelta(seconds=max(1, request.leaseSeconds)))
    updated_job: CodexFinalJob | None = None
    status: CodexFinalJobStatus = "agent_running" if request.phase == "agent_running" else "claimed"
    message = CODEX_FINAL_RUNNING_MESSAGE if status == "agent_running" else CODEX_FINAL_CLAIMED_MESSAGE

    def update(manifest: CodexFinalJobManifest) -> CodexFinalJobManifest:
        nonlocal updated_job
        index, job = _find_manifest_job_by_job_id(manifest, job_id)
        _validate_current_lease(job, request.controllerId, request.leaseToken, now)
        updated_job = job.model_copy(
            update={
                "status": status,
                "message": message,
                "leaseExpiresAt": lease_expires_at,
                "heartbeatAt": _iso(now),
                "startedAt": job.startedAt or _iso(now),
            }
        )
        return _replace_manifest_job(manifest, index, updated_job)

    update_codex_final_job_manifest(root, task_id, update)
    if updated_job is None:
        raise CodexFinalJobNotFoundError(job_id)
    task = set_task_item_status(
        root,
        task_id,
        updated_job.elementId,
        "running" if status == "agent_running" else "claimed",
        message,
        _codex_final_task_artifacts(root, task_id, updated_job),
    )
    return CodexFinalJobUpdateResult(task=task, job=updated_job)


def fail_codex_final_agent_job(
    root: Path,
    task_id: str,
    job_id: str,
    request: CodexFinalFailRequest,
) -> CodexFinalJobUpdateResult:
    now = _utc_now()
    updated_job: CodexFinalJob | None = None

    def update(manifest: CodexFinalJobManifest) -> CodexFinalJobManifest:
        nonlocal updated_job
        index, job = _find_manifest_job_by_job_id(manifest, job_id)
        _validate_current_lease(job, request.controllerId, request.leaseToken, now)
        should_retry = request.retryable and job.attempt < CODEX_FINAL_MAX_ATTEMPTS
        updated_job = job.model_copy(
            update={
                "status": "queued" if should_retry else "failed",
                "message": CODEX_FINAL_QUEUED_MESSAGE if should_retry else request.error,
                "controllerId": None,
                "leaseToken": None,
                "leaseExpiresAt": None,
                "heartbeatAt": None,
                "finishedAt": _iso(now) if not should_retry else None,
                "lastError": request.error,
            }
        )
        return _replace_manifest_job(manifest, index, updated_job)

    update_codex_final_job_manifest(root, task_id, update)
    if updated_job is None:
        raise CodexFinalJobNotFoundError(job_id)
    task = set_task_item_status(
        root,
        task_id,
        updated_job.elementId,
        "queued" if updated_job.status == "queued" else "failed",
        updated_job.message,
        _codex_final_task_artifacts(root, task_id, updated_job),
    )
    return CodexFinalJobUpdateResult(task=task, job=updated_job)


def normalize_codex_final_agent_queue(root: Path, task_id: str) -> WorkspaceTask:
    reset_jobs: list[CodexFinalJob] = []

    def normalize(manifest: CodexFinalJobManifest) -> CodexFinalJobManifest:
        jobs: list[CodexFinalJob] = []
        for job in manifest.jobs:
            if job.status in {"queued", "finalized", "failed", "skipped"}:
                jobs.append(job)
                continue
            next_job = job.model_copy(
                update={
                    "status": "queued",
                    "message": CODEX_FINAL_QUEUED_MESSAGE,
                    "controllerId": None,
                    "leaseToken": None,
                    "leaseExpiresAt": None,
                    "heartbeatAt": None,
                    "startedAt": None,
                }
            )
            reset_jobs.append(next_job)
            jobs.append(next_job)
        return manifest.model_copy(update={"jobs": jobs})

    update_codex_final_job_manifest(root, task_id, normalize)
    task = read_workspace_task(root, task_id)
    for job in reset_jobs:
        task = set_task_item_status(
            root,
            task_id,
            job.elementId,
            "queued",
            CODEX_FINAL_QUEUED_MESSAGE,
            _codex_final_task_artifacts(root, task_id, job),
        )
    return task


def ingest_codex_final_agent_job(
    root: Path,
    task_id: str,
    element_id: str,
    request: CodexFinalIngestRequest,
) -> CodexFinalIngestResult:
    ingest_started = time.perf_counter()
    manifest = read_codex_final_job_manifest(root, task_id)
    _job_index, job = _find_manifest_job(manifest, element_id)
    read_workspace_task(root, task_id)
    if job.status == "finalized":
        return _finalized_ingest_result(root, task_id, job)
    selected_source_path = _validated_selected_source_path(root, request.selectedSourcePath)
    provider_metadata = _codex_agent_metadata(request)
    generation: dict[str, Any] | None = None

    try:
        def finalize_current_state(state: WorkspaceState) -> WorkspaceState:
            nonlocal generation
            prepared = prepared_codex_final_job_from_manifest_job(root, state, job)
            next_state, _updated, generation = finalize_codex_final_job(
                root,
                state,
                prepared,
                selected_source_path,
                CODEX_FINAL_AGENT_PROVIDER,
                provider_metadata,
            )
            return next_state

        step_started = time.perf_counter()
        next_state = _update_state(root, finalize_current_state)
        state_update_seconds = _elapsed_seconds(step_started)
    except Exception as exc:  # noqa: BLE001 - ingest failure belongs to one manifest job/item.
        failed_job = _ingested_job_update(job, request, "failed", str(exc)).model_copy(
            update=_quality_report_job_update(root, job)
        )
        _update_ingested_manifest_job(root, task_id, element_id, failed_job)
        set_task_item_status(
            root,
            task_id,
            element_id,
            "failed",
            str(exc),
            _codex_final_task_artifacts(root, task_id, failed_job),
        )
        raise CodexFinalIngestError(str(exc)) from exc

    if generation is None:
        raise CodexFinalIngestError("Codex final generation metadata was not produced.")
    # WHY: raw output 摄入同时跨越三份持久化状态；只有在 finalizer 成功并写入 state 后，
    # 才把 manifest/job/task 一起推进到终态，避免 sibling 任务被失败路径误伤。
    timing = _generation_timing(generation)
    timing["stateUpdateSeconds"] = state_update_seconds
    finalized_job = _ingested_job_update(job, request, "finalized", "Codex final asset ready.").model_copy(
        update=_quality_report_job_update(root, job)
    )
    step_started = time.perf_counter()
    _update_ingested_manifest_job(root, task_id, element_id, finalized_job)
    timing["manifestWriteSeconds"] = _elapsed_seconds(step_started)
    generation = {**generation, "timing": timing}
    # WHY: task item 也要带最终耗时，taskWrite/ingestTotal 必须等第一次 task 写入后才知道；
    # 因此用小 JSON 二次写入换取 UI、task artifact、generation.json 三处统计一致。
    provisional_timing = {
        **timing,
        "taskWriteSeconds": 0.0,
        "ingestTotalSeconds": 0.0,
    }
    step_started = time.perf_counter()
    task = set_task_item_status(
        root,
        task_id,
        element_id,
        "succeeded",
        "Codex final asset ready.",
        {
            **_codex_final_task_artifacts(root, task_id, finalized_job),
            **generation,
            "timing": provisional_timing,
        },
    )
    timing["taskWriteSeconds"] = _elapsed_seconds(step_started)
    timing["ingestTotalSeconds"] = _elapsed_seconds(ingest_started)
    generation = {**generation, "timing": timing}
    _write_generation_timing(root, generation, timing)
    task = set_task_item_status(
        root,
        task_id,
        element_id,
        "succeeded",
        "Codex final asset ready.",
        {**_codex_final_task_artifacts(root, task_id, finalized_job), **generation},
    )
    return CodexFinalIngestResult(
        task=task,
        state=next_state,
        job=finalized_job,
        generation=generation,
    )


def ingest_codex_final_controller_job(
    root: Path,
    task_id: str,
    job_id: str,
    request: CodexFinalIngestRequest,
) -> CodexFinalIngestResult:
    if not request.controllerId or not request.leaseToken:
        raise CodexFinalLeaseError("controllerId and leaseToken are required.")
    manifest = read_codex_final_job_manifest(root, task_id)
    _index, job = _find_manifest_job_by_job_id(manifest, job_id)
    _validate_current_lease(job, request.controllerId, request.leaseToken, _utc_now())
    return ingest_codex_final_agent_job(root, task_id, job.elementId, request)


def _codex_final_job_from_prepared(
    workspace_root: Path,
    prepared: PreparedCodexFinalJob,
) -> CodexFinalJob:
    return CodexFinalJob(
        jobId=prepared.work_dir.name,
        elementId=prepared.element.id,
        elementName=prepared.element.name,
        status="queued",
        message=CODEX_FINAL_QUEUED_MESSAGE,
        workDirPath=_workspace_relative_path(workspace_root, prepared.work_dir),
        promptPath=_workspace_relative_path(workspace_root, prepared.prompt_path),
        briefImagePath=_workspace_relative_path(workspace_root, prepared.brief_image_path),
        briefJsonPath=_workspace_relative_path(workspace_root, prepared.brief_json_path),
        analysisMaskPath=_workspace_relative_path(workspace_root, prepared.analysis_mask_path),
        layoutGuidePath=_workspace_relative_path(workspace_root, prepared.layout_guide_path),
        qualityReportPath=_workspace_relative_path(workspace_root, prepared.quality_report_path),
        rawOutputPath=_workspace_relative_path(workspace_root, prepared.raw_output_path),
        finalOutputPath=_workspace_relative_path(workspace_root, prepared.output_path),
        metadataPath=prepared.paths["metadataPath"],
        inputImages=codex_final_job_inputs(prepared.input_images),
        promptHint=prepared.prompt_hint or "",
        generationProfile=prepared.generation_profile,
        removedChildren=[
            CodexFinalRemovedChild(
                elementId=child.element_id,
                name=child.name,
                maskPath=child.mask_path,
            )
            for child in prepared.removed_children
        ],
    )


def _codex_final_task_artifacts(
    workspace_root: Path,
    task_id: str,
    job: CodexFinalJob,
) -> dict[str, Any]:
    artifacts: dict[str, Any] = {
        "jobId": job.jobId,
        "manifestPath": _workspace_relative_path(
            workspace_root,
            codex_final_job_manifest_path(workspace_root, task_id),
        ),
        "handoffPath": _workspace_relative_path(
            workspace_root,
            codex_final_agent_handoff_path(workspace_root, task_id),
        ),
        "workDirPath": job.workDirPath,
        "promptPath": job.promptPath,
        "briefImagePath": job.briefImagePath,
        "briefJsonPath": job.briefJsonPath,
        "analysisMaskPath": job.analysisMaskPath,
        "layoutGuidePath": job.layoutGuidePath,
        "qualityReportPath": job.qualityReportPath,
        "qualityStatus": job.qualityStatus,
        "qualityErrors": job.qualityErrors,
        "qualityWarnings": job.qualityWarnings,
        "repairNote": job.repairNote,
        "rawOutputPath": job.rawOutputPath,
        "finalOutputPath": job.finalOutputPath,
        "metadataPath": job.metadataPath,
        "inputImagePaths": [image.path for image in job.inputImages],
        "generationProfile": job.generationProfile,
        "removedChildren": [child.model_dump(mode="json") for child in job.removedChildren],
        "jobStatus": job.status,
        "attempt": job.attempt,
    }
    if job.controllerId:
        artifacts["controllerId"] = job.controllerId
    if job.leaseExpiresAt:
        artifacts["leaseExpiresAt"] = job.leaseExpiresAt
    if job.claimedAt:
        artifacts["claimedAt"] = job.claimedAt
    if job.heartbeatAt:
        artifacts["heartbeatAt"] = job.heartbeatAt
    if job.startedAt:
        artifacts["startedAt"] = job.startedAt
    if job.codexThreadId:
        artifacts["codexThreadId"] = job.codexThreadId
    if job.lastError:
        artifacts["lastError"] = job.lastError
    if job.promptHint:
        artifacts["promptHint"] = job.promptHint
    return artifacts


def _find_manifest_job(
    manifest: CodexFinalJobManifest,
    element_id: str,
) -> tuple[int, CodexFinalJob]:
    for index, job in enumerate(manifest.jobs):
        if job.elementId == element_id:
            return index, job
    raise CodexFinalJobNotFoundError(element_id)


def _find_manifest_job_by_job_id(
    manifest: CodexFinalJobManifest,
    job_id: str,
) -> tuple[int, CodexFinalJob]:
    for index, job in enumerate(manifest.jobs):
        if job.jobId == job_id:
            return index, job
    raise CodexFinalJobNotFoundError(job_id)


def _is_claimable(job: CodexFinalJob, now: datetime) -> bool:
    if job.attempt >= CODEX_FINAL_MAX_ATTEMPTS:
        return False
    if job.status in {"queued", "ready_for_agent"}:
        return True
    if job.status not in {"claimed", "agent_running"}:
        return False
    return _lease_expired(job, now)


def _lease_expired(job: CodexFinalJob, now: datetime) -> bool:
    if not job.leaseExpiresAt:
        return True
    try:
        return datetime.fromisoformat(job.leaseExpiresAt) <= now
    except ValueError:
        return True


def _validate_current_lease(
    job: CodexFinalJob,
    controller_id: str,
    lease_token: str,
    now: datetime,
) -> None:
    if (
        job.controllerId != controller_id
        or job.leaseToken != lease_token
        or _lease_expired(job, now)
    ):
        raise CodexFinalLeaseError("Codex final job lease is no longer current.")


def _validated_selected_source_path(workspace_root: Path, selected_source_path: str) -> Path:
    selected = Path(selected_source_path.strip()).expanduser()
    resolved = (
        selected.resolve()
        if selected.is_absolute()
        else resolve_workspace_path(workspace_root, selected.as_posix()).resolve()
    )
    if not resolved.is_file():
        raise ValueError("Selected source path does not exist or is not a file.")
    return resolved


def _codex_agent_metadata(request: CodexFinalIngestRequest) -> dict[str, Any]:
    metadata: dict[str, Any] = {"qaNote": request.qaNote}
    if request.codexThreadId is not None:
        metadata["codexThreadId"] = request.codexThreadId
    return metadata


def _ingested_job_update(
    job: CodexFinalJob,
    request: CodexFinalIngestRequest,
    status: CodexFinalJobStatus,
    message: str,
) -> CodexFinalJob:
    return job.model_copy(
        update={
            "status": status,
            "message": message,
            "selectedSourcePath": request.selectedSourcePath,
            "qaNote": request.qaNote,
            "codexThreadId": request.codexThreadId,
            "qualityStatus": "pending",
            "qualityErrors": [],
            "qualityWarnings": [],
            "repairNote": None,
            "finishedAt": _iso(_utc_now()),
        }
    )


def _quality_report_job_update(root: Path, job: CodexFinalJob) -> dict[str, Any]:
    if not job.qualityReportPath:
        return {}
    report_path = resolve_workspace_path(root, job.qualityReportPath)
    try:
        payload = json.loads(report_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(payload, dict):
        return {}

    status = payload.get("status")
    errors = payload.get("errors")
    warnings = payload.get("warnings")
    repair_note = payload.get("repairNote")
    # WHY: quality_report.json 是质量判断的权威来源；manifest/task 只投影
    # 它的稳定字段，避免失败路径和成功路径重新推导出不同 QA 状态。
    return {
        "qualityStatus": status if status in {"passed", "failed"} else job.qualityStatus,
        "qualityErrors": [item for item in errors if isinstance(item, str)] if isinstance(errors, list) else [],
        "qualityWarnings": [item for item in warnings if isinstance(item, str)] if isinstance(warnings, list) else [],
        "repairNote": repair_note if isinstance(repair_note, str) else None,
    }


def _replace_manifest_job(
    manifest: CodexFinalJobManifest,
    job_index: int,
    job: CodexFinalJob,
) -> CodexFinalJobManifest:
    jobs = list(manifest.jobs)
    jobs[job_index] = job
    return manifest.model_copy(update={"jobs": jobs})


def _update_ingested_manifest_job(
    root: Path,
    task_id: str,
    element_id: str,
    job: CodexFinalJob,
) -> None:
    def update(manifest: CodexFinalJobManifest) -> CodexFinalJobManifest:
        index, _current_job = _find_manifest_job(manifest, element_id)
        return _replace_manifest_job(manifest, index, job)

    update_codex_final_job_manifest(root, task_id, update)


def _generation_timing(generation: dict[str, Any]) -> dict[str, float]:
    timing = generation.get("timing")
    if not isinstance(timing, dict):
        return {}
    result: dict[str, float] = {}
    for key, value in timing.items():
        if isinstance(key, str) and isinstance(value, int | float):
            result[key] = float(value)
    return result


def _write_generation_timing(root: Path, generation: dict[str, Any], timing: dict[str, float]) -> None:
    metadata_path = generation.get("metadataPath")
    if not isinstance(metadata_path, str) or not metadata_path.strip():
        return
    path = resolve_workspace_path(root, metadata_path)
    try:
        metadata = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return
    if not isinstance(metadata, dict):
        return
    metadata["timing"] = timing
    path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")


def _finalized_ingest_result(root: Path, task_id: str, job: CodexFinalJob) -> CodexFinalIngestResult:
    # WHY: generated_images recovery 可能先于旧 controller 的 direct ingest 完成。
    # finalized 是单一权威终态，后到请求只能读取现状，不能重跑 finalizer 覆盖 qa/thread/timing。
    return CodexFinalIngestResult(
        task=read_workspace_task(root, task_id),
        state=_read_state(root),
        job=job,
        generation=_read_generation_metadata(root, job),
    )


def _read_generation_metadata(root: Path, job: CodexFinalJob) -> dict[str, Any]:
    path = resolve_workspace_path(root, job.metadataPath)
    try:
        metadata = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {
            "jobId": job.jobId,
            "provider": CODEX_FINAL_AGENT_PROVIDER,
            "rawOutputPath": job.rawOutputPath,
            "outputPath": job.finalOutputPath,
            "metadataPath": job.metadataPath,
            "codexThreadId": job.codexThreadId,
            "qaNote": job.qaNote,
        }
    return metadata if isinstance(metadata, dict) else {}


def _elapsed_seconds(started: float) -> float:
    return round(time.perf_counter() - started, 6)


def _write_codex_final_agent_handoff(
    workspace_root: Path,
    task_id: str,
    jobs: list[CodexFinalJob],
) -> None:
    handoff_path = codex_final_agent_handoff_path(workspace_root, task_id)
    handoff_path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Codex Final Agent Handoff",
        "",
        "Generate raw images for the prepared Codex final jobs below.",
        "",
        f"Workspace: {_project_root()}",
        f"Run root: {workspace_root.resolve()}",
        f"Task id: {task_id}",
        "",
    ]
    for index, job in enumerate(jobs, start=1):
        lines.extend(_codex_final_handoff_job_section(workspace_root, index, job))
    handoff_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def _codex_final_handoff_job_section(
    workspace_root: Path,
    index: int,
    job: CodexFinalJob,
) -> list[str]:
    input_lines = [
        f"- {(workspace_root / image.path).resolve()} -- {image.role}"
        for image in job.inputImages
    ]
    return [
        f"## Job {index}: {job.elementId} - {job.elementName}",
        "",
        "Generate the Codex final raw image for this art-pipeline job.",
        "",
        f"Element id: {job.elementId}",
        f"Element name: {job.elementName}",
        f"Prompt file: {(workspace_root / job.promptPath).resolve()}",
        f"Raw output target: {(workspace_root / job.rawOutputPath).resolve()}",
        "",
        "Input images:",
        *input_lines,
        "",
        "Read the prompt file exactly. Use image generation only. Do not run local scripts, edit manifests, copy files into the workspace, remove transparency, or finalize assets.",
        "",
        "Before returning, visually check:",
        "- same source crop angle, framing, material, and color family",
        "- no copied rough-cutout pixels or jagged mask defects",
        "- child/exclude regions are removed or filled according to the brief",
        "- clean flat chroma-key background",
        "- one complete asset with safe padding",
        "",
        "Return only:",
        "selected_source=/absolute/path/to/$CODEX_HOME/generated_images/.../ig_*.png",
        "qa_note=<one sentence>",
        "codex_thread_id=<thread id if visible>",
        "",
    ]


def codex_final_prompt_hints_from_task(task: WorkspaceTask) -> dict[str, str]:
    hints: dict[str, str] = {}
    for item in task.items:
        prompt_hint = item.artifactPaths.get("promptHint")
        if isinstance(prompt_hint, str) and prompt_hint.strip():
            hints[item.elementId] = prompt_hint.strip()
    return hints


def _workspace_relative_path(workspace_root: Path, path: Path) -> str:
    return path.resolve().relative_to(workspace_root.resolve()).as_posix()


def _project_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _find_element(state: Any, element_id: str) -> ElementRecord:
    for element in state.elements:
        if element.id == element_id:
            return element
    raise ValueError(f"Element {element_id} not found.")


def _record_controller_metadata(
    root: Path,
    task_id: str,
    controller_id: str,
    capacity: int,
) -> WorkspaceTask:
    def update(task: WorkspaceTask) -> WorkspaceTask:
        capacities = dict(task.metadata.get("codexFinalControllerCapacities") or {})
        capacities[controller_id] = capacity
        metadata = {
            **task.metadata,
            "codexFinalControllerCapacities": capacities,
            "codexFinalControllerCount": len(capacities),
            "codexFinalCapacity": sum(int(value) for value in capacities.values()),
        }
        return task.model_copy(update={"metadata": metadata})

    return update_workspace_task(root, task_id, update)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime) -> str:
    return value.isoformat()
