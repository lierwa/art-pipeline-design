from __future__ import annotations

import json
from collections import deque
from pathlib import Path
from typing import Iterable

from PIL import Image
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


def generate_proposals(workspace_root: Path, source_image: Image.Image) -> list[ProposalCandidate]:
    candidates: list[ProposalCandidate] = []
    candidates.extend(cv_proposals(source_image))
    candidates.extend(imported_proposals(workspace_root))
    candidates.extend(sam2_proposals())
    return candidates


def cv_proposals(source_image: Image.Image) -> list[ProposalCandidate]:
    image = source_image.convert("RGBA")
    width, height = image.size
    pixels = image.load()
    background = pixels[0, 0]
    visited: set[tuple[int, int]] = set()
    components: list[tuple[int, int, int, int, tuple[int, int, int, int]]] = []

    for y in range(height):
        for x in range(width):
            pixel = pixels[x, y]
            if pixel == background or (x, y) in visited:
                continue

            queue: deque[tuple[int, int]] = deque([(x, y)])
            visited.add((x, y))
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

                for next_x, next_y in _neighbors(current_x, current_y, width, height):
                    if (next_x, next_y) in visited:
                        continue
                    if pixels[next_x, next_y] != pixel:
                        continue
                    visited.add((next_x, next_y))
                    queue.append((next_x, next_y))

            if area < 24:
                continue

            components.append((min_x, min_y, max_x, max_y, pixel))

    components.sort(key=lambda item: (item[1], item[0]))
    proposals: list[ProposalCandidate] = []
    for index, (min_x, min_y, max_x, max_y, _pixel) in enumerate(components, start=1):
        bbox = BoundingBox(
            x=min_x,
            y=min_y,
            w=(max_x - min_x) + 1,
            h=(max_y - min_y) + 1,
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


def _neighbors(x: int, y: int, width: int, height: int) -> Iterable[tuple[int, int]]:
    if x > 0:
        yield (x - 1, y)
    if x + 1 < width:
        yield (x + 1, y)
    if y > 0:
        yield (x, y - 1)
    if y + 1 < height:
        yield (x, y + 1)
