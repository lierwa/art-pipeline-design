from __future__ import annotations

from typing import Annotated, Literal

from PIL import Image, ImageChops, ImageFilter
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


def polish_mask_alpha(mask: Image.Image, source_image: Image.Image | None = None) -> Image.Image:
    binary = mask.convert("L").point(lambda value: 255 if value > 0 else 0)
    if source_image is None:
        return _conservative_mask_alpha(binary)

    alpha = _source_aware_soft_alpha(binary)
    return ImageChops.lighter(alpha, _source_outline_alpha(binary, source_image))


def _conservative_mask_alpha(mask: Image.Image) -> Image.Image:
    binary = mask.convert("L").point(lambda value: 255 if value > 0 else 0)
    softened = binary.filter(ImageFilter.GaussianBlur(0.72))
    outside_only = ImageChops.multiply(softened, ImageChops.invert(binary))
    outside_antialias = outside_only.point(lambda value: 0 if value < 16 else min(value, 160))
    edge_preserved = binary.point(lambda value: 245 if value > 0 else 0)
    core = binary.filter(ImageFilter.MinFilter(3))
    alpha = ImageChops.lighter(ImageChops.lighter(edge_preserved, core), outside_antialias)
    # WHY: 线稿贴纸不能内蚀，否则 1px 外轮廓会被吃掉；协议 mask 仍保持二值，
    # 手工 mask 没有 source 边缘可参考，只能保守留住外轮廓，避免编辑后线稿丢边。
    return alpha


def _source_aware_soft_alpha(mask: Image.Image) -> Image.Image:
    binary = mask.convert("L").point(lambda value: 255 if value > 0 else 0)
    softened = binary.filter(ImageFilter.GaussianBlur(1.0))
    antialiased = softened.point(lambda value: 0 if value < 16 else value)
    core = binary.filter(ImageFilter.MinFilter(3))
    # WHY: 自动扣图有 source crop 可以判断真实线框；普通浅色边缘不应硬锁成二值台阶，
    # 但内部核心仍保持不透明，防止整件贴纸被羽化成虚边。
    return ImageChops.lighter(antialiased, core)


def _source_outline_alpha(mask: Image.Image, source_image: Image.Image) -> Image.Image:
    source = source_image.convert("RGBA")
    if source.size != mask.size:
        return Image.new("L", mask.size, 0)

    outer_band = ImageChops.subtract(mask.filter(ImageFilter.MaxFilter(5)), mask)
    inner_band = ImageChops.subtract(mask, mask.filter(ImageFilter.MinFilter(5)))
    outline_band = ImageChops.lighter(outer_band, inner_band)
    edge = source.convert("RGB").convert("L").filter(ImageFilter.FIND_EDGES)
    mask_pixels = bytearray(mask.tobytes())
    outline_pixels = bytearray(outline_band.tobytes())
    edge_pixels = bytearray(edge.tobytes())
    source_pixels = source.tobytes()
    width, height = mask.size
    lumas = bytearray(len(outline_pixels))
    source_alphas = bytearray(len(outline_pixels))
    for index in range(len(outline_pixels)):
        red = source_pixels[index * 4]
        green = source_pixels[index * 4 + 1]
        blue = source_pixels[index * 4 + 2]
        lumas[index] = (red * 299 + green * 587 + blue * 114) // 1000
        source_alphas[index] = source_pixels[index * 4 + 3]

    alpha = bytearray(len(outline_pixels))

    for index, band_value in enumerate(outline_pixels):
        if band_value == 0 or source_alphas[index] == 0:
            continue
        luma = lumas[index]
        inside_mask = mask_pixels[index] > 0
        dark_line = (
            luma < 150
            and (inside_mask or _has_bright_opaque_neighbor(index, width, height, lumas, source_alphas))
        )
        if dark_line:
            alpha[index] = 255
            continue
        if edge_pixels[index] >= 24 and 150 <= luma <= 210:
            alpha[index] = 190

    # WHY: SAM2 mask 在手绘线稿边缘可能偏内或偏外 1-2px；只在 mask 边界邻域、且源图
    # 确有强边缘/深色窄线时提升 alpha；暗背景不能当线条，否则会把软边重新硬化。
    return Image.frombytes("L", mask.size, bytes(alpha))


def _has_bright_opaque_neighbor(
    index: int,
    width: int,
    height: int,
    lumas: bytearray,
    source_alphas: bytearray,
) -> bool:
    x = index % width
    y = index // width
    for sample_y in range(max(0, y - 1), min(height, y + 2)):
        row = sample_y * width
        for sample_x in range(max(0, x - 1), min(width, x + 2)):
            neighbor_index = row + sample_x
            if source_alphas[neighbor_index] > 0 and lumas[neighbor_index] >= 170:
                return True
    return False


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
