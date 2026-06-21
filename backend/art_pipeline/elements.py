from __future__ import annotations

from datetime import datetime, timezone
import re
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


CandidateElementStatus = Literal[
    "model_detected",
    "click_detected",
    "edited",
    "child",
    "merged",
    "accepted",
    "rejected",
    "exported",
]

LegacyElementStatus = Literal[
    "proposal",
    "split_parent",
    "extract_ready",
    "extracted",
    "repair_pending",
    "repair_complete",
    "qa_failed",
]

ElementStatus = CandidateElementStatus | LegacyElementStatus

ElementMode = Literal[
    "visible_only",
    "needs_completion",
    "completed_by_codex",
    "rejected",
]

AssetRole = Literal["sticker", "parent", "removable_child", "embedded_keep", "skip"]

SegmentationStatus = Literal[
    "not_started",
    "mask_suggested",
    "mask_editing",
    "mask_accepted",
    "mask_rejected",
]

RepairStatus = Literal[
    "not_required",
    "required",
    "task_created",
    "redraw_pending",
    "repair_complete",
    "qa_failed",
]

ExportStatus = Literal["not_ready", "ready", "exported", "blocked"]
GenerationProfile = Literal[
    "sticker_completion",
    "child_standalone",
    "parent_inpaint_without_children",
]
SegmentationQualityStatus = Literal["pass", "warn", "fail"]

DEFAULT_WORKSPACE_VOCABULARY = [
    "cat",
    "bathtub",
    "toilet",
    "sink",
    "bathroom cabinet",
    "mirror",
    "window",
    "curtain",
    "towel",
    "basket",
    "stool",
    "bottle",
    "plant",
    "shelf",
    "rug",
    "bucket",
    "basin",
]

# WHY: 这个列表只用于把昨晚短期引入的过细默认 prompt 精确降级回 17 个核心物体；
# 影响范围仅限“完全等于该列表”的持久化 state，确认所有本地 run 都刷新后可删除。
EXPANDED_DEFAULT_WORKSPACE_VOCABULARY = [
    "cat",
    "cat collar",
    "cat bell",
    "bathtub",
    "bath water",
    "bathtub drain",
    "toilet",
    "toilet tank",
    "toilet lid",
    "toilet seat",
    "sink",
    "sink drain",
    "countertop",
    "bathroom cabinet",
    "bathroom vanity",
    "cabinet door",
    "cabinet drawer",
    "cabinet knob",
    "cabinet handle",
    "mirror",
    "mirror frame",
    "window",
    "arched window",
    "window frame",
    "window sill",
    "curtain",
    "shower curtain",
    "shower curtain panel",
    "curtain rod",
    "curtain ring",
    "curtain hook",
    "towel",
    "hand towel",
    "bath towel",
    "rolled towel",
    "towel rack",
    "towel bar",
    "basket",
    "laundry basket",
    "stool",
    "wooden stool",
    "bottle",
    "bottle cap",
    "pump bottle",
    "soap dispenser",
    "shampoo bottle",
    "conditioner bottle",
    "soap bottle",
    "lotion bottle",
    "shower bottle",
    "soap dish",
    "bar soap",
    "plant",
    "potted plant",
    "hanging plant",
    "plant pot",
    "succulent",
    "shelf",
    "wall shelf",
    "storage shelf",
    "rug",
    "bath mat",
    "paw rug",
    "bucket",
    "water bucket",
    "wooden bucket",
    "water bowl",
    "pet bowl",
    "basin",
    "water",
    "faucet",
    "sink faucet",
    "shower head",
    "shower pipe",
    "shower caddy",
    "shower valve",
    "picture frame",
    "cat picture",
    "cat figurine",
    "floor tile",
    "wall tile",
    "wall",
    "floor",
    "baseboard",
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


class SegmentationQuality(BaseModel):
    selectedProfile: str
    candidateCount: int
    foregroundArea: int
    detachedArea: int
    supportedDetachedArea: int = 0
    unsupportedDetachedArea: int = 0
    bboxOutsideArea: int = 0
    bboxLateralGrowthArea: int = 0
    bboxTopGrowthArea: int = 0
    bboxBottomGrowthArea: int = 0
    filledHoleCount: int
    filledHoleArea: int
    removedDetachedCount: int = 0
    removedDetachedArea: int = 0
    supportPointCount: int = 0
    missedSupportPointCount: int = 0
    qualityStatus: SegmentationQualityStatus = "pass"
    qualityReasons: list[str] = Field(default_factory=list)


class ElementRecord(BaseModel):
    id: str
    name: str
    label: str | None = None
    status: ElementStatus = "model_detected"
    mode: ElementMode = "visible_only"
    assetRole: AssetRole = "sticker"
    removeFromParent: str | None = None
    segmentationStatus: SegmentationStatus = "not_started"
    segmentationQuality: SegmentationQuality | None = None
    repairStatus: RepairStatus = "not_required"
    exportStatus: ExportStatus = "not_ready"
    bbox: BoundingBox
    canvas: CanvasBox | None = None
    layer: int = 0
    thumbnail: str | None = None
    mask: str | None = None
    parentId: str | None = None
    source: str = "manual"
    sourceProvider: str | None = None
    sourcePrompt: str | None = None
    sourcePromptHint: str | None = None
    generationProfile: GenerationProfile | None = None
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
    detectionVocabulary: list[str] = Field(
        default_factory=lambda: DEFAULT_WORKSPACE_VOCABULARY.copy()
    )


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
