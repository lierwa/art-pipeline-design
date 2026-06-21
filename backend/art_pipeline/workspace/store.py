from __future__ import annotations

import json
import os
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException
from pydantic import BaseModel

from art_pipeline.elements import (
    DEFAULT_WORKSPACE_VOCABULARY,
    EXPANDED_DEFAULT_WORKSPACE_VOCABULARY,
    WorkspaceState,
)

RUN_ID_PATTERN = re.compile(r"^run_[A-Za-z0-9_-]+$")


class WorkspaceRunSummary(BaseModel):
    id: str
    title: str
    sourceFilename: str
    createdAt: str
    updatedAt: str
    status: str
    elementCount: int


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def runs_root(workspace_root: Path) -> Path:
    return workspace_root / "runs"


def runs_index_path(workspace_root: Path) -> Path:
    return runs_root(workspace_root) / "index.json"


def run_root(workspace_root: Path, run_id: str) -> Path:
    if not RUN_ID_PATTERN.fullmatch(run_id):
        raise HTTPException(status_code=400, detail=f"Invalid processing record id: {run_id}.")
    root = (runs_root(workspace_root) / run_id).resolve()
    try:
        root.relative_to(runs_root(workspace_root).resolve())
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Processing record not found.") from exc
    return root


def resolve_workspace_root(workspace_root: Path, run_id: str | None) -> Path:
    if not run_id:
        return workspace_root

    root = run_root(workspace_root, run_id)
    if not root.exists():
        raise HTTPException(status_code=404, detail="Processing record not found.")
    return root


def next_run_id(workspace_root: Path, filename: str) -> str:
    stem = Path(filename).stem or "source"
    slug = re.sub(r"[^A-Za-z0-9_-]+", "-", stem).strip("-_").lower() or "source"
    slug = slug[:36]
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
    base = f"run_{timestamp}_{slug}"
    candidate = base
    suffix = 2
    while run_root(workspace_root, candidate).exists():
        candidate = f"{base}_{suffix}"
        suffix += 1
    return candidate


def read_runs(workspace_root: Path) -> list[WorkspaceRunSummary]:
    index_path = runs_index_path(workspace_root)
    if not index_path.exists():
        return []

    payload = json.loads(index_path.read_text(encoding="utf-8"))
    raw_runs = payload.get("runs", []) if isinstance(payload, dict) else []
    runs = [WorkspaceRunSummary.model_validate(run) for run in raw_runs]
    return sorted(runs, key=lambda run: run.updatedAt, reverse=True)


def write_runs(workspace_root: Path, runs: list[WorkspaceRunSummary]) -> None:
    index_path = runs_index_path(workspace_root)
    index_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = index_path.with_suffix(".json.tmp")
    temp_path.write_text(
        json.dumps(
            {"runs": [run.model_dump(mode="json") for run in runs]},
            indent=2,
        ),
        encoding="utf-8",
    )
    os.replace(temp_path, index_path)


def upsert_run(workspace_root: Path, run: WorkspaceRunSummary) -> None:
    existing = [current for current in read_runs(workspace_root) if current.id != run.id]
    write_runs(workspace_root, [run, *existing])


def derive_run_status(workspace_root: Path, state: WorkspaceState) -> str:
    if state.source is None:
        return "pending"
    if (workspace_root / "export" / "manifest.json").exists():
        return "exported"
    if any(element.status in {"extracted", "repair_pending", "repair_complete"} for element in state.elements):
        return "extracting"
    if state.elements:
        return "reviewing"
    return "uploaded"


def write_state(workspace_root: Path, state: WorkspaceState) -> None:
    state_path = workspace_state_path(workspace_root)
    state_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = state_path.with_suffix(".json.tmp")
    temp_path.write_text(
        json.dumps(state.model_dump(mode="json"), indent=2),
        encoding="utf-8",
    )
    os.replace(temp_path, state_path)
    maybe_update_run_index(workspace_root.resolve(), state)


def read_state(workspace_root: Path) -> WorkspaceState:
    state_path = workspace_state_path(workspace_root)
    if not state_path.exists():
        return WorkspaceState()
    state = WorkspaceState.model_validate_json(state_path.read_text(encoding="utf-8"))
    return migrate_workspace_state(state)


def source_path(workspace_root: Path) -> Path:
    return workspace_root / "source" / "original.png"


def workspace_state_path(workspace_root: Path) -> Path:
    return workspace_root / "state.json"


def clear_generated_workspace_outputs(workspace_root: Path) -> None:
    workspace_path = workspace_root.resolve()
    for dirname in (
        "elements",
        "export",
        "export.tmp",
        "export.previous",
        "split_requests",
    ):
        output_dir = (workspace_path / dirname).resolve()
        try:
            output_dir.relative_to(workspace_path)
        except ValueError as exc:
            raise ValueError("Workspace output path must stay inside workspace root.") from exc
        if output_dir.exists():
            if output_dir.is_dir():
                shutil.rmtree(output_dir)
            else:
                output_dir.unlink()


def maybe_update_run_index(workspace_root: Path, state: WorkspaceState) -> None:
    if workspace_root.parent.name != "runs":
        return

    base_root = workspace_root.parent.parent
    run_id = workspace_root.name
    runs = read_runs(base_root)
    next_runs: list[WorkspaceRunSummary] = []
    changed = False
    for run in runs:
        if run.id != run_id:
            next_runs.append(run)
            continue
        changed = True
        next_runs.append(
            run.model_copy(
                update={
                    "updatedAt": utc_now(),
                    "status": derive_run_status(workspace_root, state),
                    "elementCount": len(state.elements),
                }
            )
        )

    if changed:
        write_runs(base_root, next_runs)


def migrate_workspace_state(state: WorkspaceState) -> WorkspaceState:
    if state.detectionVocabulary != EXPANDED_DEFAULT_WORKSPACE_VOCABULARY:
        return state

    # WHY: 昨晚短期扩展的 84 词默认值会把 Grounding DINO 第一轮检测带偏到部件；
    # 仅精确匹配该默认值时降级，避免覆盖用户自己编辑过的 prompt。
    return WorkspaceState(
        source=state.source,
        elements=state.elements,
        detectionVocabulary=DEFAULT_WORKSPACE_VOCABULARY.copy(),
    )
