from __future__ import annotations

from art_pipeline.course_planner.models import (
    ObjectPlan,
    PlannedObject,
    PromptPackage,
    SceneDirectorPlan,
)


def build_prompt_package(
    scene_director_plan: SceneDirectorPlan,
    object_plan: ObjectPlan,
) -> PromptPackage:
    planned_objects = _planned_objects(object_plan)
    if not planned_objects:
        raise ValueError("Prompt package requires at least one object plan item.")

    object_lines = [_format_object(item) for item in planned_objects]
    full_prompt = "\n".join(
        [
            "Scene Director Plan:",
            f"- Story event: {scene_director_plan.story_event}",
            f"- Composition: {scene_director_plan.scene_composition}",
            f"- Spatial structure: {scene_director_plan.spatial_structure}",
            f"- Characters: {scene_director_plan.character_arrangement}",
            f"- Action design: {scene_director_plan.action_design}",
            "Object Plan:",
            *object_lines,
            f"Style and constraints: {scene_director_plan.style_and_constraints}",
        ]
    )
    # WHY: PromptPackage 是复制给图像模型的边界；从两个可编辑计划即时生成，
    # 避免旧检测关键词协议成为第二套事实源。代价是对象为空时直接拒绝。
    return PromptPackage(
        full_prompt=full_prompt,
        short_prompt=f"{scene_director_plan.story_event} {planned_objects[0].name}",
        negative_constraints=f"text, watermark, logo, blurry, low quality; {scene_director_plan.style_and_constraints}",
    )


build_image2_prompt_package = build_prompt_package


def _planned_objects(object_plan: ObjectPlan) -> list[PlannedObject]:
    return [
        *object_plan.core_objects,
        *object_plan.required_objects,
        *object_plan.recommended_objects,
        *object_plan.avoid_or_move_objects,
    ]


def _format_object(item: PlannedObject) -> str:
    placement = f", placement: {item.placement_hint}" if item.placement_hint else ""
    return f"- [{item.priority}] {item.name}: {item.role_in_scene}{placement}"
