from __future__ import annotations

from typing import Annotated, Literal

from PIL import Image
from PIL import ImageDraw
from pydantic import BaseModel, Field, model_validator

from art_pipeline.elements import BoundingBox, ElementRecord


CoordinateSpace = Literal["source", "canvas"]


class MaskPoint(BaseModel):
    x: int
    y: int


class RectangleMaskShape(BaseModel):
    type: Literal["rectangle"]
    coordinateSpace: CoordinateSpace = "source"
    bbox: BoundingBox


class PolygonMaskShape(BaseModel):
    type: Literal["polygon"]
    coordinateSpace: CoordinateSpace = "source"
    points: list[MaskPoint] = Field(default_factory=list)

    @model_validator(mode="after")
    def require_polygon_area(self) -> "PolygonMaskShape":
        if len(self.points) < 3:
            raise ValueError("Polygon mask shape requires at least three points.")
        return self


MaskShape = Annotated[
    RectangleMaskShape | PolygonMaskShape,
    Field(discriminator="type"),
]


class ReplaceMaskRequest(BaseModel):
    shape: MaskShape


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


def create_mask_from_shape(element: ElementRecord, shape: MaskShape) -> Image.Image:
    if element.canvas is None:
        raise ValueError(f"Element {element.id} canvas is required for mask replacement.")

    canvas = element.canvas
    mask = Image.new("L", (canvas.w, canvas.h), 0)
    draw = ImageDraw.Draw(mask)

    if shape.type == "rectangle":
        left, top = _shape_point_to_canvas(element, shape.coordinateSpace, shape.bbox.x, shape.bbox.y)
        right = left + shape.bbox.w - 1
        bottom = top + shape.bbox.h - 1
        draw.rectangle((left, top, right, bottom), fill=255)
    else:
        points = [
            _shape_point_to_canvas(element, shape.coordinateSpace, point.x, point.y)
            for point in shape.points
        ]
        draw.polygon(points, fill=255)

    return normalize_mask(element.id, mask, (canvas.w, canvas.h))


def _shape_point_to_canvas(
    element: ElementRecord,
    coordinate_space: CoordinateSpace,
    x: int,
    y: int,
) -> tuple[int, int]:
    if element.canvas is None:
        raise ValueError(f"Element {element.id} canvas is required for mask replacement.")

    if coordinate_space == "canvas":
        return x, y

    return x - element.canvas.x, y - element.canvas.y
