from __future__ import annotations

from pathlib import Path, PurePosixPath
from typing import Callable, TypeVar

StoragePathError = TypeVar("StoragePathError", bound=Exception)


def validate_relative_media_storage_path_value(
    storage_path: str,
    *,
    error_factory: Callable[[], StoragePathError],
) -> str:
    _validate_relative_media_storage_path(
        storage_path,
        error_factory=error_factory,
    )
    return storage_path


def resolve_relative_media_storage_path(
    root_path: Path,
    storage_path: str,
    *,
    error_factory: Callable[[], StoragePathError],
) -> Path:
    relative_path = _validate_relative_media_storage_path(
        storage_path,
        error_factory=error_factory,
    )
    candidate_path = root_path.joinpath(*relative_path.parts)
    root_resolved = root_path.resolve()
    candidate_resolved = candidate_path.resolve()
    try:
        candidate_resolved.relative_to(root_resolved)
    except ValueError as exc:
        raise error_factory() from exc
    return candidate_path


def _validate_relative_media_storage_path(
    storage_path: str,
    *,
    error_factory: Callable[[], StoragePathError],
) -> PurePosixPath:
    if not storage_path or "\\" in storage_path:
        raise error_factory()
    relative_path = PurePosixPath(storage_path)
    if relative_path.is_absolute():
        raise error_factory()
    if any(part in ("", ".", "..") for part in relative_path.parts):
        raise error_factory()
    return relative_path
