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

def test_extract_selected_element_writes_mask_asset_and_metadata(
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

    response = client.post(
        "/api/workspace/extract",
        json={"elementIds": ["element_001"], "strategy": "bbox_alpha"},
    )

    assert response.status_code == 200
    payload = response.json()
    extracted = payload["extractions"][0]
    assert extracted["elementId"] == "element_001"
    assert extracted["strategy"] == "bbox_alpha"
    assert extracted["maskPath"] == "elements/element_001/mask.png"
    assert extracted["assetPath"] == "elements/element_001/asset_incomplete.png"

    element = payload["state"]["elements"][0]
    assert element["status"] == "extracted"
    assert element["mask"] == "elements/element_001/mask.png"

    element_dir = tmp_path / "workspace" / "elements" / "element_001"
    mask_path = element_dir / "mask.png"
    asset_path = element_dir / "asset_incomplete.png"
    metadata_path = element_dir / "extraction.json"
    assert mask_path.exists()
    assert asset_path.exists()
    assert metadata_path.exists()

    metadata = workspace_api.json.loads(metadata_path.read_text(encoding="utf-8"))
    assert metadata["elementId"] == "element_001"
    assert metadata["sourcePixelsOnly"] is True
    assert metadata["canvas"] == {"x": 1, "y": 1, "w": 5, "h": 4}
    assert metadata["bbox"] == {"x": 3, "y": 2, "w": 2, "h": 2}

    with Image.open(mask_path) as mask:
        assert mask.mode == "L"
        assert mask.size == (5, 4)
        assert mask.getpixel((0, 0)) == 0
        assert mask.getpixel((2, 1)) == 255
        assert mask.getpixel((3, 2)) == 255

    with Image.open(tmp_path / "workspace" / "source" / "original.png") as source:
        with Image.open(asset_path) as asset:
            assert asset.mode == "RGBA"
            assert asset.size == (5, 4)
            assert asset.getpixel((0, 0))[3] == 0
            for local_x in range(5):
                for local_y in range(4):
                    absolute = (1 + local_x, 1 + local_y)
                    pixel = asset.getpixel((local_x, local_y))
                    if 2 <= local_x <= 3 and 1 <= local_y <= 2:
                        assert pixel == source.getpixel(absolute)
                    else:
                        assert pixel[3] == 0


def test_put_state_geometry_change_invalidates_extracted_outputs(
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
    element_dir = tmp_path / "workspace" / "elements" / "element_001"
    assert (element_dir / "mask.png").exists()
    assert (element_dir / "asset_incomplete.png").exists()
    assert (element_dir / "extraction.json").exists()

    next_state = extract_response.json()["state"]
    next_state["elements"][0]["bbox"] = {"x": 4, "y": 2, "w": 1, "h": 2}
    response = client.put("/api/workspace/state", json=next_state)

    assert response.status_code == 200
    element = response.json()["elements"][0]
    assert element["status"] == "extract_ready"
    assert element["mask"] is None
    assert not (element_dir / "mask.png").exists()
    assert not (element_dir / "asset_incomplete.png").exists()
    assert not (element_dir / "extraction.json").exists()


def test_put_state_geometry_change_clears_stale_repair_artifacts(
    client: TestClient,
    tmp_path: Path,
) -> None:
    element_dir = _prepare_repair_package(client, tmp_path)
    repair_dir = element_dir / "repair"

    with Image.open(repair_dir / "incomplete_asset.png") as incomplete:
        completed = incomplete.convert("RGBA")
    completed.putpixel((2, 1), (250, 120, 10, 255))
    completed.save(repair_dir / "completed_asset.png", format="PNG")
    (repair_dir / "repair_report.json").write_text('{"summary":"filled missing pixel"}', encoding="utf-8")
    validate_response = client.post("/api/workspace/elements/element_001/repair/validate")
    assert validate_response.status_code == 200
    assert validate_response.json()["state"]["elements"][0]["mode"] == "completed_by_codex"
    assert validate_response.json()["state"]["elements"][0]["repairStatus"] == "repair_complete"
    assert validate_response.json()["state"]["elements"][0]["exportStatus"] == "ready"

    next_state = validate_response.json()["state"]
    next_state["elements"][0]["bbox"] = {"x": 4, "y": 2, "w": 1, "h": 2}
    response = client.put("/api/workspace/state", json=next_state)

    assert response.status_code == 200
    element = response.json()["elements"][0]
    assert element["status"] == "extract_ready"
    assert element["mode"] == "needs_completion"
    assert element["mask"] is None
    assert element["repairStatus"] == "required"
    assert element["exportStatus"] == "blocked"
    assert not (element_dir / "missing_mask.png").exists()
    assert not repair_dir.exists()


def test_upload_source_clears_previous_element_repair_artifacts(
    client: TestClient,
    tmp_path: Path,
) -> None:
    element_dir = _prepare_repair_package(client, tmp_path)
    assert (element_dir / "missing_mask.png").exists()
    assert (element_dir / "repair").exists()

    response = client.post(
        "/api/workspace/source",
        files={"file": ("replacement.png", make_gradient_scene_bytes(), "image/png")},
    )

    assert response.status_code == 200
    assert response.json()["elements"] == []
    assert not element_dir.exists()


def test_upload_source_clears_previous_export_and_split_requests(
    client: TestClient,
    tmp_path: Path,
) -> None:
    upload_response = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_gradient_scene_bytes(), "image/png")},
    )
    assert upload_response.status_code == 200

    workspace_root = tmp_path / "workspace"
    export_dir = workspace_root / "export"
    split_requests_dir = workspace_root / "split_requests"
    export_dir.mkdir(parents=True, exist_ok=True)
    split_requests_dir.mkdir(parents=True, exist_ok=True)
    (export_dir / "manifest.json").write_text('{"stale":true}', encoding="utf-8")
    (split_requests_dir / "request.json").write_text('{"stale":true}', encoding="utf-8")

    response = client.post(
        "/api/workspace/source",
        files={"file": ("replacement.png", make_gradient_scene_bytes(), "image/png")},
    )

    assert response.status_code == 200
    assert not export_dir.exists()
    assert not split_requests_dir.exists()


def test_extract_rejects_persisted_path_like_element_id_without_writing_outside(
    client: TestClient,
    tmp_path: Path,
) -> None:
    upload_response = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_gradient_scene_bytes(), "image/png")},
    )
    assert upload_response.status_code == 200
    state_path = tmp_path / "workspace" / "state.json"
    state_path.write_text(
        workspace_api.json.dumps(
            {
                "source": {
                    "filename": "original.png",
                    "path": "source/original.png",
                    "width": 8,
                    "height": 6,
                },
                "elements": [
                    {
                        "id": "../../outside",
                        "name": "Bad Id",
                        "status": "accepted",
                        "mode": "visible_only",
                        "bbox": {"x": 1, "y": 1, "w": 2, "h": 2},
                        "canvas": {"x": 0, "y": 0, "w": 4, "h": 4},
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
            }
        ),
        encoding="utf-8",
    )

    response = client.post("/api/workspace/extract", json={"strategy": "bbox_alpha"})

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "Element id '../../outside' must be a slug containing only letters, "
        "numbers, underscores, and hyphens."
    )
    assert not (tmp_path / "outside" / "mask.png").exists()


def test_extract_without_ids_only_processes_accepted_or_extract_ready_elements(
    client: TestClient,
    tmp_path: Path,
) -> None:
    upload_response = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_gradient_scene_bytes(20, 10), "image/png")},
    )
    assert upload_response.status_code == 200

    elements = [
        {
            "id": "element_001",
            "name": "Accepted",
            "status": "accepted",
            "mode": "visible_only",
            "bbox": {"x": 1, "y": 1, "w": 2, "h": 2},
            "canvas": {"x": 0, "y": 0, "w": 4, "h": 4},
            "layer": 1,
            "thumbnail": None,
            "mask": None,
            "parentId": None,
            "source": "manual",
            "notes": "",
            "visible": True,
            "confidence": None,
        },
        {
            "id": "element_002",
            "name": "Ready",
            "status": "extract_ready",
            "mode": "visible_only",
            "bbox": {"x": 6, "y": 1, "w": 2, "h": 2},
            "canvas": {"x": 5, "y": 0, "w": 4, "h": 4},
            "layer": 2,
            "thumbnail": None,
            "mask": None,
            "parentId": None,
            "source": "manual",
            "notes": "",
            "visible": True,
            "confidence": None,
        },
        {
            "id": "element_003",
            "name": "Proposal",
            "status": "proposal",
            "mode": "visible_only",
            "bbox": {"x": 11, "y": 1, "w": 2, "h": 2},
            "canvas": {"x": 10, "y": 0, "w": 4, "h": 4},
            "layer": 3,
            "thumbnail": None,
            "mask": None,
            "parentId": None,
            "source": "manual",
            "notes": "",
            "visible": True,
            "confidence": None,
        },
        {
            "id": "element_004",
            "name": "Split Parent",
            "status": "split_parent",
            "mode": "visible_only",
            "bbox": {"x": 15, "y": 1, "w": 2, "h": 2},
            "canvas": {"x": 14, "y": 0, "w": 4, "h": 4},
            "layer": 4,
            "thumbnail": None,
            "mask": None,
            "parentId": None,
            "source": "manual",
            "notes": "",
            "visible": True,
            "confidence": None,
        },
        {
            "id": "element_005",
            "name": "Rejected",
            "status": "proposal",
            "mode": "rejected",
            "bbox": {"x": 1, "y": 6, "w": 2, "h": 2},
            "canvas": {"x": 0, "y": 5, "w": 4, "h": 4},
            "layer": 5,
            "thumbnail": None,
            "mask": None,
            "parentId": None,
            "source": "manual",
            "notes": "",
            "visible": False,
            "confidence": None,
        },
    ]
    state_response = client.put(
        "/api/workspace/state",
        json={
            "source": {
                "filename": "original.png",
                "path": "source/original.png",
                "width": 20,
                "height": 10,
            },
            "elements": elements,
        },
    )
    assert state_response.status_code == 200

    response = client.post("/api/workspace/extract", json={"strategy": "bbox_alpha"})

    assert response.status_code == 200
    payload = response.json()
    assert [item["elementId"] for item in payload["extractions"]] == [
        "element_001",
        "element_002",
    ]
    by_id = {element["id"]: element for element in payload["state"]["elements"]}
    assert by_id["element_001"]["status"] == "extracted"
    assert by_id["element_002"]["status"] == "extracted"
    assert by_id["element_003"]["status"] == "proposal"
    assert by_id["element_004"]["status"] == "split_parent"
    assert by_id["element_005"]["mode"] == "rejected"
    assert not (tmp_path / "workspace" / "elements" / "element_003" / "mask.png").exists()
    assert not (tmp_path / "workspace" / "elements" / "element_004" / "mask.png").exists()
    assert not (tmp_path / "workspace" / "elements" / "element_005" / "mask.png").exists()



