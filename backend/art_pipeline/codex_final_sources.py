from __future__ import annotations

import os
import shutil
from pathlib import Path

from PIL import Image

from art_pipeline.exporting.files import resolve_workspace_path


def materialize_codex_selected_source(
    workspace_root: Path,
    selected_source_path: Path,
    raw_output_path: Path,
    request_started_ns: int | None = None,
) -> None:
    selected_source = _resolve_selected_source_path(workspace_root, selected_source_path)
    raw_output = raw_output_path.resolve()
    if selected_source == raw_output:
        if request_started_ns is None:
            if not raw_output.exists():
                raise RuntimeError("Codex CLI did not create codex_raw.png.")
            return
        _ensure_fresh_job_output(raw_output, request_started_ns, "codex_raw.png")
        return
    _validate_generated_source_root(selected_source)
    if not selected_source.exists():
        raise RuntimeError("Selected Codex source image does not exist.")
    # WHY: Task 5 会从持久化 manifest 摄入 selectedSourcePath；除 job 自身 rawOutputPath
    # 以外，只信任 Codex 生成目录，避免把任意 workspace 文件伪装成最终 raw source。
    raw_output.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(selected_source, raw_output)


def default_codex_generated_images_root() -> Path:
    generated_images_root = os.getenv("CODEX_GENERATED_IMAGES_ROOT", "").strip()
    if generated_images_root:
        return Path(generated_images_root).expanduser().resolve()
    codex_home = os.getenv("CODEX_HOME", "").strip()
    base = Path(codex_home).expanduser() if codex_home else Path.home() / ".codex"
    return (base / "generated_images").resolve()


def copy_codex_source_crop(source_file: Path, target_file: Path) -> None:
    with Image.open(source_file) as image:
        image.load()
        rgba = image.convert("RGBA")
    target_file.parent.mkdir(parents=True, exist_ok=True)
    rgba.save(target_file, format="PNG")


def _resolve_selected_source_path(workspace_root: Path, selected_source_path: Path) -> Path:
    selected_source = Path(selected_source_path)
    if selected_source.is_absolute():
        return selected_source.resolve()
    return resolve_workspace_path(workspace_root, selected_source.as_posix()).resolve()


def _validate_generated_source_root(selected_source: Path) -> None:
    if _is_relative_to(selected_source, default_codex_generated_images_root()):
        return
    raise RuntimeError("Selected Codex source image is outside allowed Codex source roots.")


def _ensure_fresh_job_output(output_file: Path, request_started_ns: int, filename: str) -> None:
    if not output_file.exists():
        raise RuntimeError(f"Codex CLI did not create {filename}.")
    if output_file.stat().st_mtime_ns < request_started_ns:
        raise RuntimeError(f"Codex CLI returned a stale {filename}.")


def _is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
    except ValueError:
        return False
    return True
