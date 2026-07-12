from __future__ import annotations

import json
import os
from pathlib import Path
from typing import TypeVar
from uuid import uuid4

from pydantic import BaseModel, ConfigDict

from art_pipeline.course_planner.file_rollback import write_models_with_rollback
from art_pipeline.course_planner.models import (
    Chapter,
    CourseProject,
    SceneCard,
    SceneKeywords,
    Space,
)
from art_pipeline.course_planner.library_store import CoursePlannerLibraryStoreMixin
from art_pipeline.course_planner.store_common import (
    require_match as _require_match,
    validate_slug as _validate_slug,
)
from art_pipeline.course_planner.store_hierarchy import CoursePlannerHierarchyStoreMixin
from art_pipeline.course_planner.scene_package_store import (
    CoursePlannerScenePackageStoreMixin,
)
from art_pipeline.course_planner.scene_package_delete_store import (
    CoursePlannerScenePackageDeleteStoreMixin,
)
from art_pipeline.workspace.store import utc_now

ModelT = TypeVar("ModelT", bound=BaseModel)


class ChaptersPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    chapters: list[Chapter]


class CoursePlannerStore(
    CoursePlannerLibraryStoreMixin,
    CoursePlannerHierarchyStoreMixin,
    CoursePlannerScenePackageStoreMixin,
    CoursePlannerScenePackageDeleteStoreMixin,
):
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
