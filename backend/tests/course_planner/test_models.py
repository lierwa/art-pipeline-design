from __future__ import annotations

import pytest
from pydantic import ValidationError

from art_pipeline.course_planner.models import (
    CharacterConceptHint,
    Chapter,
    ChapterSeed,
    CourseProject,
    ImageAttempt,
    ObjectPlan,
    PlannedObject,
    PromptPackage,
    PromptVersion,
    SceneDirectorPlan,
    SceneKeywords,
    ScenePack,
    Space,
)


def test_scene_keywords_are_plain_strings() -> None:
    keywords = SceneKeywords(
        chapter_id="chapter_001",
        keywords=["cat", "bathtub", "window"],
    )

    assert keywords.keywords == ["cat", "bathtub", "window"]


def test_scene_keywords_reject_structured_keyword_objects() -> None:
    with pytest.raises(ValidationError):
        SceneKeywords(
            chapter_id="chapter_001",
            keywords=[{"text": "cup"}],
        )


def test_scene_keywords_reject_empty_keyword_strings() -> None:
    with pytest.raises(ValidationError):
        SceneKeywords(chapter_id="chapter_001", keywords=[""])


def test_course_project_defaults_to_language_pair() -> None:
    course = CourseProject(id="course_001", title_zh="猫咪浴室冒险")

    assert course.app_language == "zh-CN"
    assert course.target_language == "en"


def test_space_rejects_legacy_manual_planning_fields() -> None:
    space = Space(
        id="space_001",
        course_id="course_001",
        title_zh="浴室",
        target_language="en",
        storyline_mode="linear",
        space_type="bathroom",
        notes="Keep scenes simple.",
        order=1,
    )

    assert space.model_dump() == {
        "id": "space_001",
        "course_id": "course_001",
        "title_zh": "浴室",
        "target_language": "en",
        "storyline_mode": "linear",
        "space_type": "bathroom",
        "notes": "Keep scenes simple.",
        "order": 1,
    }

    with pytest.raises(ValidationError):
        Space(
            id="space_001",
            course_id="course_001",
            title_zh="浴室",
            target_language="en",
            target_level="A1",
            storyline_mode="linear",
            space_type="bathroom",
            order=1,
        )

    with pytest.raises(ValidationError):
        Space(
            id="space_001",
            course_id="course_001",
            title_zh="浴室",
            target_language="en",
            chapter_count=3,
            storyline_mode="linear",
            space_type="bathroom",
            order=1,
        )


def test_scene_pack_chapter_prompt_version_attempt_hierarchy_round_trips() -> None:
    pack = _scene_pack()
    chapter = _chapter(scene_pack_id=pack.id)
    version = _prompt_version(chapter_id=chapter.id)
    attempt = ImageAttempt(
        id="attempt_001",
        prompt_version_id=version.id,
        uploaded_image_id="img_001",
    )

    assert chapter.scene_pack_id == pack.id
    assert version.chapter_id == chapter.id
    assert attempt.prompt_version_id == version.id
    assert pack.chapter_ids == []
    assert not hasattr(pack, "target_level")
    assert not hasattr(pack, "chapter_count")


def test_scene_pack_rejects_user_facing_course_generation_fields() -> None:
    with pytest.raises(ValidationError):
        ScenePack(
            id="pack_001",
            title="室内家庭篇",
            intent="覆盖家庭日常空间",
            target_level="A1",
        )

    with pytest.raises(ValidationError):
        ScenePack(
            id="pack_001",
            title="室内家庭篇",
            intent="覆盖家庭日常空间",
            chapter_count=6,
        )


def test_chapter_seed_contains_context_without_final_prompt() -> None:
    seed = _chapter_seed()

    assert seed.chapter_title == "厨房早餐打翻"
    assert seed.object_coverage_hint == ["milk", "cup", "plate", "tissue"]
    assert not hasattr(seed, "full_prompt")
    assert not hasattr(seed, "prompt")


def test_chapter_seed_rejects_final_prompt_fields() -> None:
    payload = _chapter_seed().model_dump()
    payload["full_prompt"] = "final prompt belongs to PromptPackage"

    with pytest.raises(ValidationError):
        ChapterSeed(**payload)


def test_chapter_seed_rejects_target_level_and_chapter_count() -> None:
    payload = _chapter_seed().model_dump()
    payload["target_level"] = "A1"

    with pytest.raises(ValidationError):
        ChapterSeed(**payload)

    payload = _chapter_seed().model_dump()
    payload["chapter_count"] = 6

    with pytest.raises(ValidationError):
        ChapterSeed(**payload)


def test_prompt_version_owns_director_object_and_prompt_package() -> None:
    version = _prompt_version(chapter_id="chapter_001")

    assert version.scene_director_plan.story_event == "孩子不小心打翻牛奶。"
    assert version.object_plan.core_objects[0].name == "milk"
    assert version.prompt_package.full_prompt.startswith("Warm kitchen")
    assert version.image_attempt_ids == []


def _scene_pack() -> ScenePack:
    return ScenePack(
        id="pack_001",
        title="室内家庭篇",
        intent="覆盖家庭日常空间",
    )


def _chapter(scene_pack_id: str = "pack_001") -> Chapter:
    return Chapter(
        id="chapter_001",
        scene_pack_id=scene_pack_id,
        title="厨房早餐打翻",
        summary="早餐准备时牛奶被打翻，家人一起处理。",
        seed=_chapter_seed(scene_pack_id=scene_pack_id),
        sort_order=1,
    )


def _chapter_seed(
    *,
    scene_pack_id: str = "pack_001",
    scene_pack_title: str = "室内家庭篇",
) -> ChapterSeed:
    return ChapterSeed(
        scene_pack_id=scene_pack_id,
        scene_pack_title=scene_pack_title,
        chapter_id="chapter_001",
        chapter_title="厨房早餐打翻",
        chapter_intent="用厨房早餐事件组织室内家庭场景。",
        scene_domain="home_kitchen",
        daily_moment="breakfast",
        event_seed="孩子不小心打翻牛奶，家长拿纸巾处理。",
        spatial_seed="厨房台面、餐桌、水槽、冰箱和地面活动区。",
        object_coverage_hint=["milk", "cup", "plate", "tissue"],
        character_concept_hint=CharacterConceptHint(
            main_cast_hint="温和的家庭主角",
            supporting_cast_hint="帮忙整理的家人",
            reference_asset_ids=["asset_main_cast"],
            constraints=["保持儿童绘本风格"],
        ),
        style_notes="温暖、明亮、低冲突。",
    )


def _prompt_version(chapter_id: str = "chapter_001") -> PromptVersion:
    return PromptVersion(
        id="version_001",
        chapter_id=chapter_id,
        version_label="V001",
        title="温馨厨房早餐版",
        scene_director_plan=SceneDirectorPlan(
            story_event="孩子不小心打翻牛奶。",
            scene_composition="餐桌居中，角色围绕桌边形成清晰动作线。",
            spatial_structure="前景餐桌，中景水槽，背景冰箱。",
            character_arrangement="主角在桌边，家人在旁边递纸巾。",
            action_design="牛奶流向桌沿，纸巾正被递出。",
            style_and_constraints="明亮绘本质感，避免混乱构图。",
        ),
        object_plan=ObjectPlan(
            core_objects=[
                PlannedObject(
                    name="milk",
                    role_in_scene="触发故事事件",
                    placement_hint="餐桌中央倒下的杯子旁",
                    priority="core",
                )
            ],
            required_objects=[
                PlannedObject(
                    name="tissue",
                    role_in_scene="解决事件的动作道具",
                    priority="required",
                )
            ],
        ),
        prompt_package=PromptPackage(
            full_prompt="Warm kitchen breakfast scene with spilled milk.",
            negative_constraints="No clutter, no scary mood.",
        ),
    )
