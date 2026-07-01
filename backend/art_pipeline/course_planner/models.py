from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


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
    adopted_prompt_version_id: str | None = None


class ScenePack(CoursePlannerModel):
    id: str
    title: str = Field(min_length=1)
    intent: str = Field(min_length=1)
    notes: str | None = None
    status: Literal["draft", "active", "archived"] = "draft"
    # WHY: Chapter 列表的唯一权威来源是 ScenePack.chapter_ids；锁定只改变可编辑性。
    chapter_ids: list[str] = Field(default_factory=list)
    chapter_list_locked: bool = False


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
    # WHY: ChapterSeed 只承载 01 到 02 的上下文；最终提示词属于 PromptPackage。
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


class PromptPackage(CoursePlannerModel):
    full_prompt: str = Field(min_length=1)
    short_prompt: str | None = None
    negative_constraints: str
    revision_prompt: str | None = None


class PromptVersion(CoursePlannerModel):
    @model_validator(mode="before")
    @classmethod
    def _project_legacy_object_plan(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        payload = dict(data)
        # WHY: 旧版本 JSON 仍可能只保存 object_plan。新链路的事实源是
        # scene_vocabulary；这里仅做读取兼容，避免本地旧记录让 02 整页失效。
        if "scene_vocabulary" not in payload:
            payload["scene_vocabulary"] = _scene_vocabulary_from_object_plan_payload(
                payload.get("object_plan"),
            )
        if "prompt_tuning" not in payload:
            scene_plan = payload.get("scene_director_plan")
            style_anchor = (
                scene_plan.get("style_and_constraints", "")
                if isinstance(scene_plan, dict)
                else ""
            )
            payload["prompt_tuning"] = {"style_anchor": style_anchor}
        payload.setdefault("cast_bindings", [])
        payload.setdefault("object_plan", {})
        return payload

    id: str
    chapter_id: str
    version_label: str = Field(min_length=1)
    title: str = Field(min_length=1)
    status: Literal["draft", "prompt_ready", "has_attempts", "adopted", "archived"] = (
        "draft"
    )
    scene_director_plan: SceneDirectorPlan
    cast_bindings: list[CastBinding] = Field(default_factory=list)
    scene_vocabulary: SceneVocabulary = Field(default_factory=SceneVocabulary)
    prompt_tuning: PromptTuning = Field(default_factory=PromptTuning)
    object_plan: ObjectPlan = Field(default_factory=ObjectPlan)
    prompt_package: PromptPackage
    source_version_id: str | None = None
    image_attempt_ids: list[str] = Field(default_factory=list)


def _scene_vocabulary_from_object_plan_payload(payload: Any) -> dict[str, object]:
    if not isinstance(payload, dict):
        return {}
    core_names = _planned_object_names(payload.get("core_objects"))
    required_names = _planned_object_names(payload.get("required_objects"))
    recommended_names = _planned_object_names(payload.get("recommended_objects"))
    avoid_names = _planned_object_names(payload.get("avoid_or_move_objects"))
    return {
        "narrative_anchors": [*core_names, *required_names],
        "optional_vocabulary_candidates": recommended_names,
        "ambient_furnishing_policy": "",
        "avoid_objects": avoid_names,
    }


def _planned_object_names(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    names: list[str] = []
    for item in value:
        if isinstance(item, dict) and isinstance(item.get("name"), str):
            names.append(item["name"])
    return names


class ImageAttemptReview(CoursePlannerModel):
    summary: str = ""
    strengths: list[str] = Field(default_factory=list)
    issues: list[str] = Field(default_factory=list)
    recommendation: Literal["accept", "revise", "reject"] | None = None


class ImageAttempt(CoursePlannerModel):
    id: str
    prompt_version_id: str
    uploaded_image_id: str
    status: Literal[
        "uploaded",
        "ai_reviewed",
        "accepted",
        "not_accepted",
        "imported",
    ] = "uploaded"
    ai_review: ImageAttemptReview | None = None
    human_decision: Literal["accept", "revise_version", "keep_record", "delete"] | None = None
    pipeline_import_id: str | None = None


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
