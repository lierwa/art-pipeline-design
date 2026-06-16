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


def test_auto_annotate_prefers_imported_proposals_when_present(
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
