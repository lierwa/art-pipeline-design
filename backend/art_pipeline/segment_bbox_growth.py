from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from PIL import Image


@dataclass(frozen=True)
class MaskBboxGrowth:
    outside_area: int = 0
    lateral_area: int = 0
    top_area: int = 0
    bottom_area: int = 0


def bbox_growth_for_prompt(prompt: dict[str, Any], mask: Image.Image) -> MaskBboxGrowth:
    bbox = prompt.get("bbox")
    canvas = prompt.get("canvas")
    if not bbox or not canvas:
        return MaskBboxGrowth()

    origin_x = int(canvas.get("x", 0))
    origin_y = int(canvas.get("y", 0))
    left = int(bbox["x"]) - origin_x
    top = int(bbox["y"]) - origin_y
    right = left + int(bbox["w"])
    bottom = top + int(bbox["h"])

    width, _height = mask.size
    outside_area = 0
    lateral_area = 0
    top_area = 0
    bottom_area = 0

    for index, value in enumerate(mask.convert("L").tobytes()):
        if value == 0:
            continue
        x = index % width
        y = index // width
        if left <= x < right and top <= y < bottom:
            continue
        outside_area += 1
        if x < left or x >= right:
            lateral_area += 1
            continue
        if y < top:
            top_area += 1
            continue
        bottom_area += 1

    # WHY: bbox 外增长是模型是否把相邻物体粘进来的关键证据；侧向增长比底部增长更危险，
    # 因为脚/底座通常在下方，水盆/柜体这类误吸附更常从左右侧进入。
    return MaskBboxGrowth(
        outside_area=outside_area,
        lateral_area=lateral_area,
        top_area=top_area,
        bottom_area=bottom_area,
    )


def excessive_lateral_growth_limit(foreground_area: int) -> int:
    return max(128, int(foreground_area * 0.05))


def lateral_growth_warn_limit(foreground_area: int) -> int:
    return max(32, int(foreground_area * 0.01))
