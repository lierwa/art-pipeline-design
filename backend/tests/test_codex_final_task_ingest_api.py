from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from art_pipeline.codex_final_jobs import read_codex_final_job_manifest
from test_codex_final_task_api import (
    _item,
    _manifest_job,
    _prepare_waiting_codex_final_task,
    _write_valid_raw_output,
)


def test_codex_final_concurrent_ingests_preserve_sibling_state(tmp_path: Path) -> None:
    client, workspace_root, task = _prepare_waiting_codex_final_task(
        tmp_path,
        with_second_element=True,
    )
    jobs = {
        element_id: _manifest_job(workspace_root, task["taskId"], element_id)
        for element_id in ("element_001", "element_002")
    }
    for job in jobs.values():
        _write_valid_raw_output(workspace_root, job)

    def ingest(element_id: str) -> dict[str, Any]:
        response = client.post(
            f"/api/workspace/tasks/{task['taskId']}/codex-final/jobs/{element_id}/ingest",
            json={"selectedSourcePath": (workspace_root / jobs[element_id]["rawOutputPath"]).as_posix()},
        )
        return {"status": response.status_code, "body": response.json()}

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(ingest, ("element_001", "element_002")))

    assert [result["status"] for result in results] == [200, 200]
    next_state = client.get("/api/workspace/state").json()
    parent_ids = {"element_001", "element_002"}
    providers = {
        element["id"]: element["sourceProvider"]
        for element in next_state["elements"]
        if element["id"] in parent_ids
    }
    assert providers == {"element_001": "codex_agent", "element_002": "codex_agent"}
    next_task = client.get(f"/api/workspace/tasks/{task['taskId']}").json()
    assert next_task["status"] == "succeeded"
    assert next_task["done"] == 2
    assert _item(next_task, "element_001")["status"] == "succeeded"
    assert _item(next_task, "element_002")["status"] == "succeeded"
    manifest = read_codex_final_job_manifest(workspace_root, task["taskId"])
    assert {job.elementId: job.status for job in manifest.jobs} == {
        "element_001": "finalized",
        "element_002": "finalized",
    }


def test_codex_agent_final_asset_is_not_requeued_by_next_batch(tmp_path: Path) -> None:
    client, workspace_root, task = _prepare_waiting_codex_final_task(tmp_path)
    job = _manifest_job(workspace_root, task["taskId"], "element_001")
    _write_valid_raw_output(workspace_root, job)

    ingest_response = client.post(
        f"/api/workspace/tasks/{task['taskId']}/codex-final/jobs/element_001/ingest",
        json={"selectedSourcePath": (workspace_root / job["rawOutputPath"]).as_posix()},
    )
    assert ingest_response.status_code == 200

    next_batch = client.post("/api/workspace/tasks/codex-finals")

    assert next_batch.status_code == 200
    assert next_batch.json()["status"] == "succeeded"
    assert next_batch.json()["total"] == 0
    assert next_batch.json()["items"] == []
