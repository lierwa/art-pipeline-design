from __future__ import annotations

from pathlib import Path
from typing import Literal

from PIL import Image

from art_pipeline.elements import (
    BoundingBox,
    CandidateHistoryEntry,
    CanvasBox,
    ElementRecord,
    next_element_id,
)
from art_pipeline.masks import expand_bbox, expand_canvas
from art_pipeline.thumbnails import write_thumbnail


CandidateStatus = Literal[
    "model_detected",
    "click_detected",
    "edited",
    "child",
    "merged",
    "accepted",
    "rejected",
    "exported",
]


GENERIC_LABELS = {
    "bathroom",
    "room",
    "wall",
    "floor",
    "object",
    "furniture",
    "background",
}


def filter_detection_results(
    raw_results: list[dict],
    vocabulary: list[str],
    min_confidence: float = 0.45,
    nms_iou_threshold: float = 0.65,
) -> list[dict]:
    vocab = {label.strip().lower() for label in vocabulary}
    filtered = []
    for item in raw_results:
        label = str(item["label"]).strip().lower()
        if label in GENERIC_LABELS:
            continue
        if label not in vocab:
            continue
        if float(item["confidence"]) < min_confidence:
            continue
        filtered.append(
            {**item, "label": label, "confidence": float(item["confidence"])}
        )
    filtered.sort(key=lambda item: item["confidence"], reverse=True)

    kept: list[dict] = []
    for item in filtered:
        if any(
            item["label"] == existing["label"]
            and box_iou(item["bbox"], existing["bbox"]) > nms_iou_threshold
            for existing in kept
        ):
            continue
        kept.append(item)
    return kept


def box_iou(left: dict, right: dict) -> float:
    left_x1 = left["x"]
    left_y1 = left["y"]
    left_x2 = left["x"] + left["w"]
    left_y2 = left["y"] + left["h"]
    right_x1 = right["x"]
    right_y1 = right["y"]
    right_x2 = right["x"] + right["w"]
    right_y2 = right["y"] + right["h"]
    intersection_x1 = max(left_x1, right_x1)
    intersection_y1 = max(left_y1, right_y1)
    intersection_x2 = min(left_x2, right_x2)
    intersection_y2 = min(left_y2, right_y2)
    if intersection_x2 <= intersection_x1 or intersection_y2 <= intersection_y1:
        return 0.0
    intersection = (intersection_x2 - intersection_x1) * (
        intersection_y2 - intersection_y1
    )
    left_area = left["w"] * left["h"]
    right_area = right["w"] * right["h"]
    return intersection / (left_area + right_area - intersection)


def edit_candidate_box(
    candidate: ElementRecord,
    bbox: BoundingBox,
    reason: str = "manual_box_edit",
) -> ElementRecord:
    return edit_candidate(candidate, bbox=bbox, history_kind=reason, force_history=True)


def edit_candidate(
    candidate: ElementRecord,
    *,
    bbox: BoundingBox | None = None,
    label: str | None = None,
    visible: bool | None = None,
    history_kind: str = "manual_edit",
    force_history: bool = False,
) -> ElementRecord:
    before = candidate.model_dump(mode="json")
    updates = {}
    if bbox is not None:
        updates["bbox"] = bbox
        updates["canvas"] = CanvasBox(**bbox.model_dump())
    if label is not None:
        updates["name"] = label
        updates["label"] = label
    if visible is not None:
        updates["visible"] = visible
    content_changed = _candidate_content_changed(candidate, bbox, label)
    if content_changed or force_history:
        updates["status"] = "edited"

    edited = candidate.model_copy(update=updates)
    if not content_changed and not force_history:
        return edited

    after = edited.model_dump(mode="json")
    history = [
        *candidate.history,
        CandidateHistoryEntry(
            kind=history_kind,
            before={
                "bbox": before["bbox"],
                "label": before.get("label"),
                "status": before["status"],
            },
            after={
                "bbox": after["bbox"],
                "label": after.get("label"),
                "status": after["status"],
            },
        ),
    ]
    return edited.model_copy(update={"history": history})


def add_candidate_child(
    workspace_root: Path,
    state_elements: list[ElementRecord],
    source_image: Image.Image,
    parent: ElementRecord,
    label: str,
    bbox: BoundingBox,
) -> ElementRecord:
    _validate_non_empty_bbox(bbox)
    if not _contains_bbox(parent.bbox, bbox):
        raise ValueError("Child bbox must stay within parent bbox.")

    element_id = _next_candidate_id(state_elements)
    thumbnail_path = write_thumbnail(source_image, workspace_root, element_id, bbox)
    return ElementRecord(
        id=element_id,
        name=label,
        label=label,
        status="child",
        mode="visible_only",
        bbox=bbox,
        canvas=expand_canvas(bbox, source_image.width, source_image.height),
        layer=_next_layer(state_elements),
        thumbnail=thumbnail_path,
        mask=None,
        parentId=parent.id,
        source="manual_child",
        sourceProvider="manual",
        sourcePrompt=label,
        notes="",
        visible=True,
        confidence=None,
    )


def merge_candidates(
    workspace_root: Path,
    state_elements: list[ElementRecord],
    source_image: Image.Image,
    source_elements: list[ElementRecord],
    label: str,
) -> ElementRecord:
    if len(source_elements) < 2:
        raise ValueError("Select at least two elements to merge.")

    bbox = expand_bbox(union_bbox(source_elements), source_image.width, source_image.height)
    element_id = _next_candidate_id(state_elements)
    thumbnail_path = write_thumbnail(source_image, workspace_root, element_id, bbox)
    source_ids = [element.id for element in source_elements]
    merged = ElementRecord(
        id=element_id,
        name=label,
        label=label,
        status="merged",
        mode="visible_only",
        bbox=bbox,
        canvas=expand_canvas(bbox, source_image.width, source_image.height),
        layer=_next_layer(state_elements),
        thumbnail=thumbnail_path,
        mask=None,
        parentId=None,
        source="manual_merge",
        sourceProvider="manual",
        sourcePrompt=label,
        notes="",
        visible=True,
        confidence=None,
    )
    return merged.model_copy(
        update={
            "history": [
                CandidateHistoryEntry(
                    kind="manual_merge",
                    before={"sourceIds": source_ids},
                    after={
                        "bbox": bbox.model_dump(mode="json"),
                        "label": label,
                        "status": "merged",
                    },
                )
            ]
        }
    )


def mark_candidate_merged(
    candidate: ElementRecord,
    merged_element_id: str,
) -> ElementRecord:
    before = candidate.model_dump(mode="json")
    marked = candidate.model_copy(
        update={
            "visible": False,
            "mergedInto": merged_element_id,
        }
    )
    return marked.model_copy(
        update={
            "history": [
                *candidate.history,
                CandidateHistoryEntry(
                    kind="manual_merge",
                    before={
                        "status": before["status"],
                        "visible": before["visible"],
                        "mergedInto": before.get("mergedInto"),
                    },
                    after={
                        "status": marked.status,
                        "visible": marked.visible,
                        "mergedInto": marked.mergedInto,
                    },
                ),
            ]
        }
    )


def union_bbox(elements: list[ElementRecord]) -> BoundingBox:
    if not elements:
        raise ValueError("Select at least one element.")

    left = min(element.bbox.x for element in elements)
    top = min(element.bbox.y for element in elements)
    right = max(element.bbox.x + element.bbox.w for element in elements)
    bottom = max(element.bbox.y + element.bbox.h for element in elements)
    return BoundingBox(x=left, y=top, w=right - left, h=bottom - top)


def _candidate_content_changed(
    candidate: ElementRecord,
    bbox: BoundingBox | None,
    label: str | None,
) -> bool:
    return (bbox is not None and not _boxes_equal(candidate.bbox, bbox)) or (
        label is not None and candidate.label != label
    )


def _boxes_equal(left: BoundingBox | CanvasBox, right: BoundingBox | CanvasBox) -> bool:
    return (
        left.x == right.x
        and left.y == right.y
        and left.w == right.w
        and left.h == right.h
    )


def _contains_bbox(outer: BoundingBox, inner: BoundingBox) -> bool:
    return (
        outer.x <= inner.x
        and outer.y <= inner.y
        and outer.x + outer.w >= inner.x + inner.w
        and outer.y + outer.h >= inner.y + inner.h
    )


def _validate_non_empty_bbox(bbox: BoundingBox) -> None:
    if bbox.w <= 0 or bbox.h <= 0:
        raise ValueError("Bounding box must cover at least one pixel.")


def _next_candidate_id(elements: list[ElementRecord]) -> str:
    return next_element_id(elements)


def _next_layer(elements: list[ElementRecord]) -> int:
    if not elements:
        return 1
    return max(element.layer for element in elements) + 1
