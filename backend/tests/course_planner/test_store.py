from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

import art_pipeline.course_planner.store as store_module
from art_pipeline.course_planner.models import (
    CharacterConceptHint,
    ChapterSeed,
    CourseProject,
    SceneCard,
    SceneKeywords,
    Space,
)
from art_pipeline.course_planner.store import CoursePlannerStore


def test_store_persists_course_space_scene_and_keywords(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    scene_library = tmp_path / "scene_library"
    planner_store = CoursePlannerStore(scene_library)
    replace_calls: list[tuple[Path, Path]] = []
    original_replace = store_module.os.replace

    def tracking_replace(source: Path | str, target: Path | str) -> None:
        replace_calls.append((Path(source), Path(target)))
        original_replace(source, target)

    monkeypatch.setattr(store_module.os, "replace", tracking_replace)

    course = CourseProject(id="course_001", title_zh="猫咪浴室冒险")
    space = Space(
        id="space_001",
        course_id=course.id,
        title_zh="浴室",
        target_language="en",
        storyline_mode="linear",
        space_type="bathroom",
        notes="Bright morning.",
        order=1,
    )
    scene = SceneCard(
        chapter_id="chapter_001",
        title_zh="浴缸旁边",
        visual_brief_zh="小猫站在浴缸旁边，窗户透进阳光。",
        image2_style="storybook illustration",
    )
    keywords = SceneKeywords(
        chapter_id="chapter_001",
        keywords=["cat", "bathtub", "window"],
    )

    planner_store.write_course(course)
    planner_store.write_space(course.id, space)
    planner_store.write_scene_card(course.id, space.id, "chapter_001", scene)
    planner_store.write_scene_keywords(course.id, space.id, "chapter_001", keywords)

    assert planner_store.read_course(course.id) == course
    assert planner_store.read_space(course.id, space.id) == space
    assert planner_store.read_scene_card(course.id, space.id, "chapter_001") == scene
    assert planner_store.read_scene_keywords(course.id, space.id, "chapter_001") == keywords

    assert len(replace_calls) == 4
    for temp_path, target_path in replace_calls:
        assert target_path.is_relative_to(scene_library)
        assert temp_path.parent == target_path.parent
        assert temp_path.name.endswith(".tmp")
        assert not temp_path.exists()


@pytest.mark.parametrize(
    "bad_id",
    ["../outside", "..\\outside", "bad/id", "bad\\id"],
)
def test_store_rejects_path_escape_ids(tmp_path: Path, bad_id: str) -> None:
    scene_library = tmp_path / "scene_library"
    planner_store = CoursePlannerStore(scene_library)
    course = CourseProject(id="course_001", title_zh="猫咪浴室冒险")

    with pytest.raises(ValueError, match="must be a slug"):
        planner_store.write_space(
            course.id,
            Space(
                id=bad_id,
                course_id=course.id,
                title_zh="浴室",
                target_language="en",
                storyline_mode="linear",
                space_type="bathroom",
                notes="",
                order=1,
            ),
        )

    assert not (tmp_path / "outside").exists()
    assert not (scene_library / "courses" / course.id / "spaces").exists()


def test_store_rejects_malformed_chapters_payload(tmp_path: Path) -> None:
    scene_library = tmp_path / "scene_library"
    planner_store = CoursePlannerStore(scene_library)
    chapters_path = (
        scene_library
        / "courses"
        / "course_001"
        / "spaces"
        / "space_001"
        / "chapters.json"
    )
    chapters_path.parent.mkdir(parents=True)
    # WHY: 缺失 chapters key 代表持久化协议损坏，不能被误读成空章节列表。
    chapters_path.write_text("{}", encoding="utf-8")

    with pytest.raises(ValidationError):
        planner_store.read_chapters("course_001", "space_001")


def test_create_scene_pack_generates_id_and_lists_round_trip(tmp_path: Path) -> None:
    planner_store = CoursePlannerStore(tmp_path / "scene_library")

    pack = planner_store.create_scene_pack(
        title="室内家庭篇",
        intent="覆盖家庭日常空间",
        notes="先做厨房和客厅。",
    )

    assert pack.id.startswith("scene_pack_")
    assert pack.title == "室内家庭篇"
    assert pack.chapter_ids == []
    assert planner_store.get_scene_pack(pack.id) == pack
    assert planner_store.list_scene_packs() == [pack]


def test_update_scene_pack_validates_before_persisting(tmp_path: Path) -> None:
    planner_store = CoursePlannerStore(tmp_path / "scene_library")
    pack = planner_store.create_scene_pack(title="室内家庭篇", intent="家庭日常空间")

    with pytest.raises(ValidationError):
        planner_store.update_scene_pack(pack.id, title="")

    assert planner_store.get_scene_pack(pack.id) == pack

    with pytest.raises(ValidationError):
        planner_store.update_scene_pack(pack.id, status="deleted")

    assert planner_store.get_scene_pack(pack.id) == pack


def test_scene_pack_updates_archive_and_delete_keep_chapter_tree_available(
    tmp_path: Path,
) -> None:
    planner_store = CoursePlannerStore(tmp_path / "scene_library")
    pack = planner_store.create_scene_pack(title="室内家庭篇", intent="家庭日常空间")
    chapter = planner_store.create_chapter_from_seed(
        pack.id,
        _chapter_seed(scene_pack_id=pack.id, scene_pack_title=pack.title),
    )

    updated = planner_store.update_scene_pack(
        pack.id,
        title="厨房专项",
        intent="专注厨房动作",
        notes="减少跨空间移动。",
        status="active",
    )
    archived = planner_store.archive_scene_pack(pack.id)

    assert updated.title == "厨房专项"
    assert updated.status == "active"
    assert archived.status == "archived"

    planner_store.delete_scene_pack(pack.id)

    deleted = planner_store.get_scene_pack(pack.id)
    assert deleted.status == "archived"
    assert deleted.chapter_ids == [chapter.id]
    assert [stored.id for stored in planner_store.list_chapters(pack.id)] == [chapter.id]


def test_scene_pack_chapter_list_is_single_source_of_truth(tmp_path: Path) -> None:
    planner_store = CoursePlannerStore(tmp_path / "scene_library")
    pack = planner_store.create_scene_pack(title="室内家庭篇", intent="家庭日常空间")

    chapter = planner_store.create_chapter_from_seed(
        pack.id,
        _chapter_seed(scene_pack_id=pack.id, scene_pack_title=pack.title),
    )

    loaded = planner_store.get_scene_pack(pack.id)
    assert loaded.chapter_ids == [chapter.id]
    assert [stored.id for stored in planner_store.list_chapters(pack.id)] == [chapter.id]
    assert len(planner_store.list_chapters(pack.id)) == len(loaded.chapter_ids)
    assert chapter.id != "chapter_001"


def test_chapter_count_is_derived_from_scene_pack_chapter_ids(tmp_path: Path) -> None:
    planner_store = CoursePlannerStore(tmp_path / "scene_library")
    pack = planner_store.create_scene_pack(title="室内家庭篇", intent="家庭日常空间")

    planner_store.create_chapter_from_seed(
        pack.id,
        _chapter_seed(scene_pack_id=pack.id, scene_pack_title=pack.title),
    )
    planner_store.create_chapter_from_seed(
        pack.id,
        _chapter_seed(
            scene_pack_id=pack.id,
            scene_pack_title=pack.title,
            chapter_title="客厅收拾玩具",
        ),
    )

    loaded = planner_store.get_scene_pack(pack.id)
    assert len(loaded.chapter_ids) == 2
    assert len(planner_store.list_chapters(pack.id)) == 2
    assert not hasattr(loaded, "chapter_count")


def test_reorder_chapters_uses_scene_pack_chapter_ids_as_source_of_truth(
    tmp_path: Path,
) -> None:
    planner_store = CoursePlannerStore(tmp_path / "scene_library")
    pack = planner_store.create_scene_pack(title="室内家庭篇", intent="家庭日常空间")
    first = planner_store.create_chapter_from_seed(
        pack.id,
        _chapter_seed(scene_pack_id=pack.id, scene_pack_title=pack.title),
    )
    second = planner_store.create_chapter_from_seed(
        pack.id,
        _chapter_seed(
            scene_pack_id=pack.id,
            scene_pack_title=pack.title,
            chapter_title="客厅收拾玩具",
        ),
    )

    reordered = planner_store.reorder_chapters(pack.id, [second.id, first.id])

    assert reordered.chapter_ids == [second.id, first.id]
    assert [chapter.id for chapter in planner_store.list_chapters(pack.id)] == [
        second.id,
        first.id,
    ]
    assert [chapter.sort_order for chapter in planner_store.list_chapters(pack.id)] == [1, 2]


def test_reorder_chapters_rejects_missing_or_foreign_ids(tmp_path: Path) -> None:
    planner_store = CoursePlannerStore(tmp_path / "scene_library")
    pack = planner_store.create_scene_pack(title="室内家庭篇", intent="家庭日常空间")
    chapter = planner_store.create_chapter_from_seed(
        pack.id,
        _chapter_seed(scene_pack_id=pack.id, scene_pack_title=pack.title),
    )

    with pytest.raises(ValueError, match="chapter_ids must match existing chapter list"):
        planner_store.reorder_chapters(pack.id, [chapter.id, "chapter_missing"])


def test_legacy_write_chapters_api_is_not_available_for_scene_pack_chapters() -> None:
    assert not hasattr(CoursePlannerStore, "write_chapters")


def _chapter_seed(
    *,
    scene_pack_id: str,
    scene_pack_title: str,
    chapter_title: str = "厨房早餐打翻",
) -> ChapterSeed:
    return ChapterSeed(
        scene_pack_id=scene_pack_id,
        scene_pack_title=scene_pack_title,
        chapter_id="chapter_candidate_from_ai",
        chapter_title=chapter_title,
        chapter_intent=f"{chapter_title}的日常家庭场景。",
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
