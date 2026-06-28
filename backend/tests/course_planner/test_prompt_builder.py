from __future__ import annotations

import pytest

from art_pipeline.course_planner.models import (
    ObjectPlan,
    PlannedObject,
    SceneDirectorPlan,
)
from art_pipeline.course_planner.prompt_builder import build_prompt_package


def test_prompt_builder_uses_scene_director_and_object_plan_without_learning_data() -> None:
    scene_plan = SceneDirectorPlan(
        story_event="孩子在水槽前清洗红苹果。",
        scene_composition="中景构图，水槽和苹果位于视觉中心。",
        spatial_structure="水槽前景，餐桌后景，冰箱左侧。",
        character_arrangement="孩子站在水槽前，家长在背景。",
        action_design="孩子双手托着苹果放在水流下。",
        style_and_constraints="温暖绘本风格，避免文字和水印。",
    )
    object_plan = ObjectPlan(
        core_objects=[
            PlannedObject(
                name="红苹果",
                role_in_scene="动作目标",
                placement_hint="孩子双手之间",
                priority="core",
            )
        ],
        required_objects=[
            PlannedObject(
                name="水槽",
                role_in_scene="主要空间锚点",
                placement_hint="画面前景",
                priority="required",
            )
        ],
    )

    package = build_prompt_package(scene_plan, object_plan)
    repeated = build_prompt_package(scene_plan, object_plan)

    assert package == repeated
    assert "孩子在水槽前清洗红苹果" in package.full_prompt
    assert "红苹果" in package.full_prompt
    assert "水槽" in package.full_prompt
    assert "文字和水印" in package.negative_constraints
    assert package.short_prompt is not None
    assert "learning" not in package.full_prompt.lower()
    assert "lesson" not in package.full_prompt.lower()
    assert "vocabulary" not in package.full_prompt.lower()
    assert "target_level" not in package.full_prompt.lower()


def test_prompt_builder_rejects_empty_object_plan() -> None:
    scene_plan = SceneDirectorPlan(
        story_event="孩子在水槽前清洗红苹果。",
        scene_composition="中景构图，水槽和苹果位于视觉中心。",
        spatial_structure="水槽前景，餐桌后景，冰箱左侧。",
        character_arrangement="孩子站在水槽前，家长在背景。",
        action_design="孩子双手托着苹果放在水流下。",
        style_and_constraints="温暖绘本风格，避免文字和水印。",
    )

    with pytest.raises(ValueError, match="object plan"):
        build_prompt_package(scene_plan, ObjectPlan())
