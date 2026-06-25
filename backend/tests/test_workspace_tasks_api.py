from __future__ import annotations

import asyncio
import json
import time
from io import BytesIO
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from art_pipeline.api import create_app
from art_pipeline.http.routes.tasks import _task_event_stream
from art_pipeline.workspace.tasks import (
    WorkspaceTaskItem,
    create_workspace_task,
    set_task_item_status,
)
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


def test_task_events_reports_detection_item_status_changes(tmp_path: Path) -> None:
    root = tmp_path / "workspace"
    task = create_workspace_task(
        root,
        "detection_batch",
        [WorkspaceTaskItem(elementId="element_001", name="Cat")],
    )
    set_task_item_status(root, task.taskId, "element_001", "running", "Preparing detection candidate.")

    async def collect_snapshots() -> tuple[dict[str, Any], dict[str, Any]]:
        stream = _task_event_stream(_DisconnectAfter(checks=2), root)
        first = _snapshot_payload(await anext(stream))
        set_task_item_status(root, task.taskId, "element_001", "succeeded", "Detection candidate ready.")
        second = _snapshot_payload(await asyncio.wait_for(anext(stream), timeout=0.1))
        await stream.aclose()
        return first, second

    first_snapshot, next_snapshot = asyncio.run(collect_snapshots())
    assert "element_001" in first_snapshot["changedElementIds"]
    assert "element_001" in next_snapshot["changedElementIds"]


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


def test_sam2_batch_force_reruns_explicit_existing_mask_targets(tmp_path: Path) -> None:
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
            "name": "Accepted bad mask",
            "segmentationStatus": "mask_accepted",
            "mask": "elements/element_002/sam2_edge/mask.png",
        }
    )
    assert client.put("/api/workspace/state", json=state).status_code == 200

    response = client.post(
        "/api/workspace/tasks/sam2-masks",
        json={"elementIds": ["element_001", "element_002"], "force": True},
    )

    assert response.status_code == 200
    task = _wait_for_task(client, response.json()["taskId"])
    assert task["total"] == 2
    assert task["done"] == 2
    assert [item["elementId"] for item in task["items"]] == ["element_001", "element_002"]
    assert _item(task, "element_001")["status"] == "succeeded"
    assert _item(task, "element_002")["status"] == "succeeded"


def test_sam2_batch_force_explicit_ids_still_excludes_invalid_assets(tmp_path: Path) -> None:
    provider = SelectiveSam2Provider()
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=provider))
    _upload_scene_and_state(client)
    state = client.get("/api/workspace/state").json()
    state["elements"].extend(
        [
            {
                **state["elements"][0],
                "id": "element_hidden",
                "name": "Hidden asset",
                "visible": False,
                "mask": "elements/element_hidden/sam2_edge/mask.png",
                "segmentationStatus": "mask_suggested",
            },
            {
                **state["elements"][0],
                "id": "element_merged",
                "name": "Merged asset",
                "mergedInto": "element_001",
                "mask": "elements/element_merged/sam2_edge/mask.png",
                "segmentationStatus": "mask_suggested",
            },
            {
                **state["elements"][0],
                "id": "element_skip",
                "name": "Skip asset",
                "assetRole": "skip",
                "mask": "elements/element_skip/sam2_edge/mask.png",
                "segmentationStatus": "mask_suggested",
            },
        ]
    )
    assert client.put("/api/workspace/state", json=state).status_code == 200

    response = client.post(
        "/api/workspace/tasks/sam2-masks",
        json={
            "elementIds": ["element_001", "element_hidden", "element_merged", "element_skip"],
            "force": True,
        },
    )

    assert response.status_code == 200
    task = _wait_for_task(client, response.json()["taskId"])
    assert task["total"] == 1
    assert [item["elementId"] for item in task["items"]] == ["element_001"]


def test_sam2_batch_child_failure_does_not_cascade_to_parent_item(tmp_path: Path) -> None:
    provider = SelectiveSam2Provider({"child"})
    client = TestClient(create_app(tmp_path / "workspace", sam2_provider=provider))
    _upload_scene_and_state(client)
    state = client.get("/api/workspace/state").json()
    state["elements"] = [
        {
            **state["elements"][0],
            "id": "child",
            "name": "plant + bottle",
            "assetRole": "removable_child",
            "parentId": "parent",
            "removeFromParent": "parent",
            "bbox": {"x": 4, "y": 3, "w": 3, "h": 2},
            "canvas": {"x": 4, "y": 3, "w": 3, "h": 2},
            "mask": None,
            "segmentationStatus": "not_started",
            "segmentationQuality": None,
        },
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
    ]
    assert client.put("/api/workspace/state", json=state).status_code == 200

    response = client.post("/api/workspace/tasks/sam2-masks")

    assert response.status_code == 200
    task = _wait_for_task(client, response.json()["taskId"])
    assert task["status"] == "failed"
    assert task["failed"] == 1
    assert _item(task, "child")["status"] == "failed"
    assert _item(task, "parent")["status"] == "succeeded"
    next_state = client.get("/api/workspace/state").json()
    by_id = {element["id"]: element for element in next_state["elements"]}
    assert by_id["child"]["segmentationStatus"] == "not_started"
    assert by_id["parent"]["segmentationStatus"] == "mask_suggested"


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


class _DisconnectAfter:
    def __init__(self, checks: int) -> None:
        self.checks = checks
        self.seen = 0

    async def is_disconnected(self) -> bool:
        self.seen += 1
        return self.seen > self.checks


def _snapshot_payload(event: str) -> dict[str, Any]:
    assert event.startswith("event: snapshot")
    for line in event.splitlines():
        if line.startswith("data: "):
            return json.loads(line.removeprefix("data: "))
    raise AssertionError("Snapshot event has no data payload")


def _scene_png_bytes() -> bytes:
    image = Image.new("RGBA", (8, 6), (120, 45, 200, 255))
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()
