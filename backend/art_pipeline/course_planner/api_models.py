from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


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


class TargetObjectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str | None = Field(default=None, min_length=1)
    label: str = Field(min_length=1)
    description: str = ""
    priority: Literal["core", "required", "recommended"] = "required"


class AvoidObjectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str = Field(min_length=1)
    description: str = ""


class PromptReadinessConfirmationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    avoid_objects_reviewed: bool = Field(alias="avoidObjectsReviewed")
    style_reference_mode: Literal["unreviewed", "selected", "confirmed_empty"] = Field(
        alias="styleReferenceMode"
    )


class ChapterScenePromptPatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    prompt_text: str = Field(alias="promptText")
    scene_spatial_contract: str | None = Field(
        default=None,
        alias="sceneSpatialContract",
    )
    target_objects: list[TargetObjectRequest] | None = Field(
        default=None,
        alias="targetObjects",
    )
    avoid_objects: list[AvoidObjectRequest] | None = Field(
        default=None,
        alias="avoidObjects",
    )
    prompt_confirmations: PromptReadinessConfirmationRequest | None = Field(
        default=None,
        alias="promptConfirmations",
    )


class CharacterIpCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    display_name: str = Field(alias="displayName", min_length=1)
    visual_invariants: str = Field(default="", alias="visualInvariants")
    personality_cues: str = Field(default="", alias="personalityCues")
    reference_image_ids: list[str] = Field(
        default_factory=list,
        alias="referenceImageIds",
    )


class ChapterReferenceSelectionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    reference_image_id: str = Field(alias="referenceImageId", min_length=1)
    prompt_role: Literal["character", "style", "scene", "other"] = Field(
        alias="promptRole"
    )


class ChapterCastAssignmentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    character_ip_id: str = Field(alias="characterIpId", min_length=1)
    role_label: str = Field(alias="roleLabel", min_length=1)
    action_intent: str = Field(alias="actionIntent", min_length=1)
    reference_image_ids: list[str] | None = Field(
        default=None,
        alias="referenceImageIds",
    )


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


class CurrentEmptySceneImageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    empty_scene_image_id: str = Field(alias="emptySceneImageId", min_length=1)
