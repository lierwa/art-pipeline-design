from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from art_pipeline.codex_final_paths import CODEX_FINAL_STAGE, codex_final_paths
from art_pipeline.exporting.files import resolve_workspace_path


CODEX_FINAL_CANDIDATE_FILENAME = "candidate_asset.png"
CODEX_FINAL_QUALITY_REPORT_FILENAME = "quality_report.json"


@dataclass(frozen=True)
class CodexFinalRepairInputPaths:
    previous_final_path: str | None
    failed_candidate_path: str | None


def discover_codex_final_repair_input_paths(
    workspace_root: Path,
    element_id: str,
) -> CodexFinalRepairInputPaths:
    paths = codex_final_paths(element_id)
    previous_final_path = (
        paths["assetPath"]
        if resolve_workspace_path(workspace_root, paths["assetPath"]).is_file()
        else None
    )
    return CodexFinalRepairInputPaths(
        previous_final_path=previous_final_path,
        failed_candidate_path=_latest_failed_candidate_path(workspace_root, element_id),
    )


def _latest_failed_candidate_path(workspace_root: Path, element_id: str) -> str | None:
    job_root = resolve_workspace_path(workspace_root, f"elements/{element_id}/{CODEX_FINAL_STAGE}/job")
    if not job_root.is_dir():
        return None
    try:
        job_dirs = sorted(
            (path for path in job_root.iterdir() if path.is_dir()),
            key=lambda path: path.name,
            reverse=True,
        )
    except OSError:
        return None
    workspace_base = workspace_root.resolve()
    for job_dir in job_dirs:
        report_file = job_dir / CODEX_FINAL_QUALITY_REPORT_FILENAME
        candidate_file = job_dir / CODEX_FINAL_CANDIDATE_FILENAME
        if not _is_workspace_file(report_file, workspace_base) or not _is_workspace_file(
            candidate_file,
            workspace_base,
        ):
            continue
        if _quality_report_status(report_file) != "failed":
            continue
        # WHY: failed_candidate 只是负面参照；宁可缺省，也不能把跨 element、
        # 半写入或未失败的 job 当成事实来源传进生成提示。
        return _workspace_relative_path(workspace_root, candidate_file)
    return None


def _is_workspace_file(path: Path, workspace_base: Path) -> bool:
    try:
        resolved = path.resolve()
        resolved.relative_to(workspace_base)
        return path.is_file()
    except (OSError, ValueError):
        return False


def _quality_report_status(report_file: Path) -> str | None:
    try:
        report: Any = json.loads(report_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(report, dict):
        return None
    status = report.get("status")
    return status if isinstance(status, str) else None


def _workspace_relative_path(workspace_root: Path, path: Path) -> str:
    return path.resolve().relative_to(workspace_root.resolve()).as_posix()
