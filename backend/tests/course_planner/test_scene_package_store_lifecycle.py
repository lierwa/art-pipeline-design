from __future__ import annotations

from pathlib import Path

import pytest

from art_pipeline.course_planner.scene_package_errors import ScenePackageValidationError
from art_pipeline.course_planner.scene_package_models import (
    ChapterSceneAssembly,
    ChapterScenePackage,
)
from art_pipeline.course_planner.store import CoursePlannerStore
from scene_package_store_helpers import (
    make_manifest,
    make_png_bytes,
    make_store_with_base_candidate,
    make_store_with_chapter,
    make_store_with_chapter_asset,
    make_store_with_complete_image,
    make_store_with_locked_base,
    make_store_with_locked_base_and_assembly,
    make_store_with_prompt_and_reference,
    make_stub_chapter_asset,
    scene_package_assembly_json_path,
    scene_package_json_path,
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


def test_update_scene_package_prompt_persists_prompt_and_targets(tmp_path: Path) -> None:
    store, chapter = make_store_with_chapter(tmp_path)

    package = store.update_chapter_scene_prompt(
        chapter.id,
        prompt_text="A low-shadow bedroom base scene.",
        negative_constraints="No hard shadows.",
        style_notes="Soft watercolor edges.",
        target_objects=[
            {"label": "book"},
            {
                "label": "pencil",
                "description": "yellow body",
                "priority": "core",
            },
        ],
    )

    reloaded = store.read_chapter_scene_package(chapter.id)

    assert package.prompt.prompt_text == "A low-shadow bedroom base scene."
    assert package.prompt.negative_constraints == "No hard shadows."
    assert package.prompt.style_notes == "Soft watercolor edges."
    assert package.prompt.updated_at is not None
    assert package.prompt.prompt_text == reloaded.prompt.prompt_text
    assert package.prompt.negative_constraints == reloaded.prompt.negative_constraints
    assert package.prompt.style_notes == reloaded.prompt.style_notes
    assert package.prompt.updated_at == reloaded.prompt.updated_at
    assert [
        (item.label, item.description, item.priority)
        for item in reloaded.target_objects
    ] == [
        ("book", "", "required"),
        ("pencil", "yellow body", "core"),
    ]
    assert [item.id for item in reloaded.target_objects] == [
        "target_object_001",
        "target_object_002",
    ]


def test_update_scene_package_prompt_preserves_omitted_metadata_and_clears_explicit_empty(
    tmp_path: Path,
) -> None:
    store, chapter = make_store_with_chapter(tmp_path)
    seeded = store.update_chapter_scene_prompt(
        chapter.id,
        prompt_text="A low-shadow bedroom base scene.",
        negative_constraints="No hard shadows.",
        style_notes="Soft watercolor edges.",
        target_objects=[{"label": "book"}],
    )

    preserved = store.update_chapter_scene_prompt(
        chapter.id,
        prompt_text="A brighter bedroom base scene.",
    )
    cleared = store.update_chapter_scene_prompt(
        chapter.id,
        prompt_text="A brighter bedroom base scene.",
        negative_constraints="",
    )

    assert preserved.prompt.prompt_text == "A brighter bedroom base scene."
    assert preserved.prompt.negative_constraints == seeded.prompt.negative_constraints
    assert preserved.prompt.style_notes == seeded.prompt.style_notes
    assert cleared.prompt.negative_constraints == ""
    assert cleared.prompt.style_notes == seeded.prompt.style_notes


def test_write_chapter_scene_package_round_trips_assembly(tmp_path: Path) -> None:
    store, chapter, asset = make_store_with_chapter_asset(tmp_path)
    current = store.read_chapter_scene_package(chapter.id)
    package = current.model_copy(
        update={
            "assembly": make_manifest(
                asset_id=asset.id,
                base_candidate_id=current.locked_base_candidate_id,
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
    manifest = make_manifest(
        asset_id=asset.id,
        base_candidate_id=store.read_chapter_scene_package(chapter.id).locked_base_candidate_id,
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
    store, chapter = make_store_with_chapter(tmp_path)

    with pytest.raises(ValueError, match="asset"):
        store.save_chapter_scene_assembly(
            chapter.id,
            make_manifest(asset_id="missing_asset", base_candidate_id=None),
        )


def test_save_chapter_scene_assembly_rejects_mismatched_locked_base(tmp_path: Path) -> None:
    store, chapter, asset = make_store_with_chapter_asset(tmp_path)

    with pytest.raises(ValueError, match="base_candidate_id"):
        store.save_chapter_scene_assembly(
            chapter.id,
            make_manifest(asset_id=asset.id, base_candidate_id="base_candidate_wrong"),
        )


@pytest.mark.parametrize("method_name", ["save", "write"])


def test_rejects_assembly_placements_before_any_locked_base_exists(
    tmp_path: Path,
    method_name: str,
) -> None:
    store, chapter = make_store_with_chapter(tmp_path)
    current = store.read_chapter_scene_package(chapter.id)
    package_with_asset = store.write_chapter_scene_package(
        current.model_copy(update={"chapter_assets": [make_stub_chapter_asset()]})
    )
    manifest = make_manifest(
        asset_id=package_with_asset.chapter_assets[0].id,
        base_candidate_id=None,
    )

    with pytest.raises(ValueError, match="locked_base_candidate_id"):
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
            prompt_text="A brighter bedroom base scene.",
        )
