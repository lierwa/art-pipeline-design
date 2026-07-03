from __future__ import annotations

from art_pipeline.course_planner.models import (
    Chapter,
    CourseProject,
    PromptPackage,
    SceneCard,
    SceneKeywords,
    Space,
)
from art_pipeline.course_planner.prompt_builder import build_image2_prompt_package

__all__ = [
    "Chapter",
    "CoursePlannerStore",
    "CourseProject",
    "PromptPackage",
    "SceneCard",
    "SceneKeywords",
    "Space",
    "build_image2_prompt_package",
]


def __getattr__(name: str) -> object:
    if name == "CoursePlannerStore":
        from art_pipeline.course_planner.store import CoursePlannerStore

        return CoursePlannerStore
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
