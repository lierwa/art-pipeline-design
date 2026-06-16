from __future__ import annotations

from pathlib import Path

from PIL import Image

from art_pipeline.asset_outputs import element_output_dir, element_relative_path
from art_pipeline.elements import BoundingBox


def write_thumbnail(
    source_image: Image.Image,
    workspace_root: Path,
    element_id: str,
    bbox: BoundingBox,
) -> str:
    crop_box = (
        bbox.x,
        bbox.y,
        bbox.x + bbox.w,
        bbox.y + bbox.h,
    )
    thumbnail = source_image.crop(crop_box)
    output_dir = element_output_dir(workspace_root, element_id, create=True)
    output_path = output_dir / "thumb.png"
    thumbnail.save(output_path, format="PNG")
    return element_relative_path(workspace_root, element_id, "thumb.png")
