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
    status: Literal["draft", "designing", "prompt_ready", "has_attempts", "imported"] = (
        "draft"
    )


class ScenePack(CoursePlannerModel):
    id: str
    title: str = Field(min_length=1)
    intent: str = Field(min_length=1)
    notes: str | None = None
    status: Literal["draft", "active", "archived"] = "draft"
    # WHY: Chapter 列表的唯一权威来源是 ScenePack.chapter_ids；锁定只改变可编辑性。
    chapter_ids: list[str] = Field(default_factory=list)
    chapter_list_locked: bool = False


class ReferenceLibraryImage(CoursePlannerModel):
    id: str = Field(min_length=1)
    original_filename: str = Field(min_length=1)
    storage_path: str = Field(min_length=1)
    media_type: Literal["image/png"]
    width: int = Field(ge=1)
    height: int = Field(ge=1)
    tags: list[str] = Field(default_factory=list)
    notes: str = ""
    created_at: str = Field(min_length=1)
    status: Literal["available", "deleted"] = "available"

    @field_validator("storage_path")
    @classmethod
    def _validate_storage_path(cls, value: str) -> str:
        return validate_relative_media_storage_path_value(
            value,
            error_factory=lambda: ValueError(
                "Reference library image storage_path must be a relative POSIX path."
            ),
        )


class CharacterIpProfile(CoursePlannerModel):
    id: str = Field(min_length=1)
    display_name: str = Field(min_length=1)
    visual_invariants: str = ""
    personality_cues: str = ""
    reference_image_ids: list[str] = Field(default_factory=list)
    status: Literal["available", "archived"] = "available"
    created_at: str = Field(min_length=1)
    updated_at: str | None = None


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


class SceneDirectorPlan(CoursePlannerModel):
    story_event: str = Field(min_length=1)
    scene_composition: str = Field(min_length=1)
    spatial_structure: str = Field(min_length=1)
    character_arrangement: str = Field(min_length=1)
    action_design: str = Field(min_length=1)
    style_and_constraints: str = Field(min_length=1)


class PlannedObject(CoursePlannerModel):
    name: str = Field(min_length=1)
    role_in_scene: str = Field(min_length=1)
    placement_hint: str | None = None
    priority: Literal["core", "required", "recommended", "avoid"]


class ObjectPlan(CoursePlannerModel):
    core_objects: list[PlannedObject] = Field(default_factory=list)
    required_objects: list[PlannedObject] = Field(default_factory=list)
    recommended_objects: list[PlannedObject] = Field(default_factory=list)
    avoid_or_move_objects: list[PlannedObject] = Field(default_factory=list)


class CastBinding(CoursePlannerModel):
    character_id: str = Field(min_length=1)
    display_name: str = Field(min_length=1)
    role_in_scene: Literal["main", "support", "background"]
    action_intent: str = Field(min_length=1)
    reference_image_ids: list[str] = Field(default_factory=list)
    invariants: list[str] = Field(default_factory=list)


class SceneVocabulary(CoursePlannerModel):
    narrative_anchors: list[str] = Field(default_factory=list)
    optional_vocabulary_candidates: list[str] = Field(default_factory=list)
    ambient_furnishing_policy: str = ""
    avoid_objects: list[str] = Field(default_factory=list)


class PromptTuning(CoursePlannerModel):
    style_anchor: str = ""
    style_reference_image_ids: list[str] = Field(default_factory=list)
    scene_reference_image_ids: list[str] = Field(default_factory=list)
    must_keep: list[str] = Field(default_factory=list)
    avoid: list[str] = Field(default_factory=list)


class SceneCard(CoursePlannerModel):
    chapter_id: str
    title_zh: str = Field(min_length=1)
    visual_brief_zh: str = Field(min_length=1)
    image2_style: str = Field(min_length=1)


KeywordText = Annotated[str, Field(min_length=1)]


class SceneKeywords(CoursePlannerModel):
    chapter_id: str
    keywords: list[KeywordText] = Field(default_factory=list)


SceneVersionStatus = Literal["uploaded", "reviewed", "locked"]


class SceneVersion(CoursePlannerModel):
    id: str
    chapter_id: str
    index: int
    image_path: str
    status: SceneVersionStatus = "uploaded"
    created_at: str
    updated_at: str


class SceneVersionLock(CoursePlannerModel):
    locked_version_id: str
    updated_at: str


class AIReview(CoursePlannerModel):
    chapter_id: str
    version_id: str
    status: Literal["approved", "needs_revision", "rejected"]
    notes_zh: str = Field(min_length=1)
    created_at: str
