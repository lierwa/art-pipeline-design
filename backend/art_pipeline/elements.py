from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


ElementStatus = Literal[
    "proposal",
    "accepted",
    "split_parent",
    "extract_ready",
    "extracted",
    "repair_pending",
    "repair_complete",
    "qa_failed",
    "exported",
]

ElementMode = Literal[
    "visible_only",
    "needs_completion",
    "completed_by_codex",
    "rejected",
]


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


class ElementRecord(BaseModel):
    id: str
    name: str
    status: ElementStatus = "proposal"
    mode: ElementMode = "visible_only"
    bbox: BoundingBox
    canvas: CanvasBox | None = None
    layer: int = 0
    thumbnail: str | None = None
    mask: str | None = None
    parentId: str | None = None
    source: str = "manual"
    notes: str = ""
    visible: bool = True
    confidence: float | None = None

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
