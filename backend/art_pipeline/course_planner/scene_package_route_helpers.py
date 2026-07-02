from __future__ import annotations

from json import JSONDecodeError
from typing import TypeVar

from fastapi import HTTPException, Request
from pydantic import ValidationError
from starlette.datastructures import UploadFile

from art_pipeline.course_planner.scene_package_errors import (
    ScenePackageChildNotFoundError,
    ScenePackagePreconditionError,
    ScenePackageValidationError,
)
from art_pipeline.course_planner.store import CoursePlannerStore

ModelT = TypeVar("ModelT")
SCENE_PACKAGE_ROUTE_ERRORS = (
    FileNotFoundError,
    ScenePackagePreconditionError,
    ScenePackageValidationError,
)


def store_for_request(request: Request) -> CoursePlannerStore:
    return CoursePlannerStore(request.app.state.scene_library_root)


async def parse_json_model(request: Request, model_type: type[ModelT]) -> ModelT:
    body = await json_object_from_request(request)
    try:
        return model_type.model_validate(body)
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=exc.errors()) from exc


async def json_object_from_request(request: Request) -> dict[str, object]:
    raw_body = await request.body()
    if not raw_body:
        return {}
    try:
        payload = await request.json()
    except JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Request body must be valid JSON.") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Request body must be a JSON object.")
    return payload


def scene_package_payload(package) -> dict[str, object]:
    return {"scenePackage": package.model_dump(mode="json")}


def scene_package_http_exception(
    exc: Exception,
    *,
    child_not_found_detail: str = "Scene package child not found.",
) -> HTTPException:
    # WHY: scene-package route 的异常类型是存储层协议；HTTP 文案只在边界层投影，
    # 避免每个 handler 重新推导一套 400/404/409 语义。
    if isinstance(exc, ScenePackageChildNotFoundError):
        return HTTPException(status_code=404, detail=child_not_found_detail)
    if isinstance(exc, FileNotFoundError):
        return HTTPException(status_code=404, detail="Chapter not found.")
    if isinstance(exc, ScenePackagePreconditionError):
        return HTTPException(status_code=409, detail=str(exc))
    if isinstance(exc, ScenePackageValidationError):
        return HTTPException(status_code=400, detail=str(exc))
    return HTTPException(status_code=400, detail=str(exc))


def require_upload_file(value: object) -> UploadFile:
    if not isinstance(value, UploadFile):
        raise HTTPException(status_code=400, detail="file is required.")
    return value


def string_form_value(value: object, *, default: str) -> str:
    if value is None:
        return default
    if not isinstance(value, str):
        raise HTTPException(status_code=400, detail="Multipart fields must be strings.")
    return value


def required_string_form_value(value: object, field_name: str) -> str:
    normalized = string_form_value(value, default="")
    if not normalized:
        raise HTTPException(status_code=400, detail=f"{field_name} is required.")
    return normalized


def optional_string_form_value(value: object, field_name: str) -> str | None:
    if value is None:
        return None
    normalized = string_form_value(value, default="")
    if not normalized:
        raise HTTPException(status_code=400, detail=f"{field_name} must not be empty.")
    return normalized


def string_list_form_value(form, field_name: str) -> list[str]:
    values = form.getlist(field_name)
    if not values:
        return []
    if not all(isinstance(value, str) for value in values):
        raise HTTPException(status_code=400, detail=f"{field_name} must be a string list.")
    return list(values)


def literal_form_value(
    value: object,
    *,
    allowed: tuple[str, ...],
    default: str,
    field_name: str,
) -> str:
    normalized = string_form_value(value, default=default)
    if normalized not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"{field_name} must be one of: {', '.join(allowed)}.",
        )
    return normalized
