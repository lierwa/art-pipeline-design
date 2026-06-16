from __future__ import annotations

import json
from io import BytesIO
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field


class SourceMetadata(BaseModel):
    filename: str
    path: str
    width: int
    height: int


class WorkspaceState(BaseModel):
    source: SourceMetadata | None = None
    elements: list[dict[str, Any]] = Field(default_factory=list)


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
    state_path.write_text(
        json.dumps(state.model_dump(mode="json"), indent=2),
        encoding="utf-8",
    )


def _source_path(workspace_root: Path) -> Path:
    return workspace_root / "source" / "original.png"


def _state_path(workspace_root: Path) -> Path:
    return workspace_root / "state.json"


app = create_app()
