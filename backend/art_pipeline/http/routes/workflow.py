from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request

from art_pipeline.elements import WorkspaceState
from art_pipeline.http.helpers import require_source_image as _require_source_image
from art_pipeline.http.routes.tasks import (
    is_sam2_task_target,
    start_codex_final_batch,
    start_sam2_mask_batch,
)
from art_pipeline.provider_config import (
    get_detection_provider as _get_detection_provider,
    get_sam2_provider as _get_sam2_provider,
)
from art_pipeline.segment.assets import accept_sam2_edge_mask
from art_pipeline.workspace.state_updates import (
    replace_workspace_elements as _replace_workspace_elements,
)
from art_pipeline.workspace.store import (
    read_state as _read_state,
    resolve_workspace_root as _resolve_workspace_root,
    write_state as _write_state,
)
from art_pipeline.workspace.tasks import list_workspace_tasks
from art_pipeline.workspace.detection_tasks import start_detection_batch
from art_pipeline.workspace.workflow import (
    WorkflowState,
    WorkflowTaskIds,
    clear_stage_outputs,
    default_generate_selection,
    merge_generate_prompt_hints,
    merge_generate_selection,
    read_stage_snapshot,
    read_workflow,
    save_stage_snapshot,
    selected_generate_element_ids,
    write_workflow,
)


def register_workflow_routes(app: FastAPI) -> None:
    _register_workflow_state_routes(app)
    _register_workflow_detect_mask_routes(app)
    _register_workflow_generate_routes(app)
    _register_workflow_back_routes(app)


def _register_workflow_state_routes(app: FastAPI) -> None:
    @app.get("/api/workspace/workflow")
    def get_workflow(runId: str | None = None) -> dict:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        workflow = read_workflow(root, _read_state(root))
        return workflow.model_dump(mode="json")

    @app.patch("/api/workspace/workflow/generate-selection")
    async def patch_generate_selection(
        request: Request,
        runId: str | None = None,
    ) -> dict:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        state = _read_state(root)
        workflow = read_workflow(root, state)
        payload = await _json_body(request)
        raw_selection = payload.get("generateSelection", payload)
        if not isinstance(raw_selection, dict):
            raise HTTPException(status_code=400, detail="generateSelection must be an object.")
        selection = {
            element_id: bool(is_selected)
            for element_id, is_selected in raw_selection.items()
            if isinstance(element_id, str)
        }
        workflow = write_workflow(
            root,
            workflow.model_copy(update={"generateSelection": merge_generate_selection(state, selection)}),
        )
        return workflow.model_dump(mode="json")

    @app.patch("/api/workspace/workflow/generate-prompts")
    async def patch_generate_prompts(
        request: Request,
        runId: str | None = None,
    ) -> dict:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        state = _read_state(root)
        workflow = read_workflow(root, state)
        payload = await _json_body(request)
        raw_hints = payload.get("generatePromptHints", payload)
        if not isinstance(raw_hints, dict):
            raise HTTPException(status_code=400, detail="generatePromptHints must be an object.")
        hints = {
            element_id: hint
            for element_id, hint in raw_hints.items()
            if isinstance(element_id, str) and isinstance(hint, str)
        }
        workflow = write_workflow(
            root,
            workflow.model_copy(update={"generatePromptHints": merge_generate_prompt_hints(state, hints)}),
        )
        return workflow.model_dump(mode="json")


def _register_workflow_detect_mask_routes(app: FastAPI) -> None:
    @app.post("/api/workspace/stage/detect")
    def post_stage_detect(runId: str | None = None) -> dict:
        provider = _get_detection_provider(app)
        if provider is None:
            detail = app.state.detection_provider_config_error or "Detection provider is not configured."
            raise HTTPException(status_code=503, detail=detail)

        root = _resolve_workspace_root(app.state.workspace_root, runId)
        state = _read_state(root)
        if state.source is None:
            raise HTTPException(status_code=400, detail="Upload a source image before detection.")
        _reject_if_tasks_running(root)
        save_stage_snapshot(root, "upload", state)
        previous_workflow = read_workflow(root, state)
        task = start_detection_batch(root, provider)
        workflow = write_workflow(
            root,
            WorkflowState(
                stage="detect",
                generateSelection=merge_generate_selection(state),
                generatePromptHints=merge_generate_prompt_hints(state, previous_workflow.generatePromptHints),
                taskIds=WorkflowTaskIds(detectionBatch=task.taskId),
            ),
        )
        return {
            "state": state.model_dump(mode="json"),
            "workflow": workflow.model_dump(mode="json"),
            "task": task.model_dump(mode="json"),
        }

    @app.post("/api/workspace/stage/mask")
    def post_stage_mask(runId: str | None = None) -> dict:
        provider = _get_sam2_provider(app)
        if provider is None:
            detail = app.state.sam2_provider_config_error or "SAM2 provider is not configured."
            raise HTTPException(status_code=503, detail=detail)

        root = _resolve_workspace_root(app.state.workspace_root, runId)
        _reject_if_tasks_running(root)
        state = _read_state(root)
        if state.source is None:
            raise HTTPException(status_code=400, detail="Upload a source image before mask generation.")
        workflow = read_workflow(root, state)
        save_stage_snapshot(root, "detect", state)
        prepared_state, target_ids = _prepare_full_stage_mask_state(state)
        _write_state(root, prepared_state)
        task = start_sam2_mask_batch(root, provider, target_ids)
        workflow = write_workflow(
            root,
            WorkflowState(
                stage="mask",
                generateSelection=merge_generate_selection(prepared_state),
                generatePromptHints=merge_generate_prompt_hints(prepared_state, workflow.generatePromptHints),
                taskIds=WorkflowTaskIds(sam2MaskBatch=task.taskId),
            ),
        )
        return {
            "state": prepared_state.model_dump(mode="json"),
            "workflow": workflow.model_dump(mode="json"),
            "task": task.model_dump(mode="json"),
        }


def _register_workflow_generate_routes(app: FastAPI) -> None:
    @app.post("/api/workspace/stage/generate")
    async def post_stage_generate(
        request: Request,
        runId: str | None = None,
    ) -> dict:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        _reject_if_tasks_running(root)
        state = _read_state(root)
        if state.source is None:
            raise HTTPException(status_code=400, detail="Upload a source image before final generation.")

        workflow = read_workflow(root, state)
        if workflow.stage != "generate":
            save_stage_snapshot(root, "mask", state)
        body = await _json_body(request)
        request_element_ids = _element_ids_from_request(body)
        prompt_hints = _prompt_hints_from_request(body)
        force = _force_from_request(body)
        selected_ids = (
            _explicit_generate_element_ids(state, request_element_ids)
            if request_element_ids is not None
            else selected_generate_element_ids(state, workflow.generateSelection)
        )
        next_prompt_hints = merge_generate_prompt_hints(
            state,
            {**workflow.generatePromptHints, **prompt_hints},
        )
        accepted_state, accepted_ids = _accept_selected_masks(root, state, selected_ids)
        _write_state(root, accepted_state)
        task = start_codex_final_batch(
            root,
            element_ids=accepted_ids,
            prompt_hints=next_prompt_hints,
            force=force or workflow.stage == "generate",
            # WHY: stage/generate 是前端 Generate 按钮主路径；controller 需要当前
            # request base URL 与 runId 才能 claim 这个 run-scoped task。
            controller_api_base_url=str(request.base_url).rstrip("/"),
            run_id=runId,
        )
        next_selection = {
            element_id: element_id in set(selected_ids)
            for element_id in merge_generate_selection(accepted_state)
        }
        workflow = write_workflow(
            root,
            WorkflowState(
                stage="generate",
                generateSelection=next_selection,
                generatePromptHints=next_prompt_hints,
                taskIds=WorkflowTaskIds(
                    sam2MaskBatch=workflow.taskIds.sam2MaskBatch,
                    codexFinalBatches=[*workflow.taskIds.codexFinalBatches, task.taskId],
                ),
            ),
        )
        return {
            "state": accepted_state.model_dump(mode="json"),
            "workflow": workflow.model_dump(mode="json"),
            "task": task.model_dump(mode="json"),
        }


def _register_workflow_back_routes(app: FastAPI) -> None:
    @app.post("/api/workspace/stage/back")
    def post_stage_back(runId: str | None = None) -> dict:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        _reject_if_tasks_running(root)
        state = _read_state(root)
        workflow = read_workflow(root, state)

        if workflow.stage == "generate":
            snapshot = read_stage_snapshot(root, "mask")
            if snapshot is None:
                raise HTTPException(status_code=409, detail="No mask snapshot is available.")
            clear_stage_outputs(root, "generate")
            _write_state(root, snapshot)
            next_workflow = write_workflow(
                root,
                WorkflowState(
                    stage="mask",
                    generateSelection=merge_generate_selection(snapshot, workflow.generateSelection),
                    generatePromptHints=merge_generate_prompt_hints(snapshot, workflow.generatePromptHints),
                    taskIds=WorkflowTaskIds(sam2MaskBatch=workflow.taskIds.sam2MaskBatch),
                ),
            )
            return _stage_back_payload(snapshot, next_workflow)

        if workflow.stage == "mask":
            snapshot = read_stage_snapshot(root, "detect")
            if snapshot is None:
                raise HTTPException(status_code=409, detail="No detect snapshot is available.")
            clear_stage_outputs(root, "mask")
            _write_state(root, snapshot)
            next_workflow = write_workflow(
                root,
                WorkflowState(
                    stage="detect",
                    generateSelection=default_generate_selection(snapshot),
                    generatePromptHints=merge_generate_prompt_hints(snapshot, workflow.generatePromptHints),
                ),
            )
            return _stage_back_payload(snapshot, next_workflow)

        if workflow.stage == "detect":
            snapshot = read_stage_snapshot(root, "upload")
            if snapshot is None:
                snapshot = WorkspaceState(
                    source=state.source,
                    elements=[],
                    detectionVocabulary=state.detectionVocabulary,
                )
            clear_stage_outputs(root, "upload")
            _write_state(root, snapshot)
            next_workflow = write_workflow(
                root,
                WorkflowState(
                    stage="upload",
                    generateSelection={},
                ),
            )
            return _stage_back_payload(snapshot, next_workflow)

        raise HTTPException(status_code=409, detail="Already at upload stage.")


def record_export_summary(
    workspace_root: Path,
    state: WorkspaceState,
    summary: dict[str, Any],
) -> None:
    workflow = read_workflow(workspace_root, state)
    write_workflow(
        workspace_root,
        workflow.model_copy(update={"lastExportSummary": summary}),
    )


def _accept_selected_masks(
    root: Path,
    state: WorkspaceState,
    selected_ids: list[str],
) -> tuple[WorkspaceState, list[str]]:
    if not selected_ids:
        return state, []

    source_image = _require_source_image(root)
    current_state = state
    accepted_ids: list[str] = []
    for element_id in selected_ids:
        element = _find_element(current_state, element_id)
        if element.segmentationStatus == "mask_accepted":
            accepted_ids.append(element_id)
            continue
        try:
            current_state, _accepted = accept_sam2_edge_mask(
                root,
                source_image,
                current_state,
                element_id,
            )
            accepted_ids.append(element_id)
        except ValueError:
            # WHY: Generate 是批处理入口；缺 mask 的勾选项应在资源列表显示 blocked，
            # 不能让一个漏遮罩资源阻断其他已审核资源进入 Codex。
            continue
    return current_state, accepted_ids


def _prepare_full_stage_mask_state(state: WorkspaceState) -> tuple[WorkspaceState, list[str]]:
    target_ids: list[str] = []
    elements = []
    for element in state.elements:
        if not is_sam2_task_target(element):
            elements.append(element)
            continue
        target_ids.append(element.id)
        # WHY: Detect 阶段用户已经完成框的修订；点击 Generate Masks 表示用当前框
        # 全量重算 SAM2，旧 draft/accepted mask 和 final-ready 状态都不再可信。
        elements.append(
            element.model_copy(
                update={
                    "status": "accepted",
                    "mode": "visible_only",
                    "segmentationStatus": "not_started",
                    "segmentationQuality": None,
                    "mask": None,
                    "exportStatus": "not_ready",
                }
            )
        )
    return _replace_workspace_elements(state, elements), target_ids


def _find_element(state: WorkspaceState, element_id: str):
    for element in state.elements:
        if element.id == element_id:
            return element
    raise HTTPException(status_code=404, detail=f"Element {element_id} not found.")


def _explicit_generate_element_ids(
    state: WorkspaceState,
    element_ids: list[str],
) -> list[str]:
    requested = set(element_ids)
    selectable = set(selected_generate_element_ids(state, {element_id: True for element_id in requested}))
    return [
        element.id
        for element in state.elements
        if element.id in requested and element.id in selectable
    ]


def _reject_if_tasks_running(root: Path) -> None:
    if any(task.status in {"queued", "running"} for task in list_workspace_tasks(root)):
        raise HTTPException(status_code=409, detail="Wait for the current workspace task to finish.")


def _stage_back_payload(state: WorkspaceState, workflow: WorkflowState) -> dict:
    return {
        "state": state.model_dump(mode="json"),
        "workflow": workflow.model_dump(mode="json"),
    }


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
        element_id: hint
        for element_id, hint in prompt_hints.items()
        if isinstance(element_id, str) and isinstance(hint, str)
    }


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
