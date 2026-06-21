from __future__ import annotations

from fastapi import FastAPI, HTTPException

from art_pipeline.annotations import (
    ManualElementCreateRequest,
    SplitElementRequest,
    SplitRequestContractCreate,
    create_manual_element,
    split_element,
    validate_workspace_state_geometry,
    write_split_request_contract,
)
from art_pipeline.http.helpers import (
    get_element as _get_element,
    normalize_label as _normalize_label,
    require_source_image as _require_source_image,
)
from art_pipeline.http.models import (
    ChildElementRequest,
    ElementParentRequest,
    MergeElementsRequest,
    PatchElementRequest,
)
from art_pipeline.candidates import (
    add_candidate_child,
    edit_candidate,
    mark_candidate_merged,
    merge_candidates,
)
from art_pipeline.elements import ElementRecord
from art_pipeline.segment.assets import recompute_sticker_statuses
from art_pipeline.thumbnails import write_thumbnail
from art_pipeline.workspace.element_updates import (
    apply_element_parent_relationship as _apply_element_parent_relationship,
    apply_element_role_patch as _apply_element_role_patch,
)
from art_pipeline.workspace.state_updates import (
    invalidate_geometry_changes as _invalidate_geometry_changes,
    replace_workspace_elements as _replace_workspace_elements,
)
from art_pipeline.workspace.store import (
    read_state as _read_state,
    resolve_workspace_root as _resolve_workspace_root,
    source_path as _source_path,
    write_state as _write_state,
)


def register_element_routes(app: FastAPI) -> None:
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
            updated = _apply_element_role_patch(
                state,
                updated,
                request.assetRole,
                request.removeFromParent,
                request.model_fields_set,
            )
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

    @app.patch("/api/workspace/elements/{element_id}/parent")
    def patch_element_parent(
        element_id: str,
        request: ElementParentRequest,
        runId: str | None = None,
    ) -> dict:
        root = _resolve_workspace_root(app.state.workspace_root, runId)
        state = _read_state(root)

        try:
            next_state = _apply_element_parent_relationship(
                state,
                element_id,
                request.parentId,
            )
            validate_workspace_state_geometry(next_state)
            if _source_path(root).exists():
                # WHY: 拖拽父子关系不只是 UI 树形缩进；它会改变父级扣除子级和 repair/export gate。
                # 复用同一套状态重算，避免右侧树与最终抠图语义分叉。
                next_state = recompute_sticker_statuses(
                    root,
                    _require_source_image(root),
                    next_state,
                )
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
