from __future__ import annotations

import json
import os
import re
import shutil
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any, Callable, Literal, Protocol

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field, ValidationError

from art_pipeline.annotations import (
    ManualElementCreateRequest,
    SplitElementRequest,
    SplitRequestContractCreate,
    create_manual_element,
    split_element,
    validate_workspace_state_geometry,
    write_split_request_contract,
)
from art_pipeline.asset_outputs import (
    clear_extraction_outputs,
    clear_stale_asset_outputs,
    write_mask_output,
)
from art_pipeline.candidates import (
    add_candidate_child,
    edit_candidate,
    filter_detection_results,
    mark_candidate_merged,
    merge_candidates,
)
from art_pipeline.click_detect import candidate_from_click_mask
from art_pipeline.codex_assets import (
    CodexAssetProvider,
    generate_codex_final_asset,
)
from art_pipeline.detection import (
    DetectionProvider,
    DetectionProviderNotConfigured,
    DetectionResult,
)
from art_pipeline.elements import (
    AssetRole,
    BoundingBox,
    CanvasBox,
    ElementRecord,
    SourceMetadata,
    WorkspaceState,
    next_element_id,
    validate_element_id,
)
from art_pipeline.exporter import ExportWorkspaceRequest, export_workspace
from art_pipeline.mask_refine import ReplaceMaskRequest, create_mask_from_shape
from art_pipeline.masks import expand_bbox
from art_pipeline.model_runners.codex_cli import CodexCliAssetProvider
from art_pipeline.parent_repair_contracts import parent_removal_contract_covers_children
from art_pipeline.qa import validate_repair_output
from art_pipeline.repair_tasks import (
    MissingMaskRequest,
    clear_repair_outputs,
    create_repair_task_package,
    read_repair_metadata,
    repair_task_package_exists,
    write_missing_mask_from_shape,
)
from art_pipeline.segmentation import (
    ExtractWorkspaceRequest,
    SegmentationUnavailableError,
    extract_with_strategy,
)
from art_pipeline.segment_assets import (
    accept_sam2_edge_mask,
    patch_sam2_edge_mask,
    recompute_sticker_statuses,
    suggest_sam2_edge_mask,
)
from art_pipeline.thumbnails import write_thumbnail
from art_pipeline.vocabulary import normalize_detection_vocabulary


ASSET_MEDIA_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}

DETECTION_PROVIDER_ENV = "ART_PIPELINE_DETECTION_PROVIDER"
GROUNDING_DINO_MODEL_ENV = "ART_PIPELINE_GROUNDING_DINO_MODEL"
SAM2_PROVIDER_ENV = "ART_PIPELINE_SAM2_PROVIDER"
SAM2_MODEL_ENV = "ART_PIPELINE_SAM2_MODEL"
CODEX_PROVIDER_ENV = "ART_PIPELINE_CODEX_PROVIDER"
CODEX_BIN_ENV = "ART_PIPELINE_CODEX_BIN"
CODEX_TIMEOUT_ENV = "ART_PIPELINE_CODEX_TIMEOUT_SECONDS"
CODEX_SANDBOX_ENV = "ART_PIPELINE_CODEX_SANDBOX"
RUN_ID_PATTERN = re.compile(r"^run_[A-Za-z0-9_-]+$")


class PatchElementRequest(BaseModel):
    bbox: BoundingBox | None = None
    label: str | None = None
    visible: bool | None = None
    assetRole: AssetRole | None = None
    removeFromParent: str | None = None


class SegmentMaskPatchRequest(ReplaceMaskRequest):
    operation: Literal["replace", "add", "subtract"] = "replace"


class CodexFinalGenerateRequest(BaseModel):
    prompt: str | None = None


class ChildElementRequest(BaseModel):
    label: str
    bbox: BoundingBox


class MergeElementsRequest(BaseModel):
    elementIds: list[str] = Field(default_factory=list)
    label: str | None = None


class WorkspaceRunSummary(BaseModel):
    id: str
    title: str
    sourceFilename: str
    createdAt: str
    updatedAt: str
    status: str
    elementCount: int


class ClickDetectRequest(BaseModel):
    x: int
    y: int
    label: str = "untitled"


class Sam2ClickProvider(Protocol):
    name: str

    def detect(
        self,
        image: Image.Image,
        prompt: dict[str, Any],
    ) -> Image.Image:
        raise NotImplementedError


def create_app(
    workspace_root: Path | None = None,
    detection_provider: DetectionProvider | None = None,
    sam2_provider: Sam2ClickProvider | None = None,
    codex_asset_provider: CodexAssetProvider | None = None,
) -> FastAPI:
    app = FastAPI(title="Art Pipeline Workbench API")
    app.state.workspace_root = (workspace_root or Path("workspace")).resolve()
    detection_provider_config_error = None
    detection_provider_factory = None
    sam2_provider_config_error = None
    sam2_provider_factory = None
    if detection_provider is None:
        try:
            detection_provider_factory = _detection_provider_factory_from_env()
        except DetectionProviderNotConfigured as exc:
            detection_provider_config_error = str(exc)
    if sam2_provider is None:
        try:
            sam2_provider_factory = _sam2_provider_factory_from_env()
        except DetectionProviderNotConfigured as exc:
            sam2_provider_config_error = str(exc)
    app.state.detection_provider = detection_provider
    app.state.detection_provider_factory = detection_provider_factory
    app.state.detection_provider_config_error = detection_provider_config_error
    app.state.sam2_provider = sam2_provider
    app.state.sam2_provider_factory = sam2_provider_factory
    app.state.sam2_provider_config_error = sam2_provider_config_error
    app.state.codex_asset_provider = codex_asset_provider

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
        state_path = _state_path(root)
        if not state_path.exists():
            return WorkspaceState()
        return WorkspaceState.model_validate_json(state_path.read_text(encoding="utf-8"))

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

    @app.post("/api/workspace/elements")
    def post_element(request: ManualElementCreateRequest, runId: str | None = None) -> dict:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        state = _read_state(root)
        source_image = _require_source_image(root)

        try:
            created = create_manual_element(root, state, source_image, request)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        next_state = _replace_workspace_elements(state, [*state.elements, created])
        _write_state(root, next_state)
        return {
            "element": created.model_dump(mode="json"),
            "state": next_state.model_dump(mode="json"),
        }

    @app.patch("/api/workspace/elements/{element_id}")
    def patch_element(element_id: str, request: PatchElementRequest, runId: str | None = None) -> dict:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        state = _read_state(root)
        element = _get_element(state, element_id)

        try:
            if not request.model_fields_set:
                raise ValueError("Provide at least one element update.")
            if "bbox" in request.model_fields_set and request.bbox is None:
                raise ValueError("Bounding box must not be null.")
            if "visible" in request.model_fields_set and request.visible is None:
                raise ValueError("Visible must not be null.")

            bbox = request.bbox if "bbox" in request.model_fields_set else None
            label = (
                _normalize_label(request.label)
                if "label" in request.model_fields_set
                else None
            )
            visible = (
                request.visible
                if "visible" in request.model_fields_set
                else None
            )
            updated = edit_candidate(
                element,
                bbox=bbox,
                label=label,
                visible=visible,
                history_kind="manual_edit",
            )
            updated = _apply_element_role_patch(state, updated, request)
            next_state = _replace_workspace_elements(
                state,
                [
                    updated if current.id == element_id else current
                    for current in state.elements
                ],
            )
            validate_workspace_state_geometry(next_state)
            if bbox is not None and _source_path(root).exists():
                source_image = _require_source_image(root)
                updated = updated.model_copy(
                    update={
                        "thumbnail": write_thumbnail(
                            source_image,
                            root,
                            updated.id,
                            updated.bbox,
                        )
                    }
                )
                next_state = _replace_workspace_elements(
                    state,
                    [
                        updated if current.id == element_id else current
                        for current in state.elements
                    ],
                )
            next_state = _invalidate_geometry_changes(root, state, next_state)
            if (
                "assetRole" in request.model_fields_set
                or "removeFromParent" in request.model_fields_set
            ) and _source_path(root).exists():
                # WHY: 角色/父关系是 repair/export 状态的输入；用户可能先验收 mask 再补父子语义，
                # 所以这里复用 Segment accept 的父物体 contract 计算，避免另写一套状态推导。
                next_state = recompute_sticker_statuses(
                    root,
                    _require_source_image(root),
                    next_state,
                )
            validate_workspace_state_geometry(next_state)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        _write_state(root, next_state)
        next_element = _get_element(next_state, element_id)
        return {
            "element": next_element.model_dump(mode="json"),
            "state": next_state.model_dump(mode="json"),
        }

    @app.post("/api/workspace/elements/{element_id}/children")
    def post_child_element(
        element_id: str,
        request: ChildElementRequest,
        runId: str | None = None,
    ) -> dict:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        state = _read_state(root)
        source_image = _require_source_image(root)
        parent = _get_element(state, element_id)

        try:
            label = _normalize_label(request.label)
            child = add_candidate_child(
                root,
                state.elements,
                source_image,
                parent,
                label,
                request.bbox,
            )
            next_state = _replace_workspace_elements(state, [*state.elements, child])
            validate_workspace_state_geometry(next_state)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        _write_state(root, next_state)
        return {
            "element": child.model_dump(mode="json"),
            "state": next_state.model_dump(mode="json"),
        }

    @app.post("/api/workspace/elements/merge")
    def post_merge_elements(request: MergeElementsRequest, runId: str | None = None) -> dict:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        state = _read_state(root)
        source_image = _require_source_image(root)

        try:
            if len(request.elementIds) < 2:
                raise ValueError("Select at least two elements to merge.")
            if len(set(request.elementIds)) != len(request.elementIds):
                raise ValueError("Element ids to merge must be unique.")

            selected = [_get_element(state, element_id) for element_id in request.elementIds]
            label = (
                _normalize_label(request.label)
                if request.label is not None
                else "Merged Asset"
            )
            merged = merge_candidates(
                root,
                state.elements,
                source_image,
                selected,
                label,
            )
            merged_source_ids = {element.id for element in selected}
            next_state = _replace_workspace_elements(
                state,
                [
                    mark_candidate_merged(element, merged.id)
                    if element.id in merged_source_ids
                    else element
                    for element in state.elements
                ]
                + [merged],
            )
            validate_workspace_state_geometry(next_state)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        _write_state(root, next_state)
        return {
            "element": merged.model_dump(mode="json"),
            "state": next_state.model_dump(mode="json"),
        }

    @app.post("/api/workspace/elements/{element_id}/split")
    def post_split(element_id: str, request: SplitElementRequest, runId: str | None = None) -> dict:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        state = _read_state(root)
        source_image = _require_source_image(root)
        parent = _get_element(state, element_id)

        try:
            children = split_element(root, state, source_image, parent, request)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        updated_elements: list[ElementRecord] = []
        for element in state.elements:
            if element.id == element_id:
                updated_elements.append(
                    element.model_copy(update={"status": "split_parent"})
                )
                continue
            updated_elements.append(element)

        next_state = _replace_workspace_elements(state, [*updated_elements, *children])
        _write_state(root, next_state)
        return {
            "children": [child.model_dump(mode="json") for child in children],
            "state": next_state.model_dump(mode="json"),
        }

    @app.post("/api/workspace/split-requests")
    def post_split_request(request: SplitRequestContractCreate, runId: str | None = None) -> dict:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        state = _read_state(root)
        source_image = _require_source_image(root)
        element = _get_element(state, request.elementId)
        description = request.description.strip()
        if not description:
            raise HTTPException(status_code=400, detail="Split description must not be blank.")

        contract_path, contract = write_split_request_contract(
            root,
            source_image,
            element,
            description,
        )
        return {
            "requestId": contract["requestId"],
            "path": contract_path,
        }

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

    @app.post("/api/workspace/elements/{element_id:path}/segment/suggest")
    def post_segment_suggest(element_id: str, runId: str | None = None) -> dict:
        provider = _get_sam2_provider(app)
        if provider is None:
            detail = (
                app.state.sam2_provider_config_error
                or "SAM2 provider is not configured."
            )
            raise HTTPException(status_code=503, detail=detail)

        root = _resolve_workspace_root(app.state.workspace_root, runId)
        state = _read_state(root)
        source_image = _require_source_image(root)
        element = _get_element(state, element_id)
        try:
            updated, segmentation = suggest_sam2_edge_mask(
                root,
                source_image,
                element,
                provider,
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        next_state = _replace_workspace_elements(
            state,
            [
                updated if current.id == element_id else current
                for current in state.elements
            ],
        )
        _write_state(root, next_state)
        return {
            "element": updated.model_dump(mode="json"),
            "segmentation": segmentation,
            "state": next_state.model_dump(mode="json"),
        }

    @app.post("/api/workspace/elements/{element_id:path}/segment/accept")
    def post_segment_accept(element_id: str, runId: str | None = None) -> dict:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        state = _read_state(root)
        source_image = _require_source_image(root)
        _get_element(state, element_id)
        try:
            next_state, accepted = accept_sam2_edge_mask(
                root,
                source_image,
                state,
                element_id,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        _write_state(root, next_state)
        return {
            "element": accepted.model_dump(mode="json"),
            "state": next_state.model_dump(mode="json"),
        }

    @app.patch("/api/workspace/elements/{element_id:path}/segment/mask")
    def patch_segment_mask(
        element_id: str,
        request: SegmentMaskPatchRequest,
        runId: str | None = None,
    ) -> dict:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        state = _read_state(root)
        source_image = _require_source_image(root)
        element = _get_element(state, element_id)
        try:
            patch_mask = create_mask_from_shape(element, request.shape)
            updated, segmentation = patch_sam2_edge_mask(
                root,
                source_image,
                element,
                patch_mask,
                request.operation,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        next_state = _replace_workspace_elements(
            state,
            [
                updated if current.id == element_id else current
                for current in state.elements
            ],
        )
        # WHY: 手工编辑 child mask 会让父物体已有 repair 包失去依据；复用同一套
        # sticker 状态推导，避免旧 completed_asset 在 child 重新验收前进入 final export。
        next_state = recompute_sticker_statuses(root, source_image, next_state)
        updated = _get_element(next_state, element_id)
        _write_state(root, next_state)
        return {
            "element": updated.model_dump(mode="json"),
            "segmentation": segmentation,
            "state": next_state.model_dump(mode="json"),
        }

    @app.post("/api/workspace/elements/{element_id:path}/codex-final/generate")
    def post_codex_final_generate(
        element_id: str,
        request: CodexFinalGenerateRequest | None = None,
        runId: str | None = None,
    ) -> dict:
        provider = _get_codex_asset_provider(app)
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        state = _read_state(root)
        try:
            next_state, updated, generation = generate_codex_final_asset(
                root,
                state,
                element_id,
                provider,
                (request.prompt if request else None),
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        _write_state(root, next_state)
        return {
            "element": updated.model_dump(mode="json"),
            "generation": generation,
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
            return export_workspace(root, state)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post("/api/workspace/elements/{element_id:path}/mask/replace")
    def post_replace_mask(
        element_id: str,
        request: ReplaceMaskRequest,
        runId: str | None = None,
    ) -> dict:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        state = _read_state(root)
        element = _get_element(state, element_id)
        if not _is_extractable_element(element):
            raise HTTPException(status_code=400, detail=f"Element {element.id} is not extractable.")

        try:
            mask = create_mask_from_shape(element, request.shape)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        clear_stale_asset_outputs(root, element.id)
        clear_repair_outputs(root, element.id)
        mask_path = write_mask_output(root, element, mask)
        next_state = _replace_workspace_elements(
            state,
            [
                element.model_copy(
                    update={
                        "status": "extract_ready",
                        "mode": _reset_repair_mode(element),
                        "mask": mask_path,
                        "segmentationStatus": "not_started",
                        **_repair_artifact_invalidation_update(element),
                    }
                )
                if element.id == element_id
                else element
                for element in state.elements
            ],
        )
        _write_state(root, next_state)
        return {"state": next_state.model_dump(mode="json")}

    @app.post("/api/workspace/elements/{element_id:path}/mask/clear")
    def post_clear_mask(element_id: str, runId: str | None = None) -> dict:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        state = _read_state(root)
        try:
            _get_element(state, element_id)
            clear_extraction_outputs(root, element_id)
            clear_repair_outputs(root, element_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        next_state = _replace_workspace_elements(
            state,
            [
                element.model_copy(
                    update={
                        "status": _status_after_extraction_invalidation(element),
                        "mode": _reset_repair_mode(element),
                        "mask": None,
                        "segmentationStatus": "not_started",
                        **_repair_artifact_invalidation_update(element),
                    }
                )
                if element.id == element_id
                else element
                for element in state.elements
            ],
        )
        _write_state(root, next_state)
        return {"state": next_state.model_dump(mode="json")}

    @app.post("/api/workspace/elements/{element_id:path}/repair/missing-mask")
    def post_missing_mask(
        element_id: str,
        request: MissingMaskRequest,
        runId: str | None = None,
    ) -> dict:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        state = _read_state(root)
        element = _get_element(state, element_id)

        try:
            repair_element = element.model_copy(update={"mode": _reset_repair_mode(element)})
            missing_mask_path = write_missing_mask_from_shape(root, repair_element, request.shape)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        next_state = _replace_workspace_elements(
            state,
            [
                element.model_copy(
                    update={
                        "status": _status_after_repair_package_invalidation(element),
                        "mode": _reset_repair_mode(element),
                        **_repair_artifact_invalidation_update(element),
                    }
                )
                if element.id == element_id
                else element
                for element in state.elements
            ],
        )
        _write_state(root, next_state)
        next_element = _get_element(next_state, element_id)
        return {
            "missingMaskPath": missing_mask_path,
            "repair": read_repair_metadata(root, next_element),
            "state": next_state.model_dump(mode="json"),
        }

    @app.get("/api/workspace/elements/{element_id:path}/repair/metadata")
    def get_repair_metadata(element_id: str, runId: str | None = None) -> dict:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        state = _read_state(root)
        element = _get_element(state, element_id)
        return read_repair_metadata(root, element)

    @app.post("/api/workspace/elements/{element_id:path}/repair/task")
    def post_repair_task(element_id: str, runId: str | None = None) -> dict:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        state = _read_state(root)
        source_image = _require_source_image(root)
        element = _get_element(state, element_id)

        try:
            paths = create_repair_task_package(root, source_image, element)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        next_state = _replace_workspace_elements(
            state,
            [
                element.model_copy(update={"status": "repair_pending"})
                if element.id == element_id
                else element
                for element in state.elements
            ],
        )
        _write_state(root, next_state)
        next_element = _get_element(next_state, element_id)
        return {
            "paths": paths,
            "repair": read_repair_metadata(root, next_element),
            "state": next_state.model_dump(mode="json"),
        }

    @app.post("/api/workspace/elements/{element_id:path}/repair/validate")
    def post_repair_validate(element_id: str, runId: str | None = None) -> dict:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        state = _read_state(root)
        element = _get_element(state, element_id)
        if not _is_repair_workflow_element(element):
            raise HTTPException(
                status_code=400,
                detail=f"Element {element.id} is not in the repair workflow.",
            )
        if not repair_task_package_exists(root, element):
            raise HTTPException(
                status_code=400,
                detail=f"Element {element.id} needs a repair task package before validation.",
            )

        qa_report = validate_repair_output(root, element)
        next_state = _replace_workspace_elements(
            state,
            [
                element.model_copy(
                    update=_repair_validation_state_update(root, state, element, qa_report)
                )
                if element.id == element_id
                else element
                for element in state.elements
            ],
        )
        _write_state(root, next_state)
        next_element = _get_element(next_state, element_id)
        return {
            "qa": qa_report,
            "repair": read_repair_metadata(root, next_element),
            "state": next_state.model_dump(mode="json"),
        }

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
        vocabulary = state.detectionVocabulary
        try:
            raw_results = provider.detect(
                source_image,
                vocabulary,
                ". ".join(vocabulary),
            )
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Detection provider {provider.name!r} failed: {exc}",
            ) from exc

        results = _validate_detection_results(source_image, raw_results)
        filtered_results = [
            DetectionResult.model_validate(item)
            for item in filter_detection_results(
                [result.model_dump(mode="json") for result in results],
                _detection_filter_vocabulary(vocabulary),
            )
        ]
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


def _get_detection_provider(app: FastAPI) -> DetectionProvider | None:
    provider = app.state.detection_provider
    if provider is not None:
        return provider

    provider_factory = app.state.detection_provider_factory
    if provider_factory is None:
        return None

    try:
        provider = provider_factory()
    except DetectionProviderNotConfigured as exc:
        app.state.detection_provider_config_error = str(exc)
        return None

    app.state.detection_provider = provider
    app.state.detection_provider_config_error = None
    return provider


def _get_sam2_provider(app: FastAPI) -> Sam2ClickProvider | None:
    provider = app.state.sam2_provider
    if provider is not None:
        return provider

    provider_factory = app.state.sam2_provider_factory
    if provider_factory is None:
        return None

    try:
        provider = provider_factory()
    except DetectionProviderNotConfigured as exc:
        app.state.sam2_provider_config_error = str(exc)
        return None

    app.state.sam2_provider = provider
    app.state.sam2_provider_config_error = None
    return provider


def _detection_filter_vocabulary(vocabulary: list[str]) -> list[str]:
    labels = list(vocabulary)
    # WHY: Grounding DINO 等开源检测模型常把 "bathroom cabinet" 回传成 "cabinet"；
    # 仅当当前词表包含原始短语时追加别名，避免自定义词表被默认别名放宽。
    if "bathroom cabinet" in labels and "cabinet" not in labels:
        labels.append("cabinet")
    return labels


def _detection_provider_factory_from_env() -> Callable[[], DetectionProvider] | None:
    provider_name = os.getenv(DETECTION_PROVIDER_ENV, "").strip().lower()
    if not provider_name:
        return None

    if provider_name == "demo":
        return _create_demo_provider

    if provider_name != "grounding_dino":
        raise DetectionProviderNotConfigured(
            f"Unsupported detection provider {provider_name!r}. "
            f"Set {DETECTION_PROVIDER_ENV}=demo or {DETECTION_PROVIDER_ENV}=grounding_dino."
        )

    model_id = os.getenv(GROUNDING_DINO_MODEL_ENV, "").strip()
    return lambda: _create_grounding_dino_provider(model_id or None)


def _sam2_provider_factory_from_env() -> Callable[[], Sam2ClickProvider] | None:
    provider_name = os.getenv(SAM2_PROVIDER_ENV, "").strip().lower()
    if not provider_name:
        return None

    if provider_name not in {"transformers", "sam2", "hf"}:
        raise DetectionProviderNotConfigured(
            f"Unsupported SAM2 provider {provider_name!r}. "
            f"Set {SAM2_PROVIDER_ENV}=transformers."
        )

    model_id = os.getenv(SAM2_MODEL_ENV, "").strip()
    return lambda: _create_transformers_sam2_provider(model_id or None)


def _codex_asset_provider_from_env() -> CodexAssetProvider:
    provider_name = os.getenv(CODEX_PROVIDER_ENV, "cli").strip().lower()
    if provider_name not in {"cli", "codex_cli"}:
        raise DetectionProviderNotConfigured(
            f"Unsupported Codex asset provider {provider_name!r}. "
            f"Set {CODEX_PROVIDER_ENV}=cli."
        )

    timeout_raw = os.getenv(CODEX_TIMEOUT_ENV, "900").strip()
    try:
        timeout_seconds = int(timeout_raw)
    except ValueError as exc:
        raise DetectionProviderNotConfigured(
            f"{CODEX_TIMEOUT_ENV} must be an integer number of seconds."
        ) from exc
    if timeout_seconds <= 0:
        raise DetectionProviderNotConfigured(
            f"{CODEX_TIMEOUT_ENV} must be greater than zero."
        )

    codex_bin = os.getenv(CODEX_BIN_ENV, "").strip() or None
    sandbox = os.getenv(CODEX_SANDBOX_ENV, "").strip() or None
    return CodexCliAssetProvider(
        codex_bin=codex_bin,
        timeout_seconds=timeout_seconds,
        sandbox=sandbox,
    )


def _get_codex_asset_provider(app: FastAPI) -> CodexAssetProvider:
    provider = app.state.codex_asset_provider
    if provider is not None:
        return provider

    try:
        provider = _codex_asset_provider_from_env()
    except DetectionProviderNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    app.state.codex_asset_provider = provider
    return provider


def _create_demo_provider() -> DetectionProvider:
    from art_pipeline.model_runners.demo import DemoDetectionProvider

    return DemoDetectionProvider()


def _create_grounding_dino_provider(model_id: str | None = None) -> DetectionProvider:
    try:
        from art_pipeline.model_runners.grounding_dino import GroundingDinoProvider
    except ImportError as exc:
        raise DetectionProviderNotConfigured(str(exc)) from exc

    try:
        if model_id:
            return GroundingDinoProvider(model_id=model_id)
        return GroundingDinoProvider()
    except Exception as exc:
        raise DetectionProviderNotConfigured(
            f"Detection provider 'grounding_dino' could not be initialized: {exc}"
        ) from exc


def _create_transformers_sam2_provider(model_id: str | None = None) -> Sam2ClickProvider:
    try:
        from art_pipeline.model_runners.sam2 import TransformersSam2Provider
    except ImportError as exc:
        raise DetectionProviderNotConfigured(str(exc)) from exc

    try:
        if model_id:
            return TransformersSam2Provider(model_id=model_id)
        return TransformersSam2Provider()
    except Exception as exc:
        raise DetectionProviderNotConfigured(
            f"SAM2 provider 'transformers' could not be initialized: {exc}"
        ) from exc


def _load_png(data: bytes) -> Image.Image:
    try:
        image = Image.open(BytesIO(data))
        image.load()
    except UnidentifiedImageError as exc:
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid PNG.") from exc

    if image.format != "PNG":
        raise HTTPException(status_code=400, detail="Only PNG uploads are supported.")
    return image


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _runs_root(workspace_root: Path) -> Path:
    return workspace_root / "runs"


def _runs_index_path(workspace_root: Path) -> Path:
    return _runs_root(workspace_root) / "index.json"


def _run_root(workspace_root: Path, run_id: str) -> Path:
    if not RUN_ID_PATTERN.fullmatch(run_id):
        raise HTTPException(status_code=400, detail=f"Invalid processing record id: {run_id}.")
    root = (_runs_root(workspace_root) / run_id).resolve()
    try:
        root.relative_to(_runs_root(workspace_root).resolve())
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Processing record not found.") from exc
    return root


def _resolve_workspace_root(workspace_root: Path, run_id: str | None) -> Path:
    if not run_id:
        return workspace_root

    root = _run_root(workspace_root, run_id)
    if not root.exists():
        raise HTTPException(status_code=404, detail="Processing record not found.")
    return root


def _next_run_id(workspace_root: Path, filename: str) -> str:
    stem = Path(filename).stem or "source"
    slug = re.sub(r"[^A-Za-z0-9_-]+", "-", stem).strip("-_").lower() or "source"
    slug = slug[:36]
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
    base = f"run_{timestamp}_{slug}"
    candidate = base
    suffix = 2
    while _run_root(workspace_root, candidate).exists():
        candidate = f"{base}_{suffix}"
        suffix += 1
    return candidate


def _read_runs(workspace_root: Path) -> list[WorkspaceRunSummary]:
    index_path = _runs_index_path(workspace_root)
    if not index_path.exists():
        return []

    payload = json.loads(index_path.read_text(encoding="utf-8"))
    raw_runs = payload.get("runs", []) if isinstance(payload, dict) else []
    runs = [WorkspaceRunSummary.model_validate(run) for run in raw_runs]
    return sorted(runs, key=lambda run: run.updatedAt, reverse=True)


def _write_runs(workspace_root: Path, runs: list[WorkspaceRunSummary]) -> None:
    index_path = _runs_index_path(workspace_root)
    index_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = index_path.with_suffix(".json.tmp")
    temp_path.write_text(
        json.dumps(
            {"runs": [run.model_dump(mode="json") for run in runs]},
            indent=2,
        ),
        encoding="utf-8",
    )
    os.replace(temp_path, index_path)


def _upsert_run(workspace_root: Path, run: WorkspaceRunSummary) -> None:
    existing = [current for current in _read_runs(workspace_root) if current.id != run.id]
    _write_runs(workspace_root, [run, *existing])


def _maybe_update_run_index(workspace_root: Path, state: WorkspaceState) -> None:
    if workspace_root.parent.name != "runs":
        return

    base_root = workspace_root.parent.parent
    run_id = workspace_root.name
    runs = _read_runs(base_root)
    next_runs: list[WorkspaceRunSummary] = []
    changed = False
    for run in runs:
        if run.id != run_id:
            next_runs.append(run)
            continue
        changed = True
        next_runs.append(
            run.model_copy(
                update={
                    "updatedAt": _utc_now(),
                    "status": _derive_run_status(workspace_root, state),
                    "elementCount": len(state.elements),
                }
            )
        )

    if changed:
        _write_runs(base_root, next_runs)


def _derive_run_status(workspace_root: Path, state: WorkspaceState) -> str:
    if state.source is None:
        return "pending"
    if (workspace_root / "export" / "manifest.json").exists():
        return "exported"
    if any(element.status in {"extracted", "repair_pending", "repair_complete"} for element in state.elements):
        return "extracting"
    if state.elements:
        return "reviewing"
    return "uploaded"


def _write_state(workspace_root: Path, state: WorkspaceState) -> None:
    state_path = _state_path(workspace_root)
    state_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = state_path.with_suffix(".json.tmp")
    temp_path.write_text(
        json.dumps(state.model_dump(mode="json"), indent=2),
        encoding="utf-8",
    )
    os.replace(temp_path, state_path)
    _maybe_update_run_index(workspace_root.resolve(), state)


def _read_state(workspace_root: Path) -> WorkspaceState:
    state_path = _state_path(workspace_root)
    if not state_path.exists():
        return WorkspaceState()
    return WorkspaceState.model_validate_json(state_path.read_text(encoding="utf-8"))


def _replace_workspace_elements(
    state: WorkspaceState,
    elements: list[ElementRecord],
) -> WorkspaceState:
    # WHY: 多数接口只改变元素集合；词表属于工作区级配置，必须随状态重建一起保留。
    return WorkspaceState(
        source=state.source,
        elements=elements,
        detectionVocabulary=state.detectionVocabulary,
    )


def _source_path(workspace_root: Path) -> Path:
    return workspace_root / "source" / "original.png"


def _state_path(workspace_root: Path) -> Path:
    return workspace_root / "state.json"


def _clear_generated_workspace_outputs(workspace_root: Path) -> None:
    workspace_path = workspace_root.resolve()
    for dirname in (
        "elements",
        "export",
        "export.tmp",
        "export.previous",
        "split_requests",
    ):
        output_dir = (workspace_path / dirname).resolve()
        try:
            output_dir.relative_to(workspace_path)
        except ValueError as exc:
            raise ValueError("Workspace output path must stay inside workspace root.") from exc
        if output_dir.exists():
            if output_dir.is_dir():
                shutil.rmtree(output_dir)
            else:
                output_dir.unlink()


def _detection_results_to_elements(
    workspace_root: Path,
    source_image: Image.Image,
    provider_name: str,
    results: list[DetectionResult],
) -> list[ElementRecord]:
    generated_elements: list[ElementRecord] = []
    next_index = 1
    for result in results:
        bbox = expand_bbox(result.bbox, source_image.width, source_image.height)
        element_id = next_element_id(generated_elements, start=next_index)
        next_index = int(element_id.rsplit("_", 1)[1]) + 1
        thumbnail_path = write_thumbnail(source_image, workspace_root, element_id, bbox)
        generated_elements.append(
            ElementRecord(
                id=element_id,
                name=result.label,
                label=result.label,
                status="model_detected",
                mode="visible_only",
                bbox=bbox,
                layer=len(generated_elements) + 1,
                thumbnail=thumbnail_path,
                mask=None,
                parentId=None,
                source="model_detection",
                sourceProvider=provider_name,
                sourcePrompt=result.sourcePrompt,
                notes="",
                visible=True,
                confidence=result.confidence,
            )
        )
    return generated_elements


def _validate_detection_results(
    source_image: Image.Image,
    raw_results: object,
) -> list[DetectionResult]:
    if not isinstance(raw_results, list):
        raise HTTPException(
            status_code=502,
            detail="Invalid provider result: expected a list of detection results.",
        )

    results: list[DetectionResult] = []
    for index, raw_result in enumerate(raw_results, start=1):
        try:
            result = DetectionResult.model_validate(raw_result)
        except ValidationError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Invalid provider result at index {index}: {exc}",
            ) from exc

        try:
            _validate_detection_bbox_bounds(source_image, result.bbox)
        except ValueError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Invalid provider result at index {index}: {exc}",
            ) from exc
        results.append(result)
    return results


def _validate_detection_bbox_bounds(
    source_image: Image.Image,
    bbox: BoundingBox,
) -> None:
    if bbox.x < 0 or bbox.y < 0:
        raise ValueError("bbox coordinates must be non-negative.")
    if bbox.x + bbox.w > source_image.width or bbox.y + bbox.h > source_image.height:
        raise ValueError("bbox must fit within the source image bounds.")


def _require_source_image(workspace_root: Path) -> Image.Image:
    source_path = _source_path(workspace_root)
    if not source_path.exists():
        raise HTTPException(status_code=404, detail="No source image uploaded.")
    image = Image.open(source_path)
    image.load()
    return image


def _get_element(state: WorkspaceState, element_id: str) -> ElementRecord:
    try:
        validate_element_id(element_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    for element in state.elements:
        if element.id == element_id:
            return element
    raise HTTPException(status_code=404, detail="Element not found.")


def _apply_element_role_patch(
    state: WorkspaceState,
    element: ElementRecord,
    request: PatchElementRequest,
) -> ElementRecord:
    if (
        "assetRole" not in request.model_fields_set
        and "removeFromParent" not in request.model_fields_set
    ):
        return element

    asset_role = (
        request.assetRole
        if "assetRole" in request.model_fields_set
        else element.assetRole
    )
    if asset_role is None:
        raise ValueError("Asset role must not be null.")

    remove_from_parent = (
        request.removeFromParent
        if "removeFromParent" in request.model_fields_set
        else element.removeFromParent
    )

    if asset_role != "removable_child":
        # WHY: 修复/导出阶段只会对可摘除子物体读取父物体引用；其他角色保留该值
        # 会让后续流水线误以为需要从父图中做扣除，所以在角色切换时统一收敛为单一事实。
        remove_from_parent = None
    elif remove_from_parent is None:
        # WHY: 角色切换与父物体选择是 UI 的两步动作；None 表示“待选择父物体”，
        # 不会被修复/导出当作已有父关系消费，但允许 Inspector 进入父物体选择状态。
        pass
    elif remove_from_parent == "":
        # WHY: 空字符串既不是合法父关系，也不是明确的 pending 状态；持久化它会让
        # 后续修复/导出边界无法区分“未选择”和“坏引用”，所以在 API 边界拒绝。
        raise ValueError("removeFromParent must reference an existing parent element.")
    else:
        _validate_remove_from_parent_target(state, element.id, remove_from_parent)

    return element.model_copy(
        update={
            "assetRole": asset_role,
            "removeFromParent": remove_from_parent,
        }
    )


def _validate_remove_from_parent_target(
    state: WorkspaceState,
    element_id: str,
    parent_id: str,
) -> None:
    try:
        validate_element_id(parent_id)
    except ValueError as exc:
        raise ValueError("removeFromParent must reference an existing parent element.") from exc

    if parent_id == element_id:
        raise ValueError("removeFromParent must reference an existing parent element.")

    parent = next((element for element in state.elements if element.id == parent_id), None)
    if parent is None:
        raise ValueError("removeFromParent must reference an existing parent element.")
    if parent.assetRole != "parent":
        raise ValueError("removeFromParent must reference an element with parent role.")


def _select_extraction_targets(
    state: WorkspaceState,
    element_ids: list[str] | None,
) -> list[ElementRecord]:
    if element_ids is None:
        targets = [
            element
            for element in state.elements
            if _is_extractable_element(element, include_extracted=False)
        ]
    else:
        by_id = {element.id: element for element in state.elements}
        targets = []
        for element_id in element_ids:
            try:
                validate_element_id(element_id)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            element = by_id.get(element_id)
            if element is None:
                raise HTTPException(status_code=404, detail="Element not found.")
            if not _is_extractable_element(element):
                raise HTTPException(
                    status_code=400,
                    detail=f"Element {element.id} is not extractable.",
                )
            targets.append(element)

    if not targets:
        raise HTTPException(status_code=400, detail="No extractable elements selected.")
    return targets


def _is_extractable_element(
    element: ElementRecord,
    include_extracted: bool = True,
) -> bool:
    statuses = {"accepted", "extract_ready"}
    if include_extracted:
        statuses.add("extracted")
    return element.status in statuses and element.mode != "rejected"


def _is_repair_workflow_element(element: ElementRecord) -> bool:
    return element.mode in {"needs_completion", "completed_by_codex"}


def _repair_validation_state_update(
    workspace_root: Path,
    state: WorkspaceState,
    element: ElementRecord,
    qa_report: dict[str, Any],
) -> dict[str, str]:
    if qa_report["status"] == "fail":
        return {
            "status": "qa_failed",
            "mode": element.mode,
            "repairStatus": "qa_failed",
            "exportStatus": "blocked",
        }

    if _repair_contract_is_fresh(workspace_root, state, element):
        return {
            "status": "repair_complete",
            "mode": "completed_by_codex",
            "repairStatus": "repair_complete",
            "exportStatus": "ready",
        }

    # WHY: QA pass 只证明 completed_asset 可用；parent removal 还必须匹配当前 child mask/canvas，
    # 否则同一 child id 重新分割后会导出旧修复结果。
    return {
        "status": "repair_pending",
        "mode": "needs_completion",
        "repairStatus": "task_created",
        "exportStatus": "blocked",
    }


def _repair_contract_is_fresh(
    workspace_root: Path,
    state: WorkspaceState,
    element: ElementRecord,
) -> bool:
    if element.assetRole != "parent":
        return True
    children = [
        child
        for child in state.elements
        if child.assetRole == "removable_child"
        and child.removeFromParent == element.id
        and child.segmentationStatus == "mask_accepted"
    ]
    return not children or parent_removal_contract_covers_children(workspace_root, element, children)


def _status_after_geometry_invalidation(element: ElementRecord) -> str:
    return (
        "extract_ready"
        if _is_geometry_extract_ready_status(element)
        else element.status
    )


def _status_after_extraction_invalidation(element: ElementRecord) -> str:
    return (
        "extract_ready"
        if element.status in {
            "accepted",
            "extract_ready",
            "extracted",
            "repair_pending",
            "repair_complete",
            "qa_failed",
        }
        and element.mode != "rejected"
        else element.status
    )


def _status_after_repair_package_invalidation(element: ElementRecord) -> str:
    return (
        "extracted"
        if element.status in {"repair_pending", "repair_complete", "qa_failed"}
        else element.status
    )


def _repair_artifact_invalidation_update(element: ElementRecord) -> dict[str, str]:
    should_reset_repair = (
        element.repairStatus in {"task_created", "redraw_pending", "repair_complete", "qa_failed"}
        or element.exportStatus in {"ready", "exported", "blocked"}
        or element.mode == "completed_by_codex"
    )
    if not should_reset_repair:
        return {}

    # WHY: 清除 mask/geometry/missing-mask 会删除 repair 文件；新旧状态必须一起失效，
    # 否则前端会把已经不存在的 repair 输出显示为可导出。
    return {
        "repairStatus": "required" if _is_repair_workflow_element(element) else "not_required",
        "exportStatus": "blocked",
    }


def _reset_repair_mode(element: ElementRecord) -> str:
    return "needs_completion" if element.mode == "completed_by_codex" else element.mode


def _invalidate_geometry_changes(
    workspace_root: Path,
    previous_state: WorkspaceState,
    next_state: WorkspaceState,
) -> WorkspaceState:
    previous_by_id = {element.id: element for element in previous_state.elements}
    next_elements: list[ElementRecord] = []
    for element in next_state.elements:
        previous = previous_by_id.get(element.id)
        if previous is None or not _element_geometry_changed(previous, element):
            next_elements.append(element)
            continue

        clear_extraction_outputs(workspace_root, element.id)
        clear_repair_outputs(workspace_root, element.id)
        next_elements.append(
            element.model_copy(
                update={
                    "status": _status_after_geometry_invalidation(element),
                    "mode": _reset_repair_mode(element),
                    "mask": None,
                    "segmentationStatus": "not_started",
                    **_repair_artifact_invalidation_update(element),
                }
            )
        )

    return _replace_workspace_elements(next_state, next_elements)


def _element_geometry_changed(previous: ElementRecord, current: ElementRecord) -> bool:
    return not (
        _boxes_equal(previous.bbox, current.bbox)
        and previous.canvas is not None
        and current.canvas is not None
        and _boxes_equal(previous.canvas, current.canvas)
    )


def _boxes_equal(left: BoundingBox | CanvasBox, right: BoundingBox | CanvasBox) -> bool:
    return (
        left.x == right.x
        and left.y == right.y
        and left.w == right.w
        and left.h == right.h
    )


def _normalize_label(label: str | None) -> str:
    if label is None:
        raise ValueError("Label must not be blank.")
    normalized = label.strip()
    if not normalized:
        raise ValueError("Label must not be blank.")
    return normalized


def _is_geometry_extract_ready_status(element: ElementRecord) -> bool:
    return (
        element.status
        in {
            "accepted",
            "extract_ready",
            "extracted",
            "repair_pending",
            "repair_complete",
            "qa_failed",
        }
        and element.mode != "rejected"
    )


app = create_app()
