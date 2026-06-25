from __future__ import annotations

from collections.abc import Iterable
from typing import Any, Protocol

from PIL import Image
from pydantic import BaseModel, Field, model_validator

from art_pipeline.elements import BoundingBox, DEFAULT_WORKSPACE_VOCABULARY


DEFAULT_ASSET_VOCABULARY = DEFAULT_WORKSPACE_VOCABULARY.copy()


class DetectionProviderNotConfigured(RuntimeError):
    pass


class DetectionResult(BaseModel):
    label: str
    confidence: float = Field(ge=0.0, le=1.0)
    bbox: BoundingBox
    sourcePrompt: str

    @model_validator(mode="after")
    def validate_bbox_dimensions(self) -> "DetectionResult":
        if self.bbox.w <= 0 or self.bbox.h <= 0:
            raise ValueError("bbox width and height must be positive.")
        return self


class DetectionProvider(Protocol):
    name: str

    def detect(
        self,
        image: Image.Image,
        vocabulary: list[str],
        prompt: str,
    ) -> list[DetectionResult | dict[str, Any]]:
        raise NotImplementedError


class StreamingDetectionProvider(DetectionProvider, Protocol):
    def stream_detect(
        self,
        image: Image.Image,
        vocabulary: list[str],
        prompt: str,
    ) -> Iterable[DetectionResult | dict[str, Any]]:
        raise NotImplementedError
