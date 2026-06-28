from __future__ import annotations

import json
import os
import shutil
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from PIL import Image, UnidentifiedImageError

from art_pipeline.course_planner.models import Chapter, ImageAttempt, PromptVersion, ScenePack
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


@dataclass(frozen=True)
class ImageAttemptLineage:
    scene_pack: ScenePack
    chapter: Chapter
    prompt_version: PromptVersion
    image_attempt: ImageAttempt


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


def import_image_attempt_to_pipeline(
    *,
    planner_store: CoursePlannerStore,
    workspace_root: Path,
    image_attempt_id: str,
) -> CoursePlannerImportResult:
    lineage = _image_attempt_lineage(planner_store, image_attempt_id)
    source_image_path = _image_attempt_source_path(
        planner_store,
        lineage.image_attempt.uploaded_image_id,
    )
    return _create_workspace_run_from_png(
        workspace_root=workspace_root,
        source_image_path=source_image_path,
        source_filename=f"{lineage.image_attempt.id}.png",
        title=(
            f"{lineage.chapter.title} "
            f"{lineage.prompt_version.version_label} "
            f"{lineage.image_attempt.id}"
        ),
        detection_vocabulary=_object_plan_vocabulary(lineage.prompt_version),
        scene_context=_image_attempt_context(
            planner_store=planner_store,
            lineage=lineage,
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


def _image_attempt_lineage(
    planner_store: CoursePlannerStore,
    image_attempt_id: str,
) -> ImageAttemptLineage:
    attempt = planner_store.get_image_attempt(image_attempt_id)
    version = planner_store.get_prompt_version(attempt.prompt_version_id)
    if attempt.id not in version.image_attempt_ids:
        raise ValueError("Image attempt does not have recoverable lineage.")

    # WHY: import 层只依赖公开层级 API 扫描 ScenePack/Chapter，避免把私有路径布局
    # 变成第二套事实源；代价是本地文件存储下做一次小范围遍历。
    for scene_pack in planner_store.list_scene_packs():
        for chapter in planner_store.list_chapters(scene_pack.id):
            if chapter.id == version.chapter_id:
                return ImageAttemptLineage(
                    scene_pack=scene_pack,
                    chapter=chapter,
                    prompt_version=version,
                    image_attempt=attempt,
                )
    raise ValueError("Image attempt does not have recoverable lineage.")


def _image_attempt_source_path(
    planner_store: CoursePlannerStore,
    uploaded_image_id: str,
) -> Path:
    candidate = planner_store.scene_library_root.joinpath(uploaded_image_id).resolve()
    try:
        candidate.relative_to(planner_store.scene_library_root)
    except ValueError as exc:
        raise ValueError("Image attempt source path must stay inside scene_library.") from exc
    if not candidate.exists():
        raise ValueError("Image attempt source image was not found.")
    return candidate


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


def _image_attempt_context(
    *,
    planner_store: CoursePlannerStore,
    lineage: ImageAttemptLineage,
    image_path: Path,
) -> dict[str, object]:
    return {
        "source": "course_planner",
        "source_type": "course_planner_image_attempt",
        "scene_pack_id": lineage.scene_pack.id,
        "chapter_id": lineage.chapter.id,
        "prompt_version_id": lineage.prompt_version.id,
        "image_attempt_id": lineage.image_attempt.id,
        "uploaded_image_id": lineage.image_attempt.uploaded_image_id,
        "image_path": _scene_library_relative_path(planner_store, image_path),
        "prompt_package": lineage.prompt_version.prompt_package.model_dump(mode="json"),
        "status_update": {
            "attempt_status": lineage.image_attempt.status,
            "imported_update_supported": False,
        },
    }


def _object_plan_vocabulary(version: PromptVersion) -> list[str]:
    objects = [
        *version.object_plan.core_objects,
        *version.object_plan.required_objects,
        *version.object_plan.recommended_objects,
    ]
    return [planned_object.name for planned_object in objects]


def _scene_library_relative_path(planner_store: CoursePlannerStore, path: Path) -> str:
    return path.resolve().relative_to(planner_store.scene_library_root).as_posix()


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_name(f"{path.name}.{uuid4().hex}.tmp")
    # WHY: scene_context 是 Course Planner 到 pipeline 的审计边界；
    # 原子替换能避免导入中断留下不可解析上下文。
    temp_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    os.replace(temp_path, path)
