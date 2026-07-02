from __future__ import annotations

from pathlib import Path
from typing import Sequence

from art_pipeline.course_planner.scene_package_errors import (
    ScenePackageValidationError,
    UnknownBaseCandidateError,
)
from art_pipeline.course_planner.scene_package_media import (
    validate_scene_package_media_storage_path,
)
from art_pipeline.course_planner.scene_package_media_store import (
    CoursePlannerScenePackageMediaStoreMixin,
)
from art_pipeline.course_planner.scene_package_models import (
    ChapterSceneAssembly,
    ChapterSceneAssemblyManifest,
    ChapterScenePackage,
    ChapterScenePrompt,
    CompleteSceneImage,
    EmptyBaseSceneCandidate,
    TargetObjectItem,
    validate_assembly_manifest,
)
from art_pipeline.course_planner.store_common import require_match, validate_slug
from art_pipeline.workspace.store import utc_now


class CoursePlannerScenePackageStoreMixin(CoursePlannerScenePackageMediaStoreMixin):
    def read_chapter_scene_package(self, chapter_id: str) -> ChapterScenePackage:
        chapter, scene_pack_id = self._find_chapter(chapter_id)
        path = self._scene_package_json_path(scene_pack_id, chapter.id)
        if not path.exists():
            package = ChapterScenePackage(chapter_id=chapter.id)
            # WHY: Scene Package 是每个 Chapter 天然拥有的子资源；首次读取就落盘，
            # 能提前稳定后续上传目录，同时不把 Chapter 创建阶段绑上媒体初始化副作用。
            return self.write_chapter_scene_package(package)
        package = self._read_model(path, ChapterScenePackage)
        require_match(package.chapter_id, chapter.id, "Scene package chapter_id")
        return package

    def update_chapter_scene_prompt(
        self,
        chapter_id: str,
        *,
        prompt_text: str,
        negative_constraints: str | None = None,
        style_notes: str | None = None,
        target_objects: list[dict[str, str]] | None = None,
    ) -> ChapterScenePackage:
        current = self.read_chapter_scene_package(chapter_id)
        prompt = ChapterScenePrompt(
            prompt_text=prompt_text,
            negative_constraints=(
                current.prompt.negative_constraints
                if negative_constraints is None
                else negative_constraints
            ),
            style_notes=(
                current.prompt.style_notes if style_notes is None else style_notes
            ),
            updated_at=utc_now(),
        )
        normalized_targets = (
            current.target_objects
            if target_objects is None
            else self._normalize_target_objects(target_objects)
        )
        return self.write_chapter_scene_package(
            current.model_copy(
                update={
                    "prompt": prompt,
                    "target_objects": normalized_targets,
                }
            )
        )

    def write_chapter_scene_package(
        self,
        package: ChapterScenePackage,
    ) -> ChapterScenePackage:
        chapter, scene_pack_id = self._find_chapter(package.chapter_id)
        require_match(package.chapter_id, chapter.id, "Scene package chapter_id")
        validated = ChapterScenePackage.model_validate(package.model_dump(mode="json"))
        _validate_scene_package_assembly(validated)
        self._write_model(
            self._scene_package_json_path(scene_pack_id, chapter.id),
            validated,
        )
        self._write_model(
            self._scene_package_assembly_path(scene_pack_id, chapter.id),
            validated.assembly,
        )
        return validated

    def save_chapter_scene_assembly(
        self,
        chapter_id: str,
        manifest: ChapterSceneAssemblyManifest,
    ) -> ChapterScenePackage:
        current, _ = self._load_scene_package_for_write(chapter_id)
        normalized_manifest = ChapterSceneAssembly.model_validate(
            manifest.model_dump(mode="json")
        ).model_copy(update={"updated_at": utc_now()})
        return self.write_chapter_scene_package(
            current.model_copy(update={"assembly": normalized_manifest})
        )

    def lock_empty_base_scene(
        self,
        chapter_id: str,
        candidate_id: str,
    ) -> ChapterScenePackage:
        current, _ = self._load_scene_package_for_write(chapter_id)
        target_candidate = next(
            (candidate for candidate in current.base_candidates if candidate.id == candidate_id),
            None,
        )
        if target_candidate is None:
            raise UnknownBaseCandidateError(f"Unknown base candidate id: {candidate_id}")

        now = utc_now()
        previous_locked_candidate_id = current.locked_base_candidate_id
        is_replacement = (
            previous_locked_candidate_id is not None
            and previous_locked_candidate_id != target_candidate.id
        )

        updated_candidates = [
            self._updated_base_candidate_status(
                candidate,
                target_candidate_id=target_candidate.id,
                previous_locked_candidate_id=previous_locked_candidate_id,
                locked_at=now,
            )
            for candidate in current.base_candidates
        ]
        updated_complete_images = (
            self._historicalize_complete_images_for_replaced_base(
                current.complete_images,
                replaced_base_candidate_id=previous_locked_candidate_id,
            )
            if is_replacement
            else current.complete_images
        )
        updated_assembly = self._assembly_for_locked_base(
            current.assembly,
            target_candidate=target_candidate,
            clear_authoring_state=is_replacement,
        )
        return self.write_chapter_scene_package(
            current.model_copy(
                update={
                    "locked_base_candidate_id": target_candidate.id,
                    "base_candidates": updated_candidates,
                    "complete_images": updated_complete_images,
                    "assembly": updated_assembly,
                }
            )
        )

    def _scene_package_root_path(self, scene_pack_id: str, chapter_id: str) -> Path:
        return self._resolve(
            "scene_packs",
            validate_slug(scene_pack_id, "Scene pack id"),
            "chapters",
            validate_slug(chapter_id, "Chapter id"),
            "scene_package",
        )

    def _scene_package_json_path(self, scene_pack_id: str, chapter_id: str) -> Path:
        return self._scene_package_root_path(scene_pack_id, chapter_id) / "package.json"

    def _scene_package_assembly_path(self, scene_pack_id: str, chapter_id: str) -> Path:
        return self._scene_package_root_path(scene_pack_id, chapter_id) / "assembly.json"

    def _scene_package_media_dir(
        self,
        scene_pack_id: str,
        chapter_id: str,
        kind: str,
    ) -> Path:
        return self._scene_package_root_path(scene_pack_id, chapter_id) / validate_slug(
            kind,
            "Scene package media kind",
        )

    def _scene_package_media_path(
        self,
        scene_pack_id: str,
        chapter_id: str,
        storage_path: str,
    ) -> Path:
        root_path = self._scene_package_root_path(scene_pack_id, chapter_id)
        return validate_scene_package_media_storage_path(
            root_path,
            storage_path,
        )

    def _load_scene_package_for_write(
        self,
        chapter_id: str,
    ) -> tuple[ChapterScenePackage, str]:
        chapter, scene_pack_id = self._find_chapter(chapter_id)
        package = self.read_chapter_scene_package(chapter.id)
        return package, scene_pack_id

    def _normalize_target_objects(
        self,
        target_objects: list[dict[str, str]],
    ) -> list[TargetObjectItem]:
        return [
            TargetObjectItem.model_validate(
                {
                    "id": target.get("id") or f"target_object_{index:03d}",
                    "label": target["label"],
                    # WHY: scene package 的 target object 协议以 description/priority
                    # 为单一事实源；这里直接落盘最终合同字段，避免 API 层和存储层
                    # 各自再维护一套 notes 兼容语义。
                    "description": target.get("description", ""),
                    "priority": target.get("priority", "required"),
                }
            )
            for index, target in enumerate(target_objects, start=1)
        ]

    def _updated_base_candidate_status(
        self,
        candidate: EmptyBaseSceneCandidate,
        *,
        target_candidate_id: str,
        previous_locked_candidate_id: str | None,
        locked_at: str,
    ) -> EmptyBaseSceneCandidate:
        if candidate.id == target_candidate_id:
            return candidate.model_copy(
                update={
                    "status": "locked",
                    "locked_at": locked_at,
                }
            )
        if previous_locked_candidate_id and candidate.id == previous_locked_candidate_id:
            return candidate.model_copy(
                update={
                    "status": "inactive",
                }
            )
        return candidate

    def _historicalize_complete_images_for_replaced_base(
        self,
        complete_images: Sequence[CompleteSceneImage],
        *,
        replaced_base_candidate_id: str | None,
    ) -> list[CompleteSceneImage]:
        if replaced_base_candidate_id is None:
            return list(complete_images)
        return [
            complete.model_copy(update={"status": "historical"})
            if complete.base_candidate_id == replaced_base_candidate_id
            and complete.status == "active"
            else complete
            for complete in complete_images
        ]

    def _assembly_for_locked_base(
        self,
        assembly: ChapterSceneAssembly,
        *,
        target_candidate: EmptyBaseSceneCandidate,
        clear_authoring_state: bool,
    ) -> ChapterSceneAssembly:
        if clear_authoring_state:
            # WHY: 替换 base 会直接改变后续摆放的空间坐标契约；旧 placement/group/layer
            # 继续保留只会制造“看起来还在、实际上已失效”的假权威，所以这里必须整体清空。
            return assembly.model_copy(
                update={
                    "base_candidate_id": target_candidate.id,
                    "base_size": {
                        "width": target_candidate.width,
                        "height": target_candidate.height,
                    },
                    "placements": [],
                    "groups": [],
                    "layer_order": [],
                    "updated_at": utc_now(),
                }
            )
        return assembly.model_copy(
            update={
                "base_candidate_id": target_candidate.id,
                "base_size": {
                    "width": target_candidate.width,
                    "height": target_candidate.height,
                },
                "updated_at": utc_now(),
            }
        )


def _validate_scene_package_assembly(package: ChapterScenePackage) -> None:
    errors = validate_assembly_manifest(package)
    if not errors:
        return
    raise ScenePackageValidationError(
        "Invalid assembly manifest: " + "; ".join(errors)
    )
