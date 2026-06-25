from __future__ import annotations

import json
import os
import re
import shutil
from pathlib import Path
from typing import cast

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image

from art_pipeline.annotations import (
    validate_workspace_state_geometry,
)
from art_pipeline.click_detect import candidate_from_click_mask
from art_pipeline.codex_assets import (
    CodexAssetProvider,
)
from art_pipeline.http.helpers import (
    get_element as _get_element,
    load_png as _load_png,
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
from art_pipeline.detection import (
    DetectionProvider,
    DetectionProviderNotConfigured,
)
from art_pipeline.detection_results import (
    collect_detection_results as _collect_detection_results,
    detection_results_to_elements as _detection_results_to_elements,
)
from art_pipeline.elements import (
    SourceMetadata,
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
    WorkspaceRunSummary,
    clear_generated_workspace_outputs as _clear_generated_workspace_outputs,
    derive_run_status as _derive_run_status,
    next_run_id as _next_run_id,
    read_runs as _read_runs,
    read_state as _read_state,
    resolve_workspace_root as _resolve_workspace_root,
    run_root as _run_root,
    source_path as _source_path,
    upsert_run as _upsert_run,
    utc_now as _utc_now,
    write_runs as _write_runs,
    write_state as _write_state,
)
from art_pipeline.workspace.workflow import initialize_upload_workflow
from art_pipeline.workspace.state_updates import (
    invalidate_geometry_changes as _invalidate_geometry_changes,
    replace_workspace_elements as _replace_workspace_elements,
)
from art_pipeline.workspace.extraction_targets import (
    select_extraction_targets as _select_extraction_targets,
)


ASSET_MEDIA_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}

_USE_ENV_DETECTION_PROVIDER = object()
_CHECKPOINT_TITLE_SUFFIX = re.compile(r" - checkpoint(?: \d+)?$")


def create_app(
    workspace_root: Path | None = None,
    detection_provider: DetectionProvider | None | object = _USE_ENV_DETECTION_PROVIDER,
    sam2_provider: Sam2ClickProvider | None = None,
    codex_asset_provider: CodexAssetProvider | None = None,
) -> FastAPI:
    app = FastAPI(title="Art Pipeline Workbench API")
    app.state.workspace_root = (workspace_root or Path("workspace")).resolve()
    detection_provider_config_error = None
    detection_provider_factory = None
    sam2_provider_config_error = None
    sam2_provider_factory = None
    configured_detection_provider: DetectionProvider | None
    if detection_provider is _USE_ENV_DETECTION_PROVIDER:
        configured_detection_provider = None
        try:
            detection_provider_factory = _detection_provider_factory_from_env()
        except DetectionProviderNotConfigured as exc:
            detection_provider_config_error = str(exc)
    else:
        configured_detection_provider = cast(DetectionProvider | None, detection_provider)
    if sam2_provider is None:
        try:
            sam2_provider_factory = _sam2_provider_factory_from_env()
        except DetectionProviderNotConfigured as exc:
            sam2_provider_config_error = str(exc)
    app.state.detection_provider = configured_detection_provider
    app.state.detection_provider_factory = detection_provider_factory
    app.state.detection_provider_config_error = detection_provider_config_error
    app.state.sam2_provider = sam2_provider
    app.state.sam2_provider_factory = sam2_provider_factory
    app.state.sam2_provider_config_error = sam2_provider_config_error
    app.state.codex_asset_provider = codex_asset_provider

    register_element_routes(app)
    register_repair_routes(app)
    register_segment_routes(app)
    register_task_routes(app)
    register_workflow_routes(app)

    @app.get("/api/workspace/source")
    def get_source(runId: str | None = None) -> FileResponse:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        source_path = _source_path(root)
        if not source_path.exists():
            raise HTTPException(status_code=404, detail="No source image uploaded.")
        return FileResponse(source_path, media_type="image/png")

    @app.post("/api/workspace/source")
    async def upload_source(file: UploadFile = File(...)) -> WorkspaceState:
        if file.content_type != "image/png":
            raise HTTPException(status_code=400, detail="Only PNG uploads are supported.")

        data = await file.read()
        image = _load_png(data)

        root = app.state.workspace_root
        _clear_generated_workspace_outputs(root)
        source_path = _source_path(root)
        source_path.parent.mkdir(parents=True, exist_ok=True)
        source_path.write_bytes(data)

        state = WorkspaceState(
            source=SourceMetadata(
                filename="original.png",
                path="source/original.png",
                width=image.width,
                height=image.height,
            ),
            elements=[],
        )
        _write_state(root, state)
        initialize_upload_workflow(root, state)
        return state

    @app.get("/api/workspace/runs")
    def list_workspace_runs() -> dict:
        return {
            "runs": [
                run.model_dump(mode="json")
                for run in _read_runs(app.state.workspace_root)
            ]
        }

    @app.post("/api/workspace/runs")
    async def create_workspace_run(file: UploadFile = File(...)) -> dict:
        if file.content_type != "image/png":
            raise HTTPException(status_code=400, detail="Only PNG uploads are supported.")

        data = await file.read()
        image = _load_png(data)
        base_root = app.state.workspace_root
        run_id = _next_run_id(base_root, file.filename or "source.png")
        run_root = _run_root(base_root, run_id)
        run_root.mkdir(parents=True, exist_ok=False)

        source_path = _source_path(run_root)
        source_path.parent.mkdir(parents=True, exist_ok=True)
        source_path.write_bytes(data)

        state = WorkspaceState(
            source=SourceMetadata(
                filename="original.png",
                path="source/original.png",
                width=image.width,
                height=image.height,
            ),
            elements=[],
        )
        _write_state(run_root, state)
        initialize_upload_workflow(run_root, state)
        now = _utc_now()
        run = WorkspaceRunSummary(
            id=run_id,
            title=file.filename or "Untitled source",
            sourceFilename=file.filename or "source.png",
            createdAt=now,
            updatedAt=now,
            status=_derive_run_status(run_root, state),
            elementCount=0,
        )
        _upsert_run(base_root, run)
        return {
            "run": run.model_dump(mode="json"),
            "state": state.model_dump(mode="json"),
        }

    @app.post("/api/workspace/runs/{run_id}/duplicate")
    def duplicate_workspace_run(run_id: str) -> dict:
        base_root = app.state.workspace_root
        source_root = _run_root(base_root, run_id)
        runs = _read_runs(base_root)
        source_run = next((run for run in runs if run.id == run_id), None)
        if source_run is None or not source_root.exists():
            raise HTTPException(status_code=404, detail="Processing record not found.")

        state = _read_state(source_root)
        target_id = _next_run_id(
            base_root,
            f"{Path(source_run.sourceFilename).stem}-checkpoint.png",
        )
        target_root = _run_root(base_root, target_id)
        # WHY: 另存为的价值是冻结当前 run 的完整产物树；目录级复制能保留
        # state、source、mask、stage snapshots 与缩略图，不让 checkpoint 依赖重算。
        shutil.copytree(source_root, target_root)

        now = _utc_now()
        duplicate_run = WorkspaceRunSummary(
            id=target_id,
            title=_next_checkpoint_title(source_run.title, runs),
            sourceFilename=source_run.sourceFilename,
            createdAt=now,
            updatedAt=now,
            status=_derive_run_status(target_root, state),
            elementCount=len(state.elements),
        )
        _upsert_run(base_root, duplicate_run)
        return {
            "run": duplicate_run.model_dump(mode="json"),
            "runs": [
                run.model_dump(mode="json")
                for run in _read_runs(base_root)
            ],
            "state": state.model_dump(mode="json"),
        }

    @app.delete("/api/workspace/runs/{run_id}")
    def delete_workspace_run(run_id: str) -> dict:
        base_root = app.state.workspace_root
        run_root = _run_root(base_root, run_id)
        runs = _read_runs(base_root)
        next_runs = [run for run in runs if run.id != run_id]
        if len(next_runs) == len(runs) and not run_root.exists():
            raise HTTPException(status_code=404, detail="Processing record not found.")

        if run_root.exists():
            if run_root.is_dir():
                shutil.rmtree(run_root)
            else:
                run_root.unlink()

        _write_runs(base_root, next_runs)
        return {
            "runs": [
                run.model_dump(mode="json")
                for run in _read_runs(base_root)
            ]
        }

    @app.get("/api/workspace/assets/{asset_path:path}")
    def get_workspace_asset(asset_path: str, runId: str | None = None) -> FileResponse:
        workspace_root = _resolve_workspace_root(app.state.workspace_root, runId)
        asset_file = (workspace_root / asset_path).resolve()
        try:
            asset_file.relative_to(workspace_root)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail="Asset not found.") from exc
        if not asset_file.exists():
            raise HTTPException(status_code=404, detail="Asset not found.")
        media_type = ASSET_MEDIA_TYPES.get(asset_file.suffix.lower())
        if media_type is None:
            raise HTTPException(status_code=404, detail="Asset not found.")
        return FileResponse(asset_file, media_type=media_type)

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

    return app


def _next_checkpoint_title(title: str, runs: list[WorkspaceRunSummary]) -> str:
    base_title = _CHECKPOINT_TITLE_SUFFIX.sub("", title).strip() or "Untitled source"
    existing_titles = {run.title for run in runs}
    candidate = f"{base_title} - checkpoint"
    suffix = 2
    while candidate in existing_titles:
        candidate = f"{base_title} - checkpoint {suffix}"
        suffix += 1
    return candidate


app = create_app()
