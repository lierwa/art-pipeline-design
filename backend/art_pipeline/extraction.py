from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

from art_pipeline.asset_outputs import write_extraction_outputs
from art_pipeline.elements import ElementRecord
from art_pipeline.mask_refine import normalize_mask


BBOX_ALPHA_STRATEGY = "bbox_alpha"


def extract_bbox_alpha(
    workspace_root,
    source_image: Image.Image,
    element: ElementRecord,
) -> dict:
    if element.canvas is None:
        raise ValueError(f"Element {element.id} canvas is required for extraction.")

    mask = (
        load_existing_mask(workspace_root, element)
        if element.mask
        else create_bbox_alpha_mask(element)
    )
    mask = normalize_mask(element.id, mask, (element.canvas.w, element.canvas.h))
    source_crop = crop_source_to_canvas(source_image, element)
    asset = compose_asset_from_source(source_crop, mask)
    return write_extraction_outputs(
        workspace_root,
        element,
        BBOX_ALPHA_STRATEGY,
        mask,
        asset,
        source_crop,
    )


def load_existing_mask(workspace_root: Path, element: ElementRecord) -> Image.Image:
    if not element.mask:
        raise ValueError(f"Element {element.id} does not reference a mask.")

    workspace_path = Path(workspace_root).resolve()
    mask_path = (workspace_path / element.mask).resolve()
    try:
        mask_path.relative_to(workspace_path)
    except ValueError as exc:
        raise ValueError(f"Mask for element {element.id} must stay inside the workspace.") from exc

    if not mask_path.exists():
        raise ValueError(f"Mask for element {element.id} does not exist: {element.mask}.")

    try:
        with Image.open(mask_path) as mask:
            return mask.convert("L")
    except OSError as exc:
        raise ValueError(f"Mask for element {element.id} is not readable: {element.mask}.") from exc


def create_bbox_alpha_mask(element: ElementRecord) -> Image.Image:
    if element.canvas is None:
        raise ValueError(f"Element {element.id} canvas is required for extraction.")

    canvas = element.canvas
    bbox = element.bbox
    mask = Image.new("L", (canvas.w, canvas.h), 0)

    left = max(canvas.x, bbox.x)
    top = max(canvas.y, bbox.y)
    right = min(canvas.x + canvas.w, bbox.x + bbox.w)
    bottom = min(canvas.y + canvas.h, bbox.y + bbox.h)

    if right > left and bottom > top:
        draw = ImageDraw.Draw(mask)
        draw.rectangle(
            (
                left - canvas.x,
                top - canvas.y,
                right - canvas.x - 1,
                bottom - canvas.y - 1,
            ),
            fill=255,
        )

    return mask


def crop_source_to_canvas(source_image: Image.Image, element: ElementRecord) -> Image.Image:
    if element.canvas is None:
        raise ValueError(f"Element {element.id} canvas is required for extraction.")

    canvas = element.canvas
    return source_image.crop(
        (
            canvas.x,
            canvas.y,
            canvas.x + canvas.w,
            canvas.y + canvas.h,
        )
    ).convert("RGBA")


def compose_asset_from_source(source_crop: Image.Image, mask: Image.Image) -> Image.Image:
    asset = Image.new("RGBA", source_crop.size, (0, 0, 0, 0))
    asset.paste(source_crop.convert("RGBA"), (0, 0), mask)
    return asset
