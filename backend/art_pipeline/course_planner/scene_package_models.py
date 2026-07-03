from __future__ import annotations

from typing import Literal

from pydantic import Field, model_validator

from art_pipeline.course_planner.models import (
    CharacterIpProfile,
    CoursePlannerModel,
    ReferenceLibraryImage,
)
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
class EmptySceneImage(CoursePlannerModel):
    id: str = Field(min_length=1)
    original_filename: str = Field(min_length=1)
    storage_path: str = Field(min_length=1)
    media_type: Literal["image/png"]
    width: int = Field(ge=1)
    height: int = Field(ge=1)
    status: Literal["available", "removed"] = "available"
    prompt_snapshot: str
    reference_snapshot: ImageReferenceSnapshot = Field(default_factory=ImageReferenceSnapshot)
    created_at: str = Field(min_length=1)
class CompleteSceneImage(CoursePlannerModel):
    id: str = Field(min_length=1)
    original_filename: str = Field(min_length=1)
    storage_path: str = Field(min_length=1)
    media_type: Literal["image/png"]
    width: int = Field(ge=1)
    height: int = Field(ge=1)
    empty_scene_image_id: str | None = None
    status: Literal["active", "historical", "deleted"] = "active"
    prompt_snapshot: str
    reference_snapshot: ImageReferenceSnapshot = Field(default_factory=ImageReferenceSnapshot)
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
                raise ValueError("Direct upload lineage cannot include run asset fields.")
            return self
        if not self.source_run_id or not self.source_run_asset_id:
            raise ValueError(
                "Pipeline run asset lineage requires source_run_id and source_run_asset_id."
            )
        return self
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
class FinalChapterScene(CoursePlannerModel):
    id: str = Field(min_length=1)
    original_filename: str = Field(min_length=1)
    storage_path: str = Field(min_length=1)
    media_type: Literal["image/png"]
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
    prompt_confirmations: PromptReadinessConfirmation = Field(default_factory=PromptReadinessConfirmation)
    cast_assignments: list[ChapterCastAssignment] = Field(default_factory=list)
    reference_selections: list[ChapterReferenceSelection] = Field(default_factory=list)
    target_objects: list[TargetObjectItem] = Field(default_factory=list)
    avoid_objects: list[AvoidObjectItem] = Field(default_factory=list)
    assembly: ChapterSceneAssembly = Field(default_factory=ChapterSceneAssembly)
    empty_scene_images: list[EmptySceneImage] = Field(default_factory=list)
    complete_images: list[CompleteSceneImage] = Field(default_factory=list)
    chapter_assets: list[ChapterAsset] = Field(default_factory=list)
    final_scene: FinalChapterScene | None = None
LibraryPayload = tuple[list[CharacterIpProfile], list[ReferenceLibraryImage]]

# WHY: Task 1 先切换领域模型真相，后续 Task 2/3 再替换 store/route 合同；
# 这里保留最窄的导入兼容名，避免 package import 在 focused model tests 阶段提前失效。
ChapterSceneReference = ChapterReferenceSelection
EmptyBaseSceneCandidate = EmptySceneImage
def is_prompt_ready(package: ChapterScenePackage) -> bool:
    has_character = all(
        assignment.character_ip_id.strip()
        and assignment.action_intent.strip()
        and assignment.reference_image_ids
        for assignment in package.cast_assignments
    ) and bool(package.cast_assignments)
    has_target_objects = bool(package.target_objects)
    has_avoid_review = package.prompt_confirmations.avoid_objects_reviewed
    has_spatial_contract = bool(package.prompt.scene_spatial_contract.strip())
    has_style_resolution = (
        any(selection.prompt_role == "style" for selection in package.reference_selections)
        or package.prompt_confirmations.style_reference_mode == "confirmed_empty"
    )
    return (
        bool(package.prompt.prompt_text.strip())
        and has_character
        and has_target_objects
        and has_avoid_review
        and has_spatial_contract
        and has_style_resolution
    )
def build_empty_scene_prompt(package: ChapterScenePackage, libraries: LibraryPayload | None = None) -> str:
    return "\n".join(_prompt_projection_parts(package, libraries))
def build_complete_prompt(package: ChapterScenePackage, libraries: LibraryPayload | None = None) -> str:
    parts = _prompt_projection_parts(package, libraries)
    if package.current_empty_scene_image_id:
        parts.append(f"Selected empty scene image: {package.current_empty_scene_image_id}")
    return "\n".join(parts)
build_base_prompt = build_empty_scene_prompt
def _prompt_projection_parts(package: ChapterScenePackage, libraries: LibraryPayload | None) -> list[str]:
    character_lookup, reference_lookup = _library_lookups(libraries)
    parts: list[str] = []
    if package.prompt.prompt_text.strip():
        parts.append(package.prompt.prompt_text.strip())
    if package.prompt.scene_spatial_contract.strip():
        parts.append(package.prompt.scene_spatial_contract.strip())
    if package.cast_assignments:
        parts.extend(_cast_prompt_lines(package.cast_assignments, character_lookup, reference_lookup))
    if package.target_objects:
        target_text = ", ".join(item.label.strip() for item in package.target_objects)
        parts.append(f"Target objects: {target_text}")
    if package.avoid_objects:
        avoid_text = ", ".join(item.label.strip() for item in package.avoid_objects)
        parts.append(f"Avoid objects: {avoid_text}")
    if package.reference_selections:
        parts.extend(_reference_selection_lines(package.reference_selections, reference_lookup))
    return parts
def _library_lookups(libraries: LibraryPayload | None) -> tuple[dict[str, CharacterIpProfile], dict[str, ReferenceLibraryImage]]:
    if libraries is None:
        return {}, {}
    characters, reference_images = libraries
    return ({character.id: character for character in characters}, {image.id: image for image in reference_images})
def _cast_prompt_lines(
    cast_assignments: list[ChapterCastAssignment],
    character_lookup: dict[str, CharacterIpProfile],
    reference_lookup: dict[str, ReferenceLibraryImage],
) -> list[str]:
    lines: list[str] = []
    for assignment in cast_assignments:
        character = character_lookup.get(assignment.character_ip_id)
        display_name = character.display_name if character is not None else assignment.character_ip_id
        line = (
            f"Cast {assignment.role_label}: {display_name}; "
            f"action: {assignment.action_intent}"
        )
        if character is not None and character.visual_invariants.strip():
            line += f"; invariants: {character.visual_invariants.strip()}"
        reference_names = [
            reference.original_filename
            for reference_id in assignment.reference_image_ids
            if (reference := reference_lookup.get(reference_id)) is not None
        ]
        if reference_names:
            line += f"; references: {', '.join(reference_names)}"
        lines.append(line)
    return lines


def _reference_selection_lines(
    reference_selections: list[ChapterReferenceSelection],
    reference_lookup: dict[str, ReferenceLibraryImage],
) -> list[str]:
    lines: list[str] = []
    for selection in reference_selections:
        reference = reference_lookup.get(selection.reference_image_id)
        if reference is None:
            lines.append(f"Reference {selection.prompt_role}: {selection.reference_image_id}")
            continue
        line = f"Reference {selection.prompt_role}: {reference.original_filename}"
        if reference.notes.strip():
            line += f" ({reference.notes.strip()})"
        lines.append(line)
    return lines
def frontmost_layer_id(package: ChapterScenePackage) -> str | None:
    # WHY: 这里明确采用 Photoshop 风格的前后顺序约定，避免下游把 layer_order
    # 误读成“最后一个最前”而把画面层级翻转。
    if not package.assembly.layer_order:
        return None
    return package.assembly.layer_order[0]
def validate_assembly_manifest(package: ChapterScenePackage) -> list[str]:
    errors: list[str] = []
    errors.extend(_empty_scene_reference_errors(package))
    errors.extend(_placement_asset_reference_errors(package))
    errors.extend(
        _layer_order_errors(package.assembly.placements, package.assembly.layer_order)
    )
    errors.extend(_dependency_reference_errors(package.assembly.placements))
    errors.extend(_dependency_cycle_errors(package.assembly.placements))
    errors.extend(_group_reference_errors(package.assembly.groups, package.assembly.placements))
    return errors
def _empty_scene_reference_errors(package: ChapterScenePackage) -> list[str]:
    if not package.assembly.placements:
        return []
    current_id = package.current_empty_scene_image_id
    if current_id and package.assembly.empty_scene_image_id == current_id:
        return []
    return ["Assembly manifest empty_scene_image_id must match current_empty_scene_image_id when placements exist."]
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
            errors.append(f"Placement {placement.id} references unknown or unavailable asset_id: {placement.asset_id}")
    return errors
def _layer_order_errors(placements: list[AssemblyPlacement], layer_order: list[str]) -> list[str]:
    placement_ids = [placement.id for placement in placements]
    placement_id_set = set(placement_ids)
    order_id_set = set(layer_order)
    errors: list[str] = []

    duplicate_placement_ids = _duplicate_ids(placement_ids)
    duplicate_layer_ids = _duplicate_ids(layer_order)
    if duplicate_placement_ids:
        errors.append("Assembly placements contain duplicate ids: " + ", ".join(duplicate_placement_ids))
    if duplicate_layer_ids:
        errors.append("layer_order contains duplicate placement ids: " + ", ".join(duplicate_layer_ids))

    # WHY: layer_order 是渲染顺序的单一事实源；它必须覆盖全部 placement，
    # 否则对象会存在但无法落到最终层级。
    missing_in_order = [placement_id for placement_id in placement_ids if placement_id not in order_id_set]
    extra_in_order = [placement_id for placement_id in layer_order if placement_id not in placement_id_set]
    if missing_in_order:
        errors.append(f"layer_order is missing placement ids: {', '.join(missing_in_order)}")
    if extra_in_order:
        errors.append(f"layer_order references unknown placement ids: {', '.join(extra_in_order)}")
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
        missing_dependencies = [required_id for required_id in placement.requires_placed if required_id not in placement_ids]
        if missing_dependencies:
            errors.append(f"Placement {placement.id} has unknown dependency ids: " + ", ".join(missing_dependencies))
    return errors
def _group_reference_errors(groups: list[AssemblyGroup], placements: list[AssemblyPlacement]) -> list[str]:
    placement_ids = {placement.id for placement in placements}
    errors: list[str] = []
    for group in groups:
        unknown_ids = [placement_id for placement_id in group.placement_ids if placement_id not in placement_ids]
        if unknown_ids:
            errors.append(f"Group {group.id} references unknown placement ids: " + ", ".join(unknown_ids))
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
