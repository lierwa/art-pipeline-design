from __future__ import annotations

from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import art_pipeline.api as workspace_api
from art_pipeline.api import create_app


@pytest.fixture()
def client(tmp_path: Path) -> TestClient:
    app = create_app(workspace_root=tmp_path / "workspace")
    return TestClient(app)


def make_png_bytes() -> bytes:
    image = Image.new("RGBA", (2, 2), (120, 45, 200, 255))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def make_synthetic_scene_bytes() -> bytes:
    image = Image.new("RGBA", (120, 90), (245, 245, 245, 255))
    for x in range(12, 42):
        for y in range(16, 48):
            image.putpixel((x, y), (220, 64, 64, 255))
    for x in range(64, 102):
        for y in range(28, 70):
            image.putpixel((x, y), (64, 118, 220, 255))

    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def test_upload_png_initializes_workspace_state(client: TestClient, tmp_path: Path) -> None:
    response = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_png_bytes(), "image/png")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["source"]["filename"] == "original.png"
    assert payload["source"]["width"] == 2
    assert payload["source"]["height"] == 2
    assert payload["elements"] == []

    source_path = tmp_path / "workspace" / "source" / "original.png"
    state_path = tmp_path / "workspace" / "state.json"
    assert source_path.exists()
    assert state_path.exists()

    source_response = client.get("/api/workspace/source")
    assert source_response.status_code == 200
    assert source_response.headers["content-type"] == "image/png"

    state_response = client.get("/api/workspace/state")
    assert state_response.status_code == 200
    assert state_response.json()["source"]["path"] == "source/original.png"


def test_upload_rejects_non_png(client: TestClient) -> None:
    response = client.post(
        "/api/workspace/source",
        files={"file": ("scene.txt", b"not a png", "text/plain")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Only PNG uploads are supported."


def test_put_state_round_trips_elements_payload(
    client: TestClient,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {
        "source": {
            "filename": "original.png",
            "path": "source/original.png",
            "width": 8,
            "height": 6,
        },
        "elements": [
            {
                "id": "element_001",
                "name": "Cat",
                "status": "proposal",
                "bbox": {"x": 1, "y": 2, "w": 3, "h": 4},
            }
        ],
    }
    replace_calls: list[tuple[Path, Path]] = []

    original_replace = workspace_api.os.replace

    def tracking_replace(source: Path | str, target: Path | str) -> None:
        replace_calls.append((Path(source), Path(target)))
        original_replace(source, target)

    monkeypatch.setattr(workspace_api.os, "replace", tracking_replace)

    response = client.put("/api/workspace/state", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["source"] == payload["source"]
    assert body["elements"][0]["id"] == "element_001"
    assert body["elements"][0]["name"] == "Cat"
    assert body["elements"][0]["status"] == "proposal"
    assert body["elements"][0]["bbox"] == {"x": 1, "y": 2, "w": 3, "h": 4}
    assert body["elements"][0]["canvas"] == {"x": 1, "y": 2, "w": 3, "h": 4}

    state_response = client.get("/api/workspace/state")
    assert state_response.status_code == 200
    assert state_response.json() == body

    state_path = tmp_path / "workspace" / "state.json"
    assert state_path.exists()
    assert replace_calls == [(state_path.with_suffix(".json.tmp"), state_path)]
    assert list(state_path.parent.glob("state.json.*")) == []


def test_auto_annotate_returns_deterministic_candidates_and_thumbnails(
    client: TestClient,
    tmp_path: Path,
) -> None:
    upload_response = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_synthetic_scene_bytes(), "image/png")},
    )
    assert upload_response.status_code == 200

    response = client.post("/api/workspace/auto-annotate")

    assert response.status_code == 200
    payload = response.json()
    assert payload["source"]["width"] == 120
    assert len(payload["elements"]) >= 2

    candidate_sources = {element["source"] for element in payload["elements"]}
    assert "auto_cv" in candidate_sources

    candidate_names = {element["name"] for element in payload["elements"]}
    assert {"Region 1", "Region 2"}.issubset(candidate_names)

    by_name = {element["name"]: element for element in payload["elements"]}
    assert by_name["Region 1"]["bbox"] == {"x": 12, "y": 16, "w": 30, "h": 32}
    assert by_name["Region 2"]["bbox"] == {"x": 64, "y": 28, "w": 38, "h": 42}

    for element in payload["elements"]:
        thumb_path = tmp_path / "workspace" / element["thumbnail"]
        assert thumb_path.exists()
        with Image.open(thumb_path) as thumb:
            assert thumb.width == element["bbox"]["w"]
            assert thumb.height == element["bbox"]["h"]

    state_path = tmp_path / "workspace" / "state.json"
    state_payload = workspace_api.json.loads(state_path.read_text(encoding="utf-8"))
    assert state_payload["elements"] == payload["elements"]


def test_auto_annotate_includes_imported_proposals_when_present(
    client: TestClient,
    tmp_path: Path,
) -> None:
    upload_response = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_synthetic_scene_bytes(), "image/png")},
    )
    assert upload_response.status_code == 200

    proposals_dir = tmp_path / "workspace" / "proposals"
    proposals_dir.mkdir(parents=True, exist_ok=True)
    imported_path = proposals_dir / "imported_proposals.json"
    imported_path.write_text(
        """
        [
          {
            "name": "Imported Block",
            "bbox": {"x": 10, "y": 12, "w": 22, "h": 20},
            "canvas": {"x": 8, "y": 10, "w": 26, "h": 24},
            "confidence": 0.91
          }
        ]
        """.strip(),
        encoding="utf-8",
    )

    response = client.post("/api/workspace/auto-annotate")

    assert response.status_code == 200
    payload = response.json()
    imported = next(
        element for element in payload["elements"] if element["name"] == "Imported Block"
    )
    assert imported["source"] == "imported"
    assert imported["confidence"] == pytest.approx(0.91)
    assert (tmp_path / "workspace" / imported["thumbnail"]).exists()


def test_auto_annotate_returns_400_for_malformed_imported_proposals(
    client: TestClient,
    tmp_path: Path,
) -> None:
    upload_response = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_synthetic_scene_bytes(), "image/png")},
    )
    assert upload_response.status_code == 200

    proposals_dir = tmp_path / "workspace" / "proposals"
    proposals_dir.mkdir(parents=True, exist_ok=True)
    imported_path = proposals_dir / "imported_proposals.json"
    imported_path.write_text('{"name":"bad-shape"}', encoding="utf-8")

    response = client.post("/api/workspace/auto-annotate")

    assert response.status_code == 400
    assert response.json()["detail"] == "Imported proposals must be a JSON array."


def test_auto_annotate_preserves_rejected_elements_and_avoids_id_collisions(
    client: TestClient,
) -> None:
    upload_response = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_synthetic_scene_bytes(), "image/png")},
    )
    assert upload_response.status_code == 200

    first_response = client.post("/api/workspace/auto-annotate")
    assert first_response.status_code == 200
    first_payload = first_response.json()

    rejected = dict(first_payload["elements"][0])
    rejected["mode"] = "rejected"
    rejected["visible"] = False

    accepted = dict(first_payload["elements"][1])
    accepted["status"] = "accepted"

    put_response = client.put(
        "/api/workspace/state",
        json={
            "source": first_payload["source"],
            "elements": [rejected, accepted],
        },
    )
    assert put_response.status_code == 200

    second_response = client.post("/api/workspace/auto-annotate")
    assert second_response.status_code == 200
    second_payload = second_response.json()

    by_id = {element["id"]: element for element in second_payload["elements"]}
    assert rejected["id"] in by_id
    assert by_id[rejected["id"]]["mode"] == "rejected"
    assert by_id[rejected["id"]]["visible"] is False
    assert accepted["id"] in by_id
    assert by_id[accepted["id"]]["status"] == "accepted"

    active_proposal_ids = {
        element["id"]
        for element in second_payload["elements"]
        if element["status"] == "proposal" and element["mode"] != "rejected"
    }
    assert rejected["id"] not in active_proposal_ids
    assert accepted["id"] not in active_proposal_ids
    assert active_proposal_ids == {"element_003", "element_004"}


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


def test_split_marks_parent_and_creates_children_with_thumbnails(
    client: TestClient,
    tmp_path: Path,
) -> None:
    upload_response = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_synthetic_scene_bytes(), "image/png")},
    )
    assert upload_response.status_code == 200

    created_response = client.post(
        "/api/workspace/elements",
        json={
            "name": "Cabinet",
            "bbox": {"x": 12, "y": 16, "w": 30, "h": 32},
        },
    )
    assert created_response.status_code == 200
    parent = created_response.json()["element"]

    split_response = client.post(
        f"/api/workspace/elements/{parent['id']}/split",
        json={
            "regions": [
                {"name": "Left Door", "bbox": {"x": 12, "y": 16, "w": 14, "h": 32}},
                {"name": "Right Door", "bbox": {"x": 26, "y": 16, "w": 16, "h": 32}},
            ]
        },
    )

    assert split_response.status_code == 200
    payload = split_response.json()
    updated_parent = next(element for element in payload["state"]["elements"] if element["id"] == parent["id"])
    assert updated_parent["status"] == "split_parent"

    children = payload["children"]
    assert len(children) == 2
    assert {child["name"] for child in children} == {"Left Door", "Right Door"}
    assert {child["parentId"] for child in children} == {parent["id"]}
    assert all(child["status"] == "accepted" for child in children)
    assert all(child["mode"] == "visible_only" for child in children)
    assert all(child["layer"] in {1, 2} for child in children)

    for child in children:
        thumb_path = tmp_path / "workspace" / child["thumbnail"]
        assert thumb_path.exists()


def test_create_split_request_writes_expected_contract(
    client: TestClient,
    tmp_path: Path,
) -> None:
    upload_response = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_synthetic_scene_bytes(), "image/png")},
    )
    assert upload_response.status_code == 200

    created_response = client.post(
        "/api/workspace/elements",
        json={
            "name": "Mirror",
            "bbox": {"x": 64, "y": 28, "w": 38, "h": 42},
        },
    )
    assert created_response.status_code == 200
    element = created_response.json()["element"]

    request_response = client.post(
        "/api/workspace/split-requests",
        json={
            "elementId": element["id"],
            "description": "separate the reflection frame from the glass",
        },
    )

    assert request_response.status_code == 200
    body = request_response.json()
    request_path = tmp_path / "workspace" / body["path"]
    assert request_path.exists()

    contract = workspace_api.json.loads(request_path.read_text(encoding="utf-8"))
    assert contract["elementId"] == element["id"]
    assert contract["description"] == "separate the reflection frame from the glass"
    assert contract["sourceImagePath"] == "source/original.png"
    assert contract["sourceCropPath"].endswith(".png")
    assert contract["expectedOutput"]["type"] == "split_children"
    assert contract["expectedOutput"]["parentStatus"] == "split_parent"
