from __future__ import annotations

import json
import os
from io import BytesIO
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError

from art_pipeline.elements import ElementRecord, SourceMetadata, WorkspaceState, next_element_id
from art_pipeline.proposals import ImportedProposalsError, generate_proposals
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
        _write_state(app.state.workspace_root, state)
        return state

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


app = create_app()
