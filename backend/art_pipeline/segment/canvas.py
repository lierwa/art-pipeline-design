from __future__ import annotations

from PIL import Image

from art_pipeline.elements import BoundingBox, CanvasBox, ElementRecord
from art_pipeline.masks import expand_canvas


def expanded_canvas_for_source_mask(
    source_image: Image.Image,
    element: ElementRecord,
    mask: Image.Image,
) -> CanvasBox:
    if element.canvas is None:
        raise ValueError(f"Element {element.id} canvas is required for segmentation.")

    mask_bbox = mask.getbbox()
    if mask_bbox is None:
        return element.canvas

    canvas_bbox = element.bbox
    left = min(canvas_bbox.x, mask_bbox[0])
    top = min(canvas_bbox.y, mask_bbox[1])
    right = max(canvas_bbox.x + canvas_bbox.w, mask_bbox[2])
    bottom = max(canvas_bbox.y + canvas_bbox.h, mask_bbox[3])
    union = BoundingBox(x=left, y=top, w=right - left, h=bottom - top)
    # WHY: SAM2 的全图 mask 常常已经抓到 bbox 外的脚、杆、挂钩等细节；输出阶段
    # 必须按 raw mask 反推 canvas，否则质量再好的候选也会在写文件时被检测框裁断。
    return expand_canvas(union, source_image.width, source_image.height)
