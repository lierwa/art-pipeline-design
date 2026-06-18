from __future__ import annotations

from art_pipeline.elements import BoundingBox, CanvasBox


DEFAULT_CANVAS_PADDING = 8
DEFAULT_BBOX_PADDING_RATIO = 0.005
MIN_BBOX_PADDING = 2
MAX_BBOX_PADDING = 12


def clamp_bbox_to_source(
    bbox: BoundingBox,
    source_width: int,
    source_height: int,
) -> BoundingBox:
    x1 = max(0, min(bbox.x, source_width))
    y1 = max(0, min(bbox.y, source_height))
    x2 = max(x1, min(bbox.x + bbox.w, source_width))
    y2 = max(y1, min(bbox.y + bbox.h, source_height))
    return BoundingBox(
        x=x1,
        y=y1,
        w=x2 - x1,
        h=y2 - y1,
    )


def expand_bbox(
    bbox: BoundingBox,
    source_width: int,
    source_height: int,
    padding: int | None = None,
) -> BoundingBox:
    resolved_padding = padding if padding is not None else default_bbox_padding(source_width, source_height)
    x1 = max(0, bbox.x - resolved_padding)
    y1 = max(0, bbox.y - resolved_padding)
    x2 = min(source_width, bbox.x + bbox.w + resolved_padding)
    y2 = min(source_height, bbox.y + bbox.h + resolved_padding)
    return BoundingBox(
        x=x1,
        y=y1,
        w=x2 - x1,
        h=y2 - y1,
    )


def default_bbox_padding(source_width: int, source_height: int) -> int:
    scaled = round(min(source_width, source_height) * DEFAULT_BBOX_PADDING_RATIO)
    return max(MIN_BBOX_PADDING, min(MAX_BBOX_PADDING, scaled))


def expand_canvas(
    bbox: BoundingBox,
    source_width: int,
    source_height: int,
    padding: int = DEFAULT_CANVAS_PADDING,
) -> CanvasBox:
    x1 = max(0, bbox.x - padding)
    y1 = max(0, bbox.y - padding)
    x2 = min(source_width, bbox.x + bbox.w + padding)
    y2 = min(source_height, bbox.y + bbox.h + padding)
    return CanvasBox(
        x=x1,
        y=y1,
        w=x2 - x1,
        h=y2 - y1,
    )
