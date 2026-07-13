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
    ChapterSceneAssembly,
    ChapterSceneAssemblyManifest,
    ChapterScenePackage,
    EmptySceneImage,
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
            # 能提前稳定后续上传目录；此时 Assembly 尚未绑定 Empty Scene，不能套用 Lock Final readiness。
            return self.write_chapter_scene_package(package, validate_assembly=False)
        package = self._read_model(path, ChapterScenePackage)
        require_match(package.chapter_id, chapter.id, "Scene package chapter_id")
        return package

    def set_chapter_scene_style_reference(
        self,
        chapter_id: str,
        *,
        scene_style_reference_id: str,
    ) -> ChapterScenePackage:
        current, _ = self._load_scene_package_for_write(chapter_id)
        self._require_scene_style_reference(scene_style_reference_id)
        return self.write_chapter_scene_package(
            current.model_copy(
                update={"scene_style_reference_id": scene_style_reference_id}
            ),
            validate_assembly=False,
        )

    def clear_chapter_scene_style_reference(self, chapter_id: str) -> ChapterScenePackage:
        current, _ = self._load_scene_package_for_write(chapter_id)
        return self.write_chapter_scene_package(
            current.model_copy(update={"scene_style_reference_id": None}),
            validate_assembly=False,
        )

    def set_chapter_cast_selection(
        self,
        chapter_id: str,
        *,
        character_ip_ids: list[str],
    ) -> ChapterScenePackage:
        current, _ = self._load_scene_package_for_write(chapter_id)
        for character_ip_id in character_ip_ids:
            self._require_character_ip(character_ip_id)
        # WHY: cast selection 是一个有序、原子的小集合；整表替换避免逐角色写入时
        # 出现中间态，也让前后端共享同一个 0..2 基数合同。
        return self.write_chapter_scene_package(
            current.model_copy(
                update={"selected_character_ip_ids": list(character_ip_ids)}
            ),
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
