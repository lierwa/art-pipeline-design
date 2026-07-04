from __future__ import annotations

import json
import os
import shutil
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from art_pipeline.course_planner.scene_package_errors import (
    ScenePackagePreconditionError,
    UnknownCompleteSceneImageError,
)
from art_pipeline.course_planner.scene_package_media import read_scene_package_png_size
from art_pipeline.course_planner.scene_package_models import ChapterScenePackage
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


def import_final_chapter_scene_to_pipeline(
    *,
    planner_store: CoursePlannerStore,
    workspace_root: Path,
    chapter_id: str,
) -> CoursePlannerImportResult:
    package = planner_store.read_chapter_scene_package(chapter_id)
    final_scene = package.final_scene
    if final_scene is None:
        raise ScenePackagePreconditionError(
            "Final chapter scene must be locked before importing to pipeline."
        )

    source_image_path, _ = planner_store.read_chapter_scene_package_media(
        chapter_id,
        "final_scene",
        final_scene.id,
    )
    detection_vocabulary = _target_object_labels(package)
    return _create_workspace_run_from_png(
        workspace_root=workspace_root,
        source_image_path=source_image_path,
        source_filename=f"{chapter_id}_{final_scene.id}.png",
        title=f"{chapter_id} {final_scene.id}",
        detection_vocabulary=detection_vocabulary,
        scene_context={
            "source": "course_planner",
            "chapter_id": chapter_id,
            "final_scene_id": final_scene.id,
            "final_scene_storage_path": final_scene.storage_path,
            # WHY: import 产物必须绑定锁定 Final Scene 当时选中的 empty scene，
            # 不能回读 chapter 当前选择，否则后续替换画布后会把旧 run 误指向新事实源。
            "selected_empty_scene_image_id": final_scene.empty_scene_image_id,
            "target_object_labels": detection_vocabulary,
        },
        png_label="Final chapter scene image",
    )


def import_complete_scene_image_to_pipeline(
    *,
    planner_store: CoursePlannerStore,
    workspace_root: Path,
    chapter_id: str,
    complete_image_id: str,
) -> CoursePlannerImportResult:
    package = planner_store.read_chapter_scene_package(chapter_id)
    complete_image = next(
        (image for image in package.complete_images if image.id == complete_image_id),
        None,
    )
    if complete_image is None:
        raise UnknownCompleteSceneImageError(
            f"Unknown complete scene image id: {complete_image_id}"
        )
    if complete_image.status == "deleted":
        raise ScenePackagePreconditionError(
            f"Complete scene image {complete_image_id} has been deleted."
        )

    source_image_path, _ = planner_store.read_chapter_scene_package_media(
        chapter_id,
        "complete_images",
        complete_image.id,
    )
    detection_vocabulary = _target_object_labels(package)
    return _create_workspace_run_from_png(
        workspace_root=workspace_root,
        source_image_path=source_image_path,
        source_filename=f"{chapter_id}_{complete_image.id}.png",
        title=f"{chapter_id} {complete_image.id}",
        detection_vocabulary=detection_vocabulary,
        scene_context={
            "source": "course_planner",
            "chapter_id": chapter_id,
            "complete_scene_image_id": complete_image.id,
            "complete_scene_storage_path": complete_image.storage_path,
            # WHY: complete image 导入必须绑定它生成时的 empty scene 快照；
            # 不能读取 chapter 当前选择，否则替换画布后旧图会被误关联到新画布。
            "selected_empty_scene_image_id": complete_image.empty_scene_image_id,
            "target_object_labels": detection_vocabulary,
        },
        png_label="Complete scene image",
    )


def _create_workspace_run_from_png(
    *,
    workspace_root: Path,
    source_image_path: Path,
    source_filename: str,
    title: str,
    detection_vocabulary: list[str],
    scene_context: dict[str, object],
    png_label: str,
) -> CoursePlannerImportResult:
    width, height = _read_png_size(source_image_path, png_label)

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


def _read_png_size(path: Path, label: str) -> tuple[int, int]:
    return read_scene_package_png_size(path.read_bytes(), label)


def _target_object_labels(package: ChapterScenePackage) -> list[str]:
    labels: list[str] = []
    for item in package.target_objects:
        if item.label not in labels:
            labels.append(item.label)
    return labels


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_name(f"{path.name}.{uuid4().hex}.tmp")
    # WHY: scene_context.json 会被导入索引与故障排查同时读取；先写临时文件再 replace，
    # 可以避免中断时留下半份上下文，代价只是一次额外 rename。
    temp_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    os.replace(temp_path, path)
