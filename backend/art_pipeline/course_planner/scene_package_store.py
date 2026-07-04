from __future__ import annotations

from pathlib import Path

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
    ChapterCastAssignment,
    ChapterReferenceSelection,
    ChapterSceneAssembly,
    ChapterSceneAssemblyManifest,
    ChapterScenePackage,
    ChapterScenePrompt,
    EmptySceneImage,
    PromptReadinessConfirmation,
    TargetObjectItem,
    validate_assembly_manifest,
    validate_assembly_manifest_structure,
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
            else self._normalize_target_objects(target_objects, current.target_objects)
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
        # WHY: prompt PATCH 只更新文字与 readiness；角色和参考图选择必须走库路由，
        # 这样 Chapter 的 cast/reference 事实不会和 prompt 文本编辑分叉成两套权威来源。
        return self.write_chapter_scene_package(
            current.model_copy(
                update={
                    "prompt": prompt,
                    "target_objects": normalized_targets,
                    "avoid_objects": normalized_avoid_objects,
                    "prompt_confirmations": normalized_confirmations,
                }
            ),
            validate_assembly=False,
        )

    def write_chapter_reference_selection(
        self,
        chapter_id: str,
        *,
        reference_image_id: str,
        prompt_role: str,
    ) -> ChapterScenePackage:
        current, _ = self._load_scene_package_for_write(chapter_id)
        self._require_reference_image_ids(
            [reference_image_id],
            singular_message=True,
        )
        existing = next(
            (
                selection
                for selection in current.reference_selections
                if selection.reference_image_id == reference_image_id
            ),
            None,
        )
        selection = ChapterReferenceSelection(
            id=(
                existing.id
                if existing is not None
                else _next_reference_selection_id(current)
            ),
            reference_image_id=reference_image_id,
            prompt_role=prompt_role,
        )
        updated_selections = (
            [
                selection
                if item.reference_image_id == reference_image_id
                else item
                for item in current.reference_selections
            ]
            if existing is not None
            else [*current.reference_selections, selection]
        )
        # WHY: reference_selections 是 Chapter 对库图片用途的唯一事实源；
        # prompt PATCH 不接收裸引用 id，避免文字编辑和库选择分叉出两套权威状态。
        return self.write_chapter_scene_package(
            current.model_copy(update={"reference_selections": updated_selections}),
            validate_assembly=False,
        )

    def write_chapter_cast_assignment(
        self,
        chapter_id: str,
        *,
        character_ip_id: str,
        role_label: str,
        action_intent: str,
        reference_image_ids: list[str] | None,
    ) -> ChapterScenePackage:
        current, _ = self._load_scene_package_for_write(chapter_id)
        character = self._require_character_ip(character_ip_id)
        resolved_reference_ids = (
            list(character.reference_image_ids)
            if reference_image_ids is None
            else list(reference_image_ids)
        )
        self._require_reference_image_ids(resolved_reference_ids)
        existing = next(
            (
                assignment
                for assignment in current.cast_assignments
                if assignment.character_ip_id == character_ip_id
                and assignment.role_label == role_label
            ),
            None,
        )
        assignment = ChapterCastAssignment(
            id=(
                existing.id
                if existing is not None
                else _next_cast_assignment_id(current)
            ),
            character_ip_id=character_ip_id,
            role_label=role_label,
            action_intent=action_intent,
            reference_image_ids=resolved_reference_ids,
        )
        updated_assignments = (
            [
                assignment
                if item.character_ip_id == character_ip_id
                and item.role_label == role_label
                else item
                for item in current.cast_assignments
            ]
            if existing is not None
            else [*current.cast_assignments, assignment]
        )
        return self.write_chapter_scene_package(
            current.model_copy(update={"cast_assignments": updated_assignments}),
            validate_assembly=False,
        )

    def write_chapter_scene_package(
        self,
        package: ChapterScenePackage,
        *,
        validate_assembly: bool = True,
    ) -> ChapterScenePackage:
        chapter, scene_pack_id = self._find_chapter(package.chapter_id)
        require_match(package.chapter_id, chapter.id, "Scene package chapter_id")
        validated = ChapterScenePackage.model_validate(package.model_dump(mode="json"))
        if validate_assembly:
            # WHY: 直接写入整包是维护/迁移边界，默认仍走 readiness gate；
            # autosave/WIP 的正常作者路径必须调用 save_chapter_scene_assembly 的 structure gate。
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
        _validate_scene_package_assembly_structure(
            current.model_copy(update={"assembly": normalized_manifest})
        )
        return self.write_chapter_scene_package(
            current.model_copy(update={"assembly": normalized_manifest}),
            validate_assembly=False,
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
        # WHY: 选择 current empty scene 只更新作者当前背景选择；
        # 已保存的 assembly manifest 必须保留上次显式保存的快照，直到作者重新审阅并 save。
        return self.write_chapter_scene_package(
            current.model_copy(
                update={
                    "current_empty_scene_image_id": image.id,
                }
            ),
            validate_assembly=False,
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
        current_target_objects: list[TargetObjectItem],
    ) -> list[TargetObjectItem]:
        existing_by_label = _unique_target_objects_by_label(current_target_objects)
        used_ids: set[str] = set()
        normalized: list[TargetObjectItem] = []
        for target in target_objects:
            label = target["label"]
            target_id = target.get("id") or existing_by_label.get(label)
            if not target_id:
                target_id = _next_target_object_id(current_target_objects, used_ids)
            if target_id in used_ids:
                raise ScenePackageValidationError(
                    f"Duplicate target object id in prompt update: {target_id}"
                )
            used_ids.add(target_id)
            normalized.append(
                TargetObjectItem.model_validate(
                    {
                        "id": target_id,
                        "label": label,
                        # WHY: target object id 必须稳定，asset.linked_target_object_id 才不会在
                        # 目标列表重排/插入后错绑；label 语义匹配是无显式 id 的兼容路径。
                        "description": target.get("description", ""),
                        "priority": target.get("priority", "required"),
                    }
                )
            )
        return normalized

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

def _validate_scene_package_assembly(package: ChapterScenePackage) -> None:
    errors = validate_assembly_manifest(package)
    if not errors:
        return
    raise ScenePackageValidationError(
        "Invalid assembly manifest: " + "; ".join(errors)
    )


def _validate_scene_package_assembly_structure(package: ChapterScenePackage) -> None:
    errors = validate_assembly_manifest_structure(package)
    if not errors:
        return
    raise ScenePackageValidationError(
        "Invalid assembly manifest: " + "; ".join(errors)
    )


def _next_reference_selection_id(package: ChapterScenePackage) -> str:
    return f"reference_selection_{len(package.reference_selections) + 1:03d}"


def _next_cast_assignment_id(package: ChapterScenePackage) -> str:
    return f"cast_assignment_{len(package.cast_assignments) + 1:03d}"


def _unique_target_objects_by_label(
    target_objects: list[TargetObjectItem],
) -> dict[str, str]:
    counts: dict[str, int] = {}
    for target in target_objects:
        counts[target.label] = counts.get(target.label, 0) + 1
    return {
        target.label: target.id
        for target in target_objects
        if counts[target.label] == 1
    }


def _next_target_object_id(
    current_target_objects: list[TargetObjectItem],
    used_ids: set[str],
) -> str:
    existing_ids = {target.id for target in current_target_objects}
    counter = 1
    while True:
        candidate = f"target_object_{counter:03d}"
        if candidate not in existing_ids and candidate not in used_ids:
            return candidate
        counter += 1
