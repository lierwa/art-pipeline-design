from __future__ import annotations

from PIL import Image


def normalize_mask(
    element_id: str,
    mask: Image.Image,
    expected_size: tuple[int, int],
) -> Image.Image:
    normalized = mask.convert("L")
    if normalized.size != expected_size:
        raise ValueError(
            f"Mask for element {element_id} must be {expected_size[0]} x {expected_size[1]} pixels."
        )

    normalized = normalized.point(lambda value: 255 if value > 0 else 0)
    validate_non_empty_mask(element_id, normalized)
    return normalized


def validate_non_empty_mask(element_id: str, mask: Image.Image) -> None:
    if mask.convert("L").getbbox() is None:
        raise ValueError(f"Mask for element {element_id} is empty.")
