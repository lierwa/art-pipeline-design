from __future__ import annotations

from pathlib import Path, PurePosixPath
from typing import Any
from uuid import uuid4

from art_pipeline.course_planner.models import (
    Chapter,
    ChapterSeed,
    ImageAttempt,
    PromptVersion,
    ScenePack,
)
from art_pipeline.course_planner.store_common import require_match, validate_slug


class PromptVersionArchiveConflict(ValueError):
    pass


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
        allowed_fields = {"title", "intent", "notes", "status", "chapter_list_locked"}
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
        # WHY: PromptVersion/ImageAttempt records are global lineage records in Task 1.
        # Physical deletion would orphan them, so delete is a recoverable archive action.
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

    def lock_chapter_list(self, scene_pack_id: str, locked: bool) -> ScenePack:
        return self.update_scene_pack(scene_pack_id, chapter_list_locked=locked)

    def create_prompt_version(
        self,
        chapter_id: str,
        payload: PromptVersion | dict[str, Any],
    ) -> PromptVersion:
        chapter, _ = self._find_chapter(chapter_id)
        version_id = self._new_prompt_version_id(chapter.id)
        payload_data = (
            payload.model_dump(mode="json")
            if isinstance(payload, PromptVersion)
            else dict(payload)
        )
        payload_data.update(
            {
                "id": version_id,
                "chapter_id": chapter.id,
                "version_label": self._next_prompt_version_label(chapter.id),
                "image_attempt_ids": [],
            }
        )
        # WHY: create payloads may come from routes/AI without persisted ids; the store is
        # the boundary that assigns lineage fields and prevents user-maintained identifiers.
        template = PromptVersion.model_validate(payload_data)
        version = template.model_copy(
            update={
                "status": "prompt_ready",
                "source_version_id": template.source_version_id,
            }
        )
        self._write_model(self._prompt_version_path(version.id), version)
        return version

    def duplicate_prompt_version(self, version_id: str) -> PromptVersion:
        source = self.get_prompt_version(version_id)
        return self.create_prompt_version(
            source.chapter_id,
            source.model_copy(update={"source_version_id": source.id}),
        )

    def list_prompt_versions(self, chapter_id: str) -> list[PromptVersion]:
        self._find_chapter(chapter_id)
        root = self._prompt_versions_root_path()
        if not root.exists():
            return []
        versions = [
            self._read_model(path, PromptVersion)
            for path in root.glob("*.json")
        ]
        return sorted(
            [version for version in versions if version.chapter_id == chapter_id],
            key=lambda version: version.version_label,
        )

    def get_prompt_version(self, version_id: str) -> PromptVersion:
        return self._read_model(self._prompt_version_path(version_id), PromptVersion)

    def update_prompt_version(self, version: PromptVersion) -> PromptVersion:
        current = self.get_prompt_version(version.id)
        require_match(version.chapter_id, current.chapter_id, "Prompt version chapter_id")
        chapter, _ = self._find_chapter(current.chapter_id)
        if version.status == "archived" and chapter.adopted_prompt_version_id == current.id:
            raise PromptVersionArchiveConflict(
                "Adopt another Prompt Version before archiving the currently adopted version."
            )
        validated = PromptVersion.model_validate(version.model_dump(mode="json"))
        self._write_model(self._prompt_version_path(validated.id), validated)
        return validated

    def archive_prompt_version(self, version_id: str) -> PromptVersion:
        version = self.get_prompt_version(version_id)
        # WHY: 归档也是状态写入，统一经过 update_prompt_version，避免 DELETE
        # 和 PATCH 对 adopted 指针保护产生两套规则。
        return self.update_prompt_version(version.model_copy(update={"status": "archived"}))

    def set_adopted_prompt_version(self, chapter_id: str, version_id: str) -> Chapter:
        chapter, scene_pack_id = self._find_chapter(chapter_id)
        target = self.get_prompt_version(version_id)
        require_match(target.chapter_id, chapter.id, "Prompt version chapter_id")
        for version in self.list_prompt_versions(chapter.id):
            next_status = (
                "adopted"
                if version.id == version_id
                else _preserved_unadopted_status(version)
            )
            self._write_model(
                self._prompt_version_path(version.id),
                version.model_copy(update={"status": next_status}),
            )
        updated_chapter = chapter.model_copy(
            update={
                "status": "prompt_ready",
                "adopted_prompt_version_id": version_id,
            }
        )
        self._write_model(self._chapter_path(scene_pack_id, chapter.id), updated_chapter)
        return updated_chapter

    def create_image_attempt(
        self,
        prompt_version_id: str,
        uploaded_image_id: str,
    ) -> ImageAttempt:
        version = self.get_prompt_version(prompt_version_id)
        attempt = ImageAttempt(
            id=self._new_image_attempt_id(version.id),
            prompt_version_id=version.id,
            uploaded_image_id=uploaded_image_id,
        )
        self._write_model(self._image_attempt_path(attempt.id), attempt)
        updated_version = version.model_copy(
            update={
                "status": "has_attempts",
                "image_attempt_ids": [*version.image_attempt_ids, attempt.id],
            }
        )
        self._write_model(self._prompt_version_path(version.id), updated_version)
        chapter, scene_pack_id = self._find_chapter(version.chapter_id)
        self._write_model(
            self._chapter_path(scene_pack_id, chapter.id),
            chapter.model_copy(update={"status": "has_attempts"}),
        )
        return attempt

    def create_uploaded_image_attempt(
        self,
        prompt_version_id: str,
        image_bytes: bytes,
    ) -> ImageAttempt:
        version = self.get_prompt_version(prompt_version_id)
        upload_name = f"{uuid4().hex}.png"
        upload_path = self._resolve("uploads", "course_planner", version.id, upload_name)
        # WHY: ImageAttempt.uploaded_image_id 是后续导入的可解析相对路径；
        # store 生成路径可避免前端 file.name 变成第二套文件事实源。
        uploaded_image_id = PurePosixPath(
            "uploads",
            "course_planner",
            version.id,
            upload_name,
        ).as_posix()
        self._write_bytes(upload_path, image_bytes)
        return self.create_image_attempt(version.id, uploaded_image_id)

    def list_image_attempts(self, prompt_version_id: str) -> list[ImageAttempt]:
        version = self.get_prompt_version(prompt_version_id)
        return [
            self._read_model(self._image_attempt_path(attempt_id), ImageAttempt)
            for attempt_id in version.image_attempt_ids
        ]

    def get_image_attempt(self, attempt_id: str) -> ImageAttempt:
        return self._read_model(self._image_attempt_path(attempt_id), ImageAttempt)

    def update_image_attempt(self, attempt: ImageAttempt) -> ImageAttempt:
        current = self.get_image_attempt(attempt.id)
        require_match(attempt.prompt_version_id, current.prompt_version_id, "Image attempt prompt_version_id")
        validated = ImageAttempt.model_validate(attempt.model_dump(mode="json"))
        self._write_model(self._image_attempt_path(validated.id), validated)
        return validated

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

    def _prompt_versions_root_path(self) -> Path:
        return self._resolve("prompt_versions")

    def _prompt_version_path(self, version_id: str) -> Path:
        return self._resolve(
            "prompt_versions",
            f"{validate_slug(version_id, 'Prompt version id')}.json",
        )

    def _image_attempt_path(self, attempt_id: str) -> Path:
        return self._resolve(
            "image_attempts",
            f"{validate_slug(attempt_id, 'Image attempt id')}.json",
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

    def _new_prompt_version_id(self, chapter_id: str) -> str:
        while True:
            version_id = f"prompt_version_{uuid4().hex[:12]}"
            if not self._prompt_version_path(version_id).exists():
                return version_id

    def _new_image_attempt_id(self, prompt_version_id: str) -> str:
        while True:
            attempt_id = f"image_attempt_{uuid4().hex[:12]}"
            if not self._image_attempt_path(attempt_id).exists():
                return attempt_id

    def _next_prompt_version_label(self, chapter_id: str) -> str:
        return f"V{len(self.list_prompt_versions(chapter_id)) + 1:03d}"


def _preserved_unadopted_status(version: PromptVersion) -> str:
    if version.status != "adopted":
        return version.status
    if version.image_attempt_ids:
        return "has_attempts"
    return "prompt_ready"
