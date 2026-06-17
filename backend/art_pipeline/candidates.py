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
