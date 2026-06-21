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

def test_sam2_subject_strategy_reports_unavailable(client: TestClient) -> None:
    upload_response = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_gradient_scene_bytes(), "image/png")},
    )
    assert upload_response.status_code == 200
    state_response = client.put(
        "/api/workspace/state",
        json={
            "source": {
                "filename": "original.png",
                "path": "source/original.png",
                "width": 8,
                "height": 6,
            },
            "elements": [
                {
                    "id": "element_001",
                    "name": "Cup",
                    "status": "accepted",
                    "mode": "visible_only",
                    "bbox": {"x": 3, "y": 2, "w": 2, "h": 2},
                    "canvas": {"x": 1, "y": 1, "w": 5, "h": 4},
                    "layer": 1,
                    "thumbnail": None,
                    "mask": None,
                    "parentId": None,
                    "source": "manual",
                    "notes": "",
                    "visible": True,
                    "confidence": None,
                }
            ],
        },
    )
    assert state_response.status_code == 200

    response = client.post(
        "/api/workspace/extract",
        json={"elementIds": ["element_001"], "strategy": "sam2_subject"},
    )

    assert response.status_code == 501
    assert response.json()["detail"] == "sam2_subject extraction is not available in this demo build."


def test_sam2_subject_prompt_contract_routes_through_adapter(client: TestClient) -> None:
    upload_response = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_gradient_scene_bytes(12, 10), "image/png")},
    )
    assert upload_response.status_code == 200

    state_response = client.put(
        "/api/workspace/state",
        json={
            "source": {
                "filename": "original.png",
                "path": "source/original.png",
                "width": 12,
                "height": 10,
            },
            "elements": [
                {
                    "id": "element_001",
                    "name": "Cup",
                    "status": "accepted",
                    "mode": "visible_only",
                    "bbox": {"x": 3, "y": 2, "w": 4, "h": 4},
                    "canvas": {"x": 1, "y": 1, "w": 8, "h": 7},
                    "layer": 1,
                    "thumbnail": None,
                    "mask": None,
                    "parentId": None,
                    "source": "manual",
                    "notes": "",
                    "visible": True,
                    "confidence": None,
                }
            ],
        },
    )
    assert state_response.status_code == 200

    response = client.post(
        "/api/workspace/extract",
        json={
            "elementIds": ["element_001"],
            "strategy": "sam2_subject",
            "sam2Prompt": {
                "coordinateSpace": "source",
                "box": {"x": 3, "y": 2, "w": 4, "h": 4},
                "points": [
                    {"x": 4, "y": 3, "label": "positive"},
                    {"x": 8, "y": 8, "label": "negative"},
                ],
            },
        },
    )

    assert response.status_code == 501
    assert response.json()["detail"] == (
        "sam2_subject extraction is not available in this demo build. "
        "Received prompt contract for 1 element(s)."
    )


def test_replace_mask_from_polygon_shape_writes_canvas_aligned_mask(
    client: TestClient,
    tmp_path: Path,
) -> None:
    upload_response = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_gradient_scene_bytes(12, 10), "image/png")},
    )
    assert upload_response.status_code == 200

    state_response = client.put(
        "/api/workspace/state",
        json={
            "source": {
                "filename": "original.png",
                "path": "source/original.png",
                "width": 12,
                "height": 10,
            },
            "elements": [
                {
                    "id": "element_001",
                    "name": "Cup",
                    "status": "accepted",
                    "mode": "visible_only",
                    "bbox": {"x": 3, "y": 2, "w": 4, "h": 4},
                    "canvas": {"x": 1, "y": 1, "w": 8, "h": 7},
                    "layer": 1,
                    "thumbnail": None,
                    "mask": None,
                    "parentId": None,
                    "source": "manual",
                    "notes": "",
                    "visible": True,
                    "confidence": None,
                }
            ],
        },
    )
    assert state_response.status_code == 200

    response = client.post(
        "/api/workspace/elements/element_001/mask/replace",
        json={
            "shape": {
                "type": "polygon",
                "coordinateSpace": "source",
                "points": [
                    {"x": 3, "y": 2},
                    {"x": 7, "y": 2},
                    {"x": 5, "y": 6},
                ],
            }
        },
    )

    assert response.status_code == 200
    element = response.json()["state"]["elements"][0]
    assert element["status"] == "extract_ready"
    assert element["mask"] == "elements/element_001/mask.png"

    mask_path = tmp_path / "workspace" / "elements" / "element_001" / "mask.png"
    assert mask_path.exists()
    with Image.open(mask_path) as mask:
        assert mask.mode == "L"
        assert mask.size == (8, 7)
        assert mask.getbbox() is not None
        assert mask.getpixel((0, 0)) == 0
        assert mask.getpixel((4, 3)) == 255


def test_extract_reuses_replaced_polygon_mask_for_bbox_alpha(
    client: TestClient,
    tmp_path: Path,
) -> None:
    upload_response = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_gradient_scene_bytes(12, 10), "image/png")},
    )
    assert upload_response.status_code == 200

    state_response = client.put(
        "/api/workspace/state",
        json={
            "source": {
                "filename": "original.png",
                "path": "source/original.png",
                "width": 12,
                "height": 10,
            },
            "elements": [
                {
                    "id": "element_001",
                    "name": "Cup",
                    "status": "accepted",
                    "mode": "visible_only",
                    "bbox": {"x": 3, "y": 2, "w": 4, "h": 4},
                    "canvas": {"x": 1, "y": 1, "w": 8, "h": 7},
                    "layer": 1,
                    "thumbnail": None,
                    "mask": None,
                    "parentId": None,
                    "source": "manual",
                    "notes": "",
                    "visible": True,
                    "confidence": None,
                }
            ],
        },
    )
    assert state_response.status_code == 200

    replace_response = client.post(
        "/api/workspace/elements/element_001/mask/replace",
        json={
            "shape": {
                "type": "polygon",
                "coordinateSpace": "source",
                "points": [
                    {"x": 3, "y": 2},
                    {"x": 7, "y": 2},
                    {"x": 5, "y": 6},
                ],
            }
        },
    )
    assert replace_response.status_code == 200

    response = client.post(
        "/api/workspace/extract",
        json={"elementIds": ["element_001"], "strategy": "bbox_alpha"},
    )

    assert response.status_code == 200
    element_dir = tmp_path / "workspace" / "elements" / "element_001"
    outside_polygon_inside_bbox = (2, 4)
    inside_polygon = (4, 3)

    with Image.open(element_dir / "mask.png") as mask:
        assert mask.mode == "L"
        assert mask.size == (8, 7)
        assert mask.getpixel(outside_polygon_inside_bbox) == 0
        assert mask.getpixel(inside_polygon) == 255

    with Image.open(tmp_path / "workspace" / "source" / "original.png") as source:
        with Image.open(element_dir / "asset_incomplete.png") as asset:
            assert asset.size == (8, 7)
            assert asset.getpixel(outside_polygon_inside_bbox)[3] == 0
            assert asset.getpixel(inside_polygon) == source.getpixel((5, 4))


def test_clear_mask_removes_extraction_outputs_and_marks_element_ready(
    client: TestClient,
    tmp_path: Path,
) -> None:
    upload_response = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_gradient_scene_bytes(), "image/png")},
    )
    assert upload_response.status_code == 200

    state_response = client.put(
        "/api/workspace/state",
        json={
            "source": {
                "filename": "original.png",
                "path": "source/original.png",
                "width": 8,
                "height": 6,
            },
            "elements": [
                {
                    "id": "element_001",
                    "name": "Cup",
                    "status": "accepted",
                    "mode": "visible_only",
                    "bbox": {"x": 3, "y": 2, "w": 2, "h": 2},
                    "canvas": {"x": 1, "y": 1, "w": 5, "h": 4},
                    "layer": 1,
                    "thumbnail": None,
                    "mask": None,
                    "parentId": None,
                    "source": "manual",
                    "notes": "",
                    "visible": True,
                    "confidence": None,
                }
            ],
        },
    )
    assert state_response.status_code == 200
    extract_response = client.post(
        "/api/workspace/extract",
        json={"elementIds": ["element_001"], "strategy": "bbox_alpha"},
    )
    assert extract_response.status_code == 200
    assert (tmp_path / "workspace" / "elements" / "element_001" / "mask.png").exists()
    assert (
        tmp_path / "workspace" / "elements" / "element_001" / "asset_incomplete.png"
    ).exists()

    response = client.post("/api/workspace/elements/element_001/mask/clear")

    assert response.status_code == 200
    element = response.json()["state"]["elements"][0]
    assert element["status"] == "extract_ready"
    assert element["mask"] is None
    assert not (tmp_path / "workspace" / "elements" / "element_001" / "mask.png").exists()
    assert not (
        tmp_path / "workspace" / "elements" / "element_001" / "asset_incomplete.png"
    ).exists()


def test_clear_mask_clears_stale_repair_artifacts_and_resets_repair_state(
    client: TestClient,
    tmp_path: Path,
) -> None:
    element_dir = _prepare_repair_package(client, tmp_path)
    repair_dir = element_dir / "repair"
    validate_response = _validate_repair_package_with_missing_pixel(client, repair_dir)
    repaired_element = validate_response.json()["state"]["elements"][0]
    assert repaired_element["repairStatus"] == "repair_complete"
    assert repaired_element["exportStatus"] == "ready"
    assert (element_dir / "missing_mask.png").exists()
    assert repair_dir.exists()

    response = client.post("/api/workspace/elements/element_001/mask/clear")

    assert response.status_code == 200
    element = response.json()["state"]["elements"][0]
    assert element["status"] == "extract_ready"
    assert element["mode"] == "needs_completion"
    assert element["mask"] is None
    assert element["repairStatus"] == "required"
    assert element["exportStatus"] == "blocked"
    assert not (element_dir / "missing_mask.png").exists()
    assert not repair_dir.exists()


def test_clear_mask_rejects_path_like_element_id_without_deleting_outside(
    client: TestClient,
    tmp_path: Path,
) -> None:
    outside_dir = tmp_path / "outside"
    outside_dir.mkdir()
    outside_mask = outside_dir / "mask.png"
    outside_mask.write_text("keep me", encoding="utf-8")

    response = client.post("/api/workspace/elements/..%2F..%2Foutside/mask/clear")

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "Element id '../../outside' must be a slug containing only letters, "
        "numbers, underscores, and hyphens."
    )
    assert outside_mask.read_text(encoding="utf-8") == "keep me"


def test_empty_mask_validation_fails_clearly() -> None:
    from art_pipeline.mask_refine import validate_non_empty_mask

    empty_mask = Image.new("L", (3, 2), 0)

    with pytest.raises(ValueError, match="Mask for element element_001 is empty."):
        validate_non_empty_mask("element_001", empty_mask)



