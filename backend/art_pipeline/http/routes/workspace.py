from __future__ import annotations

import re
import shutil
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from art_pipeline.elements import SourceMetadata, WorkspaceState
from art_pipeline.http.helpers import load_png as _load_png
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

ASSET_MEDIA_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}
_CHECKPOINT_TITLE_SUFFIX = re.compile(r" - checkpoint(?: \d+)?$")


def register_workspace_routes(app: FastAPI) -> None:
    register_workspace_source_routes(app)
    register_workspace_run_collection_routes(app)
    register_workspace_run_item_routes(app)
    register_workspace_asset_routes(app)


def register_workspace_source_routes(app: FastAPI) -> None:
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


def register_workspace_run_collection_routes(app: FastAPI) -> None:
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


def register_workspace_run_item_routes(app: FastAPI) -> None:
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


def register_workspace_asset_routes(app: FastAPI) -> None:
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


def _next_checkpoint_title(title: str, runs: list[WorkspaceRunSummary]) -> str:
    base_title = _CHECKPOINT_TITLE_SUFFIX.sub("", title).strip() or "Untitled source"
    existing_titles = {run.title for run in runs}
    candidate = f"{base_title} - checkpoint"
    suffix = 2
    while candidate in existing_titles:
        candidate = f"{base_title} - checkpoint {suffix}"
        suffix += 1
    return candidate
