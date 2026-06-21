from __future__ import annotations

import asyncio
import json
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from PIL import Image

from art_pipeline.codex_assets import generate_codex_final_asset
from art_pipeline.elements import ElementRecord, WorkspaceState
from art_pipeline.http.helpers import require_source_image as _require_source_image
from art_pipeline.provider_config import (
    get_codex_asset_provider as _get_codex_asset_provider,
    get_sam2_provider as _get_sam2_provider,
)
from art_pipeline.segment.assets import (
    is_sam2_edge_segmentable,
    sam2_edge_paths,
    suggest_sam2_edge_mask,
)
from art_pipeline.workspace.state_updates import (
    replace_workspace_elements as _replace_workspace_elements,
)
from art_pipeline.workspace.store import (
    read_state as _read_state,
    resolve_workspace_root as _resolve_workspace_root,
    write_state as _write_state,
)
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


CODEX_FINAL_MAX_WORKERS = 8


def start_sam2_mask_batch(root: Path, provider: Any) -> WorkspaceTask:
    task = create_workspace_task(
        root,
        "sam2_mask_batch",
        _sam2_task_items_for_state(root, _read_state(root)),
    )
    if task.total > 0:
        _start_background_task(
            _run_sam2_task,
            root,
            task.taskId,
            provider,
        )
    return task


def start_codex_final_batch(
    root: Path,
    provider: Any,
    element_ids: list[str] | None = None,
    prompt_hints: dict[str, str] | None = None,
    force: bool = False,
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
            provider,
            force,
        )
    return task


def register_task_routes(app: FastAPI) -> None:
    @app.get("/api/workspace/tasks")
    def get_tasks(runId: str | None = None) -> dict:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        return {
            "tasks": [
                task.model_dump(mode="json")
                for task in list_workspace_tasks(root)
            ]
        }

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
    def post_sam2_mask_task(runId: str | None = None) -> dict:
        provider = _get_sam2_provider(app)
        if provider is None:
            detail = app.state.sam2_provider_config_error or "SAM2 provider is not configured."
            raise HTTPException(status_code=503, detail=detail)

        root = _resolve_workspace_root(app.state.workspace_root, runId)
        task = start_sam2_mask_batch(root, provider)
        return task.model_dump(mode="json")

    @app.post("/api/workspace/tasks/codex-finals")
    async def post_codex_final_task(
        request: Request,
        runId: str | None = None,
    ) -> dict:
        provider = _get_codex_asset_provider(app)
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        body = await _json_body(request)
        task = start_codex_final_batch(
            root,
            provider,
            _element_ids_from_request(body),
            _prompt_hints_from_request(body),
            _force_from_request(body),
        )
        return task.model_dump(mode="json")

    @app.post("/api/workspace/tasks/{task_id}/retry-failed")
    def post_retry_failed(task_id: str, runId: str | None = None) -> dict:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        try:
            previous_task = read_workspace_task(root, task_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Workspace task not found.") from exc

        failed_ids = set(failed_task_element_ids(previous_task))
        retry_source_items = (
            _sam2_task_items_for_state(root, _read_state(root))
            if previous_task.type == "sam2_mask_batch"
            else _codex_task_items_for_state(
                _read_state(root),
                list(failed_ids),
                _prompt_hints_from_task(previous_task),
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
                _start_background_task(_run_sam2_task, root, task.taskId, provider)
        else:
            if task.total > 0:
                _start_background_task(
                    _run_codex_final_task,
                    root,
                    task.taskId,
                    _get_codex_asset_provider(app),
                    True,
                )
        return task.model_dump(mode="json")


def _start_background_task(function: Any, *args: Any) -> None:
    thread = threading.Thread(target=function, args=args, daemon=True)
    thread.start()


async def _task_event_stream(request: Request, root: Path):
    last_payload = ""
    last_item_versions: dict[str, str] = {}
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
        await asyncio.sleep(0.75 if _has_running_task_payload(tasks) else 3.0)


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


def _run_sam2_task(root: Path, task_id: str, provider: Any) -> None:
    mark_task_running(root, task_id)
    source_image = _require_source_image(root)
    for item in read_workspace_task(root, task_id).items:
        state = _read_state(root)
        element = _find_element(state, item.elementId)
        skip_reason = _sam2_skip_reason(root, element)
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


def _run_codex_final_task(root: Path, task_id: str, provider: Any, force: bool = False) -> None:
    mark_task_running(root, task_id)
    task = read_workspace_task(root, task_id)
    for item in task.items:
        element = _find_element(_read_state(root), item.elementId)
        skip_reason = _codex_skip_reason(element, force)
        if skip_reason:
            set_task_item_status(root, task_id, element.id, "skipped", skip_reason)

    queued_ids = [
        item.elementId
        for item in read_workspace_task(root, task_id).items
        if item.status == "queued"
    ]
    for element_id in queued_ids:
        set_task_item_status(root, task_id, element_id, "running", "Generating Codex final asset.")
    state_snapshot = _read_state(root)
    task_snapshot = read_workspace_task(root, task_id)
    prompt_hints = _prompt_hints_from_task(task_snapshot)
    with ThreadPoolExecutor(max_workers=CODEX_FINAL_MAX_WORKERS) as executor:
        futures = {
            executor.submit(
                _generate_one_codex_final,
                root,
                state_snapshot,
                element_id,
                provider,
                prompt_hints.get(element_id),
            ): element_id
            for element_id in queued_ids
        }
        for future in as_completed(futures):
            element_id = futures[future]
            try:
                updated, generation = future.result()
                state = _read_state(root)
                next_state = _replace_workspace_elements(
                    state,
                    [
                        updated if current.id == updated.id else current
                        for current in state.elements
                    ],
                )
                _write_state(root, next_state)
                set_task_item_status(
                    root,
                    task_id,
                    element_id,
                    "succeeded",
                    "Codex final asset ready.",
                    generation,
                )
            except Exception as exc:  # noqa: BLE001 - one failed asset must not stop the batch.
                set_task_item_status(root, task_id, element_id, "failed", str(exc))


def _generate_one_codex_final(
    root: Path,
    state: WorkspaceState,
    element_id: str,
    provider: Any,
    prompt_hint: str | None = None,
) -> tuple[ElementRecord, dict[str, Any]]:
    _next_state, updated, generation = generate_codex_final_asset(root, state, element_id, provider, prompt_hint)
    return updated, generation


def _sam2_task_items_for_state(root: Path, state: WorkspaceState) -> list[WorkspaceTaskItem]:
    elements = [
        element
        for element in state.elements
        if _needs_sam2_mask_generation(root, element)
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


def _sam2_skip_reason(root: Path, element: ElementRecord) -> str | None:
    if element.mergedInto:
        return f"Skipped because this source box is merged into {element.mergedInto}."
    if element.mode == "rejected" or element.status == "rejected":
        return "Skipped because this asset is rejected."
    if not element.visible:
        return "Skipped because this asset is hidden."
    if element.assetRole == "skip":
        return "Skipped because this asset role is skip."
    if element.segmentationStatus == "mask_accepted" and _has_reviewable_sam2_outputs(root, element):
        return "Skipped because this mask is already accepted."
    if element.segmentationStatus == "mask_suggested" and _has_reviewable_sam2_outputs(root, element):
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
    if not force and element.sourceProvider == "codex_cli" and element.exportStatus == "ready":
        return "Skipped because the Codex final asset already exists."
    return None


def _find_element(state: WorkspaceState, element_id: str) -> ElementRecord:
    for element in state.elements:
        if element.id == element_id:
            return element
    raise ValueError(f"Element {element_id} not found.")


def _needs_sam2_mask_generation(root: Path, element: ElementRecord) -> bool:
    if element.mergedInto or element.mode == "rejected" or element.status == "rejected":
        return False
    if not element.visible or element.assetRole == "skip":
        return False
    if not is_sam2_edge_segmentable(element):
        return False
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
    return force or not (element.sourceProvider == "codex_cli" and element.exportStatus in {"ready", "exported"})


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


def _element_ids_from_request(request: dict[str, Any]) -> list[str] | None:
    element_ids = request.get("elementIds")
    if element_ids is None:
        return None
    if not isinstance(element_ids, list) or not all(isinstance(item, str) for item in element_ids):
        raise HTTPException(status_code=400, detail="elementIds must be a list of strings.")
    return element_ids


def _prompt_hints_from_request(request: dict[str, Any]) -> dict[str, str]:
    prompt_hints = request.get("promptHints", {})
    if not isinstance(prompt_hints, dict):
        raise HTTPException(status_code=400, detail="promptHints must be an object.")
    return {
        element_id: hint.strip()
        for element_id, hint in prompt_hints.items()
        if isinstance(element_id, str) and isinstance(hint, str) and hint.strip()
    }


def _prompt_hints_from_task(task: WorkspaceTask) -> dict[str, str]:
    hints: dict[str, str] = {}
    for item in task.items:
        prompt_hint = item.artifactPaths.get("promptHint")
        if isinstance(prompt_hint, str) and prompt_hint.strip():
            hints[item.elementId] = prompt_hint.strip()
    return hints


def _force_from_request(request: dict[str, Any]) -> bool:
    return bool(request.get("force", False))


async def _json_body(request: Request) -> dict[str, Any]:
    raw_body = await request.body()
    if not raw_body:
        return {}
    payload = await request.json()
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Request body must be a JSON object.")
    return payload
