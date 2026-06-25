from __future__ import annotations

import json
import os
import shutil
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field

from art_pipeline.elements import ElementRecord, WorkspaceState


WorkflowStage = Literal["upload", "detect", "mask", "generate"]
SnapshotStage = Literal["upload", "detect", "mask"]


class WorkflowTaskIds(BaseModel):
    detectionBatch: str | None = None
    sam2MaskBatch: str | None = None
    codexFinalBatches: list[str] = Field(default_factory=list)


class WorkflowStageSnapshots(BaseModel):
    upload: WorkspaceState | None = None
    detect: WorkspaceState | None = None
    mask: WorkspaceState | None = None


class WorkflowState(BaseModel):
    stage: WorkflowStage = "upload"
    generateSelection: dict[str, bool] = Field(default_factory=dict)
    generatePromptHints: dict[str, str] = Field(default_factory=dict)
    stageSnapshots: WorkflowStageSnapshots = Field(default_factory=WorkflowStageSnapshots)
    taskIds: WorkflowTaskIds = Field(default_factory=WorkflowTaskIds)
    lastExportSummary: dict[str, Any] | None = None


class PersistedWorkflowState(BaseModel):
    stage: WorkflowStage = "upload"
    generateSelection: dict[str, bool] = Field(default_factory=dict)
    generatePromptHints: dict[str, str] = Field(default_factory=dict)
    taskIds: WorkflowTaskIds = Field(default_factory=WorkflowTaskIds)
    lastExportSummary: dict[str, Any] | None = None


def read_workflow(workspace_root: Path, state: WorkspaceState) -> WorkflowState:
    persisted = _read_or_initialize_persisted_workflow(workspace_root, state)
    return _hydrate_workflow_snapshots(workspace_root, persisted)


def write_workflow(workspace_root: Path, workflow: WorkflowState | PersistedWorkflowState) -> WorkflowState:
    persisted = _to_persisted_workflow(workflow)
    _write_persisted_workflow(workspace_root, persisted)
    return _hydrate_workflow_snapshots(workspace_root, persisted)


def initialize_upload_workflow(workspace_root: Path, state: WorkspaceState) -> WorkflowState:
    workflow = PersistedWorkflowState(
        stage="upload",
        generateSelection=default_generate_selection(state),
    )
    _write_persisted_workflow(workspace_root, workflow)
    return _hydrate_workflow_snapshots(workspace_root, workflow)


def default_generate_selection(state: WorkspaceState) -> dict[str, bool]:
    return {
        element.id: True
        for element in state.elements
        if is_generate_selectable_element(element)
    }


def merge_generate_selection(
    state: WorkspaceState,
    current: dict[str, bool] | None = None,
) -> dict[str, bool]:
    current = current or {}
    selectable_ids = {
        element.id
        for element in state.elements
        if is_generate_selectable_element(element)
    }
    return {
        element_id: current[element_id] if element_id in current else True
        for element_id in selectable_ids
    }


def merge_generate_prompt_hints(
    state: WorkspaceState,
    current: dict[str, str] | None = None,
) -> dict[str, str]:
    current = current or {}
    selectable_ids = {
        element.id
        for element in state.elements
        if is_generate_selectable_element(element)
    }
    return {
        element_id: hint.strip()
        for element_id, hint in current.items()
        if element_id in selectable_ids and isinstance(hint, str) and hint.strip()
    }


def selected_generate_element_ids(
    state: WorkspaceState,
    selection: dict[str, bool],
) -> list[str]:
    selectable_ids = {
        element.id
        for element in state.elements
        if is_generate_selectable_element(element)
    }
    return [
        element.id
        for element in state.elements
        if element.id in selectable_ids and selection.get(element.id, True)
    ]


def is_generate_selectable_element(element: ElementRecord) -> bool:
    if element.mergedInto or element.mode == "rejected" or element.status == "rejected":
        return False
    if not element.visible or element.assetRole == "skip":
        return False
    return element.assetRole in {"sticker", "removable_child", "parent"}


def save_stage_snapshot(
    workspace_root: Path,
    stage: SnapshotStage,
    state: WorkspaceState,
) -> None:
    path = _snapshot_path(workspace_root, stage)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(".json.tmp")
    temp_path.write_text(json.dumps(state.model_dump(mode="json"), indent=2), encoding="utf-8")
    os.replace(temp_path, path)


def read_stage_snapshot(workspace_root: Path, stage: SnapshotStage) -> WorkspaceState | None:
    path = _snapshot_path(workspace_root, stage)
    if not path.exists():
        return None
    return WorkspaceState.model_validate_json(path.read_text(encoding="utf-8"))


def clear_stage_outputs(workspace_root: Path, stage: WorkflowStage) -> None:
    if stage == "upload":
        _clear_directories(workspace_root, ("elements", "tasks", "stage_snapshots", "export"))
        return
    if stage == "mask":
        _clear_element_stage_dirs(workspace_root, ("sam2_edge",))
        _clear_tasks_by_token(workspace_root, "sam2-mask-batch")
        return
    if stage == "generate":
        _clear_element_stage_dirs(workspace_root, ("codex_final", "repair"))
        _clear_element_files(workspace_root, ("missing_mask.png", "repair_authority.json"))
        _clear_directories(workspace_root, ("export", "export.tmp", "export.previous"))
        _clear_tasks_by_token(workspace_root, "codex-final-batch")


def workflow_path(workspace_root: Path) -> Path:
    return workspace_root / "workflow.json"


def _read_or_initialize_persisted_workflow(
    workspace_root: Path,
    state: WorkspaceState,
) -> PersistedWorkflowState:
    path = workflow_path(workspace_root)
    if path.exists():
        persisted = PersistedWorkflowState.model_validate_json(path.read_text(encoding="utf-8"))
        derived_stage = derive_initial_stage(state)
        stage = derived_stage if persisted.stage == "upload" and derived_stage != "upload" else persisted.stage
        updated = persisted.model_copy(
            update={
                "stage": stage,
                "generateSelection": merge_generate_selection(state, persisted.generateSelection),
                "generatePromptHints": merge_generate_prompt_hints(state, persisted.generatePromptHints),
            }
        )
        if updated != persisted:
            # WHY: 旧 run 或测试会先创建 upload workflow，再通过 state.json 恢复已检测资产；
            # 读取边界必须把阶段迁移回真实业务位置，避免 UI 永远停在 Upload。
            _write_persisted_workflow(workspace_root, updated)
        return updated

    persisted = PersistedWorkflowState(
        stage=derive_initial_stage(state),
        generateSelection=default_generate_selection(state),
        generatePromptHints={},
    )
    _write_persisted_workflow(workspace_root, persisted)
    return persisted


def derive_initial_stage(state: WorkspaceState) -> WorkflowStage:
    if state.source is None:
        return "upload"
    if not state.elements:
        return "upload"
    actionable = [element for element in state.elements if is_generate_selectable_element(element)]
    if not actionable:
        # WHY: 历史 run 可能只剩合并源框或 skip 框，但这仍是检测后的资源整理态；
        # 不能回写 upload，否则前端主 CTA 会误导用户重新跑检测。
        return "detect"
    if any(_is_detection_candidate(element) for element in actionable):
        return "detect"
    if any(element.segmentationStatus != "mask_accepted" for element in actionable):
        return "mask"
    return "generate"


def _is_detection_candidate(element: ElementRecord) -> bool:
    return element.status in {
        "model_detected",
        "click_detected",
        "proposal",
        "edited",
        "child",
        "merged",
        "qa_failed",
    }


def _hydrate_workflow_snapshots(
    workspace_root: Path,
    workflow: PersistedWorkflowState,
) -> WorkflowState:
    return WorkflowState(
        stage=workflow.stage,
        generateSelection=workflow.generateSelection,
        generatePromptHints=workflow.generatePromptHints,
        stageSnapshots=WorkflowStageSnapshots(
            upload=read_stage_snapshot(workspace_root, "upload"),
            detect=read_stage_snapshot(workspace_root, "detect"),
            mask=read_stage_snapshot(workspace_root, "mask"),
        ),
        taskIds=workflow.taskIds,
        lastExportSummary=workflow.lastExportSummary,
    )


def _to_persisted_workflow(
    workflow: WorkflowState | PersistedWorkflowState,
) -> PersistedWorkflowState:
    if isinstance(workflow, PersistedWorkflowState):
        return workflow
    return PersistedWorkflowState(
        stage=workflow.stage,
        generateSelection=workflow.generateSelection,
        generatePromptHints=workflow.generatePromptHints,
        taskIds=workflow.taskIds,
        lastExportSummary=workflow.lastExportSummary,
    )


def _write_persisted_workflow(
    workspace_root: Path,
    workflow: PersistedWorkflowState,
) -> None:
    path = workflow_path(workspace_root)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(".json.tmp")
    temp_path.write_text(json.dumps(workflow.model_dump(mode="json"), indent=2), encoding="utf-8")
    os.replace(temp_path, path)


def _snapshot_path(workspace_root: Path, stage: SnapshotStage) -> Path:
    return workspace_root / "stage_snapshots" / f"{stage}.json"


def _clear_directories(workspace_root: Path, relative_dirs: tuple[str, ...]) -> None:
    workspace_path = workspace_root.resolve()
    for dirname in relative_dirs:
        path = (workspace_path / dirname).resolve()
        path.relative_to(workspace_path)
        if path.exists():
            if path.is_dir():
                shutil.rmtree(path)
            else:
                path.unlink()


def _clear_element_stage_dirs(workspace_root: Path, stage_dirs: tuple[str, ...]) -> None:
    elements_root = workspace_root / "elements"
    if not elements_root.exists():
        return
    for element_dir in elements_root.iterdir():
        if not element_dir.is_dir():
            continue
        for dirname in stage_dirs:
            path = (element_dir / dirname).resolve()
            path.relative_to(element_dir.resolve())
            if path.exists():
                if path.is_dir():
                    shutil.rmtree(path)
                else:
                    path.unlink()


def _clear_element_files(workspace_root: Path, filenames: tuple[str, ...]) -> None:
    elements_root = workspace_root / "elements"
    if not elements_root.exists():
        return
    for element_dir in elements_root.iterdir():
        if not element_dir.is_dir():
            continue
        for filename in filenames:
            path = (element_dir / filename).resolve()
            path.relative_to(element_dir.resolve())
            if path.exists() and path.is_file():
                path.unlink()


def _clear_tasks_by_token(workspace_root: Path, token: str) -> None:
    tasks_root = workspace_root / "tasks"
    if not tasks_root.exists():
        return
    for path in tasks_root.glob("task_*.json"):
        if token in path.stem:
            path.unlink()
