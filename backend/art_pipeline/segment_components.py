from __future__ import annotations

from PIL import Image


def foreground_component_areas(mask: Image.Image) -> list[int]:
    return [len(component) for component in foreground_components(mask)]


def tiny_detached_component_area_limit(main_area: int) -> int:
    return min(96, max(4, int(main_area * 0.001)))


def count_background_hole_components(
    pixels: bytearray,
    outside: bytearray,
    width: int,
) -> int:
    seen = bytearray(len(pixels))
    count = 0
    for index, value in enumerate(pixels):
        if value != 0 or outside[index] or seen[index]:
            continue
        count += 1
        seen[index] = 1
        queue = [index]
        cursor = 0
        while cursor < len(queue):
            current = queue[cursor]
            cursor += 1
            x = current % width
            for next_index in neighbor_indexes(current, x, width, len(pixels)):
                if pixels[next_index] == 0 and outside[next_index] == 0 and seen[next_index] == 0:
                    seen[next_index] = 1
                    queue.append(next_index)
    return count


def foreground_components(mask: Image.Image) -> list[list[int]]:
    binary = mask.convert("L").point(lambda value: 255 if value > 0 else 0)
    width, _ = binary.size
    pixels = bytearray(binary.tobytes())
    seen = bytearray(len(pixels))
    components: list[list[int]] = []

    for index, value in enumerate(pixels):
        if value == 0 or seen[index]:
            continue
        components.append(_flood_component(index, pixels, seen, width))

    components.sort(key=len, reverse=True)
    return components


def neighbor_indexes(index: int, x: int, width: int, size: int) -> list[int]:
    neighbors: list[int] = []
    if x > 0:
        neighbors.append(index - 1)
    if x + 1 < width:
        neighbors.append(index + 1)
    if index >= width:
        neighbors.append(index - width)
    if index + width < size:
        neighbors.append(index + width)
    return neighbors


def _flood_component(
    start_index: int,
    pixels: bytearray,
    seen: bytearray,
    width: int,
) -> list[int]:
    seen[start_index] = 1
    queue = [start_index]
    cursor = 0
    while cursor < len(queue):
        current = queue[cursor]
        cursor += 1
        x = current % width
        for next_index in neighbor_indexes(current, x, width, len(pixels)):
            if pixels[next_index] > 0 and seen[next_index] == 0:
                seen[next_index] = 1
                queue.append(next_index)
    return queue
