from __future__ import annotations

from typing import Literal

from pydantic import Field

from art_pipeline.course_planner.models import CoursePlannerModel


class ChapterScenePrompt(CoursePlannerModel):
    prompt_text: str = ""
    negative_constraints: str = ""
    style_notes: str = ""
    updated_at: str | None = None


class TargetObjectItem(CoursePlannerModel):
    id: str = Field(min_length=1)
    label: str = Field(min_length=1)
    description: str = ""
    priority: Literal["core", "required", "recommended"] = "required"


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
    base_candidate_id: str | None = None
    base_size: dict[str, int] | None = None
    placements: list[AssemblyPlacement] = Field(default_factory=list)
    groups: list[AssemblyGroup] = Field(default_factory=list)
    layer_order: list[str] = Field(default_factory=list)
    updated_at: str | None = None


ChapterSceneAssemblyManifest = ChapterSceneAssembly


class ImageReferenceSnapshot(CoursePlannerModel):
    reference_ids: list[str] = Field(default_factory=list)
    locked_base_candidate_id: str | None = None
    notes: str = ""


class ChapterSceneReference(CoursePlannerModel):
    id: str = Field(min_length=1)
    original_filename: str = Field(min_length=1)
    storage_path: str = Field(min_length=1)
    media_type: Literal["image/png"]
    created_at: str = Field(min_length=1)
    prompt_role: Literal["style", "scene", "character", "other"] = "other"
    notes: str = ""


class EmptyBaseSceneCandidate(CoursePlannerModel):
    id: str = Field(min_length=1)
    original_filename: str = Field(min_length=1)
    storage_path: str = Field(min_length=1)
    media_type: Literal["image/png"]
    width: int = Field(ge=1)
    height: int = Field(ge=1)
    status: Literal["candidate", "locked", "inactive"] = "candidate"
    prompt_snapshot: str
    reference_snapshot: ImageReferenceSnapshot = Field(
        default_factory=ImageReferenceSnapshot
    )
    created_at: str = Field(min_length=1)
    locked_at: str | None = None


class CompleteSceneImage(CoursePlannerModel):
    id: str = Field(min_length=1)
    original_filename: str = Field(min_length=1)
    storage_path: str = Field(min_length=1)
    media_type: Literal["image/png"]
    width: int = Field(ge=1)
    height: int = Field(ge=1)
    base_candidate_id: str = Field(min_length=1)
    status: Literal["active", "historical", "deleted"] = "active"
    prompt_snapshot: str
    reference_snapshot: ImageReferenceSnapshot = Field(
        default_factory=ImageReferenceSnapshot
    )
    variation_prompt: str = ""
    pipeline_run_id: str | None = None
    pipeline_run_status: str | None = None
    created_at: str = Field(min_length=1)


class ChapterAssetLineage(CoursePlannerModel):
    source_run_id: str = Field(min_length=1)
    source_run_asset_id: str = Field(min_length=1)
    source_complete_image_id: str | None = None


class ChapterAsset(CoursePlannerModel):
    id: str = Field(min_length=1)
    display_name: str = Field(min_length=1)
    original_filename: str = Field(min_length=1)
    storage_path: str = Field(min_length=1)
    media_type: Literal["image/png"]
    lineage: ChapterAssetLineage
    linked_target_object_id: str | None = None
    status: Literal["available", "removed"] = "available"
    created_at: str = Field(min_length=1)


class ChapterScenePackage(CoursePlannerModel):
    chapter_id: str = Field(min_length=1)
    locked_base_candidate_id: str | None = None
    prompt: ChapterScenePrompt = Field(default_factory=ChapterScenePrompt)
    target_objects: list[TargetObjectItem] = Field(default_factory=list)
    assembly: ChapterSceneAssembly = Field(default_factory=ChapterSceneAssembly)
    references: list[ChapterSceneReference] = Field(default_factory=list)
    base_candidates: list[EmptyBaseSceneCandidate] = Field(default_factory=list)
    complete_images: list[CompleteSceneImage] = Field(default_factory=list)
    chapter_assets: list[ChapterAsset] = Field(default_factory=list)


def is_prompt_ready(package: ChapterScenePackage) -> bool:
    return bool(package.prompt.prompt_text.strip()) and bool(package.target_objects)


def build_base_prompt(package: ChapterScenePackage) -> str:
    parts = _prompt_projection_parts(package)
    return "\n".join(parts)


def build_complete_prompt(package: ChapterScenePackage) -> str:
    parts = _prompt_projection_parts(package)
    if package.locked_base_candidate_id:
        parts.append(
            f"Locked empty base scene reference: {package.locked_base_candidate_id}"
        )
    return "\n".join(parts)


def _prompt_projection_parts(package: ChapterScenePackage) -> list[str]:
    parts: list[str] = []
    if package.prompt.prompt_text.strip():
        parts.append(package.prompt.prompt_text.strip())
    if package.target_objects:
        target_text = ", ".join(item.label.strip() for item in package.target_objects)
        parts.append(f"Target objects: {target_text}")
    if package.prompt.style_notes.strip():
        parts.append(f"Style notes: {package.prompt.style_notes.strip()}")
    if package.prompt.negative_constraints.strip():
        parts.append(
            f"Negative constraints: {package.prompt.negative_constraints.strip()}"
        )
    return parts


def frontmost_layer_id(package: ChapterScenePackage) -> str | None:
    # WHY: 这里明确采用 Photoshop 风格的前后顺序约定，避免下游把 layer_order
    # 误读成“最后一个最前”而把画面层级翻转。
    if not package.assembly.layer_order:
        return None
    return package.assembly.layer_order[0]


def validate_assembly_manifest(package: ChapterScenePackage) -> list[str]:
    errors: list[str] = []
    errors.extend(_locked_base_reference_errors(package))
    errors.extend(_placement_asset_reference_errors(package))
    errors.extend(
        _layer_order_errors(package.assembly.placements, package.assembly.layer_order)
    )
    errors.extend(_dependency_reference_errors(package.assembly.placements))
    errors.extend(_dependency_cycle_errors(package.assembly.placements))
    errors.extend(
        _group_reference_errors(package.assembly.groups, package.assembly.placements)
    )
    return errors


def _locked_base_reference_errors(package: ChapterScenePackage) -> list[str]:
    if not package.assembly.placements:
        return []
    locked_base_candidate_id = package.locked_base_candidate_id
    if (
        locked_base_candidate_id
        and package.assembly.base_candidate_id == locked_base_candidate_id
    ):
        return []
    return [
        "Assembly manifest base_candidate_id must match the current "
        "locked_base_candidate_id when placements exist."
    ]


def _placement_asset_reference_errors(package: ChapterScenePackage) -> list[str]:
    available_asset_ids = {
        asset.id for asset in package.chapter_assets if asset.status == "available"
    }
    errors: list[str] = []
    # WHY: manifest 持久化的是业务对象关系，必须校验 chapter asset / placement /
    # group 这些稳定业务 ID；editor shape id 只是某个画布会话里的临时实现细节，
    # 既不能跨会话持久，也不能拿来当存储协议的权威引用。
    for placement in package.assembly.placements:
        if placement.asset_id not in available_asset_ids:
            errors.append(
                f"Placement {placement.id} references unknown or unavailable asset_id: "
                f"{placement.asset_id}"
            )
    return errors


def _layer_order_errors(
    placements: list[AssemblyPlacement],
    layer_order: list[str],
) -> list[str]:
    placement_ids = [placement.id for placement in placements]
    placement_id_set = set(placement_ids)
    order_id_set = set(layer_order)
    errors: list[str] = []

    duplicate_placement_ids = _duplicate_ids(placement_ids)
    duplicate_layer_ids = _duplicate_ids(layer_order)
    if duplicate_placement_ids:
        errors.append(
            "Assembly placements contain duplicate ids: "
            + ", ".join(duplicate_placement_ids)
        )
    if duplicate_layer_ids:
        errors.append(
            "layer_order contains duplicate placement ids: "
            + ", ".join(duplicate_layer_ids)
        )

    # WHY: layer_order 是渲染顺序的单一事实源；它必须覆盖全部 placement，
    # 否则对象会存在但无法落到最终层级。
    missing_in_order = [
        placement_id for placement_id in placement_ids if placement_id not in order_id_set
    ]
    extra_in_order = [
        placement_id for placement_id in layer_order if placement_id not in placement_id_set
    ]
    if missing_in_order:
        errors.append(
            f"layer_order is missing placement ids: {', '.join(missing_in_order)}"
        )
    if extra_in_order:
        errors.append(
            f"layer_order references unknown placement ids: {', '.join(extra_in_order)}"
        )
    return errors


def _dependency_cycle_errors(placements: list[AssemblyPlacement]) -> list[str]:
    placement_map = {placement.id: placement for placement in placements}
    visited: set[str] = set()
    active_path: list[str] = []
    active_set: set[str] = set()
    errors: list[str] = []

    def visit(placement_id: str) -> None:
        if placement_id in active_set:
            cycle_start = active_path.index(placement_id)
            cycle = [*active_path[cycle_start:], placement_id]
            errors.append(f"Dependency cycle detected: {' -> '.join(cycle)}")
            return
        if placement_id in visited:
            return
        visited.add(placement_id)
        active_path.append(placement_id)
        active_set.add(placement_id)
        placement = placement_map.get(placement_id)
        if placement is not None:
            for required_id in placement.requires_placed:
                if required_id in placement_map:
                    visit(required_id)
        active_path.pop()
        active_set.remove(placement_id)

    # WHY: 依赖环一旦出现，manifest 就没有稳定展开顺序；这里直接报错，
    # 比后续渲染阶段再猜顺序更可控。
    for placement_id in placement_map:
        visit(placement_id)
    return errors


def _dependency_reference_errors(placements: list[AssemblyPlacement]) -> list[str]:
    placement_ids = {placement.id for placement in placements}
    errors: list[str] = []
    for placement in placements:
        missing_dependencies = [
            required_id
            for required_id in placement.requires_placed
            if required_id not in placement_ids
        ]
        if missing_dependencies:
            errors.append(
                f"Placement {placement.id} has unknown dependency ids: "
                + ", ".join(missing_dependencies)
            )
    return errors


def _group_reference_errors(
    groups: list[AssemblyGroup],
    placements: list[AssemblyPlacement],
) -> list[str]:
    placement_ids = {placement.id for placement in placements}
    errors: list[str] = []
    for group in groups:
        unknown_ids = [
            placement_id
            for placement_id in group.placement_ids
            if placement_id not in placement_ids
        ]
        if unknown_ids:
            errors.append(
                f"Group {group.id} references unknown placement ids: "
                + ", ".join(unknown_ids)
            )
    return errors


def _duplicate_ids(ids: list[str]) -> list[str]:
    seen: set[str] = set()
    duplicates: list[str] = []
    for item_id in ids:
        if item_id in seen and item_id not in duplicates:
            duplicates.append(item_id)
            continue
        seen.add(item_id)
    return duplicates
