from __future__ import annotations

import pytest

from art_pipeline.course_planner.models import (
    CastBinding,
    ObjectPlan,
    PlannedObject,
    SceneDirectorPlan,
    SceneVocabulary,
    PromptTuning,
)
from art_pipeline.course_planner.prompt_builder import build_prompt_package


def test_prompt_builder_uses_scene_first_cast_and_vocabulary_without_hard_required_objects() -> None:
    scene_plan = SceneDirectorPlan(
        story_event="团团在水槽前清洗红苹果。",
        scene_composition="中景构图，水槽和苹果位于视觉中心。",
        spatial_structure="水槽前景，餐桌后景，冰箱左侧。",
        character_arrangement="团团站在水槽前，阿布在背景记录。",
        action_design="团团双手托着苹果放在水流下。",
        style_and_constraints="温暖绘本风格，避免文字和水印。",
    )
    cast_bindings = [
        CastBinding(
            character_id="tuantuan",
            display_name="团团",
            role_in_scene="main",
            action_intent="在水槽前清洗红苹果。",
            reference_image_ids=["docs/image-reference/01_主方向_生活化猫咪主角团.png"],
            invariants=["白色蓬松猫", "黄色小包", "背带裤"],
        ),
        CastBinding(
            character_id="abu",
            display_name="阿布",
            role_in_scene="support",
            action_intent="在背景观察并记录。",
            reference_image_ids=["docs/image-reference/04_主角轮廓与动作板.png"],
            invariants=["暹罗猫", "圆眼镜", "绿本子"],
        ),
    ]
    scene_vocabulary = SceneVocabulary(
        narrative_anchors=["red apple", "sink faucet"],
        optional_vocabulary_candidates=["cup", "plate", "chair", "window"],
        ambient_furnishing_policy="自然补足温暖家庭厨房细节，但不要堆成物品目录。",
        avoid_objects=["knife", "human child", "parent"],
    )
    prompt_tuning = PromptTuning(
        style_anchor="生活化猫咪主角团，暖色温柔绘本质感。",
        style_reference_image_ids=["docs/image-reference/01_主方向_生活化猫咪主角团.png"],
        scene_reference_image_ids=["docs/image-reference/05_生活场景适配换装板.png"],
        must_keep=["single-species cat cast", "scene-first story moment"],
        avoid=["human student", "object catalog layout"],
    )

    package = build_prompt_package(scene_plan, cast_bindings, scene_vocabulary, prompt_tuning)
    repeated = build_prompt_package(scene_plan, cast_bindings, scene_vocabulary, prompt_tuning)

    assert package == repeated
    assert package.full_prompt.startswith("Create one high-quality ChatGPT Image2 illustration.")
    assert "Output goal:" in package.full_prompt
    assert "Style anchor:" in package.full_prompt
    assert "Selected character IP and role assignment:" in package.full_prompt
    assert "Character invariants:" in package.full_prompt
    assert "Scene / story event:" in package.full_prompt
    assert "Composition and camera:" in package.full_prompt
    assert "Spatial layout:" in package.full_prompt
    assert "Narrative anchors:" in package.full_prompt
    assert "Optional scene vocabulary candidates:" in package.full_prompt
    assert "Use these only when they naturally fit the scene" in package.full_prompt
    assert "Do not force every candidate object into the image" in package.full_prompt
    assert "Reference image usage:" in package.full_prompt
    assert "Constraints / avoid list:" in package.full_prompt
    assert "团团在水槽前清洗红苹果" in package.full_prompt
    assert "tuantuan" in package.full_prompt
    assert "阿布" in package.full_prompt
    assert "红苹果" in package.full_prompt
    assert "水槽" in package.full_prompt
    assert "cup, plate, chair, window" in package.full_prompt
    assert "Required objects by priority:" not in package.full_prompt
    assert "[CORE]" not in package.full_prompt
    assert "[REQUIRED]" not in package.full_prompt
    assert "文字和水印" in package.negative_constraints
    assert "Scene Director Plan:" not in package.full_prompt
    assert "Object Plan:" not in package.full_prompt
    assert package.short_prompt is not None
    assert package.revision_prompt is not None
    assert "preserve the same style anchor" in package.revision_prompt
    assert "learning" not in package.full_prompt.lower()
    assert "lesson" not in package.full_prompt.lower()
    assert "target_level" not in package.full_prompt.lower()
    assert "student" not in package.full_prompt.lower()
    assert "child" not in package.full_prompt.lower()
    assert "parent" not in package.full_prompt.lower()


def test_prompt_builder_rejects_missing_cast_bindings() -> None:
    scene_plan = SceneDirectorPlan(
        story_event="团团在水槽前清洗红苹果。",
        scene_composition="中景构图，水槽和苹果位于视觉中心。",
        spatial_structure="水槽前景，餐桌后景，冰箱左侧。",
        character_arrangement="团团站在水槽前。",
        action_design="团团双手托着苹果放在水流下。",
        style_and_constraints="温暖绘本风格，避免文字和水印。",
    )

    with pytest.raises(ValueError, match="cast bindings"):
        build_prompt_package(
            scene_plan,
            [],
            SceneVocabulary(narrative_anchors=["red apple"]),
            PromptTuning(style_anchor="生活化猫咪主角团。"),
        )
