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

def test_default_detection_vocabulary_stays_object_level_for_grounding_dino_prompt() -> None:
    assert DEFAULT_WORKSPACE_VOCABULARY == CORE_OBJECT_WORKSPACE_VOCABULARY
    assert "cat collar" not in DEFAULT_WORKSPACE_VOCABULARY
    assert "toilet tank" not in DEFAULT_WORKSPACE_VOCABULARY
    assert "floor tile" not in DEFAULT_WORKSPACE_VOCABULARY



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


def test_get_state_downgrades_expanded_default_vocabulary_to_core_objects(
    client: TestClient,
    tmp_path: Path,
) -> None:
    state_path = tmp_path / "workspace" / "state.json"
    state_path.parent.mkdir(parents=True)
    state_path.write_text(
        workspace_api.json.dumps(
            {
                "source": None,
                "elements": [],
                "detectionVocabulary": EXPANDED_DEFAULT_WORKSPACE_VOCABULARY,
            }
        ),
        encoding="utf-8",
    )

    response = client.get("/api/workspace/state")

    assert response.status_code == 200
    assert response.json()["detectionVocabulary"] == DEFAULT_WORKSPACE_VOCABULARY


def test_get_state_keeps_user_edited_detection_vocabulary(
    client: TestClient,
    tmp_path: Path,
) -> None:
    custom_vocabulary = ["cat", "custom prop"]
    state_path = tmp_path / "workspace" / "state.json"
    state_path.parent.mkdir(parents=True)
    state_path.write_text(
        workspace_api.json.dumps(
            {
                "source": None,
                "elements": [],
                "detectionVocabulary": custom_vocabulary,
            }
        ),
        encoding="utf-8",
    )

    response = client.get("/api/workspace/state")

    assert response.status_code == 200
    assert response.json()["detectionVocabulary"] == custom_vocabulary


def test_get_run_state_returns_conflict_for_corrupted_processing_record(tmp_path: Path) -> None:
    corrupting_client = TestClient(
        workspace_api.create_app(workspace_root=tmp_path / "workspace"),
        raise_server_exceptions=False,
    )
    create_response = corrupting_client.post(
        "/api/workspace/runs",
        files={"file": ("scene-a.png", make_png_bytes(), "image/png")},
    )
    run = create_response.json()["run"]
    state_path = tmp_path / "workspace" / "runs" / run["id"] / "state.json"
    state_path.write_text(f"{state_path.read_text(encoding='utf-8')} ]\n}}", encoding="utf-8")

    response = corrupting_client.get(f"/api/workspace/state?runId={run['id']}")

    assert response.status_code == 409
    assert response.json()["detail"] == "Processing record state is corrupted. Restore from backup or rerun this record."


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


def test_duplicate_run_copies_processing_record_files_and_switchable_state(
    client: TestClient,
    tmp_path: Path,
) -> None:
    create_response = client.post(
        "/api/workspace/runs",
        files={"file": ("scene-a.png", make_png_bytes(), "image/png")},
    )
    source_run = create_response.json()["run"]
    source_root = tmp_path / "workspace" / "runs" / source_run["id"]
    state = create_response.json()["state"] | {
        "elements": [
            {
                "id": "element_001",
                "name": "Checkpoint asset",
                "label": "Checkpoint asset",
                "status": "accepted",
                "mode": "visible_only",
                "assetRole": "sticker",
                "bbox": {"x": 0, "y": 0, "w": 2, "h": 2},
                "canvas": {"x": 0, "y": 0, "w": 2, "h": 2},
                "layer": 1,
                "thumbnail": "elements/element_001/thumb.png",
                "mask": None,
                "parentId": None,
                "source": "manual",
                "notes": "",
                "visible": True,
                "confidence": None,
            }
        ],
    }
    assert client.put(f"/api/workspace/state?runId={source_run['id']}", json=state).status_code == 200
    thumb_path = source_root / "elements" / "element_001" / "thumb.png"
    thumb_path.parent.mkdir(parents=True)
    thumb_path.write_bytes(make_png_bytes())

    duplicate_response = client.post(f"/api/workspace/runs/{source_run['id']}/duplicate")

    assert duplicate_response.status_code == 200
    payload = duplicate_response.json()
    duplicate_run = payload["run"]
    duplicate_root = tmp_path / "workspace" / "runs" / duplicate_run["id"]
    assert duplicate_run["id"] != source_run["id"]
    assert duplicate_run["title"] == "scene-a.png - checkpoint"
    assert duplicate_run["elementCount"] == 1
    assert payload["state"]["elements"][0]["id"] == "element_001"
    # WHY: 另存为保护的是完整 mask/缩略图产物，不只是 state.json 元数据。
    assert (duplicate_root / "elements" / "element_001" / "thumb.png").exists()
    assert (source_root / "elements" / "element_001" / "thumb.png").exists()

    scoped_state_response = client.get(f"/api/workspace/state?runId={duplicate_run['id']}")
    assert scoped_state_response.status_code == 200
    assert scoped_state_response.json()["elements"][0]["name"] == "Checkpoint asset"
    assert [run["id"] for run in payload["runs"]] == [duplicate_run["id"], source_run["id"]]


def test_duplicate_run_uses_incrementing_checkpoint_titles(client: TestClient) -> None:
    create_response = client.post(
        "/api/workspace/runs",
        files={"file": ("scene-a.png", make_png_bytes(), "image/png")},
    )
    run_id = create_response.json()["run"]["id"]

    first = client.post(f"/api/workspace/runs/{run_id}/duplicate").json()["run"]
    second = client.post(f"/api/workspace/runs/{run_id}/duplicate").json()["run"]

    assert first["title"] == "scene-a.png - checkpoint"
    assert second["title"] == "scene-a.png - checkpoint 2"


def test_duplicate_run_rejects_invalid_or_missing_record(client: TestClient) -> None:
    invalid_response = client.post("/api/workspace/runs/not-a-run/duplicate")
    missing_response = client.post("/api/workspace/runs/run_missing/duplicate")

    assert invalid_response.status_code == 400
    assert missing_response.status_code == 404


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
    assert len(replace_calls) == 1
    temp_path, target_path = replace_calls[0]
    assert target_path == state_path
    assert temp_path.parent == state_path.parent
    assert temp_path.name.startswith("state.json.")
    assert temp_path.name.endswith(".tmp")
    assert not temp_path.exists()
    assert list(state_path.parent.glob("state.json.*.tmp")) == []


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
