from __future__ import annotations

from pathlib import Path
from typing import Any

from art_pipeline.asset_outputs import clear_extraction_outputs
from art_pipeline.elements import BoundingBox, CanvasBox, ElementRecord, WorkspaceState
from art_pipeline.repair.parent_contracts import parent_removal_contract_covers_children
from art_pipeline.repair.tasks import clear_repair_outputs


def replace_workspace_elements(
    state: WorkspaceState,
    elements: list[ElementRecord],
) -> WorkspaceState:
    # WHY: 多数接口只改变元素集合；词表属于工作区级配置，必须随状态重建一起保留。
    return WorkspaceState(
        source=state.source,
        elements=elements,
        detectionVocabulary=state.detectionVocabulary,
    )


def is_repair_workflow_element(element: ElementRecord) -> bool:
    return element.mode in {"needs_completion", "completed_by_codex"}


def repair_validation_state_update(
    workspace_root: Path,
    state: WorkspaceState,
    element: ElementRecord,
    qa_report: dict[str, Any],
) -> dict[str, str]:
    if qa_report["status"] == "fail":
        return {
            "status": "qa_failed",
            "mode": element.mode,
            "repairStatus": "qa_failed",
            "exportStatus": "blocked",
        }

    if _repair_contract_is_fresh(workspace_root, state, element):
        return {
            "status": "repair_complete",
            "mode": "completed_by_codex",
            "repairStatus": "repair_complete",
            "exportStatus": "ready",
        }

    # WHY: QA pass 只证明 completed_asset 可用；parent removal 还必须匹配当前 child mask/canvas，
    # 否则同一 child id 重新分割后会导出旧修复结果。
    return {
        "status": "repair_pending",
        "mode": "needs_completion",
        "repairStatus": "task_created",
        "exportStatus": "blocked",
    }


def status_after_extraction_invalidation(element: ElementRecord) -> str:
    return (
        "extract_ready"
        if element.status in {
            "accepted",
            "extract_ready",
            "extracted",
            "repair_pending",
            "repair_complete",
            "qa_failed",
        }
        and element.mode != "rejected"
        else element.status
    )


def status_after_repair_package_invalidation(element: ElementRecord) -> str:
    return (
        "extracted"
        if element.status in {"repair_pending", "repair_complete", "qa_failed"}
        else element.status
    )


def repair_artifact_invalidation_update(element: ElementRecord) -> dict[str, str]:
    should_reset_repair = (
        element.repairStatus in {"task_created", "redraw_pending", "repair_complete", "qa_failed"}
        or element.exportStatus in {"ready", "exported", "blocked"}
        or element.mode == "completed_by_codex"
    )
    if not should_reset_repair:
        return {}

    # WHY: 清除 mask/geometry/missing-mask 会删除 repair 文件；新旧状态必须一起失效，
    # 否则前端会把已经不存在的 repair 输出显示为可导出。
    return {
        "repairStatus": "required" if is_repair_workflow_element(element) else "not_required",
        "exportStatus": "blocked",
    }


def reset_repair_mode(element: ElementRecord) -> str:
    return "needs_completion" if element.mode == "completed_by_codex" else element.mode


def invalidate_geometry_changes(
    workspace_root: Path,
    previous_state: WorkspaceState,
    next_state: WorkspaceState,
) -> WorkspaceState:
    previous_by_id = {element.id: element for element in previous_state.elements}
    next_elements: list[ElementRecord] = []
    for element in next_state.elements:
        previous = previous_by_id.get(element.id)
        if previous is None or not _element_geometry_changed(previous, element):
            next_elements.append(element)
            continue

        clear_extraction_outputs(workspace_root, element.id)
        clear_repair_outputs(workspace_root, element.id)
        next_elements.append(
            element.model_copy(
                update={
                    "status": _status_after_geometry_invalidation(element),
                    "mode": reset_repair_mode(element),
                    "mask": None,
                    "segmentationStatus": "not_started",
                    **repair_artifact_invalidation_update(element),
                }
            )
        )

    return replace_workspace_elements(next_state, next_elements)


def _repair_contract_is_fresh(
    workspace_root: Path,
    state: WorkspaceState,
    element: ElementRecord,
) -> bool:
    if element.assetRole != "parent":
        return True
    children = [
        child
        for child in state.elements
        if child.assetRole == "removable_child"
        and child.removeFromParent == element.id
        and child.segmentationStatus == "mask_accepted"
    ]
    return not children or parent_removal_contract_covers_children(workspace_root, element, children)


def _status_after_geometry_invalidation(element: ElementRecord) -> str:
    return (
        "extract_ready"
        if _is_geometry_extract_ready_status(element)
        else element.status
    )


def _element_geometry_changed(previous: ElementRecord, current: ElementRecord) -> bool:
    return not (
        _boxes_equal(previous.bbox, current.bbox)
        and previous.canvas is not None
        and current.canvas is not None
        and _boxes_equal(previous.canvas, current.canvas)
    )


def _boxes_equal(left: BoundingBox | CanvasBox, right: BoundingBox | CanvasBox) -> bool:
    return (
        left.x == right.x
        and left.y == right.y
        and left.w == right.w
        and left.h == right.h
    )


def _is_geometry_extract_ready_status(element: ElementRecord) -> bool:
    return (
        element.status
        in {
            "accepted",
            "extract_ready",
            "extracted",
            "repair_pending",
            "repair_complete",
            "qa_failed",
        }
        and element.mode != "rejected"
    )
