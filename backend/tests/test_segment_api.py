from __future__ import annotations

from io import BytesIO
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from art_pipeline.api import create_app


class FakeSam2Provider:
    def __init__(self, mask: Image.Image | None) -> None:
        self.mask = mask
        self.prompts: list[dict[str, Any]] = []

    def detect(self, image: Image.Image, prompt: dict[str, Any]) -> Image.Image | None:
        self.prompts.append(
            {
                "imageSize": [image.width, image.height],
                "prompt": prompt,
            }
        )
        return self.mask


def test_segment_suggest_writes_sam2_edge_artifacts_and_alpha(tmp_path: Path) -> None:
    mask = Image.new("L", (12, 10), 0)
    ImageDraw.Draw(mask).rectangle((3, 2, 8, 7), fill=255)
    provider = FakeSam2Provider(mask)
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=provider))
    _upload_scene_and_state(client)

    response = client.post("/api/workspace/elements/element_001/segment/suggest")

    assert response.status_code == 200
    body = response.json()
    element = body["element"]
    assert element["segmentationStatus"] == "mask_suggested"
    assert element["mask"] == "elements/element_001/sam2_edge/mask.png"
    assert body["segmentation"]["assetPath"] == (
        "elements/element_001/sam2_edge/transparent_asset.png"
    )
    assert provider.prompts[0]["prompt"]["elementId"] == "element_001"

    stage_dir = tmp_path / "workspace" / "elements" / "element_001" / "sam2_edge"
    assert (stage_dir / "source_crop.png").exists()
    assert (stage_dir / "mask.png").exists()
    assert (stage_dir / "transparent_asset.png").exists()

    with Image.open(stage_dir / "mask.png") as written_mask:
        assert written_mask.mode == "L"
        assert written_mask.size == (8, 6)
        assert written_mask.getbbox() == (1, 1, 7, 6)

    with Image.open(stage_dir / "transparent_asset.png") as asset:
        assert asset.mode == "RGBA"
        assert asset.size == (8, 6)
        assert asset.getpixel((0, 0))[3] == 0
        assert asset.getpixel((2, 2))[3] == 255


def test_segment_accept_requires_suggested_mask(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=FakeSam2Provider(None)))
    _upload_scene_and_state(client)

    response = client.post("/api/workspace/elements/element_001/segment/accept")

    assert response.status_code == 400
    assert response.json()["detail"] == "Element element_001 has no SAM2 mask suggestion to accept."


def test_segment_suggest_rejects_provider_without_mask(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=FakeSam2Provider(None)))
    _upload_scene_and_state(client)

    response = client.post("/api/workspace/elements/element_001/segment/suggest")

    assert response.status_code == 502
    assert response.json()["detail"] == "SAM2 provider did not return a mask."
    assert not (tmp_path / "workspace" / "elements" / "element_001" / "sam2_edge").exists()


def test_segment_accept_marks_sticker_ready(tmp_path: Path) -> None:
    mask = Image.new("L", (8, 6), 255)
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=FakeSam2Provider(mask)))
    _upload_scene_and_state(client)
    assert client.post("/api/workspace/elements/element_001/segment/suggest").status_code == 200

    response = client.post("/api/workspace/elements/element_001/segment/accept")

    assert response.status_code == 200
    element = response.json()["element"]
    assert element["segmentationStatus"] == "mask_accepted"
    assert element["repairStatus"] == "not_required"
    assert element["exportStatus"] == "ready"


def test_segment_mask_patch_replaces_sam2_edge_artifacts_but_keeps_suggestion_pending(
    tmp_path: Path,
) -> None:
    provider_mask = Image.new("L", (8, 6), 255)
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=FakeSam2Provider(provider_mask)))
    _upload_scene_and_state(client)
    assert client.post("/api/workspace/elements/element_001/segment/suggest").status_code == 200

    response = client.patch(
        "/api/workspace/elements/element_001/segment/mask",
        json={
            "shape": {
                "type": "rectangle",
                "coordinateSpace": "canvas",
                "bbox": {"x": 2, "y": 1, "w": 3, "h": 2},
            }
        },
    )

    assert response.status_code == 200
    element = response.json()["element"]
    assert element["segmentationStatus"] == "mask_suggested"
    assert element["mask"] == "elements/element_001/sam2_edge/mask.png"

    stage_dir = tmp_path / "workspace" / "elements" / "element_001" / "sam2_edge"
    with Image.open(stage_dir / "mask.png") as written_mask:
        assert written_mask.getbbox() == (2, 1, 5, 3)
        assert written_mask.getpixel((1, 1)) == 0
        assert written_mask.getpixel((2, 1)) == 255

    with Image.open(stage_dir / "transparent_asset.png") as asset:
        assert asset.getpixel((1, 1))[3] == 0
        assert asset.getpixel((2, 1))[3] == 255

    accept_response = client.post("/api/workspace/elements/element_001/segment/accept")
    assert accept_response.status_code == 200
    assert accept_response.json()["element"]["segmentationStatus"] == "mask_accepted"


def _upload_scene_and_state(client: TestClient) -> None:
    upload_response = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", _scene_bytes(), "image/png")},
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
                    "name": "Sticker",
                    "status": "accepted",
                    "assetRole": "sticker",
                    "bbox": {"x": 3, "y": 2, "w": 4, "h": 3},
                    "canvas": {"x": 2, "y": 1, "w": 8, "h": 6},
                    "layer": 1,
                    "visible": True,
                }
            ],
        },
    )
    assert state_response.status_code == 200


def _scene_bytes() -> bytes:
    image = Image.new("RGBA", (12, 10), (20, 30, 40, 255))
    for x in range(3, 9):
        for y in range(2, 8):
            image.putpixel((x, y), (220, 90, 40, 255))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()
