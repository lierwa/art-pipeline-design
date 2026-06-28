from __future__ import annotations

import json
import os
import re
from io import BytesIO
from pathlib import Path
from typing import TypeVar
from uuid import uuid4

from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, ConfigDict

from art_pipeline.course_planner.file_rollback import write_models_with_rollback
from art_pipeline.course_planner.models import (
    AIReview,
    Chapter,
    CourseProject,
    SceneCard,
    SceneKeywords,
    SceneVersionLock,
    SceneVersion,
    Space,
)
from art_pipeline.course_planner.store_common import (
    require_match as _require_match,
    validate_slug as _validate_slug,
)
from art_pipeline.course_planner.store_hierarchy import CoursePlannerHierarchyStoreMixin
from art_pipeline.workspace.store import utc_now

ModelT = TypeVar("ModelT", bound=BaseModel)


class ChaptersPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    chapters: list[Chapter]


class CoursePlannerStore(CoursePlannerHierarchyStoreMixin):
    def __init__(self, scene_library_root: Path) -> None:
        self.scene_library_root = Path(scene_library_root).resolve()

    def write_course(self, course: CourseProject) -> None:
        course_id = _validate_slug(course.id, "Course id")
        self._write_model(self._course_path(course_id), course)

    def read_course(self, course_id: str) -> CourseProject:
        return self._read_model(self._course_path(course_id), CourseProject)

    def write_space(self, course_id: str, space: Space) -> None:
        course_id = _validate_slug(course_id, "Course id")
        space_id = _validate_slug(space.id, "Space id")
        _require_match(space.course_id, course_id, "Space course_id")
        self._write_model(self._space_path(course_id, space_id), space)

    def read_space(self, course_id: str, space_id: str) -> Space:
        return self._read_model(self._space_path(course_id, space_id), Space)

    def read_chapters(self, course_id: str, space_id: str) -> list[Chapter]:
        path = self._chapters_path(course_id, space_id)
        # WHY: chapters.json 是持久化协议边界；缺 key/错形状必须暴露为坏数据，
        # 否则会把损坏课程误读成“没有章节”，后续生成会覆盖真实问题。
        payload = ChaptersPayload.model_validate_json(path.read_text(encoding="utf-8"))
        return payload.chapters

    def write_scene_card(
        self,
        course_id: str,
        space_id: str,
        chapter_id: str,
        scene_card: SceneCard,
    ) -> None:
        chapter_id = _validate_slug(chapter_id, "Chapter id")
        _require_match(scene_card.chapter_id, chapter_id, "Scene chapter_id")
        self._write_model(self._scene_card_path(course_id, space_id, chapter_id), scene_card)

    def read_scene_card(
        self,
        course_id: str,
        space_id: str,
        chapter_id: str,
    ) -> SceneCard:
        return self._read_model(
            self._scene_card_path(course_id, space_id, chapter_id),
            SceneCard,
        )

    def write_scene_keywords(
        self,
        course_id: str,
        space_id: str,
        chapter_id: str,
        keywords: SceneKeywords,
    ) -> None:
        chapter_id = _validate_slug(chapter_id, "Chapter id")
        _require_match(keywords.chapter_id, chapter_id, "Scene keywords chapter_id")
        path = self._keywords_path(course_id, space_id, chapter_id)
        self._write_model(path, keywords)

    def write_scene_plan(
        self,
        course_id: str,
        space_id: str,
        chapter_id: str,
        scene_card: SceneCard,
        keywords: SceneKeywords,
    ) -> None:
        chapter_id = _validate_slug(chapter_id, "Chapter id")
        _require_match(scene_card.chapter_id, chapter_id, "Scene chapter_id")
        _require_match(keywords.chapter_id, chapter_id, "Scene keywords chapter_id")
        scene_card_path = self._scene_card_path(course_id, space_id, chapter_id)
        keywords_path = self._keywords_path(course_id, space_id, chapter_id)
        # WHY: scene_card 与 keywords 是同一个 AI scene plan 的业务事实；
        # 二者任一落盘失败都回滚到调用前状态，避免 UI/导入层读到半份计划。
        write_models_with_rollback(
            [(scene_card_path, scene_card), (keywords_path, keywords)],
            self._write_model,
        )

    def read_scene_keywords(
        self,
        course_id: str,
        space_id: str,
        chapter_id: str,
    ) -> SceneKeywords:
        return self._read_model(
            self._keywords_path(course_id, space_id, chapter_id),
            SceneKeywords,
        )

    def create_scene_version(
        self,
        course_id: str,
        space_id: str,
        chapter_id: str,
        image_bytes: bytes,
    ) -> SceneVersion:
        chapter_id = _validate_slug(chapter_id, "Chapter id")
        _validate_png_bytes(image_bytes)
        next_index = self._next_scene_version_index(course_id, space_id, chapter_id)
        version_id = f"version_{next_index:03d}"
        version_dirname = f"v{next_index:03d}"
        image_path = f"versions/{version_dirname}/image.png"
        now = utc_now()
        version = SceneVersion(
            id=version_id,
            chapter_id=chapter_id,
            index=next_index,
            image_path=image_path,
            status="uploaded",
            created_at=now,
            updated_at=now,
        )
        self._write_bytes(
            self._scene_version_image_path(course_id, space_id, chapter_id, version),
            image_bytes,
        )
        self._write_model(
            self._scene_version_path(course_id, space_id, chapter_id, version_id),
            version,
        )
        return version

    def read_scene_versions(
        self,
        course_id: str,
        space_id: str,
        chapter_id: str,
    ) -> list[SceneVersion]:
        versions_root = self._versions_root_path(course_id, space_id, chapter_id)
        if not versions_root.exists():
            return []
        versions = [
            self._read_model(path, SceneVersion)
            for path in versions_root.glob("v*/scene_version.json")
        ]
        locked_version_id = self._read_scene_version_lock(course_id, space_id, chapter_id)
        return sorted(
            [
                self._derive_scene_version_lock_status(version, locked_version_id)
                for version in versions
            ],
            key=lambda version: version.index,
        )

    def read_scene_version(
        self,
        course_id: str,
        space_id: str,
        chapter_id: str,
        version_id: str,
    ) -> SceneVersion:
        version = self._read_model(
            self._scene_version_path(course_id, space_id, chapter_id, version_id),
            SceneVersion,
        )
        locked_version_id = self._read_scene_version_lock(course_id, space_id, chapter_id)
        return self._derive_scene_version_lock_status(version, locked_version_id)

    def lock_scene_version(
        self,
        course_id: str,
        space_id: str,
        chapter_id: str,
        version_id: str,
    ) -> SceneVersion:
        version_id = _validate_slug(version_id, "Scene version id")
        target_version = self._read_model(
            self._scene_version_path(course_id, space_id, chapter_id, version_id),
            SceneVersion,
        )
        now = utc_now()
        # WHY: lock 是 chapter 级单一事实源。只原子替换一个 lock 文件，
        # 避免分散写多个 version JSON 时中途失败造成双锁或无锁。
        self._write_model(
            self._scene_version_lock_path(course_id, space_id, chapter_id),
            SceneVersionLock(locked_version_id=version_id, updated_at=now),
        )
        return target_version.model_copy(update={"status": "locked"})

    def write_ai_review_and_mark_reviewed(
        self,
        course_id: str,
        space_id: str,
        chapter_id: str,
        version_id: str,
        review: AIReview,
    ) -> SceneVersion:
        _require_match(review.chapter_id, chapter_id, "AI review chapter_id")
        _require_match(review.version_id, version_id, "AI review version_id")
        version_path = self._scene_version_path(course_id, space_id, chapter_id, version_id)
        review_path = version_path.parent / "ai_review.json"
        version = self._read_model(version_path, SceneVersion)
        _require_match(version.chapter_id, chapter_id, "Scene version chapter_id")
        updated = version.model_copy(update={"status": "reviewed", "updated_at": utc_now()})
        write_models_with_rollback(
            [(review_path, review), (version_path, updated)],
            self._write_model,
        )
        locked_version_id = self._read_scene_version_lock(course_id, space_id, chapter_id)
        return self._derive_scene_version_lock_status(updated, locked_version_id)

    def scene_version_image_path(
        self,
        course_id: str,
        space_id: str,
        chapter_id: str,
        version: SceneVersion,
    ) -> Path:
        return self._scene_version_image_path(course_id, space_id, chapter_id, version)

    def scene_version_json_path(
        self,
        course_id: str,
        space_id: str,
        chapter_id: str,
        version_id: str,
    ) -> Path:
        return self._scene_version_path(course_id, space_id, chapter_id, version_id)

    def _course_path(self, course_id: str) -> Path:
        return self._resolve("courses", _validate_slug(course_id, "Course id"), "course.json")

    def _space_path(self, course_id: str, space_id: str) -> Path:
        return self._resolve(
            "courses",
            _validate_slug(course_id, "Course id"),
            "spaces",
            _validate_slug(space_id, "Space id"),
            "space.json",
        )

    def _chapters_path(self, course_id: str, space_id: str) -> Path:
        return self._resolve(
            "courses",
            _validate_slug(course_id, "Course id"),
            "spaces",
            _validate_slug(space_id, "Space id"),
            "chapters.json",
        )

    def _scene_card_path(
        self,
        course_id: str,
        space_id: str,
        chapter_id: str,
    ) -> Path:
        return self._resolve(
            "courses",
            _validate_slug(course_id, "Course id"),
            "spaces",
            _validate_slug(space_id, "Space id"),
            "chapters",
            _validate_slug(chapter_id, "Chapter id"),
            "scene_card.json",
        )

    def _keywords_path(
        self,
        course_id: str,
        space_id: str,
        chapter_id: str,
    ) -> Path:
        return self._resolve(
            "courses",
            _validate_slug(course_id, "Course id"),
            "spaces",
            _validate_slug(space_id, "Space id"),
            "chapters",
            _validate_slug(chapter_id, "Chapter id"),
            "keywords.json",
        )

    def _versions_root_path(
        self,
        course_id: str,
        space_id: str,
        chapter_id: str,
    ) -> Path:
        return self._resolve(
            "courses",
            _validate_slug(course_id, "Course id"),
            "spaces",
            _validate_slug(space_id, "Space id"),
            "chapters",
            _validate_slug(chapter_id, "Chapter id"),
            "versions",
        )

    def _scene_version_lock_path(
        self,
        course_id: str,
        space_id: str,
        chapter_id: str,
    ) -> Path:
        return self._resolve(
            "courses",
            _validate_slug(course_id, "Course id"),
            "spaces",
            _validate_slug(space_id, "Space id"),
            "chapters",
            _validate_slug(chapter_id, "Chapter id"),
            "version_lock.json",
        )

    def _scene_version_path(
        self,
        course_id: str,
        space_id: str,
        chapter_id: str,
        version_id: str,
    ) -> Path:
        version_id = _validate_slug(version_id, "Scene version id")
        index = _version_index_from_id(version_id)
        return self._resolve(
            "courses",
            _validate_slug(course_id, "Course id"),
            "spaces",
            _validate_slug(space_id, "Space id"),
            "chapters",
            _validate_slug(chapter_id, "Chapter id"),
            "versions",
            f"v{index:03d}",
            "scene_version.json",
        )

    def _scene_version_image_path(
        self,
        course_id: str,
        space_id: str,
        chapter_id: str,
        version: SceneVersion,
    ) -> Path:
        _require_match(version.chapter_id, chapter_id, "Scene version chapter_id")
        expected_image_path = f"versions/v{version.index:03d}/image.png"
        if version.image_path != expected_image_path:
            raise ValueError(
                f"Scene version image_path must match {expected_image_path!r}."
            )
        return self._resolve(
            "courses",
            _validate_slug(course_id, "Course id"),
            "spaces",
            _validate_slug(space_id, "Space id"),
            "chapters",
            _validate_slug(chapter_id, "Chapter id"),
            "versions",
            f"v{version.index:03d}",
            "image.png",
        )

    def _next_scene_version_index(
        self,
        course_id: str,
        space_id: str,
        chapter_id: str,
    ) -> int:
        existing = self.read_scene_versions(course_id, space_id, chapter_id)
        if not existing:
            return 1
        return max(version.index for version in existing) + 1

    def _read_scene_version_lock(
        self,
        course_id: str,
        space_id: str,
        chapter_id: str,
    ) -> str | None:
        path = self._scene_version_lock_path(course_id, space_id, chapter_id)
        if not path.exists():
            return None
        return self._read_model(path, SceneVersionLock).locked_version_id

    def _derive_scene_version_lock_status(
        self,
        version: SceneVersion,
        locked_version_id: str | None,
    ) -> SceneVersion:
        if version.id == locked_version_id:
            return version.model_copy(update={"status": "locked"})
        if version.status == "locked":
            return version.model_copy(update={"status": "uploaded"})
        return version

    def _resolve(self, *parts: str) -> Path:
        candidate = self.scene_library_root.joinpath(*parts).resolve()
        try:
            candidate.relative_to(self.scene_library_root)
        except ValueError as exc:
            raise ValueError("Course planner paths must stay inside scene_library.") from exc
        return candidate

    def _write_model(self, path: Path, model: BaseModel) -> None:
        self._write_json(path, model.model_dump(mode="json"))

    def _read_model(self, path: Path, model_type: type[ModelT]) -> ModelT:
        return model_type.model_validate_json(path.read_text(encoding="utf-8"))

    def _write_json(self, path: Path, payload: object) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = path.with_name(f"{path.name}.{uuid4().hex}.tmp")
        # WHY: scene_library 是 pre-production 的事实源；整文件原子替换比局部写入简单，
        # 也避免进程中断留下半份 JSON。代价是每次写完整文件，但 Phase 1 数据量很小。
        temp_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        os.replace(temp_path, path)

    def _write_bytes(self, path: Path, payload: bytes) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = path.with_name(f"{path.name}.{uuid4().hex}.tmp")
        temp_path.write_bytes(payload)
        os.replace(temp_path, path)


def _validate_png_bytes(payload: bytes) -> None:
    try:
        with Image.open(BytesIO(payload)) as image:
            image.load()
            if image.format != "PNG":
                raise ValueError("Scene version image must be a valid PNG.")
    except UnidentifiedImageError as exc:
        raise ValueError("Scene version image must be a valid PNG.") from exc


def _version_index_from_id(version_id: str) -> int:
    match = re.fullmatch(r"version_(\d{3})", version_id)
    if match is None:
        raise ValueError("Scene version id must use the version_NNN format.")
    return int(match.group(1))
