from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from art_pipeline.api import create_app
from art_pipeline.codex_assets import CodexAssetRequest
from art_pipeline.codex_final_jobs import read_codex_final_job_manifest
from art_pipeline.codex_postprocess import choose_chroma_key
from art_pipeline.workspace.codex_final_tasks import CODEX_FINAL_MANUAL_STOP_MESSAGE
from art_pipeline.workspace.tasks import set_task_item_status
from codex_final_fixtures import write_semantic_rgb_output
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


class FakeCodexProvider:
    name = "codex_cli"

    def __init__(self, failing_element_ids: set[str] | None = None) -> None:
        self.failing_element_ids = failing_element_ids or set()
        self.requests: list[CodexAssetRequest] = []

    def generate(self, request: CodexAssetRequest) -> dict[str, Any]:
        self.requests.append(request)
        if request.element_id in self.failing_element_ids:
            raise RuntimeError(f"boom {request.element_id}")
        return {}


class CopyReferenceCodexProvider(FakeCodexProvider):
    def generate(self, request: CodexAssetRequest) -> dict[str, Any]:
        self.requests.append(request)
        return {}


def test_codex_final_batch_prepares_agent_jobs_without_running_provider(
    tmp_path: Path,
) -> None:
    workspace_root = tmp_path / "workspace"
    codex_provider = FakeCodexProvider()
    client = TestClient(
        create_app(
            workspace_root,
            sam2_provider=SelectiveSam2Provider(),
            codex_asset_provider=codex_provider,
        )
    )
    _upload_scene_and_state(client)
    _append_second_element(client)
    sam2_task = client.post("/api/workspace/tasks/sam2-masks").json()
    _wait_for_task(client, sam2_task["taskId"])
    for element_id in ("element_001", "element_002"):
        assert client.post(f"/api/workspace/elements/{element_id}/segment/accept").status_code == 200

    response = client.post(
        "/api/workspace/tasks/codex-finals",
        json={"promptHints": {"element_002": "keep the second sticker compact"}},
    )

    assert response.status_code == 200
    task_id = response.json()["taskId"]
    task = _wait_for_codex_agent_preparation(client, task_id, workspace_root, codex_provider)
    manifest_path = workspace_root / "tasks" / task_id / "codex-final-jobs.json"
    handoff_path = workspace_root / "tasks" / task_id / "codex-final-agent-handoff.md"
    assert codex_provider.requests == []
    assert manifest_path.exists()
    assert handoff_path.exists()
    assert task["status"] == "queued"
    assert task["total"] == 2
    assert task["done"] == 0

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    jobs_by_element = {job["elementId"]: job for job in manifest["jobs"]}
    assert set(jobs_by_element) == {"element_001", "element_002"}
    assert "selected_source=" in handoff_path.read_text(encoding="utf-8")

    for element_id in ("element_001", "element_002"):
        item = _item(task, element_id)
        job = jobs_by_element[element_id]
        assert item["status"] == "queued"
        assert item["message"] == "Queued for Codex controller."
        assert item["artifactPaths"]["manifestPath"] == f"tasks/{task_id}/codex-final-jobs.json"
        assert item["artifactPaths"]["handoffPath"] == f"tasks/{task_id}/codex-final-agent-handoff.md"
        assert item["artifactPaths"]["promptPath"] == job["promptPath"]
        assert item["artifactPaths"]["briefImagePath"] == job["briefImagePath"]
        assert item["artifactPaths"]["rawOutputPath"] == job["rawOutputPath"]
        assert item["artifactPaths"]["qualityReportPath"] == job["qualityReportPath"]
        assert item["artifactPaths"]["qualityStatus"] == "pending"
        assert item["artifactPaths"]["repairNote"] is None
        assert (workspace_root / job["promptPath"]).exists()
        assert (workspace_root / job["briefImagePath"]).exists()


def test_codex_final_batch_task_prepares_mask_accepted_assets_and_retries_failed(
    tmp_path: Path,
) -> None:
    codex_provider = FakeCodexProvider({"element_002"})
    workspace_root = tmp_path / "workspace"
    client = TestClient(
        create_app(
            workspace_root,
            sam2_provider=SelectiveSam2Provider(),
            codex_asset_provider=codex_provider,
        )
    )
    _upload_scene_and_state(client)
    _append_second_element(client)
    sam2_task = client.post("/api/workspace/tasks/sam2-masks").json()
    _wait_for_task(client, sam2_task["taskId"])
    for element_id in ("element_001", "element_002"):
        assert client.post(f"/api/workspace/elements/{element_id}/segment/accept").status_code == 200

    response = client.post("/api/workspace/tasks/codex-finals")

    assert response.status_code == 200
    task = _wait_for_codex_agent_preparation(client, response.json()["taskId"], workspace_root, codex_provider)
    assert task["type"] == "codex_final_batch"
    assert task["status"] == "queued"
    assert task["total"] == 2
    assert task["done"] == 0
    assert task["failed"] == 0
    assert _item(task, "element_001")["status"] == "queued"
    assert _item(task, "element_002")["status"] == "queued"
    assert len(codex_provider.requests) == 0

    set_task_item_status(workspace_root, task["taskId"], "element_002", "failed", "agent failed before ingest")
    codex_provider.failing_element_ids.clear()
    retry_response = client.post(f"/api/workspace/tasks/{task['taskId']}/retry-failed")
    assert retry_response.status_code == 200
    retry_task = _wait_for_codex_agent_preparation(
        client,
        retry_response.json()["taskId"],
        workspace_root,
        codex_provider,
    )
    assert retry_task["total"] == 1
    assert retry_task["status"] == "queued"
    assert retry_task["done"] == 0
    assert [item["elementId"] for item in retry_task["items"]] == ["element_002"]
    assert _item(retry_task, "element_002")["status"] == "queued"
    assert len(codex_provider.requests) == 0


def test_stop_codex_final_generation_fails_active_jobs_and_tasks(tmp_path: Path, monkeypatch) -> None:
    client, workspace_root, task = _prepare_waiting_codex_final_task(tmp_path, with_second_element=True)
    task_id = task["taskId"]
    claim_response = client.post(
        f"/api/workspace/tasks/{task_id}/codex-final/jobs/claim",
        json={"controllerId": "controller-test", "capacity": 1, "leaseSeconds": 120},
    )
    assert claim_response.status_code == 200
    claimed_job = claim_response.json()["jobs"][0]
    heartbeat_response = client.post(
        f"/api/workspace/tasks/{task_id}/codex-final/jobs/{claimed_job['jobId']}/heartbeat",
        json={
            "controllerId": "controller-test",
            "leaseToken": claimed_job["leaseToken"],
            "phase": "agent_running",
            "leaseSeconds": 120,
        },
    )
    assert heartbeat_response.status_code == 200

    from art_pipeline.http.routes import tasks as task_routes

    class FakeStopResult:
        matched_process_count = 3
        terminated_process_count = 3
        errors: list[str] = []

    monkeypatch.setattr(
        task_routes,
        "stop_codex_exec_processes",
        lambda: FakeStopResult(),
        raising=False,
    )

    response = client.post("/api/workspace/tasks/codex-final/stop-all")

    assert response.status_code == 200
    body = response.json()
    assert body["matchedProcessCount"] == 3
    assert body["terminatedProcessCount"] == 3
    assert body["failedTaskCount"] == 1
    assert body["failedJobCount"] == 2
    assert body["tasks"][0]["status"] == "failed"
    assert body["tasks"][0]["failed"] == 2
    assert all(item["status"] == "failed" for item in body["tasks"][0]["items"])
    assert all("Manually stopped" in item["message"] for item in body["tasks"][0]["items"])

    manifest = read_codex_final_job_manifest(workspace_root, task_id)
    assert {job.status for job in manifest.jobs} == {"failed"}
    assert all(job.controllerId is None for job in manifest.jobs)
    assert all(job.leaseToken is None for job in manifest.jobs)
    assert all(job.finishedAt for job in manifest.jobs)


def test_recovery_ingests_generated_image_after_lease_expires(tmp_path: Path, monkeypatch) -> None:
    client, workspace_root, task = _prepare_claimed_codex_final_task(tmp_path, monkeypatch)
    job = _manifest_job(workspace_root, task["taskId"], "element_001")
    _expire_manifest_job_lease(workspace_root, task["taskId"], job["jobId"])
    generated_root = tmp_path / "codex-generated"
    worker_thread_id = "019efa49-e4ae-7b42-aec4-bafa0e6a5b5e"
    generated_image = generated_root / worker_thread_id / "image.png"
    _write_valid_raw_output_to_path(workspace_root, job, generated_image)
    _write_spawn_agent_event(workspace_root, task["taskId"], job["jobId"], worker_thread_id)

    response = client.post(f"/api/workspace/tasks/{task['taskId']}/codex-final/recover-generated-images")

    assert response.status_code == 200
    body = response.json()
    assert body["scannedThreadCount"] == 1
    assert body["foundImageCount"] == 1
    assert body["recoveredJobCount"] == 1
    assert body["errors"] == []
    item = _item(body["task"], "element_001")
    assert body["task"]["status"] == "succeeded"
    assert item["status"] == "succeeded"
    assert item["artifactPaths"]["rawOutputPath"] == "elements/element_001/codex_final/job/" + job["jobId"] + "/codex_raw.png"
    finalized = _manifest_job(workspace_root, task["taskId"], "element_001")
    assert finalized["status"] == "finalized"
    assert finalized["selectedSourcePath"] == generated_image.as_posix()
    assert finalized["qaNote"] == "Recovered from Codex generated_images fallback."
    assert finalized["codexThreadId"] == worker_thread_id
    assert (workspace_root / finalized["rawOutputPath"]).exists()
    assert (workspace_root / finalized["finalOutputPath"]).exists()
    assert (workspace_root / finalized["metadataPath"]).exists()


def test_recovery_parses_real_spawn_prompt_job_line(tmp_path: Path, monkeypatch) -> None:
    client, workspace_root, task = _prepare_claimed_codex_final_task(tmp_path, monkeypatch)
    job = _manifest_job(workspace_root, task["taskId"], "element_001")
    generated_root = tmp_path / "codex-generated"
    worker_thread_id = "thread_real_prompt"
    generated_image = generated_root / worker_thread_id / "image.png"
    _write_valid_raw_output_to_path(workspace_root, job, generated_image)
    _write_spawn_agent_event(
        workspace_root,
        task["taskId"],
        job["jobId"],
        worker_thread_id,
        prompt=(
            "Spawn one Codex worker for this final image.\n"
            f"Job: {job['jobId']}, element: sticker element_001\n"
            "Return after the worker is started."
        ),
    )

    response = client.post(f"/api/workspace/tasks/{task['taskId']}/codex-final/recover-generated-images")

    assert response.status_code == 200
    body = response.json()
    assert body["scannedThreadCount"] == 1
    assert body["foundImageCount"] == 1
    assert body["recoveredJobCount"] == 1
    assert body["task"]["status"] == "succeeded"
    item = _item(body["task"], "element_001")
    assert item["artifactPaths"]["codexThreadId"] == worker_thread_id


def test_late_controller_ingest_after_recovery_does_not_overwrite_finalized_job(
    tmp_path: Path,
    monkeypatch,
) -> None:
    client, workspace_root, task = _prepare_claimed_codex_final_task(tmp_path, monkeypatch)
    job = _manifest_job(workspace_root, task["taskId"], "element_001")
    generated_root = tmp_path / "codex-generated"
    worker_thread_id = "thread_recovered_before_controller"
    generated_image = generated_root / worker_thread_id / "image.png"
    _write_valid_raw_output_to_path(workspace_root, job, generated_image)
    _write_spawn_agent_event(workspace_root, task["taskId"], job["jobId"], worker_thread_id)
    recovered = client.post(f"/api/workspace/tasks/{task['taskId']}/codex-final/recover-generated-images")
    assert recovered.status_code == 200
    finalized = _manifest_job(workspace_root, task["taskId"], "element_001")
    original_finished_at = finalized["finishedAt"]

    late = client.post(
        f"/api/workspace/tasks/{task['taskId']}/codex-final/jobs/{job['jobId']}/ingest",
        json={
            "controllerId": finalized["controllerId"],
            "leaseToken": finalized["leaseToken"],
            "selectedSourcePath": (workspace_root / finalized["rawOutputPath"]).as_posix(),
            "qaNote": "Late controller direct ingest should not win.",
            "codexThreadId": "late_controller_thread",
        },
    )

    assert late.status_code == 200
    after = _manifest_job(workspace_root, task["taskId"], "element_001")
    assert after["qaNote"] == "Recovered from Codex generated_images fallback."
    assert after["codexThreadId"] == worker_thread_id
    assert after["finishedAt"] == original_finished_at
    assert late.json()["job"]["qaNote"] == "Recovered from Codex generated_images fallback."


def test_event_recovery_monitor_ingests_png_from_worker_event(tmp_path: Path, monkeypatch) -> None:
    from art_pipeline.workspace.codex_final_recovery import CodexFinalRecoveryEventMonitor

    client, workspace_root, task = _prepare_claimed_codex_final_task(tmp_path, monkeypatch)
    job = _manifest_job(workspace_root, task["taskId"], "element_001")
    generated_root = tmp_path / "codex-generated"
    worker_thread_id = "thread_event_driven"
    events_path = _write_spawn_agent_event(
        workspace_root,
        task["taskId"],
        job["jobId"],
        worker_thread_id,
        prompt=f"Job: {job['jobId']}, element: sticker element_001\n",
    )
    generated_image = generated_root / worker_thread_id / "image.png"
    monitor = CodexFinalRecoveryEventMonitor(workspace_root, task["taskId"])

    monitor.process_controller_event_path(events_path)
    _write_valid_raw_output_to_path(workspace_root, job, generated_image)
    result = monitor.process_worker_thread(worker_thread_id)

    assert result is not None
    assert result.scannedThreadCount == 1
    assert result.foundImageCount == 1
    assert result.recoveredJobCount == 1
    updated_task = client.get(f"/api/workspace/tasks/{task['taskId']}").json()
    assert updated_task["status"] == "succeeded"


def test_recovery_uses_configured_generated_images_root(tmp_path: Path, monkeypatch) -> None:
    client, workspace_root, task = _prepare_claimed_codex_final_task(tmp_path, monkeypatch)
    job = _manifest_job(workspace_root, task["taskId"], "element_001")
    worker_thread_id = "thread_from_configured_root"
    configured_root = tmp_path / "configured-generated-images"
    default_home_root = tmp_path / "home" / ".codex" / "generated_images"
    monkeypatch.setenv("CODEX_GENERATED_IMAGES_ROOT", str(configured_root))
    monkeypatch.setenv("USERPROFILE", str(tmp_path / "home"))
    monkeypatch.setenv("HOME", str(tmp_path / "home"))
    _write_valid_raw_output_to_path(workspace_root, job, configured_root / worker_thread_id / "configured.png")
    _write_spawn_agent_event(workspace_root, task["taskId"], job["jobId"], worker_thread_id)

    response = client.post(f"/api/workspace/tasks/{task['taskId']}/codex-final/recover-generated-images")

    assert response.status_code == 200
    assert response.json()["recoveredJobCount"] == 1
    finalized = _manifest_job(workspace_root, task["taskId"], "element_001")
    assert finalized["selectedSourcePath"].startswith(configured_root.as_posix())
    assert not default_home_root.exists()


def test_recover_generated_images_endpoint_recovers_manual_stopped_job_only_when_allowed(
    tmp_path: Path,
    monkeypatch,
) -> None:
    client, workspace_root, task = _prepare_claimed_codex_final_task(tmp_path, monkeypatch)
    job = _manifest_job(workspace_root, task["taskId"], "element_001")
    worker_thread_id = "thread_manual_stop_recovery"
    generated_root = tmp_path / "codex-generated"
    _write_valid_raw_output_to_path(workspace_root, job, generated_root / worker_thread_id / "manual-stop.png")
    _write_spawn_agent_event(workspace_root, task["taskId"], job["jobId"], worker_thread_id)
    set_task_item_status(workspace_root, task["taskId"], "element_001", "failed", CODEX_FINAL_MANUAL_STOP_MESSAGE)
    manifest = read_codex_final_job_manifest(workspace_root, task["taskId"])
    stopped_jobs = [
        manifest_job.model_copy(
            update={
                "status": "failed",
                "message": CODEX_FINAL_MANUAL_STOP_MESSAGE,
                "lastError": CODEX_FINAL_MANUAL_STOP_MESSAGE,
            }
        )
        for manifest_job in manifest.jobs
    ]
    from art_pipeline.codex_final_jobs import write_codex_final_job_manifest

    write_codex_final_job_manifest(workspace_root, manifest.model_copy(update={"jobs": stopped_jobs}))

    blocked = client.post(f"/api/workspace/tasks/{task['taskId']}/codex-final/recover-generated-images")
    assert blocked.status_code == 200
    assert blocked.json()["recoveredJobCount"] == 0
    assert _manifest_job(workspace_root, task["taskId"], "element_001")["status"] == "failed"

    allowed = client.post(
        f"/api/workspace/tasks/{task['taskId']}/codex-final/recover-generated-images",
        json={"includeFailedManualStops": True},
    )

    assert allowed.status_code == 200
    assert allowed.json()["recoveredJobCount"] == 1
    assert _manifest_job(workspace_root, task["taskId"], "element_001")["status"] == "finalized"


def test_codex_final_batch_defers_identical_cutout_validation_to_ingest(tmp_path: Path) -> None:
    codex_provider = CopyReferenceCodexProvider()
    workspace_root = tmp_path / "workspace"
    client = TestClient(
        create_app(
            workspace_root,
            sam2_provider=SelectiveSam2Provider(),
            codex_asset_provider=codex_provider,
        )
    )
    _upload_scene_and_state(client)
    sam2_task = client.post("/api/workspace/tasks/sam2-masks").json()
    _wait_for_task(client, sam2_task["taskId"])
    assert client.post("/api/workspace/elements/element_001/segment/accept").status_code == 200
    _force_parent_repair_targets(client, workspace_root, ("element_001",))

    response = client.post("/api/workspace/tasks/codex-finals")

    assert response.status_code == 200
    task = _wait_for_codex_agent_preparation(client, response.json()["taskId"], workspace_root, codex_provider)
    assert task["status"] == "queued"
    assert task["failed"] == 0
    assert _item(task, "element_001")["status"] == "queued"
    assert _item(task, "element_001")["message"] == "Queued for Codex controller."
    assert len(codex_provider.requests) == 0
    next_state = client.get("/api/workspace/state").json()
    assert next_state["elements"][0]["sourceProvider"] != "codex_cli"


def test_codex_final_ingest_agent_raw_output_finalizes_item(tmp_path: Path) -> None:
    client, workspace_root, task = _prepare_waiting_codex_final_task(tmp_path)
    job = _manifest_job(workspace_root, task["taskId"], "element_001")
    raw_output_path = workspace_root / job["rawOutputPath"]
    _write_valid_raw_output(workspace_root, job)

    response = client.post(
        f"/api/workspace/tasks/{task['taskId']}/codex-final/jobs/element_001/ingest",
        json={
            "selectedSourcePath": raw_output_path.as_posix(),
            "qaNote": "Angle and clean fill look correct.",
            "codexThreadId": "thread_codex_001",
        },
    )

    assert response.status_code == 200
    body = response.json()
    item = _item(body["task"], "element_001")
    assert body["task"]["status"] == "succeeded"
    assert item["status"] == "succeeded"
    assert item["artifactPaths"]["assetPath"] == "elements/element_001/codex_final/transparent_asset.png"
    assert item["artifactPaths"]["qualityReportPath"].endswith("/quality_report.json")
    assert item["artifactPaths"]["qualityStatus"] == "passed"
    assert item["artifactPaths"]["qualityErrors"] == []
    assert item["artifactPaths"]["repairNote"] is None
    assert body["state"]["elements"][0]["sourceProvider"] == "codex_agent"
    persisted_state = client.get("/api/workspace/state").json()
    assert persisted_state["elements"][0]["sourceProvider"] == "codex_agent"
    assert body["job"]["status"] == "finalized"
    assert body["job"]["selectedSourcePath"] == raw_output_path.as_posix()
    assert body["job"]["qaNote"] == "Angle and clean fill look correct."
    assert body["job"]["codexThreadId"] == "thread_codex_001"
    assert body["generation"]["provider"] == "codex_agent"
    assert body["generation"]["qualityStatus"] == "passed"
    assert body["generation"]["qualityErrors"] == []
    assert isinstance(body["generation"]["qualityWarnings"], list)
    assert body["generation"]["repairNote"] is None
    timing = body["generation"]["timing"]
    for key in (
        "materializeRawSeconds",
        "transparentFinalizeSeconds",
        "stateUpdateSeconds",
        "manifestWriteSeconds",
        "taskWriteSeconds",
        "ingestTotalSeconds",
    ):
        assert isinstance(timing[key], float)
        assert timing[key] >= 0
    assert item["artifactPaths"]["timing"] == timing
    assert (workspace_root / "elements" / "element_001" / "codex_final" / "generation.json").exists()

    manifest = read_codex_final_job_manifest(workspace_root, task["taskId"])
    assert manifest.jobs[0].status == "finalized"
    assert manifest.jobs[0].qualityStatus == "passed"
    assert manifest.jobs[0].repairNote is None
    assert manifest.jobs[0].selectedSourcePath == raw_output_path.as_posix()
    assert manifest.jobs[0].qaNote == "Angle and clean fill look correct."
    assert manifest.jobs[0].codexThreadId == "thread_codex_001"


def test_codex_final_ingest_unknown_task_id_returns_404(tmp_path: Path) -> None:
    workspace_root = tmp_path / "workspace"
    client = TestClient(create_app(workspace_root, sam2_provider=SelectiveSam2Provider()))
    selected_source = tmp_path / "agent.png"
    selected_source.write_bytes(b"not used")

    response = client.post(
        "/api/workspace/tasks/task_202606240000000000_missing/codex-final/jobs/element_001/ingest",
        json={"selectedSourcePath": selected_source.as_posix()},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Workspace task not found."


def test_codex_final_ingest_unknown_element_id_returns_404(tmp_path: Path) -> None:
    client, workspace_root, task = _prepare_waiting_codex_final_task(tmp_path)
    job = _manifest_job(workspace_root, task["taskId"], "element_001")
    _write_valid_raw_output(workspace_root, job)

    response = client.post(
        f"/api/workspace/tasks/{task['taskId']}/codex-final/jobs/missing_element/ingest",
        json={"selectedSourcePath": (workspace_root / job["rawOutputPath"]).as_posix()},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Codex final job not found."


def test_codex_final_ingest_missing_selected_source_path_returns_400(
    tmp_path: Path,
) -> None:
    client, workspace_root, task = _prepare_waiting_codex_final_task(tmp_path, with_second_element=True)
    missing_source = tmp_path / "missing.png"

    response = client.post(
        f"/api/workspace/tasks/{task['taskId']}/codex-final/jobs/element_001/ingest",
        json={"selectedSourcePath": missing_source.as_posix()},
    )

    assert response.status_code == 400
    next_task = client.get(f"/api/workspace/tasks/{task['taskId']}").json()
    assert _item(next_task, "element_001")["status"] == "queued"
    assert _item(next_task, "element_002")["status"] == "queued"
    manifest_job = _manifest_job(workspace_root, task["taskId"], "element_001")
    assert manifest_job["status"] == "queued"


def test_codex_final_ingest_missing_selected_source_field_returns_400(
    tmp_path: Path,
) -> None:
    client, _workspace_root, task = _prepare_waiting_codex_final_task(tmp_path)

    response = client.post(
        f"/api/workspace/tasks/{task['taskId']}/codex-final/jobs/element_001/ingest",
        json={},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "selectedSourcePath is required."


def test_codex_final_ingest_finalize_failure_marks_only_item_failed(
    tmp_path: Path,
) -> None:
    client, workspace_root, task = _prepare_waiting_codex_final_task(tmp_path, with_second_element=True)
    job = _manifest_job(workspace_root, task["taskId"], "element_001")
    outside_source = tmp_path / "outside-generated.png"
    _write_valid_raw_output_to_path(workspace_root, job, outside_source)

    response = client.post(
        f"/api/workspace/tasks/{task['taskId']}/codex-final/jobs/element_001/ingest",
        json={"selectedSourcePath": outside_source.as_posix(), "qaNote": "Rejected by allowlist."},
    )

    assert response.status_code == 400
    assert "outside allowed Codex source roots" in response.json()["detail"]
    next_task = client.get(f"/api/workspace/tasks/{task['taskId']}").json()
    assert next_task["status"] == "queued"
    assert _item(next_task, "element_001")["status"] == "failed"
    assert _item(next_task, "element_002")["status"] == "queued"
    failed_job = _manifest_job(workspace_root, task["taskId"], "element_001")
    sibling_job = _manifest_job(workspace_root, task["taskId"], "element_002")
    assert failed_job["status"] == "failed"
    assert failed_job["selectedSourcePath"] == outside_source.as_posix()
    assert sibling_job["status"] == "queued"


def test_codex_final_ingest_quality_failure_projects_report_artifacts(
    tmp_path: Path,
) -> None:
    client, workspace_root, task = _prepare_waiting_codex_final_task(tmp_path, with_second_element=True)
    job = _manifest_job(workspace_root, task["taskId"], "element_001")
    _write_empty_raw_output(workspace_root, job)

    response = client.post(
        f"/api/workspace/tasks/{task['taskId']}/codex-final/jobs/element_001/ingest",
        json={"selectedSourcePath": (workspace_root / job["rawOutputPath"]).as_posix()},
    )

    assert response.status_code == 400
    assert "Codex final candidate failed quality gate" in response.json()["detail"]
    next_task = client.get(f"/api/workspace/tasks/{task['taskId']}").json()
    item = _item(next_task, "element_001")
    assert next_task["status"] == "queued"
    assert item["status"] == "failed"
    assert item["artifactPaths"]["qualityReportPath"].endswith("/quality_report.json")
    assert item["artifactPaths"]["qualityStatus"] == "failed"
    assert "empty_alpha" in item["artifactPaths"]["qualityErrors"]
    assert item["artifactPaths"]["repairNote"] == "Candidate has no visible subject."
    failed_job = _manifest_job(workspace_root, task["taskId"], "element_001")
    assert failed_job["qualityStatus"] == "failed"
    assert failed_job["repairNote"] == "Candidate has no visible subject."
    assert (workspace_root / failed_job["qualityReportPath"]).exists()


def test_codex_final_ingest_task_succeeds_when_all_items_succeeded_or_skipped(
    tmp_path: Path,
) -> None:
    client, workspace_root, task = _prepare_waiting_codex_final_task(tmp_path, with_second_element=True)
    set_task_item_status(workspace_root, task["taskId"], "element_002", "skipped", "Skipped by reviewer.")
    job = _manifest_job(workspace_root, task["taskId"], "element_001")
    _write_valid_raw_output(workspace_root, job)

    response = client.post(
        f"/api/workspace/tasks/{task['taskId']}/codex-final/jobs/element_001/ingest",
        json={"selectedSourcePath": (workspace_root / job["rawOutputPath"]).as_posix()},
    )

    assert response.status_code == 200
    task_payload = response.json()["task"]
    assert task_payload["status"] == "succeeded"
    assert task_payload["done"] == 1
    assert task_payload["skipped"] == 1
    assert _item(task_payload, "element_001")["status"] == "succeeded"
    assert _item(task_payload, "element_002")["status"] == "skipped"


def _append_second_element(client: TestClient) -> None:
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


def _wait_for_task(client: TestClient, task_id: str) -> dict[str, Any]:
    for _ in range(100):
        response = client.get(f"/api/workspace/tasks/{task_id}")
        assert response.status_code == 200
        task = response.json()
        if task["status"] in {"succeeded", "failed"}:
            return task
        time.sleep(0.01)
    raise AssertionError(f"Task {task_id} did not finish")


def _wait_for_codex_agent_preparation(
    client: TestClient,
    task_id: str,
    workspace_root: Path,
    codex_provider: FakeCodexProvider,
) -> dict[str, Any]:
    manifest_path = workspace_root / "tasks" / task_id / "codex-final-jobs.json"
    handoff_path = workspace_root / "tasks" / task_id / "codex-final-agent-handoff.md"
    for _ in range(100):
        response = client.get(f"/api/workspace/tasks/{task_id}")
        assert response.status_code == 200
        task = response.json()
        if codex_provider.requests or task["status"] in {"succeeded", "failed"}:
            return task
        if (
            manifest_path.exists()
            and handoff_path.exists()
            and task["items"]
            and all(
                item["status"] == "queued"
                and item["message"] == "Queued for Codex controller."
                and item["artifactPaths"].get("jobId")
                for item in task["items"]
            )
        ):
            return task
        time.sleep(0.01)
    raise AssertionError(f"Task {task_id} did not prepare Codex agent jobs")


def _prepare_waiting_codex_final_task(
    tmp_path: Path,
    *,
    with_second_element: bool = False,
) -> tuple[TestClient, Path, dict[str, Any]]:
    workspace_root = tmp_path / "workspace"
    codex_provider = FakeCodexProvider()
    client = TestClient(
        create_app(
            workspace_root,
            sam2_provider=SelectiveSam2Provider(),
            codex_asset_provider=codex_provider,
        )
    )
    _upload_scene_and_state(client)
    if with_second_element:
        _append_second_element(client)
    sam2_task = client.post("/api/workspace/tasks/sam2-masks").json()
    _wait_for_task(client, sam2_task["taskId"])
    element_ids = ("element_001", "element_002") if with_second_element else ("element_001",)
    for element_id in element_ids:
        assert client.post(f"/api/workspace/elements/{element_id}/segment/accept").status_code == 200
    _force_parent_repair_targets(client, workspace_root, element_ids)
    response = client.post("/api/workspace/tasks/codex-finals")
    assert response.status_code == 200
    task = _wait_for_codex_agent_preparation(
        client,
        response.json()["taskId"],
        workspace_root,
        codex_provider,
    )
    return client, workspace_root, task


def _force_parent_repair_targets(
    client: TestClient,
    workspace_root: Path,
    element_ids: tuple[str, ...],
) -> None:
    state = client.get("/api/workspace/state").json()
    elements = state["elements"]
    for element_id in element_ids:
        parent = next(element for element in elements if element["id"] == element_id)
        parent["assetRole"] = "parent"
        child_id = f"{element_id}_removed_child"
        child_bbox = {
            "x": parent["bbox"]["x"] + 1,
            "y": parent["bbox"]["y"] + 1,
            "w": max(1, parent["bbox"]["w"] // 2),
            "h": max(1, parent["bbox"]["h"] // 2),
        }
        child_canvas = {
            "x": max(0, child_bbox["x"] - 1),
            "y": max(0, child_bbox["y"] - 1),
            "w": child_bbox["w"] + 2,
            "h": child_bbox["h"] + 2,
        }
        _write_hidden_removed_child_sam2(workspace_root, child_id, child_bbox, child_canvas)
        elements.append(
            {
                **parent,
                "id": child_id,
                "name": f"{parent['name']} removed child",
                "label": "removed child",
                "assetRole": "removable_child",
                "removeFromParent": element_id,
                "visible": False,
                "bbox": child_bbox,
                "canvas": child_canvas,
                "mask": f"elements/{child_id}/sam2_edge/mask.png",
                "segmentationStatus": "mask_accepted",
                "segmentationQuality": {
                    "selectedProfile": "fixture",
                    "candidateCount": 1,
                    "foregroundArea": child_bbox["w"] * child_bbox["h"],
                    "detachedArea": 0,
                    "filledHoleCount": 0,
                    "filledHoleArea": 0,
                    "qualityStatus": "pass",
                    "qualityReasons": [],
                },
            }
        )
    assert client.put("/api/workspace/state", json=state).status_code == 200


def _write_hidden_removed_child_sam2(
    workspace_root: Path,
    element_id: str,
    bbox: dict[str, int],
    canvas: dict[str, int],
) -> None:
    stage_dir = workspace_root / "elements" / element_id / "sam2_edge"
    stage_dir.mkdir(parents=True, exist_ok=True)
    source = Image.new("RGBA", (canvas["w"], canvas["h"]), (230, 90, 120, 255))
    source.save(stage_dir / "source_crop.png", format="PNG")
    cutout = Image.new("RGBA", (canvas["w"], canvas["h"]), (0, 0, 0, 0))
    local_x = bbox["x"] - canvas["x"]
    local_y = bbox["y"] - canvas["y"]
    for x in range(local_x, local_x + bbox["w"]):
        for y in range(local_y, local_y + bbox["h"]):
            cutout.putpixel((x, y), (230, 90, 120, 255))
    cutout.save(stage_dir / "transparent_asset.png", format="PNG")
    cutout.getchannel("A").save(stage_dir / "mask.png", format="PNG")


def _prepare_claimed_codex_final_task(
    tmp_path: Path,
    monkeypatch,
) -> tuple[TestClient, Path, dict[str, Any]]:
    generated_root = tmp_path / "codex-generated"
    monkeypatch.setenv("CODEX_GENERATED_IMAGES_ROOT", str(generated_root))
    client, workspace_root, task = _prepare_waiting_codex_final_task(tmp_path)
    claim_response = client.post(
        f"/api/workspace/tasks/{task['taskId']}/codex-final/jobs/claim",
        json={"controllerId": "controller-recovery", "capacity": 1, "leaseSeconds": 120},
    )
    assert claim_response.status_code == 200
    claimed = claim_response.json()["jobs"][0]
    heartbeat_response = client.post(
        f"/api/workspace/tasks/{task['taskId']}/codex-final/jobs/{claimed['jobId']}/heartbeat",
        json={
            "controllerId": "controller-recovery",
            "leaseToken": claimed["leaseToken"],
            "phase": "agent_running",
            "leaseSeconds": 120,
        },
    )
    assert heartbeat_response.status_code == 200
    return client, workspace_root, client.get(f"/api/workspace/tasks/{task['taskId']}").json()


def _write_spawn_agent_event(
    workspace_root: Path,
    task_id: str,
    job_id: str,
    worker_thread_id: str,
    *,
    prompt: str | None = None,
) -> Path:
    controller_dir = workspace_root / "tasks" / task_id / "controllers" / "controller-recovery"
    controller_dir.mkdir(parents=True, exist_ok=True)
    event = {
        "type": "item.completed",
        "item": {
            "id": "item_spawn",
            "type": "collab_tool_call",
            "tool": "spawn_agent",
            "receiver_thread_ids": [worker_thread_id],
            "prompt": prompt or f"Job:\n- jobId: {job_id}\n- element: element_001\n",
            "status": "completed",
        },
    }
    events_path = controller_dir / "events.jsonl"
    events_path.write_text(json.dumps(event) + "\n", encoding="utf-8")
    return events_path


def _expire_manifest_job_lease(workspace_root: Path, task_id: str, job_id: str) -> None:
    from datetime import datetime, timedelta, timezone

    from art_pipeline.codex_final_jobs import write_codex_final_job_manifest

    manifest = read_codex_final_job_manifest(workspace_root, task_id)
    expired = datetime.now(timezone.utc) - timedelta(seconds=5)
    jobs = [
        job.model_copy(update={"leaseExpiresAt": expired.isoformat()})
        if job.jobId == job_id
        else job
        for job in manifest.jobs
    ]
    write_codex_final_job_manifest(workspace_root, manifest.model_copy(update={"jobs": jobs}))


def _manifest_job(
    workspace_root: Path,
    task_id: str,
    element_id: str,
) -> dict[str, Any]:
    manifest = read_codex_final_job_manifest(workspace_root, task_id)
    for job in manifest.jobs:
        if job.elementId == element_id:
            return job.model_dump(mode="json")
    raise AssertionError(f"Missing manifest job {element_id}")


def _write_valid_raw_output(workspace_root: Path, job: dict[str, Any]) -> None:
    _write_valid_raw_output_to_path(workspace_root, job, workspace_root / job["rawOutputPath"])


def _write_valid_raw_output_to_path(
    workspace_root: Path,
    job: dict[str, Any],
    path: Path,
) -> None:
    source_crop = next(image for image in job["inputImages"] if image["role"] == "source_crop")
    mask_input = next(image for image in job["inputImages"] if image["role"] == "mask")
    chroma_key = choose_chroma_key(workspace_root / source_crop["path"])
    with Image.open(workspace_root / mask_input["path"]) as mask_file:
        mask = mask_file.convert("L")
    path.parent.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGB", mask.size, chroma_key)
    for y in range(mask.height):
        for x in range(mask.width):
            if job.get("generationProfile") == "parent_inpaint_without_children":
                image.putpixel((x, y), (40, 90, 220))
            elif mask.getpixel((x, y)) > 0:
                image.putpixel((x, y), (40, 90, 220))
    image.putpixel((0, 0), chroma_key)
    image.save(path, format="PNG")


def _write_clipped_raw_output(workspace_root: Path, job: dict[str, Any]) -> None:
    source_crop = next(image for image in job["inputImages"] if image["role"] == "source_crop")
    reference = next(image for image in job["inputImages"] if image["role"] == "transparent_cutout")
    chroma_key = choose_chroma_key(workspace_root / source_crop["path"])
    with Image.open(workspace_root / reference["path"]) as reference_image:
        width, height = reference_image.size
    path = workspace_root / job["rawOutputPath"]
    path.parent.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGB", (width, height), chroma_key)
    for x in range(0, max(1, width // 4)):
        for y in range(1, max(1, height - 1)):
            image.putpixel((x, y), (40, 90, 220))
    image.save(path, format="PNG")


def _write_empty_raw_output(workspace_root: Path, job: dict[str, Any]) -> None:
    source_crop = next(image for image in job["inputImages"] if image["role"] == "source_crop")
    chroma_key = choose_chroma_key(workspace_root / source_crop["path"])
    with Image.open(workspace_root / source_crop["path"]) as source:
        size = source.size
    path = workspace_root / job["rawOutputPath"]
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", size, chroma_key).save(path, format="PNG")


def _item(task: dict[str, Any], element_id: str) -> dict[str, Any]:
    for item in task["items"]:
        if item["elementId"] == element_id:
            return item
    raise AssertionError(f"Missing task item {element_id}")
