from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from PIL import Image

from art_pipeline.elements import ElementRecord
from art_pipeline.mask_refine import normalize_mask
from art_pipeline.segment_bbox_growth import (
    bbox_growth_for_prompt,
    excessive_lateral_growth_limit,
    lateral_growth_warn_limit,
)
from art_pipeline.segment_components import (
    foreground_component_areas,
    foreground_components,
    neighbor_indexes,
    tiny_detached_component_area_limit,
)
from art_pipeline.segment_mask_repair import fill_enclosed_mask_holes


SEGMENTATION_QUALITY_MISSING_REASON = "segmentation_quality_missing"
SEGMENTATION_QUALITY_FAILED_REASON = "segmentation_quality_failed"
SIDE_EXTREMITY_LABELS = {"cat", "dog", "pet", "animal"}


@dataclass(frozen=True)
class MaskDetachedCleanup:
    mask: Image.Image
    removed_detached_count: int
    removed_detached_area: int


@dataclass(frozen=True)
class Sam2MaskCandidate:
    prompt: dict[str, Any]
    mask: Image.Image
    foreground_area: int
    detached_area: int
    filled_hole_count: int
    filled_hole_area: int
    removed_detached_count: int
    removed_detached_area: int
    supported_detached_area: int
    unsupported_detached_area: int
    bbox_outside_area: int
    bbox_lateral_growth_area: int
    bbox_top_growth_area: int
    bbox_bottom_growth_area: int
    support_point_count: int
    missed_support_point_count: int


def build_sam2_prompt_candidates(element: ElementRecord, stage: str) -> list[dict[str, Any]]:
    prompts = [
        build_sam2_prompt(element, stage, "base"),
        build_sam2_prompt(element, stage, "bottom_support"),
        build_sam2_prompt(element, stage, "visible_extremity_support"),
    ]
    if _needs_side_extremity_support(element):
        prompts.extend(
            [
                build_sam2_prompt(element, stage, "right_extremity_support"),
                build_sam2_prompt(element, stage, "left_extremity_support"),
            ]
        )
    return prompts


def segmentation_quality_block_reason(element: ElementRecord) -> str | None:
    if element.segmentationQuality is None:
        return SEGMENTATION_QUALITY_MISSING_REASON
    if element.segmentationQuality.qualityStatus == "fail":
        return SEGMENTATION_QUALITY_FAILED_REASON
    return None


def segmentation_quality_status(quality: dict[str, Any]) -> tuple[str, list[str]]:
    foreground_area = int(quality.get("foregroundArea", 0))
    candidate_count = int(quality.get("candidateCount", 0))
    detached_area = int(quality.get("detachedArea", 0))
    unsupported_detached_area = int(quality.get("unsupportedDetachedArea", detached_area))
    filled_hole_area = int(quality.get("filledHoleArea", 0))
    removed_detached_area = int(quality.get("removedDetachedArea", 0))
    missed_support_point_count = int(quality.get("missedSupportPointCount", 0))
    bbox_lateral_growth_area = int(quality.get("bboxLateralGrowthArea", 0))

    fail_reasons: list[str] = []
    if foreground_area <= 0:
        fail_reasons.append("empty_foreground")
    if candidate_count <= 0:
        fail_reasons.append("no_candidates")
    if missed_support_point_count > 0:
        fail_reasons.append("missed_positive_support_points")
    if bbox_lateral_growth_area >= excessive_lateral_growth_limit(foreground_area):
        fail_reasons.append("bbox_lateral_overgrowth")
    if fail_reasons:
        return "fail", fail_reasons

    warn_reasons: list[str] = []
    if bbox_lateral_growth_area >= lateral_growth_warn_limit(foreground_area):
        warn_reasons.append("bbox_lateral_growth_present")
    if unsupported_detached_area > 0:
        warn_reasons.append("detached_components_present")
    if filled_hole_area >= max(128, int(foreground_area * 0.01)):
        warn_reasons.append("large_internal_hole_repair")
    if removed_detached_area >= max(24, int(foreground_area * 0.001)):
        warn_reasons.append("many_fragments_removed")

    # WHY: warn 只把验收注意力引到“可能需要看一眼”的 mask；真正阻断只给空前景等
    # 明确无效输出，避免把猫尾、窗帘挂钩这类真实分离部件误判为失败。
    if warn_reasons:
        return "warn", warn_reasons
    return "pass", []


def build_sam2_prompt(
    element: ElementRecord,
    stage: str,
    support_profile: str = "base",
) -> dict[str, Any]:
    return {
        "version": 1,
        "stage": stage,
        "elementId": element.id,
        "label": element.label or element.name,
        "bbox": element.bbox.model_dump(mode="json"),
        "points": positive_support_points(
            element,
            include_bottom_support=support_profile in {"bottom_support", "visible_extremity_support"},
            include_visible_extremity=support_profile == "visible_extremity_support",
            include_right_extremity=support_profile == "right_extremity_support",
            include_left_extremity=support_profile == "left_extremity_support",
        ),
        "supportProfile": support_profile,
        "canvas": element.canvas.model_dump(mode="json") if element.canvas else None,
        "assetRole": element.assetRole,
    }


def positive_support_points(
    element: ElementRecord,
    include_bottom_support: bool = False,
    include_visible_extremity: bool = False,
    include_right_extremity: bool = False,
    include_left_extremity: bool = False,
) -> list[dict[str, Any]]:
    bbox = element.bbox
    # WHY: 仅 bbox 容易漏掉水面、脚、底座等和主体材质差异大的区域；少量正向点能提高
    # SAM2 对“同一物体内部多材质”的召回，点数保持克制，避免把紧邻背景也提示成前景。
    ratios = [
        (0.5, 0.5, True),
        (0.5, 0.25, True),
        (0.5, 0.75, True),
        (0.25, 0.5, True),
        (0.75, 0.5, True),
    ]
    if include_bottom_support:
        ratios.extend([(0.12, 0.72, True), (0.58, 0.92, True), (0.62, 0.94, True)])
    if include_visible_extremity:
        # WHY: Grounding bbox 常贴着主体外壳，浴缸脚/凳脚会落在 bbox 下沿外一点；
        # 只给 extremity profile 小幅越界点，并在 provider 夹到图片内，兼顾召回与稳定性。
        ratios.append((0.64, 1.0, False))
    if include_right_extremity:
        ratios.extend([(0.93, 0.78, True), (0.95, 0.88, True)])
    if include_left_extremity:
        ratios.extend([(0.07, 0.78, True), (0.05, 0.88, True)])

    points: list[dict[str, Any]] = []
    seen: set[tuple[int, int]] = set()
    for x_ratio, y_ratio, clamp_to_bbox in ratios:
        raw_x = int(bbox.x + bbox.w * x_ratio)
        raw_y = int(bbox.y + bbox.h * y_ratio)
        if clamp_to_bbox:
            x = bbox.x + min(bbox.w - 1, max(0, int(bbox.w * x_ratio)))
            y = bbox.y + min(bbox.h - 1, max(0, int(bbox.h * y_ratio)))
        else:
            x = max(0, raw_x)
            y = max(0, raw_y)
        if (x, y) in seen:
            continue
        seen.add((x, y))
        points.append({"x": x, "y": y, "label": "positive"})

    return points


def _needs_side_extremity_support(element: ElementRecord) -> bool:
    label = (element.label or element.name or "").strip().lower()
    # WHY: 侧向末端点是为猫尾这类真实细长外轮廓服务；对镜子、瓶子等硬物启用会把
    # 邻近杂物当“被支持的分离部件”保留下来，所以按语义类收窄，而不是全局加提示点。
    return label in SIDE_EXTREMITY_LABELS


def repair_and_score_sam2_candidate(
    element_id: str,
    prompt: dict[str, Any],
    mask: Image.Image,
) -> Sam2MaskCandidate:
    repair = fill_enclosed_mask_holes(element_id, mask)
    cleanup = remove_tiny_detached_components(element_id, repair.mask)
    components = foreground_components(cleanup.mask)
    component_areas = [len(component) for component in components]
    (
        support_point_count,
        missed_support_point_count,
        supported_detached_area,
        unsupported_detached_area,
    ) = _support_point_component_coverage(
        prompt,
        cleanup.mask,
        components,
    )
    bbox_growth = bbox_growth_for_prompt(prompt, cleanup.mask)
    return Sam2MaskCandidate(
        prompt=prompt,
        mask=cleanup.mask,
        foreground_area=sum(component_areas),
        detached_area=sum(component_areas[1:]),
        filled_hole_count=repair.filled_hole_count,
        filled_hole_area=repair.filled_hole_area,
        removed_detached_count=cleanup.removed_detached_count,
        removed_detached_area=cleanup.removed_detached_area,
        supported_detached_area=supported_detached_area,
        unsupported_detached_area=unsupported_detached_area,
        bbox_outside_area=bbox_growth.outside_area,
        bbox_lateral_growth_area=bbox_growth.lateral_area,
        bbox_top_growth_area=bbox_growth.top_area,
        bbox_bottom_growth_area=bbox_growth.bottom_area,
        support_point_count=support_point_count,
        missed_support_point_count=missed_support_point_count,
    )


def quality_metadata_for_mask(
    mask: Image.Image,
    selected_profile: str,
    candidate_count: int,
    filled_hole_count: int = 0,
    filled_hole_area: int = 0,
) -> dict[str, Any]:
    component_areas = foreground_component_areas(mask)
    detached_area = sum(component_areas[1:])
    metadata = {
        "selectedProfile": selected_profile,
        "candidateCount": candidate_count,
        "foregroundArea": sum(component_areas),
        "detachedArea": detached_area,
        "supportedDetachedArea": 0,
        "unsupportedDetachedArea": detached_area,
        "bboxOutsideArea": 0,
        "bboxLateralGrowthArea": 0,
        "bboxTopGrowthArea": 0,
        "bboxBottomGrowthArea": 0,
        "filledHoleCount": filled_hole_count,
        "filledHoleArea": filled_hole_area,
        "removedDetachedCount": 0,
        "removedDetachedArea": 0,
        "supportPointCount": 0,
        "missedSupportPointCount": 0,
    }
    return _with_quality_status(metadata)


def quality_metadata_for_candidate(
    candidate: Sam2MaskCandidate,
    candidate_count: int,
) -> dict[str, Any]:
    metadata = {
        "selectedProfile": str(candidate.prompt.get("supportProfile", "unknown")),
        "candidateCount": candidate_count,
        "foregroundArea": candidate.foreground_area,
        "detachedArea": candidate.detached_area,
        "supportedDetachedArea": candidate.supported_detached_area,
        "unsupportedDetachedArea": candidate.unsupported_detached_area,
        "bboxOutsideArea": candidate.bbox_outside_area,
        "bboxLateralGrowthArea": candidate.bbox_lateral_growth_area,
        "bboxTopGrowthArea": candidate.bbox_top_growth_area,
        "bboxBottomGrowthArea": candidate.bbox_bottom_growth_area,
        "filledHoleCount": candidate.filled_hole_count,
        "filledHoleArea": candidate.filled_hole_area,
        "removedDetachedCount": candidate.removed_detached_count,
        "removedDetachedArea": candidate.removed_detached_area,
        "supportPointCount": candidate.support_point_count,
        "missedSupportPointCount": candidate.missed_support_point_count,
    }
    return _with_quality_status(metadata)


def select_best_sam2_candidate(candidates: list[Sam2MaskCandidate]) -> Sam2MaskCandidate:
    selected = candidates[0]
    for candidate in candidates[1:]:
        if _candidate_adds_fragment_noise(selected, candidate):
            continue
        if _candidate_adds_implausible_growth(selected, candidate):
            continue
        if candidate.missed_support_point_count < selected.missed_support_point_count:
            selected = candidate
            continue
        if candidate.missed_support_point_count > selected.missed_support_point_count:
            continue
        if candidate.supported_detached_area > selected.supported_detached_area:
            selected = candidate
            continue
        growth = candidate.foreground_area - selected.foreground_area
        if growth >= max(2, int(selected.foreground_area * 0.003)):
            selected = candidate
    return selected


def support_point_hit_counts(
    prompt: dict[str, Any],
    mask: Image.Image,
    radius: int = 2,
) -> tuple[int, int]:
    total, missed, _, _ = _support_point_component_coverage(
        prompt,
        mask,
        foreground_components(mask),
        radius,
    )
    return total, missed


def _with_quality_status(metadata: dict[str, Any]) -> dict[str, Any]:
    status, reasons = segmentation_quality_status(metadata)
    return {
        **metadata,
        "qualityStatus": status,
        "qualityReasons": reasons,
    }


def remove_tiny_detached_components(element_id: str, mask: Image.Image) -> MaskDetachedCleanup:
    binary = normalize_mask(element_id, mask, mask.size)
    components = foreground_components(binary)
    if len(components) <= 1:
        return MaskDetachedCleanup(binary, 0, 0)

    main_area = len(components[0])
    tiny_area_limit = tiny_detached_component_area_limit(main_area)
    pixels = bytearray(binary.tobytes())
    removed_count = 0
    removed_area = 0

    for component in components[1:]:
        if len(component) > tiny_area_limit:
            continue
        removed_count += 1
        removed_area += len(component)
        for index in component:
            pixels[index] = 0

    if removed_area == 0:
        return MaskDetachedCleanup(binary, 0, 0)

    # WHY: SAM2 的脚部/杆端提示会偶发带出孤立地砖、五金、阴影碎片；阈值随主体面积
    # 小幅增长但封顶，接近 skimage remove_small_objects，避免误删猫尾巴等真实轮廓。
    cleaned = Image.frombytes("L", binary.size, bytes(pixels))
    return MaskDetachedCleanup(
        normalize_mask(element_id, cleaned, binary.size),
        removed_count,
        removed_area,
    )


def _prompt_point_to_mask_xy(
    prompt: dict[str, Any],
    point: dict[str, Any],
) -> tuple[int, int]:
    canvas = prompt.get("canvas") or {}
    origin_x = int(canvas.get("x", 0))
    origin_y = int(canvas.get("y", 0))
    return int(point["x"]) - origin_x, int(point["y"]) - origin_y


def _support_point_component_coverage(
    prompt: dict[str, Any],
    mask: Image.Image,
    components: list[list[int]],
    radius: int = 2,
) -> tuple[int, int, int, int]:
    width, height = mask.size
    component_by_index = [-1] * (width * height)
    for component_id, component in enumerate(components):
        for index in component:
            component_by_index[index] = component_id

    total = 0
    missed = 0
    supported_detached_ids: set[int] = set()
    for point in prompt.get("points", []):
        if point.get("label") != "positive":
            continue
        total += 1
        x, y = _prompt_point_to_mask_xy(prompt, point)
        component_id = _foreground_component_near(component_by_index, width, height, x, y, radius)
        if component_id is None:
            missed += 1
            continue
        if component_id > 0:
            supported_detached_ids.add(component_id)

    supported_detached_area = sum(len(components[index]) for index in supported_detached_ids)
    unsupported_detached_area = sum(
        len(component)
        for index, component in enumerate(components[1:], start=1)
        if index not in supported_detached_ids
    )
    # WHY: 可见脚、挂钩这类小结构可能与主体只有阴影或遮挡间隙；只要它命中
    # 正向点，就按“被系统明确要求召回的轮廓”处理，而不是当成背景碎片。
    return total, missed, supported_detached_area, unsupported_detached_area


def _foreground_component_near(
    component_by_index: list[int],
    width: int,
    height: int,
    x: int,
    y: int,
    radius: int,
) -> int | None:
    if x < -radius or y < -radius or x >= width + radius or y >= height + radius:
        return None

    for sample_y in range(max(0, y - radius), min(height, y + radius + 1)):
        row = sample_y * width
        for sample_x in range(max(0, x - radius), min(width, x + radius + 1)):
            component_id = component_by_index[row + sample_x]
            if component_id >= 0:
                return component_id
    return None


def _candidate_adds_fragment_noise(
    baseline: Sam2MaskCandidate,
    candidate: Sam2MaskCandidate,
) -> bool:
    growth = max(0, candidate.foreground_area - baseline.foreground_area)
    detached_growth = max(0, candidate.unsupported_detached_area - baseline.unsupported_detached_area)

    # WHY: 底部支撑点是为找回脚/底座；只有未被正向点命中的新增孤立域才更像
    # 地砖、毛巾等背景误吸附，已命中的分离脚部应保留下来参与评分。
    return detached_growth >= max(1, growth // 2)


def _candidate_adds_implausible_growth(
    baseline: Sam2MaskCandidate,
    candidate: Sam2MaskCandidate,
) -> bool:
    growth = candidate.foreground_area - baseline.foreground_area
    allowed_growth = max(4, int(baseline.foreground_area * 0.03))
    if _candidate_has_supported_extremity_prompt(baseline, candidate):
        allowed_growth = max(allowed_growth, int(baseline.foreground_area * 0.12))

    # WHY: 底部支撑候选只能补回脚、底座这类小缺口；面积暴涨通常表示提示点吸到了
    # 邻近物体或背景；但侧向/底部末端点全命中时，猫尾、脚这类真实细长外轮廓
    # 会带来合理面积增长，所以给“有额外正向点证据”的候选更高但有限的余量。
    return growth > allowed_growth


def _candidate_has_supported_extremity_prompt(
    baseline: Sam2MaskCandidate,
    candidate: Sam2MaskCandidate,
) -> bool:
    if candidate.missed_support_point_count > 0:
        return False
    if candidate.support_point_count <= baseline.support_point_count:
        return False
    if candidate.bbox_lateral_growth_area >= lateral_growth_warn_limit(candidate.foreground_area):
        return False
    return str(candidate.prompt.get("supportProfile", "")).endswith("_extremity_support")
