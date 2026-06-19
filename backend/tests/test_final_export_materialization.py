from __future__ import annotations

import json
from io import BytesIO
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from PIL import Image

from art_pipeline.api import create_app


class SmallMaskProvider:
    def detect(self, image: Image.Image, prompt: dict[str, Any]) -> Image.Image:
        _ = prompt
        mask = Image.new("L", image.size, 0)
        for x in range(3, 5):
            for y in range(3, 5):
                mask.putpixel((x, y), 255)
        return mask


def test_final_export_blocks_incomplete_override_for_unrepaired_assets(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "workspace"))
    _prepare_completion_element(client, tmp_path)

    response = client.post(
        "/api/workspace/export",
        json={"allowIncompleteVisibleOnly": True},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["exportableCount"] == 0
    assert body["blockedElements"] == [
        {
            "elementId": "element_001",
            "name": "Cup",
            "reason": "needs_completion_without_valid_repair",
        }
    ]
    assert not (tmp_path / "workspace" / "export" / "assets" / "element_001.png").exists()


def test_exported_sticker_asset_has_opaque_outline_outside_original_mask(
    tmp_path: Path,
) -> None:
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=SmallMaskProvider()))
    _upload_state(client, [_sticker_element()])
    assert client.post("/api/workspace/elements/element_001/segment/suggest").status_code == 200
    assert client.post("/api/workspace/elements/element_001/segment/accept").status_code == 200

    response = client.post("/api/workspace/export")

    assert response.status_code == 200
    body = response.json()
    assert body["exportableCount"] == 1
    export_root = tmp_path / "workspace" / "export"
    with Image.open(export_root / "assets" / "element_001.png") as asset:
        asset = asset.convert("RGBA")
        assert asset.getpixel((2, 3)) == (255, 255, 255, 255)
        assert asset.getpixel((3, 3)) == (30, 90, 180, 255)
        assert asset.getpixel((1, 3))[3] == 0
    with Image.open(export_root / "masks" / "element_001.png") as mask:
        assert mask.mode == "L"
        assert mask.getpixel((2, 3)) == 0
        assert mask.getpixel((3, 3)) == 255


def test_final_export_blocks_accepted_sam2_asset_without_quality_report(
    tmp_path: Path,
) -> None:
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=SmallMaskProvider()))
    _upload_state(client, [_sticker_element()])
    assert client.post("/api/workspace/elements/element_001/segment/suggest").status_code == 200
    state_response = client.get("/api/workspace/state")
    assert state_response.status_code == 200
    state = state_response.json()
    state["elements"][0].pop("segmentationQuality", None)
    state["elements"][0]["segmentationStatus"] = "mask_accepted"
    state["elements"][0]["exportStatus"] = "ready"
    assert client.put("/api/workspace/state", json=state).status_code == 200

    response = client.post("/api/workspace/export")

    assert response.status_code == 200
    body = response.json()
    assert body["exportableCount"] == 0
    assert body["blockedElements"] == [
        {
            "elementId": "element_001",
            "name": "Cup",
            "reason": "segmentation_quality_missing",
        }
    ]
    assert not (tmp_path / "workspace" / "export" / "assets" / "element_001.png").exists()


def test_final_export_blocks_failed_segmentation_quality_report(
    tmp_path: Path,
) -> None:
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=SmallMaskProvider()))
    _upload_state(client, [_sticker_element()])
    assert client.post("/api/workspace/elements/element_001/segment/suggest").status_code == 200
    state_response = client.get("/api/workspace/state")
    assert state_response.status_code == 200
    state = state_response.json()
    quality = state["elements"][0]["segmentationQuality"]
    quality["qualityStatus"] = "fail"
    quality["qualityReasons"] = ["empty_foreground"]
    state["elements"][0]["segmentationStatus"] = "mask_accepted"
    state["elements"][0]["exportStatus"] = "ready"
    assert client.put("/api/workspace/state", json=state).status_code == 200

    response = client.post("/api/workspace/export")

    assert response.status_code == 200
    body = response.json()
    assert body["exportableCount"] == 0
    assert body["blockedElements"] == [
        {
            "elementId": "element_001",
            "name": "Cup",
            "reason": "segmentation_quality_failed",
        }
    ]


def test_manifest_and_level_include_sticker_pipeline_metadata(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=SmallMaskProvider()))
    _upload_state(
        client,
        [
            _sticker_element(),
            _parent_element(),
            _child_element(),
        ],
    )
    assert client.post("/api/workspace/elements/element_001/segment/suggest").status_code == 200
    assert client.post("/api/workspace/elements/element_001/segment/accept").status_code == 200

    response = client.post("/api/workspace/export")

    assert response.status_code == 200
    export_root = tmp_path / "workspace" / "export"
    manifest = json.loads((export_root / "manifest.json").read_text(encoding="utf-8"))
    exported = manifest["elements"][0]
    assert exported["assetRole"] == "sticker"
    assert exported["removeFromParent"] is None
    assert exported["children"] == []
    assert exported["sourceProvider"] == "grounding_dino"
    assert exported["sourcePrompt"] == "cup"
    assert exported["confidence"] == 0.82
    assert exported["segmentationStatus"] == "mask_accepted"
    assert exported["repairStatus"] == "not_required"
    assert exported["exportStatus"] == "ready"
    assert exported["sourceCropPath"] == "export/source_crops/element_001.png"
    assert exported["sourceAssetPath"] == "elements/element_001/sam2_edge/transparent_asset.png"
    assert exported["qa"] == {"warnings": []}
    assert exported["warnings"] == []
    assert exported["bbox"] == {"x": 2, "y": 2, "w": 6, "h": 6}
    assert exported["canvas"] == {"x": 0, "y": 0, "w": 10, "h": 10}
    assert exported["layer"] == 2

    level = json.loads((export_root / "level.json").read_text(encoding="utf-8"))
    placement = level["placements"][0]
    assert placement["role"] == "sticker"
    assert placement["removeFromParent"] is None
    assert placement["children"] == []
    assert placement["bbox"] == {"x": 2, "y": 2, "w": 6, "h": 6}
    assert placement["canvas"] == {"x": 0, "y": 0, "w": 10, "h": 10}
    assert placement["layer"] == 2
    assert placement["assetPath"] == "export/assets/element_001.png"
    assert placement["maskPath"] == "export/masks/element_001.png"
    assert placement["sourceCropPath"] == "export/source_crops/element_001.png"
    assert (export_root / "source_crops" / "element_001.png").exists()


def _prepare_completion_element(client: TestClient, tmp_path: Path) -> None:
    _upload_state(
        client,
        [
            {
                **_sticker_element(),
                "mode": "needs_completion",
                "segmentationStatus": "not_started",
                "mask": None,
            }
        ],
    )
    element_dir = tmp_path / "workspace" / "elements" / "element_001"
    element_dir.mkdir(parents=True, exist_ok=True)
    Image.new("RGBA", (10, 10), (30, 90, 180, 255)).save(
        element_dir / "asset_incomplete.png",
        format="PNG",
    )


def _upload_state(client: TestClient, elements: list[dict[str, Any]]) -> None:
    upload_response = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", _scene_bytes(), "image/png")},
    )
    assert upload_response.status_code == 200
    response = client.put(
        "/api/workspace/state",
        json={
            "source": {
                "filename": "original.png",
                "path": "source/original.png",
                "width": 10,
                "height": 10,
            },
            "elements": elements,
        },
    )
    assert response.status_code == 200


def _sticker_element() -> dict[str, Any]:
    return {
        "id": "element_001",
        "name": "Cup",
        "label": "cup",
        "status": "accepted",
        "mode": "visible_only",
        "assetRole": "sticker",
        "removeFromParent": None,
        "segmentationStatus": "not_started",
        "repairStatus": "not_required",
        "exportStatus": "not_ready",
        "bbox": {"x": 2, "y": 2, "w": 6, "h": 6},
        "canvas": {"x": 0, "y": 0, "w": 10, "h": 10},
        "layer": 2,
        "sourceProvider": "grounding_dino",
        "sourcePrompt": "cup",
        "confidence": 0.82,
        "visible": True,
    }


def _parent_element() -> dict[str, Any]:
    return {
        **_sticker_element(),
        "id": "parent_001",
        "name": "Cabinet",
        "label": "cabinet",
        "assetRole": "parent",
        "layer": 0,
    }


def _child_element() -> dict[str, Any]:
    return {
        **_sticker_element(),
        "id": "child_001",
        "name": "Bottle",
        "label": "bottle",
        "assetRole": "removable_child",
        "removeFromParent": "parent_001",
        "layer": 3,
    }


def _scene_bytes() -> bytes:
    image = Image.new("RGBA", (10, 10), (0, 0, 0, 0))
    for x in range(3, 5):
        for y in range(3, 5):
            image.putpixel((x, y), (30, 90, 180, 255))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()
