from __future__ import annotations

from dataclasses import dataclass

from PIL import Image

from art_pipeline.detection import DetectionResult
from art_pipeline.elements import BoundingBox


@dataclass(frozen=True)
class _DemoDetectionSpec:
    label: str
    confidence: float
    x: float
    y: float
    w: float
    h: float


class DemoDetectionProvider:
    name = "demo"

    _SPECS = [
        _DemoDetectionSpec("bathtub", 0.91, 0.38, 0.40, 0.30, 0.18),
        _DemoDetectionSpec("cat", 0.89, 0.23, 0.68, 0.16, 0.16),
        _DemoDetectionSpec("sink", 0.79, 0.68, 0.50, 0.18, 0.16),
        _DemoDetectionSpec("mirror", 0.76, 0.72, 0.19, 0.11, 0.17),
        _DemoDetectionSpec("window", 0.74, 0.18, 0.16, 0.13, 0.23),
        _DemoDetectionSpec("towel", 0.72, 0.78, 0.36, 0.10, 0.17),
        _DemoDetectionSpec("plant", 0.70, 0.30, 0.13, 0.08, 0.13),
        _DemoDetectionSpec("shelf", 0.68, 0.36, 0.12, 0.16, 0.18),
        _DemoDetectionSpec("rug", 0.67, 0.43, 0.72, 0.20, 0.10),
        _DemoDetectionSpec("basket", 0.64, 0.18, 0.55, 0.10, 0.16),
    ]

    def detect(
        self,
        image: Image.Image,
        vocabulary: list[str],
        prompt: str,
    ) -> list[DetectionResult]:
        allowed_labels = {label.strip().lower() for label in vocabulary}
        return [
            DetectionResult(
                label=spec.label,
                confidence=spec.confidence,
                bbox=_scaled_box(image.width, image.height, spec),
                sourcePrompt=spec.label,
            )
            for spec in self._SPECS
            if spec.label in allowed_labels
        ]


def _scaled_box(width: int, height: int, spec: _DemoDetectionSpec) -> BoundingBox:
    x = _scale_start(width, spec.x)
    y = _scale_start(height, spec.y)
    w = _scale_size(width, spec.w)
    h = _scale_size(height, spec.h)
    if x + w > width:
        w = width - x
    if y + h > height:
        h = height - y
    return BoundingBox(x=x, y=y, w=max(1, w), h=max(1, h))


def _scale_start(size: int, ratio: float) -> int:
    return max(0, min(size - 1, round(size * ratio)))


def _scale_size(size: int, ratio: float) -> int:
    return max(1, round(size * ratio))
