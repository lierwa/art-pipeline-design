from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


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


class GenerateChapterPromptPackageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    feedback: str = ""


class ChapterSceneStyleReferenceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    scene_style_reference_id: str = Field(alias="sceneStyleReferenceId", min_length=1)


class ChapterCastSelectionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    character_ip_ids: list[str] = Field(
        alias="characterIpIds",
        max_length=2,
    )

    @field_validator("character_ip_ids")
    @classmethod
    def _require_unique_character_ids(cls, value: list[str]) -> list[str]:
        if len(value) != len(set(value)):
            raise ValueError("characterIpIds must not contain duplicate ids.")
        if any(not character_ip_id.strip() for character_ip_id in value):
            raise ValueError("characterIpIds must not contain empty ids.")
        return value


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
