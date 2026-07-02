from __future__ import annotations

from io import BytesIO
from pathlib import Path

from PIL import Image

from art_pipeline.course_planner.models import Chapter, ChapterSeed, CharacterConceptHint
from art_pipeline.course_planner.scene_package_models import (
    AssemblyGroup,
    AssemblyPlacement,
    AssemblyTransform,
    ChapterAssetLineage,
    ChapterSceneAssembly,
    ChapterAsset,
    CompleteSceneImage,
    EmptyBaseSceneCandidate,
)
from art_pipeline.course_planner.store import CoursePlannerStore


def make_store_with_chapter(tmp_path: Path) -> tuple[CoursePlannerStore, Chapter]:
    store = CoursePlannerStore(tmp_path / "scene_library")
    scene_pack = store.create_scene_pack(title="室内家庭篇", intent="家庭日常空间")
    chapter = store.create_chapter_from_seed(
        scene_pack.id,
        chapter_seed(scene_pack_id=scene_pack.id, scene_pack_title=scene_pack.title),
    )
    return store, chapter


def make_store_with_complete_image(
    tmp_path: Path,
) -> tuple[CoursePlannerStore, Chapter, CompleteSceneImage]:
    store, chapter, locked_base_id, reference_id = make_store_with_locked_base(tmp_path)
    package = store.add_complete_scene_image(
        chapter.id,
        image_bytes=make_png_bytes(width=96, height=64),
        original_filename="complete.png",
        prompt_snapshot=None,
        reference_ids=[reference_id],
        variation_prompt="brighter morning light",
    )
    image = package.complete_images[0]
    assert image.base_candidate_id == locked_base_id
    return store, chapter, image


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


def make_store_with_prompt_and_reference(
    tmp_path: Path,
) -> tuple[CoursePlannerStore, Chapter, str]:
    store, chapter = make_store_with_chapter(tmp_path)
    store.update_chapter_scene_prompt(
        chapter.id,
        prompt_text="A low-shadow bedroom base scene.",
        negative_constraints="No hard shadows.",
        style_notes="Soft watercolor edges.",
        target_objects=[{"label": "book"}],
    )
    package = store.add_chapter_scene_reference(
        chapter.id,
        image_bytes=make_png_bytes(width=32, height=24),
        original_filename="style.png",
        prompt_role="style",
    )
    return store, chapter, package.references[0].id


def make_store_with_base_candidate(
    tmp_path: Path,
) -> tuple[CoursePlannerStore, Chapter, EmptyBaseSceneCandidate]:
    store, chapter, reference_id = make_store_with_prompt_and_reference(tmp_path)
    package = store.add_empty_base_scene_candidate(
        chapter.id,
        image_bytes=make_png_bytes(width=72, height=48),
        original_filename="base.png",
        prompt_snapshot=None,
        reference_ids=[reference_id],
    )
    return store, chapter, package.base_candidates[0]


def make_store_with_locked_base(
    tmp_path: Path,
) -> tuple[CoursePlannerStore, Chapter, str, str]:
    store, chapter, reference_id = make_store_with_prompt_and_reference(tmp_path)
    candidate_package = store.add_empty_base_scene_candidate(
        chapter.id,
        image_bytes=make_png_bytes(width=72, height=48),
        original_filename="base.png",
        prompt_snapshot=None,
        reference_ids=[reference_id],
    )
    locked_base_id = candidate_package.base_candidates[0].id
    store.write_chapter_scene_package(
        candidate_package.model_copy(update={"locked_base_candidate_id": locked_base_id})
    )
    return store, chapter, locked_base_id, reference_id


def make_store_with_locked_base_and_assembly(
    tmp_path: Path,
) -> tuple[
    CoursePlannerStore,
    Chapter,
    EmptyBaseSceneCandidate,
    EmptyBaseSceneCandidate,
]:
    store, chapter, reference_id = make_store_with_prompt_and_reference(tmp_path)
    initial_package = store.add_empty_base_scene_candidate(
        chapter.id,
        image_bytes=make_png_bytes(width=72, height=48),
        original_filename="base-old.png",
        prompt_snapshot=None,
        reference_ids=[reference_id],
    )
    initial_package = store.add_empty_base_scene_candidate(
        chapter.id,
        image_bytes=make_png_bytes(width=144, height=96),
        original_filename="base-new.png",
        prompt_snapshot=None,
        reference_ids=[reference_id],
    )
    old_candidate, new_candidate = initial_package.base_candidates
    store.write_chapter_scene_package(
        initial_package.model_copy(
            update={
                "locked_base_candidate_id": old_candidate.id,
                "base_candidates": [
                    old_candidate.model_copy(
                        update={
                            "status": "locked",
                            "locked_at": "2026-07-02T10:00:00Z",
                        }
                    ),
                    new_candidate,
                ],
            }
        )
    )
    complete_package = store.add_complete_scene_image(
        chapter.id,
        image_bytes=make_png_bytes(width=96, height=64),
        original_filename="complete.png",
        prompt_snapshot=None,
        reference_ids=[reference_id],
        variation_prompt="brighter morning light",
    )
    complete = complete_package.complete_images[0]
    asset_package = store.add_chapter_asset_from_run_asset(
        chapter.id,
        source_run_id="run_123",
        source_run_asset_id="asset_456",
        source_complete_image_id=complete.id,
        image_bytes=make_png_bytes(width=32, height=32),
        original_filename="book.png",
        display_name="book",
        linked_target_object_id="target_object_001",
    )
    store.save_chapter_scene_assembly(
        chapter.id,
        make_manifest(
            asset_id=asset_package.chapter_assets[0].id,
            base_candidate_id=old_candidate.id,
            base_size={"width": old_candidate.width, "height": old_candidate.height},
        ),
    )
    return store, chapter, old_candidate, new_candidate


def make_manifest(
    *,
    asset_id: str,
    base_candidate_id: str | None,
    base_size: dict[str, int] | None = None,
) -> ChapterSceneAssembly:
    return ChapterSceneAssembly(
        base_candidate_id=base_candidate_id,
        base_size=base_size or {"width": 72, "height": 48},
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
        lineage=ChapterAssetLineage(
            source_run_id="run_stub",
            source_run_asset_id=f"source_{asset_id}",
        ),
        linked_target_object_id="target_object_001",
        created_at="2026-07-02T10:06:00Z",
    )


def make_png_bytes(*, width: int = 8, height: int = 6) -> bytes:
    image = Image.new("RGBA", (width, height), (120, 45, 200, 255))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()
