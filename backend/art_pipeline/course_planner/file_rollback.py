from __future__ import annotations

import os
from collections.abc import Callable
from pathlib import Path
from uuid import uuid4

from pydantic import BaseModel


def snapshot_files(paths: list[Path]) -> dict[Path, bytes | None]:
    return {path: path.read_bytes() if path.exists() else None for path in paths}


def restore_files(snapshots: dict[Path, bytes | None]) -> None:
    for path, payload in snapshots.items():
        if payload is None:
            if path.exists():
                path.unlink()
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = path.with_name(f"{path.name}.{uuid4().hex}.tmp")
        temp_path.write_bytes(payload)
        os.replace(temp_path, path)


def write_models_with_rollback(
    items: list[tuple[Path, BaseModel]],
    write_model: Callable[[Path, BaseModel], None],
) -> None:
    snapshots = snapshot_files([path for path, _ in items])
    try:
        for path, model in items:
            write_model(path, model)
    except Exception:
        restore_files(snapshots)
        raise
