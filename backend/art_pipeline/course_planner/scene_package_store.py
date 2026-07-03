from __future__ import annotations

from pathlib import Path
from typing import Sequence

from art_pipeline.course_planner.scene_package_errors import (
    ScenePackageValidationError,
    UnknownEmptySceneImageError,
)
from art_pipeline.course_planner.scene_package_media import (
    validate_scene_package_media_storage_path,
)
from art_pipeline.course_planner.scene_package_media_store import (
    CoursePlannerScenePackageMediaStoreMixin,
)
from art_pipeline.course_planner.scene_package_models import (
    AvoidObjectItem,
    ChapterSceneAssembly,
    ChapterSceneAssemblyManifest,
    ChapterScenePackage,
    ChapterScenePrompt,
    CompleteSceneImage,
    EmptySceneImage,
    PromptReadinessConfirmation,
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
        scene_spatial_contract: str | None = None,
        target_objects: list[dict[str, str]] | None = None,
        avoid_objects: list[dict[str, str]] | None = None,
        prompt_confirmations: dict[str, object] | None = None,
    ) -> ChapterScenePackage:
        current = self.read_chapter_scene_package(chapter_id)
        prompt = ChapterScenePrompt(
            prompt_text=prompt_text,
            scene_spatial_contract=(
                current.prompt.scene_spatial_contract
                if scene_spatial_contract is None
                else scene_spatial_contract
            ),
            updated_at=utc_now(),
        )
        normalized_targets = (
            current.target_objects
            if target_objects is None
            else self._normalize_target_objects(target_objects)
        )
        normalized_avoid_objects = (
            current.avoid_objects
            if avoid_objects is None
            else self._normalize_avoid_objects(avoid_objects)
        )
        normalized_confirmations = (
            current.prompt_confirmations
            if prompt_confirmations is None
            else PromptReadinessConfirmation.model_validate(prompt_confirmations)
        )
        # WHY: Task 6 的库路由/校验未落地前，prompt PATCH 只能更新文字与 readiness；
        # reference_selections 必须继续由已验证的数据源写入，避免默认快照阶段拿到裸 id 后失真。
        return self.write_chapter_scene_package(
            current.model_copy(
                update={
                    "prompt": prompt,
                    "target_objects": normalized_targets,
                    "avoid_objects": normalized_avoid_objects,
                    "prompt_confirmations": normalized_confirmations,
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

    def select_empty_scene_image(
        self,
        chapter_id: str,
        image_id: str,
    ) -> ChapterScenePackage:
        current, _ = self._load_scene_package_for_write(chapter_id)
        image = next(
            (
                candidate
                for candidate in current.empty_scene_images
                if candidate.id == image_id and candidate.status == "available"
            ),
            None,
        )
        if image is None:
            raise UnknownEmptySceneImageError(
                f"Unknown empty scene image id: {image_id}"
            )
        replacing_canvas = (
            current.current_empty_scene_image_id is not None
            and current.current_empty_scene_image_id != image_id
            and bool(current.assembly.placements)
        )
        next_assembly = current.assembly.model_copy(
            update={
                "empty_scene_image_id": image.id,
                "empty_scene_size": {"width": image.width, "height": image.height},
                "placements": [] if replacing_canvas else current.assembly.placements,
                "groups": [] if replacing_canvas else current.assembly.groups,
                "layer_order": [] if replacing_canvas else current.assembly.layer_order,
                "updated_at": utc_now(),
            }
        )
        updated_complete_images = (
            self._historicalize_complete_images_for_replaced_empty_scene(
                current.complete_images,
                replaced_empty_scene_image_id=current.current_empty_scene_image_id,
            )
            if replacing_canvas
            else current.complete_images
        )
        return self.write_chapter_scene_package(
            current.model_copy(
                update={
                    "current_empty_scene_image_id": image.id,
                    "assembly": next_assembly,
                    "complete_images": updated_complete_images,
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

    def _normalize_avoid_objects(
        self,
        avoid_objects: list[dict[str, str]],
    ) -> list[AvoidObjectItem]:
        return [
            AvoidObjectItem.model_validate(
                {
                    "id": target.get("id") or f"avoid_object_{index:03d}",
                    "label": target["label"],
                    "description": target.get("description", ""),
                }
            )
            for index, target in enumerate(avoid_objects, start=1)
        ]

    def _historicalize_complete_images_for_replaced_empty_scene(
        self,
        complete_images: Sequence[CompleteSceneImage],
        *,
        replaced_empty_scene_image_id: str | None,
    ) -> list[CompleteSceneImage]:
        if replaced_empty_scene_image_id is None:
            return list(complete_images)
        return [
            complete.model_copy(update={"status": "historical"})
            if complete.empty_scene_image_id == replaced_empty_scene_image_id
            and complete.status == "active"
            else complete
            for complete in complete_images
        ]


def _validate_scene_package_assembly(package: ChapterScenePackage) -> None:
    errors = validate_assembly_manifest(package)
    if not errors:
        return
    raise ScenePackageValidationError(
        "Invalid assembly manifest: " + "; ".join(errors)
    )
