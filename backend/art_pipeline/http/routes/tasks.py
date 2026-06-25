from __future__ import annotations

import asyncio
import json
import threading
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from PIL import Image

from art_pipeline.codex_final_controller_launcher import (
    CodexFinalControllerLaunchError,
    CodexFinalControllerSettings,
    controller_settings_from_env,
    start_codex_final_controllers,
)
from art_pipeline.codex_process_control import stop_codex_exec_processes
from art_pipeline.workspace.codex_final_recovery import (
    recover_codex_final_generated_images,
    start_codex_final_recovery_monitor,
)
from art_pipeline.elements import ElementRecord, WorkspaceState
from art_pipeline.http.helpers import require_source_image as _require_source_image
from art_pipeline.http.routes.task_request_parsing import (
    codex_final_ingest_request_from_body as _codex_final_ingest_request_from_body,
    element_ids_from_request as _element_ids_from_request,
    force_from_request as _force_from_request,
    json_body as _json_body,
    prompt_hints_from_request as _prompt_hints_from_request,
)
from art_pipeline.provider_config import get_sam2_provider as _get_sam2_provider
from art_pipeline.segment.assets import (
    is_sam2_edge_segmentable,
    sam2_edge_paths,
    suggest_sam2_edge_mask,
)
from art_pipeline.workspace.codex_final_tasks import (
    CODEX_FINAL_LEASE_SECONDS,
    CodexFinalClaimRequest,
    CodexFinalFailRequest,
    CodexFinalHeartbeatRequest,
    CodexFinalIngestError,
    CodexFinalLeaseError,
    CodexFinalJobNotFoundError,
    claim_codex_final_agent_jobs,
    codex_final_prompt_hints_from_task,
    fail_codex_final_agent_job,
    heartbeat_codex_final_agent_job,
    ingest_codex_final_agent_job,
    ingest_codex_final_controller_job,
    mark_codex_final_controller_launch_failed,
    normalize_codex_final_agent_queue,
    run_codex_final_agent_task,
    stop_active_codex_final_tasks,
)
from art_pipeline.workspace.state_updates import replace_workspace_elements as _replace_workspace_elements
from art_pipeline.workspace.store import (
    read_state as _read_state,
    resolve_workspace_root as _resolve_workspace_root,
    write_state as _write_state,
)
from art_pipeline.workspace.task_events import task_event_version, wait_for_workspace_task_change
from art_pipeline.workspace.tasks import (
    WorkspaceTask,
    WorkspaceTaskItem,
    create_workspace_task,
    failed_task_element_ids,
    list_workspace_tasks,
    mark_task_running,
    read_workspace_task,
    set_task_item_status,
)


def start_sam2_mask_batch(
    root: Path,
    provider: Any,
    element_ids: list[str] | None = None,
    force: bool = False,
) -> WorkspaceTask:
    task = create_workspace_task(
        root,
        "sam2_mask_batch",
        _sam2_task_items_for_state(root, _read_state(root), element_ids, force),
    )
    if task.total > 0:
        _start_background_task(
            _run_sam2_task,
            root,
            task.taskId,
            provider,
            force,
        )
    return task


def start_codex_final_batch(
    root: Path,
    element_ids: list[str] | None = None,
    prompt_hints: dict[str, str] | None = None,
    force: bool = False,
    controller_api_base_url: str | None = None,
    run_id: str | None = None,
) -> WorkspaceTask:
    task = create_workspace_task(
        root,
        "codex_final_batch",
        _codex_task_items_for_state(_read_state(root), element_ids, prompt_hints, force),
    )
    if task.total > 0:
        _start_background_task(
            _run_codex_final_task,
            root,
            task.taskId,
            force,
            controller_api_base_url,
            run_id,
        )
    return task


def register_task_routes(app: FastAPI) -> None:
    @app.get("/api/workspace/tasks")
    def get_tasks(runId: str | None = None) -> dict:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        return {"tasks": [task.model_dump(mode="json") for task in list_workspace_tasks(root)]}

    @app.get("/api/workspace/tasks/events")
    async def get_task_events(request: Request, runId: str | None = None) -> StreamingResponse:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        return StreamingResponse(
            _task_event_stream(request, root),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache"},
        )

    @app.get("/api/workspace/tasks/{task_id}")
    def get_task(task_id: str, runId: str | None = None) -> dict:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        try:
            return read_workspace_task(root, task_id).model_dump(mode="json")
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Workspace task not found.") from exc

    @app.post("/api/workspace/tasks/sam2-masks")
    async def post_sam2_mask_task(
        request: Request,
        runId: str | None = None,
    ) -> dict:
        provider = _get_sam2_provider(app)
        if provider is None:
            detail = app.state.sam2_provider_config_error or "SAM2 provider is not configured."
            raise HTTPException(status_code=503, detail=detail)

        root = _resolve_workspace_root(app.state.workspace_root, runId)
        body = await _json_body(request)
        task = start_sam2_mask_batch(
            root,
            provider,
            _element_ids_from_request(body),
            _force_from_request(body),
        )
        return task.model_dump(mode="json")

    @app.post("/api/workspace/tasks/codex-finals")
    async def post_codex_final_task(
        request: Request,
        runId: str | None = None,
    ) -> dict:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        body = await _json_body(request)
        task = start_codex_final_batch(
            root,
            element_ids=_element_ids_from_request(body),
            prompt_hints=_prompt_hints_from_request(body),
            force=_force_from_request(body),
            controller_api_base_url=str(request.base_url).rstrip("/"),
            run_id=runId,
        )
        return task.model_dump(mode="json")

    @app.post("/api/workspace/tasks/{task_id}/retry-failed")
    def post_retry_failed(request: Request, task_id: str, runId: str | None = None) -> dict:
        return _retry_failed_task(
            app,
            task_id,
            runId,
            controller_api_base_url=str(request.base_url).rstrip("/"),
        ).model_dump(mode="json")

    @app.post("/api/workspace/tasks/codex-final/stop-all")
    def post_stop_codex_final_generation(runId: str | None = None) -> dict:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        process_result = stop_codex_exec_processes()
        stop_result = stop_active_codex_final_tasks(root)
        return {
            "matchedProcessCount": process_result.matched_process_count,
            "terminatedProcessCount": process_result.terminated_process_count,
            "failedTaskCount": stop_result.failedTaskCount,
            "failedJobCount": stop_result.failedJobCount,
            "failedItemCount": stop_result.failedItemCount,
            "errors": process_result.errors,
            "tasks": [task.model_dump(mode="json") for task in stop_result.tasks],
        }

    @app.post("/api/workspace/tasks/{task_id}/codex-final/jobs/claim")
    async def post_codex_final_job_claim(
        request: Request,
        task_id: str,
        runId: str | None = None,
    ) -> dict:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        body = await _json_body(request)
        try:
            payload = _codex_final_claim_request_from_body(body)
            result = claim_codex_final_agent_jobs(root, task_id, payload)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Workspace task not found.") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return result.model_dump(mode="json")

    @app.post("/api/workspace/tasks/{task_id}/codex-final/jobs/{job_id}/heartbeat")
    async def post_codex_final_job_heartbeat(
        request: Request,
        task_id: str,
        job_id: str,
        runId: str | None = None,
    ) -> dict:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        body = await _json_body(request)
        try:
            payload = _codex_final_heartbeat_request_from_body(body)
            result = heartbeat_codex_final_agent_job(root, task_id, job_id, payload)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Workspace task not found.") from exc
        except CodexFinalJobNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Codex final job not found.") from exc
        except CodexFinalLeaseError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return result.model_dump(mode="json")

    @app.post("/api/workspace/tasks/{task_id}/codex-final/jobs/{job_id}/fail")
    async def post_codex_final_job_fail(
        request: Request,
        task_id: str,
        job_id: str,
        runId: str | None = None,
    ) -> dict:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        body = await _json_body(request)
        try:
            payload = _codex_final_fail_request_from_body(body)
            result = fail_codex_final_agent_job(root, task_id, job_id, payload)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Workspace task not found.") from exc
        except CodexFinalJobNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Codex final job not found.") from exc
        except CodexFinalLeaseError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return result.model_dump(mode="json")

    @app.post("/api/workspace/tasks/{task_id}/codex-final/jobs/{job_id}/ingest")
    async def post_codex_final_controller_job_ingest(
        request: Request,
        task_id: str,
        job_id: str,
        runId: str | None = None,
    ) -> dict:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        try:
            payload = _codex_final_ingest_request_from_body(await _json_body(request))
            if payload.controllerId or payload.leaseToken:
                result = ingest_codex_final_controller_job(root, task_id, job_id, payload)
            else:
                result = ingest_codex_final_agent_job(root, task_id, job_id, payload)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Workspace task not found.") from exc
        except CodexFinalJobNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Codex final job not found.") from exc
        except CodexFinalLeaseError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except (CodexFinalIngestError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return result.model_dump(mode="json")

    @app.post("/api/workspace/tasks/{task_id}/codex-final/recover-generated-images")
    async def post_codex_final_generated_images_recover(
        request: Request,
        task_id: str,
        runId: str | None = None,
    ) -> dict:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        try:
            body = await _json_body(request)
            result = recover_codex_final_generated_images(
                root,
                task_id,
                include_failed_manual_stops=bool(body.get("includeFailedManualStops", False)),
            )
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Workspace task not found.") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return result.model_dump(mode="json")

    @app.post("/api/workspace/tasks/{task_id}/codex-final/controllers/start")
    async def post_codex_final_controllers_start(
        request: Request,
        task_id: str,
        runId: str | None = None,
    ) -> dict:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        body = await _json_body(request)
        try:
            task = normalize_codex_final_agent_queue(root, task_id)
            settings = _codex_final_controller_settings_from_body(body)
            controllers = start_codex_final_controllers(
                workspace_root=root,
                task_id=task_id,
                api_base_url=str(request.base_url).rstrip("/"),
                run_id=runId,
                settings=settings,
            )
            if controllers:
                start_codex_final_recovery_monitor(root, task_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Workspace task not found.") from exc
        except CodexFinalControllerLaunchError as exc:
            if exc.started_count == 0:
                mark_codex_final_controller_launch_failed(root, task_id, str(exc))
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {
            "task": task.model_dump(mode="json"),
            "controllers": [controller.__dict__ for controller in controllers],
        }

def _retry_failed_task(
    app: FastAPI,
    task_id: str,
    run_id: str | None = None,
    controller_api_base_url: str | None = None,
) -> WorkspaceTask:
    root = _resolve_workspace_root(app.state.workspace_root, run_id)
    try:
        previous_task = read_workspace_task(root, task_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Workspace task not found.") from exc

    if previous_task.type == "detection_batch":
        raise HTTPException(status_code=400, detail="Run detection again to retry detection output.")

    failed_ids = set(failed_task_element_ids(previous_task))
    retry_source_items = (
        _sam2_task_items_for_state(root, _read_state(root), list(failed_ids), force=True)
        if previous_task.type == "sam2_mask_batch"
        else _codex_task_items_for_state(
            _read_state(root),
            list(failed_ids),
            codex_final_prompt_hints_from_task(previous_task),
            force=True,
        )
    )
    retry_items = [item for item in retry_source_items if item.elementId in failed_ids]
    task = create_workspace_task(root, previous_task.type, retry_items)
    if previous_task.type == "sam2_mask_batch":
        provider = _get_sam2_provider(app)
        if provider is None:
            detail = app.state.sam2_provider_config_error or "SAM2 provider is not configured."
            raise HTTPException(status_code=503, detail=detail)
        if task.total > 0:
            _start_background_task(_run_sam2_task, root, task.taskId, provider, True)
    elif task.total > 0:
        _start_background_task(
            _run_codex_final_task,
            root,
            task.taskId,
            True,
            controller_api_base_url,
            run_id,
        )
    return task


def _start_background_task(function: Any, *args: Any) -> None:
    thread = threading.Thread(target=function, args=args, daemon=True)
    thread.start()


def _codex_final_claim_request_from_body(body: dict[str, Any]) -> CodexFinalClaimRequest:
    controller_id = body.get("controllerId")
    capacity = body.get("capacity")
    if not isinstance(controller_id, str) or not controller_id.strip():
        raise ValueError("controllerId is required.")
    if not isinstance(capacity, int):
        raise ValueError("capacity must be an integer.")
    return CodexFinalClaimRequest(
        controllerId=controller_id.strip(),
        capacity=capacity,
        leaseSeconds=_int_from_body(body, "leaseSeconds", CODEX_FINAL_LEASE_SECONDS),
    )


def _codex_final_heartbeat_request_from_body(body: dict[str, Any]) -> CodexFinalHeartbeatRequest:
    controller_id = body.get("controllerId")
    lease_token = body.get("leaseToken")
    phase = body.get("phase", "agent_running")
    if not isinstance(controller_id, str) or not controller_id.strip():
        raise ValueError("controllerId is required.")
    if not isinstance(lease_token, str) or not lease_token.strip():
        raise ValueError("leaseToken is required.")
    return CodexFinalHeartbeatRequest(
        controllerId=controller_id.strip(),
        leaseToken=lease_token.strip(),
        phase=phase if isinstance(phase, str) else "agent_running",
        leaseSeconds=_int_from_body(body, "leaseSeconds", CODEX_FINAL_LEASE_SECONDS),
    )


def _codex_final_fail_request_from_body(body: dict[str, Any]) -> CodexFinalFailRequest:
    controller_id = body.get("controllerId")
    lease_token = body.get("leaseToken")
    error = body.get("error")
    if not isinstance(controller_id, str) or not controller_id.strip():
        raise ValueError("controllerId is required.")
    if not isinstance(lease_token, str) or not lease_token.strip():
        raise ValueError("leaseToken is required.")
    if not isinstance(error, str) or not error.strip():
        raise ValueError("error is required.")
    return CodexFinalFailRequest(
        controllerId=controller_id.strip(),
        leaseToken=lease_token.strip(),
        error=error.strip(),
        retryable=bool(body.get("retryable", True)),
    )


def _int_from_body(body: dict[str, Any], key: str, default: int) -> int:
    value = body.get(key, default)
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{key} must be an integer.")
    return value


def _codex_final_controller_settings_from_body(body: dict[str, Any]) -> CodexFinalControllerSettings:
    defaults = controller_settings_from_env()
    return CodexFinalControllerSettings(
        controller_count=_int_from_body(body, "controllerCount", defaults.controller_count),
        subagents_per_controller=_int_from_body(
            body,
            "subagentsPerController",
            defaults.subagents_per_controller,
        ),
        codex_command=defaults.codex_command,
    )


async def _task_event_stream(request: Request, root: Path):
    last_payload = ""
    last_item_versions: dict[str, str] = {}
    event_version = task_event_version(root)
    while not await request.is_disconnected():
        tasks = [task.model_dump(mode="json") for task in list_workspace_tasks(root)]
        item_versions = _task_item_versions(tasks)
        changed_element_ids = [
            element_id
            for element_id, version in item_versions.items()
            if last_item_versions.get(element_id) != version
        ]
        payload = json.dumps(
            {
                "tasks": tasks,
                "changedElementIds": changed_element_ids,
            },
            separators=(",", ":"),
        )
        if payload != last_payload:
            yield f"event: snapshot\ndata: {payload}\n\n"
            last_payload = payload
            last_item_versions = item_versions
        else:
            yield "event: heartbeat\ndata: {}\n\n"
        # WHY: task 写入会主动唤醒 SSE，让检测框落盘后尽快刷新主画布；短轮询仍保留，
        # 防止客户端错过通知或未来写入路径忘记触发事件。
        event_version = await asyncio.to_thread(
            wait_for_workspace_task_change,
            root,
            event_version,
            _task_poll_interval(tasks),
        )


def _task_item_versions(tasks: list[dict[str, Any]]) -> dict[str, str]:
    versions: dict[str, str] = {}
    for task in tasks:
        for item in task.get("items", []):
            if not isinstance(item, dict):
                continue
            element_id = item.get("elementId")
            if not isinstance(element_id, str):
                continue
            if element_id in versions:
                continue
            versions[element_id] = json.dumps(
                {
                    "taskId": task.get("taskId"),
                    "status": item.get("status"),
                    "message": item.get("message"),
                    "finishedAt": item.get("finishedAt"),
                    "artifactPaths": item.get("artifactPaths"),
                },
                sort_keys=True,
            )
    return versions


def _has_running_task_payload(tasks: list[dict[str, Any]]) -> bool:
    return any(task.get("status") in {"queued", "running"} for task in tasks)


def _task_poll_interval(tasks: list[dict[str, Any]]) -> float:
    has_running_detection = any(
        task.get("type") == "detection_batch"
        and task.get("status") in {"queued", "running"}
        for task in tasks
    )
    if has_running_detection:
        # WHY: 写入通知是主路径；短 fallback polling 防止 missed notification，
        # 后续如果 workspace 状态也全面事件化，可再把这里调回普通后台任务间隔。
        return 0.2
    return 0.75 if _has_running_task_payload(tasks) else 3.0


def _run_sam2_task(root: Path, task_id: str, provider: Any, force: bool = False) -> None:
    mark_task_running(root, task_id)
    source_image = _require_source_image(root)
    for item in read_workspace_task(root, task_id).items:
        state = _read_state(root)
        element = _find_element(state, item.elementId)
        skip_reason = _sam2_skip_reason(root, element, force)
        if skip_reason:
            set_task_item_status(root, task_id, element.id, "skipped", skip_reason)
            continue

        set_task_item_status(root, task_id, element.id, "running", "Running SAM2 mask.")
        try:
            updated, segmentation = suggest_sam2_edge_mask(root, source_image, element, provider, state)
            next_state = _replace_workspace_elements(
                state,
                [
                    updated if current.id == element.id else current
                    for current in state.elements
                ],
            )
            _write_state(root, next_state)
            set_task_item_status(
                root,
                task_id,
                element.id,
                "succeeded",
                "SAM2 mask ready.",
                segmentation,
            )
        except Exception as exc:  # noqa: BLE001 - each item must fail independently.
            set_task_item_status(root, task_id, element.id, "failed", str(exc))


def _run_codex_final_task(
    root: Path,
    task_id: str,
    force: bool = False,
    controller_api_base_url: str | None = None,
    run_id: str | None = None,
) -> None:
    run_codex_final_agent_task(root, task_id, _codex_skip_reason, force)
    if controller_api_base_url is not None:
        try:
            controllers = start_codex_final_controllers(
                workspace_root=root,
                task_id=task_id,
                api_base_url=controller_api_base_url,
                run_id=run_id,
            )
            if controllers:
                start_codex_final_recovery_monitor(root, task_id)
        except CodexFinalControllerLaunchError as exc:
            if exc.started_count == 0:
                mark_codex_final_controller_launch_failed(root, task_id, str(exc))
                return
            raise


def _sam2_task_items_for_state(
    root: Path,
    state: WorkspaceState,
    element_ids: list[str] | None = None,
    force: bool = False,
) -> list[WorkspaceTaskItem]:
    requested_ids = set(element_ids) if element_ids is not None else None
    elements = [
        element
        for element in state.elements
        if (
            _needs_sam2_mask_generation(root, element, force)
            if requested_ids is None
            else element.id in requested_ids and is_sam2_task_target(element)
        )
    ]
    # WHY: parent mask 要扣掉 removable_child mask；批量生成时先跑 child，
    # 再跑 parent，才能让父级拿到同一批里刚生成的 child 结果。
    elements.sort(key=lambda element: 1 if element.assetRole == "parent" else 0)
    return [_task_item_for_element(element) for element in elements]


def _codex_task_items_for_state(
    state: WorkspaceState,
    element_ids: list[str] | None = None,
    prompt_hints: dict[str, str] | None = None,
    force: bool = False,
) -> list[WorkspaceTaskItem]:
    requested_ids = set(element_ids) if element_ids is not None else None
    prompt_hints = prompt_hints or {}
    return [
        _task_item_for_element(element, prompt_hints.get(element.id))
        for element in state.elements
        if requested_ids is None or element.id in requested_ids
        if _needs_codex_final_generation(element, force)
    ]


def _task_item_for_element(element: ElementRecord, prompt_hint: str | None = None) -> WorkspaceTaskItem:
    artifact_paths = {"promptHint": prompt_hint.strip()} if isinstance(prompt_hint, str) and prompt_hint.strip() else {}
    return WorkspaceTaskItem(elementId=element.id, name=element.name, artifactPaths=artifact_paths)


def _sam2_skip_reason(root: Path, element: ElementRecord, force: bool = False) -> str | None:
    if element.mergedInto:
        return f"Skipped because this source box is merged into {element.mergedInto}."
    if element.mode == "rejected" or element.status == "rejected":
        return "Skipped because this asset is rejected."
    if not element.visible:
        return "Skipped because this asset is hidden."
    if element.assetRole == "skip":
        return "Skipped because this asset role is skip."
    if not force and element.segmentationStatus == "mask_accepted" and _has_reviewable_sam2_outputs(root, element):
        return "Skipped because this mask is already accepted."
    if not force and element.segmentationStatus == "mask_suggested" and _has_reviewable_sam2_outputs(root, element):
        return "Skipped because this mask is already ready for review."
    if not is_sam2_edge_segmentable(element):
        return "Skipped because this asset is not ready for SAM2."
    return None


def _codex_skip_reason(element: ElementRecord, force: bool = False) -> str | None:
    if element.mergedInto:
        return f"Skipped because this source box is merged into {element.mergedInto}."
    if element.mode == "rejected" or element.status == "rejected":
        return "Skipped because this asset is rejected."
    if not element.visible:
        return "Skipped because this asset is hidden."
    if element.assetRole == "skip":
        return "Skipped because this asset role is skip."
    if element.segmentationStatus != "mask_accepted":
        return "Skipped because this mask is not accepted."
    if not force and _has_existing_codex_final_asset(element, {"ready"}):
        return "Skipped because the Codex final asset already exists."
    return None


def _find_element(state: WorkspaceState, element_id: str) -> ElementRecord:
    for element in state.elements:
        if element.id == element_id:
            return element
    raise ValueError(f"Element {element_id} not found.")


def is_sam2_task_target(element: ElementRecord) -> bool:
    # WHY: Detect -> Mask 的 workflow action 是“当前有效框全量跑遮罩”；
    # 这里定义资产级准入，pending/已有 mask 等状态由具体入口决定。
    if element.mergedInto or element.mode == "rejected" or element.status == "rejected":
        return False
    if not element.visible or element.assetRole == "skip":
        return False
    return element.assetRole in {"sticker", "removable_child", "parent"}


def _needs_sam2_mask_generation(root: Path, element: ElementRecord, force: bool = False) -> bool:
    if element.mergedInto or element.mode == "rejected" or element.status == "rejected":
        return False
    if not element.visible or element.assetRole == "skip":
        return False
    if not is_sam2_edge_segmentable(element):
        return False
    if force:
        # WHY: Segment 评审阶段用户会发现某几个 SAM2 draft 明显错误；显式重跑必须
        # 覆盖已有 draft/accepted mask，同时保留隐藏/拒绝/合并源框等资产准入规则。
        return True
    if element.segmentationStatus in {"not_started", "mask_rejected"}:
        return True
    if element.segmentationStatus == "mask_suggested":
        # WHY: workspace state can say "mask_suggested" while files are missing after
        # manual edits, refreshes, or old runs. Batch generation must repair that stale
        # state instead of reporting a misleading skipped item.
        return not _has_reviewable_sam2_outputs(root, element)
    return False


def _needs_codex_final_generation(element: ElementRecord, force: bool = False) -> bool:
    if element.mergedInto or element.mode == "rejected" or element.status == "rejected":
        return False
    if not element.visible or element.assetRole == "skip":
        return False
    if element.segmentationStatus != "mask_accepted":
        return False
    return force or not _has_existing_codex_final_asset(element, {"ready", "exported"})


def _has_existing_codex_final_asset(
    element: ElementRecord,
    export_statuses: set[str],
) -> bool:
    return (
        element.sourceProvider in {"codex_cli", "codex_agent"}
        and element.exportStatus in export_statuses
    )


def _has_reviewable_sam2_outputs(root: Path, element: ElementRecord) -> bool:
    paths = sam2_edge_paths(element.id)
    return (
        element.mask == paths["maskPath"]
        and _workspace_file(root, paths["maskPath"]).exists()
        and _workspace_file(root, paths["assetPath"]).exists()
    )


def _workspace_file(workspace_root: Path, relative_path: str) -> Path:
    workspace_path = workspace_root.resolve()
    resolved = (workspace_path / relative_path).resolve()
    resolved.relative_to(workspace_path)
    return resolved
