from __future__ import annotations

import json
import os
import shutil
from io import BytesIO
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError

from art_pipeline.annotations import (
    ManualElementCreateRequest,
    SplitElementRequest,
    SplitRequestContractCreate,
    create_manual_element,
    split_element,
    validate_workspace_state_geometry,
    write_split_request_contract,
)
from art_pipeline.elements import (
    BoundingBox,
    CanvasBox,
    ElementRecord,
    SourceMetadata,
    WorkspaceState,
    next_element_id,
    validate_element_id,
)
from art_pipeline.proposals import ImportedProposalsError, generate_proposals
from art_pipeline.asset_outputs import (
    clear_extraction_outputs,
    clear_stale_asset_outputs,
    write_mask_output,
)
from art_pipeline.mask_refine import ReplaceMaskRequest, create_mask_from_shape
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
from art_pipeline.thumbnails import write_thumbnail


def create_app(workspace_root: Path | None = None) -> FastAPI:
    app = FastAPI(title="Art Pipeline Workbench API")
    app.state.workspace_root = (workspace_root or Path("workspace")).resolve()

    @app.get("/api/workspace/source")
    def get_source() -> FileResponse:
        source_path = _source_path(app.state.workspace_root)
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
        _clear_element_outputs(root)
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

    @app.get("/api/workspace/assets/{asset_path:path}")
    def get_workspace_asset(asset_path: str) -> FileResponse:
        asset_file = (app.state.workspace_root / asset_path).resolve()
        workspace_root = app.state.workspace_root
        try:
            asset_file.relative_to(workspace_root)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail="Asset not found.") from exc
        if not asset_file.exists():
            raise HTTPException(status_code=404, detail="Asset not found.")
        return FileResponse(asset_file, media_type="image/png")

    @app.get("/api/workspace/state")
    def get_state() -> WorkspaceState:
        state_path = _state_path(app.state.workspace_root)
        if not state_path.exists():
            return WorkspaceState()
        return WorkspaceState.model_validate_json(state_path.read_text(encoding="utf-8"))

    @app.put("/api/workspace/state")
    def put_state(state: WorkspaceState) -> WorkspaceState:
        root = app.state.workspace_root
        try:
            validate_workspace_state_geometry(state)
            state = _invalidate_geometry_changes(root, _read_state(root), state)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        _write_state(root, state)
        return state

    @app.post("/api/workspace/elements")
    def post_element(request: ManualElementCreateRequest) -> dict:
        root = app.state.workspace_root
        state = _read_state(root)
        source_image = _require_source_image(root)

        try:
            created = create_manual_element(root, state, source_image, request)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        next_state = WorkspaceState(
            source=state.source,
            elements=[*state.elements, created],
        )
        _write_state(root, next_state)
        return {
            "element": created.model_dump(mode="json"),
            "state": next_state.model_dump(mode="json"),
        }

    @app.post("/api/workspace/elements/{element_id}/split")
    def post_split(element_id: str, request: SplitElementRequest) -> dict:
        root = app.state.workspace_root
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

        next_state = WorkspaceState(
            source=state.source,
            elements=[*updated_elements, *children],
        )
        _write_state(root, next_state)
        return {
            "children": [child.model_dump(mode="json") for child in children],
            "state": next_state.model_dump(mode="json"),
        }

    @app.post("/api/workspace/split-requests")
    def post_split_request(request: SplitRequestContractCreate) -> dict:
        root = app.state.workspace_root
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
    def post_extract(request: ExtractWorkspaceRequest) -> dict:
        root = app.state.workspace_root
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
        next_state = WorkspaceState(
            source=state.source,
            elements=[
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

    @app.post("/api/workspace/elements/{element_id:path}/mask/replace")
    def post_replace_mask(element_id: str, request: ReplaceMaskRequest) -> dict:
        root = app.state.workspace_root
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
        next_state = WorkspaceState(
            source=state.source,
            elements=[
                element.model_copy(
                    update={
                        "status": "extract_ready",
                        "mode": _reset_repair_mode(element),
                        "mask": mask_path,
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
    def post_clear_mask(element_id: str) -> dict:
        root = app.state.workspace_root
        state = _read_state(root)
        try:
            _get_element(state, element_id)
            clear_extraction_outputs(root, element_id)
            clear_repair_outputs(root, element_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        next_state = WorkspaceState(
            source=state.source,
            elements=[
                element.model_copy(
                    update={
                        "status": _status_after_extraction_invalidation(element),
                        "mode": _reset_repair_mode(element),
                        "mask": None,
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
    def post_missing_mask(element_id: str, request: MissingMaskRequest) -> dict:
        root = app.state.workspace_root
        state = _read_state(root)
        element = _get_element(state, element_id)

        try:
            missing_mask_path = write_missing_mask_from_shape(root, element, request.shape)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        next_state = WorkspaceState(
            source=state.source,
            elements=[
                element.model_copy(
                    update={
                        "status": _status_after_repair_package_invalidation(element),
                        "mode": _reset_repair_mode(element),
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
    def get_repair_metadata(element_id: str) -> dict:
        root = app.state.workspace_root
        state = _read_state(root)
        element = _get_element(state, element_id)
        return read_repair_metadata(root, element)

    @app.post("/api/workspace/elements/{element_id:path}/repair/task")
    def post_repair_task(element_id: str) -> dict:
        root = app.state.workspace_root
        state = _read_state(root)
        source_image = _require_source_image(root)
        element = _get_element(state, element_id)

        try:
            paths = create_repair_task_package(root, source_image, element)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        next_state = WorkspaceState(
            source=state.source,
            elements=[
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
    def post_repair_validate(element_id: str) -> dict:
        root = app.state.workspace_root
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
        next_state = WorkspaceState(
            source=state.source,
            elements=[
                element.model_copy(
                    update={
                        "status": "qa_failed"
                        if qa_report["status"] == "fail"
                        else "repair_complete",
                        "mode": element.mode
                        if qa_report["status"] == "fail"
                        else "completed_by_codex",
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
            "qa": qa_report,
            "repair": read_repair_metadata(root, next_element),
            "state": next_state.model_dump(mode="json"),
        }

    @app.post("/api/workspace/auto-annotate")
    def auto_annotate() -> WorkspaceState:
        root = app.state.workspace_root
        state = _read_state(root)
        if state.source is None:
            raise HTTPException(status_code=400, detail="Upload a source image before auto annotation.")

        source_path = _source_path(root)
        if not source_path.exists():
            raise HTTPException(status_code=404, detail="No source image uploaded.")

        source_image = Image.open(source_path)
        source_image.load()

        generated_elements: list[ElementRecord] = []
        next_index = 1
        try:
            candidates = generate_proposals(root, source_image)
        except ImportedProposalsError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        for candidate in candidates:
            element_id = next_element_id(state.elements + generated_elements, start=next_index)
            next_index = int(element_id.rsplit("_", 1)[1]) + 1
            thumbnail_path = write_thumbnail(source_image, root, element_id, candidate.bbox)
            generated_elements.append(
                ElementRecord(
                    id=element_id,
                    name=candidate.name,
                    status="proposal",
                    mode="visible_only",
                    bbox=candidate.bbox,
                    canvas=candidate.canvas,
                    layer=len(generated_elements) + 1,
                    thumbnail=thumbnail_path,
                    mask=None,
                    parentId=None,
                    source=candidate.source,
                    notes="",
                    visible=True,
                    confidence=candidate.confidence,
                )
            )

        persisted_elements = [
            element
            for element in state.elements
            if element.status != "proposal" or element.mode == "rejected"
        ]
        next_state = WorkspaceState(
            source=state.source,
            elements=[*persisted_elements, *generated_elements],
        )
        _write_state(root, next_state)
        return next_state

    return app


def _load_png(data: bytes) -> Image.Image:
    try:
        image = Image.open(BytesIO(data))
        image.load()
    except UnidentifiedImageError as exc:
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid PNG.") from exc

    if image.format != "PNG":
        raise HTTPException(status_code=400, detail="Only PNG uploads are supported.")
    return image


def _write_state(workspace_root: Path, state: WorkspaceState) -> None:
    state_path = _state_path(workspace_root)
    state_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = state_path.with_suffix(".json.tmp")
    temp_path.write_text(
        json.dumps(state.model_dump(mode="json"), indent=2),
        encoding="utf-8",
    )
    os.replace(temp_path, state_path)


def _read_state(workspace_root: Path) -> WorkspaceState:
    state_path = _state_path(workspace_root)
    if not state_path.exists():
        return WorkspaceState()
    return WorkspaceState.model_validate_json(state_path.read_text(encoding="utf-8"))


def _source_path(workspace_root: Path) -> Path:
    return workspace_root / "source" / "original.png"


def _state_path(workspace_root: Path) -> Path:
    return workspace_root / "state.json"


def _clear_element_outputs(workspace_root: Path) -> None:
    workspace_path = workspace_root.resolve()
    elements_dir = (workspace_path / "elements").resolve()
    try:
        elements_dir.relative_to(workspace_path)
    except ValueError as exc:
        raise ValueError("Workspace element output path must stay inside workspace root.") from exc
    if elements_dir.exists():
        shutil.rmtree(elements_dir)


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
                }
            )
        )

    return WorkspaceState(source=next_state.source, elements=next_elements)


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
