from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import art_pipeline.api as workspace_api
import art_pipeline.exporting.exporter as workspace_exporter
from art_pipeline.elements import DEFAULT_WORKSPACE_VOCABULARY, EXPANDED_DEFAULT_WORKSPACE_VOCABULARY
from workspace_api_helpers import (
    CORE_OBJECT_WORKSPACE_VOCABULARY,
    client,
    make_gradient_scene_bytes,
    make_png_bytes,
    make_synthetic_scene_bytes,
    _prepare_completion_element,
    _prepare_repair_package,
    _promote_visible_element_to_sam2_accepted,
    _validate_repair_package_with_missing_pixel,
)

def test_create_manual_element_persists_defaults_and_thumbnail(
    client: TestClient,
    tmp_path: Path,
) -> None:
    upload_response = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_synthetic_scene_bytes(), "image/png")},
    )
    assert upload_response.status_code == 200

    response = client.post(
        "/api/workspace/elements",
        json={
            "name": "Sink Edge",
            "bbox": {"x": 20, "y": 18, "w": 24, "h": 16},
        },
    )

    assert response.status_code == 200
    body = response.json()
    created = body["element"]
    assert created["name"] == "Sink Edge"
    assert created["status"] == "accepted"
    assert created["mode"] == "visible_only"
    assert created["bbox"] == {"x": 20, "y": 18, "w": 24, "h": 16}
    assert created["canvas"] == {"x": 12, "y": 10, "w": 40, "h": 32}
    assert created["layer"] == 1
    assert created["parentId"] is None
    assert created["visible"] is True
    assert created["source"] == "manual"

    thumb_path = tmp_path / "workspace" / created["thumbnail"]
    assert thumb_path.exists()
    with Image.open(thumb_path) as thumb:
        assert thumb.size == (24, 16)

    state_payload = workspace_api.json.loads(
        (tmp_path / "workspace" / "state.json").read_text(encoding="utf-8")
    )
    assert state_payload["elements"] == body["state"]["elements"]


def test_patch_element_updates_box_and_status(client: TestClient) -> None:
    state = {
        "source": {"filename": "original.png", "path": "source/original.png", "width": 120, "height": 90},
        "elements": [
            {
                "id": "element_001",
                "name": "cabinet",
                "label": "cabinet",
                "status": "model_detected",
                "bbox": {"x": 10, "y": 20, "w": 30, "h": 40},
                "sourceProvider": "test_provider",
                "sourcePrompt": "cabinet",
                "confidence": 0.88,
            }
        ],
    }
    assert client.put("/api/workspace/state", json=state).status_code == 200

    response = client.patch(
        "/api/workspace/elements/element_001",
        json={"bbox": {"x": 12, "y": 22, "w": 35, "h": 45}, "label": "bathroom cabinet"},
    )

    assert response.status_code == 200
    element = response.json()["state"]["elements"][0]
    assert response.json()["element"] == element
    assert element["status"] == "edited"
    assert element["label"] == "bathroom cabinet"
    assert element["bbox"] == {"x": 12, "y": 22, "w": 35, "h": 45}
    assert element["history"][-1]["kind"] == "manual_edit"
    assert element["history"][-1]["before"] == {
        "bbox": {"x": 10, "y": 20, "w": 30, "h": 40},
        "label": "cabinet",
        "status": "model_detected",
    }
    assert element["history"][-1]["after"] == {
        "bbox": {"x": 12, "y": 22, "w": 35, "h": 45},
        "label": "bathroom cabinet",
        "status": "edited",
    }


def test_patch_element_visibility_does_not_mark_edited(client: TestClient) -> None:
    state = {
        "source": {"filename": "original.png", "path": "source/original.png", "width": 120, "height": 90},
        "elements": [
            {
                "id": "element_001",
                "name": "cabinet",
                "label": "cabinet",
                "status": "model_detected",
                "bbox": {"x": 10, "y": 20, "w": 30, "h": 40},
                "sourceProvider": "test_provider",
                "sourcePrompt": "cabinet",
                "confidence": 0.88,
            }
        ],
    }
    assert client.put("/api/workspace/state", json=state).status_code == 200

    response = client.patch(
        "/api/workspace/elements/element_001",
        json={"visible": False},
    )

    assert response.status_code == 200
    element = response.json()["element"]
    assert element["status"] == "model_detected"
    assert element["visible"] is False
    assert element["history"] == []


def test_patch_element_rejects_empty_body(client: TestClient) -> None:
    state = {
        "source": {"filename": "original.png", "path": "source/original.png", "width": 120, "height": 90},
        "elements": [
            {
                "id": "element_001",
                "name": "cabinet",
                "label": "cabinet",
                "status": "model_detected",
                "bbox": {"x": 10, "y": 20, "w": 30, "h": 40},
            }
        ],
    }
    assert client.put("/api/workspace/state", json=state).status_code == 200

    response = client.patch("/api/workspace/elements/element_001", json={})

    assert response.status_code == 400
    assert response.json()["detail"] == "Provide at least one element update."


def test_patch_element_rejects_bbox_out_of_source_bounds(client: TestClient) -> None:
    state = {
        "source": {"filename": "original.png", "path": "source/original.png", "width": 120, "height": 90},
        "elements": [
            {
                "id": "element_001",
                "name": "cabinet",
                "label": "cabinet",
                "status": "model_detected",
                "bbox": {"x": 10, "y": 20, "w": 30, "h": 40},
            }
        ],
    }
    assert client.put("/api/workspace/state", json=state).status_code == 200

    response = client.patch(
        "/api/workspace/elements/element_001",
        json={"bbox": {"x": 100, "y": 20, "w": 30, "h": 40}},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Element element_001 bbox must stay within source bounds."


def test_invalid_patch_bbox_does_not_rewrite_thumbnail(
    client: TestClient,
    tmp_path: Path,
) -> None:
    upload_response = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_synthetic_scene_bytes(), "image/png")},
    )
    assert upload_response.status_code == 200
    create_response = client.post(
        "/api/workspace/elements",
        json={"name": "Cabinet", "bbox": {"x": 12, "y": 16, "w": 30, "h": 32}},
    )
    assert create_response.status_code == 200
    element = create_response.json()["element"]
    thumbnail_path = tmp_path / "workspace" / element["thumbnail"]
    before_thumbnail = thumbnail_path.read_bytes()

    response = client.patch(
        f"/api/workspace/elements/{element['id']}",
        json={"bbox": {"x": 110, "y": 16, "w": 30, "h": 32}},
    )

    assert response.status_code == 400
    assert thumbnail_path.read_bytes() == before_thumbnail


def test_post_child_element_preserves_parent(
    client: TestClient,
    tmp_path: Path,
) -> None:
    upload_response = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_synthetic_scene_bytes(), "image/png")},
    )
    assert upload_response.status_code == 200
    state = {
        "source": {"filename": "original.png", "path": "source/original.png", "width": 120, "height": 90},
        "elements": [
            {
                "id": "element_001",
                "name": "shelf",
                "label": "shelf",
                "status": "model_detected",
                "bbox": {"x": 10, "y": 12, "w": 90, "h": 60},
                "sourceProvider": "test_provider",
                "sourcePrompt": "shelf",
                "confidence": 0.91,
            }
        ],
    }
    assert client.put("/api/workspace/state", json=state).status_code == 200

    response = client.post(
        "/api/workspace/elements/element_001/children",
        json={"label": "plant", "bbox": {"x": 24, "y": 20, "w": 18, "h": 24}},
    )

    assert response.status_code == 200
    body = response.json()
    child = body["element"]
    by_id = {element["id"]: element for element in body["state"]["elements"]}
    parent = by_id["element_001"]
    assert parent["status"] == "model_detected"
    assert parent["bbox"] == {"x": 10, "y": 12, "w": 90, "h": 60}

    assert child["id"] in by_id
    assert child["status"] == "child"
    assert child["parentId"] == "element_001"
    assert child["label"] == "plant"
    assert child["name"] == "plant"
    assert child["source"] == "manual_child"
    assert child["sourceProvider"] == "manual"
    assert child["sourcePrompt"] == "plant"
    assert child["confidence"] is None
    assert child["visible"] is True
    thumb_path = tmp_path / "workspace" / child["thumbnail"]
    assert thumb_path.exists()


def test_post_child_element_rejects_bbox_outside_parent(client: TestClient) -> None:
    upload_response = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_synthetic_scene_bytes(), "image/png")},
    )
    assert upload_response.status_code == 200
    state = {
        "source": {"filename": "original.png", "path": "source/original.png", "width": 120, "height": 90},
        "elements": [
            {
                "id": "element_001",
                "name": "shelf",
                "label": "shelf",
                "status": "model_detected",
                "bbox": {"x": 10, "y": 12, "w": 30, "h": 30},
            }
        ],
    }
    assert client.put("/api/workspace/state", json=state).status_code == 200

    response = client.post(
        "/api/workspace/elements/element_001/children",
        json={"label": "plant", "bbox": {"x": 35, "y": 20, "w": 18, "h": 24}},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Child bbox must stay within parent bbox."


def test_merge_elements_creates_union_and_marks_sources(
    client: TestClient,
    tmp_path: Path,
) -> None:
    upload_response = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_synthetic_scene_bytes(), "image/png")},
    )
    assert upload_response.status_code == 200
    state = {
        "source": {"filename": "original.png", "path": "source/original.png", "width": 120, "height": 90},
        "elements": [
            {
                "id": "element_001",
                "name": "left cabinet",
                "label": "left cabinet",
                "status": "model_detected",
                "bbox": {"x": 10, "y": 20, "w": 30, "h": 40},
                "sourceProvider": "test_provider",
                "sourcePrompt": "cabinet",
                "confidence": 0.88,
            },
            {
                "id": "element_002",
                "name": "right cabinet",
                "label": "right cabinet",
                "status": "edited",
                "bbox": {"x": 35, "y": 15, "w": 20, "h": 30},
                "sourceProvider": "test_provider",
                "sourcePrompt": "cabinet",
                "confidence": 0.82,
            },
        ],
    }
    assert client.put("/api/workspace/state", json=state).status_code == 200

    response = client.post(
        "/api/workspace/elements/merge",
        json={"elementIds": ["element_001", "element_002"], "label": "cabinet items"},
    )

    assert response.status_code == 200
    body = response.json()
    merged = body["element"]
    by_id = {element["id"]: element for element in body["state"]["elements"]}

    assert merged["bbox"] == {"x": 8, "y": 13, "w": 49, "h": 49}
    assert merged["status"] == "merged"
    assert merged["source"] == "manual_merge"
    assert merged["sourceProvider"] == "manual"
    assert merged["label"] == "cabinet items"
    assert merged["name"] == "cabinet items"
    assert merged["confidence"] is None
    assert merged["mergedInto"] is None
    assert merged["history"][-1]["kind"] == "manual_merge"
    assert merged["history"][-1]["before"]["sourceIds"] == ["element_001", "element_002"]
    assert by_id["element_001"]["status"] == "model_detected"
    assert by_id["element_001"]["visible"] is False
    assert by_id["element_001"]["mergedInto"] == merged["id"]
    assert by_id["element_001"]["history"][-1]["kind"] == "manual_merge"
    assert by_id["element_001"]["history"][-1]["after"]["mergedInto"] == merged["id"]
    assert by_id["element_002"]["status"] == "edited"
    assert by_id["element_002"]["visible"] is False
    assert by_id["element_002"]["mergedInto"] == merged["id"]
    assert by_id["element_002"]["history"][-1]["kind"] == "manual_merge"
    assert by_id["element_002"]["history"][-1]["after"]["mergedInto"] == merged["id"]
    thumb_path = tmp_path / "workspace" / merged["thumbnail"]
    assert thumb_path.exists()


def test_merge_elements_rejects_one_id(client: TestClient) -> None:
    upload_response = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_synthetic_scene_bytes(), "image/png")},
    )
    assert upload_response.status_code == 200

    response = client.post(
        "/api/workspace/elements/merge",
        json={"elementIds": ["element_001"]},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Select at least two elements to merge."


def test_merge_elements_rejects_duplicate_ids(client: TestClient) -> None:
    upload_response = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_synthetic_scene_bytes(), "image/png")},
    )
    assert upload_response.status_code == 200

    response = client.post(
        "/api/workspace/elements/merge",
        json={"elementIds": ["element_001", "element_001"]},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Element ids to merge must be unique."


def test_merge_elements_rejects_missing_id(client: TestClient) -> None:
    upload_response = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_synthetic_scene_bytes(), "image/png")},
    )
    assert upload_response.status_code == 200
    state = {
        "source": {"filename": "original.png", "path": "source/original.png", "width": 120, "height": 90},
        "elements": [
            {
                "id": "element_001",
                "name": "left cabinet",
                "label": "left cabinet",
                "status": "model_detected",
                "bbox": {"x": 10, "y": 20, "w": 30, "h": 40},
            },
        ],
    }
    assert client.put("/api/workspace/state", json=state).status_code == 200

    response = client.post(
        "/api/workspace/elements/merge",
        json={"elementIds": ["element_001", "element_404"]},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Element not found."


def test_merge_route_invalid_body_returns_merge_validation_error(client: TestClient) -> None:
    upload_response = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_synthetic_scene_bytes(), "image/png")},
    )
    assert upload_response.status_code == 200

    response = client.post("/api/workspace/elements/merge", json={})

    assert response.status_code == 400
    assert response.json()["detail"] == "Select at least two elements to merge."



