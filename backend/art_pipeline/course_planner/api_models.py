from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from art_pipeline.course_planner.models import (
    CastBinding,
    ObjectPlan,
    PromptPackage,
    PromptTuning,
    SceneDirectorPlan,
    SceneVocabulary,
)


class ScenePackCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1)
    intent: str = Field(min_length=1)
    notes: str | None = None
    status: Literal["draft", "active", "archived"] = "draft"


class ScenePackPatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1)
    intent: str | None = Field(default=None, min_length=1)
    notes: str | None = None
    status: Literal["draft", "active", "archived"] | None = None


class CandidateBatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    feedback: str = ""


class ChapterSeedRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    chapter_title: str = Field(min_length=1)
    chapter_intent: str = Field(min_length=1)
    scene_domain: str = Field(min_length=1)
    daily_moment: str | None = None
    event_seed: str = Field(min_length=1)
    spatial_seed: str = Field(min_length=1)
    object_coverage_hint: list[str] = Field(default_factory=list)
    character_concept_hint: dict[str, Any]
    style_notes: str | None = None


class ChapterOrderRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    chapter_ids: list[str] = Field(alias="chapterIds")


class PromptVersionCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    feedback: str = ""
    source_version_id: str | None = Field(default=None, alias="sourceVersionId")


class PromptVersionPatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1)
    status: Literal["draft", "prompt_ready", "has_attempts", "adopted", "archived"] | None = None
    scene_director_plan: SceneDirectorPlan | None = None
    cast_bindings: list[CastBinding] | None = None
    scene_vocabulary: SceneVocabulary | None = None
    prompt_tuning: PromptTuning | None = None
    object_plan: ObjectPlan | None = None
    prompt_package: PromptPackage | None = None


class ImageAttemptCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    uploaded_image_id: str = Field(alias="uploadedImageId", min_length=1)


class ImageAttemptPatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    status: Literal[
        "uploaded",
        "ai_reviewed",
        "accepted",
        "not_accepted",
        "imported",
    ] | None = None
    human_decision: Literal[
        "accept",
        "revise_version",
        "keep_record",
        "delete",
    ] | None = Field(default=None, alias="humanDecision")
