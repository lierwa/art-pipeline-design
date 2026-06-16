from __future__ import annotations

from pathlib import Path

from PIL import Image

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
    output_path = workspace_root / "elements" / element_id / "thumb.png"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    thumbnail.save(output_path, format="PNG")
    return str(output_path.relative_to(workspace_root).as_posix())
