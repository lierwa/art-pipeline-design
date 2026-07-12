from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import FileResponse
from starlette.datastructures import UploadFile

from art_pipeline.course_planner.scene_package_errors import LibraryItemInUseError
from art_pipeline.course_planner.scene_package_route_helpers import (
    SCENE_PACKAGE_ROUTE_ERRORS,
    optional_string_form_value,
    required_string_form_value,
    require_upload_file,
    scene_package_http_exception,
    store_for_request,
)

library_router = APIRouter(prefix="/api/course-planner")


@library_router.get("/character-ips")
def get_character_ips(request: Request) -> dict[str, list[dict[str, object]]]:
    return {
        "characterIps": [
            item.model_dump(mode="json")
            for item in store_for_request(request).list_character_ips()
        ]
    }


@library_router.post("/character-ips")
async def post_character_ip(request: Request) -> dict[str, object]:
    form = await request.form()
    file = require_upload_file(form.get("file"))
    try:
        item = store_for_request(request).create_character_ip(
            display_name=required_string_form_value(form.get("displayName"), "displayName"),
            image_bytes=await file.read(),
            original_filename=file.filename or "upload.png",
        )
    except SCENE_PACKAGE_ROUTE_ERRORS as exc:
        raise _library_http_exception(exc) from exc
    return {"characterIp": item.model_dump(mode="json")}


@library_router.patch("/character-ips/{characterIpId}")
async def patch_character_ip(request: Request, characterIpId: str) -> dict[str, object]:
    form = await request.form()
    file = _optional_upload_file(form.get("file"))
    try:
        item = store_for_request(request).update_character_ip(
            characterIpId,
            display_name=optional_string_form_value(form.get("displayName"), "displayName"),
            image_bytes=await file.read() if file else None,
            original_filename=file.filename if file else None,
        )
    except SCENE_PACKAGE_ROUTE_ERRORS as exc:
        raise _library_http_exception(exc) from exc
    return {"characterIp": item.model_dump(mode="json")}


@library_router.delete("/character-ips/{characterIpId}", status_code=204)
def delete_character_ip(request: Request, characterIpId: str) -> Response:
    try:
        store_for_request(request).delete_character_ip(characterIpId)
    except SCENE_PACKAGE_ROUTE_ERRORS as exc:
        raise _library_http_exception(exc) from exc
    return Response(status_code=204)


@library_router.get("/character-ips/{characterIpId}/model-sheet")
def get_character_model_sheet(request: Request, characterIpId: str) -> FileResponse:
    try:
        path, asset = store_for_request(request).read_character_model_sheet(characterIpId)
    except SCENE_PACKAGE_ROUTE_ERRORS as exc:
        raise _library_http_exception(exc) from exc
    return FileResponse(path, media_type=asset.media_type, filename=asset.original_filename)


@library_router.get("/scene-style-references")
def get_scene_style_references(request: Request) -> dict[str, list[dict[str, object]]]:
    return {
        "sceneStyleReferences": [
            item.model_dump(mode="json")
            for item in store_for_request(request).list_scene_style_references()
        ]
    }


@library_router.post("/scene-style-references")
async def post_scene_style_reference(request: Request) -> dict[str, object]:
    form = await request.form()
    file = require_upload_file(form.get("file"))
    try:
        item = store_for_request(request).create_scene_style_reference(
            display_name=required_string_form_value(form.get("displayName"), "displayName"),
            image_bytes=await file.read(),
            original_filename=file.filename or "upload.png",
        )
    except SCENE_PACKAGE_ROUTE_ERRORS as exc:
        raise _library_http_exception(exc) from exc
    return {"sceneStyleReference": item.model_dump(mode="json")}


@library_router.patch("/scene-style-references/{styleId}")
async def patch_scene_style_reference(request: Request, styleId: str) -> dict[str, object]:
    form = await request.form()
    file = _optional_upload_file(form.get("file"))
    try:
        item = store_for_request(request).update_scene_style_reference(
            styleId,
            display_name=optional_string_form_value(form.get("displayName"), "displayName"),
            image_bytes=await file.read() if file else None,
            original_filename=file.filename if file else None,
        )
    except SCENE_PACKAGE_ROUTE_ERRORS as exc:
        raise _library_http_exception(exc) from exc
    return {"sceneStyleReference": item.model_dump(mode="json")}


@library_router.delete("/scene-style-references/{styleId}", status_code=204)
def delete_scene_style_reference(request: Request, styleId: str) -> Response:
    try:
        store_for_request(request).delete_scene_style_reference(styleId)
    except SCENE_PACKAGE_ROUTE_ERRORS as exc:
        raise _library_http_exception(exc) from exc
    return Response(status_code=204)


@library_router.get("/scene-style-references/{styleId}/image")
def get_scene_style_image(request: Request, styleId: str) -> FileResponse:
    try:
        path, asset = store_for_request(request).read_scene_style_image(styleId)
    except SCENE_PACKAGE_ROUTE_ERRORS as exc:
        raise _library_http_exception(exc) from exc
    return FileResponse(path, media_type=asset.media_type, filename=asset.original_filename)


def _optional_upload_file(value: object) -> UploadFile | None:
    if value is None:
        return None
    return require_upload_file(value)


def _library_http_exception(exc: Exception) -> HTTPException:
    if isinstance(exc, LibraryItemInUseError):
        return HTTPException(
            status_code=409,
            detail={
                "code": "library_item_in_use",
                "referencedChapterCount": exc.referenced_chapter_count,
            },
        )
    return scene_package_http_exception(exc)
