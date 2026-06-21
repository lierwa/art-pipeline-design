from __future__ import annotations

import json
import time
from io import BytesIO
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from art_pipeline.api import create_app
from art_pipeline.codex_assets import CodexAssetRequest
from workspace_fixtures import upload_scene_and_state as _upload_scene_and_state


class SelectiveSam2Provider:
    name = "fake_sam2"

    def __init__(self, failing_element_ids: set[str] | None = None) -> None:
        self.failing_element_ids = failing_element_ids or set()

    def detect(self, image: Image.Image, prompt: dict[str, Any]) -> Image.Image | None:
        element_id = str(prompt["elementId"])
        if element_id in self.failing_element_ids:
            return None
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


class FakeCodexProvider:
    name = "codex_cli"

    def __init__(self, failing_element_ids: set[str] | None = None) -> None:
        self.failing_element_ids = failing_element_ids or set()
        self.requests: list[CodexAssetRequest] = []

    def generate(self, request: CodexAssetRequest) -> None:
        self.requests.append(request)
        if request.element_id in self.failing_element_ids:
            raise RuntimeError(f"boom {request.element_id}")
        with Image.open(request.reference_image_path) as reference:
            reference.convert("RGBA").save(request.output_path, format="PNG")


def test_sam2_batch_task_records_success_and_failure_items(tmp_path: Path) -> None:
    provider = SelectiveSam2Provider({"element_002"})
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=provider))
    _upload_scene_and_state(client)
    state = client.get("/api/workspace/state").json()
    state["elements"].append(
        {
            **state["elements"][0],
            "id": "element_002",
            "name": "Broken sticker",
            "bbox": {"x": 1, "y": 1, "w": 3, "h": 3},
            "canvas": {"x": 0, "y": 0, "w": 6, "h": 5},
            "mask": None,
            "segmentationStatus": "not_started",
            "segmentationQuality": None,
        }
    )
    state["elements"].append(
        {
            **state["elements"][0],
            "id": "element_003",
            "name": "Merged source",
            "visible": False,
            "mergedInto": "element_001",
            "mask": None,
            "segmentationStatus": "not_started",
            "segmentationQuality": None,
        }
    )
    assert client.put("/api/workspace/state", json=state).status_code == 200

    response = client.post("/api/workspace/tasks/sam2-masks")

    assert response.status_code == 200
    task = _wait_for_task(client, response.json()["taskId"])
    assert task["type"] == "sam2_mask_batch"
    assert task["status"] == "failed"
    assert task["total"] == 2
    assert task["done"] == 1
    assert task["failed"] == 1
    assert task["skipped"] == 0
    assert _item(task, "element_001")["status"] == "succeeded"
    assert _item(task, "element_002")["status"] == "failed"
    assert "did not return a mask" in _item(task, "element_002")["message"]

    persisted_task = json.loads(
        (
            tmp_path
            / "workspace"
            / "tasks"
            / f"{task['taskId']}.json"
        ).read_text(encoding="utf-8")
    )
    assert persisted_task["failed"] == 1
    next_state = client.get("/api/workspace/state").json()
    assert next_state["elements"][0]["segmentationStatus"] == "mask_suggested"
    assert next_state["elements"][1]["segmentationStatus"] == "not_started"


def test_sam2_batch_only_targets_masks_that_still_need_generation(tmp_path: Path) -> None:
    provider = SelectiveSam2Provider()
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=provider))
    _upload_scene_and_state(client)
    first_task = client.post("/api/workspace/tasks/sam2-masks").json()
    _wait_for_task(client, first_task["taskId"])
    state = client.get("/api/workspace/state").json()
    state["elements"].append(
        {
            **state["elements"][0],
            "id": "element_002",
            "name": "New pending sticker",
            "bbox": {"x": 1, "y": 1, "w": 3, "h": 3},
            "canvas": {"x": 0, "y": 0, "w": 6, "h": 5},
            "mask": None,
            "segmentationStatus": "not_started",
            "segmentationQuality": None,
        }
    )
    state["elements"].append(
        {
            **state["elements"][0],
            "id": "element_003",
            "name": "Merged source",
            "visible": False,
            "mergedInto": "element_002",
            "mask": None,
            "segmentationStatus": "not_started",
            "segmentationQuality": None,
        }
    )
    assert client.put("/api/workspace/state", json=state).status_code == 200

    response = client.post("/api/workspace/tasks/sam2-masks")

    assert response.status_code == 200
    task = _wait_for_task(client, response.json()["taskId"])
    assert task["total"] == 1
    assert task["done"] == 1
    assert task["failed"] == 0
    assert task["skipped"] == 0
    assert [item["elementId"] for item in task["items"]] == ["element_002"]


def test_sam2_batch_with_no_pending_masks_finishes_immediately(tmp_path: Path) -> None:
    provider = SelectiveSam2Provider()
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=provider))
    _upload_scene_and_state(client)
    first_task = client.post("/api/workspace/tasks/sam2-masks").json()
    _wait_for_task(client, first_task["taskId"])

    response = client.post("/api/workspace/tasks/sam2-masks")

    assert response.status_code == 200
    task = response.json()
    assert task["status"] == "succeeded"
    assert task["total"] == 0
    assert task["items"] == []


def test_sam2_batch_regenerates_stale_mask_draft_without_artifacts(tmp_path: Path) -> None:
    provider = SelectiveSam2Provider()
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=provider))
    _upload_scene_and_state(client)
    state = client.get("/api/workspace/state").json()
    state["elements"][0]["segmentationStatus"] = "mask_suggested"
    state["elements"][0]["mask"] = "elements/element_001/sam2_edge/mask.png"
    assert client.put("/api/workspace/state", json=state).status_code == 200

    response = client.post("/api/workspace/tasks/sam2-masks")

    assert response.status_code == 200
    task = _wait_for_task(client, response.json()["taskId"])
    assert task["total"] == 1
    assert task["done"] == 1
    next_state = client.get("/api/workspace/state").json()
    assert next_state["elements"][0]["segmentationStatus"] == "mask_suggested"


def test_codex_final_batch_task_generates_mask_accepted_assets_and_retries_failed(
    tmp_path: Path,
) -> None:
    codex_provider = FakeCodexProvider({"element_002"})
    client = TestClient(
        create_app(
            tmp_path / "workspace",
            sam2_provider=SelectiveSam2Provider(),
            codex_asset_provider=codex_provider,
        )
    )
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
        }
    )
    assert client.put("/api/workspace/state", json=state).status_code == 200
    sam2_task = client.post("/api/workspace/tasks/sam2-masks").json()
    _wait_for_task(client, sam2_task["taskId"])
    for element_id in ("element_001", "element_002"):
        assert client.post(f"/api/workspace/elements/{element_id}/segment/accept").status_code == 200

    response = client.post("/api/workspace/tasks/codex-finals")

    assert response.status_code == 200
    task = _wait_for_task(client, response.json()["taskId"])
    assert task["type"] == "codex_final_batch"
    assert task["status"] == "failed"
    assert task["total"] == 2
    assert task["done"] == 1
    assert task["failed"] == 1
    assert _item(task, "element_001")["status"] == "succeeded"
    assert _item(task, "element_002")["status"] == "failed"
    assert "boom element_002" in _item(task, "element_002")["message"]
    assert len(codex_provider.requests) == 2

    codex_provider.failing_element_ids.clear()
    retry_response = client.post(f"/api/workspace/tasks/{task['taskId']}/retry-failed")
    assert retry_response.status_code == 200
    retry_task = _wait_for_task(client, retry_response.json()["taskId"])
    assert retry_task["total"] == 1
    assert retry_task["done"] == 1
    assert [item["elementId"] for item in retry_task["items"]] == ["element_002"]
    assert len(codex_provider.requests) == 3


def test_task_list_and_detail_are_scoped_to_processing_record(tmp_path: Path) -> None:
    provider = SelectiveSam2Provider()
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=provider))
    create_response = client.post(
        "/api/workspace/runs",
        files={"file": ("scene.png", _scene_png_bytes(), "image/png")},
    )
    run_id = create_response.json()["run"]["id"]
    state = {
        "source": create_response.json()["state"]["source"],
        "elements": [
            {
                "id": "element_001",
                "name": "Run sticker",
                "status": "accepted",
                "mode": "visible_only",
                "assetRole": "sticker",
                "bbox": {"x": 1, "y": 1, "w": 4, "h": 4},
                "canvas": {"x": 0, "y": 0, "w": 8, "h": 6},
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
    assert client.put(f"/api/workspace/state?runId={run_id}", json=state).status_code == 200

    response = client.post(f"/api/workspace/tasks/sam2-masks?runId={run_id}")

    assert response.status_code == 200
    task = _wait_for_task(client, response.json()["taskId"], run_id=run_id)
    assert task["total"] == 1
    assert task["done"] == 1
    assert _item(task, "element_001")["status"] == "succeeded"
    next_state = client.get(f"/api/workspace/state?runId={run_id}").json()
    assert next_state["elements"][0]["segmentationStatus"] == "mask_suggested"
    list_response = client.get(f"/api/workspace/tasks?runId={run_id}")
    detail_response = client.get(f"/api/workspace/tasks/{task['taskId']}?runId={run_id}")
    legacy_list_response = client.get("/api/workspace/tasks")

    assert list_response.status_code == 200
    assert [item["taskId"] for item in list_response.json()["tasks"]] == [task["taskId"]]
    assert detail_response.status_code == 200
    assert detail_response.json()["taskId"] == task["taskId"]
    assert legacy_list_response.status_code == 200
    assert legacy_list_response.json()["tasks"] == []


def _wait_for_task(client: TestClient, task_id: str, run_id: str | None = None) -> dict[str, Any]:
    suffix = f"?runId={run_id}" if run_id else ""
    for _ in range(100):
        response = client.get(f"/api/workspace/tasks/{task_id}{suffix}")
        assert response.status_code == 200
        task = response.json()
        if task["status"] in {"succeeded", "failed"}:
            return task
        time.sleep(0.01)
    raise AssertionError(f"Task {task_id} did not finish")


def _item(task: dict[str, Any], element_id: str) -> dict[str, Any]:
    for item in task["items"]:
        if item["elementId"] == element_id:
            return item
    raise AssertionError(f"Missing task item {element_id}")


def _scene_png_bytes() -> bytes:
    image = Image.new("RGBA", (8, 6), (120, 45, 200, 255))
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()
