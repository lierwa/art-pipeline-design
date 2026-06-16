from __future__ import annotations

import json
from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter, ImageOps
from pydantic import BaseModel, ValidationError

from art_pipeline.elements import BoundingBox, CanvasBox


class ProposalCandidate(BaseModel):
    name: str
    bbox: BoundingBox
    canvas: CanvasBox
    source: str
    confidence: float | None = None


class ImportedProposalsError(ValueError):
    pass


MAX_COLOR_COMPONENT_PROPOSALS = 80
MAX_EDGE_COMPONENT_PROPOSALS = 60
MIN_COLOR_COMPONENT_AREA = 24
EDGE_THRESHOLD = 40
EDGE_MORPHOLOGY_SIZE = 5


def generate_proposals(workspace_root: Path, source_image: Image.Image) -> list[ProposalCandidate]:
    candidates: list[ProposalCandidate] = []
    candidates.extend(cv_proposals(source_image))
    candidates.extend(imported_proposals(workspace_root))
    candidates.extend(sam2_proposals())
    return candidates


def cv_proposals(source_image: Image.Image) -> list[ProposalCandidate]:
    image = source_image.convert("RGBA")
    color_boxes = _same_color_component_boxes(image)
    if len(color_boxes) <= MAX_COLOR_COMPONENT_PROPOSALS:
        return _boxes_to_proposals(color_boxes)

    return _boxes_to_proposals(_edge_component_boxes(image))


def _same_color_component_boxes(
    image: Image.Image,
) -> list[tuple[int, int, int, int, int]]:
    width, height = image.size
    pixels = image.load()
    background = pixels[0, 0]
    visited = bytearray(width * height)
    components: list[tuple[int, int, int, int, int]] = []

    for y in range(height):
        for x in range(width):
            index = y * width + x
            pixel = pixels[x, y]
            if pixel == background or visited[index]:
                continue

            queue: deque[tuple[int, int]] = deque([(x, y)])
            visited[index] = 1
            min_x = max_x = x
            min_y = max_y = y
            area = 0

            while queue:
                current_x, current_y = queue.popleft()
                area += 1
                min_x = min(min_x, current_x)
                min_y = min(min_y, current_y)
                max_x = max(max_x, current_x)
                max_y = max(max_y, current_y)

                for next_x, next_y in _neighbor_points(current_x, current_y, width, height):
                    next_index = next_y * width + next_x
                    if visited[next_index]:
                        continue
                    if pixels[next_x, next_y] != pixel:
                        continue
                    visited[next_index] = 1
                    queue.append((next_x, next_y))

            if area < MIN_COLOR_COMPONENT_AREA:
                continue

            components.append(
                (
                    min_x,
                    min_y,
                    (max_x - min_x) + 1,
                    (max_y - min_y) + 1,
                    area,
                )
            )

    components.sort(key=lambda item: (item[1], item[0]))
    return components


def _edge_component_boxes(image: Image.Image) -> list[tuple[int, int, int, int, int]]:
    width, height = image.size
    total_area = width * height
    edge_mask = (
        ImageOps.grayscale(image)
        .filter(ImageFilter.FIND_EDGES)
        .point(lambda value: 255 if value >= EDGE_THRESHOLD else 0)
    )
    closed_mask = edge_mask.filter(
        ImageFilter.MaxFilter(EDGE_MORPHOLOGY_SIZE)
    ).filter(
        ImageFilter.MinFilter(EDGE_MORPHOLOGY_SIZE)
    )
    min_box_area = max(1000, total_area // 1600)
    min_component_area = max(80, total_area // 10000)
    min_side = max(15, min(width, height) // 90)
    max_box_area = int(total_area * 0.22)

    boxes = []
    for x, y, box_width, box_height, area in _binary_component_boxes(closed_mask):
        box_area = box_width * box_height
        if x == 0 and y == 0 and box_width == width and box_height == height:
            continue
        if area < min_component_area:
            continue
        if box_area < min_box_area or box_area > max_box_area:
            continue
        if box_width < min_side or box_height < min_side:
            continue
        boxes.append((x, y, box_width, box_height, area))

    boxes.sort(key=lambda item: item[2] * item[3], reverse=True)
    boxes = _prune_overlapping_boxes(boxes)[:MAX_EDGE_COMPONENT_PROPOSALS]
    boxes.sort(key=lambda item: (item[1], item[0]))
    return boxes


def _binary_component_boxes(mask: Image.Image) -> list[tuple[int, int, int, int, int]]:
    width, height = mask.size
    pixels = mask.load()
    visited = bytearray(width * height)
    components: list[tuple[int, int, int, int, int]] = []

    for y in range(height):
        for x in range(width):
            index = y * width + x
            if visited[index] or pixels[x, y] == 0:
                continue

            queue: deque[tuple[int, int]] = deque([(x, y)])
            visited[index] = 1
            min_x = max_x = x
            min_y = max_y = y
            area = 0

            while queue:
                current_x, current_y = queue.popleft()
                area += 1
                min_x = min(min_x, current_x)
                min_y = min(min_y, current_y)
                max_x = max(max_x, current_x)
                max_y = max(max_y, current_y)

                for next_x, next_y in _neighbor_points(current_x, current_y, width, height):
                    next_index = next_y * width + next_x
                    if visited[next_index] or pixels[next_x, next_y] == 0:
                        continue
                    visited[next_index] = 1
                    queue.append((next_x, next_y))

            components.append(
                (
                    min_x,
                    min_y,
                    (max_x - min_x) + 1,
                    (max_y - min_y) + 1,
                    area,
                )
            )

    return components


def _prune_overlapping_boxes(
    boxes: list[tuple[int, int, int, int, int]],
) -> list[tuple[int, int, int, int, int]]:
    pruned: list[tuple[int, int, int, int, int]] = []
    for candidate in boxes:
        if any(_box_iou(candidate, existing) > 0.75 for existing in pruned):
            continue
        pruned.append(candidate)
    return pruned


def _box_iou(
    left: tuple[int, int, int, int, int],
    right: tuple[int, int, int, int, int],
) -> float:
    left_x, left_y, left_w, left_h, _ = left
    right_x, right_y, right_w, right_h, _ = right
    intersection_left = max(left_x, right_x)
    intersection_top = max(left_y, right_y)
    intersection_right = min(left_x + left_w, right_x + right_w)
    intersection_bottom = min(left_y + left_h, right_y + right_h)
    if intersection_right <= intersection_left or intersection_bottom <= intersection_top:
        return 0.0

    intersection = (
        (intersection_right - intersection_left)
        * (intersection_bottom - intersection_top)
    )
    left_area = left_w * left_h
    right_area = right_w * right_h
    return intersection / (left_area + right_area - intersection)


def _boxes_to_proposals(
    boxes: list[tuple[int, int, int, int, int]],
) -> list[ProposalCandidate]:
    proposals: list[ProposalCandidate] = []
    for index, (x, y, width, height, _area) in enumerate(boxes, start=1):
        bbox = BoundingBox(
            x=x,
            y=y,
            w=width,
            h=height,
        )
        proposals.append(
            ProposalCandidate(
                name=f"Region {index}",
                bbox=bbox,
                canvas=CanvasBox(
                    x=bbox.x,
                    y=bbox.y,
                    w=bbox.w,
                    h=bbox.h,
                ),
                source="auto_cv",
            )
        )
    return proposals


def _neighbor_points(
    x: int,
    y: int,
    width: int,
    height: int,
):
    if x > 0:
        yield (x - 1, y)
    if x + 1 < width:
        yield (x + 1, y)
    if y > 0:
        yield (x, y - 1)
    if y + 1 < height:
        yield (x, y + 1)


def imported_proposals(workspace_root: Path) -> list[ProposalCandidate]:
    imported_path = workspace_root / "proposals" / "imported_proposals.json"
    if not imported_path.exists():
        return []

    try:
        payload = json.loads(imported_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ImportedProposalsError("Imported proposals file is not valid JSON.") from exc
    if not isinstance(payload, list):
        raise ImportedProposalsError("Imported proposals must be a JSON array.")

    proposals: list[ProposalCandidate] = []
    for item in payload:
        try:
            proposal = ProposalCandidate.model_validate(
                {
                    **item,
                    "source": "imported",
                }
            )
        except ValidationError as exc:
            raise ImportedProposalsError("Imported proposals have an invalid schema.") from exc
        proposals.append(proposal)
    return proposals


def sam2_proposals() -> list[ProposalCandidate]:
    return []
