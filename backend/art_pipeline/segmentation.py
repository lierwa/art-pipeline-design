from __future__ import annotations

from pathlib import Path
from typing import Literal, Protocol

from PIL import Image
from pydantic import BaseModel, Field

from art_pipeline.elements import BoundingBox, ElementRecord
from art_pipeline.extraction import BBOX_ALPHA_STRATEGY, extract_bbox_alpha
from art_pipeline.mask_refine import CoordinateSpace, MaskPoint


ExtractionStrategy = Literal["bbox_alpha", "sam2_subject"]

SAM2_UNAVAILABLE_DETAIL = "sam2_subject extraction is not available in this demo build."


class Sam2PointPrompt(MaskPoint):
    label: Literal["positive", "negative"]


class Sam2Prompt(BaseModel):
    """Future SAM2 prompts.

    Coordinates are interpreted in the declared coordinateSpace. Source
    coordinates are absolute pixels in the uploaded scene; canvas coordinates
    are local to the element canvas.
    """

    coordinateSpace: CoordinateSpace = "source"
    box: BoundingBox | None = None
    points: list[Sam2PointPrompt] = Field(default_factory=list)


class ExtractWorkspaceRequest(BaseModel):
    elementIds: list[str] | None = Field(default=None)
    strategy: ExtractionStrategy = BBOX_ALPHA_STRATEGY
    sam2Prompt: Sam2Prompt | None = None


class SegmentationUnavailableError(RuntimeError):
    pass


def extract_with_strategy(
    workspace_root: Path,
    source_image: Image.Image,
    element: ElementRecord,
    strategy: ExtractionStrategy,
    sam2_prompt: Sam2Prompt | None = None,
) -> dict:
    if strategy == "bbox_alpha":
        return extract_bbox_alpha(workspace_root, source_image, element)

    if strategy == "sam2_subject":
        return extract_sam2_subject(source_image, element, sam2_prompt)

    raise ValueError(f"Unsupported extraction strategy: {strategy}")


def extract_sam2_subject(
    source_image: Image.Image,
    element: ElementRecord,
    sam2_prompt: Sam2Prompt | None,
    adapter: Sam2Adapter | None = None,
) -> dict:
    sam2_adapter = adapter or UnavailableSam2SubjectAdapter()
    return sam2_adapter.extract(source_image, element, sam2_prompt)


class Sam2Adapter(Protocol):
    def extract(
        self,
        source_image: Image.Image,
        element: ElementRecord,
        prompt: Sam2Prompt | None,
    ) -> dict:
        ...


class UnavailableSam2SubjectAdapter:
    def extract(
        self,
        source_image: Image.Image,
        element: ElementRecord,
        prompt: Sam2Prompt | None,
    ) -> dict:
        _ = source_image
        _ = element
        if prompt is None:
            raise SegmentationUnavailableError(SAM2_UNAVAILABLE_DETAIL)

        raise SegmentationUnavailableError(
            f"{SAM2_UNAVAILABLE_DETAIL} Received prompt contract for 1 element(s)."
        )
