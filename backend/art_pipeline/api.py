from __future__ import annotations

import json
import os
from pathlib import Path
from typing import cast

from fastapi import FastAPI, HTTPException
from PIL import Image

from art_pipeline.annotations import (
    validate_workspace_state_geometry,
)
from art_pipeline.click_detect import candidate_from_click_mask
from art_pipeline.codex_assets import (
    CodexAssetProvider,
)
from art_pipeline.course_planner.codex_json_provider import CodexJsonProvider
from art_pipeline.course_planner.routes import register_course_planner_routes
from art_pipeline.http.helpers import (
    get_element as _get_element,
    normalize_label as _normalize_label,
    require_source_image as _require_source_image,
)
from art_pipeline.http.models import (
    ClickDetectRequest,
)
from art_pipeline.http.routes.elements import register_element_routes
from art_pipeline.http.routes.repair import register_repair_routes
from art_pipeline.http.routes.segment import register_segment_routes
from art_pipeline.http.routes.tasks import register_task_routes
from art_pipeline.http.routes.workflow import (
    record_export_summary,
    register_workflow_routes,
)
from art_pipeline.http.routes.workspace import register_workspace_routes
from art_pipeline.detection import (
    DetectionProvider,
    DetectionProviderNotConfigured,
)
from art_pipeline.detection_results import (
    collect_detection_results as _collect_detection_results,
    detection_results_to_elements as _detection_results_to_elements,
)
from art_pipeline.elements import (
    WorkspaceState,
)
from art_pipeline.exporting.exporter import ExportWorkspaceRequest, export_workspace
from art_pipeline.provider_config import (
    Sam2ClickProvider,
    detection_provider_factory_from_env as _detection_provider_factory_from_env,
    get_detection_provider as _get_detection_provider,
    get_sam2_provider as _get_sam2_provider,
    sam2_provider_factory_from_env as _sam2_provider_factory_from_env,
)
from art_pipeline.repair.tasks import (
    clear_repair_outputs,
)
from art_pipeline.segmentation import (
    ExtractWorkspaceRequest,
    SegmentationUnavailableError,
    extract_with_strategy,
)
from art_pipeline.vocabulary import normalize_detection_vocabulary
from art_pipeline.workspace.store import (
    clear_generated_workspace_outputs as _clear_generated_workspace_outputs,
    read_state as _read_state,
    resolve_workspace_root as _resolve_workspace_root,
    write_state as _write_state,
)
from art_pipeline.workspace.state_updates import (
    invalidate_geometry_changes as _invalidate_geometry_changes,
    replace_workspace_elements as _replace_workspace_elements,
)
from art_pipeline.workspace.extraction_targets import (
    select_extraction_targets as _select_extraction_targets,
)


_USE_ENV_DETECTION_PROVIDER = object()


def create_app(
    workspace_root: Path | None = None,
    detection_provider: DetectionProvider | None | object = _USE_ENV_DETECTION_PROVIDER,
    sam2_provider: Sam2ClickProvider | None = None,
    codex_asset_provider: CodexAssetProvider | None = None,
    course_planner_ai_provider: CodexJsonProvider | None = None,
) -> FastAPI:
    app = FastAPI(title="Art Pipeline Workbench API")
    _configure_app_state(
        app,
        workspace_root=workspace_root,
        detection_provider=detection_provider,
        sam2_provider=sam2_provider,
        codex_asset_provider=codex_asset_provider,
        course_planner_ai_provider=course_planner_ai_provider,
    )
    _register_routes(app)
    return app


def _configure_app_state(
    app: FastAPI,
    *,
    workspace_root: Path | None,
    detection_provider: DetectionProvider | None | object,
    sam2_provider: Sam2ClickProvider | None,
    codex_asset_provider: CodexAssetProvider | None,
    course_planner_ai_provider: CodexJsonProvider | None,
) -> None:
    configured_detection_provider, detection_factory, detection_error = (
        _resolve_detection_provider_config(detection_provider)
    )
    sam2_factory, sam2_error = _resolve_sam2_provider_config(sam2_provider)
    app.state.workspace_root = (workspace_root or Path("workspace")).resolve()
    app.state.scene_library_root = app.state.workspace_root.parent / "scene_library"
    app.state.detection_provider = configured_detection_provider
    app.state.detection_provider_factory = detection_factory
    app.state.detection_provider_config_error = detection_error
    app.state.sam2_provider = sam2_provider
    app.state.sam2_provider_factory = sam2_factory
    app.state.sam2_provider_config_error = sam2_error
    app.state.codex_asset_provider = codex_asset_provider
    app.state.course_planner_ai_provider = course_planner_ai_provider


def _resolve_detection_provider_config(
    detection_provider: DetectionProvider | None | object,
) -> tuple[DetectionProvider | None, object | None, str | None]:
    if detection_provider is not _USE_ENV_DETECTION_PROVIDER:
        return cast(DetectionProvider | None, detection_provider), None, None
    try:
        return None, _detection_provider_factory_from_env(), None
    except DetectionProviderNotConfigured as exc:
        return None, None, str(exc)


def _resolve_sam2_provider_config(
    sam2_provider: Sam2ClickProvider | None,
) -> tuple[object | None, str | None]:
    if sam2_provider is not None:
        return None, None
    try:
        return _sam2_provider_factory_from_env(), None
    except DetectionProviderNotConfigured as exc:
        return None, str(exc)


def _register_routes(app: FastAPI) -> None:
    register_element_routes(app)
    register_repair_routes(app)
    register_segment_routes(app)
    register_task_routes(app)
    register_workflow_routes(app)
    register_workspace_routes(app)
    register_course_planner_routes(app)
    _register_workspace_state_routes(app)
    _register_workspace_processing_routes(app)
    _register_workspace_detection_routes(app)


def _register_workspace_state_routes(app: FastAPI) -> None:
    @app.get("/api/workspace/state")
    def get_state(runId: str | None = None) -> WorkspaceState:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        return _read_state(root)

    @app.put("/api/workspace/state")
    def put_state(state: WorkspaceState, runId: str | None = None) -> WorkspaceState:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        try:
            validate_workspace_state_geometry(state)
            state = _invalidate_geometry_changes(root, _read_state(root), state)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        _write_state(root, state)
        return state

    @app.post("/api/workspace/detection-vocabulary")
    def post_detection_vocabulary(
        vocabulary: list[str],
        runId: str | None = None,
    ) -> WorkspaceState:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        state = _read_state(root)
        try:
            normalized = normalize_detection_vocabulary(vocabulary)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        next_state = WorkspaceState(
            source=state.source,
            elements=state.elements,
            detectionVocabulary=normalized,
        )
        _write_state(root, next_state)
        return next_state


def _register_workspace_processing_routes(app: FastAPI) -> None:
    @app.post("/api/workspace/extract")
    def post_extract(request: ExtractWorkspaceRequest, runId: str | None = None) -> dict:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        state = _read_state(root)
        if state.source is None:
            raise HTTPException(status_code=400, detail="Upload a source image before extraction.")

        source_image = _require_source_image(root)
        targets = _select_extraction_targets(state, request.elementIds)

        extractions = []
        try:
            for element in targets:
                extractions.append(
                    extract_with_strategy(
                        root,
                        source_image,
                        element,
                        request.strategy,
                        request.sam2Prompt,
                    )
                )
        except SegmentationUnavailableError as exc:
            raise HTTPException(status_code=501, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        mask_paths = {
            extraction["elementId"]: extraction["maskPath"]
            for extraction in extractions
        }
        for element_id in mask_paths:
            clear_repair_outputs(root, element_id)
        next_state = _replace_workspace_elements(
            state,
            [
                element.model_copy(
                    update={
                        "status": "extracted",
                        "mask": mask_paths[element.id],
                    }
                )
                if element.id in mask_paths
                else element
                for element in state.elements
            ],
        )
        _write_state(root, next_state)
        return {
            "extractions": extractions,
            "state": next_state.model_dump(mode="json"),
        }

    @app.post("/api/workspace/export")
    def post_export(
        request: ExportWorkspaceRequest | None = None,
        runId: str | None = None,
    ) -> dict:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        state = _read_state(root)
        # WHY: 旧客户端可能仍发送 allowIncompleteVisibleOnly；final export 已把该字段降级为
        # API 兼容输入，导出核心不再接收会改变准入规则的 debug override。
        _ = request or ExportWorkspaceRequest()
        try:
            summary = export_workspace(root, state)
            record_export_summary(root, state, summary)
            return summary
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post("/api/workspace/auto-annotate")
    def auto_annotate_removed() -> None:
        raise HTTPException(
            status_code=410,
            detail=(
                "Auto annotate was replaced by model-backed detection. "
                "Use /api/workspace/detect and configure a detection provider."
            ),
        )


def _register_workspace_detection_routes(app: FastAPI) -> None:
    @app.post("/api/workspace/click-detect")
    def click_detect_workspace(
        request: ClickDetectRequest,
        runId: str | None = None,
    ) -> dict:
        provider = _get_sam2_provider(app)
        if provider is None:
            detail = (
                app.state.sam2_provider_config_error
                or "SAM2 provider is not configured."
            )
            raise HTTPException(status_code=503, detail=detail)

        root = _resolve_workspace_root(app.state.workspace_root, runId)
        state = _read_state(root)
        if state.source is None:
            raise HTTPException(status_code=400, detail="Upload a source image before click detection.")

        try:
            label = _normalize_label(request.label)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        source_image = _require_source_image(root)
        prompt = {
            "coordinateSpace": "source",
            "points": [{"x": request.x, "y": request.y, "label": "positive"}],
        }
        try:
            mask = provider.detect(source_image, prompt)
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"SAM2 provider failed: {exc}",
            ) from exc

        try:
            element = candidate_from_click_mask(
                root,
                state.elements,
                source_image,
                label,
                mask,
            )
            next_state = _replace_workspace_elements(state, [*state.elements, element])
            validate_workspace_state_geometry(next_state)
        except ValueError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

        _write_state(root, next_state)
        return {
            "element": element.model_dump(mode="json"),
            "state": next_state.model_dump(mode="json"),
        }

    @app.post("/api/workspace/detect")
    def detect_workspace(runId: str | None = None) -> WorkspaceState:
        provider = _get_detection_provider(app)
        if provider is None:
            detail = (
                app.state.detection_provider_config_error
                or "Detection provider is not configured."
            )
            raise HTTPException(status_code=503, detail=detail)

        root = _resolve_workspace_root(app.state.workspace_root, runId)
        state = _read_state(root)
        if state.source is None:
            raise HTTPException(status_code=400, detail="Upload a source image before detection.")

        source_image = _require_source_image(root)
        filtered_results = _collect_detection_results(
            provider,
            source_image,
            state.detectionVocabulary,
        )
        _clear_generated_workspace_outputs(root)
        generated = _detection_results_to_elements(
            root,
            source_image,
            provider.name,
            filtered_results,
        )
        next_state = _replace_workspace_elements(state, generated)
        _write_state(root, next_state)
        return next_state

app = create_app()
