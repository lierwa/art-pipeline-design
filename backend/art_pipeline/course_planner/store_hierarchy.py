from __future__ import annotations

from pathlib import Path
from typing import Any
from uuid import uuid4

from art_pipeline.course_planner.models import Chapter, ChapterSeed, ScenePack
from art_pipeline.course_planner.store_common import require_match, validate_slug


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

    def _new_scene_pack_id(self) -> str:
        while True:
            scene_pack_id = f"scene_pack_{uuid4().hex[:12]}"
            if not self._scene_pack_path(scene_pack_id).exists():
                return scene_pack_id

    def _new_chapter_id(self, scene_pack_id: str) -> str:
        while True:
            chapter_id = f"chapter_{uuid4().hex[:12]}"
            if not self._chapter_path(scene_pack_id, chapter_id).exists():
                return chapter_id
