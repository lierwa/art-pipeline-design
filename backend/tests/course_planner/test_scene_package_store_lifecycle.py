from __future__ import annotations

from pathlib import Path

import pytest

from art_pipeline.course_planner.scene_package_models import (
    ChapterSceneAssembly,
    ChapterScenePackage,
)
from scene_package_store_helpers import (
    make_manifest,
    make_store_with_chapter,
    make_store_with_chapter_asset,
    make_store_with_empty_scene_image,
    make_store_with_prompt,
    make_store_with_selected_empty_scene,
    make_stub_chapter_asset,
    scene_package_assembly_json_path,
)


def test_read_chapter_scene_package_lazily_creates_package(tmp_path: Path) -> None:
    store, chapter = make_store_with_chapter(tmp_path)

    package = store.read_chapter_scene_package(chapter.id)
    package_json_path = (
        tmp_path
        / "scene_library"
        / "scene_packs"
        / chapter.scene_pack_id
        / "chapters"
        / chapter.id
        / "scene_package"
        / "package.json"
    )
    assembly_path = package_json_path.parent / "assembly.json"

    assert package.chapter_id == chapter.id
    assert package_json_path.exists()
    assert assembly_path.exists()


def test_update_scene_package_prompt_persists_prompt_targets_and_avoid_objects(
    tmp_path: Path,
) -> None:
    store, chapter = make_store_with_chapter(tmp_path)

    package = store.update_chapter_scene_prompt(
        chapter.id,
        prompt_text="A low-shadow bedroom empty scene.",
        scene_spatial_contract="Bed against back wall, desk by window, floor kept clear.",
        target_objects=[
            {"label": "book"},
            {
                "label": "pencil",
                "description": "yellow body",
                "priority": "core",
            },
        ],
        avoid_objects=[{"label": "shattered glass", "description": "unsafe prop"}],
        prompt_confirmations={
            "avoid_objects_reviewed": True,
            "style_reference_mode": "confirmed_empty",
        },
        reference_selections=[
            {
                "reference_image_id": "reference_style_001",
                "prompt_role": "style",
                "notes": "warm palette",
            }
        ],
    )

    reloaded = store.read_chapter_scene_package(chapter.id)

    assert package.prompt.prompt_text == "A low-shadow bedroom empty scene."
    assert package.prompt.scene_spatial_contract.startswith("Bed against back wall")
    assert package.prompt.updated_at is not None
    assert [(item.label, item.description, item.priority) for item in reloaded.target_objects] == [
        ("book", "", "required"),
        ("pencil", "yellow body", "core"),
    ]
    assert [(item.label, item.description) for item in reloaded.avoid_objects] == [
        ("shattered glass", "unsafe prop")
    ]
    assert reloaded.prompt_confirmations.avoid_objects_reviewed is True
    assert reloaded.prompt_confirmations.style_reference_mode == "confirmed_empty"
    assert reloaded.reference_selections[0].reference_image_id == "reference_style_001"


def test_update_scene_package_prompt_preserves_omitted_fields_and_clears_explicit_empty(
    tmp_path: Path,
) -> None:
    store, chapter = make_store_with_prompt(tmp_path)
    seeded = store.update_chapter_scene_prompt(
        chapter.id,
        prompt_text="A low-shadow bedroom empty scene.",
        scene_spatial_contract="Bed against back wall, desk by window, floor kept clear.",
        target_objects=[{"label": "book"}],
        avoid_objects=[{"label": "shattered glass"}],
        prompt_confirmations={
            "avoid_objects_reviewed": True,
            "style_reference_mode": "confirmed_empty",
        },
    )

    preserved = store.update_chapter_scene_prompt(
        chapter.id,
        prompt_text="A brighter bedroom empty scene.",
    )
    cleared = store.update_chapter_scene_prompt(
        chapter.id,
        prompt_text="A brighter bedroom empty scene.",
        scene_spatial_contract="",
        avoid_objects=[],
        reference_selections=[],
    )

    assert preserved.prompt.prompt_text == "A brighter bedroom empty scene."
    assert preserved.prompt.scene_spatial_contract == seeded.prompt.scene_spatial_contract
    assert preserved.avoid_objects == seeded.avoid_objects
    assert cleared.prompt.scene_spatial_contract == ""
    assert cleared.avoid_objects == []
    assert cleared.reference_selections == []


def test_write_chapter_scene_package_round_trips_assembly(tmp_path: Path) -> None:
    store, chapter, asset = make_store_with_chapter_asset(tmp_path)
    current = store.read_chapter_scene_package(chapter.id)
    package = current.model_copy(
        update={
            "assembly": make_manifest(
                asset_id=asset.id,
                empty_scene_image_id=current.current_empty_scene_image_id or "empty_scene_001",
                empty_scene_size=current.assembly.empty_scene_size,
            )
        }
    )

    written = store.write_chapter_scene_package(package)
    reloaded = store.read_chapter_scene_package(chapter.id)
    assembly_json_path = scene_package_assembly_json_path(tmp_path, chapter)

    assert written == package
    assert reloaded.assembly == package.assembly
    assert assembly_json_path.exists()
    assert store._read_model(assembly_json_path, ChapterSceneAssembly) == package.assembly


def test_save_chapter_scene_assembly_persists_valid_manifest(tmp_path: Path) -> None:
    store, chapter, asset = make_store_with_chapter_asset(tmp_path)
    current = store.read_chapter_scene_package(chapter.id)
    manifest = make_manifest(
        asset_id=asset.id,
        empty_scene_image_id=current.current_empty_scene_image_id or "empty_scene_001",
        empty_scene_size=current.assembly.empty_scene_size,
    )

    package = store.save_chapter_scene_assembly(chapter.id, manifest)
    reloaded = store.read_chapter_scene_package(chapter.id)
    assembly_json_path = scene_package_assembly_json_path(tmp_path, chapter)
    mirrored_manifest = store._read_model(assembly_json_path, ChapterSceneAssembly)

    assert package.assembly.placements[0].asset_id == asset.id
    assert package.assembly.layer_order == [package.assembly.placements[0].id]
    assert package.assembly.updated_at is not None
    assert reloaded.assembly == package.assembly
    assert mirrored_manifest == package.assembly


def test_save_chapter_scene_assembly_rejects_missing_asset(tmp_path: Path) -> None:
    store, chapter, empty_scene = make_store_with_selected_empty_scene(tmp_path)

    with pytest.raises(ValueError, match="asset_id"):
        store.save_chapter_scene_assembly(
            chapter.id,
            make_manifest(
                asset_id="missing_asset",
                empty_scene_image_id=empty_scene.id,
                empty_scene_size={"width": empty_scene.width, "height": empty_scene.height},
            ),
        )


def test_save_chapter_scene_assembly_rejects_mismatched_current_empty_scene(
    tmp_path: Path,
) -> None:
    store, chapter, asset = make_store_with_chapter_asset(tmp_path)
    current = store.read_chapter_scene_package(chapter.id)

    with pytest.raises(ValueError, match="empty_scene_image_id"):
        store.save_chapter_scene_assembly(
            chapter.id,
            make_manifest(
                asset_id=asset.id,
                empty_scene_image_id="empty_scene_wrong",
                empty_scene_size=current.assembly.empty_scene_size,
            ),
        )


@pytest.mark.parametrize("method_name", ["save", "write"])
def test_rejects_assembly_placements_before_any_selected_empty_scene_exists(
    tmp_path: Path,
    method_name: str,
) -> None:
    store, chapter = make_store_with_prompt(tmp_path)
    current = store.read_chapter_scene_package(chapter.id)
    package_with_asset = store.write_chapter_scene_package(
        current.model_copy(update={"chapter_assets": [make_stub_chapter_asset()]})
    )
    manifest = make_manifest(asset_id=package_with_asset.chapter_assets[0].id)

    with pytest.raises(ValueError, match="current_empty_scene_image_id"):
        if method_name == "save":
            store.save_chapter_scene_assembly(chapter.id, manifest)
        else:
            store.write_chapter_scene_package(
                package_with_asset.model_copy(update={"assembly": manifest})
            )


def test_scene_package_read_and_update_reject_mismatched_chapter_id(tmp_path: Path) -> None:
    store, chapter = make_store_with_chapter(tmp_path)
    package_path = (
        tmp_path
        / "scene_library"
        / "scene_packs"
        / chapter.scene_pack_id
        / "chapters"
        / chapter.id
        / "scene_package"
        / "package.json"
    )
    package_path.parent.mkdir(parents=True, exist_ok=True)
    store._write_model(
        package_path,
        ChapterScenePackage(chapter_id="chapter_wrong"),
    )

    with pytest.raises(ValueError, match="Scene package chapter_id"):
        store.read_chapter_scene_package(chapter.id)

    with pytest.raises(ValueError, match="Scene package chapter_id"):
        store.update_chapter_scene_prompt(
            chapter.id,
            prompt_text="A brighter bedroom empty scene.",
        )


def test_select_empty_scene_image_sets_current_without_locking_complete_images(
    tmp_path: Path,
) -> None:
    store, chapter, image = make_store_with_empty_scene_image(tmp_path)

    selected = store.select_empty_scene_image(chapter.id, image.id)

    assert selected.current_empty_scene_image_id == image.id
    assert selected.assembly.empty_scene_image_id == image.id
    assert selected.assembly.empty_scene_size == {"width": image.width, "height": image.height}
