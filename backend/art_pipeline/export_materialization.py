from __future__ import annotations

from pathlib import Path
from typing import Any, Callable

from art_pipeline.elements import WorkspaceState
from art_pipeline.export_files import (
    EXPORT_RELATIVE_ROOT,
    EXPORT_SOURCE_CROPS_DIR,
    LEVEL_PATH,
    MANIFEST_PATH,
    QA_REPORT_PATH,
    export_paths,
    resolve_workspace_path,
    temp_export_relative,
    write_alpha_mask,
    write_json,
    write_sticker_asset,
)
from art_pipeline.export_plan import ExportDocuments, ExportPlan, MaterializedExports, PlannedExport


CopyWorkspaceFile = Callable[[Path, str, str], None]
UtcNow = Callable[[], str]


def materialize_planned_exports(
    workspace_path: Path,
    state: WorkspaceState,
    planned: list[PlannedExport],
    copy_file: CopyWorkspaceFile,
) -> MaterializedExports:
    exported_elements: list[dict[str, Any]] = []
    manifest_elements: list[dict[str, Any]] = []
    placements: list[dict[str, Any]] = []

    child_map = _child_ids_by_parent(state)
    for planned_export in sorted(planned, key=lambda item: (item.element.layer, item.element.id)):
        _copy_export_artifacts(workspace_path, planned_export, copy_file)
        exported_elements.append(_exported_element_entry(planned_export))
        manifest_elements.append(_manifest_element_entry(planned_export, child_map))
        placements.append(_level_placement_entry(planned_export, child_map))

    return MaterializedExports(
        exported_elements=exported_elements,
        manifest_elements=manifest_elements,
        placements=placements,
    )


def build_export_documents(
    state: WorkspaceState,
    plan: ExportPlan,
    materialized: MaterializedExports,
    export_dir: str,
    utc_now: UtcNow,
) -> ExportDocuments:
    generated_at = utc_now()
    summary = {
        "exportableCount": len(materialized.exported_elements),
        "blockedCount": len(plan.blocked),
        "warnings": plan.warnings,
        "outputDir": export_dir,
        "paths": export_paths(),
        "exportedElements": materialized.exported_elements,
        "blockedElements": plan.blocked,
    }
    manifest = {
        "assetPackVersion": 1,
        "generatedAt": generated_at,
        "source": state.source.model_dump(mode="json") if state.source else None,
        "paths": export_paths(),
        "elements": materialized.manifest_elements,
    }
    level = {
        "source": state.source.model_dump(mode="json") if state.source else None,
        "placements": materialized.placements,
    }
    qa_report = {
        "generatedAt": generated_at,
        "exportableCount": summary["exportableCount"],
        "blockedCount": summary["blockedCount"],
        "warnings": plan.warnings,
        "blockedElements": plan.blocked,
        "repairQaReports": plan.repair_qa_reports,
    }
    return ExportDocuments(summary=summary, manifest=manifest, level=level, qa_report=qa_report)


def write_export_documents(workspace_path: Path, documents: ExportDocuments) -> None:
    write_json(
        resolve_workspace_path(workspace_path, temp_export_relative(MANIFEST_PATH)),
        documents.manifest,
    )
    write_json(
        resolve_workspace_path(workspace_path, temp_export_relative(LEVEL_PATH)),
        documents.level,
    )
    write_json(
        resolve_workspace_path(workspace_path, temp_export_relative(QA_REPORT_PATH)),
        documents.qa_report,
    )


def _copy_export_artifacts(
    workspace_path: Path,
    planned_export: PlannedExport,
    copy_file: CopyWorkspaceFile,
) -> None:
    copy_file(
        workspace_path,
        _source_crop_source_path(planned_export),
        temp_export_relative(_export_source_crop_path(planned_export)),
    )
    write_sticker_asset(
        workspace_path,
        planned_export.source_asset_path,
        temp_export_relative(planned_export.export_asset_path),
    )
    if planned_export.source_mask_path and planned_export.export_mask_path:
        copy_file(
            workspace_path,
            planned_export.source_mask_path,
            temp_export_relative(planned_export.export_mask_path),
        )
        return
    if planned_export.derive_mask_from_asset:
        write_alpha_mask(
            workspace_path,
            planned_export.source_asset_path,
            temp_export_relative(planned_export.export_mask_path),
        )
        return
    raise ValueError(f"Mask source is missing for exported element {planned_export.element.id}.")


def _exported_element_entry(planned_export: PlannedExport) -> dict[str, Any]:
    element = planned_export.element
    return {
        "elementId": element.id,
        "name": element.name,
        "assetPath": planned_export.export_asset_path,
        "maskPath": planned_export.export_mask_path,
        "sourceAssetPath": planned_export.source_asset_path,
        "warnings": planned_export.warnings,
    }


def _manifest_element_entry(
    planned_export: PlannedExport,
    child_map: dict[str, list[str]],
) -> dict[str, Any]:
    element = planned_export.element
    return {
        "id": element.id,
        "name": element.name,
        "mode": element.mode,
        "status": element.status,
        "assetRole": element.assetRole,
        "role": element.assetRole,
        "removeFromParent": element.removeFromParent,
        "children": child_map.get(element.id, []),
        "sourceAssetPath": planned_export.source_asset_path,
        "sourceCropPath": _export_source_crop_path(planned_export),
        "assetPath": planned_export.export_asset_path,
        "maskPath": planned_export.export_mask_path,
        "bbox": element.bbox.model_dump(mode="json"),
        "canvas": element.canvas.model_dump(mode="json") if element.canvas else None,
        "layer": element.layer,
        "parentId": element.parentId,
        "sourceProvider": element.sourceProvider,
        "sourcePrompt": element.sourcePrompt,
        "confidence": element.confidence,
        "segmentationProvider": _segmentation_provider(planned_export),
        "repairProvider": _repair_provider(planned_export),
        "segmentationStatus": element.segmentationStatus,
        "repairStatus": element.repairStatus,
        "exportStatus": element.exportStatus,
        "qa": {"warnings": planned_export.warnings},
        "notes": element.notes,
        "warnings": planned_export.warnings,
        "visible": element.visible,
        "source": element.source,
    }


def _level_placement_entry(
    planned_export: PlannedExport,
    child_map: dict[str, list[str]],
) -> dict[str, Any]:
    element = planned_export.element
    return {
        "elementId": element.id,
        "name": element.name,
        "role": element.assetRole,
        "assetRole": element.assetRole,
        "assetPath": planned_export.export_asset_path,
        "maskPath": planned_export.export_mask_path,
        "sourceCropPath": _export_source_crop_path(planned_export),
        "layer": element.layer,
        "bbox": element.bbox.model_dump(mode="json"),
        "canvas": element.canvas.model_dump(mode="json") if element.canvas else None,
        "parentId": element.parentId,
        "removeFromParent": element.removeFromParent,
        "children": child_map.get(element.id, []),
    }


def _child_ids_by_parent(state: WorkspaceState) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    for element in state.elements:
        for parent_id in (element.parentId, element.removeFromParent):
            if parent_id:
                result.setdefault(parent_id, []).append(element.id)
    return {parent_id: sorted(set(child_ids)) for parent_id, child_ids in result.items()}


def _source_crop_source_path(planned_export: PlannedExport) -> str:
    return planned_export.source_asset_path.rsplit("/", 1)[0] + "/source_crop.png"


def _export_source_crop_path(planned_export: PlannedExport) -> str:
    return f"{EXPORT_SOURCE_CROPS_DIR}/{planned_export.element.id}.png"


def _segmentation_provider(planned_export: PlannedExport) -> str | None:
    if "/sam2_edge/" in planned_export.source_asset_path:
        return "sam2_edge"
    return None


def _repair_provider(planned_export: PlannedExport) -> str | None:
    if "/repair/" in planned_export.source_asset_path:
        return "repair"
    return None
