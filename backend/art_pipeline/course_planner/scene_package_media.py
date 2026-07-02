from __future__ import annotations

from io import BytesIO
from pathlib import Path, PurePosixPath
from typing import Protocol, Sequence

from PIL import Image, UnidentifiedImageError

from art_pipeline.course_planner.scene_package_errors import (
    ScenePackageChildNotFoundError,
    ScenePackageValidationError,
)
from art_pipeline.course_planner.scene_package_models import ChapterScenePackage


class ScenePackageMediaRecord(Protocol):
    id: str
    storage_path: str
    media_type: str


def find_scene_package_media(
    package: ChapterScenePackage,
    kind: str,
    media_id: str,
) -> ScenePackageMediaRecord:
    kind_to_records: dict[str, Sequence[ScenePackageMediaRecord]] = {
        "references": package.references,
        "base_candidates": package.base_candidates,
        "complete_images": package.complete_images,
        "chapter_assets": package.chapter_assets,
        "assets": package.chapter_assets,
    }
    records = kind_to_records.get(kind)
    if records is None:
        raise ScenePackageValidationError(f"Unknown scene package media kind: {kind}")
    for record in records:
        if record.id == media_id:
            return record
    raise ScenePackageChildNotFoundError(
        f"Scene package media {kind}/{media_id} was not found."
    )


def next_scene_package_media_slot(
    records: Sequence[ScenePackageMediaRecord],
    *,
    kind: str,
    prefix: str,
) -> tuple[str, str]:
    media_id = f"{prefix}_{len(records) + 1:03d}"
    return media_id, scene_package_storage_path(kind, media_id)


def scene_package_storage_path(kind: str, media_id: str) -> str:
    # WHY: original filename 只保留给审计/展示；磁盘路径必须由系统生成，
    # 才不会把用户文件名、空格或平台差异带进持久化协议。
    return PurePosixPath(kind, f"{media_id}.png").as_posix()


def read_scene_package_png_size(payload: bytes, label: str) -> tuple[int, int]:
    try:
        with Image.open(BytesIO(payload)) as image:
            image.load()
            if image.format != "PNG":
                raise ScenePackageValidationError(f"{label} must be a valid PNG.")
            return image.width, image.height
    except (UnidentifiedImageError, OSError) as exc:
        raise ScenePackageValidationError(f"{label} must be a valid PNG.") from exc


def validate_scene_package_png_bytes(payload: bytes, label: str) -> None:
    read_scene_package_png_size(payload, label)


def validate_scene_package_media_storage_path(
    root_path: Path,
    storage_path: str,
) -> Path:
    if not storage_path:
        raise _invalid_storage_path()
    if "\\" in storage_path:
        raise _invalid_storage_path()
    relative_path = PurePosixPath(storage_path)
    if relative_path.is_absolute():
        raise _invalid_storage_path()
    if any(part in ("", ".", "..") for part in relative_path.parts):
        raise _invalid_storage_path()
    candidate_path = root_path.joinpath(*relative_path.parts)
    root_resolved = root_path.resolve()
    candidate_resolved = candidate_path.resolve()
    try:
        candidate_resolved.relative_to(root_resolved)
    except ValueError as exc:
        raise _invalid_storage_path() from exc
    return candidate_path


def sanitize_original_filename(original_filename: str) -> str:
    normalized = original_filename.replace("\\", "/")
    filename = PurePosixPath(normalized).name
    # WHY: original_filename 只用于展示上传元数据；这里收窄为纯文件名，
    # 避免调用方把本机绝对路径或目录结构误存进业务记录。
    return filename or original_filename


def _invalid_storage_path() -> ScenePackageValidationError:
    return ScenePackageValidationError(
        "Scene package media storage_path must be a package-relative POSIX path."
    )
