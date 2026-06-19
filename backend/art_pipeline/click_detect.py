from __future__ import annotations

from pathlib import Path

from PIL import Image

from art_pipeline.elements import BoundingBox, ElementRecord, next_element_id
from art_pipeline.thumbnails import write_thumbnail


def candidate_from_click_mask(
    workspace_root: Path,
    elements: list[ElementRecord],
    source_image: Image.Image,
    label: str,
    mask: Image.Image,
) -> ElementRecord:
    if not isinstance(mask, Image.Image):
        raise ValueError("SAM2 provider result must be a PIL image mask.")

    bounds = mask.convert("L").getbbox()
    if bounds is None:
        raise ValueError("SAM2 provider returned an empty mask.")

    left, top, right, bottom = bounds
    bbox = BoundingBox(x=left, y=top, w=right - left, h=bottom - top)
    element_id = next_element_id(elements)
    thumbnail_path = write_thumbnail(source_image, workspace_root, element_id, bbox)

    # WHY: SAM2 mask 已经是像素级点击证据；这里保留最小外接框，避免检测扩框改变用户意图。
    return ElementRecord(
        id=element_id,
        name=label,
        label=label,
        status="click_detected",
        mode="visible_only",
        bbox=bbox,
        layer=_next_layer(elements),
        thumbnail=thumbnail_path,
        mask=None,
        parentId=None,
        source="click_detect",
        sourceProvider="sam2",
        sourcePrompt=label,
        notes="",
        visible=True,
        confidence=None,
    )


def _next_layer(elements: list[ElementRecord]) -> int:
    if not elements:
        return 1
    return max(element.layer for element in elements) + 1
