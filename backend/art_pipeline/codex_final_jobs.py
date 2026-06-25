from __future__ import annotations

from collections.abc import Callable
import json
import os
from pathlib import Path
from typing import Literal
from uuid import uuid4

from filelock import FileLock
from pydantic import BaseModel, Field

from art_pipeline.workspace.tasks import _TASK_ID_PATTERN as _WORKSPACE_TASK_ID_PATTERN


CodexFinalJobStatus = Literal[
    "queued",
    "claimed",
    "ready_for_agent",
    "agent_running",
    "raw_ready",
    "finalized",
    "failed",
    "skipped",
]

# WHY: manifest 是 WorkspaceTask 的附属产物，复用同一 ID 规则避免两处对 taskId 的解释漂移。
_TASK_ID_PATTERN = _WORKSPACE_TASK_ID_PATTERN


class CodexFinalJobInput(BaseModel):
    path: str
    role: str
    required: bool = True


class CodexFinalRemovedChild(BaseModel):
    elementId: str
    name: str
    maskPath: str


class CodexFinalJob(BaseModel):
    jobId: str
    elementId: str
    elementName: str
    status: CodexFinalJobStatus
    message: str
    workDirPath: str
    promptPath: str
    briefImagePath: str
    briefJsonPath: str
    analysisMaskPath: str = ""
    layoutGuidePath: str = ""
    qualityReportPath: str = ""
    qualityStatus: Literal["pending", "passed", "failed"] = "pending"
    qualityErrors: list[str] = Field(default_factory=list)
    qualityWarnings: list[str] = Field(default_factory=list)
    repairNote: str | None = None
    rawOutputPath: str
    finalOutputPath: str
    metadataPath: str
    inputImages: list[CodexFinalJobInput]
    promptHint: str = ""
    generationProfile: str
    removedChildren: list[CodexFinalRemovedChild] = Field(default_factory=list)
    selectedSourcePath: str | None = None
    qaNote: str | None = None
    codexThreadId: str | None = None
    controllerId: str | None = None
    leaseToken: str | None = None
    leaseExpiresAt: str | None = None
    attempt: int = 0
    claimedAt: str | None = None
    heartbeatAt: str | None = None
    startedAt: str | None = None
    finishedAt: str | None = None
    lastError: str | None = None


class CodexFinalJobManifest(BaseModel):
    version: int
    taskId: str
    createdAt: str
    jobs: list[CodexFinalJob]


def codex_final_job_dir(workspace_root: Path, task_id: str) -> Path:
    if not _TASK_ID_PATTERN.fullmatch(task_id):
        raise FileNotFoundError(task_id)
    tasks_root = (workspace_root / "tasks").resolve()
    path = (tasks_root / task_id).resolve()
    # WHY: task_id 来自持久化/URL 边界，只允许落在 tasks 根目录下；保留 resolve 校验作为正则之外的二次防线。
    path.relative_to(tasks_root)
    return path


def codex_final_job_manifest_path(workspace_root: Path, task_id: str) -> Path:
    return codex_final_job_dir(workspace_root, task_id) / "codex-final-jobs.json"


def codex_final_agent_handoff_path(workspace_root: Path, task_id: str) -> Path:
    return codex_final_job_dir(workspace_root, task_id) / "codex-final-agent-handoff.md"


def write_codex_final_job_manifest(workspace_root: Path, manifest: CodexFinalJobManifest) -> None:
    path = codex_final_job_manifest_path(workspace_root, manifest.taskId)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_name(f"{path.name}.{uuid4().hex}.tmp")
    temp_path.write_text(json.dumps(manifest.model_dump(mode="json"), indent=2), encoding="utf-8")
    os.replace(temp_path, path)


def read_codex_final_job_manifest(workspace_root: Path, task_id: str) -> CodexFinalJobManifest:
    path = codex_final_job_manifest_path(workspace_root, task_id)
    return CodexFinalJobManifest.model_validate_json(path.read_text(encoding="utf-8"))


def update_codex_final_job_manifest(
    workspace_root: Path,
    task_id: str,
    updater: Callable[[CodexFinalJobManifest], CodexFinalJobManifest],
) -> CodexFinalJobManifest:
    with _manifest_lock(workspace_root, task_id):
        manifest = read_codex_final_job_manifest(workspace_root, task_id)
        next_manifest = updater(manifest)
        write_codex_final_job_manifest(workspace_root, next_manifest)
        return next_manifest


def _manifest_lock(workspace_root: Path, task_id: str) -> FileLock:
    manifest_path = codex_final_job_manifest_path(workspace_root, task_id)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    # WHY: Codex controller 是多个 CLI 进程，不在同一个 Python 进程内；
    # 这里必须用跨进程文件锁保证 claim/ingest 不会重复消费同一个 job。
    return FileLock(str(manifest_path.with_name(f"{manifest_path.name}.lock")))
