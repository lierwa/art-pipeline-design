from typing import get_args

from art_pipeline.candidates import CandidateStatus, edit_candidate_box
from art_pipeline.elements import (
    BoundingBox,
    CandidateHistoryEntry,
    CanvasBox,
    ElementRecord,
)


def test_candidate_status_remains_candidate_only() -> None:
    statuses = set(get_args(CandidateStatus))

    assert "model_detected" in statuses
    assert "edited" in statuses
    assert "exported" in statuses
    assert "proposal" not in statuses
    assert "repair_pending" not in statuses


def test_element_record_defaults_to_model_detected_status() -> None:
    candidate = ElementRecord(
        id="element_001",
        name="cabinet",
        bbox=BoundingBox(x=10, y=20, w=100, h=120),
    )

    assert candidate.status == "model_detected"


def test_element_record_accepts_legacy_status_during_migration() -> None:
    candidate = ElementRecord(
        id="element_001",
        name="cabinet",
        status="proposal",
        bbox=BoundingBox(x=10, y=20, w=100, h=120),
    )

    assert candidate.status == "proposal"


def test_edit_candidate_box_preserves_model_box_in_history() -> None:
    existing_history = CandidateHistoryEntry(
        kind="model_detected",
        before={},
        after={"status": "model_detected"},
    )
    candidate = ElementRecord(
        id="element_001",
        name="cabinet",
        label="cabinet",
        status="model_detected",
        bbox=BoundingBox(x=10, y=20, w=100, h=120),
        sourceProvider="grounding_dino",
        sourcePrompt="cabinet",
        confidence=0.88,
        history=[existing_history],
    )

    edited = edit_candidate_box(
        candidate,
        BoundingBox(x=12, y=24, w=110, h=126),
        reason="manual_box_edit",
    )

    assert edited.status == "edited"
    assert edited.bbox.model_dump() == {"x": 12, "y": 24, "w": 110, "h": 126}
    assert isinstance(edited.canvas, CanvasBox)
    assert edited.canvas.model_dump() == {"x": 12, "y": 24, "w": 110, "h": 126}
    assert edited.history[0] == existing_history
    assert len(edited.history) == 2

    latest_history = edited.history[-1]
    assert latest_history.kind == "manual_box_edit"
    assert latest_history.before == {
        "bbox": {"x": 10, "y": 20, "w": 100, "h": 120},
        "label": "cabinet",
        "status": "model_detected",
    }
    assert latest_history.after == {
        "bbox": {"x": 12, "y": 24, "w": 110, "h": 126},
        "label": "cabinet",
        "status": "edited",
    }
    assert candidate.status == "model_detected"
    assert candidate.bbox.model_dump() == {"x": 10, "y": 20, "w": 100, "h": 120}
    assert candidate.history == [existing_history]
