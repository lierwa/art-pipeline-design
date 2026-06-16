from __future__ import annotations

from pathlib import Path
from typing import Literal

from PIL import Image
from pydantic import BaseModel, Field

from art_pipeline.elements import ElementRecord
from art_pipeline.extraction import BBOX_ALPHA_STRATEGY, extract_bbox_alpha


ExtractionStrategy = Literal["bbox_alpha", "sam2_subject"]

SAM2_UNAVAILABLE_DETAIL = "sam2_subject extraction is not available in this demo build."


class ExtractWorkspaceRequest(BaseModel):
    elementIds: list[str] | None = Field(default=None)
    strategy: ExtractionStrategy = BBOX_ALPHA_STRATEGY


class SegmentationUnavailableError(RuntimeError):
    pass


def extract_with_strategy(
    workspace_root: Path,
    source_image: Image.Image,
    element: ElementRecord,
    strategy: ExtractionStrategy,
) -> dict:
    if strategy == "bbox_alpha":
        return extract_bbox_alpha(workspace_root, source_image, element)

    if strategy == "sam2_subject":
        raise SegmentationUnavailableError(SAM2_UNAVAILABLE_DETAIL)

    raise ValueError(f"Unsupported extraction strategy: {strategy}")
