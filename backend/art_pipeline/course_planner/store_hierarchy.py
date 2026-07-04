from __future__ import annotations

from pathlib import Path
from pathlib import PurePosixPath
from typing import Any
from uuid import uuid4

from art_pipeline.course_planner.models import (
    Chapter,
    ChapterSeed,
    CharacterIpProfile,
    ReferenceLibraryImage,
    ScenePack,
)
from art_pipeline.course_planner.scene_package_errors import ScenePackageValidationError
from art_pipeline.course_planner.scene_package_media import (
    read_scene_package_png_size,
    sanitize_original_filename,
)
from art_pipeline.course_planner.store_common import require_match, validate_slug
from art_pipeline.workspace.store import utc_now


class CoursePlannerHierarchyStoreMixin:
    def create_scene_pack(
        self,
        *,
        title: str,
        intent: str,
        notes: str | None = None,
        status: str = "draft",
    ) -> ScenePack:
        pack = ScenePack(
            id=self._new_scene_pack_id(),
            title=title,
            intent=intent,
            notes=notes,
            status=status,
        )
        self._write_model(self._scene_pack_path(pack.id), pack)
        return pack

    def update_scene_pack(self, scene_pack_id: str, **updates: Any) -> ScenePack:
        pack = self.get_scene_pack(scene_pack_id)
        allowed_fields = {"title", "intent", "notes", "status"}
        update_payload = {
            field: value for field, value in updates.items() if field in allowed_fields
        }
        payload = pack.model_dump(mode="json")
        payload.update(update_payload)
        # WHY: model_copy(update=...) skips Pydantic validation; updates cross the
        # persistence boundary and must be validated before replacing the JSON file.
        updated = ScenePack.model_validate(payload)
        self._write_model(self._scene_pack_path(scene_pack_id), updated)
        return updated

    def archive_scene_pack(self, scene_pack_id: str) -> ScenePack:
        return self.update_scene_pack(scene_pack_id, status="archived")

    def delete_scene_pack(self, scene_pack_id: str) -> None:
        # WHY: ScenePack 仍然拥有 Chapter 与 scene-package 子树；delete 继续用 archive
        # 语义，避免用户误把恢复型操作当成物理清库。
        self.archive_scene_pack(scene_pack_id)

    def list_reference_library_images(self) -> list[ReferenceLibraryImage]:
        root = self._reference_library_images_root_path()
        if not root.exists():
            return []
        return [
            self._read_model(path, ReferenceLibraryImage)
            for path in sorted(root.glob("*/image.json"))
        ]

    def add_reference_library_image(
        self,
        *,
        image_bytes: bytes,
        original_filename: str,
        tags: list[str],
        notes: str,
    ) -> ReferenceLibraryImage:
        width, height = read_scene_package_png_size(image_bytes, "Reference library image")
        image_id = self._new_reference_image_id()
        storage_path = _reference_image_storage_path(image_id)
        image = ReferenceLibraryImage(
            id=image_id,
            original_filename=sanitize_original_filename(original_filename),
            storage_path=storage_path,
            media_type="image/png",
            width=width,
            height=height,
            tags=tags,
            notes=notes,
            created_at=utc_now(),
        )
        self._write_bytes(self._scene_library_relative_path(storage_path), image_bytes)
        self._write_model(self._reference_library_image_model_path(image.id), image)
        return image

    def list_character_ips(self) -> list[CharacterIpProfile]:
        root = self._character_ips_root_path()
        if not root.exists():
            return []
        return [
            self._read_model(path, CharacterIpProfile)
            for path in sorted(root.glob("*/character.json"))
        ]

    def create_character_ip(
        self,
        *,
        display_name: str,
        visual_invariants: str,
        personality_cues: str,
        reference_image_ids: list[str],
    ) -> CharacterIpProfile:
        self._require_reference_image_ids(reference_image_ids)
        now = utc_now()
        character = CharacterIpProfile(
            id=self._new_character_ip_id(),
            display_name=display_name,
            visual_invariants=visual_invariants,
            personality_cues=personality_cues,
            reference_image_ids=list(reference_image_ids),
            created_at=now,
        )
        self._write_model(self._character_ip_path(character.id), character)
        return character

    def list_scene_packs(self) -> list[ScenePack]:
        root = self._scene_packs_root_path()
        if not root.exists():
            return []
        return [
            self._read_model(path, ScenePack)
            for path in sorted(root.glob("*/scene_pack.json"))
        ]

    def get_scene_pack(self, scene_pack_id: str) -> ScenePack:
        return self._read_model(self._scene_pack_path(scene_pack_id), ScenePack)

    def create_chapter_from_seed(
        self,
        scene_pack_id: str,
        seed: ChapterSeed,
    ) -> Chapter:
        pack = self.get_scene_pack(scene_pack_id)
        require_match(seed.scene_pack_id, pack.id, "Chapter seed scene_pack_id")
        chapter_id = self._new_chapter_id(pack.id)
        # WHY: AI candidate ids are disposable proposal metadata; persisted Chapter ids
        # are generated here so users never maintain category/chapter identifiers.
        persisted_seed = seed.model_copy(
            update={
                "scene_pack_id": pack.id,
                "scene_pack_title": pack.title,
                "chapter_id": chapter_id,
            }
        )
        chapter = Chapter(
            id=chapter_id,
            scene_pack_id=pack.id,
            title=persisted_seed.chapter_title,
            summary=persisted_seed.event_seed,
            seed=persisted_seed,
            sort_order=len(pack.chapter_ids) + 1,
        )
        self._write_model(self._chapter_path(pack.id, chapter.id), chapter)
        self._write_model(
            self._scene_pack_path(pack.id),
            pack.model_copy(update={"chapter_ids": [*pack.chapter_ids, chapter.id]}),
        )
        return chapter

    def list_chapters(self, scene_pack_id: str) -> list[Chapter]:
        pack = self.get_scene_pack(scene_pack_id)
        return [self._read_chapter(pack.id, chapter_id) for chapter_id in pack.chapter_ids]

    def reorder_chapters(self, scene_pack_id: str, chapter_ids: list[str]) -> ScenePack:
        pack = self.get_scene_pack(scene_pack_id)
        if len(chapter_ids) != len(set(chapter_ids)) or set(chapter_ids) != set(
            pack.chapter_ids
        ):
            raise ValueError("chapter_ids must match existing chapter list")

        for sort_order, chapter_id in enumerate(chapter_ids, start=1):
            chapter = self._read_chapter(pack.id, chapter_id)
            self._write_model(
                self._chapter_path(pack.id, chapter_id),
                chapter.model_copy(update={"sort_order": sort_order}),
            )
        updated = pack.model_copy(update={"chapter_ids": list(chapter_ids)})
        self._write_model(self._scene_pack_path(pack.id), updated)
        return updated

    def _scene_packs_root_path(self) -> Path:
        return self._resolve("scene_packs")

    def _reference_library_images_root_path(self) -> Path:
        return self._resolve("reference_library", "images")

    def _reference_library_image_root_path(self, image_id: str) -> Path:
        return self._reference_library_images_root_path() / validate_slug(
            image_id,
            "Reference image id",
        )

    def _reference_library_image_model_path(self, image_id: str) -> Path:
        return self._reference_library_image_root_path(image_id) / "image.json"

    def _character_ips_root_path(self) -> Path:
        return self._resolve("character_ip_library", "characters")

    def _character_ip_path(self, character_ip_id: str) -> Path:
        return (
            self._character_ips_root_path()
            / validate_slug(character_ip_id, "Character IP id")
            / "character.json"
        )

    def _scene_pack_root_path(self, scene_pack_id: str) -> Path:
        return self._resolve("scene_packs", validate_slug(scene_pack_id, "Scene pack id"))

    def _scene_pack_path(self, scene_pack_id: str) -> Path:
        return self._scene_pack_root_path(scene_pack_id) / "scene_pack.json"

    def _chapter_path(self, scene_pack_id: str, chapter_id: str) -> Path:
        return self._resolve(
            "scene_packs",
            validate_slug(scene_pack_id, "Scene pack id"),
            "chapters",
            validate_slug(chapter_id, "Chapter id"),
            "chapter.json",
        )

    def _read_chapter(self, scene_pack_id: str, chapter_id: str) -> Chapter:
        return self._read_model(self._chapter_path(scene_pack_id, chapter_id), Chapter)

    def _find_chapter(self, chapter_id: str) -> tuple[Chapter, str]:
        chapter_id = validate_slug(chapter_id, "Chapter id")
        for pack in self.list_scene_packs():
            if chapter_id in pack.chapter_ids:
                return self._read_chapter(pack.id, chapter_id), pack.id
        raise FileNotFoundError(f"Chapter {chapter_id!r} was not found.")

    def _require_reference_image_ids(
        self,
        reference_image_ids: list[str],
        *,
        singular_message: bool = False,
    ) -> None:
        known_ids = {
            image.id
            for image in self.list_reference_library_images()
            if image.status == "available"
        }
        missing_ids = [
            reference_image_id
            for reference_image_id in reference_image_ids
            if reference_image_id not in known_ids
        ]
        if not missing_ids:
            return
        noun = "id" if singular_message and len(missing_ids) == 1 else "ids"
        raise ScenePackageValidationError(
            f"Unknown reference image {noun}: {', '.join(missing_ids)}"
        )

    def _require_character_ip(self, character_ip_id: str) -> CharacterIpProfile:
        for character in self.list_character_ips():
            if character.id == character_ip_id and character.status == "available":
                return character
        raise ScenePackageValidationError(f"Unknown character IP id: {character_ip_id}")

    def _scene_library_relative_path(self, storage_path: str) -> Path:
        return self._resolve(*PurePosixPath(storage_path).parts)

    def _new_scene_pack_id(self) -> str:
        while True:
            scene_pack_id = f"scene_pack_{uuid4().hex[:12]}"
            if not self._scene_pack_path(scene_pack_id).exists():
                return scene_pack_id

    def _new_reference_image_id(self) -> str:
        while True:
            image_id = f"reference_image_{uuid4().hex[:12]}"
            if not self._reference_library_image_model_path(image_id).exists():
                return image_id

    def _new_character_ip_id(self) -> str:
        while True:
            character_ip_id = f"character_ip_{uuid4().hex[:12]}"
            if not self._character_ip_path(character_ip_id).exists():
                return character_ip_id

    def _new_chapter_id(self, scene_pack_id: str) -> str:
        while True:
            chapter_id = f"chapter_{uuid4().hex[:12]}"
            if not self._chapter_path(scene_pack_id, chapter_id).exists():
                return chapter_id


def _reference_image_storage_path(image_id: str) -> str:
    # WHY: Reference Library 图片是跨 Chapter 复用的库事实，存储路径必须由系统生成；
    # 原始文件名只作为展示元数据，避免用户路径成为第二套持久化协议。
    return PurePosixPath("reference_library", "images", image_id, "image.png").as_posix()
