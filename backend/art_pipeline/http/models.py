from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from art_pipeline.elements import AssetRole, BoundingBox
from art_pipeline.mask_refine import ReplaceMaskRequest


class PatchElementRequest(BaseModel):
    bbox: BoundingBox | None = None
    label: str | None = None
    visible: bool | None = None
    assetRole: AssetRole | None = None
    removeFromParent: str | None = None


class ElementParentRequest(BaseModel):
    parentId: str | None = None


class SegmentMaskPatchRequest(ReplaceMaskRequest):
    operation: Literal["replace", "add", "subtract"] = "replace"


class CodexFinalGenerateRequest(BaseModel):
    prompt: str | None = None
    promptHint: str | None = None


class ChildElementRequest(BaseModel):
    label: str
    bbox: BoundingBox


class MergeElementsRequest(BaseModel):
    elementIds: list[str] = Field(default_factory=list)
    label: str | None = None


class ClickDetectRequest(BaseModel):
    x: int
    y: int
    label: str = "untitled"
