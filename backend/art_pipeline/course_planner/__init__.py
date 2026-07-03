from __future__ import annotations

from art_pipeline.course_planner.models import (
    Chapter,
    CourseProject,
    SceneCard,
    SceneKeywords,
    Space,
)

__all__ = [
    "Chapter",
    "CoursePlannerStore",
    "CourseProject",
    "SceneCard",
    "SceneKeywords",
    "Space",
]


def __getattr__(name: str) -> object:
    if name == "CoursePlannerStore":
        from art_pipeline.course_planner.store import CoursePlannerStore

        return CoursePlannerStore
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
