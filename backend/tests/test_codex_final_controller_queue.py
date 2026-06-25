from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
import time
from typing import Any

from fastapi.testclient import TestClient

from art_pipeline.api import create_app
from art_pipeline.codex_final_jobs import (
    read_codex_final_job_manifest,
    write_codex_final_job_manifest,
)
from art_pipeline.workspace.codex_final_tasks import CODEX_FINAL_MAX_ATTEMPTS
from art_pipeline.workspace.tasks import set_task_item_status
import art_pipeline.http.routes.tasks as task_routes
from art_pipeline.codex_final_controller_launcher import (
    CodexFinalControllerLaunchError,
    CodexFinalControllerProcess,
)
from test_codex_final_task_api import (
    FakeCodexProvider,
    SelectiveSam2Provider,
    _item,
    _manifest_job,
    _wait_for_task,
    _write_valid_raw_output,
)
from workspace_fixtures import upload_scene_and_state as _upload_scene_and_state


def test_codex_final_claims_disjoint_leases_across_controllers(tmp_path: Path) -> None:
    client, workspace_root, task = _prepare_codex_final_queue(tmp_path, element_count=22)

    first = _claim(client, task["taskId"], "controller-a", 6)
    second = _claim(client, task["taskId"], "controller-b", 6)
    third = _claim(client, task["taskId"], "controller-c", 6)

    claimed_jobs = [*first["jobs"], *second["jobs"], *third["jobs"]]
    claimed_ids = [job["jobId"] for job in claimed_jobs]
    assert len(claimed_ids) == 18
    assert len(set(claimed_ids)) == 18
    assert all(job["leaseToken"] for job in claimed_jobs)

    manifest = read_codex_final_job_manifest(workspace_root, task["taskId"])
    status_counts = _job_status_counts(manifest.model_dump(mode="json")["jobs"])
    assert status_counts["claimed"] == 18
    assert status_counts["queued"] == 4

    next_task = client.get(f"/api/workspace/tasks/{task['taskId']}").json()
    assert next_task["status"] == "running"
    assert _item_status_counts(next_task["items"])["claimed"] == 18
    assert _item_status_counts(next_task["items"])["queued"] == 4
    assert next_task["metadata"]["codexFinalControllerCount"] == 3
    assert next_task["metadata"]["codexFinalCapacity"] == 18


def test_codex_final_claim_and_heartbeat_project_runtime_artifacts(tmp_path: Path) -> None:
    client, _workspace_root, task = _prepare_codex_final_queue(tmp_path, element_count=1)
    claimed = _claim(client, task["taskId"], "controller-a", 1)["jobs"][0]

    claimed_task = client.get(f"/api/workspace/tasks/{task['taskId']}").json()
    claimed_item = _item(claimed_task, "element_001")
    assert claimed_item["status"] == "claimed"
    assert claimed_item["artifactPaths"]["controllerId"] == "controller-a"
    assert claimed_item["artifactPaths"]["attempt"] == 1
    assert claimed_item["artifactPaths"]["jobStatus"] == "claimed"
    assert claimed_item["artifactPaths"]["leaseExpiresAt"]
    assert claimed_item["artifactPaths"]["claimedAt"]
    assert claimed_item["artifactPaths"]["heartbeatAt"]

    heartbeat_response = client.post(
        f"/api/workspace/tasks/{task['taskId']}/codex-final/jobs/{claimed['jobId']}/heartbeat",
        json={
            "controllerId": "controller-a",
            "leaseToken": claimed["leaseToken"],
            "phase": "agent_running",
            "leaseSeconds": 120,
        },
    )

    assert heartbeat_response.status_code == 200
    running_item = _item(heartbeat_response.json()["task"], "element_001")
    assert running_item["status"] == "running"
    assert running_item["artifactPaths"]["jobStatus"] == "agent_running"
    assert running_item["artifactPaths"]["controllerId"] == "controller-a"
    assert running_item["artifactPaths"]["startedAt"]
    assert running_item["artifactPaths"]["heartbeatAt"]
    assert running_item["artifactPaths"]["claimedAt"]


def test_codex_final_expired_lease_can_be_reclaimed(tmp_path: Path) -> None:
    client, workspace_root, task = _prepare_codex_final_queue(tmp_path, element_count=1)
    first = _claim(client, task["taskId"], "controller-a", 1)["jobs"][0]
    _expire_manifest_lease(workspace_root, task["taskId"], first["jobId"])

    second = _claim(client, task["taskId"], "controller-b", 1)["jobs"][0]

    assert second["jobId"] == first["jobId"]
    assert second["leaseToken"] != first["leaseToken"]
    assert second["controllerId"] == "controller-b"
    next_task = client.get(f"/api/workspace/tasks/{task['taskId']}").json()
    item = _item(next_task, "element_001")
    assert item["status"] == "claimed"
    assert item["artifactPaths"]["controllerId"] == "controller-b"


def test_codex_final_expired_lease_is_not_reclaimed_after_max_attempts(tmp_path: Path) -> None:
    client, workspace_root, task = _prepare_codex_final_queue(tmp_path, element_count=1)
    first = _claim(client, task["taskId"], "controller-a", 1)["jobs"][0]
    _expire_manifest_lease(workspace_root, task["taskId"], first["jobId"])
    manifest = read_codex_final_job_manifest(workspace_root, task["taskId"])
    exhausted_jobs = [
        job.model_copy(update={"attempt": CODEX_FINAL_MAX_ATTEMPTS})
        if job.jobId == first["jobId"]
        else job
        for job in manifest.jobs
    ]
    write_codex_final_job_manifest(workspace_root, manifest.model_copy(update={"jobs": exhausted_jobs}))

    second = _claim(client, task["taskId"], "controller-b", 1)

    assert second["jobs"] == []
    next_manifest = read_codex_final_job_manifest(workspace_root, task["taskId"])
    job = next_manifest.jobs[0]
    assert job.controllerId == "controller-a"
    assert job.attempt == CODEX_FINAL_MAX_ATTEMPTS


def test_codex_final_ingest_requires_current_lease(tmp_path: Path) -> None:
    client, workspace_root, task = _prepare_codex_final_queue(tmp_path, element_count=1)
    claimed = _claim(client, task["taskId"], "controller-a", 1)["jobs"][0]
    job = _manifest_job(workspace_root, task["taskId"], "element_001")
    _write_valid_raw_output(workspace_root, job)

    response = client.post(
        f"/api/workspace/tasks/{task['taskId']}/codex-final/jobs/{claimed['jobId']}/ingest",
        json={
            "controllerId": "controller-a",
            "leaseToken": "wrong-token",
            "selectedSourcePath": (workspace_root / job["rawOutputPath"]).as_posix(),
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Codex final job lease is no longer current."
    next_task = client.get(f"/api/workspace/tasks/{task['taskId']}").json()
    assert _item(next_task, "element_001")["status"] == "claimed"


def test_codex_final_controller_start_normalizes_legacy_waiting_jobs(tmp_path: Path) -> None:
    client, workspace_root, task = _prepare_codex_final_queue(tmp_path, element_count=1)
    manifest = read_codex_final_job_manifest(workspace_root, task["taskId"])
    legacy_jobs = [
        job.model_copy(update={"status": "ready_for_agent", "message": "Waiting for Codex agent raw image."})
        for job in manifest.jobs
    ]
    write_codex_final_job_manifest(workspace_root, manifest.model_copy(update={"jobs": legacy_jobs}))
    set_task_item_status(
        workspace_root,
        task["taskId"],
        "element_001",
        "running",
        "Waiting for Codex agent raw image.",
    )

    response = client.post(
        f"/api/workspace/tasks/{task['taskId']}/codex-final/controllers/start",
        json={"controllerCount": 0},
    )

    assert response.status_code == 200
    body = response.json()
    item = _item(body["task"], "element_001")
    assert item["status"] == "queued"
    assert item["message"] == "Queued for Codex controller."
    normalized = read_codex_final_job_manifest(workspace_root, task["taskId"])
    assert normalized.jobs[0].status == "queued"
    assert normalized.jobs[0].controllerId is None
    assert normalized.jobs[0].leaseToken is None


def test_codex_final_batch_launches_cli_controllers_even_when_legacy_provider_is_cached(
    tmp_path: Path,
    monkeypatch,
) -> None:
    calls: list[dict[str, Any]] = []

    def fake_start_controllers(**kwargs: Any) -> list[CodexFinalControllerProcess]:
        calls.append(kwargs)
        return [
            CodexFinalControllerProcess(
                controller_id="controller-a",
                prompt_path="prompt.md",
                events_path="events.jsonl",
                pid=123,
            )
        ]

    monkeypatch.setattr(task_routes, "start_codex_final_controllers", fake_start_controllers)
    workspace_root = tmp_path / "workspace"
    client = TestClient(
        create_app(
            workspace_root,
            sam2_provider=SelectiveSam2Provider(),
            codex_asset_provider=FakeCodexProvider(),
        )
    )
    _upload_scene_and_state(client)
    sam2_task = client.post("/api/workspace/tasks/sam2-masks").json()
    _wait_for_task(client, sam2_task["taskId"])
    assert client.post("/api/workspace/elements/element_001/segment/accept").status_code == 200

    response = client.post("/api/workspace/tasks/codex-finals")

    assert response.status_code == 200
    task_id = response.json()["taskId"]
    _wait_for_manifest(client, workspace_root, task_id)
    for _ in range(100):
        if calls:
            break
        time.sleep(0.01)
    assert calls
    assert calls[0]["workspace_root"] == workspace_root
    assert calls[0]["task_id"] == task_id
    assert calls[0]["api_base_url"] == "http://testserver"


def test_codex_final_retry_failed_launches_cli_controllers(
    tmp_path: Path,
    monkeypatch,
) -> None:
    client, _workspace_root, task = _prepare_codex_final_queue(tmp_path, element_count=1)
    calls: list[dict[str, Any]] = []

    def fake_start_controllers(**kwargs: Any) -> list[CodexFinalControllerProcess]:
        calls.append(kwargs)
        return [
            CodexFinalControllerProcess(
                controller_id="controller-retry",
                prompt_path="prompt.md",
                events_path="events.jsonl",
                pid=456,
            )
        ]

    monkeypatch.setattr(task_routes, "start_codex_final_controllers", fake_start_controllers)
    set_task_item_status(
        tmp_path / "workspace",
        task["taskId"],
        "element_001",
        "failed",
        "agent failed before ingest",
    )

    response = client.post(f"/api/workspace/tasks/{task['taskId']}/retry-failed")

    assert response.status_code == 200
    retry_task_id = response.json()["taskId"]
    _wait_for_manifest(client, tmp_path / "workspace", retry_task_id)
    for _ in range(100):
        if any(call["task_id"] == retry_task_id for call in calls):
            break
        time.sleep(0.01)
    assert calls
    retry_call = next(call for call in calls if call["task_id"] == retry_task_id)
    assert retry_call["api_base_url"] == "http://testserver"


def test_codex_final_batch_marks_jobs_failed_when_no_controller_launches(
    tmp_path: Path,
    monkeypatch,
) -> None:
    calls: list[dict[str, Any]] = []

    def fake_start_controllers(**kwargs: Any) -> list[CodexFinalControllerProcess]:
        calls.append(kwargs)
        raise CodexFinalControllerLaunchError(
            "Codex controller launch failed: PermissionError: denied",
            started_count=0,
        )

    monkeypatch.setattr(task_routes, "start_codex_final_controllers", fake_start_controllers)
    workspace_root = tmp_path / "workspace"
    client = TestClient(
        create_app(
            workspace_root,
            sam2_provider=SelectiveSam2Provider(),
            codex_asset_provider=FakeCodexProvider(),
        )
    )
    _upload_scene_and_state(client)
    sam2_task = client.post("/api/workspace/tasks/sam2-masks").json()
    _wait_for_task(client, sam2_task["taskId"])
    assert client.post("/api/workspace/elements/element_001/segment/accept").status_code == 200

    response = client.post("/api/workspace/tasks/codex-finals")

    assert response.status_code == 200
    task_id = response.json()["taskId"]
    task = _wait_for_task(client, task_id)
    # WHY: controller 进程没启动时继续停在 queued 会制造黑盒；任务状态必须直接暴露启动失败。
    assert calls
    assert task["status"] == "failed"
    assert task["items"][0]["status"] == "failed"
    assert "Codex controller launch failed" in task["items"][0]["message"]
    manifest = read_codex_final_job_manifest(workspace_root, task_id)
    job = manifest.jobs[0]
    assert job.status == "failed"
    assert "Codex controller launch failed" in job.message


def test_manual_controller_start_marks_jobs_failed_when_no_controller_launches(
    tmp_path: Path,
    monkeypatch,
) -> None:
    workspace_root = tmp_path / "workspace"
    client = TestClient(
        create_app(
            workspace_root,
            sam2_provider=SelectiveSam2Provider(),
            codex_asset_provider=FakeCodexProvider(),
        ),
        raise_server_exceptions=False,
    )
    _upload_scene_and_state(client)
    sam2_task = client.post("/api/workspace/tasks/sam2-masks").json()
    _wait_for_task(client, sam2_task["taskId"])
    assert client.post("/api/workspace/elements/element_001/segment/accept").status_code == 200
    create_response = client.post("/api/workspace/tasks/codex-finals")
    assert create_response.status_code == 200
    task_id = create_response.json()["taskId"]
    _wait_for_manifest(client, workspace_root, task_id)

    def fake_start_controllers(**_kwargs: Any) -> list[CodexFinalControllerProcess]:
        raise CodexFinalControllerLaunchError(
            "Codex controller launch failed: PermissionError: denied",
            started_count=0,
        )

    monkeypatch.setattr(task_routes, "start_codex_final_controllers", fake_start_controllers)

    response = client.post(f"/api/workspace/tasks/{task_id}/codex-final/controllers/start")

    assert response.status_code == 503
    assert "Codex controller launch failed" in response.json()["detail"]
    task = client.get(f"/api/workspace/tasks/{task_id}").json()
    assert task["status"] == "failed"
    assert task["items"][0]["status"] == "failed"
    manifest = read_codex_final_job_manifest(workspace_root, task_id)
    assert manifest.jobs[0].status == "failed"


def _prepare_codex_final_queue(
    tmp_path: Path,
    *,
    element_count: int,
) -> tuple[TestClient, Path, dict[str, Any]]:
    workspace_root = tmp_path / "workspace"
    client = TestClient(
        create_app(
            workspace_root,
            sam2_provider=SelectiveSam2Provider(),
            codex_asset_provider=FakeCodexProvider(),
        )
    )
    _upload_scene_and_state(client)
    _append_extra_elements(client, element_count)
    sam2_task = client.post("/api/workspace/tasks/sam2-masks").json()
    _wait_for_task(client, sam2_task["taskId"])
    for index in range(1, element_count + 1):
        assert client.post(f"/api/workspace/elements/element_{index:03d}/segment/accept").status_code == 200
    response = client.post("/api/workspace/tasks/codex-finals")
    assert response.status_code == 200
    task_id = response.json()["taskId"]
    return client, workspace_root, _wait_for_manifest(client, workspace_root, task_id)


def _append_extra_elements(client: TestClient, element_count: int) -> None:
    state = client.get("/api/workspace/state").json()
    state["elements"][0]["id"] = "element_001"
    state["elements"][0]["name"] = "Asset 1"
    for index in range(2, element_count + 1):
        x = 1 + (index % 6)
        y = 1 + (index % 4)
        state["elements"].append(
            {
                **state["elements"][0],
                "id": f"element_{index:03d}",
                "name": f"Asset {index}",
                "bbox": {"x": x, "y": y, "w": 3, "h": 3},
                "canvas": {"x": max(0, x - 1), "y": max(0, y - 1), "w": 5, "h": 5},
                "mask": None,
                "segmentationStatus": "not_started",
                "segmentationQuality": None,
            }
        )
    assert client.put("/api/workspace/state", json=state).status_code == 200


def _wait_for_manifest(client: TestClient, workspace_root: Path, task_id: str) -> dict[str, Any]:
    manifest_path = workspace_root / "tasks" / task_id / "codex-final-jobs.json"
    for _ in range(300):
        task = client.get(f"/api/workspace/tasks/{task_id}").json()
        if manifest_path.exists() and task["items"] and all(item["status"] == "queued" for item in task["items"]):
            return task
        time.sleep(0.01)
    raise AssertionError(f"Task {task_id} did not prepare queued Codex jobs")


def _claim(client: TestClient, task_id: str, controller_id: str, capacity: int) -> dict[str, Any]:
    response = client.post(
        f"/api/workspace/tasks/{task_id}/codex-final/jobs/claim",
        json={"controllerId": controller_id, "capacity": capacity},
    )
    assert response.status_code == 200
    return response.json()


def _expire_manifest_lease(workspace_root: Path, task_id: str, job_id: str) -> None:
    manifest = read_codex_final_job_manifest(workspace_root, task_id)
    expired = datetime.now(timezone.utc) - timedelta(seconds=5)
    jobs = [
        job.model_copy(update={"leaseExpiresAt": expired.isoformat()})
        if job.jobId == job_id
        else job
        for job in manifest.jobs
    ]
    write_codex_final_job_manifest(workspace_root, manifest.model_copy(update={"jobs": jobs}))


def _job_status_counts(jobs: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for job in jobs:
        counts[job["status"]] = counts.get(job["status"], 0) + 1
    return counts


def _item_status_counts(items: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for item in items:
        counts[item["status"]] = counts.get(item["status"], 0) + 1
    return counts
