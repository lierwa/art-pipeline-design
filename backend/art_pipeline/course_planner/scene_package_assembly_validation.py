from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from art_pipeline.course_planner.scene_package_models import (
        AssemblyGroup,
        AssemblyPlacement,
        ChapterScenePackage,
    )


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
        _layer_order_errors(
            package.assembly.placements,
            package.assembly.layer_order,
        )
    )
    errors.extend(_dependency_reference_errors(package.assembly.placements))
    errors.extend(_dependency_cycle_errors(package.assembly.placements))
    errors.extend(
        _group_reference_errors(
            package.assembly.groups,
            package.assembly.placements,
        )
    )
    return errors


def _empty_scene_reference_errors(package: ChapterScenePackage) -> list[str]:
    if not package.assembly.placements:
        return []
    current_id = package.current_empty_scene_image_id
    if current_id and package.assembly.empty_scene_image_id == current_id:
        return []
    return [
        "Assembly manifest empty_scene_image_id must match current_empty_scene_image_id when placements exist."
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
                "Placement "
                f"{placement.id} references unknown or unavailable asset_id: {placement.asset_id}"
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
        placement_id
        for placement_id in placement_ids
        if placement_id not in order_id_set
    ]
    extra_in_order = [
        placement_id
        for placement_id in layer_order
        if placement_id not in placement_id_set
    ]
    if missing_in_order:
        errors.append(
            f"layer_order is missing placement ids: {', '.join(missing_in_order)}"
        )
    if extra_in_order:
        errors.append(
            "layer_order references unknown placement ids: "
            + ", ".join(extra_in_order)
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
