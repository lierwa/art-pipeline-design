from __future__ import annotations

from pathlib import Path

from collections.abc import Iterable

from fastapi import HTTPException
from PIL import Image
from pydantic import ValidationError

from art_pipeline.candidates import box_iou, filter_detection_results
from art_pipeline.detection import DetectionProvider, DetectionResult
from art_pipeline.elements import BoundingBox, ElementRecord, next_element_id
from art_pipeline.masks import expand_bbox
from art_pipeline.provider_config import detection_filter_vocabulary
from art_pipeline.thumbnails import write_thumbnail


def collect_detection_results(
    provider: DetectionProvider,
    source_image: Image.Image,
    vocabulary: list[str],
) -> list[DetectionResult]:
    try:
        raw_results = provider.detect(source_image, vocabulary, ". ".join(vocabulary))
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Detection provider {provider.name!r} failed: {exc}",
        ) from exc

    results = validate_detection_results(source_image, raw_results)
    return [
        DetectionResult.model_validate(item)
        for item in filter_detection_results(
            [result.model_dump(mode="json") for result in results],
            detection_filter_vocabulary(vocabulary),
        )
    ]


def iter_detection_results(
    provider: DetectionProvider,
    source_image: Image.Image,
    vocabulary: list[str],
) -> Iterable[DetectionResult]:
    accepted_results: list[dict] = []
    stream_detect = getattr(provider, "stream_detect", None)
    try:
        if callable(stream_detect):
            raw_results = stream_detect(source_image, vocabulary, ". ".join(vocabulary))
        else:
            raw_results = collect_detection_results(provider, source_image, vocabulary)
        iterator = iter(raw_results)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Detection provider {provider.name!r} failed: {exc}",
        ) from exc

    index = 1
    while True:
        try:
            raw_result = next(iterator)
        except StopIteration:
            return
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Detection provider {provider.name!r} failed: {exc}",
            ) from exc

        result = validate_detection_result(source_image, raw_result, index)
        filtered = filter_detection_results(
            [result.model_dump(mode="json")],
            detection_filter_vocabulary(vocabulary),
        )
        index += 1
        if not filtered:
            continue
        candidate = filtered[0]
        # WHY: 流式写入后用户已经看到框出现；这里用“先到先保留”的增量 NMS，
        # 避免后续 chunk 触发同标签重复框替换，导致画布框闪烁或消失。
        if any(
            candidate["label"] == accepted["label"]
            and box_iou(candidate["bbox"], accepted["bbox"]) > 0.65
            for accepted in accepted_results
        ):
            continue
        accepted_results.append(candidate)
        yield DetectionResult.model_validate(candidate)


def detection_results_to_elements(
    workspace_root: Path,
    source_image: Image.Image,
    provider_name: str,
    results: list[DetectionResult],
) -> list[ElementRecord]:
    generated_elements: list[ElementRecord] = []
    next_index = 1
    for result in results:
        element_id = next_element_id(generated_elements, start=next_index)
        next_index = int(element_id.rsplit("_", 1)[1]) + 1
        generated_elements.append(
            detection_result_to_element(
                workspace_root,
                source_image,
                provider_name,
                result,
                element_id,
                len(generated_elements) + 1,
            )
        )
    return generated_elements


def detection_result_to_element(
    workspace_root: Path,
    source_image: Image.Image,
    provider_name: str,
    result: DetectionResult,
    element_id: str,
    layer: int,
) -> ElementRecord:
    bbox = expand_bbox(result.bbox, source_image.width, source_image.height)
    thumbnail_path = write_thumbnail(source_image, workspace_root, element_id, bbox)
    return ElementRecord(
        id=element_id,
        name=result.label,
        label=result.label,
        status="model_detected",
        mode="visible_only",
        bbox=bbox,
        layer=layer,
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
        results.append(validate_detection_result(source_image, raw_result, index))
    return results


def validate_detection_result(
    source_image: Image.Image,
    raw_result: object,
    index: int,
) -> DetectionResult:
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
    return result


def _validate_detection_bbox_bounds(
    source_image: Image.Image,
    bbox: BoundingBox,
) -> None:
    if bbox.x < 0 or bbox.y < 0:
        raise ValueError("bbox coordinates must be non-negative.")
    if bbox.x + bbox.w > source_image.width or bbox.y + bbox.h > source_image.height:
        raise ValueError("bbox must fit within the source image bounds.")
