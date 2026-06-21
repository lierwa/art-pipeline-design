from __future__ import annotations

from collections.abc import Collection

from art_pipeline.elements import AssetRole, ElementRecord, WorkspaceState, validate_element_id
from art_pipeline.workspace.state_updates import replace_workspace_elements


def apply_element_role_patch(
    state: WorkspaceState,
    element: ElementRecord,
    asset_role_patch: AssetRole | None,
    remove_from_parent_patch: str | None,
    fields_set: Collection[str],
) -> ElementRecord:
    if "assetRole" not in fields_set and "removeFromParent" not in fields_set:
        return element

    asset_role = asset_role_patch if "assetRole" in fields_set else element.assetRole
    if asset_role is None:
        raise ValueError("Asset role must not be null.")

    remove_from_parent = (
        remove_from_parent_patch
        if "removeFromParent" in fields_set
        else element.removeFromParent
    )

    if asset_role != "removable_child":
        # WHY: 修复/导出阶段只会对可摘除子物体读取父物体引用；其他角色保留该值
        # 会让后续流水线误以为需要从父图中做扣除，所以在角色切换时统一收敛为单一事实。
        remove_from_parent = None
    elif remove_from_parent is None:
        # WHY: 角色切换与父物体选择是 UI 的两步动作；None 表示“待选择父物体”，
        # 不会被修复/导出当作已有父关系消费，但允许 Inspector 进入父物体选择状态。
        pass
    elif remove_from_parent == "":
        # WHY: 空字符串既不是合法父关系，也不是明确的 pending 状态；持久化它会让
        # 后续修复/导出边界无法区分“未选择”和“坏引用”，所以在 API 边界拒绝。
        raise ValueError("removeFromParent must reference an existing parent element.")
    else:
        _validate_remove_from_parent_target(state, element.id, remove_from_parent)

    return element.model_copy(
        update={
            "assetRole": asset_role,
            "removeFromParent": remove_from_parent,
        }
    )


def apply_element_parent_relationship(
    state: WorkspaceState,
    element_id: str,
    parent_id: str | None,
) -> WorkspaceState:
    element = _state_element_by_id(state, element_id)
    if parent_id is None:
        updated_element = element.model_copy(
            update={
                "assetRole": "sticker",
                "parentId": None,
                "removeFromParent": None,
            }
        )
        return replace_workspace_elements(
            state,
            [
                updated_element if current.id == element_id else current
                for current in state.elements
            ],
        )

    _validate_parent_relationship_target(state, element_id, parent_id)
    parent = _state_element_by_id(state, parent_id)
    updated_elements: list[ElementRecord] = []
    for current in state.elements:
        if current.id == parent_id:
            updated_elements.append(
                current.model_copy(
                    update={
                        "assetRole": "parent",
                        "removeFromParent": None,
                    }
                )
            )
            continue
        if current.id == element_id:
            updated_elements.append(
                current.model_copy(
                    update={
                        "assetRole": "removable_child",
                        "parentId": parent.id,
                        "removeFromParent": parent.id,
                    }
                )
            )
            continue
        updated_elements.append(current)

    return replace_workspace_elements(state, updated_elements)


def _validate_remove_from_parent_target(
    state: WorkspaceState,
    element_id: str,
    parent_id: str,
) -> None:
    try:
        validate_element_id(parent_id)
    except ValueError as exc:
        raise ValueError("removeFromParent must reference an existing parent element.") from exc

    if parent_id == element_id:
        raise ValueError("removeFromParent must reference an existing parent element.")

    parent = next((element for element in state.elements if element.id == parent_id), None)
    if parent is None:
        raise ValueError("removeFromParent must reference an existing parent element.")
    if parent.assetRole != "parent":
        raise ValueError("removeFromParent must reference an element with parent role.")


def _validate_parent_relationship_target(
    state: WorkspaceState,
    element_id: str,
    parent_id: str,
) -> None:
    try:
        validate_element_id(parent_id)
    except ValueError as exc:
        raise ValueError("parentId must reference an existing parent element.") from exc
    if parent_id == element_id:
        raise ValueError("parentId must reference an existing parent element.")

    child = _state_element_by_id(state, element_id)
    parent = _state_element_by_id(state, parent_id)
    if _is_inactive_relationship_element(child) or _is_inactive_relationship_element(parent):
        raise ValueError("parentId must reference an active element.")
    if _parent_relationship_would_cycle(state, element_id, parent_id):
        raise ValueError("parentId must not create a parent cycle.")


def _state_element_by_id(state: WorkspaceState, element_id: str) -> ElementRecord:
    try:
        validate_element_id(element_id)
    except ValueError as exc:
        raise ValueError(f"Element {element_id!r} must be a valid element id.") from exc
    for element in state.elements:
        if element.id == element_id:
            return element
    raise ValueError(f"Element {element_id!r} was not found.")


def _is_inactive_relationship_element(element: ElementRecord) -> bool:
    return element.mode == "rejected" or element.status == "rejected" or element.mergedInto is not None


def _parent_relationship_would_cycle(
    state: WorkspaceState,
    element_id: str,
    parent_id: str,
) -> bool:
    parent_by_child = {
        element.id: element.parentId
        for element in state.elements
        if element.parentId is not None
    }
    current_parent = parent_id
    seen: set[str] = set()
    while current_parent:
        if current_parent == element_id:
            return True
        if current_parent in seen:
            return True
        seen.add(current_parent)
        current_parent = parent_by_child.get(current_parent)
    return False
