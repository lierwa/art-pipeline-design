from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

from PIL import Image
from pydantic import BaseModel

from art_pipeline.asset_outputs import element_output_dir
from art_pipeline.elements import ElementRecord, validate_element_id
from art_pipeline.extraction import crop_source_to_canvas
from art_pipeline.mask_refine import MaskShape, create_mask_from_shape, normalize_mask


class MissingMaskRequest(BaseModel):
    shape: MaskShape


REPAIR_RELATIVE_PATHS = {
    "sourceCropPath": "source_crop.png",
    "sceneContextPath": "scene_context.png",
    "incompleteAssetPath": "incomplete_asset.png",
    "preserveMaskPath": "preserve_mask.png",
    "missingMaskPath": "missing_mask.png",
    "guideOverlayPath": "guide_overlay.png",
    "repairPromptPath": "repair_prompt.md",
}

REPAIR_PACKAGE_FILES = tuple(REPAIR_RELATIVE_PATHS.values())


def missing_mask_relative_path(element_id: str) -> str:
    validate_element_id(element_id)
    return f"elements/{element_id}/missing_mask.png"


def repair_relative_path(element_id: str, filename: str) -> str:
    validate_element_id(element_id)
    return f"elements/{element_id}/repair/{filename}"


def repair_relative_paths(element_id: str) -> dict[str, str]:
    return {
        key: repair_relative_path(element_id, filename)
        for key, filename in REPAIR_RELATIVE_PATHS.items()
    }


def repair_output_dir(
    workspace_root: Path,
    element_id: str,
    create: bool = False,
) -> Path:
    element_dir = element_output_dir(workspace_root, element_id, create=create)
    repair_dir = (element_dir / "repair").resolve()
    try:
        repair_dir.relative_to(element_dir.resolve())
    except ValueError as exc:
        raise ValueError(
            f"Repair output path for {element_id!r} must stay inside the element output directory."
        ) from exc

    if create:
        repair_dir.mkdir(parents=True, exist_ok=True)
    return repair_dir


def write_missing_mask_from_shape(
    workspace_root: Path,
    element: ElementRecord,
    shape: MaskShape,
) -> str:
    if element.mode != "needs_completion":
        raise ValueError(f"Element {element.id} must be in needs_completion mode for repair.")

    incomplete_asset = load_incomplete_asset(workspace_root, element)
    validate_missing_mask_shape_bounds(element, shape)
    clear_repair_outputs(workspace_root, element.id)
    mask = create_mask_from_shape(element, shape)
    mask = normalize_mask(element.id, mask, incomplete_asset.size)

    output_dir = element_output_dir(workspace_root, element.id, create=True)
    mask.save(output_dir / "missing_mask.png", format="PNG")
    return missing_mask_relative_path(element.id)


def clear_repair_outputs(workspace_root: Path, element_id: str) -> None:
    validate_element_id(element_id)
    output_dir = element_output_dir(workspace_root, element_id)
    missing_mask_path = output_dir / "missing_mask.png"
    if missing_mask_path.exists():
        missing_mask_path.unlink()

    repair_dir = repair_output_dir(workspace_root, element_id)
    if repair_dir.exists():
        if repair_dir.is_dir():
            shutil.rmtree(repair_dir)
        else:
            repair_dir.unlink()


def validate_missing_mask_shape_bounds(element: ElementRecord, shape: MaskShape) -> None:
    if element.canvas is None:
        raise ValueError(f"Element {element.id} canvas is required for repair.")

    canvas = element.canvas
    if shape.type == "rectangle":
        if shape.bbox.w <= 0 or shape.bbox.h <= 0:
            raise ValueError("Missing mask rectangle width/height must be > 0.")
        x, y = _shape_point_to_canvas(element, shape.coordinateSpace, shape.bbox.x, shape.bbox.y)
        right = x + shape.bbox.w
        bottom = y + shape.bbox.h
        if x < 0 or y < 0 or right > canvas.w or bottom > canvas.h:
            raise ValueError(
                f"Missing mask rectangle for element {element.id} must stay inside the "
                f"{canvas.w} x {canvas.h} asset canvas."
            )
        return

    for point in shape.points:
        x, y = _shape_point_to_canvas(element, shape.coordinateSpace, point.x, point.y)
        if x < 0 or y < 0 or x >= canvas.w or y >= canvas.h:
            raise ValueError(
                f"Missing mask polygon for element {element.id} must stay inside the "
                f"{canvas.w} x {canvas.h} asset canvas."
            )


def repair_task_package_exists(workspace_root: Path, element: ElementRecord) -> bool:
    repair_dir = repair_output_dir(workspace_root, element.id)
    return all((repair_dir / filename).exists() for filename in REPAIR_PACKAGE_FILES)


def read_repair_metadata(workspace_root: Path, element: ElementRecord) -> dict[str, Any]:
    element_dir = element_output_dir(workspace_root, element.id)
    repair_dir = repair_output_dir(workspace_root, element.id)
    missing_mask_path = element_dir / "missing_mask.png"
    package_files = {
        "sourceCrop": repair_dir / "source_crop.png",
        "sceneContext": repair_dir / "scene_context.png",
        "incompleteAsset": repair_dir / "incomplete_asset.png",
        "preserveMask": repair_dir / "preserve_mask.png",
        "repairMissingMask": repair_dir / "missing_mask.png",
        "guideOverlay": repair_dir / "guide_overlay.png",
        "repairPrompt": repair_dir / "repair_prompt.md",
    }
    completed_asset_path = repair_dir / "completed_asset.png"
    repair_report_path = repair_dir / "repair_report.json"
    qa_report_path = repair_dir / "qa_report.json"
    changed_pixels_overlay_path = repair_dir / "changed_pixels_overlay.png"
    qa_report = _load_qa_report(qa_report_path)

    files = {
        "missingMask": missing_mask_path.exists(),
        "repairPackage": all(path.exists() for path in package_files.values()),
        "completedAsset": completed_asset_path.exists(),
        "repairReport": repair_report_path.exists(),
        "qaReport": qa_report_path.exists(),
        "changedPixelsOverlay": changed_pixels_overlay_path.exists(),
        **{key: path.exists() for key, path in package_files.items()},
    }
    paths = {
        "missingMaskPath": missing_mask_relative_path(element.id) if files["missingMask"] else None,
        "completedAssetPath": (
            repair_relative_path(element.id, "completed_asset.png")
            if files["completedAsset"]
            else None
        ),
        "repairReportPath": (
            repair_relative_path(element.id, "repair_report.json")
            if files["repairReport"]
            else None
        ),
        "qaReportPath": (
            repair_relative_path(element.id, "qa_report.json")
            if files["qaReport"]
            else None
        ),
        "changedPixelsOverlayPath": (
            repair_relative_path(element.id, "changed_pixels_overlay.png")
            if files["changedPixelsOverlay"]
            else None
        ),
    }

    return {
        "elementId": element.id,
        "files": files,
        "paths": paths,
        "qaReport": qa_report,
    }


def create_repair_task_package(
    workspace_root: Path,
    source_image: Image.Image,
    element: ElementRecord,
) -> dict[str, str]:
    if element.mode != "needs_completion":
        raise ValueError(f"Element {element.id} must be in needs_completion mode for repair.")

    incomplete_asset = load_incomplete_asset(workspace_root, element)
    missing_mask = load_missing_mask(workspace_root, element, incomplete_asset.size)
    preserve_mask = create_preserve_mask(incomplete_asset, missing_mask)
    source_crop = load_source_crop(workspace_root, source_image, element, incomplete_asset.size)
    scene_context = create_scene_context(source_image, element)
    guide_overlay = create_guide_overlay(incomplete_asset, missing_mask)

    output_dir = repair_output_dir(workspace_root, element.id, create=True)
    for stale_filename in (
        "completed_asset.png",
        "repair_report.json",
        "qa_report.json",
        "changed_pixels_overlay.png",
    ):
        stale_path = output_dir / stale_filename
        if stale_path.exists():
            stale_path.unlink()

    source_crop.save(output_dir / "source_crop.png", format="PNG")
    scene_context.save(output_dir / "scene_context.png", format="PNG")
    incomplete_asset.save(output_dir / "incomplete_asset.png", format="PNG")
    preserve_mask.save(output_dir / "preserve_mask.png", format="PNG")
    missing_mask.save(output_dir / "missing_mask.png", format="PNG")
    guide_overlay.save(output_dir / "guide_overlay.png", format="PNG")
    (output_dir / "repair_prompt.md").write_text(
        build_repair_prompt(element),
        encoding="utf-8",
    )

    return repair_relative_paths(element.id)


def _shape_point_to_canvas(
    element: ElementRecord,
    coordinate_space: str,
    x: int,
    y: int,
) -> tuple[int, int]:
    if element.canvas is None:
        raise ValueError(f"Element {element.id} canvas is required for repair.")

    if coordinate_space == "canvas":
        return x, y
    return x - element.canvas.x, y - element.canvas.y


def _load_qa_report(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    return payload if isinstance(payload, dict) else None


def load_incomplete_asset(workspace_root: Path, element: ElementRecord) -> Image.Image:
    asset_path = element_output_dir(workspace_root, element.id) / "asset_incomplete.png"
    if not asset_path.exists():
        raise ValueError(
            f"Element {element.id} must be extracted before creating a repair task."
        )
    try:
        with Image.open(asset_path) as asset:
            asset.load()
            return asset.convert("RGBA")
    except OSError as exc:
        raise ValueError(
            f"Incomplete asset for element {element.id} is not readable."
        ) from exc


def load_missing_mask(
    workspace_root: Path,
    element: ElementRecord,
    expected_size: tuple[int, int],
) -> Image.Image:
    mask_path = element_output_dir(workspace_root, element.id) / "missing_mask.png"
    if not mask_path.exists():
        raise ValueError(f"Element {element.id} needs a missing mask before repair.")
    try:
        with Image.open(mask_path) as mask:
            mask.load()
            return normalize_mask(element.id, mask, expected_size)
    except OSError as exc:
        raise ValueError(
            f"Missing mask for element {element.id} is not readable."
        ) from exc


def create_preserve_mask(incomplete_asset: Image.Image, missing_mask: Image.Image) -> Image.Image:
    alpha = incomplete_asset.convert("RGBA").getchannel("A")
    missing = missing_mask.convert("L").point(lambda value: 255 if value > 0 else 0)
    preserve = Image.new("L", incomplete_asset.size, 0)
    preserve.putdata(
        [
            255 if alpha_value > 0 and missing_value == 0 else 0
            for alpha_value, missing_value in zip(alpha.getdata(), missing.getdata())
        ]
    )
    return preserve


def load_source_crop(
    workspace_root: Path,
    source_image: Image.Image,
    element: ElementRecord,
    expected_size: tuple[int, int],
) -> Image.Image:
    crop_path = element_output_dir(workspace_root, element.id) / "source_crop.png"
    if crop_path.exists():
        try:
            with Image.open(crop_path) as crop:
                crop.load()
                source_crop = crop.convert("RGBA")
        except OSError as exc:
            raise ValueError(
                f"Source crop for element {element.id} is not readable."
            ) from exc
    else:
        source_crop = crop_source_to_canvas(source_image, element)

    if source_crop.size != expected_size:
        raise ValueError(
            f"Source crop for element {element.id} must match the incomplete asset size."
        )
    return source_crop


def create_scene_context(source_image: Image.Image, element: ElementRecord) -> Image.Image:
    if element.canvas is None:
        raise ValueError(f"Element {element.id} canvas is required for repair.")

    canvas = element.canvas
    pad_x = max(1, canvas.w // 4)
    pad_y = max(1, canvas.h // 4)
    left = max(0, canvas.x - pad_x)
    top = max(0, canvas.y - pad_y)
    right = min(source_image.width, canvas.x + canvas.w + pad_x)
    bottom = min(source_image.height, canvas.y + canvas.h + pad_y)
    return source_image.crop((left, top, right, bottom)).convert("RGBA")


def create_guide_overlay(incomplete_asset: Image.Image, missing_mask: Image.Image) -> Image.Image:
    base = incomplete_asset.convert("RGBA")
    overlay = Image.new("RGBA", base.size, (255, 72, 72, 0))
    overlay.putalpha(missing_mask.convert("L").point(lambda value: 150 if value > 0 else 0))
    return Image.alpha_composite(base, overlay)


def build_repair_prompt(element: ElementRecord) -> str:
    return "\n".join(
        [
            f"# Codex Repair Task: {element.name}",
            "",
            "Use the files in this folder to complete only the missing/residual pixels.",
            "",
            "Constraints:",
            "- Preserve every pixel inside preserve_mask.png.",
            "- Modify only pixels inside missing_mask.png.",
            "- Do not redraw the whole object.",
            "- Output completed_asset.png with the same size as incomplete_asset.png.",
            "- Write repair_report.json.",
            "",
            "Required output files:",
            "- completed_asset.png",
            "- repair_report.json",
            "",
        ]
    )
