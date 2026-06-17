from __future__ import annotations

from datetime import datetime, timezone
import re
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


ElementStatus = Literal[
    "model_detected",
    "edited",
    "child",
    "merged",
    "accepted",
    "rejected",
    "exported",
]

ElementMode = Literal[
    "visible_only",
    "needs_completion",
    "completed_by_codex",
    "rejected",
]

ELEMENT_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]*$")


class BoundingBox(BaseModel):
    x: int
    y: int
    w: int
    h: int


class CanvasBox(BaseModel):
    x: int
    y: int
    w: int
    h: int


class SourceMetadata(BaseModel):
    filename: str
    path: str
    width: int
    height: int


class CandidateHistoryEntry(BaseModel):
    kind: str
    at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    before: dict[str, Any]
    after: dict[str, Any]


class ElementRecord(BaseModel):
    id: str
    name: str
    label: str | None = None
    status: ElementStatus = "proposal"
    mode: ElementMode = "visible_only"
    bbox: BoundingBox
    canvas: CanvasBox | None = None
    layer: int = 0
    thumbnail: str | None = None
    mask: str | None = None
    parentId: str | None = None
    source: str = "manual"
    sourceProvider: str | None = None
    sourcePrompt: str | None = None
    notes: str = ""
    visible: bool = True
    confidence: float | None = None
    history: list[CandidateHistoryEntry] = Field(default_factory=list)
    mergedInto: str | None = None
    exportParent: bool = False

    @model_validator(mode="after")
    def populate_canvas(self) -> "ElementRecord":
        if self.canvas is None:
            self.canvas = CanvasBox(
                x=self.bbox.x,
                y=self.bbox.y,
                w=self.bbox.w,
                h=self.bbox.h,
            )
        return self


class WorkspaceState(BaseModel):
    source: SourceMetadata | None = None
    elements: list[ElementRecord] = Field(default_factory=list)


def next_element_id(existing_elements: list[ElementRecord], start: int = 1) -> str:
    used_ids = {element.id for element in existing_elements}
    next_index = start
    while True:
        candidate = f"element_{next_index:03d}"
        if candidate not in used_ids:
            return candidate
        next_index += 1


def validate_element_id(element_id: str) -> None:
    if not ELEMENT_ID_PATTERN.fullmatch(element_id):
        raise ValueError(
            f"Element id {element_id!r} must be a slug containing only letters, "
            "numbers, underscores, and hyphens."
        )
