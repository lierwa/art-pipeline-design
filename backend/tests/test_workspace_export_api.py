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

def test_export_writes_visible_assets_and_blocks_incomplete_completion(
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
                    "layer": 2,
                    "thumbnail": None,
                    "mask": None,
                    "parentId": None,
                    "source": "manual",
                    "notes": "ready",
                    "visible": True,
                    "confidence": None,
                },
                {
                    "id": "element_002",
                    "name": "Towel Gap",
                    "status": "accepted",
                    "mode": "needs_completion",
                    "bbox": {"x": 1, "y": 1, "w": 3, "h": 2},
                    "canvas": {"x": 0, "y": 0, "w": 5, "h": 4},
                    "layer": 1,
                    "thumbnail": None,
                    "mask": None,
                    "parentId": None,
                    "source": "manual",
                    "notes": "needs generated edge",
                    "visible": True,
                    "confidence": None,
                },
                {
                    "id": "element_003",
                    "name": "Parent",
                    "status": "split_parent",
                    "mode": "visible_only",
                    "bbox": {"x": 0, "y": 0, "w": 4, "h": 3},
                    "canvas": {"x": 0, "y": 0, "w": 4, "h": 3},
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
                    "name": "Rejected",
                    "status": "proposal",
                    "mode": "rejected",
                    "bbox": {"x": 4, "y": 2, "w": 2, "h": 2},
                    "canvas": {"x": 4, "y": 2, "w": 2, "h": 2},
                    "layer": 4,
                    "thumbnail": None,
                    "mask": None,
                    "parentId": None,
                    "source": "manual",
                    "notes": "",
                    "visible": False,
                    "confidence": None,
                },
                {
                    "id": "element_005",
                    "name": "Draft Proposal",
                    "status": "proposal",
                    "mode": "visible_only",
                    "bbox": {"x": 5, "y": 3, "w": 2, "h": 2},
                    "canvas": {"x": 5, "y": 3, "w": 2, "h": 2},
                    "layer": 5,
                    "thumbnail": None,
                    "mask": None,
                    "parentId": None,
                    "source": "model_detection",
                    "sourceProvider": "test_provider",
                    "sourcePrompt": "draft",
                    "history": [],
                    "notes": "",
                    "visible": True,
                    "confidence": 0.25,
                },
            ],
        },
    )
    assert state_response.status_code == 200

    extract_response = client.post(
        "/api/workspace/extract",
        json={"elementIds": ["element_001", "element_002"], "strategy": "bbox_alpha"},
    )
    assert extract_response.status_code == 200

    response = client.post("/api/workspace/export")

    assert response.status_code == 200
    body = response.json()
    assert body["exportableCount"] == 0
    assert body["blockedCount"] == 3
    assert body["exportedElements"] == []
    assert body["blockedElements"] == [
        {
            "elementId": "element_001",
            "name": "Cup",
            "reason": "mask_not_accepted",
        },
        {
            "elementId": "element_002",
            "name": "Towel Gap",
            "reason": "needs_completion_without_valid_repair",
        },
        {
            "elementId": "element_004",
            "name": "Rejected",
            "reason": "rejected",
        },
    ]
    assert "element_003 skipped because split_parent elements are not exported by default." in body["warnings"]
    assert "element_004 skipped because rejected elements are not exported." in body["warnings"]
    assert "element_005 skipped because proposals must be accepted before export." in body["warnings"]

    export_root = tmp_path / "workspace" / "export"
    assert not (export_root / "assets" / "element_001.png").exists()
    assert not (export_root / "masks" / "element_001.png").exists()
    assert not (export_root / "assets" / "element_002.png").exists()
    assert (export_root / "manifest.json").exists()
    assert (export_root / "level.json").exists()
    assert (export_root / "qa_report.json").exists()
    assert (export_root / "contact_sheet.png").exists()

    manifest = workspace_api.json.loads((export_root / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["assetPackVersion"] == 1
    assert manifest["source"] == {
        "filename": "original.png",
        "path": "source/original.png",
        "width": 8,
        "height": 6,
    }
    assert manifest["elements"] == []

    level = workspace_api.json.loads((export_root / "level.json").read_text(encoding="utf-8"))
    assert level["placements"] == []

    qa_report = workspace_api.json.loads((export_root / "qa_report.json").read_text(encoding="utf-8"))
    assert qa_report["blockedElements"] == body["blockedElements"]
    assert qa_report["warnings"] == body["warnings"]


def test_export_blocks_unrepaired_completion_even_with_legacy_override(
    client: TestClient,
    tmp_path: Path,
) -> None:
    _prepare_completion_element(client, tmp_path)

    response = client.post(
        "/api/workspace/export",
        json={"allowIncompleteVisibleOnly": True},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["exportableCount"] == 0
    assert body["blockedCount"] == 1
    assert body["exportedElements"] == []
    assert body["blockedElements"] == [
        {
            "elementId": "element_001",
            "name": "Cup",
            "reason": "needs_completion_without_valid_repair",
        }
    ]
    assert body["warnings"] == []
    assert not (tmp_path / "workspace" / "export" / "assets" / "element_001.png").exists()


def test_export_blocks_accepted_candidates_without_masks(
    client: TestClient,
    tmp_path: Path,
) -> None:
    state = {
        "source": {
            "filename": "original.png",
            "path": "source/original.png",
            "width": 120,
            "height": 90,
        },
        "elements": [
            {
                "id": "element_001",
                "name": "cabinet",
                "label": "cabinet",
                "status": "accepted",
                "mode": "visible_only",
                "bbox": {"x": 10, "y": 20, "w": 30, "h": 40},
                "canvas": {"x": 10, "y": 20, "w": 30, "h": 40},
                "mask": None,
                "sourceProvider": "grounding_dino",
                "sourcePrompt": "cabinet",
                "confidence": 0.88,
                "history": [],
                "visible": True,
            }
        ],
    }
    assert client.put("/api/workspace/state", json=state).status_code == 200
    element_dir = tmp_path / "workspace" / "elements" / "element_001"
    element_dir.mkdir(parents=True, exist_ok=True)
    Image.new("RGBA", (30, 40), (20, 30, 40, 255)).save(
        element_dir / "asset_incomplete.png",
        format="PNG",
    )

    response = client.post("/api/workspace/export", json={})

    assert response.status_code == 200
    body = response.json()
    assert body["exportableCount"] == 0
    assert body["blockedCount"] == 1
    assert body["exportedElements"] == []
    assert body["blockedElements"][0]["reason"] == "mask_not_accepted"
    assert not (tmp_path / "workspace" / "export" / "assets" / "element_001.png").exists()


def test_export_blocks_visible_asset_when_source_mask_file_is_missing(
    client: TestClient,
    tmp_path: Path,
) -> None:
    element_dir = _prepare_completion_element(client, tmp_path, mode="visible_only")
    (element_dir / "mask.png").unlink()

    response = client.post("/api/workspace/export")

    assert response.status_code == 200
    body = response.json()
    assert body["exportableCount"] == 0
    assert body["blockedCount"] == 1
    assert body["exportedElements"] == []
    assert body["blockedElements"] == [
        {
            "elementId": "element_001",
            "name": "Cup",
            "reason": "mask_not_accepted",
        }
    ]
    assert body["warnings"] == []

    export_root = tmp_path / "workspace" / "export"
    assert not (export_root / "assets" / "element_001.png").exists()
    assert not (export_root / "masks" / "element_001.png").exists()

    qa_report = workspace_api.json.loads(
        (export_root / "qa_report.json").read_text(encoding="utf-8")
    )
    assert qa_report["blockedElements"] == body["blockedElements"]


def test_export_blocks_asset_without_source_mask_or_alpha_channel(
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
                    "name": "RGB Asset",
                    "status": "extracted",
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
        },
    )
    assert state_response.status_code == 200
    element_dir = tmp_path / "workspace" / "elements" / "element_001"
    element_dir.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (4, 4), (20, 30, 40)).save(
        element_dir / "asset_incomplete.png",
        format="PNG",
    )

    response = client.post("/api/workspace/export")

    assert response.status_code == 200
    body = response.json()
    assert body["exportableCount"] == 0
    assert body["blockedCount"] == 1
    assert body["exportedElements"] == []
    assert body["blockedElements"] == [
        {
            "elementId": "element_001",
            "name": "RGB Asset",
            "reason": "mask_not_accepted",
        }
    ]
    assert not (tmp_path / "workspace" / "export" / "assets" / "element_001.png").exists()
    assert not (tmp_path / "workspace" / "export" / "masks" / "element_001.png").exists()



