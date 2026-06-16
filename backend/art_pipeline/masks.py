from __future__ import annotations

from art_pipeline.elements import BoundingBox, CanvasBox


DEFAULT_CANVAS_PADDING = 8


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
