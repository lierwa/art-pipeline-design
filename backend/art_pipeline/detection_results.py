from __future__ import annotations

from pathlib import Path

from fastapi import HTTPException
from PIL import Image
from pydantic import ValidationError

from art_pipeline.detection import DetectionResult
from art_pipeline.elements import BoundingBox, ElementRecord, next_element_id
from art_pipeline.masks import expand_bbox
from art_pipeline.thumbnails import write_thumbnail


def detection_results_to_elements(
    workspace_root: Path,
    source_image: Image.Image,
    provider_name: str,
    results: list[DetectionResult],
) -> list[ElementRecord]:
    generated_elements: list[ElementRecord] = []
    next_index = 1
    for result in results:
        bbox = expand_bbox(result.bbox, source_image.width, source_image.height)
        element_id = next_element_id(generated_elements, start=next_index)
        next_index = int(element_id.rsplit("_", 1)[1]) + 1
        thumbnail_path = write_thumbnail(source_image, workspace_root, element_id, bbox)
        generated_elements.append(
            ElementRecord(
                id=element_id,
                name=result.label,
                label=result.label,
                status="model_detected",
                mode="visible_only",
                bbox=bbox,
                layer=len(generated_elements) + 1,
                thumbnail=thumbnail_path,
                mask=None,
                parentId=None,
                source="model_detection",
                sourceProvider=provider_name,
                sourcePrompt=result.sourcePrompt,
                notes="",
                visible=True,
                confidence=result.confidence,
            )
        )
    return generated_elements


def validate_detection_results(
    source_image: Image.Image,
    raw_results: object,
) -> list[DetectionResult]:
    if not isinstance(raw_results, list):
        raise HTTPException(
            status_code=502,
            detail="Invalid provider result: expected a list of detection results.",
        )

    results: list[DetectionResult] = []
    for index, raw_result in enumerate(raw_results, start=1):
        try:
            result = DetectionResult.model_validate(raw_result)
        except ValidationError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Invalid provider result at index {index}: {exc}",
            ) from exc

        try:
            _validate_detection_bbox_bounds(source_image, result.bbox)
        except ValueError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Invalid provider result at index {index}: {exc}",
            ) from exc
        results.append(result)
    return results


def _validate_detection_bbox_bounds(
    source_image: Image.Image,
    bbox: BoundingBox,
) -> None:
    if bbox.x < 0 or bbox.y < 0:
        raise ValueError("bbox coordinates must be non-negative.")
    if bbox.x + bbox.w > source_image.width or bbox.y + bbox.h > source_image.height:
        raise ValueError("bbox must fit within the source image bounds.")
