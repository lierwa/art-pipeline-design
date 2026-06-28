from __future__ import annotations

from io import BytesIO
from pathlib import Path

from PIL import Image, UnidentifiedImageError


def normalized_upload_png_bytes(payload: bytes) -> bytes:
    try:
        with Image.open(BytesIO(payload)) as image:
            image.load()
            output = BytesIO()
            # WHY: pipeline import currently accepts PNG only; normalizing at upload
            # keeps JPEG/WebP UI support without forcing import to branch by format.
            image.convert("RGBA").save(output, format="PNG")
            return output.getvalue()
    except UnidentifiedImageError as exc:
        raise ValueError("Uploaded image must be a valid image file.") from exc


def resolve_course_planner_upload_path(
    scene_library_root: Path,
    asset_path: str,
) -> Path:
    root = Path(scene_library_root).resolve()
    upload_root = root.joinpath("uploads", "course_planner").resolve()
    candidate = root.joinpath(asset_path).resolve()
    # WHY: uploadedImageId 是可导入相对路径，但 HTTP 读取只能暴露 Course
    # Planner 上传区；限制在 upload_root 下，避免把 scene_library 变成任意文件服务。
    try:
        candidate.relative_to(upload_root)
    except ValueError as exc:
        raise ValueError("Upload asset path must stay inside Course Planner uploads.") from exc
    if not candidate.is_file():
        raise FileNotFoundError(asset_path)
    return candidate
