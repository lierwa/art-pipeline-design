from __future__ import annotations

import time
import threading
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from art_pipeline.api import create_app
from workspace_fixtures import scene_bytes as _scene_bytes
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


class SlowDetectionProvider:
    name = "fake_detector"

    def __init__(
        self,
        results: list[dict[str, Any]],
        delay_seconds: float = 0.05,
    ) -> None:
        self.results = results
        self.delay_seconds = delay_seconds

    def detect(self, image: Image.Image, vocabulary: list[str], prompt: str) -> list[dict[str, Any]]:
        time.sleep(self.delay_seconds)
        return self.results


class StreamingDetectionProvider:
    name = "fake_detector"

    def __init__(
        self,
        results: list[dict[str, Any]],
        *,
        fail_before_first: bool = False,
        fail_after_first: bool = False,
    ) -> None:
        self.results = results
        self.fail_before_first = fail_before_first
        self.fail_after_first = fail_after_first
        self.waiting_for_second = threading.Event()
        self.release_second = threading.Event()

    def detect(self, image: Image.Image, vocabulary: list[str], prompt: str) -> list[dict[str, Any]]:
        raise AssertionError("streaming detection task should call stream_detect().")

    def stream_detect(self, image: Image.Image, vocabulary: list[str], prompt: str):
        if self.fail_before_first:
            raise RuntimeError("provider failed before first result")
        for index, result in enumerate(self.results):
            if index == 1:
                self.waiting_for_second.set()
                if not self.release_second.wait(timeout=2):
                    raise RuntimeError("test did not release second result")
            yield result
            if index == 0 and self.fail_after_first:
                raise RuntimeError("provider failed after partial result")


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


def test_stage_mask_runs_full_current_detect_targets(tmp_path: Path) -> None:
    client = TestClient(
        create_app(tmp_path / "workspace", sam2_provider=SelectiveSam2Provider()),
    )
    _upload_scene_and_state(client)
    state = client.get("/api/workspace/state").json()
    base = state["elements"][0]
    state["elements"] = _full_stage_mask_elements(base)
    assert client.put("/api/workspace/state", json=state).status_code == 200

    response = client.post("/api/workspace/stage/mask")

    assert response.status_code == 200
    body = response.json()
    task = body["task"]
    assert task["total"] == 6
    assert [item["elementId"] for item in task["items"]] == [
        "element_001",
        "element_002",
        "element_003",
        "element_005",
        "element_006",
        "element_004",
    ]
    next_by_id = {element["id"]: element for element in body["state"]["elements"]}
    for element_id in ["element_001", "element_002", "element_003", "element_004", "element_005", "element_006"]:
        assert next_by_id[element_id]["status"] == "accepted"
        assert next_by_id[element_id]["mode"] == "visible_only"
        assert next_by_id[element_id]["segmentationStatus"] == "not_started"
        assert next_by_id[element_id]["mask"] is None
        assert next_by_id[element_id]["segmentationQuality"] is None
    assert next_by_id["element_hidden"]["status"] == "edited"
    assert next_by_id["element_rejected"]["status"] == "rejected"
    snapshot = (tmp_path / "workspace" / "stage_snapshots" / "detect.json").read_text(encoding="utf-8")
    assert '"segmentationStatus": "mask_suggested"' in snapshot


def test_stage_detect_returns_task_before_streaming_candidates(tmp_path: Path) -> None:
    provider = SlowDetectionProvider(
        [
            {
                "label": "cat",
                "confidence": 0.91,
                "bbox": {"x": 3, "y": 2, "w": 4, "h": 3},
                "sourcePrompt": "cat",
            },
            {
                "label": "sink",
                "confidence": 0.86,
                "bbox": {"x": 7, "y": 3, "w": 3, "h": 4},
                "sourcePrompt": "sink",
            },
        ],
    )
    client = TestClient(create_app(tmp_path / "workspace", detection_provider=provider))
    _upload_source_only(client)

    response = client.post("/api/workspace/stage/detect")

    assert response.status_code == 200
    body = response.json()
    task = body["task"]
    assert body["workflow"]["stage"] == "detect"
    assert body["workflow"]["taskIds"]["detectionBatch"] == task["taskId"]
    assert body["state"]["elements"] == []
    assert task["type"] == "detection_batch"
    assert client.get("/api/workspace/state").json()["elements"] == []

    completed = _wait_for_task(client, task["taskId"])
    assert completed["status"] == "succeeded"
    assert completed["total"] == 2
    assert completed["done"] == 2
    assert [item["elementId"] for item in completed["items"]] == ["element_001", "element_002"]
    assert all(item["status"] == "succeeded" for item in completed["items"])
    next_state = client.get("/api/workspace/state").json()
    assert [element["id"] for element in next_state["elements"]] == ["element_001", "element_002"]
    assert [element["label"] for element in next_state["elements"]] == ["cat", "sink"]
    assert (tmp_path / "workspace" / "stage_snapshots" / "upload.json").exists()


def test_stage_detect_streams_first_candidate_before_provider_finishes(tmp_path: Path) -> None:
    provider = StreamingDetectionProvider(
        [
            {
                "label": "cat",
                "confidence": 0.91,
                "bbox": {"x": 3, "y": 2, "w": 4, "h": 3},
                "sourcePrompt": "cat",
            },
            {
                "label": "sink",
                "confidence": 0.86,
                "bbox": {"x": 7, "y": 3, "w": 3, "h": 4},
                "sourcePrompt": "sink",
            },
        ],
    )
    client = TestClient(create_app(tmp_path / "workspace", detection_provider=provider))
    _upload_source_only(client)

    response = client.post("/api/workspace/stage/detect")

    assert response.status_code == 200
    task_id = response.json()["task"]["taskId"]
    assert provider.waiting_for_second.wait(timeout=2)
    mid_state = _wait_for_elements(client, ["element_001"])
    assert [element["id"] for element in mid_state["elements"]] == ["element_001"]
    assert _wait_for_task_status(client, task_id, {"running"})["status"] == "running"

    provider.release_second.set()
    completed = _wait_for_task(client, task_id)
    assert completed["status"] == "succeeded"
    assert [element["id"] for element in client.get("/api/workspace/state").json()["elements"]] == [
        "element_001",
        "element_002",
    ]


def test_stage_detect_restores_old_state_when_stream_fails_before_first_result(tmp_path: Path) -> None:
    provider = StreamingDetectionProvider([], fail_before_first=True)
    workspace_root = tmp_path / "workspace"
    client = TestClient(create_app(workspace_root, detection_provider=provider))
    _upload_scene_and_state(client)
    state_before = client.get("/api/workspace/state").json()
    stale_output = workspace_root / "elements" / "element_001" / "thumb.png"
    stale_output.parent.mkdir(parents=True)
    stale_output.write_bytes(b"old")

    response = client.post("/api/workspace/stage/detect")

    assert response.status_code == 200
    completed = _wait_for_task(client, response.json()["task"]["taskId"])
    assert completed["status"] == "failed"
    assert client.get("/api/workspace/state").json() == state_before
    assert stale_output.exists()


def test_stage_detect_keeps_partial_candidates_when_stream_fails_after_first_result(tmp_path: Path) -> None:
    provider = StreamingDetectionProvider(
        [
            {
                "label": "cat",
                "confidence": 0.91,
                "bbox": {"x": 3, "y": 2, "w": 4, "h": 3},
                "sourcePrompt": "cat",
            },
        ],
        fail_after_first=True,
    )
    client = TestClient(create_app(tmp_path / "workspace", detection_provider=provider))
    _upload_source_only(client)

    response = client.post("/api/workspace/stage/detect")

    assert response.status_code == 200
    completed = _wait_for_task(client, response.json()["task"]["taskId"])
    assert completed["status"] == "failed"
    assert "Partial detection" in completed["items"][0]["message"]
    assert [element["id"] for element in client.get("/api/workspace/state").json()["elements"]] == ["element_001"]


def test_stage_detect_provider_error_preserves_existing_state(tmp_path: Path) -> None:
    provider = SlowDetectionProvider(
        [
            {
                "label": "cat",
                "confidence": 0.91,
                "bbox": {"x": 3, "y": 2, "w": 4, "h": 3},
                "sourcePrompt": "cat",
            },
            {
                "label": "broken",
                "confidence": 0.9,
                "bbox": {"x": 0, "y": 0, "w": -1, "h": 2},
                "sourcePrompt": "broken",
            },
        ],
        delay_seconds=0,
    )
    client = TestClient(create_app(tmp_path / "workspace", detection_provider=provider))
    _upload_scene_and_state(client)
    state_before = client.get("/api/workspace/state").json()

    response = client.post("/api/workspace/stage/detect")

    assert response.status_code == 200
    completed = _wait_for_task(client, response.json()["task"]["taskId"])
    assert completed["status"] == "failed"
    assert completed["failed"] == 1
    assert "Invalid provider result" in completed["items"][0]["message"]
    assert client.get("/api/workspace/state").json() == state_before


def test_stage_detect_records_no_result_task_without_candidates(tmp_path: Path) -> None:
    client = TestClient(
        create_app(
            tmp_path / "workspace",
            detection_provider=SlowDetectionProvider([], delay_seconds=0),
        ),
    )
    _upload_source_only(client)

    response = client.post("/api/workspace/stage/detect")

    assert response.status_code == 200
    task = _wait_for_task(client, response.json()["task"]["taskId"])
    assert task["status"] == "succeeded"
    assert task["total"] == 1
    assert task["skipped"] == 1
    assert task["items"][0]["status"] == "skipped"
    assert "No detection candidates" in task["items"][0]["message"]
    assert client.get("/api/workspace/state").json()["elements"] == []


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


def _wait_for_task(client: TestClient, task_id: str) -> dict[str, Any]:
    for _ in range(100):
        response = client.get(f"/api/workspace/tasks/{task_id}")
        assert response.status_code == 200
        task = response.json()
        if task["status"] in {"succeeded", "failed"}:
            return task
        time.sleep(0.01)
    raise AssertionError(f"Task {task_id} did not finish")


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


def _full_stage_mask_elements(base: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        _element(
            base,
            "element_001",
            "Model box",
            status="model_detected",
            segmentationStatus="mask_suggested",
            mask="elements/element_001/sam2_edge/mask.png",
            segmentationQuality=_quality("stale"),
        ),
        _element(
            base,
            "element_002",
            "Edited box",
            status="edited",
            bbox={"x": 1, "y": 1, "w": 3, "h": 3},
            canvas={"x": 0, "y": 0, "w": 6, "h": 5},
        ),
        _element(
            base,
            "element_003",
            "Child box",
            status="child",
            assetRole="removable_child",
            parentId="element_004",
            removeFromParent="element_004",
            bbox={"x": 2, "y": 2, "w": 2, "h": 2},
            canvas={"x": 1, "y": 1, "w": 5, "h": 4},
        ),
        _element(
            base,
            "element_004",
            "Parent box",
            status="merged",
            assetRole="parent",
            bbox={"x": 2, "y": 1, "w": 7, "h": 6},
            canvas={"x": 1, "y": 0, "w": 9, "h": 8},
        ),
        _element(
            base,
            "element_005",
            "Bottle box",
            status="edited",
            bbox={"x": 7, "y": 2, "w": 2, "h": 3},
            canvas={"x": 6, "y": 1, "w": 4, "h": 5},
        ),
        _element(
            base,
            "element_006",
            "Accepted old mask box",
            status="accepted",
            segmentationStatus="mask_accepted",
            mask="elements/element_006/sam2_edge/mask.png",
            segmentationQuality=_quality("old"),
            bbox={"x": 8, "y": 5, "w": 2, "h": 2},
            canvas={"x": 7, "y": 4, "w": 4, "h": 4},
        ),
        _element(base, "element_hidden", "Hidden box", status="edited", visible=False),
        _element(base, "element_rejected", "Rejected box", status="rejected"),
        _element(base, "element_skip", "Skip box", status="edited", assetRole="skip"),
        _element(base, "element_merged_source", "Merged source", status="model_detected", visible=False, mergedInto="element_004"),
    ]


def _element(base: dict[str, Any], element_id: str, name: str, **overrides: Any) -> dict[str, Any]:
    return {**base, "id": element_id, "name": name, **overrides}


def _quality(profile: str) -> dict[str, Any]:
    return {
        "selectedProfile": profile,
        "candidateCount": 1,
        "foregroundArea": 1,
        "detachedArea": 0,
        "filledHoleCount": 0,
        "filledHoleArea": 0,
    }


def _wait_for_elements(client: TestClient, element_ids: list[str]) -> dict[str, Any]:
    for _ in range(100):
        state = client.get("/api/workspace/state").json()
        if [element["id"] for element in state["elements"]] == element_ids:
            return state
        time.sleep(0.01)
    raise AssertionError(f"Workspace did not reach elements {element_ids}")


def _upload_source_only(client: TestClient) -> None:
    upload_response = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", _scene_bytes(), "image/png")},
    )
    assert upload_response.status_code == 200
