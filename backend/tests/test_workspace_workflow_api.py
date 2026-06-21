from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from art_pipeline.api import create_app
from art_pipeline.codex_assets import CodexAssetRequest
from workspace_fixtures import upload_scene_and_state as _upload_scene_and_state


class SelectiveSam2Provider:
    name = "fake_sam2"

    def detect(self, image: Image.Image, prompt: dict[str, Any]) -> Image.Image | None:
        mask = Image.new("L", image.size, 0)
        bbox = prompt["bbox"]
        ImageDraw.Draw(mask).rectangle(
            (
                bbox["x"],
                bbox["y"],
                bbox["x"] + bbox["w"],
                bbox["y"] + bbox["h"],
            ),
            fill=255,
        )
        return mask


class RecordingCodexProvider:
    name = "codex_cli"

    def __init__(self) -> None:
        self.requests: list[CodexAssetRequest] = []

    def generate(self, request: CodexAssetRequest) -> None:
        self.requests.append(request)
        with Image.open(request.reference_image_path) as reference:
            reference.convert("RGBA").save(request.output_path, format="PNG")


def test_workflow_get_initializes_legacy_state_stage_and_persists(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "workspace"))
    _upload_scene_and_state(client)

    response = client.get("/api/workspace/workflow")

    assert response.status_code == 200
    body = response.json()
    assert body["stage"] == "mask"
    assert body["generateSelection"] == {"element_001": True}
    assert (tmp_path / "workspace" / "workflow.json").exists()


def test_stage_mask_saves_detect_snapshot_and_creates_sam2_task(tmp_path: Path) -> None:
    client = TestClient(
        create_app(tmp_path / "workspace", sam2_provider=SelectiveSam2Provider()),
    )
    _upload_scene_and_state(client)
    state_before = client.get("/api/workspace/state").json()

    response = client.post("/api/workspace/stage/mask")

    assert response.status_code == 200
    body = response.json()
    workflow = body["workflow"]
    task = body["task"]
    assert workflow["stage"] == "mask"
    assert workflow["taskIds"]["sam2MaskBatch"] == task["taskId"]
    assert workflow["generateSelection"] == {"element_001": True}
    assert task["type"] == "sam2_mask_batch"
    assert task["total"] == 1
    assert body["state"] == state_before
    assert (tmp_path / "workspace" / "stage_snapshots" / "detect.json").exists()


def test_generate_selection_patch_keeps_only_selectable_elements(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "workspace"))
    _upload_scene_and_state(client)
    state = client.get("/api/workspace/state").json()
    state["elements"].append(
        {
            **state["elements"][0],
            "id": "element_hidden",
            "visible": False,
            "name": "Hidden",
        }
    )
    assert client.put("/api/workspace/state", json=state).status_code == 200

    response = client.patch(
        "/api/workspace/workflow/generate-selection",
        json={"generateSelection": {"element_001": False, "element_hidden": True}},
    )

    assert response.status_code == 200
    assert response.json()["generateSelection"] == {"element_001": False}


def test_stage_generate_accepts_masks_and_targets_selected_codex_jobs(tmp_path: Path) -> None:
    codex_provider = RecordingCodexProvider()
    client = TestClient(
        create_app(
            tmp_path / "workspace",
            sam2_provider=SelectiveSam2Provider(),
            codex_asset_provider=codex_provider,
        ),
    )
    _upload_scene_and_state(client)
    state = client.get("/api/workspace/state").json()
    state["elements"].append(
        {
            **state["elements"][0],
            "id": "element_002",
            "name": "Second",
            "bbox": {"x": 1, "y": 1, "w": 3, "h": 3},
            "canvas": {"x": 0, "y": 0, "w": 6, "h": 5},
            "mask": None,
            "segmentationStatus": "not_started",
            "segmentationQuality": None,
        }
    )
    assert client.put("/api/workspace/state", json=state).status_code == 200
    mask_task = client.post("/api/workspace/stage/mask").json()["task"]["taskId"]
    _wait_for_task(client, mask_task)

    response = client.post(
        "/api/workspace/stage/generate",
        json={"elementIds": ["element_002"]},
    )

    assert response.status_code == 200
    body = response.json()
    workflow = body["workflow"]
    task = body["task"]
    assert workflow["stage"] == "generate"
    assert workflow["generateSelection"]["element_001"] is False
    assert workflow["generateSelection"]["element_002"] is True
    assert workflow["taskIds"]["codexFinalBatches"] == [task["taskId"]]
    assert task["type"] == "codex_final_batch"
    assert task["total"] == 1
    assert [item["elementId"] for item in task["items"]] == ["element_002"]
    assert body["state"]["elements"][0]["segmentationStatus"] == "mask_suggested"
    assert body["state"]["elements"][1]["segmentationStatus"] == "mask_accepted"
    assert (tmp_path / "workspace" / "stage_snapshots" / "mask.json").exists()


def test_stage_back_from_generate_restores_mask_snapshot(tmp_path: Path) -> None:
    client = TestClient(
        create_app(
            tmp_path / "workspace",
            sam2_provider=SelectiveSam2Provider(),
            codex_asset_provider=RecordingCodexProvider(),
        ),
    )
    _upload_scene_and_state(client)
    mask_task = client.post("/api/workspace/stage/mask").json()["task"]["taskId"]
    _wait_for_task(client, mask_task)
    mask_state = client.get("/api/workspace/state").json()
    generate_response = client.post("/api/workspace/stage/generate", json={"elementIds": ["element_001"]})
    assert generate_response.status_code == 200
    _wait_for_task(client, generate_response.json()["task"]["taskId"])

    response = client.post("/api/workspace/stage/back")

    assert response.status_code == 200
    body = response.json()
    assert body["workflow"]["stage"] == "mask"
    assert body["state"] == mask_state
    assert body["workflow"]["taskIds"]["codexFinalBatches"] == []


def test_export_records_summary_without_leaving_generate_stage(tmp_path: Path) -> None:
    client = TestClient(
        create_app(
            tmp_path / "workspace",
            sam2_provider=SelectiveSam2Provider(),
            codex_asset_provider=RecordingCodexProvider(),
        ),
    )
    _upload_scene_and_state(client)
    mask_task = client.post("/api/workspace/stage/mask").json()["task"]["taskId"]
    _wait_for_task(client, mask_task)
    generate_task = client.post("/api/workspace/stage/generate", json={"elementIds": ["element_001"]}).json()["task"]["taskId"]
    _wait_for_task(client, generate_task)

    response = client.post("/api/workspace/export")

    assert response.status_code == 200
    workflow_response = client.get("/api/workspace/workflow")
    assert workflow_response.status_code == 200
    workflow = workflow_response.json()
    assert workflow["stage"] == "generate"
    assert workflow["lastExportSummary"]["exportableCount"] == 1


def _wait_for_task(client: TestClient, task_id: str) -> dict[str, Any]:
    for _ in range(100):
        response = client.get(f"/api/workspace/tasks/{task_id}")
        assert response.status_code == 200
        task = response.json()
        if task["status"] in {"succeeded", "failed"}:
            return task
        time.sleep(0.01)
    raise AssertionError(f"Task {task_id} did not finish")
