from __future__ import annotations

import json
from pathlib import Path
from uuid import uuid4

from PIL import Image
from pydantic import BaseModel, Field

from art_pipeline.elements import (
    BoundingBox,
    CanvasBox,
    ElementRecord,
    WorkspaceState,
    next_element_id,
    validate_element_id,
)
from art_pipeline.masks import clamp_bbox_to_source, expand_canvas
from art_pipeline.thumbnails import write_thumbnail


class ManualElementCreateRequest(BaseModel):
    name: str = "Manual Element"
    bbox: BoundingBox


class SplitRegionDraft(BaseModel):
    name: str | None = None
    bbox: BoundingBox


class SplitElementRequest(BaseModel):
    regions: list[SplitRegionDraft] = Field(default_factory=list)


class SplitRequestContractCreate(BaseModel):
    elementId: str
    description: str


def validate_workspace_state_geometry(state: WorkspaceState) -> None:
    if not state.elements:
        return

    if state.source is None:
        raise ValueError("Workspace state with elements requires source metadata.")

    source_width = state.source.width
    source_height = state.source.height
    seen_ids: set[str] = set()
    for element in state.elements:
        validate_element_id(element.id)
        if element.id in seen_ids:
            raise ValueError(f"Duplicate element id: {element.id}.")
        seen_ids.add(element.id)
        _validate_box_bounds(
            element.id,
            "bbox",
            element.bbox,
            source_width,
            source_height,
        )
        if element.canvas is None:
            raise ValueError(f"Element {element.id} canvas is required.")
        _validate_box_bounds(
            element.id,
            "canvas",
            element.canvas,
            source_width,
            source_height,
        )
        if not _contains_box(element.canvas, element.bbox):
            raise ValueError(f"Element {element.id} canvas must contain bbox.")


def create_manual_element(
    workspace_root: Path,
    state: WorkspaceState,
    source_image: Image.Image,
    request: ManualElementCreateRequest,
) -> ElementRecord:
    bbox = clamp_bbox_to_source(request.bbox, source_image.width, source_image.height)
    _validate_non_empty_bbox(bbox)
    element_id = next_element_id(state.elements)
    thumbnail_path = write_thumbnail(source_image, workspace_root, element_id, bbox)
    return ElementRecord(
        id=element_id,
        name=request.name.strip() or "Manual Element",
        status="accepted",
        mode="visible_only",
        bbox=bbox,
        canvas=expand_canvas(bbox, source_image.width, source_image.height),
        layer=_next_layer(state),
        thumbnail=thumbnail_path,
        mask=None,
        parentId=None,
        source="manual",
        notes="",
        visible=True,
        confidence=None,
    )


def split_element(
    workspace_root: Path,
    state: WorkspaceState,
    source_image: Image.Image,
    parent: ElementRecord,
    request: SplitElementRequest,
) -> list[ElementRecord]:
    if not request.regions:
        raise ValueError("Provide at least one split region.")

    children: list[ElementRecord] = []
    next_layer = max(1, parent.layer)
    existing = list(state.elements)
    for index, region in enumerate(request.regions, start=1):
        bbox = clamp_bbox_to_source(region.bbox, source_image.width, source_image.height)
        _validate_non_empty_bbox(bbox)
        element_id = next_element_id(existing + children)
        thumbnail_path = write_thumbnail(source_image, workspace_root, element_id, bbox)
        children.append(
            ElementRecord(
                id=element_id,
                name=(region.name or f"{parent.name} Part {index}").strip(),
                status="accepted",
                mode="visible_only",
                bbox=bbox,
                canvas=expand_canvas(bbox, source_image.width, source_image.height),
                layer=next_layer + index - 1,
                thumbnail=thumbnail_path,
                mask=None,
                parentId=parent.id,
                source="split",
                notes="",
                visible=True,
                confidence=None,
            )
        )
    return children


def write_split_request_contract(
    workspace_root: Path,
    source_image: Image.Image,
    element: ElementRecord,
    description: str,
) -> tuple[str, dict]:
    request_id = f"split_request_{uuid4().hex[:12]}"
    split_dir = workspace_root / "split_requests"
    split_dir.mkdir(parents=True, exist_ok=True)

    crop_relative_path = f"split_requests/{request_id}_source_crop.png"
    crop_path = workspace_root / crop_relative_path
    crop_box = (
        element.bbox.x,
        element.bbox.y,
        element.bbox.x + element.bbox.w,
        element.bbox.y + element.bbox.h,
    )
    source_image.crop(crop_box).save(crop_path, format="PNG")

    contract = {
        "requestId": request_id,
        "elementId": element.id,
        "description": description,
        "sourceImagePath": "source/original.png",
        "sourceCropPath": crop_relative_path,
        "expectedOutput": {
            "type": "split_children",
            "parentStatus": "split_parent",
            "children": [
                {
                    "name": "string",
                    "bbox": {"x": "int", "y": "int", "w": "int", "h": "int"},
                    "canvas": {"x": "int", "y": "int", "w": "int", "h": "int"},
                }
            ],
        },
    }

    contract_relative_path = f"split_requests/{request_id}.json"
    contract_path = workspace_root / contract_relative_path
    contract_path.write_text(json.dumps(contract, indent=2), encoding="utf-8")
    return contract_relative_path, contract


def _validate_non_empty_bbox(bbox: BoundingBox) -> None:
    if bbox.w <= 0 or bbox.h <= 0:
        raise ValueError("Bounding box must cover at least one pixel.")


def _validate_box_bounds(
    element_id: str,
    label: str,
    box: BoundingBox | CanvasBox,
    source_width: int,
    source_height: int,
) -> None:
    if box.x < 0 or box.y < 0:
        raise ValueError(f"Element {element_id} {label} x/y must be >= 0.")
    if box.w <= 0 or box.h <= 0:
        raise ValueError(f"Element {element_id} {label} width/height must be > 0.")
    if box.x + box.w > source_width or box.y + box.h > source_height:
        raise ValueError(f"Element {element_id} {label} must stay within source bounds.")


def _contains_box(outer: CanvasBox, inner: BoundingBox) -> bool:
    return (
        outer.x <= inner.x
        and outer.y <= inner.y
        and outer.x + outer.w >= inner.x + inner.w
        and outer.y + outer.h >= inner.y + inner.h
    )


def _next_layer(state: WorkspaceState) -> int:
    if not state.elements:
        return 1
    return max(element.layer for element in state.elements) + 1
