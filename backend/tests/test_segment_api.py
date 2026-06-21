from __future__ import annotations

import base64
import json
from io import BytesIO
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from art_pipeline.api import create_app
from workspace_fixtures import upload_scene_and_state as _upload_scene_and_state


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


class SequenceSam2Provider:
    def __init__(self, masks: list[Image.Image]) -> None:
        self.masks = masks
        self.prompts: list[dict[str, Any]] = []
        self.index = 0

    def detect(self, image: Image.Image, prompt: dict[str, Any]) -> Image.Image:
        self.prompts.append(
            {
                "imageSize": [image.width, image.height],
                "prompt": prompt,
            }
        )
        mask = self.masks[min(self.index, len(self.masks) - 1)]
        self.index += 1
        return mask


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
    assert body["segmentation"]["quality"] == {
        "selectedProfile": "base",
        "candidateCount": 3,
        "foregroundArea": 36,
        "detachedArea": 0,
        "supportedDetachedArea": 0,
        "unsupportedDetachedArea": 0,
        "bboxOutsideArea": 24,
        "bboxLateralGrowthArea": 12,
        "bboxTopGrowthArea": 0,
        "bboxBottomGrowthArea": 12,
        "filledHoleCount": 0,
        "filledHoleArea": 0,
        "removedDetachedCount": 0,
        "removedDetachedArea": 0,
        "supportPointCount": 5,
        "missedSupportPointCount": 0,
        "qualityStatus": "pass",
        "qualityReasons": [],
    }
    assert element["segmentationQuality"] == body["segmentation"]["quality"]
    assert body["state"]["elements"][0]["segmentationQuality"] == body["segmentation"]["quality"]

    stage_dir = tmp_path / "workspace" / "elements" / "element_001" / "sam2_edge"
    assert (stage_dir / "source_crop.png").exists()
    assert (stage_dir / "mask.png").exists()
    assert (stage_dir / "transparent_asset.png").exists()
    metadata = json.loads((stage_dir / "segmentation.json").read_text(encoding="utf-8"))
    assert metadata["quality"] == body["segmentation"]["quality"]

    with Image.open(stage_dir / "mask.png") as written_mask:
        assert written_mask.mode == "L"
        assert written_mask.size == (12, 10)
        assert written_mask.getbbox() == (3, 2, 9, 8)
        assert _soft_alpha_pixel_count(written_mask) == 0

    with Image.open(stage_dir / "transparent_asset.png") as asset:
        assert asset.mode == "RGBA"
        assert asset.size == (12, 10)
        assert asset.getpixel((0, 0))[3] == 0
        assert asset.getpixel((5, 4))[3] == 255
        assert _soft_alpha_pixel_count(asset.getchannel("A")) > 0


def test_segment_suggest_prompts_sam2_with_positive_support_points(tmp_path: Path) -> None:
    mask = Image.new("L", (12, 10), 0)
    ImageDraw.Draw(mask).rectangle((3, 2, 8, 7), fill=255)
    provider = FakeSam2Provider(mask)
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=provider))
    _upload_scene_and_state(client)

    response = client.post("/api/workspace/elements/element_001/segment/suggest")

    assert response.status_code == 200
    base_prompt = provider.prompts[0]["prompt"]
    assert base_prompt["bbox"] == {"x": 3, "y": 2, "w": 4, "h": 3}
    assert base_prompt["supportProfile"] == "base"
    assert base_prompt["points"] == [
        {"x": 5, "y": 3, "label": "positive"},
        {"x": 5, "y": 2, "label": "positive"},
        {"x": 5, "y": 4, "label": "positive"},
        {"x": 4, "y": 3, "label": "positive"},
        {"x": 6, "y": 3, "label": "positive"},
    ]
    bottom_prompt = provider.prompts[1]["prompt"]
    assert bottom_prompt["supportProfile"] == "bottom_support"
    assert bottom_prompt["points"] == [
        *base_prompt["points"],
        {"x": 3, "y": 4, "label": "positive"},
    ]
    extremity_prompt = provider.prompts[2]["prompt"]
    assert extremity_prompt["supportProfile"] == "visible_extremity_support"
    assert extremity_prompt["points"] == [
        *bottom_prompt["points"],
        {"x": 5, "y": 5, "label": "positive"},
    ]


def test_segment_suggest_all_masks_every_segmentable_asset(tmp_path: Path) -> None:
    first_mask = Image.new("L", (12, 10), 0)
    ImageDraw.Draw(first_mask).rectangle((3, 2, 8, 7), fill=255)
    second_mask = Image.new("L", (12, 10), 0)
    ImageDraw.Draw(second_mask).rectangle((1, 1, 4, 4), fill=255)
    provider = SequenceSam2Provider([first_mask, second_mask])
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=provider))
    _upload_scene_and_state(client)
    state = client.get("/api/workspace/state").json()
    state["elements"].append(
        {
            **state["elements"][0],
            "id": "element_002",
            "name": "Second sticker",
            "bbox": {"x": 1, "y": 1, "w": 3, "h": 3},
            "canvas": {"x": 0, "y": 0, "w": 6, "h": 5},
            "mask": None,
            "segmentationStatus": "not_started",
            "segmentationQuality": None,
            "exportStatus": "not_ready",
        }
    )
    assert client.put("/api/workspace/state", json=state).status_code == 200

    response = client.post("/api/workspace/segment/suggest")

    assert response.status_code == 200
    body = response.json()
    assert [item["elementId"] for item in body["segmentations"]] == [
        "element_001",
        "element_002",
    ]
    assert {item["prompt"]["elementId"] for item in provider.prompts} == {
        "element_001",
        "element_002",
    }
    next_elements = body["state"]["elements"]
    assert [element["segmentationStatus"] for element in next_elements] == [
        "mask_suggested",
        "mask_suggested",
    ]
    assert all(element["mask"].endswith("/sam2_edge/mask.png") for element in next_elements)


def test_segment_suggest_subtracts_child_masks_from_parent_mask(tmp_path: Path) -> None:
    parent_mask = Image.new("L", (12, 10), 0)
    ImageDraw.Draw(parent_mask).rectangle((2, 1, 9, 6), fill=255)
    provider = FakeSam2Provider(parent_mask)
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=provider))
    _upload_scene_and_state(client)
    state = client.get("/api/workspace/state").json()
    state["elements"] = [
        {
            **state["elements"][0],
            "id": "parent",
            "name": "wall cabinet",
            "assetRole": "parent",
            "bbox": {"x": 2, "y": 1, "w": 8, "h": 6},
            "canvas": {"x": 2, "y": 1, "w": 8, "h": 6},
            "mask": None,
            "segmentationStatus": "not_started",
            "segmentationQuality": None,
        },
        {
            **state["elements"][0],
            "id": "child",
            "name": "plant + bottle",
            "assetRole": "removable_child",
            "parentId": "parent",
            "removeFromParent": "parent",
            "bbox": {"x": 4, "y": 3, "w": 3, "h": 2},
            "canvas": {"x": 4, "y": 3, "w": 3, "h": 2},
            "mask": "elements/child/sam2_edge/mask.png",
            "segmentationStatus": "mask_suggested",
            "segmentationQuality": None,
        },
    ]
    child_dir = tmp_path / "workspace" / "elements" / "child" / "sam2_edge"
    child_dir.mkdir(parents=True, exist_ok=True)
    Image.new("L", (3, 2), 255).save(child_dir / "mask.png", format="PNG")
    assert client.put("/api/workspace/state", json=state).status_code == 200

    response = client.post("/api/workspace/elements/parent/segment/suggest")

    assert response.status_code == 200
    stage_dir = tmp_path / "workspace" / "elements" / "parent" / "sam2_edge"
    with Image.open(stage_dir / "mask.png") as written_mask:
        assert written_mask.getpixel((2, 1)) == 255
        assert written_mask.getpixel((4, 3)) == 0
        assert written_mask.getpixel((8, 6)) == 255


def test_segment_suggest_expands_canvas_when_raw_mask_exceeds_canvas(tmp_path: Path) -> None:
    mask = Image.new("L", (12, 10), 0)
    ImageDraw.Draw(mask).rectangle((1, 0, 10, 8), fill=255)
    provider = FakeSam2Provider(mask)
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=provider))
    _upload_scene_and_state(client)

    response = client.post("/api/workspace/elements/element_001/segment/suggest")

    assert response.status_code == 200
    element = response.json()["element"]
    assert element["canvas"] == {"x": 0, "y": 0, "w": 12, "h": 10}

    stage_dir = tmp_path / "workspace" / "elements" / "element_001" / "sam2_edge"
    with Image.open(stage_dir / "mask.png") as written_mask:
        assert written_mask.size == (12, 10)
        assert written_mask.getbbox() == (1, 0, 11, 9)

    with Image.open(stage_dir / "source_crop.png") as source_crop:
        assert source_crop.size == (12, 10)


def test_segment_suggest_repairs_enclosed_provider_holes_before_asset_alpha(tmp_path: Path) -> None:
    mask = Image.new("L", (12, 10), 0)
    draw = ImageDraw.Draw(mask)
    draw.rectangle((3, 2, 8, 7), fill=255)
    draw.rectangle((5, 4, 6, 5), fill=0)
    provider = FakeSam2Provider(mask)
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=provider))
    _upload_scene_and_state(client)

    response = client.post("/api/workspace/elements/element_001/segment/suggest")

    assert response.status_code == 200
    stage_dir = tmp_path / "workspace" / "elements" / "element_001" / "sam2_edge"
    with Image.open(stage_dir / "mask.png") as written_mask:
        assert written_mask.getpixel((3, 3)) == 255
        assert written_mask.getpixel((4, 4)) == 255

    with Image.open(stage_dir / "transparent_asset.png") as asset:
        assert asset.getpixel((5, 4))[3] == 255
        assert asset.getpixel((6, 5))[3] == 255


def test_segment_suggest_selects_clean_bottom_support_candidate(tmp_path: Path) -> None:
    base_mask = Image.new("L", (12, 10), 0)
    ImageDraw.Draw(base_mask).rectangle((3, 2, 8, 5), fill=255)
    bottom_mask = base_mask.copy()
    ImageDraw.Draw(bottom_mask).rectangle((3, 6, 4, 6), fill=255)
    provider = SequenceSam2Provider([base_mask, bottom_mask])
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=provider))
    _upload_scene_and_state(client)

    response = client.post("/api/workspace/elements/element_001/segment/suggest")

    assert response.status_code == 200
    stage_dir = tmp_path / "workspace" / "elements" / "element_001" / "sam2_edge"
    with Image.open(stage_dir / "mask.png") as written_mask:
        assert written_mask.getpixel((3, 6)) == 255


def test_segment_suggest_rejects_noisy_bottom_support_candidate(tmp_path: Path) -> None:
    base_mask = Image.new("L", (12, 10), 0)
    ImageDraw.Draw(base_mask).rectangle((3, 2, 8, 5), fill=255)
    noisy_mask = base_mask.copy()
    ImageDraw.Draw(noisy_mask).point((2, 6), fill=255)
    provider = SequenceSam2Provider([base_mask, noisy_mask])
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=provider))
    _upload_scene_and_state(client)

    response = client.post("/api/workspace/elements/element_001/segment/suggest")

    assert response.status_code == 200
    stage_dir = tmp_path / "workspace" / "elements" / "element_001" / "sam2_edge"
    with Image.open(stage_dir / "mask.png") as written_mask:
        assert written_mask.getpixel((0, 5)) == 0


def test_segment_suggest_rejects_overgrown_bottom_support_candidate(tmp_path: Path) -> None:
    base_mask = Image.new("L", (12, 10), 0)
    ImageDraw.Draw(base_mask).rectangle((3, 2, 8, 5), fill=255)
    overgrown_mask = base_mask.copy()
    ImageDraw.Draw(overgrown_mask).rectangle((2, 6, 8, 6), fill=255)
    provider = SequenceSam2Provider([base_mask, overgrown_mask])
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=provider))
    _upload_scene_and_state(client)

    response = client.post("/api/workspace/elements/element_001/segment/suggest")

    assert response.status_code == 200
    stage_dir = tmp_path / "workspace" / "elements" / "element_001" / "sam2_edge"
    with Image.open(stage_dir / "mask.png") as written_mask:
        assert written_mask.getpixel((1, 5)) == 0


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


def test_segment_accept_requires_quality_report(tmp_path: Path) -> None:
    mask = Image.new("L", (12, 10), 0)
    ImageDraw.Draw(mask).rectangle((3, 2, 8, 7), fill=255)
    provider = FakeSam2Provider(mask)
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=provider))
    _upload_scene_and_state(client)
    assert client.post("/api/workspace/elements/element_001/segment/suggest").status_code == 200
    state_response = client.get("/api/workspace/state")
    assert state_response.status_code == 200
    state = state_response.json()
    state["elements"][0].pop("segmentationQuality", None)
    assert client.put("/api/workspace/state", json=state).status_code == 200

    response = client.post("/api/workspace/elements/element_001/segment/accept")

    assert response.status_code == 400
    assert response.json()["detail"] == "Element element_001 has no segmentation quality report."


def test_segment_accept_rejects_failed_quality_report(tmp_path: Path) -> None:
    mask = Image.new("L", (12, 10), 0)
    ImageDraw.Draw(mask).rectangle((3, 2, 8, 7), fill=255)
    provider = FakeSam2Provider(mask)
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=provider))
    _upload_scene_and_state(client)
    assert client.post("/api/workspace/elements/element_001/segment/suggest").status_code == 200
    state_response = client.get("/api/workspace/state")
    assert state_response.status_code == 200
    state = state_response.json()
    state["elements"][0]["segmentationQuality"]["qualityStatus"] = "fail"
    state["elements"][0]["segmentationQuality"]["qualityReasons"] = ["empty_foreground"]
    assert client.put("/api/workspace/state", json=state).status_code == 200

    response = client.post("/api/workspace/elements/element_001/segment/accept")

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "Element element_001 segmentation quality failed: empty_foreground."
    )


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
                "bbox": {"x": 2, "y": 1, "w": 4, "h": 3},
            }
        },
    )

    assert response.status_code == 200
    element = response.json()["element"]
    assert element["segmentationStatus"] == "mask_suggested"
    assert element["mask"] == "elements/element_001/sam2_edge/mask.png"

    stage_dir = tmp_path / "workspace" / "elements" / "element_001" / "sam2_edge"
    with Image.open(stage_dir / "mask.png") as written_mask:
        assert written_mask.getbbox() == (2, 1, 6, 4)
        assert written_mask.getpixel((1, 1)) == 0
        assert written_mask.getpixel((2, 1)) == 255

    with Image.open(stage_dir / "transparent_asset.png") as asset:
        assert 0 < asset.getpixel((1, 1))[3] < 180
        assert asset.getpixel((0, 0))[3] == 0
        assert asset.getpixel((3, 2))[3] == 255
        assert _soft_alpha_pixel_count(asset.getchannel("A")) > 0

    accept_response = client.post("/api/workspace/elements/element_001/segment/accept")
    assert accept_response.status_code == 200
    assert accept_response.json()["element"]["segmentationStatus"] == "mask_accepted"


def test_segment_mask_patch_magic_wand_subtracts_only_similar_connected_region(
    tmp_path: Path,
) -> None:
    provider_mask = Image.new("L", (8, 6), 255)
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=FakeSam2Provider(provider_mask)))
    _upload_scene_and_state(client)
    assert client.post("/api/workspace/elements/element_001/segment/suggest").status_code == 200

    response = client.patch(
        "/api/workspace/elements/element_001/segment/mask",
        json={
            "operation": "subtract",
            "shape": {
                "type": "magic_wand",
                "coordinateSpace": "canvas",
                "seed": {"x": 1, "y": 1},
                "tolerance": 0,
            },
        },
    )

    assert response.status_code == 200
    stage_dir = tmp_path / "workspace" / "elements" / "element_001" / "sam2_edge"
    with Image.open(stage_dir / "mask.png") as written_mask:
        assert written_mask.getpixel((1, 1)) == 0
        assert written_mask.getpixel((6, 5)) == 0
        assert written_mask.getpixel((0, 0)) == 255
        assert written_mask.getpixel((7, 5)) == 255


def test_segment_mask_patch_mask_delta_replaces_and_cleans_small_fragments(
    tmp_path: Path,
) -> None:
    provider_mask = Image.new("L", (8, 6), 255)
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=FakeSam2Provider(provider_mask)))
    _upload_scene_and_state(client)
    assert client.post("/api/workspace/elements/element_001/segment/suggest").status_code == 200
    delta = Image.new("L", (8, 6), 0)
    draw = ImageDraw.Draw(delta)
    draw.rectangle((2, 1, 5, 4), fill=255)
    draw.point((7, 5), fill=255)

    response = client.patch(
        "/api/workspace/elements/element_001/segment/mask",
        json={
            "operation": "replace",
            "shape": {
                "type": "mask_delta",
                "coordinateSpace": "canvas",
                "maskData": _mask_data_url(delta),
                "cleanupMinArea": 3,
            },
        },
    )

    assert response.status_code == 200
    stage_dir = tmp_path / "workspace" / "elements" / "element_001" / "sam2_edge"
    with Image.open(stage_dir / "mask.png") as written_mask:
        assert written_mask.getpixel((2, 1)) == 255
        assert written_mask.getpixel((5, 4)) == 255
        assert written_mask.getpixel((7, 5)) == 0


def test_segment_mask_patch_mask_delta_adds_and_subtracts_from_current_mask(
    tmp_path: Path,
) -> None:
    provider_mask = Image.new("L", (8, 6), 0)
    ImageDraw.Draw(provider_mask).rectangle((2, 1, 5, 4), fill=255)
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=FakeSam2Provider(provider_mask)))
    _upload_scene_and_state(client)
    assert client.post("/api/workspace/elements/element_001/segment/suggest").status_code == 200

    subtract_delta = Image.new("L", (8, 6), 0)
    ImageDraw.Draw(subtract_delta).rectangle((3, 2, 4, 3), fill=255)
    subtract_response = client.patch(
        "/api/workspace/elements/element_001/segment/mask",
        json={
            "operation": "subtract",
            "shape": {
                "type": "mask_delta",
                "coordinateSpace": "canvas",
                "maskData": _mask_data_url(subtract_delta),
            },
        },
    )
    assert subtract_response.status_code == 200

    add_delta = Image.new("L", (8, 6), 0)
    ImageDraw.Draw(add_delta).rectangle((0, 0, 1, 1), fill=255)
    add_response = client.patch(
        "/api/workspace/elements/element_001/segment/mask",
        json={
            "operation": "add",
            "shape": {
                "type": "mask_delta",
                "coordinateSpace": "canvas",
                "maskData": _mask_data_url(add_delta),
            },
        },
    )

    assert add_response.status_code == 200
    stage_dir = tmp_path / "workspace" / "elements" / "element_001" / "sam2_edge"
    with Image.open(stage_dir / "mask.png") as written_mask:
        assert written_mask.getpixel((0, 0)) == 255
        assert written_mask.getpixel((1, 1)) == 255
        assert written_mask.getpixel((3, 2)) == 0
        assert written_mask.getpixel((4, 3)) == 0
        assert written_mask.getpixel((2, 1)) == 255


def _soft_alpha_pixel_count(mask: Image.Image) -> int:
    histogram = mask.convert("L").histogram()
    return sum(histogram[1:255])


def _mask_data_url(mask: Image.Image) -> str:
    buffer = BytesIO()
    mask.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"
