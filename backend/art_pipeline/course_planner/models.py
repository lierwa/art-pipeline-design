from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from art_pipeline.course_planner.media_storage_paths import (
    validate_relative_media_storage_path_value,
)


class CoursePlannerModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CourseProject(CoursePlannerModel):
    id: str
    title_zh: str
    app_language: str = "zh-CN"
    target_language: str = "en"


class Space(CoursePlannerModel):
    id: str
    course_id: str
    title_zh: str
    target_language: str
    storyline_mode: str
    space_type: str
    notes: str = ""
    order: int


class Chapter(CoursePlannerModel):
    id: str
    scene_pack_id: str
    title: str = Field(min_length=1)
    summary: str
    seed: ChapterSeed
    sort_order: int = Field(ge=1)
    # WHY: Chapter 只保留仍由后端持久化、且会驱动 scene-package / import
    # 生命周期的状态，避免已删除的评审词汇重新变成事实源。
    status: Literal["draft", "designing", "imported"] = "draft"


class ScenePack(CoursePlannerModel):
    id: str
    title: str = Field(min_length=1)
    intent: str = Field(min_length=1)
    notes: str | None = None
    status: Literal["draft", "active", "archived"] = "draft"
    # WHY: Chapter 列表的唯一权威来源是 ScenePack.chapter_ids；锁定只改变可编辑性。
    chapter_ids: list[str] = Field(default_factory=list)
    chapter_list_locked: bool = False


class LibraryImageAsset(CoursePlannerModel):
    id: str = Field(min_length=1)
    original_filename: str = Field(min_length=1)
    storage_path: str = Field(min_length=1)
    media_type: Literal["image/png"]
    width: int = Field(ge=1)
    height: int = Field(ge=1)
    created_at: str = Field(min_length=1)

    @field_validator("storage_path")
    @classmethod
    def _validate_storage_path(cls, value: str) -> str:
        return validate_relative_media_storage_path_value(
            value,
            error_factory=lambda: ValueError(
                "Library image storage_path must be a relative POSIX path."
            ),
        )


class CharacterIpProfile(CoursePlannerModel):
    id: str = Field(min_length=1)
    display_name: str = Field(min_length=1)
    current_model_sheet_id: str = Field(min_length=1)
    created_at: str = Field(min_length=1)
    updated_at: str | None = None

    @field_validator("display_name")
    @classmethod
    def _normalize_display_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Character IP display_name must not be empty.")
        return normalized


class SceneStyleReference(CoursePlannerModel):
    id: str = Field(min_length=1)
    display_name: str = Field(min_length=1)
    current_image_id: str = Field(min_length=1)
    created_at: str = Field(min_length=1)
    updated_at: str | None = None

    @field_validator("display_name")
    @classmethod
    def _normalize_display_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Scene Style Reference display_name must not be empty.")
        return normalized


class CharacterConceptHint(CoursePlannerModel):
    cast_mode: Literal["main_cast_and_supporting_cast"] = "main_cast_and_supporting_cast"
    main_cast_hint: str = Field(min_length=1)
    supporting_cast_hint: str | None = None
    reference_asset_ids: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)


class ChapterSeed(CoursePlannerModel):
    scene_pack_id: str
    scene_pack_title: str = Field(min_length=1)
    chapter_id: str
    chapter_title: str = Field(min_length=1)
    chapter_intent: str = Field(min_length=1)
    scene_domain: str = Field(min_length=1)
    daily_moment: str | None = None
    event_seed: str = Field(min_length=1)
    spatial_seed: str = Field(min_length=1)
    object_coverage_hint: list[str] = Field(default_factory=list)
    character_concept_hint: CharacterConceptHint
    # WHY: ChapterSeed 只承载 ScenePack/Chapter 的生成上下文；后续 scene-package
    # prompt 属于 Chapter 子资源，不应该回流成 ChapterSeed 的持久化事实。
    style_notes: str | None = None


class PlannedObject(CoursePlannerModel):
    name: str = Field(min_length=1)
    role_in_scene: str = Field(min_length=1)
    placement_hint: str | None = None
    priority: Literal["core", "required", "recommended", "avoid"]


class SceneCard(CoursePlannerModel):
    chapter_id: str
    title_zh: str = Field(min_length=1)
    visual_brief_zh: str = Field(min_length=1)
    image2_style: str = Field(min_length=1)


KeywordText = Annotated[str, Field(min_length=1)]


class SceneKeywords(CoursePlannerModel):
    chapter_id: str
    keywords: list[KeywordText] = Field(default_factory=list)
