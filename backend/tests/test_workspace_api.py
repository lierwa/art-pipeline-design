from __future__ import annotations

from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import art_pipeline.api as workspace_api
import art_pipeline.exporter as workspace_exporter
from art_pipeline.api import create_app
from art_pipeline.elements import DEFAULT_WORKSPACE_VOCABULARY


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


def make_gradient_scene_bytes(width: int = 8, height: int = 6) -> bytes:
    image = Image.new("RGBA", (width, height), (0, 0, 0, 255))
    for x in range(width):
        for y in range(height):
            image.putpixel((x, y), ((x * 31) % 256, (y * 41) % 256, ((x + y) * 23) % 256, 255))

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

    asset_response = client.get("/api/workspace/assets/source/original.png")
    assert asset_response.status_code == 200
    assert asset_response.headers["content-type"] == "image/png"

    state_response = client.get("/api/workspace/state")
    assert state_response.status_code == 200
    assert state_response.json()["source"]["path"] == "source/original.png"


def test_upload_run_creates_processing_record_without_restoring_legacy_state(
    client: TestClient,
    tmp_path: Path,
) -> None:
    response = client.post(
        "/api/workspace/runs",
        files={"file": ("scene-a.png", make_png_bytes(), "image/png")},
    )

    assert response.status_code == 200
    payload = response.json()
    run = payload["run"]
    assert run["id"].startswith("run_")
    assert run["sourceFilename"] == "scene-a.png"
    assert run["elementCount"] == 0
    assert payload["state"]["source"]["path"] == "source/original.png"
    assert payload["state"]["elements"] == []

    run_root = tmp_path / "workspace" / "runs" / run["id"]
    assert (run_root / "source" / "original.png").exists()
    assert (run_root / "state.json").exists()
    assert not (tmp_path / "workspace" / "state.json").exists()

    runs_response = client.get("/api/workspace/runs")
    assert runs_response.status_code == 200
    assert runs_response.json()["runs"][0]["id"] == run["id"]

    legacy_state_response = client.get("/api/workspace/state")
    assert legacy_state_response.status_code == 200
    legacy_state = legacy_state_response.json()
    # WHY: legacy endpoint 仍代表“未恢复 run 状态”，但空 workspace 也要暴露检测默认词表。
    assert legacy_state == {
        "source": None,
        "elements": [],
        "detectionVocabulary": DEFAULT_WORKSPACE_VOCABULARY,
    }

    scoped_state_response = client.get(f"/api/workspace/state?runId={run['id']}")
    assert scoped_state_response.status_code == 200
    assert scoped_state_response.json()["source"]["width"] == 2

    scoped_source_response = client.get(f"/api/workspace/source?runId={run['id']}")
    assert scoped_source_response.status_code == 200
    assert scoped_source_response.headers["content-type"] == "image/png"

    scoped_asset_response = client.get(
        f"/api/workspace/assets/source/original.png?runId={run['id']}",
    )
    assert scoped_asset_response.status_code == 200
    assert scoped_asset_response.headers["content-type"] == "image/png"


def test_delete_run_removes_processing_record_and_files(
    client: TestClient,
    tmp_path: Path,
) -> None:
    create_response = client.post(
        "/api/workspace/runs",
        files={"file": ("scene-a.png", make_png_bytes(), "image/png")},
    )
    run = create_response.json()["run"]
    run_root = tmp_path / "workspace" / "runs" / run["id"]
    assert run_root.exists()

    delete_response = client.delete(f"/api/workspace/runs/{run['id']}")

    assert delete_response.status_code == 200
    assert delete_response.json() == {"runs": []}
    assert not run_root.exists()

    runs_response = client.get("/api/workspace/runs")
    assert runs_response.status_code == 200
    assert runs_response.json() == {"runs": []}

    scoped_state_response = client.get(f"/api/workspace/state?runId={run['id']}")
    assert scoped_state_response.status_code == 404


def test_delete_run_rejects_invalid_or_missing_record(client: TestClient) -> None:
    invalid_response = client.delete("/api/workspace/runs/not-a-run")
    missing_response = client.delete("/api/workspace/runs/run_missing")

    assert invalid_response.status_code == 400
    assert missing_response.status_code == 404


def test_workspace_assets_rejects_non_image_files(
    client: TestClient,
    tmp_path: Path,
) -> None:
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir(parents=True, exist_ok=True)
    (workspace_root / "state.json").write_text('{"source":null,"elements":[]}', encoding="utf-8")
    (workspace_root / "notes.md").write_text("# not an image", encoding="utf-8")

    json_response = client.get("/api/workspace/assets/state.json")
    markdown_response = client.get("/api/workspace/assets/notes.md")

    assert json_response.status_code == 404
    assert markdown_response.status_code == 404


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


@pytest.mark.parametrize("element_id", ["../../outside", "bad/id", "bad\\id"])
def test_put_state_rejects_path_like_element_ids(
    client: TestClient,
    tmp_path: Path,
    element_id: str,
) -> None:
    response = client.put(
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
                    "id": element_id,
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
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == (
        f"Element id {element_id!r} must be a slug containing only letters, "
        "numbers, underscores, and hyphens."
    )
    assert not (tmp_path / "outside").exists()
    assert not (tmp_path / "workspace" / "state.json").exists()


def test_put_state_rejects_duplicate_element_ids(client: TestClient) -> None:
    response = client.put(
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
                    "name": "First",
                    "status": "accepted",
                    "mode": "visible_only",
                    "bbox": {"x": 1, "y": 1, "w": 2, "h": 2},
                    "canvas": {"x": 1, "y": 1, "w": 2, "h": 2},
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
                    "id": "element_001",
                    "name": "Duplicate",
                    "status": "accepted",
                    "mode": "visible_only",
                    "bbox": {"x": 4, "y": 2, "w": 2, "h": 2},
                    "canvas": {"x": 4, "y": 2, "w": 2, "h": 2},
                    "layer": 2,
                    "thumbnail": None,
                    "mask": None,
                    "parentId": None,
                    "source": "manual",
                    "notes": "",
                    "visible": True,
                    "confidence": None,
                },
            ],
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Duplicate element id: element_001."


@pytest.mark.parametrize(
    ("bbox", "canvas", "detail"),
    [
        (
            {"x": -1, "y": 2, "w": 3, "h": 4},
            {"x": 0, "y": 0, "w": 8, "h": 6},
            "Element element_001 bbox x/y must be >= 0.",
        ),
        (
            {"x": 1, "y": 2, "w": 0, "h": 4},
            {"x": 0, "y": 0, "w": 8, "h": 6},
            "Element element_001 bbox width/height must be > 0.",
        ),
        (
            {"x": 6, "y": 2, "w": 3, "h": 4},
            {"x": 0, "y": 0, "w": 8, "h": 6},
            "Element element_001 bbox must stay within source bounds.",
        ),
        (
            {"x": 1, "y": 2, "w": 3, "h": 4},
            {"x": -1, "y": 0, "w": 8, "h": 6},
            "Element element_001 canvas x/y must be >= 0.",
        ),
        (
            {"x": 1, "y": 2, "w": 3, "h": 4},
            {"x": 0, "y": 0, "w": 0, "h": 6},
            "Element element_001 canvas width/height must be > 0.",
        ),
        (
            {"x": 1, "y": 2, "w": 3, "h": 4},
            {"x": 0, "y": 0, "w": 9, "h": 6},
            "Element element_001 canvas must stay within source bounds.",
        ),
        (
            {"x": 1, "y": 2, "w": 3, "h": 4},
            {"x": 2, "y": 2, "w": 3, "h": 4},
            "Element element_001 canvas must contain bbox.",
        ),
    ],
)
def test_put_state_rejects_invalid_element_geometry(
    client: TestClient,
    tmp_path: Path,
    bbox: dict[str, int],
    canvas: dict[str, int],
    detail: str,
) -> None:
    original_payload = {
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
                "canvas": {"x": 0, "y": 0, "w": 8, "h": 6},
            }
        ],
    }
    ok_response = client.put("/api/workspace/state", json=original_payload)
    assert ok_response.status_code == 200

    invalid_payload = {
        "source": original_payload["source"],
        "elements": [
            {
                "id": "element_001",
                "name": "Cat",
                "status": "proposal",
                "bbox": bbox,
                "canvas": canvas,
            }
        ],
    }

    response = client.put("/api/workspace/state", json=invalid_payload)

    assert response.status_code == 400
    assert response.json()["detail"] == detail

    state_response = client.get("/api/workspace/state")
    assert state_response.status_code == 200
    assert state_response.json() == ok_response.json()

    state_path = tmp_path / "workspace" / "state.json"
    persisted = workspace_api.json.loads(state_path.read_text(encoding="utf-8"))
    assert persisted == ok_response.json()


def test_auto_annotate_returns_410_without_generating_proposals(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    upload_response = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_synthetic_scene_bytes(), "image/png")},
    )
    assert upload_response.status_code == 200

    def fail_if_called(*args, **kwargs):
        raise AssertionError("/api/workspace/auto-annotate must not call generate_proposals")

    monkeypatch.setattr(workspace_api, "generate_proposals", fail_if_called, raising=False)

    response = client.post("/api/workspace/auto-annotate")

    assert response.status_code == 410
    assert response.json()["detail"] == (
        "Auto annotate was replaced by model-backed detection. "
        "Use /api/workspace/detect and configure a detection provider."
    )

    state_response = client.get("/api/workspace/state")
    assert state_response.status_code == 200
    assert state_response.json()["elements"] == []


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


def test_create_split_request_rejects_blank_description(client: TestClient) -> None:
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

    response = client.post(
        "/api/workspace/split-requests",
        json={
            "elementId": element["id"],
            "description": "   ",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Split description must not be blank."


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


def test_create_repair_task_writes_required_canvas_aligned_files(
    client: TestClient,
    tmp_path: Path,
) -> None:
    element_dir = _prepare_completion_element(client, tmp_path)

    mask_response = client.post(
        "/api/workspace/elements/element_001/repair/missing-mask",
        json={
            "shape": {
                "type": "rectangle",
                "coordinateSpace": "canvas",
                "bbox": {"x": 2, "y": 1, "w": 1, "h": 1},
            }
        },
    )
    assert mask_response.status_code == 200
    assert mask_response.json()["missingMaskPath"] == "elements/element_001/missing_mask.png"

    response = client.post("/api/workspace/elements/element_001/repair/task")

    assert response.status_code == 200
    body = response.json()
    element = body["state"]["elements"][0]
    assert element["status"] == "repair_pending"
    assert body["paths"] == {
        "sourceCropPath": "elements/element_001/repair/source_crop.png",
        "sceneContextPath": "elements/element_001/repair/scene_context.png",
        "incompleteAssetPath": "elements/element_001/repair/incomplete_asset.png",
        "preserveMaskPath": "elements/element_001/repair/preserve_mask.png",
        "missingMaskPath": "elements/element_001/repair/missing_mask.png",
        "guideOverlayPath": "elements/element_001/repair/guide_overlay.png",
        "repairPromptPath": "elements/element_001/repair/repair_prompt.md",
    }

    repair_dir = element_dir / "repair"
    for filename in (
        "source_crop.png",
        "scene_context.png",
        "incomplete_asset.png",
        "preserve_mask.png",
        "missing_mask.png",
        "guide_overlay.png",
        "repair_prompt.md",
    ):
        assert (repair_dir / filename).exists(), filename

    with Image.open(element_dir / "missing_mask.png") as missing_mask:
        assert missing_mask.mode == "L"
        assert missing_mask.size == (5, 4)
        assert missing_mask.getpixel((2, 1)) == 255
        assert missing_mask.getpixel((0, 0)) == 0

    with Image.open(repair_dir / "preserve_mask.png") as preserve_mask:
        assert preserve_mask.mode == "L"
        assert preserve_mask.size == (5, 4)
        assert preserve_mask.getpixel((2, 1)) == 0
        assert preserve_mask.getpixel((3, 1)) == 255

    prompt = (repair_dir / "repair_prompt.md").read_text(encoding="utf-8")
    assert "Preserve every pixel inside preserve_mask.png." in prompt
    assert "Modify only pixels inside missing_mask.png." in prompt
    assert "Do not redraw the whole object." in prompt
    assert "Output completed_asset.png with the same size as incomplete_asset.png." in prompt
    assert "Write repair_report.json." in prompt


def test_missing_mask_update_invalidates_completed_repair_state(
    client: TestClient,
    tmp_path: Path,
) -> None:
    element_dir = _prepare_repair_package(client, tmp_path)
    repair_dir = element_dir / "repair"
    validate_response = _validate_repair_package_with_missing_pixel(client, repair_dir)
    repaired_element = validate_response.json()["state"]["elements"][0]
    assert repaired_element["repairStatus"] == "repair_complete"
    assert repaired_element["exportStatus"] == "ready"

    response = client.post(
        "/api/workspace/elements/element_001/repair/missing-mask",
        json={
            "shape": {
                "type": "rectangle",
                "coordinateSpace": "canvas",
                "bbox": {"x": 1, "y": 1, "w": 1, "h": 1},
            }
        },
    )

    assert response.status_code == 200
    element = response.json()["state"]["elements"][0]
    assert element["status"] == "extracted"
    assert element["mode"] == "needs_completion"
    assert element["repairStatus"] == "required"
    assert element["exportStatus"] == "blocked"


def test_repair_metadata_reports_files_and_latest_qa(
    client: TestClient,
    tmp_path: Path,
) -> None:
    element_dir = _prepare_repair_package(client, tmp_path)
    repair_dir = element_dir / "repair"

    package_metadata = client.get("/api/workspace/elements/element_001/repair/metadata")
    assert package_metadata.status_code == 200
    body = package_metadata.json()
    assert body["elementId"] == "element_001"
    assert body["files"]["missingMask"] is True
    assert body["files"]["repairPackage"] is True
    assert body["files"]["completedAsset"] is False
    assert body["files"]["repairReport"] is False
    assert body["files"]["qaReport"] is False
    assert body["paths"]["missingMaskPath"] == "elements/element_001/missing_mask.png"
    assert body["paths"]["completedAssetPath"] is None
    assert body["qaReport"] is None

    with Image.open(repair_dir / "incomplete_asset.png") as incomplete:
        completed = incomplete.convert("RGBA")
    completed.putpixel((2, 1), (250, 120, 10, 255))
    completed.save(repair_dir / "completed_asset.png", format="PNG")
    (repair_dir / "repair_report.json").write_text('{"summary":"filled missing pixel"}', encoding="utf-8")
    validate_response = client.post("/api/workspace/elements/element_001/repair/validate")
    assert validate_response.status_code == 200

    qa_metadata = client.get("/api/workspace/elements/element_001/repair/metadata")

    assert qa_metadata.status_code == 200
    body = qa_metadata.json()
    assert body["files"]["completedAsset"] is True
    assert body["files"]["repairReport"] is True
    assert body["files"]["qaReport"] is True
    assert body["files"]["changedPixelsOverlay"] is True
    assert body["paths"]["completedAssetPath"] == "elements/element_001/repair/completed_asset.png"
    assert body["paths"]["changedPixelsOverlayPath"] == (
        "elements/element_001/repair/changed_pixels_overlay.png"
    )
    assert body["qaReport"]["status"] == "pass"


def test_repair_validate_requires_repair_workflow_and_package(
    client: TestClient,
    tmp_path: Path,
) -> None:
    element_dir = _prepare_completion_element(client, tmp_path, mode="visible_only")

    response = client.post("/api/workspace/elements/element_001/repair/validate")

    assert response.status_code == 400
    assert response.json()["detail"] == "Element element_001 is not in the repair workflow."
    state = client.get("/api/workspace/state").json()
    assert state["elements"][0]["status"] == "extracted"
    assert state["elements"][0]["mode"] == "visible_only"
    assert not (element_dir / "repair" / "qa_report.json").exists()


def test_repair_validate_requires_existing_repair_package(
    client: TestClient,
    tmp_path: Path,
) -> None:
    element_dir = _prepare_completion_element(client, tmp_path)

    response = client.post("/api/workspace/elements/element_001/repair/validate")

    assert response.status_code == 400
    assert response.json()["detail"] == "Element element_001 needs a repair task package before validation."
    state = client.get("/api/workspace/state").json()
    assert state["elements"][0]["status"] == "extracted"
    assert state["elements"][0]["mode"] == "needs_completion"
    assert not (element_dir / "repair" / "qa_report.json").exists()


def test_repair_qa_fails_if_repair_authority_is_missing(
    client: TestClient,
    tmp_path: Path,
) -> None:
    element_dir = _prepare_repair_package(client, tmp_path)
    repair_dir = element_dir / "repair"
    authority_path = element_dir / "repair_authority.json"
    authority_path.unlink(missing_ok=True)

    with Image.open(repair_dir / "incomplete_asset.png") as incomplete:
        completed = incomplete.convert("RGBA")
    completed.putpixel((2, 1), (250, 120, 10, 255))
    completed.save(repair_dir / "completed_asset.png", format="PNG")
    (repair_dir / "repair_report.json").write_text('{"summary":"filled missing pixel"}', encoding="utf-8")

    response = client.post("/api/workspace/elements/element_001/repair/validate")

    assert response.status_code == 200
    body = response.json()
    assert body["qa"]["status"] == "fail"
    assert "repair_authority_missing" in body["qa"]["reasons"]
    assert body["state"]["elements"][0]["status"] == "qa_failed"


def test_missing_mask_rejects_rectangle_outside_asset_canvas(
    client: TestClient,
    tmp_path: Path,
) -> None:
    element_dir = _prepare_completion_element(client, tmp_path)

    response = client.post(
        "/api/workspace/elements/element_001/repair/missing-mask",
        json={
            "shape": {
                "type": "rectangle",
                "coordinateSpace": "canvas",
                "bbox": {"x": 4, "y": 1, "w": 2, "h": 1},
            }
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "Missing mask rectangle for element element_001 must stay inside the 5 x 4 asset canvas."
    )
    assert not (element_dir / "missing_mask.png").exists()


def test_repair_qa_fails_if_preserved_pixels_change(
    client: TestClient,
    tmp_path: Path,
) -> None:
    element_dir = _prepare_repair_package(client, tmp_path)
    repair_dir = element_dir / "repair"

    with Image.open(repair_dir / "incomplete_asset.png") as incomplete:
        completed = incomplete.convert("RGBA")
    completed.putpixel((3, 1), (1, 2, 3, 255))
    completed.save(repair_dir / "completed_asset.png", format="PNG")
    (repair_dir / "repair_report.json").write_text('{"summary":"changed preserved"}', encoding="utf-8")

    response = client.post("/api/workspace/elements/element_001/repair/validate")

    assert response.status_code == 200
    body = response.json()
    assert body["qa"]["status"] == "fail"
    assert "preserve_pixels_changed" in body["qa"]["reasons"]
    assert body["qa"]["metrics"]["preserveChangedPixels"] == 1
    assert body["state"]["elements"][0]["status"] == "qa_failed"


def test_repair_qa_fails_if_pixels_appear_outside_missing_mask(
    client: TestClient,
    tmp_path: Path,
) -> None:
    element_dir = _prepare_repair_package(client, tmp_path)
    repair_dir = element_dir / "repair"

    with Image.open(repair_dir / "incomplete_asset.png") as incomplete:
        completed = incomplete.convert("RGBA")
    completed.putpixel((0, 0), (20, 30, 40, 255))
    completed.save(repair_dir / "completed_asset.png", format="PNG")
    (repair_dir / "repair_report.json").write_text('{"summary":"outside edit"}', encoding="utf-8")

    response = client.post("/api/workspace/elements/element_001/repair/validate")

    assert response.status_code == 200
    body = response.json()
    assert body["qa"]["status"] == "fail"
    assert "pixels_changed_outside_missing_mask" in body["qa"]["reasons"]
    assert body["qa"]["metrics"]["outsideMissingChangedPixels"] == 1
    assert body["state"]["elements"][0]["status"] == "qa_failed"


def test_repair_qa_uses_canonical_artifacts_when_package_inputs_are_tampered(
    client: TestClient,
    tmp_path: Path,
) -> None:
    element_dir = _prepare_repair_package(client, tmp_path)
    repair_dir = element_dir / "repair"

    Image.new("RGBA", (5, 4), (0, 0, 0, 0)).save(
        repair_dir / "incomplete_asset.png",
        format="PNG",
    )
    Image.new("L", (5, 4), 0).save(repair_dir / "preserve_mask.png", format="PNG")
    Image.new("L", (5, 4), 255).save(repair_dir / "missing_mask.png", format="PNG")
    Image.new("RGBA", (5, 4), (8, 9, 10, 255)).save(
        repair_dir / "completed_asset.png",
        format="PNG",
    )
    (repair_dir / "repair_report.json").write_text('{"summary":"full redraw"}', encoding="utf-8")

    validate_response = client.post("/api/workspace/elements/element_001/repair/validate")

    assert validate_response.status_code == 200
    qa = validate_response.json()["qa"]
    assert qa["status"] == "fail"
    assert "preserve_pixels_changed" in qa["reasons"]
    assert "pixels_changed_outside_missing_mask" in qa["reasons"]
    assert qa["metrics"]["insideMissingChangedPixels"] == 1
    assert qa["metrics"]["outsideMissingChangedPixels"] > 0

    export_response = client.post("/api/workspace/export")

    assert export_response.status_code == 200
    body = export_response.json()
    assert body["exportableCount"] == 0
    assert body["blockedElements"] == [
        {
            "elementId": "element_001",
            "name": "Cup",
            "reason": "needs_completion_without_valid_repair",
        }
    ]
    assert not (tmp_path / "workspace" / "export" / "assets" / "element_001.png").exists()


def test_repair_qa_passes_for_missing_mask_only_edit(
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

    response = client.post("/api/workspace/elements/element_001/repair/validate")

    assert response.status_code == 200
    body = response.json()
    assert body["qa"]["status"] == "pass"
    assert body["qa"]["reasons"] == []
    assert body["qa"]["metrics"]["insideMissingChangedPixels"] == 1
    assert body["qa"]["changedPixelsOverlayPath"] == (
        "elements/element_001/repair/changed_pixels_overlay.png"
    )
    assert (repair_dir / "changed_pixels_overlay.png").exists()
    assert (repair_dir / "qa_report.json").exists()
    element = body["state"]["elements"][0]
    assert element["status"] == "repair_complete"
    assert element["mode"] == "completed_by_codex"


def test_repair_qa_fails_when_missing_pixels_are_unchanged(
    client: TestClient,
    tmp_path: Path,
) -> None:
    element_dir = _prepare_repair_package(client, tmp_path)
    repair_dir = element_dir / "repair"

    with Image.open(repair_dir / "incomplete_asset.png") as incomplete:
        completed = incomplete.convert("RGBA")
    completed.save(repair_dir / "completed_asset.png", format="PNG")
    (repair_dir / "repair_report.json").write_text('{"summary":"no changes"}', encoding="utf-8")

    response = client.post("/api/workspace/elements/element_001/repair/validate")

    assert response.status_code == 200
    body = response.json()
    assert body["qa"]["status"] == "fail"
    assert "missing_pixels_unchanged" in body["qa"]["reasons"]
    assert body["qa"]["metrics"]["missingMaskPixels"] == 1
    assert body["qa"]["metrics"]["insideMissingChangedPixels"] == 0
    assert body["state"]["elements"][0]["status"] == "qa_failed"


def test_repair_qa_fails_for_wrong_size_completed_asset(
    client: TestClient,
    tmp_path: Path,
) -> None:
    element_dir = _prepare_repair_package(client, tmp_path)
    repair_dir = element_dir / "repair"

    completed = Image.new("RGBA", (6, 4), (1, 2, 3, 255))
    completed.save(repair_dir / "completed_asset.png", format="PNG")
    (repair_dir / "repair_report.json").write_text('{"summary":"wrong size"}', encoding="utf-8")

    response = client.post("/api/workspace/elements/element_001/repair/validate")

    assert response.status_code == 200
    body = response.json()
    assert body["qa"]["status"] == "fail"
    assert "completed_asset_wrong_dimensions" in body["qa"]["reasons"]
    assert body["state"]["elements"][0]["status"] == "qa_failed"
    assert body["state"]["elements"][0]["repairStatus"] == "qa_failed"
    assert body["state"]["elements"][0]["exportStatus"] == "blocked"


def test_repair_qa_fails_for_completed_asset_without_alpha(
    client: TestClient,
    tmp_path: Path,
) -> None:
    element_dir = _prepare_repair_package(client, tmp_path)
    repair_dir = element_dir / "repair"

    completed = Image.new("RGB", (5, 4), (1, 2, 3))
    completed.save(repair_dir / "completed_asset.png", format="PNG")
    (repair_dir / "repair_report.json").write_text('{"summary":"rgb only"}', encoding="utf-8")

    response = client.post("/api/workspace/elements/element_001/repair/validate")

    assert response.status_code == 200
    body = response.json()
    assert body["qa"]["status"] == "fail"
    assert "completed_asset_missing_alpha" in body["qa"]["reasons"]
    assert body["state"]["elements"][0]["status"] == "qa_failed"


@pytest.mark.parametrize(
    ("report_contents", "expected_reason"),
    [
        (None, "repair_report_missing"),
        ("{not valid json", "repair_report_invalid_json"),
    ],
)
def test_repair_qa_requires_valid_repair_report(
    client: TestClient,
    tmp_path: Path,
    report_contents: str | None,
    expected_reason: str,
) -> None:
    element_dir = _prepare_repair_package(client, tmp_path)
    repair_dir = element_dir / "repair"

    with Image.open(repair_dir / "incomplete_asset.png") as incomplete:
        completed = incomplete.convert("RGBA")
    completed.putpixel((2, 1), (250, 120, 10, 255))
    completed.save(repair_dir / "completed_asset.png", format="PNG")
    if report_contents is not None:
        (repair_dir / "repair_report.json").write_text(report_contents, encoding="utf-8")

    response = client.post("/api/workspace/elements/element_001/repair/validate")

    assert response.status_code == 200
    body = response.json()
    assert body["qa"]["status"] == "fail"
    assert expected_reason in body["qa"]["reasons"]
    assert body["state"]["elements"][0]["status"] == "qa_failed"


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


def test_export_completed_repair_mask_matches_completed_asset_alpha(
    client: TestClient,
    tmp_path: Path,
) -> None:
    element_dir = _prepare_repair_package(client, tmp_path)
    repair_dir = element_dir / "repair"

    with Image.open(element_dir / "asset_incomplete.png") as incomplete:
        completed = incomplete.convert("RGBA")
    completed.putpixel((2, 1), (12, 34, 56, 255))
    completed.save(repair_dir / "completed_asset.png", format="PNG")
    (repair_dir / "repair_report.json").write_text('{"summary":"filled missing pixel"}', encoding="utf-8")

    response = client.post("/api/workspace/export")

    assert response.status_code == 200
    body = response.json()
    assert body["exportableCount"] == 1
    assert body["blockedCount"] == 0
    assert body["exportedElements"][0]["sourceAssetPath"] == (
        "elements/element_001/repair/completed_asset.png"
    )
    assert body["exportedElements"][0]["maskPath"] == "export/masks/element_001.png"

    with Image.open(repair_dir / "completed_asset.png") as exported_source:
        expected_mask = exported_source.getchannel("A").point(lambda value: 255 if value > 0 else 0)
    with Image.open(tmp_path / "workspace" / "export" / "masks" / "element_001.png") as mask:
        assert mask.mode == "L"
        assert list(mask.getdata()) == list(expected_mask.getdata())
        assert mask.getpixel((2, 1)) == 255


def test_export_accepts_warn_repair_qa_and_carries_warning(
    client: TestClient,
    tmp_path: Path,
) -> None:
    element_dir = _prepare_repair_package(
        client,
        tmp_path,
        missing_bbox={"x": 0, "y": 0, "w": 5, "h": 3},
    )
    repair_dir = element_dir / "repair"

    with Image.open(element_dir / "asset_incomplete.png") as incomplete:
        completed = incomplete.convert("RGBA")
    completed.putpixel((0, 0), (12, 34, 56, 255))
    completed.save(repair_dir / "completed_asset.png", format="PNG")
    (repair_dir / "repair_report.json").write_text('{"summary":"usable with warning"}', encoding="utf-8")

    response = client.post("/api/workspace/export")

    assert response.status_code == 200
    body = response.json()
    assert body["exportableCount"] == 1
    assert body["blockedCount"] == 0
    assert body["exportedElements"][0]["warnings"] == [
        "repair QA warning: missing_area_ratio_high"
    ]
    assert body["warnings"] == [
        "element_001 repair QA warning: missing_area_ratio_high"
    ]

    qa_report = workspace_api.json.loads(
        (tmp_path / "workspace" / "export" / "qa_report.json").read_text(encoding="utf-8")
    )
    assert qa_report["repairQaReports"]["element_001"]["status"] == "warn"
    assert qa_report["warnings"] == body["warnings"]


def test_failed_export_preserves_previous_export_manifest(
    client: TestClient,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _prepare_completion_element(client, tmp_path, mode="visible_only")
    _promote_visible_element_to_sam2_accepted(client, tmp_path)
    export_dir = tmp_path / "workspace" / "export"
    export_dir.mkdir(parents=True, exist_ok=True)
    marker_path = export_dir / "manifest.json"
    marker_path.write_text('{"marker":"previous export"}', encoding="utf-8")

    def fail_copy(*args: object, **kwargs: object) -> None:
        _ = args
        _ = kwargs
        raise ValueError("simulated export copy failure")

    monkeypatch.setattr(workspace_exporter, "_copy_workspace_file", fail_copy)

    response = client.post("/api/workspace/export")

    assert response.status_code == 400
    assert response.json()["detail"] == "simulated export copy failure"
    assert marker_path.read_text(encoding="utf-8") == '{"marker":"previous export"}'


def test_export_uses_completed_asset_after_repair_qa_pass(
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
    element = validate_response.json()["state"]["elements"][0]
    assert element["repairStatus"] == "repair_complete"
    assert element["exportStatus"] == "ready"

    response = client.post("/api/workspace/export")

    assert response.status_code == 200
    body = response.json()
    assert body["exportableCount"] == 1
    assert body["blockedCount"] == 0
    assert body["exportedElements"][0]["sourceAssetPath"] == "elements/element_001/repair/completed_asset.png"
    assert body["exportedElements"][0]["assetPath"] == "export/assets/element_001.png"

    export_asset = tmp_path / "workspace" / "export" / "assets" / "element_001.png"
    with Image.open(export_asset) as image:
        assert image.getpixel((2, 1)) == (250, 120, 10, 255)

    qa_report = workspace_api.json.loads(
        (tmp_path / "workspace" / "export" / "qa_report.json").read_text(encoding="utf-8")
    )
    assert qa_report["repairQaReports"]["element_001"]["status"] == "pass"


def test_export_revalidates_repair_when_completed_asset_changes_after_qa(
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
    assert validate_response.json()["qa"]["status"] == "pass"

    with Image.open(repair_dir / "completed_asset.png") as validated:
        stale_completed = validated.convert("RGBA")
    stale_completed.putpixel((0, 0), (12, 34, 56, 255))
    stale_completed.save(repair_dir / "completed_asset.png", format="PNG")

    response = client.post("/api/workspace/export")

    assert response.status_code == 200
    body = response.json()
    assert body["exportableCount"] == 0
    assert body["blockedCount"] == 1
    assert body["blockedElements"] == [
        {
            "elementId": "element_001",
            "name": "Cup",
            "reason": "needs_completion_without_valid_repair",
        }
    ]

    qa_report = workspace_api.json.loads(
        (tmp_path / "workspace" / "export" / "qa_report.json").read_text(encoding="utf-8")
    )
    assert qa_report["repairQaReports"]["element_001"]["status"] == "fail"
    assert "pixels_changed_outside_missing_mask" in qa_report["repairQaReports"]["element_001"]["reasons"]
    assert not (tmp_path / "workspace" / "export" / "assets" / "element_001.png").exists()


def _prepare_repair_package(
    client: TestClient,
    tmp_path: Path,
    missing_bbox: dict[str, int] | None = None,
) -> Path:
    element_dir = _prepare_completion_element(client, tmp_path)
    bbox = missing_bbox or {"x": 2, "y": 1, "w": 1, "h": 1}
    mask_response = client.post(
        "/api/workspace/elements/element_001/repair/missing-mask",
        json={
            "shape": {
                "type": "rectangle",
                "coordinateSpace": "canvas",
                "bbox": bbox,
            }
        },
    )
    assert mask_response.status_code == 200
    task_response = client.post("/api/workspace/elements/element_001/repair/task")
    assert task_response.status_code == 200
    return element_dir


def _validate_repair_package_with_missing_pixel(
    client: TestClient,
    repair_dir: Path,
):
    with Image.open(repair_dir / "incomplete_asset.png") as incomplete:
        completed = incomplete.convert("RGBA")
    completed.putpixel((2, 1), (250, 120, 10, 255))
    completed.save(repair_dir / "completed_asset.png", format="PNG")
    (repair_dir / "repair_report.json").write_text(
        '{"summary":"filled missing pixel"}',
        encoding="utf-8",
    )
    validate_response = client.post("/api/workspace/elements/element_001/repair/validate")
    assert validate_response.status_code == 200
    assert validate_response.json()["qa"]["status"] == "pass"
    return validate_response


def _promote_visible_element_to_sam2_accepted(client: TestClient, tmp_path: Path) -> None:
    element_dir = tmp_path / "workspace" / "elements" / "element_001"
    sam2_dir = element_dir / "sam2_edge"
    sam2_dir.mkdir(parents=True, exist_ok=True)
    with Image.open(element_dir / "source_crop.png") as source_crop:
        source_crop.save(sam2_dir / "source_crop.png", format="PNG")
    with Image.open(element_dir / "mask.png") as mask:
        mask.save(sam2_dir / "mask.png", format="PNG")
    with Image.open(element_dir / "asset_incomplete.png") as asset:
        asset.save(sam2_dir / "transparent_asset.png", format="PNG")

    state = client.get("/api/workspace/state").json()
    for element in state["elements"]:
        if element["id"] == "element_001":
            element["segmentationStatus"] = "mask_accepted"
            element["segmentationQuality"] = {
                "selectedProfile": "fixture",
                "candidateCount": 1,
                "foregroundArea": 4,
                "detachedArea": 0,
                "filledHoleCount": 0,
                "filledHoleArea": 0,
                "removedDetachedCount": 0,
                "removedDetachedArea": 0,
                "supportPointCount": 0,
                "missedSupportPointCount": 0,
            }
            element["mask"] = "elements/element_001/sam2_edge/mask.png"
            element["exportStatus"] = "ready"
    assert client.put("/api/workspace/state", json=state).status_code == 200


def _prepare_completion_element(
    client: TestClient,
    tmp_path: Path,
    mode: str = "needs_completion",
) -> Path:
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
                    "mode": mode,
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
    return tmp_path / "workspace" / "elements" / "element_001"
