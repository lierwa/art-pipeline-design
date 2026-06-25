from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from art_pipeline.api import create_app
from art_pipeline.codex_assets import CodexAssetRequest
from workspace_fixtures import upload_scene_and_state


class SelectiveSam2Provider:
    name = "fake_sam2"

    def detect(self, image: Image.Image, prompt: dict[str, Any]) -> Image.Image:
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


class NearCopyReferenceCodexProvider:
    name = "codex_cli"

    def __init__(self) -> None:
        self.requests: list[CodexAssetRequest] = []

    def generate(self, request: CodexAssetRequest) -> dict[str, Any]:
        self.requests.append(request)
        with Image.open(request.reference_image_path) as reference:
            image = reference.convert("RGBA")
        bbox = image.getchannel("A").getbbox()
        assert bbox is not None
        x = (bbox[0] + bbox[2] - 1) // 2
        y = (bbox[1] + bbox[3] - 1) // 2
        red, green, blue, alpha = image.getpixel((x, y))
        image.putpixel((x, y), (min(red + 1, 255), green, blue, alpha))
        request.raw_output_path.parent.mkdir(parents=True, exist_ok=True)
        image.save(request.raw_output_path, format="PNG")
        return {}


def test_codex_final_batch_defers_near_copy_validation_to_ingest(tmp_path: Path) -> None:
    codex_provider = NearCopyReferenceCodexProvider()
    client = TestClient(
        create_app(
            tmp_path / "workspace",
            sam2_provider=SelectiveSam2Provider(),
            codex_asset_provider=codex_provider,
        )
    )
    upload_scene_and_state(client)
    sam2_task = client.post("/api/workspace/tasks/sam2-masks").json()
    _wait_for_task(client, sam2_task["taskId"])
    assert client.post("/api/workspace/elements/element_001/segment/accept").status_code == 200

    response = client.post("/api/workspace/tasks/codex-finals")

    assert response.status_code == 200
    task = _wait_for_queued_codex_task(client, response.json()["taskId"])
    assert task["status"] == "queued"
    assert task["failed"] == 0
    assert _item(task, "element_001")["status"] == "queued"
    assert _item(task, "element_001")["message"] == "Queued for Codex controller."
    assert codex_provider.requests == []
    next_state = client.get("/api/workspace/state").json()
    assert next_state["elements"][0]["sourceProvider"] != "codex_cli"


def _wait_for_task(client: TestClient, task_id: str) -> dict[str, Any]:
    return _wait_for_task_status(client, task_id, {"succeeded", "failed"})


def _wait_for_queued_codex_task(client: TestClient, task_id: str) -> dict[str, Any]:
    for _ in range(100):
        response = client.get(f"/api/workspace/tasks/{task_id}")
        assert response.status_code == 200
        task = response.json()
        if task["status"] == "queued" and task["items"]:
            item = _item(task, "element_001")
            if item["status"] == "queued" and item["message"] == "Queued for Codex controller.":
                return task
        time.sleep(0.01)
    raise AssertionError(f"Task {task_id} did not prepare queued Codex final jobs")


def _wait_for_task_status(
    client: TestClient,
    task_id: str,
    statuses: set[str],
) -> dict[str, Any]:
    for _ in range(100):
        response = client.get(f"/api/workspace/tasks/{task_id}")
        assert response.status_code == 200
        task = response.json()
        if task["status"] in statuses:
            return task
        time.sleep(0.01)
    raise AssertionError(f"Task {task_id} did not reach {statuses}")


def _item(task: dict[str, Any], element_id: str) -> dict[str, Any]:
    for item in task["items"]:
        if item["elementId"] == element_id:
            return item
    raise AssertionError(f"Missing task item {element_id}")
