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

_MIN_BBOX_SIDE_RATIO = 0.45
_EDGE_CLIPPED_AREA_RATIO = 1.2
_EXTREME_AREA_MIN_RATIO = 0.35
_EXTREME_AREA_MAX_RATIO = 3.0
_WARNING_AREA_MIN_RATIO = 0.7
_WARNING_AREA_MAX_RATIO = 1.35
_WARNING_CENTER_SHIFT_RATIO = 0.18
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

    candidate_width = candidate_bbox[2] - candidate_bbox[0]
    candidate_height = candidate_bbox[3] - candidate_bbox[1]
    analysis_width = analysis.bbox[2] - analysis.bbox[0]
    analysis_height = analysis.bbox[3] - analysis.bbox[1]
    area_ratio = candidate_area / analysis.visible_area
    metrics["visibleAreaRatio"] = round(area_ratio, 4)

    if _is_small_edge_clipped(candidate_rgba.size, candidate_bbox, candidate_area, analysis.visible_area):
        errors.append("subject_clipped_at_output_edge")

    if (
        candidate_width < analysis_width * _MIN_BBOX_SIDE_RATIO
        or candidate_height < analysis_height * _MIN_BBOX_SIDE_RATIO
    ):
        errors.append("bbox_side_too_small")

    if area_ratio < _EXTREME_AREA_MIN_RATIO or area_ratio > _EXTREME_AREA_MAX_RATIO:
        errors.append("visible_area_extreme_outlier")
    elif area_ratio < _WARNING_AREA_MIN_RATIO or area_ratio > _WARNING_AREA_MAX_RATIO:
        warnings.append("visible_area_differs")

    residue_pixels = _count_visible_chroma_residue(candidate_rgba, analysis.bbox, chroma_key)
    metrics["visibleChromaResiduePixels"] = residue_pixels
    if residue_pixels >= max(8, int(candidate_area * _CHROMA_RESIDUE_RATIO)):
        errors.append("visible_chroma_residue")

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
    if (
        alpha_iou >= _COPY_ALPHA_IOU_THRESHOLD
        and visible_change_ratio < _COPY_VISIBLE_CHANGE_RATIO_THRESHOLD
        and mean_delta < _COPY_MEAN_RGBA_DELTA_THRESHOLD
    ):
        errors.append("near_copy_of_sam2_cutout")

    candidate_centroid = _mask_centroid(alpha)
    if candidate_centroid is not None and analysis.centroid is not None:
        center_shift = _distance(candidate_centroid, analysis.centroid)
        shift_ratio = center_shift / max(analysis_width, analysis_height, 1)
        metrics["candidateCentroidX"] = round(candidate_centroid[0], 4)
        metrics["candidateCentroidY"] = round(candidate_centroid[1], 4)
        metrics["analysisCentroidX"] = round(analysis.centroid[0], 4)
        metrics["analysisCentroidY"] = round(analysis.centroid[1], 4)
        metrics["centerShiftRatio"] = round(shift_ratio, 4)
        if shift_ratio >= _WARNING_CENTER_SHIFT_RATIO:
            warnings.append("bbox_center_shifted")

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
        "subject_clipped_at_output_edge": "Candidate appears clipped at the output edge.",
        "bbox_side_too_small": "Candidate subject is much smaller than the source mask.",
        "visible_area_extreme_outlier": "Candidate visible area is far outside the source mask range.",
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


def _is_small_edge_clipped(
    size: tuple[int, int],
    bbox: tuple[int, int, int, int],
    candidate_area: int,
    analysis_area: int,
) -> bool:
    width, height = size
    left, top, right, bottom = bbox
    touches_edge = left <= 0 or top <= 0 or right >= width or bottom >= height
    if not touches_edge:
        return False
    # WHY: 合理的大主体可能贴近画布边缘；只有“贴边且面积仍像小残片”的候选
    # 才按裁切失败处理，避免把正常扩展到整张 canvas 的结果误杀。
    return candidate_area <= analysis_area * _EDGE_CLIPPED_AREA_RATIO


def _count_visible_chroma_residue(
    image: Image.Image,
    subject_bbox: tuple[int, int, int, int],
    chroma_key: tuple[int, int, int],
) -> int:
    left, top, right, bottom = _inflate_bbox(subject_bbox, image.size, 0.1)
    count = 0
    for y in range(image.height):
        for x in range(image.width):
            if left <= x < right and top <= y < bottom:
                continue
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
    if image.size != reference_rgba.size:
        return 0.0
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
    if image.size != reference_rgba.size:
        return 1.0, 255.0
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


def _binary_alpha_mask(image: Image.Image) -> Image.Image:
    return image.getchannel("A").point(lambda value: 255 if value else 0)


def _mask_area(mask: Image.Image) -> int:
    return sum(mask.histogram()[1:])


def _mask_centroid(mask: Image.Image) -> tuple[float, float] | None:
    width, _height = mask.size
    total = 0
    sum_x = 0
    sum_y = 0
    for index, value in enumerate(mask.tobytes()):
        if value == 0:
            continue
        total += 1
        sum_x += index % width
        sum_y += index // width
    if total == 0:
        return None
    return (sum_x / total, sum_y / total)


def _distance(first: tuple[float, float], second: tuple[float, float]) -> float:
    return math.sqrt((first[0] - second[0]) ** 2 + (first[1] - second[1]) ** 2)


def _color_distance(left: tuple[int, int, int], right: tuple[int, int, int]) -> float:
    return math.sqrt(sum((left[index] - right[index]) ** 2 for index in range(3)))
