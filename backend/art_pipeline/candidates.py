from __future__ import annotations

from typing import Literal

from art_pipeline.elements import BoundingBox, CandidateHistoryEntry, CanvasBox, ElementRecord


CandidateStatus = Literal[
    "model_detected",
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
            and _box_iou(item["bbox"], existing["bbox"]) > nms_iou_threshold
            for existing in kept
        ):
            continue
        kept.append(item)
    return kept


def _box_iou(left: dict, right: dict) -> float:
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
    before = candidate.model_dump(mode="json")
    canvas = CanvasBox(**bbox.model_dump())
    edited = candidate.model_copy(
        update={
            "bbox": bbox,
            "canvas": canvas,
            "status": "edited",
        }
    )
    after = edited.model_dump(mode="json")
    history = [
        *candidate.history,
        CandidateHistoryEntry(
            kind=reason,
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
