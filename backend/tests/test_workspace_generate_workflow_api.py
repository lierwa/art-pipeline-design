from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from art_pipeline.api import create_app
from art_pipeline.codex_assets import CodexAssetRequest
from art_pipeline.codex_final_controller_launcher import CodexFinalControllerProcess
from art_pipeline.http.routes import workflow as workflow_routes
import art_pipeline.http.routes.tasks as task_routes
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


class RecordingCodexProvider:
    name = "codex_cli"

    def __init__(self) -> None:
        self.requests: list[CodexAssetRequest] = []

    def generate(self, request: CodexAssetRequest) -> None:
        self.requests.append(request)


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


def test_stage_generate_prepares_agent_jobs_without_codex_provider(
    tmp_path: Path,
    monkeypatch: Any,
) -> None:
    def fail_if_codex_provider_requested(_: Any) -> None:
        raise AssertionError("stage generate should not request a Codex provider")

    monkeypatch.setattr(
        workflow_routes,
        "_get_codex_asset_provider",
        fail_if_codex_provider_requested,
        raising=False,
    )
    client = TestClient(
        create_app(
            tmp_path / "workspace",
            sam2_provider=SelectiveSam2Provider(),
            codex_asset_provider=None,
        ),
    )
    _upload_scene_and_state(client)
    mask_task = client.post("/api/workspace/stage/mask").json()["task"]["taskId"]
    _wait_for_task(client, mask_task)

    response = client.post("/api/workspace/stage/generate", json={"elementIds": ["element_001"]})

    assert response.status_code == 200
    body = response.json()
    task = _wait_for_codex_queue_ready(client, body["task"]["taskId"])
    assert body["workflow"]["stage"] == "generate"
    assert task["type"] == "codex_final_batch"
    assert task["status"] == "queued"
    assert task["items"][0]["status"] == "queued"
    assert task["items"][0]["message"] == "Queued for Codex controller."
    assert task["items"][0]["artifactPaths"]["rawOutputPath"].endswith("/codex_raw.png")
    assert body["state"]["elements"][0]["sourceProvider"] is None
    assert client.get("/api/workspace/state").json()["elements"][0]["sourceProvider"] is None


def test_stage_generate_launches_codex_controllers_for_run(
    tmp_path: Path,
    monkeypatch: Any,
) -> None:
    calls: list[dict[str, Any]] = []

    def fake_start_controllers(**kwargs: Any) -> list[CodexFinalControllerProcess]:
        calls.append(kwargs)
        return [
            CodexFinalControllerProcess(
                controller_id="controller-stage",
                prompt_path="prompt.md",
                events_path="events.jsonl",
                pid=123,
            )
        ]

    monkeypatch.setattr(task_routes, "start_codex_final_controllers", fake_start_controllers)
    client = TestClient(
        create_app(
            tmp_path / "workspace",
            sam2_provider=SelectiveSam2Provider(),
            codex_asset_provider=None,
        ),
    )
    run_id = _create_run_with_state(client)
    mask_task = client.post(f"/api/workspace/stage/mask?runId={run_id}").json()["task"]["taskId"]
    _wait_for_task(client, mask_task, run_id)

    response = client.post(
        f"/api/workspace/stage/generate?runId={run_id}",
        json={"elementIds": ["element_001"]},
    )

    assert response.status_code == 200
    task_id = response.json()["task"]["taskId"]
    task = _wait_for_codex_queue_ready(client, task_id, run_id)
    # WHY: 真实 Generate 按钮走 stage/generate；只验证 queued manifest 会漏掉
    # controller 未启动的回归；后台线程可能跨测试收尾，所以按 task_id 匹配。
    matching_call = None
    for _ in range(100):
        matching_call = next((call for call in calls if call["task_id"] == task_id), None)
        if matching_call:
            break
        time.sleep(0.01)
    assert matching_call is not None
    assert matching_call["workspace_root"] == tmp_path / "workspace" / "runs" / run_id
    assert matching_call["task_id"] == task_id
    assert matching_call["api_base_url"] == "http://testserver"
    assert matching_call["run_id"] == run_id
    assert task["items"][0]["message"] == "Queued for Codex controller."


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
    generate_response = client.post("/api/workspace/stage/generate", json={"elementIds": []})
    assert generate_response.status_code == 200
    assert generate_response.json()["task"]["status"] == "succeeded"
    assert generate_response.json()["task"]["total"] == 0

    response = client.post("/api/workspace/stage/back")

    assert response.status_code == 200
    body = response.json()
    assert body["workflow"]["stage"] == "mask"
    assert body["state"] == mask_state
    assert body["workflow"]["taskIds"]["codexFinalBatches"] == []


def test_export_records_summary_without_leaving_generate_stage(tmp_path: Path) -> None:
    codex_provider = RecordingCodexProvider()
    client = TestClient(
        create_app(
            tmp_path / "workspace",
            sam2_provider=SelectiveSam2Provider(),
            codex_asset_provider=codex_provider,
        ),
    )
    _upload_scene_and_state(client)
    mask_task = client.post("/api/workspace/stage/mask").json()["task"]["taskId"]
    _wait_for_task(client, mask_task)
    generate_task = client.post(
        "/api/workspace/stage/generate",
        json={"elementIds": ["element_001"]},
    ).json()["task"]["taskId"]
    task = _wait_for_codex_queue_ready(client, generate_task)
    assert task["items"][0]["message"] == "Queued for Codex controller."
    assert codex_provider.requests == []

    response = client.post("/api/workspace/export")

    assert response.status_code == 200
    workflow_response = client.get("/api/workspace/workflow")
    assert workflow_response.status_code == 200
    workflow = workflow_response.json()
    assert workflow["stage"] == "generate"
    assert workflow["lastExportSummary"]["exportableCount"] == 1


def _create_run_with_state(client: TestClient) -> str:
    run_response = client.post(
        "/api/workspace/runs",
        files={"file": ("scene.png", _scene_bytes(), "image/png")},
    )
    assert run_response.status_code == 200
    run_id = run_response.json()["run"]["id"]
    state_response = client.put(
        f"/api/workspace/state?runId={run_id}",
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
                    "name": "Sticker",
                    "status": "accepted",
                    "assetRole": "sticker",
                    "bbox": {"x": 3, "y": 2, "w": 4, "h": 3},
                    "canvas": {"x": 2, "y": 1, "w": 8, "h": 6},
                    "layer": 1,
                    "visible": True,
                }
            ],
        },
    )
    assert state_response.status_code == 200
    return run_id


def _wait_for_task(client: TestClient, task_id: str, run_id: str | None = None) -> dict[str, Any]:
    for _ in range(100):
        response = client.get(_task_url(task_id, run_id))
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


def _wait_for_codex_queue_ready(
    client: TestClient,
    task_id: str,
    run_id: str | None = None,
) -> dict[str, Any]:
    for _ in range(100):
        response = client.get(_task_url(task_id, run_id))
        assert response.status_code == 200
        task = response.json()
        if (
            task["status"] == "queued"
            and task["items"]
            and all(item["message"] == "Queued for Codex controller." for item in task["items"])
        ):
            return task
        time.sleep(0.01)
    raise AssertionError(f"Task {task_id} did not prepare queued Codex jobs")


def _task_url(task_id: str, run_id: str | None) -> str:
    query = f"?runId={run_id}" if run_id else ""
    return f"/api/workspace/tasks/{task_id}{query}"
