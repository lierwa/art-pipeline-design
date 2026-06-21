from __future__ import annotations

from fastapi import FastAPI, HTTPException

from art_pipeline.http.helpers import (
    get_element as _get_element,
    require_source_image as _require_source_image,
)
from art_pipeline.asset_outputs import (
    clear_extraction_outputs,
    clear_stale_asset_outputs,
    write_mask_output,
)
from art_pipeline.mask_refine import ReplaceMaskRequest, create_mask_from_shape
from art_pipeline.qa import validate_repair_output
from art_pipeline.repair.tasks import (
    MissingMaskRequest,
    clear_repair_outputs,
    create_repair_task_package,
    read_repair_metadata,
    repair_task_package_exists,
    write_missing_mask_from_shape,
)
from art_pipeline.workspace.extraction_targets import (
    is_extractable_element as _is_extractable_element,
)
from art_pipeline.workspace.state_updates import (
    is_repair_workflow_element as _is_repair_workflow_element,
    repair_artifact_invalidation_update as _repair_artifact_invalidation_update,
    repair_validation_state_update as _repair_validation_state_update,
    replace_workspace_elements as _replace_workspace_elements,
    reset_repair_mode as _reset_repair_mode,
    status_after_extraction_invalidation as _status_after_extraction_invalidation,
    status_after_repair_package_invalidation as _status_after_repair_package_invalidation,
)
from art_pipeline.workspace.store import (
    read_state as _read_state,
    resolve_workspace_root as _resolve_workspace_root,
    write_state as _write_state,
)


def register_repair_routes(app: FastAPI) -> None:
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
