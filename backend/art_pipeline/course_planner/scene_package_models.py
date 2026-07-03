from __future__ import annotations

from typing import Literal

from pydantic import Field, field_validator, model_validator

from art_pipeline.course_planner.media_storage_paths import (
    validate_relative_media_storage_path_value,
)
from art_pipeline.course_planner.models import CoursePlannerModel


class ChapterScenePrompt(CoursePlannerModel):
    prompt_text: str = ""
    scene_spatial_contract: str = ""
    updated_at: str | None = None


class TargetObjectItem(CoursePlannerModel):
    id: str = Field(min_length=1)
    label: str = Field(min_length=1)
    description: str = ""
    priority: Literal["core", "required", "recommended"] = "required"


class AvoidObjectItem(CoursePlannerModel):
    id: str = Field(min_length=1)
    label: str = Field(min_length=1)
    description: str = ""


class PromptReadinessConfirmation(CoursePlannerModel):
    avoid_objects_reviewed: bool = False
    style_reference_mode: Literal[
        "unreviewed",
        "selected",
        "confirmed_empty",
    ] = "unreviewed"


class ChapterCastAssignment(CoursePlannerModel):
    id: str = Field(min_length=1)
    character_ip_id: str = Field(min_length=1)
    role_label: str = Field(min_length=1)
    action_intent: str = Field(min_length=1)
    reference_image_ids: list[str] = Field(default_factory=list)


class ChapterReferenceSelection(CoursePlannerModel):
    id: str = Field(min_length=1)
    reference_image_id: str = Field(min_length=1)
    prompt_role: Literal["character", "style", "scene", "other"]
    notes: str = ""


class AssemblyTransform(CoursePlannerModel):
    # WHY: assembly 持久化的是归一化坐标比例，而不是某次编辑器会话里的像素值；
    # 这里在模型边界收紧 0..1，能避免非法 transform 落盘后再由下游各处兜底。
    cx: float = Field(ge=0, le=1)
    cy: float = Field(ge=0, le=1)
    w: float = Field(gt=0, le=1)
    h: float = Field(gt=0, le=1)
    rotation_deg: float = 0


class AssemblyPlacement(CoursePlannerModel):
    id: str = Field(min_length=1)
    asset_id: str = Field(min_length=1)
    display_name: str = Field(min_length=1)
    runtime_role: Literal["target", "initial"] = "target"
    transform: AssemblyTransform
    group_id: str | None = None
    requires_placed: list[str] = Field(default_factory=list)


class AssemblyGroup(CoursePlannerModel):
    id: str = Field(min_length=1)
    display_name: str = Field(min_length=1)
    placement_ids: list[str] = Field(default_factory=list)


class ChapterSceneAssembly(CoursePlannerModel):
    schema_version: Literal[1] = 1
    empty_scene_image_id: str | None = None
    empty_scene_size: dict[str, int] | None = None
    placements: list[AssemblyPlacement] = Field(default_factory=list)
    groups: list[AssemblyGroup] = Field(default_factory=list)
    layer_order: list[str] = Field(default_factory=list)
    updated_at: str | None = None


ChapterSceneAssemblyManifest = ChapterSceneAssembly


class ImageReferenceSnapshot(CoursePlannerModel):
    reference_image_ids: list[str] = Field(default_factory=list)
    current_empty_scene_image_id: str | None = None
    notes: str = ""


class ScenePackageMediaRecord(CoursePlannerModel):
    original_filename: str = Field(min_length=1)
    storage_path: str = Field(min_length=1)
    media_type: Literal["image/png"]

    @field_validator("storage_path")
    @classmethod
    def _validate_storage_path(cls, value: str) -> str:
        return validate_relative_media_storage_path_value(
            value,
            error_factory=lambda: ValueError(
                "Scene package media storage_path must be a package-relative POSIX path."
            ),
        )


class EmptySceneImage(ScenePackageMediaRecord):
    id: str = Field(min_length=1)
    width: int = Field(ge=1)
    height: int = Field(ge=1)
    status: Literal["available", "removed"] = "available"
    prompt_snapshot: str
    reference_snapshot: ImageReferenceSnapshot = Field(
        default_factory=ImageReferenceSnapshot
    )
    created_at: str = Field(min_length=1)


class CompleteSceneImage(ScenePackageMediaRecord):
    id: str = Field(min_length=1)
    width: int = Field(ge=1)
    height: int = Field(ge=1)
    empty_scene_image_id: str | None = None
    status: Literal["active", "historical", "deleted"] = "active"
    prompt_snapshot: str
    reference_snapshot: ImageReferenceSnapshot = Field(
        default_factory=ImageReferenceSnapshot
    )
    generation_note: str = ""
    pipeline_run_id: str | None = None
    pipeline_run_status: str | None = None
    created_at: str = Field(min_length=1)


class ChapterAssetLineage(CoursePlannerModel):
    source_kind: Literal["pipeline_run_asset", "direct_upload"]
    source_run_id: str | None = None
    source_run_asset_id: str | None = None
    source_complete_image_id: str | None = None

    @model_validator(mode="after")
    def _validate_lineage(self) -> "ChapterAssetLineage":
        # WHY: direct upload 和 pipeline run asset 是两套不同来源协议；
        # 在模型层收紧能保证后续 store / route 只读取一个权威来源，而不是到处猜字段组合。
        if self.source_kind == "direct_upload":
            if (
                self.source_run_id
                or self.source_run_asset_id
                or self.source_complete_image_id
            ):
                raise ValueError(
                    "Direct upload lineage cannot include run asset fields."
                )
            return self
        if not self.source_run_id or not self.source_run_asset_id:
            raise ValueError(
                "Pipeline run asset lineage requires source_run_id and source_run_asset_id."
            )
        return self


class ChapterAsset(ScenePackageMediaRecord):
    id: str = Field(min_length=1)
    display_name: str = Field(min_length=1)
    lineage: ChapterAssetLineage
    linked_target_object_id: str | None = None
    status: Literal["available", "removed"] = "available"
    created_at: str = Field(min_length=1)


class FinalChapterScene(ScenePackageMediaRecord):
    id: str = Field(min_length=1)
    width: int = Field(ge=1)
    height: int = Field(ge=1)
    empty_scene_image_id: str = Field(min_length=1)
    assembly_snapshot: ChapterSceneAssembly
    prompt_snapshot: str
    reference_snapshot: ImageReferenceSnapshot
    created_at: str = Field(min_length=1)


class ChapterScenePackage(CoursePlannerModel):
    chapter_id: str = Field(min_length=1)
    current_empty_scene_image_id: str | None = None
    prompt: ChapterScenePrompt = Field(default_factory=ChapterScenePrompt)
    prompt_confirmations: PromptReadinessConfirmation = Field(
        default_factory=PromptReadinessConfirmation
    )
    cast_assignments: list[ChapterCastAssignment] = Field(default_factory=list)
    reference_selections: list[ChapterReferenceSelection] = Field(default_factory=list)
    target_objects: list[TargetObjectItem] = Field(default_factory=list)
    avoid_objects: list[AvoidObjectItem] = Field(default_factory=list)
    assembly: ChapterSceneAssembly = Field(default_factory=ChapterSceneAssembly)
    empty_scene_images: list[EmptySceneImage] = Field(default_factory=list)
    complete_images: list[CompleteSceneImage] = Field(default_factory=list)
    chapter_assets: list[ChapterAsset] = Field(default_factory=list)
    final_scene: FinalChapterScene | None = None

from art_pipeline.course_planner.scene_package_assembly_validation import (
    frontmost_layer_id,
    validate_assembly_manifest,
)
from art_pipeline.course_planner.scene_package_prompt_projection import (
    build_complete_prompt,
    build_empty_scene_prompt,
    is_prompt_ready,
)
