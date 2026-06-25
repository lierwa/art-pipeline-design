from __future__ import annotations

from dataclasses import dataclass
from math import sqrt

from PIL import Image


@dataclass(frozen=True)
class CodexFinalAnalysisMask:
    bbox: tuple[int, int, int, int] | None
    centroid: tuple[float, float] | None
    visible_area: int
    kept_component_count: int
    removed_component_count: int
    image: Image.Image


@dataclass(frozen=True)
class _ConnectedComponent:
    pixels: tuple[int, ...]
    area: int
    bbox: tuple[int, int, int, int]
    centroid: tuple[float, float]


def build_codex_final_analysis_mask(image: Image.Image) -> CodexFinalAnalysisMask:
    mask = _to_binary_mask(image)
    components = _find_connected_components(mask)
    if not components:
        return CodexFinalAnalysisMask(
            bbox=None,
            centroid=None,
            visible_area=0,
            kept_component_count=0,
            removed_component_count=0,
            image=Image.new("L", mask.size, 0),
        )

    components.sort(key=lambda component: component.area, reverse=True)
    kept_components = _select_components_to_keep(components, mask.size)
    # WHY: 这个 cleaned mask 只服务后续几何测量。保留用户可见的 SAM2/manual mask
    # 可以避免内部清理阈值反过来改写用户已经确认过的视觉资产边界。
    output = _render_kept_components(mask.size, kept_components)
    visible_area = sum(component.area for component in kept_components)

    return CodexFinalAnalysisMask(
        bbox=output.getbbox(),
        centroid=_calculate_centroid(kept_components),
        visible_area=visible_area,
        kept_component_count=len(kept_components),
        removed_component_count=len(components) - len(kept_components),
        image=output,
    )


def _to_binary_mask(image: Image.Image) -> Image.Image:
    if image.mode in ("RGBA", "LA"):
        source = image.getchannel("A")
    elif image.mode == "L":
        source = image
    else:
        source = image.convert("L")
    return source.point(lambda value: 255 if value > 0 else 0, mode="L")


def _find_connected_components(mask: Image.Image) -> list[_ConnectedComponent]:
    width, height = mask.size
    data = mask.tobytes()
    visited = bytearray(width * height)
    components: list[_ConnectedComponent] = []

    for index, value in enumerate(data):
        if value == 0 or visited[index]:
            continue
        components.append(_flood_fill_component(index, data, visited, width, height))

    return components


def _flood_fill_component(
    start: int,
    data: bytes,
    visited: bytearray,
    width: int,
    height: int,
) -> _ConnectedComponent:
    stack = [start]
    pixels: list[int] = []
    min_x = max_x = start % width
    min_y = max_y = start // width
    sum_x = 0
    sum_y = 0
    visited[start] = 1

    while stack:
        index = stack.pop()
        x = index % width
        y = index // width
        pixels.append(index)
        sum_x += x
        sum_y += y
        min_x = min(min_x, x)
        max_x = max(max_x, x)
        min_y = min(min_y, y)
        max_y = max(max_y, y)

        for neighbor in _iter_neighbors(x, y, width, height):
            if data[neighbor] > 0 and not visited[neighbor]:
                visited[neighbor] = 1
                stack.append(neighbor)

    area = len(pixels)
    return _ConnectedComponent(
        pixels=tuple(pixels),
        area=area,
        bbox=(min_x, min_y, max_x + 1, max_y + 1),
        centroid=(sum_x / area, sum_y / area),
    )


def _iter_neighbors(x: int, y: int, width: int, height: int) -> list[int]:
    neighbors: list[int] = []
    for dy in (-1, 0, 1):
        neighbor_y = y + dy
        if neighbor_y < 0 or neighbor_y >= height:
            continue
        for dx in (-1, 0, 1):
            if dx == 0 and dy == 0:
                continue
            neighbor_x = x + dx
            if 0 <= neighbor_x < width:
                neighbors.append(neighbor_y * width + neighbor_x)
    return neighbors


def _select_components_to_keep(
    components: list[_ConnectedComponent],
    size: tuple[int, int],
) -> list[_ConnectedComponent]:
    largest = components[0]
    # WHY: Task 2 先采用“面积阈值 + 距离阈值”的保守清理规则，
    # 只剔除最容易污染测量的残留点，而不在这里替代后续质量判断。
    area_threshold = max(8, int(largest.area * 0.08))
    proximity_threshold = max(3.0, max(size) * 0.15)
    kept = [largest]

    for component in components[1:]:
        if component.area >= area_threshold:
            kept.append(component)
            continue
        # WHY: 靠近主体的小组件可能是装饰、细枝或断裂 mask；先保留可减少误删。
        # TRADE-OFF: 靠近主体的微小 speck 也可能留下，后续 Task 4 quality gate 再判断。
        if _bbox_distance(component.bbox, largest.bbox) <= proximity_threshold:
            kept.append(component)

    # WHY: 未进入 kept 的组件同时很小且远离主体，继续参与测量会拉歪
    # layout guide 的 bbox/centroid，比误删真实主体细节的风险更高。
    return kept


def _bbox_distance(
    first: tuple[int, int, int, int],
    second: tuple[int, int, int, int],
) -> float:
    left_a, top_a, right_a, bottom_a = first
    left_b, top_b, right_b, bottom_b = second
    x_gap = max(left_b - right_a, left_a - right_b, 0)
    y_gap = max(top_b - bottom_a, top_a - bottom_b, 0)
    return sqrt(float(x_gap * x_gap + y_gap * y_gap))


def _render_kept_components(
    size: tuple[int, int],
    components: list[_ConnectedComponent],
) -> Image.Image:
    width, height = size
    output = bytearray(width * height)
    for component in components:
        for index in component.pixels:
            output[index] = 255
    return Image.frombytes("L", size, bytes(output))


def _calculate_centroid(
    components: list[_ConnectedComponent],
) -> tuple[float, float] | None:
    visible_area = sum(component.area for component in components)
    if visible_area == 0:
        return None

    weighted_x = sum(component.centroid[0] * component.area for component in components)
    weighted_y = sum(component.centroid[1] * component.area for component in components)
    return (weighted_x / visible_area, weighted_y / visible_area)
