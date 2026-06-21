from __future__ import annotations

import base64
from io import BytesIO
from typing import Annotated, Literal

from PIL import Image, ImageChops, ImageFilter, UnidentifiedImageError
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


class MagicWandMaskShape(BaseModel):
    type: Literal["magic_wand"]
    coordinateSpace: CoordinateSpace = "source"
    seed: MaskPoint
    tolerance: int = Field(default=28, ge=0, le=255)


class MaskDeltaShape(BaseModel):
    type: Literal["mask_delta"]
    coordinateSpace: CoordinateSpace = "canvas"
    maskData: str
    cleanupMinArea: int | None = Field(default=None, ge=1)


MaskShape = Annotated[
    RectangleMaskShape | PolygonMaskShape | MagicWandMaskShape | MaskDeltaShape,
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


def create_mask_from_shape(
    element: ElementRecord,
    shape: MaskShape,
    source_image: Image.Image | None = None,
) -> Image.Image:
    if element.canvas is None:
        raise ValueError(f"Element {element.id} canvas is required for mask replacement.")

    if shape.type == "magic_wand":
        return _create_magic_wand_mask(element, shape, source_image)
    if shape.type == "mask_delta":
        return _create_mask_delta_mask(element, shape)

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


def _create_magic_wand_mask(
    element: ElementRecord,
    shape: MagicWandMaskShape,
    source_image: Image.Image | None,
) -> Image.Image:
    if element.canvas is None:
        raise ValueError(f"Element {element.id} canvas is required for magic wand mask editing.")
    if source_image is None:
        raise ValueError("Magic wand mask shape requires a source image.")

    canvas = element.canvas
    seed_x, seed_y = _shape_point_to_canvas(
        element,
        shape.coordinateSpace,
        shape.seed.x,
        shape.seed.y,
    )
    if seed_x < 0 or seed_y < 0 or seed_x >= canvas.w or seed_y >= canvas.h:
        raise ValueError("Magic wand seed must be inside the element canvas.")

    source_crop = source_image.convert("RGBA").crop(
        (canvas.x, canvas.y, canvas.x + canvas.w, canvas.y + canvas.h)
    )
    mask = _flood_fill_similar_region(source_crop, seed_x, seed_y, shape.tolerance)
    return normalize_mask(element.id, mask, (canvas.w, canvas.h))


def _create_mask_delta_mask(element: ElementRecord, shape: MaskDeltaShape) -> Image.Image:
    if element.canvas is None:
        raise ValueError(f"Element {element.id} canvas is required for mask delta editing.")
    if shape.coordinateSpace != "canvas":
        raise ValueError("Mask delta shape must use canvas coordinates.")

    mask = _decode_mask_data(shape.maskData)
    if shape.cleanupMinArea is not None:
        mask = remove_small_mask_fragments(mask, shape.cleanupMinArea)
    return normalize_mask(element.id, mask, (element.canvas.w, element.canvas.h))


def remove_small_mask_fragments(mask: Image.Image, min_area: int) -> Image.Image:
    binary = mask.convert("L").point(lambda value: 255 if value > 0 else 0)
    width, height = binary.size
    pixels = bytearray(binary.tobytes())
    visited = bytearray(width * height)
    kept = bytearray(width * height)

    # WHY: 用户在左侧局部修 mask 时会产生零散点击碎片；清理只按连通面积移除小块，
    # 不改变主体轮廓，避免把凳子腿、植物叶片这类真实小细节一并自动删掉。
    for start in range(width * height):
        if visited[start] or pixels[start] == 0:
            continue

        component: list[int] = []
        stack = [start]
        visited[start] = 1
        while stack:
            index = stack.pop()
            component.append(index)
            x = index % width
            y = index // width
            for neighbor in _mask_neighbor_indexes(x, y, width, height):
                if visited[neighbor] or pixels[neighbor] == 0:
                    continue
                visited[neighbor] = 1
                stack.append(neighbor)

        if len(component) >= min_area:
            for index in component:
                kept[index] = 255

    return Image.frombytes("L", (width, height), bytes(kept))


def _decode_mask_data(mask_data: str) -> Image.Image:
    encoded = mask_data.split(",", 1)[1] if "," in mask_data else mask_data
    try:
        raw = base64.b64decode(encoded, validate=True)
        with Image.open(BytesIO(raw)) as image:
            rgba = image.convert("RGBA")
    except (ValueError, UnidentifiedImageError) as exc:
        raise ValueError("Mask delta data must be a valid base64 PNG image.") from exc

    alpha = rgba.getchannel("A")
    if alpha.getbbox() and alpha.getbbox() != (0, 0, rgba.width, rgba.height):
        return alpha
    return rgba.convert("L")


def _mask_neighbor_indexes(x: int, y: int, width: int, height: int) -> list[int]:
    neighbors: list[int] = []
    if x > 0:
        neighbors.append(y * width + x - 1)
    if x + 1 < width:
        neighbors.append(y * width + x + 1)
    if y > 0:
        neighbors.append((y - 1) * width + x)
    if y + 1 < height:
        neighbors.append((y + 1) * width + x)
    return neighbors


def _flood_fill_similar_region(
    source_crop: Image.Image,
    seed_x: int,
    seed_y: int,
    tolerance: int,
) -> Image.Image:
    image = source_crop.convert("RGBA")
    width, height = image.size
    pixels = image.load()
    seed_color = pixels[seed_x, seed_y]
    visited = bytearray(width * height)
    selected = bytearray(width * height)
    stack = [(seed_x, seed_y)]

    # WHY: 修 mask 要的是“点一下同色连通区域”，不是让用户输入矩形数值。
    # 这里限制为 4 邻域连通，避免相同颜色但被轮廓线隔开的物体被一起误选。
    while stack:
        x, y = stack.pop()
        index = y * width + x
        if visited[index]:
            continue
        visited[index] = 1
        if not _is_similar_magic_wand_color(seed_color, pixels[x, y], tolerance):
            continue

        selected[index] = 255
        if x > 0:
            stack.append((x - 1, y))
        if x + 1 < width:
            stack.append((x + 1, y))
        if y > 0:
            stack.append((x, y - 1))
        if y + 1 < height:
            stack.append((x, y + 1))

    return Image.frombytes("L", (width, height), bytes(selected))


def _is_similar_magic_wand_color(
    seed_color: tuple[int, int, int, int],
    sample_color: tuple[int, int, int, int],
    tolerance: int,
) -> bool:
    alpha_tolerance = max(16, tolerance)
    return (
        abs(seed_color[0] - sample_color[0]) <= tolerance
        and abs(seed_color[1] - sample_color[1]) <= tolerance
        and abs(seed_color[2] - sample_color[2]) <= tolerance
        and abs(seed_color[3] - sample_color[3]) <= alpha_tolerance
    )


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
