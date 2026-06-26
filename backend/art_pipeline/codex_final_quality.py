from __future__ import annotations

from dataclasses import dataclass
import json
import math
from pathlib import Path
from typing import Literal

from PIL import Image, ImageChops, ImageStat

from art_pipeline.codex_final_analysis_mask import build_codex_final_analysis_mask


CodexFinalQualityStatus = Literal["passed", "failed"]
CodexFinalQualityMetric = int | float | str | bool

_COPY_VISIBLE_CHANGE_RATIO_THRESHOLD = 0.12
_COPY_MEAN_RGBA_DELTA_THRESHOLD = 6.0
_COPY_ALPHA_IOU_THRESHOLD = 0.98
_CHROMA_RESIDUE_DISTANCE = 70.0
_CHROMA_RESIDUE_ALPHA = 24
_CHROMA_RESIDUE_RATIO = 0.06
_BACKGROUND_ALPHA_POLLUTION_ALPHA = 24
_BACKGROUND_ALPHA_POLLUTION_RATIO = 0.05


@dataclass(frozen=True)
class CodexFinalQualityReport:
    status: CodexFinalQualityStatus
    errors: tuple[str, ...]
    warnings: tuple[str, ...]
    metrics: dict[str, CodexFinalQualityMetric]
    repair_note: str | None

    @property
    def has_blocking_errors(self) -> bool:
        return bool(self.errors)

    @property
    def summary(self) -> str:
        if self.errors:
            return ", ".join(self.errors)
        if self.warnings:
            return ", ".join(self.warnings)
        return "passed"


def assess_codex_final_candidate(
    candidate_file: Path,
    reference_file: Path,
    analysis_mask_file: Path,
    chroma_key: tuple[int, int, int],
    *,
    block_near_copy: bool = True,
) -> CodexFinalQualityReport:
    with Image.open(candidate_file) as candidate:
        candidate.load()
        candidate_rgba = candidate.convert("RGBA")
    with Image.open(reference_file) as reference:
        reference.load()
        reference_rgba = reference.convert("RGBA")
    with Image.open(analysis_mask_file) as analysis_mask:
        analysis_mask.load()
        analysis = build_codex_final_analysis_mask(analysis_mask)

    errors: list[str] = []
    warnings: list[str] = []
    metrics: dict[str, CodexFinalQualityMetric] = {
        "candidateWidth": candidate_rgba.width,
        "candidateHeight": candidate_rgba.height,
        "analysisVisibleArea": analysis.visible_area,
        "hasAnalysisMask": analysis.visible_area > 0,
    }

    alpha = _binary_alpha_mask(candidate_rgba)
    candidate_bbox = alpha.getbbox()
    candidate_area = _mask_area(alpha)
    metrics["candidateVisibleArea"] = candidate_area
    metrics["hasCandidateAlpha"] = candidate_bbox is not None

    if candidate_bbox is None:
        errors.append("empty_alpha")
        return _report(errors, warnings, metrics)

    _record_bbox_metrics(metrics, "candidate", candidate_bbox)
    if analysis.bbox is not None:
        _record_bbox_metrics(metrics, "analysis", analysis.bbox)

    if analysis.visible_area <= 0 or analysis.bbox is None:
        errors.append("analysis_mask_empty")
        return _report(errors, warnings, metrics)

    area_ratio = candidate_area / analysis.visible_area
    metrics["visibleAreaRatio"] = round(area_ratio, 4)

    residue_pixels = _count_visible_chroma_residue(candidate_rgba, chroma_key)
    metrics["visibleChromaResiduePixels"] = residue_pixels
    if residue_pixels >= max(8, int(candidate_area * _CHROMA_RESIDUE_RATIO)):
        errors.append("visible_chroma_residue")

    pollution_pixels = 0
    if candidate_rgba.size == analysis.image.size:
        pollution_pixels = _count_background_alpha_pollution(candidate_rgba, analysis.image, analysis.bbox)
    metrics["backgroundAlphaPollutionPixels"] = pollution_pixels
    metrics["backgroundAlphaPollutionRatio"] = round(pollution_pixels / candidate_area, 4)
    # WHY: chroma 色距只能抓绿色/洋红等背景残留；真实失败里也可能留下
    # 灰色/黑色不透明背景块。这里只拦截远离 cleaned subject 的独立 alpha
    # 组件，保守放过贴着主体的边缘扩展，避免误杀合理补全轮廓。
    if pollution_pixels >= max(8, int(candidate_area * _BACKGROUND_ALPHA_POLLUTION_RATIO)):
        errors.append("background_alpha_pollution")

    alpha_iou = _alpha_iou(candidate_rgba, reference_rgba)
    visible_change_ratio, mean_delta = _visible_pixel_difference(candidate_rgba, reference_rgba)
    metrics["alphaIou"] = round(alpha_iou, 4)
    metrics["visibleChangeRatio"] = round(visible_change_ratio, 4)
    metrics["meanRgbaDelta"] = round(mean_delta, 4)
    # WHY: 近似 SAM2 cutout 是候选质量问题，不属于透明化步骤；集中在
    # report 内可以让失败原因、repair note 和 task artifact 保持同一事实源。
    if block_near_copy and (
        alpha_iou >= _COPY_ALPHA_IOU_THRESHOLD
        and visible_change_ratio < _COPY_VISIBLE_CHANGE_RATIO_THRESHOLD
        and mean_delta < _COPY_MEAN_RGBA_DELTA_THRESHOLD
    ):
        errors.append("near_copy_of_sam2_cutout")

    return _report(errors, warnings, metrics)


def write_codex_final_quality_report(path: Path, report: CodexFinalQualityReport) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "status": report.status,
        "errors": list(report.errors),
        "warnings": list(report.warnings),
        "metrics": report.metrics,
        "repairNote": report.repair_note,
    }
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _report(
    errors: list[str],
    warnings: list[str],
    metrics: dict[str, CodexFinalQualityMetric],
) -> CodexFinalQualityReport:
    return CodexFinalQualityReport(
        status="failed" if errors else "passed",
        errors=tuple(dict.fromkeys(errors)),
        warnings=tuple(dict.fromkeys(warnings)),
        metrics=metrics,
        repair_note=_repair_note(errors),
    )


def _repair_note(errors: list[str]) -> str | None:
    if not errors:
        return None
    notes = {
        "empty_alpha": "Candidate has no visible subject.",
        "analysis_mask_empty": "Cleaned analysis mask has no visible subject.",
        "visible_chroma_residue": "Candidate still has visible chroma background residue.",
        "background_alpha_pollution": "Candidate has visible background pixels outside the subject.",
        "near_copy_of_sam2_cutout": "Candidate is too similar to the rough SAM2 cutout.",
    }
    return notes.get(errors[0], "Candidate failed the final quality gate.")


def _record_bbox_metrics(
    metrics: dict[str, CodexFinalQualityMetric],
    prefix: str,
    bbox: tuple[int, int, int, int],
) -> None:
    left, top, right, bottom = bbox
    metrics[f"{prefix}BboxLeft"] = left
    metrics[f"{prefix}BboxTop"] = top
    metrics[f"{prefix}BboxRight"] = right
    metrics[f"{prefix}BboxBottom"] = bottom
    metrics[f"{prefix}BboxWidth"] = right - left
    metrics[f"{prefix}BboxHeight"] = bottom - top


def _count_visible_chroma_residue(
    image: Image.Image,
    chroma_key: tuple[int, int, int],
) -> int:
    count = 0
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, alpha = image.getpixel((x, y))
            if alpha > _CHROMA_RESIDUE_ALPHA and _color_distance((red, green, blue), chroma_key) <= _CHROMA_RESIDUE_DISTANCE:
                count += 1
    return count


def _count_background_alpha_pollution(
    image: Image.Image,
    subject_mask: Image.Image,
    subject_bbox: tuple[int, int, int, int],
) -> int:
    allowed_bbox = _inflate_bbox(subject_bbox, image.size, 0.1)
    subject_colors = _sample_subject_mask_colors(image, subject_mask)
    visited = bytearray(image.width * image.height)
    pollution = 0
    for y in range(image.height):
        for x in range(image.width):
            index = y * image.width + x
            if visited[index]:
                continue
            _red, _green, _blue, alpha = image.getpixel((x, y))
            if alpha <= _BACKGROUND_ALPHA_POLLUTION_ALPHA:
                visited[index] = 1
                continue
            pollution += _walk_alpha_component(
                image,
                x,
                y,
                visited,
                allowed_bbox,
                subject_colors,
            )
    return pollution


def _walk_alpha_component(
    image: Image.Image,
    start_x: int,
    start_y: int,
    visited: bytearray,
    allowed_bbox: tuple[int, int, int, int],
    subject_colors: tuple[tuple[int, int, int], ...],
) -> int:
    stack = [(start_x, start_y)]
    pollution_area = 0
    left, top, right, bottom = allowed_bbox

    while stack:
        x, y = stack.pop()
        if x < 0 or y < 0 or x >= image.width or y >= image.height:
            continue
        index = y * image.width + x
        if visited[index]:
            continue
        visited[index] = 1
        _red, _green, _blue, alpha = image.getpixel((x, y))
        if alpha <= _BACKGROUND_ALPHA_POLLUTION_ALPHA:
            continue

        inside_allowed = left <= x < right and top <= y < bottom
        # WHY: 背景块可能和主体 alpha 连在一起，不能因为 component 碰到主体
        # 就整块豁免；但主体自然外扩、抗锯齿边缘通常颜色接近主体，先放过
        # 这类小范围同色扩展，避免第一版 gate 误杀合理补全轮廓。
        if not inside_allowed and _is_background_like_pixel((_red, _green, _blue), subject_colors):
            pollution_area += 1
        for neighbor_y in (y - 1, y, y + 1):
            for neighbor_x in (x - 1, x, x + 1):
                if neighbor_x == x and neighbor_y == y:
                    continue
                stack.append((neighbor_x, neighbor_y))

    return pollution_area


def _sample_subject_mask_colors(
    image: Image.Image,
    subject_mask: Image.Image,
) -> tuple[tuple[int, int, int], ...]:
    mask = subject_mask.convert("L")
    colors: list[tuple[int, int, int]] = []
    for y in range(min(image.height, mask.height)):
        for x in range(min(image.width, mask.width)):
            if mask.getpixel((x, y)) == 0:
                continue
            red, green, blue, alpha = image.getpixel((x, y))
            if alpha > _BACKGROUND_ALPHA_POLLUTION_ALPHA:
                colors.append((red, green, blue))
    if not colors:
        return ()
    stride = max(len(colors) // 200, 1)
    return tuple(colors[::stride])


def _is_background_like_pixel(
    pixel: tuple[int, int, int],
    subject_colors: tuple[tuple[int, int, int], ...],
) -> bool:
    if not subject_colors:
        return True
    return min(_color_distance(pixel, color) for color in subject_colors) > 50.0


def _inflate_bbox(
    bbox: tuple[int, int, int, int],
    size: tuple[int, int],
    ratio: float,
) -> tuple[int, int, int, int]:
    left, top, right, bottom = bbox
    width, height = size
    pad_x = max(1, round((right - left) * ratio))
    pad_y = max(1, round((bottom - top) * ratio))
    return (
        max(0, left - pad_x),
        max(0, top - pad_y),
        min(width, right + pad_x),
        min(height, bottom + pad_y),
    )


def _alpha_iou(image: Image.Image, reference_rgba: Image.Image) -> float:
    aligned = _aligned_alpha_pair(image, reference_rgba)
    if aligned is None:
        return 0.0
    image, reference_rgba = aligned
    image_mask = _binary_alpha_mask(image)
    reference_mask = _binary_alpha_mask(reference_rgba)
    intersection = ImageChops.multiply(image_mask, reference_mask)
    union = ImageChops.lighter(image_mask, reference_mask)
    intersection_area = _mask_area(intersection)
    union_area = _mask_area(union)
    if union_area == 0:
        return 0.0
    return intersection_area / union_area


def _visible_pixel_difference(image: Image.Image, reference_rgba: Image.Image) -> tuple[float, float]:
    aligned = _aligned_alpha_pair(image, reference_rgba)
    if aligned is None:
        return 1.0, 255.0
    image, reference_rgba = aligned
    visible_mask = ImageChops.lighter(
        _binary_alpha_mask(image),
        _binary_alpha_mask(reference_rgba),
    )
    visible_area = _mask_area(visible_mask)
    if visible_area == 0:
        return 0.0, 0.0

    diff = ImageChops.difference(image, reference_rgba)
    changed_mask = diff.convert("L").point(lambda value: 255 if value else 0)
    changed_visible_mask = ImageChops.multiply(changed_mask, visible_mask)
    changed_ratio = _mask_area(changed_visible_mask) / visible_area
    channel_mean = ImageStat.Stat(diff, visible_mask).mean
    mean_delta = sum(channel_mean) / len(channel_mean)
    return changed_ratio, mean_delta


def _aligned_alpha_pair(image: Image.Image, reference_rgba: Image.Image) -> tuple[Image.Image, Image.Image] | None:
    if image.size == reference_rgba.size:
        return image, reference_rgba
    image_bbox = image.getchannel("A").getbbox()
    reference_bbox = reference_rgba.getchannel("A").getbbox()
    if image_bbox is None or reference_bbox is None:
        return None
    image_crop = image.crop(image_bbox)
    reference_crop = reference_rgba.crop(reference_bbox)
    if image_crop.size != reference_crop.size:
        return None
    # WHY: final 现在会裁到有效边距，不能再用原 canvas 尺寸判断近似复制；
    # 这里只在裁后尺寸一致时比较主体像素，避免误把构图差异当自动修图依据。
    return image_crop, reference_crop


def _binary_alpha_mask(image: Image.Image) -> Image.Image:
    return image.getchannel("A").point(lambda value: 255 if value else 0)


def _mask_area(mask: Image.Image) -> int:
    return sum(mask.histogram()[1:])


def _color_distance(left: tuple[int, int, int], right: tuple[int, int, int]) -> float:
    return math.sqrt(sum((left[index] - right[index]) ** 2 for index in range(3)))
