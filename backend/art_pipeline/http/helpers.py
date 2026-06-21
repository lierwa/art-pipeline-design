from __future__ import annotations

from io import BytesIO
from pathlib import Path

from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError

from art_pipeline.elements import ElementRecord, WorkspaceState, validate_element_id
from art_pipeline.workspace.store import source_path as _source_path


def load_png(data: bytes) -> Image.Image:
    try:
        image = Image.open(BytesIO(data))
        image.load()
    except UnidentifiedImageError as exc:
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid PNG.") from exc

    if image.format != "PNG":
        raise HTTPException(status_code=400, detail="Only PNG uploads are supported.")
    return image


def require_source_image(workspace_root: Path) -> Image.Image:
    source_path = _source_path(workspace_root)
    if not source_path.exists():
        raise HTTPException(status_code=404, detail="No source image uploaded.")
    image = Image.open(source_path)
    image.load()
    return image


def get_element(state: WorkspaceState, element_id: str) -> ElementRecord:
    try:
        validate_element_id(element_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    for element in state.elements:
        if element.id == element_id:
            return element
    raise HTTPException(status_code=404, detail="Element not found.")


def normalize_label(label: str | None) -> str:
    if label is None:
        raise ValueError("Label must not be blank.")
    normalized = label.strip()
    if not normalized:
        raise ValueError("Label must not be blank.")
    return normalized
