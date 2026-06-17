from art_pipeline.candidates import (
    CandidateStatus,
    edit_candidate_box,
)
from art_pipeline.elements import BoundingBox, CandidateHistoryEntry, ElementRecord


def test_edit_candidate_box_preserves_model_box_in_history() -> None:
    candidate = ElementRecord(
        id="element_001",
        name="cabinet",
        label="cabinet",
        status="model_detected",
        bbox=BoundingBox(x=10, y=20, w=100, h=120),
        sourceProvider="grounding_dino",
        sourcePrompt="cabinet",
        confidence=0.88,
    )

    edited = edit_candidate_box(
        candidate,
        BoundingBox(x=12, y=24, w=110, h=126),
        reason="manual_box_edit",
    )

    assert edited.status == "edited"
    assert edited.bbox.model_dump() == {"x": 12, "y": 24, "w": 110, "h": 126}
    assert edited.history[-1].kind == "manual_box_edit"
    assert edited.history[-1].before["bbox"] == {"x": 10, "y": 20, "w": 100, "h": 120}
