from __future__ import annotations

from typing import Protocol

from PIL import Image
from pydantic import BaseModel

from art_pipeline.elements import BoundingBox


DEFAULT_ASSET_VOCABULARY = [
    "cat",
    "bathtub",
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
]


class DetectionProviderNotConfigured(RuntimeError):
    pass


class DetectionResult(BaseModel):
    label: str
    confidence: float
    bbox: BoundingBox
    sourcePrompt: str


class DetectionProvider(Protocol):
    name: str

    def detect(
        self,
        image: Image.Image,
        vocabulary: list[str],
        prompt: str,
    ) -> list[dict]:
        raise NotImplementedError
