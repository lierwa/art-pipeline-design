from __future__ import annotations

import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from art_pipeline.elements import ElementRecord, WorkspaceState
from art_pipeline.codex_assets import (
    codex_final_asset_path,
    has_codex_final_asset,
)
from art_pipeline.export_files import (
    CONTACT_SHEET_PATH,
    EXPORT_ASSETS_DIR,
    EXPORT_MASKS_DIR,
    EXPORT_RELATIVE_ROOT,
    asset_has_alpha_channel,
    prepare_temp_export_dir,
    replace_export_dir,
    resolve_workspace_path,
    temp_export_relative,
    workspace_file_exists,
    write_contact_sheet,
)
from art_pipeline.export_materialization import (
    build_export_documents,
    materialize_planned_exports,
    write_export_documents,
)
from art_pipeline.export_plan import ExportPlan, PlannedExport
from art_pipeline.parent_repair_contracts import parent_removal_contract_covers_children
from art_pipeline.qa import validate_repair_output
from art_pipeline.repair_tasks import read_repair_metadata, repair_relative_path
from art_pipeline.segment_assets import has_sam2_edge_asset, sam2_edge_asset_path
from art_pipeline.segment_quality import segmentation_quality_block_reason
from art_pipeline.export_files import copy_workspace_file as _copy_workspace_file


class ExportWorkspaceRequest(BaseModel):
    allowIncompleteVisibleOnly: bool = False


MASK_DERIVED_FROM_ALPHA_WARNING = "mask derived from asset alpha because source mask was missing."
MASK_UNAVAILABLE_REASON = "mask_missing_and_asset_alpha_unavailable"
COMPLETED_ASSET_MASK_UNAVAILABLE_REASON = "completed_asset_alpha_mask_unavailable"
ACCEPTED_ASSET_MISSING_MASK_REASON = "accepted_asset_missing_mask"
EMBEDDED_KEEP_NOT_EXPORTED_REASON = "embedded_keep_not_exported_individually"
SKIP_ROLE_NOT_EXPORTED_REASON = "skip_role_not_exported"
PARENT_REPAIR_REQUIRED_REASON = "parent_repair_required"
MASK_NOT_ACCEPTED_REASON = "mask_not_accepted"
REJECTED_REASON = "rejected"
SAM2_ASSET_MISSING_REASON = "accepted_sam2_asset_missing"
CODEX_ASSET_MASK_UNAVAILABLE_REASON = "codex_final_alpha_mask_unavailable"


def export_workspace(
    workspace_root: Path,
    state: WorkspaceState,
) -> dict[str, Any]:
    if state.source is None:
        raise ValueError("Upload a source image before export.")

    workspace_path = Path(workspace_root).resolve()
    plan = _plan_exports(
        workspace_path,
        state,
    )
    export_dir = resolve_workspace_path(workspace_path, EXPORT_RELATIVE_ROOT)
    temp_export_dir = prepare_temp_export_dir(workspace_path)

    try:
        materialized = materialize_planned_exports(
            workspace_path,
            state,
            plan.planned,
            _copy_workspace_file,
        )
        documents = build_export_documents(state, plan, materialized, str(export_dir), _utc_now)
        write_export_documents(workspace_path, documents)
        write_contact_sheet(
            workspace_path,
            materialized.exported_elements,
            output_relative_path=temp_export_relative(CONTACT_SHEET_PATH),
            asset_path_mapper=temp_export_relative,
        )
        replace_export_dir(workspace_path, temp_export_dir)
    except Exception:
        if temp_export_dir.exists():
            shutil.rmtree(temp_export_dir)
        raise

    return documents.summary


def _plan_exports(
    workspace_root: Path,
    state: WorkspaceState,
) -> ExportPlan:
    plan = ExportPlan(planned=[], blocked=[], warnings=[], repair_qa_reports={})

    for element in state.elements:
        _plan_element_export(workspace_root, state, element, plan)

    return plan


def _plan_element_export(
    workspace_root: Path,
    state: WorkspaceState,
    element: ElementRecord,
    plan: ExportPlan,
) -> None:
    blocked_reason = _preflight_block_reason(workspace_root, state, element)
    if blocked_reason is not None:
        plan.blocked.append(_blocked(element, blocked_reason))
        _append_legacy_skip_warning(plan, element, blocked_reason)
        return

    if element.status == "split_parent":
        plan.warnings.append(
            f"{element.id} skipped because split_parent elements are not exported by default."
        )
        return
    if element.status == "proposal":
        plan.warnings.append(f"{element.id} skipped because proposals must be accepted before export.")
        return

    if element.mode == "visible_only":
        _plan_visible_export(workspace_root, element, plan)
        return

    if element.mode in {"needs_completion", "completed_by_codex"}:
        _plan_repair_export(workspace_root, element, plan)


def _preflight_block_reason(
    workspace_root: Path,
    state: WorkspaceState,
    element: ElementRecord,
) -> str | None:
    if element.mode == "rejected":
        return REJECTED_REASON
    if element.assetRole == "skip":
        return SKIP_ROLE_NOT_EXPORTED_REASON
    if element.assetRole == "embedded_keep":
        return EMBEDDED_KEEP_NOT_EXPORTED_REASON
    if element.assetRole == "parent":
        all_children = _removed_children(state, element)
        children = _accepted_removed_children(state, element)
        if len(children) != len(all_children):
            return PARENT_REPAIR_REQUIRED_REASON
        if children and (
            element.repairStatus != "repair_complete"
            or not parent_removal_contract_covers_children(workspace_root, element, children)
        ):
            return PARENT_REPAIR_REQUIRED_REASON
    return None


def _append_legacy_skip_warning(
    plan: ExportPlan,
    element: ElementRecord,
    blocked_reason: str,
) -> None:
    if blocked_reason == REJECTED_REASON:
        plan.warnings.append(f"{element.id} skipped because rejected elements are not exported.")


def _plan_visible_export(
    workspace_root: Path,
    element: ElementRecord,
    plan: ExportPlan,
) -> None:
    if has_codex_final_asset(workspace_root, element):
        # WHY: Codex final 是对低质量 cutout 的正式重绘结果；导出应以它的 alpha 为准，
        # 不再让旧 SAM2 mask 的洞和毛边继续决定最终资产包。
        _append_planned_export(
            plan,
            workspace_root,
            element,
            codex_final_asset_path(element),
            [],
            force_mask_from_asset=True,
            mask_unavailable_reason=CODEX_ASSET_MASK_UNAVAILABLE_REASON,
        )
        return

    # WHY: Wave 2 sticker 的准入条件是“已接受 SAM2 mask”，不是磁盘上是否已有 legacy mask；
    # 先判断这个语义门槛，避免 fresh/bbox_alpha 两条路径产生不同 block reason。
    if _requires_accepted_sam2_mask(element) and element.segmentationStatus != "mask_accepted":
        plan.blocked.append(_blocked(element, MASK_NOT_ACCEPTED_REASON))
        return
    if _requires_accepted_sam2_mask(element):
        quality_block_reason = segmentation_quality_block_reason(element)
        if quality_block_reason is not None:
            # WHY: final export 是资产包的最后防线；没有质量报告的 accepted mask 无法证明
            # 内部洞、碎片和候选选择已经过检查，不能绕过分割质量门禁。
            plan.blocked.append(_blocked(element, quality_block_reason))
            return

    explicit_mask = _explicit_source_mask_path(workspace_root, element)
    if explicit_mask is None:
        plan.blocked.append(_blocked(element, ACCEPTED_ASSET_MISSING_MASK_REASON))
        return

    source_asset_path = _visible_source_asset_path(workspace_root, element)
    if source_asset_path is None:
        plan.blocked.append(_blocked(element, SAM2_ASSET_MISSING_REASON))
        return
    if not workspace_file_exists(workspace_root, source_asset_path):
        plan.blocked.append(_blocked(element, "asset_incomplete_missing"))
        return

    _append_planned_export(
        plan,
        workspace_root,
        element,
        source_asset_path,
        [],
    )


def _plan_repair_export(
    workspace_root: Path,
    element: ElementRecord,
    plan: ExportPlan,
) -> None:
    completed_asset_path, qa_report = _load_repair_export_qa(workspace_root, element)
    if qa_report:
        plan.repair_qa_reports[element.id] = qa_report

    if _is_valid_repair_export(workspace_root, completed_asset_path, qa_report):
        _append_planned_export(
            plan,
            workspace_root,
            element,
            completed_asset_path,
            _repair_qa_export_warnings(qa_report),
            force_mask_from_asset=True,
            mask_unavailable_reason=COMPLETED_ASSET_MASK_UNAVAILABLE_REASON,
            promote_element_warnings=True,
        )
        return

    # WHY: asset_incomplete.png 是 repair/debug 输入，不是完整贴纸；final export
    # 必须保持“有效修复后才能出包”的单一准入规则。
    plan.blocked.append(_blocked(element, "needs_completion_without_valid_repair"))


def _blocked(element: ElementRecord, reason: str) -> dict[str, str]:
    return {
        "elementId": element.id,
        "name": element.name,
        "reason": reason,
    }


def _requires_accepted_sam2_mask(element: ElementRecord) -> bool:
    return element.assetRole in {"sticker", "parent", "removable_child"}


def _visible_source_asset_path(workspace_root: Path, element: ElementRecord) -> str | None:
    if element.segmentationStatus == "mask_accepted":
        return sam2_edge_asset_path(element) if has_sam2_edge_asset(workspace_root, element) else None
    return _incomplete_asset_path(element.id)


def _accepted_removed_children(
    state: WorkspaceState,
    parent: ElementRecord,
) -> list[ElementRecord]:
    return [
        child
        for child in state.elements
        if child.assetRole == "removable_child"
        and child.removeFromParent == parent.id
        and child.segmentationStatus == "mask_accepted"
    ]


def _removed_children(
    state: WorkspaceState,
    parent: ElementRecord,
) -> list[ElementRecord]:
    return [
        child
        for child in state.elements
        if child.assetRole == "removable_child"
        and child.removeFromParent == parent.id
    ]


def _load_repair_export_qa(
    workspace_root: Path,
    element: ElementRecord,
) -> tuple[str, dict[str, Any]]:
    metadata = read_repair_metadata(workspace_root, element)
    completed_asset_path = repair_relative_path(element.id, "completed_asset.png")
    qa_report = metadata.get("qaReport") or {}
    if (
        metadata["files"]["completedAsset"]
        and metadata["files"]["repairReport"]
        and workspace_file_exists(workspace_root, completed_asset_path)
    ):
        qa_report = validate_repair_output(workspace_root, element)
    return completed_asset_path, qa_report


def _is_valid_repair_export(
    workspace_root: Path,
    completed_asset_path: str,
    qa_report: dict[str, Any],
) -> bool:
    return (
        qa_report.get("status") in {"pass", "warn"}
        and workspace_file_exists(workspace_root, completed_asset_path)
    )


def _append_planned_export(
    plan: ExportPlan,
    workspace_root: Path,
    element: ElementRecord,
    source_asset_path: str,
    element_warnings: list[str],
    force_mask_from_asset: bool = False,
    mask_unavailable_reason: str = MASK_UNAVAILABLE_REASON,
    promote_element_warnings: bool = False,
) -> None:
    planned_export = _planned_export(
        workspace_root,
        element,
        source_asset_path,
        element_warnings,
        force_mask_from_asset=force_mask_from_asset,
    )
    if planned_export is None:
        plan.blocked.append(_blocked(element, mask_unavailable_reason))
        return

    plan.planned.append(planned_export)
    for warning in planned_export.warnings:
        if promote_element_warnings or warning not in element_warnings:
            plan.warnings.append(f"{element.id} {warning}")


def _planned_export(
    workspace_root: Path,
    element: ElementRecord,
    source_asset_path: str,
    warnings: list[str],
    force_mask_from_asset: bool = False,
) -> PlannedExport | None:
    source_mask_path = None if force_mask_from_asset else _source_mask_path(workspace_root, element)
    export_mask_path = f"{EXPORT_MASKS_DIR}/{element.id}.png"
    derive_mask_from_asset = force_mask_from_asset or source_mask_path is None
    if derive_mask_from_asset and not asset_has_alpha_channel(workspace_root, source_asset_path):
        return None

    export_warnings = list(warnings)
    if derive_mask_from_asset and not force_mask_from_asset:
        export_warnings.append(MASK_DERIVED_FROM_ALPHA_WARNING)

    return PlannedExport(
        element=element,
        source_asset_path=source_asset_path,
        export_asset_path=f"{EXPORT_ASSETS_DIR}/{element.id}.png",
        source_mask_path=source_mask_path,
        export_mask_path=export_mask_path,
        derive_mask_from_asset=derive_mask_from_asset,
        warnings=export_warnings,
    )


def _repair_qa_export_warnings(qa_report: dict[str, Any]) -> list[str]:
    qa_warnings = qa_report.get("warnings", [])
    if qa_warnings:
        return [f"repair QA warning: {warning}" for warning in qa_warnings]
    if qa_report.get("status") == "warn":
        return ["repair QA warning: status warn"]
    return []


def _source_mask_path(workspace_root: Path, element: ElementRecord) -> str | None:
    if element.mask and workspace_file_exists(workspace_root, element.mask):
        return element.mask

    fallback = f"elements/{element.id}/mask.png"
    return fallback if workspace_file_exists(workspace_root, fallback) else None


def _explicit_source_mask_path(workspace_root: Path, element: ElementRecord) -> str | None:
    if element.mask and workspace_file_exists(workspace_root, element.mask):
        return element.mask
    return None


def _incomplete_asset_path(element_id: str) -> str:
    return f"elements/{element_id}/asset_incomplete.png"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
