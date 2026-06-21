from __future__ import annotations

from dataclasses import dataclass

from PIL import Image, ImageFilter

from art_pipeline.mask_refine import normalize_mask
from art_pipeline.segment.components import (
    foreground_components,
    neighbor_indexes,
    tiny_detached_component_area_limit,
)


@dataclass(frozen=True)
class MaskHoleRepair:
    mask: Image.Image
    filled_hole_count: int
    filled_hole_area: int


def fill_enclosed_mask_holes(element_id: str, mask: Image.Image) -> MaskHoleRepair:
    binary = normalize_mask(element_id, mask, mask.size)
    fill_region = binary.getbbox()
    if fill_region is None:
        return MaskHoleRepair(binary, 0, 0)

    barrier_source = _hole_barrier_source(binary)
    barrier = _seal_single_pixel_leaks(barrier_source)
    width, height = binary.size
    pixels = bytearray(binary.tobytes())
    barrier_pixels = bytearray(barrier.tobytes())
    outside = _reachable_background_from_border(barrier_pixels, width, height, fill_region)

    filled = bytearray(pixels)
    filled_hole_area = 0
    for index, value in enumerate(pixels):
        if value == 0 and outside[index] == 0 and _is_in_bbox(index, width, fill_region):
            filled[index] = 255
            filled_hole_area += 1

    if filled_hole_area == 0:
        return MaskHoleRepair(binary, 0, 0)

    repaired = Image.frombytes("L", binary.size, bytes(filled))
    # WHY: SAM2 常把同一物体内的材质、花纹或水面反光挖成小洞；先忽略微小孤立噪点，
    # 再用 Pillow 形态学闭运算封住 1px 漏缝，只填无法从边界到达的背景，避免噪点造墙。
    return MaskHoleRepair(
        normalize_mask(element_id, repaired, binary.size),
        _count_filled_hole_components(pixels, outside, width, fill_region),
        filled_hole_area,
    )


def _hole_barrier_source(mask: Image.Image) -> Image.Image:
    components = foreground_components(mask)
    if len(components) <= 1:
        return mask

    main_area = len(components[0])
    tiny_area_limit = tiny_detached_component_area_limit(main_area)
    pixels = bytearray(mask.tobytes())
    barrier = bytearray(len(pixels))
    for index, component in enumerate(components):
        if index > 0 and len(component) <= tiny_area_limit:
            continue
        for pixel_index in component:
            barrier[pixel_index] = pixels[pixel_index]
    return Image.frombytes("L", mask.size, bytes(barrier))


def _seal_single_pixel_leaks(mask: Image.Image) -> Image.Image:
    return (
        mask.convert("L")
        .point(lambda value: 255 if value > 0 else 0)
        .filter(ImageFilter.MaxFilter(3))
        .filter(ImageFilter.MinFilter(3))
        .point(lambda value: 255 if value > 0 else 0)
    )


def _reachable_background_from_border(
    barrier_pixels: bytearray,
    width: int,
    height: int,
    fill_region: tuple[int, int, int, int],
) -> bytearray:
    outside = bytearray(width * height)
    queue: list[int] = []

    def enqueue(index: int) -> None:
        if barrier_pixels[index] == 0 and outside[index] == 0:
            outside[index] = 1
            queue.append(index)

    for x in range(width):
        enqueue(x)
        enqueue((height - 1) * width + x)
    for y in range(height):
        enqueue(y * width)
        enqueue(y * width + width - 1)
    left, top, right, bottom = fill_region
    for x in range(left, right):
        enqueue(top * width + x)
        enqueue((bottom - 1) * width + x)
    for y in range(top, bottom):
        enqueue(y * width + left)
        enqueue(y * width + right - 1)

    cursor = 0
    while cursor < len(queue):
        index = queue[cursor]
        cursor += 1
        x = index % width
        for next_index in neighbor_indexes(index, x, width, len(barrier_pixels)):
            enqueue(next_index)

    return outside


def _is_in_bbox(index: int, width: int, bbox: tuple[int, int, int, int]) -> bool:
    x = index % width
    y = index // width
    left, top, right, bottom = bbox
    return left <= x < right and top <= y < bottom


def _count_filled_hole_components(
    pixels: bytearray,
    outside: bytearray,
    width: int,
    fill_region: tuple[int, int, int, int],
) -> int:
    fill_mask = bytearray(len(pixels))
    for index, value in enumerate(pixels):
        if value == 0 and outside[index] == 0 and _is_in_bbox(index, width, fill_region):
            fill_mask[index] = 255
    image = Image.frombytes("L", (width, len(pixels) // width), bytes(fill_mask))
    return len(foreground_components(image))
