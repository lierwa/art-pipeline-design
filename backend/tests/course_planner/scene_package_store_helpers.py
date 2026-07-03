from __future__ import annotations

from io import BytesIO
from pathlib import Path

from PIL import Image

from art_pipeline.course_planner.models import Chapter, ChapterSeed, CharacterConceptHint
from art_pipeline.course_planner.scene_package_models import (
    AssemblyGroup,
    AssemblyPlacement,
    AssemblyTransform,
    ChapterAsset,
    ChapterAssetLineage,
    ChapterReferenceSelection,
    ChapterSceneAssembly,
    ChapterScenePackage,
    CompleteSceneImage,
    EmptySceneImage,
)
from art_pipeline.course_planner.store import CoursePlannerStore


def seeded_course_planner_store(tmp_path: Path) -> CoursePlannerStore:
    return CoursePlannerStore(tmp_path / "scene_library")


def seed_chapter(store: CoursePlannerStore) -> Chapter:
    scene_pack = store.create_scene_pack(title="室内家庭篇", intent="家庭日常空间")
    return store.create_chapter_from_seed(
        scene_pack.id,
        chapter_seed(scene_pack_id=scene_pack.id, scene_pack_title=scene_pack.title),
    )


def make_store_with_chapter(tmp_path: Path) -> tuple[CoursePlannerStore, Chapter]:
    store = seeded_course_planner_store(tmp_path)
    return store, seed_chapter(store)


def make_store_with_prompt(tmp_path: Path) -> tuple[CoursePlannerStore, Chapter]:
    store, chapter = make_store_with_chapter(tmp_path)
    store.update_chapter_scene_prompt(
        chapter.id,
        prompt_text="A low-shadow bedroom empty scene.",
        scene_spatial_contract="Bed against back wall, desk by window, floor kept clear.",
        target_objects=[{"label": "book"}],
        avoid_objects=[{"label": "shattered glass"}],
    )
    return store, chapter


def make_store_with_prompt_and_reference_selection(
    tmp_path: Path,
) -> tuple[CoursePlannerStore, Chapter, str]:
    store, chapter = make_store_with_prompt(tmp_path)
    package = store.update_chapter_scene_prompt(
        chapter.id,
        prompt_text="A low-shadow bedroom empty scene.",
        reference_selections=[
            {
                "reference_image_id": "reference_style_001",
                "prompt_role": "style",
                "notes": "warm palette",
            }
        ],
    )
    return store, chapter, package.reference_selections[0].reference_image_id


def make_store_with_empty_scene_image(
    tmp_path: Path,
) -> tuple[CoursePlannerStore, Chapter, EmptySceneImage]:
    store, chapter = make_store_with_prompt(tmp_path)
    package = store.add_empty_scene_image(
        chapter.id,
        image_bytes=make_png_bytes(width=72, height=48),
        original_filename="empty.png",
        prompt_snapshot=None,
        reference_image_ids=[],
    )
    return store, chapter, package.empty_scene_images[0]


def make_store_with_selected_empty_scene(
    tmp_path: Path,
) -> tuple[CoursePlannerStore, Chapter, EmptySceneImage]:
    store, chapter, image = make_store_with_empty_scene_image(tmp_path)
    store.select_empty_scene_image(chapter.id, image.id)
    selected = store.read_chapter_scene_package(chapter.id).empty_scene_images[0]
    return store, chapter, selected


def make_store_with_complete_image(
    tmp_path: Path,
) -> tuple[CoursePlannerStore, Chapter, CompleteSceneImage]:
    store, chapter, image = make_store_with_selected_empty_scene(tmp_path)
    package = store.add_complete_scene_image(
        chapter.id,
        image_bytes=make_png_bytes(width=96, height=64),
        original_filename="complete.png",
        prompt_snapshot=None,
        reference_image_ids=[],
        generation_note="brighter morning light",
    )
    complete = package.complete_images[0]
    assert complete.empty_scene_image_id == image.id
    return store, chapter, complete


def make_store_with_chapter_asset(
    tmp_path: Path,
) -> tuple[CoursePlannerStore, Chapter, ChapterAsset]:
    store, chapter, image = make_store_with_complete_image(tmp_path)
    package = store.add_chapter_asset_from_run_asset(
        chapter.id,
        source_run_id="run_123",
        source_run_asset_id="asset_456",
        source_complete_image_id=image.id,
        image_bytes=make_png_bytes(width=32, height=32),
        original_filename="book.png",
        display_name="book",
        linked_target_object_id="target_object_001",
    )
    return store, chapter, package.chapter_assets[0]


def make_store_with_two_empty_scene_images_and_assembly(
    tmp_path: Path,
) -> tuple[CoursePlannerStore, Chapter, EmptySceneImage, EmptySceneImage]:
    store, chapter = make_store_with_prompt(tmp_path)
    first_package = store.add_empty_scene_image(
        chapter.id,
        image_bytes=make_png_bytes(width=72, height=48),
        original_filename="empty-old.png",
        prompt_snapshot=None,
        reference_image_ids=[],
    )
    second_package = store.add_empty_scene_image(
        chapter.id,
        image_bytes=make_png_bytes(width=144, height=96),
        original_filename="empty-new.png",
        prompt_snapshot=None,
        reference_image_ids=[],
    )
    old_image, new_image = second_package.empty_scene_images
    store.select_empty_scene_image(chapter.id, old_image.id)
    direct_package = store.add_direct_chapter_asset(
        chapter.id,
        image_bytes=make_png_bytes(width=32, height=32),
        original_filename="book.png",
        display_name="book",
        linked_target_object_id="target_object_001",
    )
    store.save_chapter_scene_assembly(
        chapter.id,
        make_manifest(
            asset_id=direct_package.chapter_assets[0].id,
            empty_scene_image_id=old_image.id,
            empty_scene_size={"width": old_image.width, "height": old_image.height},
        ),
    )
    complete_package = store.add_complete_scene_image(
        chapter.id,
        image_bytes=make_png_bytes(width=96, height=64),
        original_filename="complete.png",
        prompt_snapshot=None,
        reference_image_ids=[],
        generation_note="brighter morning light",
    )
    assert complete_package.complete_images[0].empty_scene_image_id == old_image.id
    return store, chapter, old_image, new_image


def scene_package_json_path(tmp_path: Path, chapter: Chapter) -> Path:
    return (
        tmp_path
        / "scene_library"
        / "scene_packs"
        / chapter.scene_pack_id
        / "chapters"
        / chapter.id
        / "scene_package"
        / "package.json"
    )


def scene_package_assembly_json_path(tmp_path: Path, chapter: Chapter) -> Path:
    return scene_package_json_path(tmp_path, chapter).parent / "assembly.json"


def chapter_seed(*, scene_pack_id: str, scene_pack_title: str) -> ChapterSeed:
    return ChapterSeed(
        scene_pack_id=scene_pack_id,
        scene_pack_title=scene_pack_title,
        chapter_id="chapter_candidate_from_ai",
        chapter_title="厨房早餐打翻",
        chapter_intent="厨房早餐打翻的日常家庭场景。",
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


def make_manifest(
    *,
    asset_id: str,
    empty_scene_image_id: str = "empty_scene_001",
    empty_scene_size: dict[str, int] | None = None,
) -> ChapterSceneAssembly:
    return ChapterSceneAssembly(
        empty_scene_image_id=empty_scene_image_id,
        empty_scene_size=empty_scene_size or {"width": 72, "height": 48},
        placements=[
            AssemblyPlacement(
                id="placement_001",
                asset_id=asset_id,
                display_name="book",
                transform=AssemblyTransform(
                    cx=0.5,
                    cy=0.5,
                    w=0.25,
                    h=0.25,
                    rotation_deg=0,
                ),
                group_id="group_001",
            )
        ],
        groups=[
            AssemblyGroup(
                id="group_001",
                display_name="foreground set",
                placement_ids=["placement_001"],
            )
        ],
        layer_order=["placement_001"],
    )


def make_stub_chapter_asset(asset_id: str = "chapter_asset_001") -> ChapterAsset:
    return ChapterAsset(
        id=asset_id,
        display_name="book",
        original_filename="book.png",
        storage_path=f"assets/{asset_id}.png",
        media_type="image/png",
        lineage=ChapterAssetLineage(source_kind="direct_upload"),
        linked_target_object_id="target_object_001",
        created_at="2026-07-03T10:06:00Z",
    )


def make_stub_reference_selection(
    reference_image_id: str = "reference_style_001",
) -> ChapterReferenceSelection:
    return ChapterReferenceSelection(
        id="reference_selection_001",
        reference_image_id=reference_image_id,
        prompt_role="style",
        notes="warm palette",
    )


def make_png_bytes(*, width: int = 8, height: int = 6) -> bytes:
    image = Image.new("RGBA", (width, height), (120, 45, 200, 255))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()
