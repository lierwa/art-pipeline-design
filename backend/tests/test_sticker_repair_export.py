from __future__ import annotations

import json
from io import BytesIO
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from PIL import Image

from art_pipeline.api import create_app


class FullMaskProvider:
    def detect(self, image: Image.Image, prompt: dict[str, Any]) -> Image.Image:
        mask = Image.new("L", image.size, 0)
        bbox = prompt["bbox"]
        for x in range(bbox["x"], bbox["x"] + bbox["w"]):
            for y in range(bbox["y"], bbox["y"] + bbox["h"]):
                mask.putpixel((x, y), 255)
        return mask


class SequenceMaskProvider:
    def __init__(self, masks: list[tuple[int, int, int, int]]) -> None:
        self._masks = masks
        self._index = 0

    def detect(self, image: Image.Image, prompt: dict[str, Any]) -> Image.Image:
        _ = prompt
        box = self._masks[min(self._index, len(self._masks) - 1)]
        self._index += 1
        mask = Image.new("L", image.size, 0)
        x, y, w, h = box
        for px in range(x, x + w):
            for py in range(y, y + h):
                mask.putpixel((px, py), 255)
        return mask


def test_accepted_sticker_and_removable_child_are_export_ready(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=FullMaskProvider()))
    _upload_state(client, [_element("element_001", "Sticker"), _element("element_002", "Child", role="removable_child")])

    _suggest_accept(client, "element_001")
    child_response = _suggest_accept(client, "element_002")

    state = child_response.json()["state"]
    by_id = {element["id"]: element for element in state["elements"]}
    assert by_id["element_001"]["exportStatus"] == "ready"
    assert by_id["element_002"]["exportStatus"] == "ready"


def test_embedded_keep_is_not_exported_individually(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=FullMaskProvider()))
    _upload_state(client, [_element("element_001", "Highlight", role="embedded_keep")])
    _suggest_accept(client, "element_001")

    response = client.post("/api/workspace/export")

    assert response.status_code == 200
    body = response.json()
    assert body["exportableCount"] == 0
    assert body["blockedElements"] == [
        {
            "elementId": "element_001",
            "name": "Highlight",
            "reason": "embedded_keep_not_exported_individually",
        }
    ]


def test_parent_with_accepted_removed_child_creates_repair_contract_and_blocks_export(
    tmp_path: Path,
) -> None:
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=FullMaskProvider()))
    _upload_state(
        client,
        [
            _element("parent_001", "Cabinet", role="parent", bbox={"x": 2, "y": 2, "w": 8, "h": 6}, canvas={"x": 1, "y": 1, "w": 10, "h": 8}),
            _element("child_001", "Sticker", role="removable_child", remove_from_parent="parent_001", bbox={"x": 4, "y": 3, "w": 3, "h": 2}, canvas={"x": 4, "y": 3, "w": 3, "h": 2}, layer=2),
        ],
    )

    _suggest_accept(client, "child_001")
    parent_response = _suggest_accept(client, "parent_001")

    parent = parent_response.json()["element"]
    assert parent["repairStatus"] == "task_created"
    assert parent["exportStatus"] == "blocked"
    repair_dir = tmp_path / "workspace" / "elements" / "parent_001" / "repair"
    for filename in (
        "source_crop.png",
        "incomplete_asset.png",
        "remove_mask.png",
        "preserve_mask.png",
        "context_crop.png",
        "repair_prompt.md",
        "repair_contract.json",
    ):
        assert (repair_dir / filename).exists()

    response = client.post("/api/workspace/export")
    assert response.status_code == 200
    body = response.json()
    assert body["exportableCount"] == 1
    assert body["exportedElements"][0]["elementId"] == "child_001"
    assert {
        "elementId": "parent_001",
        "name": "Cabinet",
        "reason": "parent_repair_required",
    } in body["blockedElements"]


def test_role_patch_after_masks_accept_creates_parent_removal_repair_contract(
    tmp_path: Path,
) -> None:
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=FullMaskProvider()))
    _upload_state(
        client,
        [
            _element("parent_001", "Cabinet", role="parent", bbox={"x": 2, "y": 2, "w": 8, "h": 6}, canvas={"x": 1, "y": 1, "w": 10, "h": 8}),
            _element("child_001", "Sticker", bbox={"x": 4, "y": 3, "w": 3, "h": 2}, canvas={"x": 4, "y": 3, "w": 3, "h": 2}, layer=2),
        ],
    )
    _suggest_accept(client, "parent_001")
    _suggest_accept(client, "child_001")

    response = client.patch(
        "/api/workspace/elements/child_001",
        json={"assetRole": "removable_child", "removeFromParent": "parent_001"},
    )

    assert response.status_code == 200
    by_id = {element["id"]: element for element in response.json()["state"]["elements"]}
    assert by_id["parent_001"]["repairStatus"] == "task_created"
    assert by_id["parent_001"]["exportStatus"] == "blocked"
    assert by_id["child_001"]["exportStatus"] == "ready"
    assert (tmp_path / "workspace" / "elements" / "parent_001" / "repair" / "repair_contract.json").exists()


def test_parent_relationship_patch_after_masks_accept_creates_parent_removal_repair_contract(
    tmp_path: Path,
) -> None:
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=FullMaskProvider()))
    _upload_state(
        client,
        [
            _element("parent_001", "Cabinet", bbox={"x": 2, "y": 2, "w": 8, "h": 6}, canvas={"x": 1, "y": 1, "w": 10, "h": 8}),
            _element("child_001", "Sticker", bbox={"x": 4, "y": 3, "w": 3, "h": 2}, canvas={"x": 4, "y": 3, "w": 3, "h": 2}, layer=2),
        ],
    )
    _suggest_accept(client, "parent_001")
    _suggest_accept(client, "child_001")

    response = client.patch(
        "/api/workspace/elements/child_001/parent",
        json={"parentId": "parent_001"},
    )

    assert response.status_code == 200
    by_id = {element["id"]: element for element in response.json()["state"]["elements"]}
    assert by_id["parent_001"]["assetRole"] == "parent"
    assert by_id["child_001"]["assetRole"] == "removable_child"
    assert by_id["child_001"]["parentId"] == "parent_001"
    assert by_id["child_001"]["removeFromParent"] == "parent_001"
    assert by_id["parent_001"]["repairStatus"] == "task_created"
    assert by_id["parent_001"]["exportStatus"] == "blocked"
    assert by_id["child_001"]["exportStatus"] == "ready"
    assert (tmp_path / "workspace" / "elements" / "parent_001" / "repair" / "repair_contract.json").exists()


def test_role_patch_moving_child_away_recomputes_previous_parent_repair_state(
    tmp_path: Path,
) -> None:
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=FullMaskProvider()))
    _upload_state(
        client,
        [
            _element("parent_001", "Cabinet", role="parent", bbox={"x": 2, "y": 2, "w": 8, "h": 6}, canvas={"x": 1, "y": 1, "w": 10, "h": 8}),
            _element("child_001", "Sticker", role="removable_child", remove_from_parent="parent_001", bbox={"x": 4, "y": 3, "w": 3, "h": 2}, canvas={"x": 4, "y": 3, "w": 3, "h": 2}, layer=2),
        ],
    )
    _suggest_accept(client, "child_001")
    _suggest_accept(client, "parent_001")

    response = client.patch(
        "/api/workspace/elements/child_001",
        json={"assetRole": "sticker"},
    )

    assert response.status_code == 200
    by_id = {element["id"]: element for element in response.json()["state"]["elements"]}
    assert by_id["child_001"]["removeFromParent"] is None
    assert by_id["parent_001"]["status"] == "accepted"
    assert by_id["parent_001"]["mode"] == "visible_only"
    assert by_id["parent_001"]["repairStatus"] == "not_required"
    assert by_id["parent_001"]["exportStatus"] == "ready"
    assert not (tmp_path / "workspace" / "elements" / "parent_001" / "repair").exists()

    export_response = client.post("/api/workspace/export")
    assert export_response.status_code == 200
    exported_ids = {element["elementId"] for element in export_response.json()["exportedElements"]}
    assert {"parent_001", "child_001"} <= exported_ids


def test_repair_complete_parent_can_export(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=FullMaskProvider()))
    _upload_state(
        client,
        [
            _element("parent_001", "Cabinet", role="parent", bbox={"x": 2, "y": 2, "w": 8, "h": 6}, canvas={"x": 1, "y": 1, "w": 10, "h": 8}),
            _element("child_001", "Sticker", role="removable_child", remove_from_parent="parent_001", bbox={"x": 4, "y": 3, "w": 3, "h": 2}, canvas={"x": 4, "y": 3, "w": 3, "h": 2}, layer=2),
        ],
    )
    _suggest_accept(client, "child_001")
    _suggest_accept(client, "parent_001")
    validate_response = _validate_parent_repair_complete(client, tmp_path)
    parent = _element_by_id(validate_response.json()["state"], "parent_001")
    assert parent["repairStatus"] == "repair_complete"
    assert parent["exportStatus"] == "ready"

    response = client.post("/api/workspace/export")

    assert response.status_code == 200
    body = response.json()
    exported_ids = {element["elementId"] for element in body["exportedElements"]}
    assert "parent_001" in exported_ids
    assert body["blockedCount"] == 0


def test_parent_repair_complete_is_invalidated_when_same_child_segmentation_changes(
    tmp_path: Path,
) -> None:
    provider = SequenceMaskProvider(
        [
            (4, 3, 2, 2),
            (1, 1, 10, 8),
            (6, 4, 2, 2),
        ],
    )
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=provider))
    _upload_state(
        client,
        [
            _element("parent_001", "Cabinet", role="parent", bbox={"x": 2, "y": 2, "w": 8, "h": 6}, canvas={"x": 1, "y": 1, "w": 10, "h": 8}),
            _element("child_001", "First Sticker", role="removable_child", remove_from_parent="parent_001", bbox={"x": 4, "y": 3, "w": 2, "h": 2}, canvas={"x": 4, "y": 3, "w": 2, "h": 2}, layer=2),
        ],
    )
    _suggest_accept(client, "child_001")
    _suggest_accept(client, "parent_001")
    _validate_parent_repair_complete(client, tmp_path)

    state = client.get("/api/workspace/state").json()
    child = _element_by_id(state, "child_001")
    child["bbox"] = {"x": 6, "y": 4, "w": 2, "h": 2}
    child["canvas"] = {"x": 6, "y": 4, "w": 2, "h": 2}
    assert client.put("/api/workspace/state", json=state).status_code == 200
    accept_second = _suggest_accept(client, "child_001")

    by_id = {element["id"]: element for element in accept_second.json()["state"]["elements"]}
    assert by_id["parent_001"]["repairStatus"] == "task_created"
    assert by_id["parent_001"]["exportStatus"] == "blocked"

    response = client.post("/api/workspace/export")
    assert response.status_code == 200
    body = response.json()
    assert {
        "elementId": "parent_001",
        "name": "Cabinet",
        "reason": "parent_repair_required",
    } in body["blockedElements"]


def test_manual_child_mask_edit_invalidates_completed_parent_repair(
    tmp_path: Path,
) -> None:
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=FullMaskProvider()))
    _upload_state(
        client,
        [
            _element("parent_001", "Cabinet", role="parent", bbox={"x": 2, "y": 2, "w": 8, "h": 6}, canvas={"x": 1, "y": 1, "w": 10, "h": 8}),
            _element("child_001", "Sticker", role="removable_child", remove_from_parent="parent_001", bbox={"x": 4, "y": 3, "w": 3, "h": 2}, canvas={"x": 4, "y": 3, "w": 3, "h": 2}, layer=2),
        ],
    )
    _suggest_accept(client, "child_001")
    _suggest_accept(client, "parent_001")
    _validate_parent_repair_complete(client, tmp_path)

    response = client.patch(
        "/api/workspace/elements/child_001/segment/mask",
        json={
            "operation": "subtract",
            "shape": {
                "type": "rectangle",
                "coordinateSpace": "canvas",
                "bbox": {"x": 0, "y": 0, "w": 1, "h": 1},
            },
        },
    )

    assert response.status_code == 200
    by_id = {element["id"]: element for element in response.json()["state"]["elements"]}
    assert by_id["child_001"]["segmentationStatus"] == "mask_suggested"
    assert by_id["parent_001"]["status"] == "accepted"
    assert by_id["parent_001"]["mode"] == "visible_only"
    assert by_id["parent_001"]["repairStatus"] == "required"
    assert by_id["parent_001"]["exportStatus"] == "blocked"
    assert not (tmp_path / "workspace" / "elements" / "parent_001" / "repair").exists()

    export_response = client.post("/api/workspace/export")
    assert export_response.status_code == 200
    body = export_response.json()
    assert "parent_001" not in {element["elementId"] for element in body["exportedElements"]}
    assert {
        "elementId": "parent_001",
        "name": "Cabinet",
        "reason": "parent_repair_required",
    } in body["blockedElements"]


def test_bbox_alpha_debug_output_does_not_replace_accepted_sticker_output(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=FullMaskProvider()))
    _upload_state(client, [_element("element_001", "Sticker")])
    debug_response = client.post(
        "/api/workspace/extract",
        json={"elementIds": ["element_001"], "strategy": "bbox_alpha"},
    )
    assert debug_response.status_code == 200
    _suggest_accept(client, "element_001")

    response = client.post("/api/workspace/export")

    assert response.status_code == 200
    body = response.json()
    assert body["exportableCount"] == 1
    assert body["exportedElements"][0]["sourceAssetPath"] == (
        "elements/element_001/sam2_edge/transparent_asset.png"
    )
    assert body["exportedElements"][0]["sourceAssetPath"] != (
        "elements/element_001/asset_incomplete.png"
    )


def test_bbox_alpha_alone_is_blocked_for_wave2_sticker(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=FullMaskProvider()))
    _upload_state(client, [_element("element_001", "Sticker")])
    debug_response = client.post(
        "/api/workspace/extract",
        json={"elementIds": ["element_001"], "strategy": "bbox_alpha"},
    )
    assert debug_response.status_code == 200

    response = client.post("/api/workspace/export")

    assert response.status_code == 200
    body = response.json()
    assert body["exportableCount"] == 0
    assert body["blockedElements"] == [
        {
            "elementId": "element_001",
            "name": "Sticker",
            "reason": "mask_not_accepted",
        }
    ]
    assert not (tmp_path / "workspace" / "export" / "assets" / "element_001.png").exists()


def test_unaccepted_wave2_sticker_reason_does_not_depend_on_bbox_alpha_artifact(
    tmp_path: Path,
) -> None:
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=FullMaskProvider()))
    _upload_state(client, [_element("element_001", "Sticker")])

    fresh_response = client.post("/api/workspace/export")
    debug_response = client.post(
        "/api/workspace/extract",
        json={"elementIds": ["element_001"], "strategy": "bbox_alpha"},
    )
    assert debug_response.status_code == 200
    debug_response = client.post("/api/workspace/export")

    assert fresh_response.status_code == 200
    assert debug_response.status_code == 200
    expected_block = {
        "elementId": "element_001",
        "name": "Sticker",
        "reason": "mask_not_accepted",
    }
    assert fresh_response.json()["blockedElements"] == [expected_block]
    assert debug_response.json()["blockedElements"] == [expected_block]


def test_rejected_sticker_is_reported_as_blocked(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=FullMaskProvider()))
    rejected = _element("element_001", "Rejected Sticker")
    rejected["mode"] = "rejected"
    _upload_state(client, [rejected])

    response = client.post("/api/workspace/export")

    assert response.status_code == 200
    body = response.json()
    assert body["exportableCount"] == 0
    assert body["blockedElements"] == [
        {
            "elementId": "element_001",
            "name": "Rejected Sticker",
            "reason": "rejected",
        }
    ]
    qa_report = json.loads(
        (tmp_path / "workspace" / "export" / "qa_report.json").read_text(encoding="utf-8")
    )
    assert qa_report["blockedElements"] == body["blockedElements"]


def _suggest_accept(client: TestClient, element_id: str):
    suggest_response = client.post(f"/api/workspace/elements/{element_id}/segment/suggest")
    assert suggest_response.status_code == 200
    accept_response = client.post(f"/api/workspace/elements/{element_id}/segment/accept")
    assert accept_response.status_code == 200
    return accept_response


def _validate_parent_repair_complete(client: TestClient, tmp_path: Path):
    repair_dir = tmp_path / "workspace" / "elements" / "parent_001" / "repair"
    with Image.open(repair_dir / "incomplete_asset.png") as incomplete:
        completed = incomplete.convert("RGBA")
    with Image.open(repair_dir / "remove_mask.png") as remove_mask:
        remove_pixels = remove_mask.convert("L").load()
        for y in range(remove_mask.height):
            for x in range(remove_mask.width):
                if remove_pixels[x, y] > 0:
                    completed.putpixel((x, y), (40, 90, 160, 255))
    completed.save(repair_dir / "completed_asset.png", format="PNG")
    (repair_dir / "repair_report.json").write_text('{"summary":"filled child removal"}', encoding="utf-8")
    response = client.post("/api/workspace/elements/parent_001/repair/validate")
    assert response.status_code == 200
    assert response.json()["qa"]["status"] == "pass"
    return response


def _element_by_id(state: dict[str, Any], element_id: str) -> dict[str, Any]:
    return next(element for element in state["elements"] if element["id"] == element_id)


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
                "width": 14,
                "height": 12,
            },
            "elements": elements,
        },
    )
    assert response.status_code == 200


def _element(
    element_id: str,
    name: str,
    role: str = "sticker",
    remove_from_parent: str | None = None,
    bbox: dict[str, int] | None = None,
    canvas: dict[str, int] | None = None,
    layer: int = 1,
) -> dict[str, Any]:
    box = bbox or {"x": 3, "y": 2, "w": 5, "h": 4}
    return {
        "id": element_id,
        "name": name,
        "status": "accepted",
        "assetRole": role,
        "removeFromParent": remove_from_parent,
        "bbox": box,
        "canvas": canvas or box,
        "layer": layer,
        "visible": True,
    }


def _scene_bytes() -> bytes:
    image = Image.new("RGBA", (14, 12), (240, 240, 230, 255))
    for x in range(2, 11):
        for y in range(2, 9):
            image.putpixel((x, y), (80, 130, 220, 255))
    for x in range(4, 7):
        for y in range(3, 5):
            image.putpixel((x, y), (220, 80, 80, 255))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()
