from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse

from art_pipeline.course_planner.api_models import (
    ChapterScenePromptPatchRequest,
    CompleteSceneImageRunPatchRequest,
    CurrentEmptySceneImageRequest,
)
from art_pipeline.course_planner.scene_package_models import ChapterSceneAssembly
from art_pipeline.course_planner.scene_package_route_helpers import (
    SCENE_PACKAGE_ROUTE_ERRORS,
    optional_string_form_value,
    parse_json_model,
    required_string_form_value,
    require_upload_file,
    scene_package_http_exception,
    scene_package_payload,
    store_for_request,
    string_form_value,
    string_list_form_value,
)

scene_package_router = APIRouter(prefix="/api/course-planner")


def register_scene_package_routes(app) -> None:
    app.include_router(scene_package_router)


@scene_package_router.get("/chapters/{chapterId}/scene-package")
def get_scene_package(request: Request, chapterId: str) -> dict[str, object]:
    try:
        package = store_for_request(request).read_chapter_scene_package(chapterId)
    except SCENE_PACKAGE_ROUTE_ERRORS as exc:
        raise scene_package_http_exception(exc) from exc
    return scene_package_payload(package)


@scene_package_router.patch("/chapters/{chapterId}/scene-package/prompt")
async def patch_scene_package_prompt(
    request: Request,
    chapterId: str,
) -> dict[str, object]:
    payload = await parse_json_model(request, ChapterScenePromptPatchRequest)
    try:
        package = store_for_request(request).update_chapter_scene_prompt(
            chapterId,
            prompt_text=payload.prompt_text,
            scene_spatial_contract=(
                payload.scene_spatial_contract
                if "scene_spatial_contract" in payload.model_fields_set
                else None
            ),
            target_objects=(
                _target_object_updates(payload)
                if "target_objects" in payload.model_fields_set
                else None
            ),
            avoid_objects=(
                _avoid_object_updates(payload)
                if "avoid_objects" in payload.model_fields_set
                else None
            ),
            prompt_confirmations=(
                _prompt_confirmation_updates(payload)
                if "prompt_confirmations" in payload.model_fields_set
                else None
            ),
            reference_selections=(
                _reference_selection_updates(payload)
                if "reference_selections" in payload.model_fields_set
                else None
            ),
        )
    except SCENE_PACKAGE_ROUTE_ERRORS as exc:
        raise scene_package_http_exception(exc) from exc
    return scene_package_payload(package)


@scene_package_router.post("/chapters/{chapterId}/scene-package/empty-scene-images")
async def post_empty_scene_image(
    request: Request,
    chapterId: str,
) -> dict[str, object]:
    form = await request.form()
    file = require_upload_file(form.get("file"))
    try:
        package = store_for_request(request).add_empty_scene_image(
            chapterId,
            image_bytes=await file.read(),
            original_filename=file.filename or "upload.png",
            prompt_snapshot=_optional_prompt_snapshot(form.get("promptSnapshot")),
            reference_image_ids=string_list_form_value(form, "referenceImageIds"),
        )
    except SCENE_PACKAGE_ROUTE_ERRORS as exc:
        raise scene_package_http_exception(exc) from exc
    return scene_package_payload(package)


@scene_package_router.delete(
    "/chapters/{chapterId}/scene-package/empty-scene-images/{imageId}"
)
def delete_empty_scene_image(
    request: Request,
    chapterId: str,
    imageId: str,
) -> dict[str, object]:
    try:
        package = store_for_request(request).delete_empty_scene_image(chapterId, imageId)
    except SCENE_PACKAGE_ROUTE_ERRORS as exc:
        raise scene_package_http_exception(
            exc,
            child_not_found_detail="Empty scene image not found.",
        ) from exc
    return scene_package_payload(package)


@scene_package_router.post("/chapters/{chapterId}/scene-package/current-empty-scene")
async def post_current_empty_scene(
    request: Request,
    chapterId: str,
) -> dict[str, object]:
    payload = await parse_json_model(request, CurrentEmptySceneImageRequest)
    try:
        package = store_for_request(request).select_empty_scene_image(
            chapterId,
            payload.empty_scene_image_id,
        )
    except SCENE_PACKAGE_ROUTE_ERRORS as exc:
        raise scene_package_http_exception(
            exc,
            child_not_found_detail="Empty Scene Image not found.",
        ) from exc
    return scene_package_payload(package)


@scene_package_router.post("/chapters/{chapterId}/scene-package/complete-images")
async def post_complete_scene_image(
    request: Request,
    chapterId: str,
) -> dict[str, object]:
    form = await request.form()
    file = require_upload_file(form.get("file"))
    try:
        package = store_for_request(request).add_complete_scene_image(
            chapterId,
            image_bytes=await file.read(),
            original_filename=file.filename or "upload.png",
            prompt_snapshot=_optional_prompt_snapshot(form.get("promptSnapshot")),
            reference_image_ids=string_list_form_value(form, "referenceImageIds"),
            generation_note=string_form_value(form.get("generationNote"), default=""),
        )
    except SCENE_PACKAGE_ROUTE_ERRORS as exc:
        raise scene_package_http_exception(exc) from exc
    return scene_package_payload(package)


@scene_package_router.delete(
    "/chapters/{chapterId}/scene-package/complete-images/{completeImageId}"
)
def delete_complete_scene_image(
    request: Request,
    chapterId: str,
    completeImageId: str,
) -> dict[str, object]:
    try:
        package = store_for_request(request).delete_complete_scene_image(
            chapterId,
            completeImageId,
        )
    except SCENE_PACKAGE_ROUTE_ERRORS as exc:
        raise scene_package_http_exception(
            exc,
            child_not_found_detail="Complete scene image not found.",
        ) from exc
    return scene_package_payload(package)


@scene_package_router.patch(
    "/chapters/{chapterId}/scene-package/complete-images/{completeImageId}/run"
)
async def patch_complete_scene_image_run(
    request: Request,
    chapterId: str,
    completeImageId: str,
) -> dict[str, object]:
    payload = await parse_json_model(request, CompleteSceneImageRunPatchRequest)
    try:
        package = store_for_request(request).associate_complete_image_run(
            chapterId,
            completeImageId,
            run_id=payload.run_id,
            run_status=payload.run_status,
        )
    except SCENE_PACKAGE_ROUTE_ERRORS as exc:
        raise scene_package_http_exception(
            exc,
            child_not_found_detail="Complete scene image not found.",
        ) from exc
    return scene_package_payload(package)


@scene_package_router.post("/chapters/{chapterId}/scene-package/chapter-assets")
async def post_chapter_asset(
    request: Request,
    chapterId: str,
) -> dict[str, object]:
    form = await request.form()
    file = require_upload_file(form.get("file"))
    try:
        package = store_for_request(request).add_chapter_asset_from_run_asset(
            chapterId,
            source_run_id=required_string_form_value(form.get("sourceRunId"), "sourceRunId"),
            source_run_asset_id=required_string_form_value(
                form.get("sourceRunAssetId"),
                "sourceRunAssetId",
            ),
            source_complete_image_id=optional_string_form_value(
                form.get("sourceCompleteImageId"),
                "sourceCompleteImageId",
            ),
            image_bytes=await file.read(),
            original_filename=file.filename or "upload.png",
            display_name=required_string_form_value(form.get("displayName"), "displayName"),
            linked_target_object_id=optional_string_form_value(
                form.get("linkedTargetObjectId"),
                "linkedTargetObjectId",
            ),
        )
    except SCENE_PACKAGE_ROUTE_ERRORS as exc:
        raise scene_package_http_exception(exc) from exc
    return scene_package_payload(package)


@scene_package_router.post(
    "/chapters/{chapterId}/scene-package/chapter-assets/direct-upload"
)
async def post_direct_chapter_asset(
    request: Request,
    chapterId: str,
) -> dict[str, object]:
    form = await request.form()
    file = require_upload_file(form.get("file"))
    try:
        package = store_for_request(request).add_direct_chapter_asset(
            chapterId,
            image_bytes=await file.read(),
            original_filename=file.filename or "upload.png",
            display_name=required_string_form_value(form.get("displayName"), "displayName"),
            linked_target_object_id=optional_string_form_value(
                form.get("linkedTargetObjectId"),
                "linkedTargetObjectId",
            ),
        )
    except SCENE_PACKAGE_ROUTE_ERRORS as exc:
        raise scene_package_http_exception(exc) from exc
    return scene_package_payload(package)


@scene_package_router.post("/chapters/{chapterId}/scene-package/final-scene")
async def post_final_scene(
    request: Request,
    chapterId: str,
) -> dict[str, object]:
    form = await request.form()
    file = require_upload_file(form.get("file"))
    try:
        package = store_for_request(request).lock_final_chapter_scene(
            chapterId,
            image_bytes=await file.read(),
            original_filename=file.filename or "upload.png",
        )
    except SCENE_PACKAGE_ROUTE_ERRORS as exc:
        raise scene_package_http_exception(exc) from exc
    return scene_package_payload(package)


@scene_package_router.put("/chapters/{chapterId}/scene-package/assembly")
async def put_scene_package_assembly(
    request: Request,
    chapterId: str,
) -> dict[str, object]:
    payload = await parse_json_model(request, ChapterSceneAssembly)
    try:
        package = store_for_request(request).save_chapter_scene_assembly(chapterId, payload)
    except SCENE_PACKAGE_ROUTE_ERRORS as exc:
        raise scene_package_http_exception(exc) from exc
    return scene_package_payload(package)


@scene_package_router.get("/chapters/{chapterId}/scene-package/media/{mediaKind}/{mediaId}")
def get_scene_package_media(
    request: Request,
    chapterId: str,
    mediaKind: str,
    mediaId: str,
) -> FileResponse:
    try:
        path, media_type = store_for_request(request).read_chapter_scene_package_media(
            chapterId,
            mediaKind,
            mediaId,
        )
    except SCENE_PACKAGE_ROUTE_ERRORS as exc:
        raise scene_package_http_exception(
            exc,
            child_not_found_detail="Scene package media not found.",
        ) from exc
    return FileResponse(path, media_type=media_type)


def _target_object_updates(
    payload: ChapterScenePromptPatchRequest,
) -> list[dict[str, str]]:
    if payload.target_objects is None:
        return []
    # WHY: scene package target object 的 HTTP 合同与持久化合同现在保持同构，
    # 这里直接透传 description/priority，避免路由层再制造 notes 兼容分叉。
    return [
        {
            "label": target.label,
            "description": target.description,
            "priority": target.priority,
        }
        for target in payload.target_objects
    ]


def _avoid_object_updates(
    payload: ChapterScenePromptPatchRequest,
) -> list[dict[str, str]]:
    if payload.avoid_objects is None:
        return []
    return [
        {
            "label": target.label,
            "description": target.description,
        }
        for target in payload.avoid_objects
    ]


def _prompt_confirmation_updates(
    payload: ChapterScenePromptPatchRequest,
) -> dict[str, object]:
    if payload.prompt_confirmations is None:
        return {}
    return payload.prompt_confirmations.model_dump(mode="python", by_alias=False)


def _reference_selection_updates(
    payload: ChapterScenePromptPatchRequest,
) -> list[dict[str, str]]:
    if payload.reference_selections is None:
        return []
    return [
        selection.model_dump(mode="python", by_alias=False)
        for selection in payload.reference_selections
    ]


def _optional_prompt_snapshot(value: object) -> str | None:
    if value is None:
        return None
    return string_form_value(value, default="")
