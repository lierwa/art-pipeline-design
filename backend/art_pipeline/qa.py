from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Literal

from PIL import Image

from art_pipeline.elements import ElementRecord
from art_pipeline.repair_tasks import repair_output_dir, repair_relative_path


QaStatus = Literal["pass", "warn", "fail"]


def validate_repair_output(workspace_root: Path, element: ElementRecord) -> dict[str, Any]:
    repair_dir = repair_output_dir(workspace_root, element.id, create=True)
    reasons: list[str] = []
    warnings: list[str] = []
    metrics = _empty_metrics()
    changed_overlay_path: str | None = None

    report_path = repair_dir / "repair_report.json"
    if not report_path.exists():
        reasons.append("repair_report_missing")
    else:
        try:
            json.loads(report_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            reasons.append("repair_report_invalid_json")

    incomplete_asset = _load_png(repair_dir / "incomplete_asset.png", "incomplete_asset", reasons)
    completed_asset = _load_png(repair_dir / "completed_asset.png", "completed_asset", reasons)
    missing_mask = _load_png(repair_dir / "missing_mask.png", "missing_mask", reasons)
    preserve_mask = _load_png(repair_dir / "preserve_mask.png", "preserve_mask", reasons)

    if completed_asset is not None and "A" not in completed_asset.getbands():
        reasons.append("completed_asset_missing_alpha")

    if (
        incomplete_asset is not None
        and completed_asset is not None
        and missing_mask is not None
        and preserve_mask is not None
    ):
        incomplete = incomplete_asset.convert("RGBA")
        completed = completed_asset.convert("RGBA")
        missing = _binarize_mask(missing_mask)
        preserve = _binarize_mask(preserve_mask)
        expected_size = incomplete.size

        if completed.size != expected_size:
            reasons.append("completed_asset_wrong_dimensions")
        if missing.size != expected_size:
            reasons.append("missing_mask_wrong_dimensions")
        if preserve.size != expected_size:
            reasons.append("preserve_mask_wrong_dimensions")

        if completed.size == expected_size and missing.size == expected_size and preserve.size == expected_size:
            metrics, changed_overlay_path = _compare_pixels(
                element.id,
                repair_dir,
                incomplete,
                completed,
                missing,
                preserve,
            )
            if metrics["preserveChangedPixels"] > 0:
                reasons.append("preserve_pixels_changed")
            if metrics["outsideMissingChangedPixels"] > 0:
                reasons.append("pixels_changed_outside_missing_mask")
            if metrics["missingAreaRatio"] > 0.5:
                warnings.append("missing_area_ratio_high")

    status: QaStatus
    if reasons:
        status = "fail"
    elif warnings:
        status = "warn"
    else:
        status = "pass"

    qa_report: dict[str, Any] = {
        "elementId": element.id,
        "status": status,
        "reasons": reasons,
        "warnings": warnings,
        "metrics": metrics,
        "reportPath": repair_relative_path(element.id, "qa_report.json"),
        "changedPixelsOverlayPath": changed_overlay_path,
    }
    (repair_dir / "qa_report.json").write_text(
        json.dumps(qa_report, indent=2),
        encoding="utf-8",
    )
    return qa_report


def _load_png(path: Path, label: str, reasons: list[str]) -> Image.Image | None:
    if not path.exists():
        reasons.append(f"{label}_missing")
        return None

    try:
        with Image.open(path) as image:
            image.load()
            image_format = image.format
            loaded = image.copy()
    except OSError:
        reasons.append(f"{label}_unreadable")
        return None

    if image_format != "PNG":
        reasons.append(f"{label}_not_png")
    return loaded


def _binarize_mask(mask: Image.Image) -> Image.Image:
    return mask.convert("L").point(lambda value: 255 if value > 0 else 0)


def _empty_metrics() -> dict[str, int | float]:
    return {
        "totalPixels": 0,
        "missingMaskPixels": 0,
        "changedPixels": 0,
        "insideMissingChangedPixels": 0,
        "outsideMissingChangedPixels": 0,
        "preserveChangedPixels": 0,
        "missingAreaRatio": 0.0,
        "changedAreaRatio": 0.0,
    }


def _compare_pixels(
    element_id: str,
    repair_dir: Path,
    incomplete: Image.Image,
    completed: Image.Image,
    missing: Image.Image,
    preserve: Image.Image,
) -> tuple[dict[str, int | float], str]:
    total_pixels = incomplete.width * incomplete.height
    missing_pixels = 0
    changed_pixels = 0
    inside_missing_changed = 0
    outside_missing_changed = 0
    preserve_changed = 0
    overlay_pixels: list[tuple[int, int, int, int]] = []

    for before, after, missing_value, preserve_value in zip(
        incomplete.getdata(),
        completed.getdata(),
        missing.getdata(),
        preserve.getdata(),
    ):
        is_missing = missing_value > 0
        is_changed = before != after
        if is_missing:
            missing_pixels += 1
        if is_changed:
            changed_pixels += 1
            if is_missing:
                inside_missing_changed += 1
                overlay_pixels.append((83, 220, 154, 190))
            else:
                outside_missing_changed += 1
                overlay_pixels.append((255, 72, 72, 220))
        else:
            overlay_pixels.append((0, 0, 0, 0))
        if preserve_value > 0 and is_changed:
            preserve_changed += 1

    overlay = Image.new("RGBA", incomplete.size, (0, 0, 0, 0))
    overlay.putdata(overlay_pixels)
    overlay.save(repair_dir / "changed_pixels_overlay.png", format="PNG")

    metrics = {
        "totalPixels": total_pixels,
        "missingMaskPixels": missing_pixels,
        "changedPixels": changed_pixels,
        "insideMissingChangedPixels": inside_missing_changed,
        "outsideMissingChangedPixels": outside_missing_changed,
        "preserveChangedPixels": preserve_changed,
        "missingAreaRatio": missing_pixels / total_pixels if total_pixels else 0.0,
        "changedAreaRatio": changed_pixels / total_pixels if total_pixels else 0.0,
    }
    return metrics, repair_relative_path(element_id, "changed_pixels_overlay.png")
