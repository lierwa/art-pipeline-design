from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException

from art_pipeline.http.helpers import (
    get_element as _get_element,
    require_source_image as _require_source_image,
)
from art_pipeline.http.models import (
    CodexFinalGenerateRequest,
    SegmentMaskPatchRequest,
)
from art_pipeline.codex_assets import generate_codex_final_asset
from art_pipeline.mask_refine import create_mask_from_shape
from art_pipeline.provider_config import (
    get_codex_asset_provider as _get_codex_asset_provider,
    get_sam2_provider as _get_sam2_provider,
)
from art_pipeline.segment.assets import (
    accept_sam2_edge_mask,
    is_sam2_edge_segmentable,
    patch_sam2_edge_mask,
    recompute_sticker_statuses,
    suggest_sam2_edge_mask,
)
from art_pipeline.workspace.state_updates import (
    replace_workspace_elements as _replace_workspace_elements,
)
from art_pipeline.workspace.store import (
    read_state as _read_state,
    resolve_workspace_root as _resolve_workspace_root,
    write_state as _write_state,
)


def register_segment_routes(app: FastAPI) -> None:
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
                state,
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
            patch_mask = create_mask_from_shape(element, request.shape, source_image)
            updated, segmentation = patch_sam2_edge_mask(
                root,
                source_image,
                element,
                patch_mask,
                request.operation,
                state,
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

    @app.post("/api/workspace/segment/suggest")
    def post_segment_suggest_all(runId: str | None = None) -> dict:
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
        segmentations: list[dict[str, Any]] = []
        current_state = state
        elements = sorted(
            state.elements,
            key=lambda element: 1 if element.assetRole == "parent" else 0,
        )
        for element in elements:
            if not is_sam2_edge_segmentable(element):
                continue
            current_element = _get_element(current_state, element.id)
            try:
                updated, segmentation = suggest_sam2_edge_mask(
                    root,
                    source_image,
                    current_element,
                    provider,
                    current_state,
                )
            except RuntimeError as exc:
                raise HTTPException(
                    status_code=502,
                    detail=f"Element {current_element.id} segment suggestion failed: {exc}",
                ) from exc
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            current_state = _replace_workspace_elements(
                current_state,
                [
                    updated if current.id == current_element.id else current
                    for current in current_state.elements
                ],
            )
            segmentations.append({"elementId": current_element.id, **segmentation})

        _write_state(root, current_state)
        return {
            "segmentations": segmentations,
            "state": current_state.model_dump(mode="json"),
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
                (_codex_prompt_hint(request) if request else None),
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


def _codex_prompt_hint(request: CodexFinalGenerateRequest) -> str | None:
    return request.promptHint if request.promptHint is not None else request.prompt
