from __future__ import annotations

import json
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel

from art_pipeline.elements import ElementRecord, WorkspaceState
from art_pipeline.repair_tasks import read_repair_metadata, repair_relative_path


class ExportWorkspaceRequest(BaseModel):
    allowIncompleteVisibleOnly: bool = False


@dataclass(frozen=True)
class PlannedExport:
    element: ElementRecord
    source_asset_path: str
    export_asset_path: str
    source_mask_path: str | None
    export_mask_path: str | None
    warnings: list[str]


EXPORT_RELATIVE_ROOT = "export"
EXPORT_ASSETS_DIR = "export/assets"
EXPORT_MASKS_DIR = "export/masks"
MANIFEST_PATH = "export/manifest.json"
LEVEL_PATH = "export/level.json"
CONTACT_SHEET_PATH = "export/contact_sheet.png"
QA_REPORT_PATH = "export/qa_report.json"


def export_workspace(
    workspace_root: Path,
    state: WorkspaceState,
    allow_incomplete_visible_only: bool = False,
) -> dict[str, Any]:
    if state.source is None:
        raise ValueError("Upload a source image before export.")

    workspace_path = Path(workspace_root).resolve()
    export_dir = _prepare_export_dir(workspace_path)
    planned, blocked, warnings, repair_qa_reports = _plan_exports(
        workspace_path,
        state,
        allow_incomplete_visible_only,
    )

    exported_elements: list[dict[str, Any]] = []
    manifest_elements: list[dict[str, Any]] = []
    placements: list[dict[str, Any]] = []
    for planned_export in sorted(
        planned,
        key=lambda item: (item.element.layer, item.element.id),
    ):
        element = planned_export.element
        _copy_workspace_file(
            workspace_path,
            planned_export.source_asset_path,
            planned_export.export_asset_path,
        )
        if planned_export.source_mask_path and planned_export.export_mask_path:
            _copy_workspace_file(
                workspace_path,
                planned_export.source_mask_path,
                planned_export.export_mask_path,
            )

        exported_entry = {
            "elementId": element.id,
            "name": element.name,
            "assetPath": planned_export.export_asset_path,
            "maskPath": planned_export.export_mask_path,
            "sourceAssetPath": planned_export.source_asset_path,
            "warnings": planned_export.warnings,
        }
        exported_elements.append(exported_entry)

        manifest_elements.append(
            {
                "id": element.id,
                "name": element.name,
                "mode": element.mode,
                "status": element.status,
                "sourceAssetPath": planned_export.source_asset_path,
                "assetPath": planned_export.export_asset_path,
                "maskPath": planned_export.export_mask_path,
                "bbox": element.bbox.model_dump(mode="json"),
                "canvas": element.canvas.model_dump(mode="json") if element.canvas else None,
                "layer": element.layer,
                "parentId": element.parentId,
                "notes": element.notes,
                "warnings": planned_export.warnings,
                "visible": element.visible,
                "source": element.source,
            }
        )
        placements.append(
            {
                "elementId": element.id,
                "name": element.name,
                "assetPath": planned_export.export_asset_path,
                "maskPath": planned_export.export_mask_path,
                "layer": element.layer,
                "bbox": element.bbox.model_dump(mode="json"),
                "canvas": element.canvas.model_dump(mode="json") if element.canvas else None,
                "parentId": element.parentId,
            }
        )

    summary: dict[str, Any] = {
        "exportableCount": len(exported_elements),
        "blockedCount": len(blocked),
        "warnings": warnings,
        "outputDir": str(export_dir),
        "paths": _export_paths(),
        "exportedElements": exported_elements,
        "blockedElements": blocked,
    }

    manifest = {
        "assetPackVersion": 1,
        "generatedAt": _utc_now(),
        "source": state.source.model_dump(mode="json"),
        "paths": _export_paths(),
        "elements": manifest_elements,
    }
    level = {
        "source": state.source.model_dump(mode="json"),
        "placements": placements,
    }
    qa_report = {
        "generatedAt": manifest["generatedAt"],
        "exportableCount": summary["exportableCount"],
        "blockedCount": summary["blockedCount"],
        "warnings": warnings,
        "blockedElements": blocked,
        "repairQaReports": repair_qa_reports,
    }

    _write_json(workspace_path / MANIFEST_PATH, manifest)
    _write_json(workspace_path / LEVEL_PATH, level)
    _write_json(workspace_path / QA_REPORT_PATH, qa_report)
    _write_contact_sheet(workspace_path, exported_elements)
    return summary


def _plan_exports(
    workspace_root: Path,
    state: WorkspaceState,
    allow_incomplete_visible_only: bool,
) -> tuple[list[PlannedExport], list[dict[str, str]], list[str], dict[str, Any]]:
    planned: list[PlannedExport] = []
    blocked: list[dict[str, str]] = []
    warnings: list[str] = []
    repair_qa_reports: dict[str, Any] = {}

    for element in state.elements:
        if element.mode == "rejected":
            warnings.append(f"{element.id} skipped because rejected elements are not exported.")
            continue
        if element.status == "split_parent":
            warnings.append(
                f"{element.id} skipped because split_parent elements are not exported by default."
            )
            continue
        if element.status == "proposal":
            warnings.append(f"{element.id} skipped because proposals must be accepted before export.")
            continue

        if element.mode == "visible_only":
            source_asset_path = _incomplete_asset_path(element.id)
            if not _workspace_file_exists(workspace_root, source_asset_path):
                blocked.append(
                    {
                        "elementId": element.id,
                        "name": element.name,
                        "reason": "asset_incomplete_missing",
                    }
                )
                continue
            planned.append(_planned_export(workspace_root, element, source_asset_path, []))
            continue

        if element.mode in {"needs_completion", "completed_by_codex"}:
            metadata = read_repair_metadata(workspace_root, element)
            if metadata.get("qaReport") is not None:
                repair_qa_reports[element.id] = metadata["qaReport"]

            completed_asset_path = repair_relative_path(element.id, "completed_asset.png")
            valid_repair = (
                metadata["files"]["completedAsset"]
                and metadata["files"]["repairReport"]
                and metadata.get("qaReport", {}).get("status") == "pass"
                and _workspace_file_exists(workspace_root, completed_asset_path)
            )
            if valid_repair:
                planned.append(_planned_export(workspace_root, element, completed_asset_path, []))
                continue

            incomplete_asset_path = _incomplete_asset_path(element.id)
            if allow_incomplete_visible_only:
                if not _workspace_file_exists(workspace_root, incomplete_asset_path):
                    blocked.append(
                        {
                            "elementId": element.id,
                            "name": element.name,
                            "reason": "asset_incomplete_missing",
                        }
                    )
                    continue
                warning = (
                    "needs_completion exported from asset_incomplete.png by explicit override."
                )
                warnings.append(f"{element.id} {warning}")
                planned.append(
                    _planned_export(workspace_root, element, incomplete_asset_path, [warning])
                )
                continue

            blocked.append(
                {
                    "elementId": element.id,
                    "name": element.name,
                    "reason": "needs_completion_without_valid_repair",
                }
            )

    return planned, blocked, warnings, repair_qa_reports


def _planned_export(
    workspace_root: Path,
    element: ElementRecord,
    source_asset_path: str,
    warnings: list[str],
) -> PlannedExport:
    source_mask_path = _source_mask_path(workspace_root, element)
    export_mask_path = f"{EXPORT_MASKS_DIR}/{element.id}.png" if source_mask_path else None
    return PlannedExport(
        element=element,
        source_asset_path=source_asset_path,
        export_asset_path=f"{EXPORT_ASSETS_DIR}/{element.id}.png",
        source_mask_path=source_mask_path,
        export_mask_path=export_mask_path,
        warnings=warnings,
    )


def _source_mask_path(workspace_root: Path, element: ElementRecord) -> str | None:
    if element.mask and _workspace_file_exists(workspace_root, element.mask):
        return element.mask

    fallback = f"elements/{element.id}/mask.png"
    return fallback if _workspace_file_exists(workspace_root, fallback) else None


def _incomplete_asset_path(element_id: str) -> str:
    return f"elements/{element_id}/asset_incomplete.png"


def _export_paths() -> dict[str, str]:
    return {
        "assetsDir": EXPORT_ASSETS_DIR,
        "masksDir": EXPORT_MASKS_DIR,
        "manifest": MANIFEST_PATH,
        "level": LEVEL_PATH,
        "contactSheet": CONTACT_SHEET_PATH,
        "qaReport": QA_REPORT_PATH,
    }


def _prepare_export_dir(workspace_root: Path) -> Path:
    export_dir = _resolve_workspace_path(workspace_root, EXPORT_RELATIVE_ROOT)
    if export_dir.exists():
        shutil.rmtree(export_dir)
    (workspace_root / EXPORT_ASSETS_DIR).mkdir(parents=True, exist_ok=True)
    (workspace_root / EXPORT_MASKS_DIR).mkdir(parents=True, exist_ok=True)
    return export_dir


def _copy_workspace_file(workspace_root: Path, source_relative: str, target_relative: str) -> None:
    source_path = _resolve_workspace_path(workspace_root, source_relative)
    target_path = _resolve_workspace_path(workspace_root, target_relative)
    if not source_path.exists():
        raise ValueError(f"Export source file is missing: {source_relative}")
    target_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_path, target_path)


def _workspace_file_exists(workspace_root: Path, relative_path: str) -> bool:
    return _resolve_workspace_path(workspace_root, relative_path).exists()


def _resolve_workspace_path(workspace_root: Path, relative_path: str) -> Path:
    workspace_path = Path(workspace_root).resolve()
    resolved = (workspace_path / relative_path).resolve()
    try:
        resolved.relative_to(workspace_path)
    except ValueError as exc:
        raise ValueError("Export paths must stay inside the workspace root.") from exc
    return resolved


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _write_contact_sheet(workspace_root: Path, exported_elements: list[dict[str, Any]]) -> None:
    contact_sheet_path = workspace_root / CONTACT_SHEET_PATH
    contact_sheet_path.parent.mkdir(parents=True, exist_ok=True)

    font = ImageFont.load_default()
    if not exported_elements:
        sheet = Image.new("RGB", (420, 180), (17, 21, 29))
        draw = ImageDraw.Draw(sheet)
        draw.text((24, 74), "No exported assets", fill=(230, 236, 243), font=font)
        sheet.save(contact_sheet_path, format="PNG")
        return

    cell_width = 180
    cell_height = 190
    columns = min(4, max(1, len(exported_elements)))
    rows = (len(exported_elements) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * cell_width, rows * cell_height), (17, 21, 29))
    draw = ImageDraw.Draw(sheet)

    for index, exported in enumerate(exported_elements):
        column = index % columns
        row = index // columns
        left = column * cell_width
        top = row * cell_height
        asset_path = _resolve_workspace_path(workspace_root, exported["assetPath"])
        with Image.open(asset_path) as asset:
            asset.load()
            preview = _fit_asset_on_checkerboard(asset.convert("RGBA"), (144, 128))
        sheet.paste(preview, (left + 18, top + 14))
        label = f"{exported['elementId']}  {exported['name']}"
        draw.text((left + 18, top + 154), label[:28], fill=(230, 236, 243), font=font)

    sheet.save(contact_sheet_path, format="PNG")


def _fit_asset_on_checkerboard(asset: Image.Image, size: tuple[int, int]) -> Image.Image:
    preview = Image.new("RGBA", size, (13, 17, 23, 255))
    draw = ImageDraw.Draw(preview)
    tile = 12
    for y in range(0, size[1], tile):
        for x in range(0, size[0], tile):
            fill = (41, 49, 66, 255) if (x // tile + y // tile) % 2 == 0 else (18, 23, 32, 255)
            draw.rectangle((x, y, x + tile - 1, y + tile - 1), fill=fill)

    fitted = asset.copy()
    fitted.thumbnail((size[0] - 16, size[1] - 16), Image.Resampling.LANCZOS)
    offset = ((size[0] - fitted.width) // 2, (size[1] - fitted.height) // 2)
    preview.alpha_composite(fitted, offset)
    return preview.convert("RGB")


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
