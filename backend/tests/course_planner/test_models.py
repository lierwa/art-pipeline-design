from __future__ import annotations

import art_pipeline.course_planner.models as course_planner_models
import pytest
from pydantic import ValidationError

from art_pipeline.course_planner.models import (
    CharacterConceptHint,
    CharacterIpProfile,
    Chapter,
    ChapterSeed,
    CourseProject,
    LibraryImageAsset,
    SceneStyleReference,
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


def test_scene_pack_and_chapter_hierarchy_round_trips_without_prompt_runtime() -> None:
    pack = _scene_pack()
    chapter = _chapter(scene_pack_id=pack.id)

    assert chapter.scene_pack_id == pack.id
    assert pack.chapter_ids == []
    assert not hasattr(pack, "target_level")
    assert not hasattr(pack, "chapter_count")
    assert set(chapter.model_dump(mode="json")) == {
        "id",
        "scene_pack_id",
        "title",
        "summary",
        "seed",
        "sort_order",
        "status",
    }
    assert chapter.status == "draft"


@pytest.mark.parametrize(
    "legacy_status",
    [
        "_".join(("prompt", "ready")),
        "_".join(("has", "attempts")),
    ],
)
def test_chapter_rejects_legacy_prompt_runtime_status_values(legacy_status: str) -> None:
    payload = _chapter().model_dump()
    payload["status"] = legacy_status

    with pytest.raises(ValidationError):
        Chapter(**payload)


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
    payload["full_prompt"] = "final prompt belongs to old prompt runtime"

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


def test_library_image_asset_keeps_only_media_protocol_metadata() -> None:
    image = LibraryImageAsset(
        id="scene_style_image_001",
        original_filename="living-room-style.png",
        storage_path="global_reference_library/scene_style_references/style_001/media/scene_style_image_001.png",
        media_type="image/png",
        width=96,
        height=64,
        created_at="2026-07-03T10:00:00Z",
    )

    assert set(image.model_dump()) == {
        "id", "original_filename", "storage_path", "media_type", "width", "height", "created_at"
    }


def test_reference_library_image_rejects_invalid_storage_path() -> None:
    with pytest.raises(ValidationError, match="relative POSIX path"):
        LibraryImageAsset(
            id="reference_image_001",
            original_filename="living-room-style.png",
            storage_path="../escape.png",
            media_type="image/png",
            width=96,
            height=64,
            created_at="2026-07-03T10:00:00Z",
        )


def test_character_ip_and_scene_style_models_have_one_current_image_pointer() -> None:
    character = CharacterIpProfile(
        id="character_tuantuan",
        display_name="团团",
        current_model_sheet_id="character_model_sheet_001",
        created_at="2026-07-03T10:00:00Z",
    )
    style = SceneStyleReference(
        id="scene_style_warm",
        display_name="暖色绘本室内",
        current_image_id="scene_style_image_001",
        created_at="2026-07-03T10:00:00Z",
    )

    assert character.current_model_sheet_id == "character_model_sheet_001"
    assert style.current_image_id == "scene_style_image_001"
    assert character.updated_at is None


def test_models_module_does_not_export_dead_prompt_authoring_types() -> None:
    for legacy_name in (
        "".join(("Scene", "Director", "Plan")),
        "".join(("Object", "Plan")),
        "".join(("Cast", "Binding")),
        "".join(("Scene", "Vocabulary")),
        "".join(("Prompt", "Tuning")),
        "".join(("Scene", "Version")),
        "".join(("Scene", "Version", "Lock")),
        "".join(("AI", "Review")),
    ):
        assert not hasattr(course_planner_models, legacy_name)


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
