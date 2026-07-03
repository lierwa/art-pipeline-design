from __future__ import annotations

import json
import shutil
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, UnidentifiedImageError

from art_pipeline.course_planner.store import CoursePlannerStore
from art_pipeline.elements import SourceMetadata, WorkspaceState
from art_pipeline.workspace.store import (
    WorkspaceRunSummary,
    derive_run_status,
    next_run_id,
    run_root,
    upsert_run,
    utc_now,
    write_state,
)
from art_pipeline.workspace.workflow import initialize_upload_workflow


@dataclass(frozen=True)
class CoursePlannerImportResult:
    run: WorkspaceRunSummary


def import_locked_scene_version_to_pipeline(
    *,
    planner_store: CoursePlannerStore,
    workspace_root: Path,
    course_id: str,
    space_id: str,
    chapter_id: str,
    version_id: str,
) -> CoursePlannerImportResult:
    version = planner_store.read_scene_version(course_id, space_id, chapter_id, version_id)
    if version.status != "locked":
        raise ValueError("Scene version must be locked before importing to pipeline.")

    keywords = planner_store.read_scene_keywords(course_id, space_id, chapter_id)
    source_image_path = planner_store.scene_version_image_path(
        course_id,
        space_id,
        chapter_id,
        version,
    )
    return _create_workspace_run_from_png(
        workspace_root=workspace_root,
        source_image_path=source_image_path,
        source_filename=f"{course_id}_{space_id}_{chapter_id}_{version.id}.png",
        title=f"{chapter_id} {version.id}",
        detection_vocabulary=keywords.keywords,
        scene_context=_scene_version_context(
            planner_store=planner_store,
            course_id=course_id,
            space_id=space_id,
            chapter_id=chapter_id,
            version_id=version.id,
            keywords=keywords.keywords,
            image_path=source_image_path,
        ),
    )


def _create_workspace_run_from_png(
    *,
    workspace_root: Path,
    source_image_path: Path,
    source_filename: str,
    title: str,
    detection_vocabulary: list[str],
    scene_context: dict[str, object],
) -> CoursePlannerImportResult:
    width, height = _load_png_size(source_image_path)

    workspace_root = Path(workspace_root).resolve()
    next_id = next_run_id(workspace_root, source_filename)
    target_run_root = run_root(workspace_root, next_id)
    target_run_root.mkdir(parents=True, exist_ok=False)

    try:
        target_source_path = target_run_root / "source" / "original.png"
        target_source_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source_image_path, target_source_path)

        state = WorkspaceState(
            source=SourceMetadata(
                filename="original.png",
                path="source/original.png",
                width=width,
                height=height,
            ),
            elements=[],
            detectionVocabulary=detection_vocabulary,
        )
        write_state(target_run_root, state)
        initialize_upload_workflow(target_run_root, state)
        _write_json(target_run_root / "scene_context.json", scene_context)

        now = utc_now()
        run = WorkspaceRunSummary(
            id=next_id,
            title=title,
            sourceFilename=source_filename,
            createdAt=now,
            updatedAt=now,
            status=derive_run_status(target_run_root, state),
            elementCount=0,
        )
        upsert_run(workspace_root, run)
        return CoursePlannerImportResult(run=run)
    except Exception:
        # WHY: run index 只记录完整导入；若中途失败，保留未索引 run 会让后续
        # 排障误把半成品当可恢复记录。只删除本次创建的 run_root，避免误伤旧 run。
        if target_run_root.exists():
            shutil.rmtree(target_run_root)
        raise


def _load_png_size(path: Path) -> tuple[int, int]:
    try:
        with Image.open(path) as image:
            image.load()
            if image.format != "PNG":
                raise ValueError("Scene version image must be a PNG.")
            return image.width, image.height
    except UnidentifiedImageError as exc:
        raise ValueError("Scene version image must be a valid PNG.") from exc


def _scene_version_context(
    *,
    planner_store: CoursePlannerStore,
    course_id: str,
    space_id: str,
    chapter_id: str,
    version_id: str,
    keywords: list[str],
    image_path: Path,
) -> dict[str, object]:
    version_json_path = planner_store.scene_version_json_path(
        course_id,
        space_id,
        chapter_id,
        version_id,
    )
    return {
        "source": "course_planner",
        "course_id": course_id,
        "space_id": space_id,
        "chapter_id": chapter_id,
        "scene_version_id": version_id,
        "scene_version_path": _scene_library_relative_path(planner_store, version_json_path),
        "image_path": _scene_library_relative_path(planner_store, image_path),
        "keywords": keywords,
    }


def _scene_library_relative_path(
    planner_store: CoursePlannerStore,
    path: Path,
) -> str:
    return path.resolve().relative_to(planner_store.scene_library_root).as_posix()


def _write_json(path: Path, payload: object) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
