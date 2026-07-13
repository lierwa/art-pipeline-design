from __future__ import annotations

from pathlib import Path

import pytest

from art_pipeline.course_planner.scene_package_errors import (
    ScenePackagePreconditionError,
)
from art_pipeline.course_planner.scene_package_models import (
    AssemblyPlacement,
    AssemblyTransform,
    ChapterSceneAssembly,
)
from scene_package_store_helpers import (
    make_manifest,
    make_png_bytes,
    make_store_with_chapter_asset,
    make_store_with_prompt,
    make_store_with_selected_empty_scene,
    seed_current_prompt_package,
)


def test_lock_final_scene_requires_selected_empty_scene(tmp_path: Path) -> None:
    store, chapter = make_store_with_prompt(tmp_path)

    with pytest.raises(
        ScenePackagePreconditionError,
        match="selected Empty Scene Image",
    ):
        store.lock_final_chapter_scene(
            chapter.id,
            image_bytes=make_png_bytes(width=96, height=64),
            original_filename="final.png",
        )


def test_lock_final_scene_rejects_zero_placements(
    tmp_path: Path,
) -> None:
    store, chapter, _ = make_store_with_selected_empty_scene(tmp_path)
    package = store.read_chapter_scene_package(chapter.id)
    store.save_chapter_scene_assembly(
        chapter.id,
        ChapterSceneAssembly(
            empty_scene_image_id=package.current_empty_scene_image_id,
            empty_scene_size=package.assembly.empty_scene_size,
            placements=[],
            groups=[],
            layer_order=[],
        ),
    )

    with pytest.raises(ScenePackagePreconditionError, match="at least one placement"):
        store.lock_final_chapter_scene(
            chapter.id,
            image_bytes=make_png_bytes(width=96, height=64),
            original_filename="final.png",
        )


def test_lock_final_scene_records_snapshot(tmp_path: Path) -> None:
    store, chapter, asset = make_store_with_chapter_asset(tmp_path)
    package = store.read_chapter_scene_package(chapter.id)
    store.save_chapter_scene_assembly(
        chapter.id,
        make_manifest(
            asset_id=asset.id,
            empty_scene_image_id=package.current_empty_scene_image_id or "empty_scene_001",
            empty_scene_size=package.assembly.empty_scene_size,
        ),
    )

    locked = store.lock_final_chapter_scene(
        chapter.id,
        image_bytes=make_png_bytes(width=120, height=80),
        original_filename="final.png",
    )

    assert locked.final_scene is not None
    assert locked.final_scene.empty_scene_image_id == locked.current_empty_scene_image_id
    assert locked.final_scene.assembly_snapshot.empty_scene_image_id == (
        locked.current_empty_scene_image_id
    )
    assert locked.final_scene.reference_snapshot.current_empty_scene_image_id == (
        locked.current_empty_scene_image_id
    )
    assert locked.final_scene.storage_path.startswith("final_scene/")


def test_upload_after_library_replacement_has_no_prompt_lineage(
    tmp_path: Path,
) -> None:
    store, chapter, _ = make_store_with_selected_empty_scene(tmp_path)
    package = store.read_chapter_scene_package(chapter.id)
    character = store.get_character_ip(package.selected_character_ip_ids[0])
    assert package.scene_style_reference_id is not None
    style = store.get_scene_style_reference(package.scene_style_reference_id)
    first = store.add_complete_scene_image(
        chapter.id,
        image_bytes=make_png_bytes(width=96, height=64),
        original_filename="generated-v1.png",
        prompt_snapshot=None,
        generation_note="",
    ).complete_images[-1]

    updated_character = store.update_character_ip(
        character.id,
        display_name=None,
        image_bytes=make_png_bytes(width=640, height=360),
        original_filename="tuantuan-v2.png",
    )
    updated_style = store.update_scene_style_reference(
        style.id,
        display_name=None,
        image_bytes=make_png_bytes(width=640, height=360),
        original_filename="warm-v2.png",
    )
    second = store.add_complete_scene_image(
        chapter.id,
        image_bytes=make_png_bytes(width=96, height=64),
        original_filename="generated-v2.png",
        prompt_snapshot=None,
        generation_note="",
    ).complete_images[-1]

    assert first.reference_snapshot.reference_image_ids == [
        character.current_model_sheet_id,
        style.current_image_id,
    ]
    assert updated_character.current_model_sheet_id != character.current_model_sheet_id
    assert updated_style.current_image_id != style.current_image_id
    assert second.prompt_snapshot == ""
    assert second.reference_snapshot.reference_image_ids == []


def test_lock_final_scene_rejects_missing_target_coverage_in_saved_manifest(
    tmp_path: Path,
) -> None:
    store, chapter, asset = make_store_with_chapter_asset(tmp_path)
    package = store.read_chapter_scene_package(chapter.id)
    store.save_chapter_scene_assembly(
        chapter.id,
        make_manifest(
            asset_id=asset.id,
            empty_scene_image_id=package.current_empty_scene_image_id or "empty_scene_001",
            empty_scene_size=package.assembly.empty_scene_size,
        ),
    )
    seed_current_prompt_package(
        store,
        chapter.id,
        target_labels=("book", "lamp"),
    )

    with pytest.raises(
        ScenePackagePreconditionError,
        match="target object coverage",
    ):
        store.lock_final_chapter_scene(
            chapter.id,
            image_bytes=make_png_bytes(width=120, height=80),
            original_filename="final.png",
        )


def test_lock_final_scene_captures_placed_asset_snapshot_for_every_placement(
    tmp_path: Path,
) -> None:
    store, chapter, first_asset = make_store_with_chapter_asset(tmp_path)
    seed_current_prompt_package(
        store,
        chapter.id,
        target_labels=("book", "cloth"),
    )
    package_with_second_asset = store.add_direct_chapter_asset(
        chapter.id,
        image_bytes=make_png_bytes(width=48, height=48),
        original_filename="cloth.png",
        display_name="cloth",
        linked_target_object_id="target_object_002",
    )
    second_asset = package_with_second_asset.chapter_assets[-1]
    package = store.read_chapter_scene_package(chapter.id)
    store.save_chapter_scene_assembly(
        chapter.id,
        ChapterSceneAssembly(
            empty_scene_image_id=package.current_empty_scene_image_id,
            empty_scene_size=package.assembly.empty_scene_size,
            placements=[
                AssemblyPlacement(
                    id="placement_book",
                    asset_id=first_asset.id,
                    display_name=first_asset.display_name,
                    transform=AssemblyTransform(
                        cx=0.35,
                        cy=0.45,
                        w=0.2,
                        h=0.2,
                        rotation_deg=0,
                    ),
                    requires_placed=[],
                ),
                AssemblyPlacement(
                    id="placement_cloth",
                    asset_id=second_asset.id,
                    display_name=second_asset.display_name,
                    transform=AssemblyTransform(
                        cx=0.65,
                        cy=0.55,
                        w=0.18,
                        h=0.18,
                        rotation_deg=15,
                    ),
                    requires_placed=[],
                ),
            ],
            groups=[],
            layer_order=["placement_book", "placement_cloth"],
        ),
    )

    locked = store.lock_final_chapter_scene(
        chapter.id,
        image_bytes=make_png_bytes(width=120, height=80),
        original_filename="final.png",
    )

    assert locked.final_scene is not None
    assert [asset_snapshot.placement_id for asset_snapshot in locked.final_scene.placed_assets] == [
        "placement_book",
        "placement_cloth",
    ]
    assert locked.final_scene.placed_assets[0].asset_id == first_asset.id
    assert locked.final_scene.placed_assets[0].display_name == first_asset.display_name
    assert locked.final_scene.placed_assets[0].original_filename == first_asset.original_filename
    assert locked.final_scene.placed_assets[0].storage_path == first_asset.storage_path
    assert locked.final_scene.placed_assets[0].media_type == first_asset.media_type
    assert locked.final_scene.placed_assets[0].lineage == first_asset.lineage
    assert locked.final_scene.placed_assets[0].linked_target_object_id == (
        first_asset.linked_target_object_id
    )
    assert locked.final_scene.placed_assets[0].status == "available"


def test_lock_final_scene_snapshot_survives_later_chapter_asset_removal(
    tmp_path: Path,
) -> None:
    store, chapter, asset = make_store_with_chapter_asset(tmp_path)
    package = store.read_chapter_scene_package(chapter.id)
    store.save_chapter_scene_assembly(
        chapter.id,
        make_manifest(
            asset_id=asset.id,
            empty_scene_image_id=package.current_empty_scene_image_id or "empty_scene_001",
            empty_scene_size=package.assembly.empty_scene_size,
        ),
    )
    locked = store.lock_final_chapter_scene(
        chapter.id,
        image_bytes=make_png_bytes(width=120, height=80),
        original_filename="final.png",
    )
    assert locked.final_scene is not None

    updated = store.delete_chapter_asset(chapter.id, asset.id)

    assert updated.final_scene is not None
    assert updated.chapter_assets[0].status == "removed"
    assert updated.assembly.placements == []
    assert updated.final_scene.assembly_snapshot.placements[0].asset_id == asset.id
    assert updated.final_scene.placed_assets[0].asset_id == asset.id
    assert updated.final_scene.placed_assets[0].display_name == asset.display_name
    assert updated.final_scene.placed_assets[0].status == "available"


def test_delete_complete_scene_image_preserves_direct_upload_assets_and_final_snapshot(
    tmp_path: Path,
) -> None:
    store, chapter, asset = make_store_with_chapter_asset(tmp_path)
    package = store.read_chapter_scene_package(chapter.id)
    store.save_chapter_scene_assembly(
        chapter.id,
        make_manifest(
            asset_id=asset.id,
            empty_scene_image_id=package.current_empty_scene_image_id or "empty_scene_001",
            empty_scene_size=package.assembly.empty_scene_size,
        ),
    )
    locked = store.lock_final_chapter_scene(
        chapter.id,
        image_bytes=make_png_bytes(width=120, height=80),
        original_filename="final.png",
    )
    complete_image = locked.complete_images[0]
    assert locked.final_scene is not None

    updated = store.delete_complete_scene_image(chapter.id, complete_image.id)

    assert updated.complete_images[0].status == "deleted"
    assert updated.chapter_assets[0].id == asset.id
    assert updated.chapter_assets[0].status == "available"
    assert updated.final_scene is not None
    assert updated.final_scene.id == locked.final_scene.id
    assert updated.final_scene.assembly_snapshot.placements[0].asset_id == asset.id


def test_lock_final_scene_rejects_unknown_or_removed_asset_references(
    tmp_path: Path,
) -> None:
    store, chapter, asset = make_store_with_chapter_asset(tmp_path)
    package = store.read_chapter_scene_package(chapter.id)
    store.save_chapter_scene_assembly(
        chapter.id,
        make_manifest(
            asset_id=asset.id,
            empty_scene_image_id=package.current_empty_scene_image_id or "empty_scene_001",
            empty_scene_size=package.assembly.empty_scene_size,
        ),
    )
    package = store.read_chapter_scene_package(chapter.id)
    stale_package = package.model_copy(
        update={
            "chapter_assets": [
                item.model_copy(update={"status": "removed"}) if item.id == asset.id else item
                for item in package.chapter_assets
            ]
        }
    )
    store.write_chapter_scene_package(stale_package, validate_assembly=False)

    with pytest.raises(
        ScenePackagePreconditionError,
        match="unknown or unavailable asset_id",
    ):
        store.lock_final_chapter_scene(
            chapter.id,
            image_bytes=make_png_bytes(width=120, height=80),
            original_filename="final.png",
        )
