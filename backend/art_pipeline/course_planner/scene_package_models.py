from __future__ import annotations

from typing import Any, Literal

from pydantic import Field, field_validator, model_validator

from art_pipeline.course_planner.media_storage_paths import (
    validate_relative_media_storage_path_value,
)
from art_pipeline.course_planner.models import CoursePlannerModel


class TargetObjectItem(CoursePlannerModel):
    id: str = Field(min_length=1)
    label: str = Field(min_length=1)
    description: str = ""
    priority: Literal["core", "required", "recommended"] = "required"


class AvoidObjectItem(CoursePlannerModel):
    id: str = Field(min_length=1)
    label: str = Field(min_length=1)
    description: str = ""


class TargetObjectExemption(CoursePlannerModel):
    target_object_id: str = Field(min_length=1)
    reason: str = Field(min_length=1)

    @field_validator("reason")
    @classmethod
    def _validate_reason(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Target object exemption reason must not be empty.")
        return stripped


class GeneratedChapterCastDirection(CoursePlannerModel):
    character_ip_id: str = Field(min_length=1)
    action: str = Field(min_length=1)


class CharacterModelSheetSnapshot(CoursePlannerModel):
    character_ip_id: str = Field(min_length=1)
    model_sheet_id: str = Field(min_length=1)


class GeneratedChapterPromptReferenceSnapshot(CoursePlannerModel):
    character_model_sheets: list[CharacterModelSheetSnapshot] = Field(
        default_factory=list
    )
    scene_style_reference_id: str | None = None
    scene_style_image_id: str | None = None
    current_empty_scene_image_id: str | None = None
    global_reference_image_ids: list[str] = Field(default_factory=list)


class GeneratedChapterPromptPackage(CoursePlannerModel):
    empty_scene_prompt: str = Field(min_length=1)
    complete_scene_prompt: str = Field(min_length=1)
    scene_spatial_contract: str = Field(min_length=1)
    cast_directions: list[GeneratedChapterCastDirection] = Field(default_factory=list)
    reference_snapshot: GeneratedChapterPromptReferenceSnapshot
    generation_feedback: str = ""
    generated_at: str = Field(min_length=1)


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
    source_kind: Literal["direct_upload", "generated_asset"] = "direct_upload"
    complete_scene_image_id: str | None = None
    pipeline_run_id: str | None = None
    run_asset_id: str | None = None

    @model_validator(mode="after")
    def _validate_generated_asset_lineage(self) -> "ChapterAssetLineage":
        generated_fields = (
            self.complete_scene_image_id,
            self.pipeline_run_id,
            self.run_asset_id,
        )
        if self.source_kind == "direct_upload":
            if any(value is not None for value in generated_fields):
                raise ValueError(
                    "direct_upload lineage must not include generated asset ids."
                )
            return self
        missing_fields = [
            field_name
            for field_name, value in (
                ("complete_scene_image_id", self.complete_scene_image_id),
                ("pipeline_run_id", self.pipeline_run_id),
                ("run_asset_id", self.run_asset_id),
            )
            if value is None or not value.strip()
        ]
        if missing_fields:
            # WHY: generated lineage 是 resolver/materialize/delete 的唯一事实源；
            # 在模型边界一次性校验，路由层只传递已收窄结构，避免各处解析规则漂移。
            raise ValueError(
                "generated_asset lineage requires: " + ", ".join(missing_fields)
            )
        return self


class ChapterAsset(ScenePackageMediaRecord):
    id: str = Field(min_length=1)
    display_name: str = Field(min_length=1)
    lineage: ChapterAssetLineage
    linked_target_object_id: str | None = None
    status: Literal["available", "removed"] = "available"
    created_at: str = Field(min_length=1)


class FinalScenePlacedAssetSnapshot(ScenePackageMediaRecord):
    placement_id: str = Field(min_length=1)
    asset_id: str = Field(min_length=1)
    display_name: str = Field(min_length=1)
    lineage: ChapterAssetLineage
    linked_target_object_id: str | None = None
    status: Literal["available", "removed"] = "available"


class FinalChapterScene(ScenePackageMediaRecord):
    id: str = Field(min_length=1)
    width: int = Field(ge=1)
    height: int = Field(ge=1)
    empty_scene_image_id: str = Field(min_length=1)
    assembly_snapshot: ChapterSceneAssembly
    placed_assets: list[FinalScenePlacedAssetSnapshot] = Field(default_factory=list)
    prompt_snapshot: str
    reference_snapshot: ImageReferenceSnapshot
    created_at: str = Field(min_length=1)


class ChapterScenePackage(CoursePlannerModel):
    schema_version: Literal[2] = 2
    chapter_id: str = Field(min_length=1)
    current_empty_scene_image_id: str | None = None
    selected_character_ip_ids: list[str] = Field(default_factory=list, max_length=2)
    # WHY: Chapter 只能选择一个全局场景风格；单值外键直接表达业务基数，
    # 不再通过通用 prompt role 列表推导“哪个引用才是风格”。
    scene_style_reference_id: str | None = None
    current_prompt_package: GeneratedChapterPromptPackage | None = None
    target_objects: list[TargetObjectItem] = Field(default_factory=list)
    target_object_exemptions: list[TargetObjectExemption] = Field(default_factory=list)
    avoid_objects: list[AvoidObjectItem] = Field(default_factory=list)
    assembly: ChapterSceneAssembly = Field(default_factory=ChapterSceneAssembly)
    empty_scene_images: list[EmptySceneImage] = Field(default_factory=list)
    complete_images: list[CompleteSceneImage] = Field(default_factory=list)
    chapter_assets: list[ChapterAsset] = Field(default_factory=list)
    final_scene: FinalChapterScene | None = None

    @model_validator(mode="before")
    @classmethod
    def _migrate_legacy_payload(cls, value: Any) -> Any:
        if not isinstance(value, dict) or value.get("schema_version") == 2:
            return value
        migrated = dict(value)
        assignments = migrated.pop("cast_assignments", [])
        selected_ids = list(migrated.get("selected_character_ip_ids", []))
        for assignment in assignments:
            if not isinstance(assignment, dict):
                continue
            character_ip_id = assignment.get("character_ip_id")
            if character_ip_id and character_ip_id not in selected_ids:
                selected_ids.append(character_ip_id)
        # WHY: v1 的 role/action 与 Prompt Facts 已被证明是重复事实源；迁移只保留
        # 可追溯的全局角色选择和生产资产，方向文本必须由下一次 AI 生成重新建立。
        for legacy_field in (
            "prompt",
            "prompt_confirmations",
            "reference_selections",
        ):
            migrated.pop(legacy_field, None)
        migrated.update(
            {
                "schema_version": 2,
                "selected_character_ip_ids": selected_ids,
                "current_prompt_package": None,
            }
        )
        return migrated

    @model_validator(mode="after")
    def _prune_stale_target_object_references(self) -> "ChapterScenePackage":
        target_object_ids = {target.id for target in self.target_objects}
        if not target_object_ids:
            self.target_object_exemptions = []
            self.chapter_assets = [
                asset.model_copy(update={"linked_target_object_id": None})
                if asset.linked_target_object_id is not None
                else asset
                for asset in self.chapter_assets
            ]
            return self
        # WHY: target object 是 chapter asset 绑定和 coverage 计算的唯一外键集合；
        # prompt 删除/替换目标物后，必须同时清理 exemption 与 asset link，避免旧 id 悄悄覆盖新目标。
        self.target_object_exemptions = [
            exemption
            for exemption in self.target_object_exemptions
            if exemption.target_object_id in target_object_ids
        ]
        self.chapter_assets = [
            asset.model_copy(update={"linked_target_object_id": None})
            if (
                asset.linked_target_object_id is not None
                and asset.linked_target_object_id not in target_object_ids
            )
            else asset
            for asset in self.chapter_assets
        ]
        return self

from art_pipeline.course_planner.scene_package_assembly_validation import (
    frontmost_layer_id,
    validate_assembly_manifest,
    validate_assembly_manifest_structure,
)
