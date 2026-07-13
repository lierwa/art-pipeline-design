from __future__ import annotations

from art_pipeline.course_planner.scene_package_models import ChapterScenePackage


def is_prompt_package_current(
    package: ChapterScenePackage,
    *,
    character_model_sheet_ids: dict[str, str],
    scene_style_image_id: str | None,
    global_reference_image_ids: list[str] | None = None,
) -> bool:
    prompt_package = package.current_prompt_package
    if prompt_package is None:
        return False
    snapshot = prompt_package.reference_snapshot
    direction_ids = [
        direction.character_ip_id for direction in prompt_package.cast_directions
    ]
    snapshot_character_ids = [
        item.character_ip_id for item in snapshot.character_model_sheets
    ]
    snapshot_model_sheet_ids = [
        item.model_sheet_id for item in snapshot.character_model_sheets
    ]
    current_model_sheet_ids = [
        character_model_sheet_ids.get(character_id)
        for character_id in package.selected_character_ip_ids
    ]
    # WHY: Prompt 是否有效只由生成时冻结的输入与当前权威输入比较得出；不额外落盘
    # stale 标志，避免选择、库媒体和布尔状态形成多个同等权威事实源。
    return all(
        (
            direction_ids == package.selected_character_ip_ids,
            snapshot_character_ids == package.selected_character_ip_ids,
            snapshot_model_sheet_ids == current_model_sheet_ids,
            snapshot.scene_style_reference_id == package.scene_style_reference_id,
            snapshot.scene_style_image_id == scene_style_image_id,
            snapshot.current_empty_scene_image_id
            == package.current_empty_scene_image_id,
            snapshot.global_reference_image_ids
            == (global_reference_image_ids or []),
        )
    )
