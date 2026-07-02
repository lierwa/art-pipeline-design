from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse

from art_pipeline.course_planner.api_models import (
    ChapterScenePromptPatchRequest,
    CompleteSceneImageRunPatchRequest,
)
from art_pipeline.course_planner.scene_package_models import ChapterSceneAssembly
from art_pipeline.course_planner.scene_package_route_helpers import (
    SCENE_PACKAGE_ROUTE_ERRORS,
    literal_form_value,
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
            negative_constraints=(
                payload.negative_constraints
                if "negative_constraints" in payload.model_fields_set
                else None
            ),
            style_notes=(
                payload.style_notes if "style_notes" in payload.model_fields_set else None
            ),
            target_objects=(
                _target_object_updates(payload)
                if "target_objects" in payload.model_fields_set
                else None
            ),
        )
    except SCENE_PACKAGE_ROUTE_ERRORS as exc:
        raise scene_package_http_exception(exc) from exc
    return scene_package_payload(package)


@scene_package_router.post("/chapters/{chapterId}/scene-package/references")
async def post_scene_reference(
    request: Request,
    chapterId: str,
) -> dict[str, object]:
    form = await request.form()
    file = require_upload_file(form.get("file"))
    prompt_role = literal_form_value(
        form.get("promptRole"),
        allowed=("style", "scene", "character", "other"),
        default="other",
        field_name="promptRole",
    )
    notes = string_form_value(form.get("notes"), default="")
    try:
        package = store_for_request(request).add_chapter_scene_reference(
            chapterId,
            image_bytes=await file.read(),
            original_filename=file.filename or "upload.png",
            prompt_role=prompt_role,
            notes=notes,
        )
    except SCENE_PACKAGE_ROUTE_ERRORS as exc:
        raise scene_package_http_exception(exc) from exc
    return scene_package_payload(package)


@scene_package_router.delete(
    "/chapters/{chapterId}/scene-package/references/{referenceId}"
)
def delete_scene_reference(
    request: Request,
    chapterId: str,
    referenceId: str,
) -> dict[str, object]:
    try:
        package = store_for_request(request).delete_chapter_scene_reference(chapterId, referenceId)
    except SCENE_PACKAGE_ROUTE_ERRORS as exc:
        raise scene_package_http_exception(
            exc,
            child_not_found_detail="Scene reference not found.",
        ) from exc
    return scene_package_payload(package)


@scene_package_router.post("/chapters/{chapterId}/scene-package/base-candidates")
async def post_base_candidate(
    request: Request,
    chapterId: str,
) -> dict[str, object]:
    form = await request.form()
    file = require_upload_file(form.get("file"))
    try:
        package = store_for_request(request).add_empty_base_scene_candidate(
            chapterId,
            image_bytes=await file.read(),
            original_filename=file.filename or "upload.png",
            prompt_snapshot=_optional_prompt_snapshot(form.get("promptSnapshot")),
            reference_ids=string_list_form_value(form, "referenceIds"),
        )
    except SCENE_PACKAGE_ROUTE_ERRORS as exc:
        raise scene_package_http_exception(exc) from exc
    return scene_package_payload(package)


@scene_package_router.delete(
    "/chapters/{chapterId}/scene-package/base-candidates/{candidateId}"
)
def delete_base_candidate(
    request: Request,
    chapterId: str,
    candidateId: str,
) -> dict[str, object]:
    try:
        package = store_for_request(request).delete_empty_base_scene_candidate(
            chapterId,
            candidateId,
        )
    except SCENE_PACKAGE_ROUTE_ERRORS as exc:
        raise scene_package_http_exception(
            exc,
            child_not_found_detail="Base candidate not found.",
        ) from exc
    return scene_package_payload(package)


@scene_package_router.post(
    "/chapters/{chapterId}/scene-package/base-candidates/{candidateId}/lock"
)
def post_lock_base_candidate(
    request: Request,
    chapterId: str,
    candidateId: str,
) -> dict[str, object]:
    try:
        package = store_for_request(request).lock_empty_base_scene(chapterId, candidateId)
    except SCENE_PACKAGE_ROUTE_ERRORS as exc:
        raise scene_package_http_exception(exc) from exc
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
            reference_ids=string_list_form_value(form, "referenceIds"),
            variation_prompt=string_form_value(form.get("variationPrompt"), default=""),
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
        package = store_for_request(request).delete_complete_scene_image(chapterId, completeImageId)
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


def _optional_prompt_snapshot(value: object) -> str | None:
    if value is None:
        return None
    return string_form_value(value, default="")
