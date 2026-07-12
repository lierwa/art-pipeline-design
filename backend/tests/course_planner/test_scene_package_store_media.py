from __future__ import annotations

from pathlib import Path

import pytest

from art_pipeline.course_planner.scene_package_errors import (
    ScenePackageValidationError,
    UnknownEmptySceneImageError,
)
from art_pipeline.course_planner.scene_package_models import (
    ChapterSceneAssembly,
)
from scene_package_store_helpers import (
    make_png_bytes,
    make_store_with_chapter,
    make_store_with_complete_image,
    make_store_with_empty_scene_image,
    make_store_with_prompt,
    make_store_with_selected_empty_scene,
    make_store_with_two_empty_scene_images_and_assembly,
    scene_package_json_path,
)


def test_add_empty_scene_image_captures_prompt_and_reference_snapshot(
    tmp_path: Path,
) -> None:
    store, chapter = make_store_with_prompt(tmp_path)

    package = store.add_empty_scene_image(
        chapter.id,
        image_bytes=make_png_bytes(width=120, height=80),
        original_filename="empty.png",
        prompt_snapshot="Custom empty scene prompt snapshot.",
    )

    image = package.empty_scene_images[0]

    assert image.original_filename == "empty.png"
    assert image.storage_path == f"empty_scene_images/{image.id}.png"
    assert image.width == 120
    assert image.height == 80
    assert image.status == "available"
    assert image.prompt_snapshot == "Custom empty scene prompt snapshot."
    assert image.reference_snapshot.reference_image_ids == []
    assert image.reference_snapshot.current_empty_scene_image_id is None


def test_select_empty_scene_image_sets_current_without_locking_complete_images(
    tmp_path: Path,
) -> None:
    store, chapter, image = make_store_with_empty_scene_image(tmp_path)

    selected = store.select_empty_scene_image(chapter.id, image.id)

    assert selected.current_empty_scene_image_id == image.id
    assert selected.assembly.empty_scene_image_id is None
    assert selected.assembly.empty_scene_size is None
    assert selected.assembly.updated_at is None
    assert selected.empty_scene_images[0].status == "available"


def test_select_empty_scene_image_rejects_unknown_id(tmp_path: Path) -> None:
    store, chapter = make_store_with_chapter(tmp_path)

    with pytest.raises(UnknownEmptySceneImageError, match="Unknown empty scene image id"):
        store.select_empty_scene_image(chapter.id, "empty_scene_999")


def test_replacing_selected_empty_scene_preserves_source_history_and_assembly(
    tmp_path: Path,
) -> None:
    store, chapter, old_image, new_image = make_store_with_two_empty_scene_images_and_assembly(
        tmp_path
    )

    package = store.select_empty_scene_image(chapter.id, new_image.id)

    assert package.current_empty_scene_image_id == new_image.id
    assert package.assembly.empty_scene_image_id == old_image.id
    assert package.assembly.empty_scene_size == {
        "width": old_image.width,
        "height": old_image.height,
    }
    assert package.assembly.placements
    assert package.assembly.groups
    assert package.assembly.layer_order
    assert [
        image.status
        for image in package.complete_images
        if image.empty_scene_image_id == old_image.id
    ] == ["active"]


def test_saving_after_empty_scene_replacement_updates_manifest_and_preserves_assets_plus_runs(
    tmp_path: Path,
) -> None:
    store, chapter, old_image, new_image = make_store_with_two_empty_scene_images_and_assembly(
        tmp_path
    )
    selected = store.select_empty_scene_image(chapter.id, new_image.id)
    complete_image = selected.complete_images[0]
    store.record_complete_image_import_run(
        chapter.id,
        complete_image.id,
        run_id="run_alignment_review",
        run_status="ready",
    )

    saved = store.save_chapter_scene_assembly(
        chapter.id,
        ChapterSceneAssembly.model_validate({
            **selected.assembly.model_dump(mode="json"),
            "empty_scene_image_id": new_image.id,
            "empty_scene_size": {"width": new_image.width, "height": new_image.height},
        }),
    )

    assert saved.current_empty_scene_image_id == new_image.id
    assert saved.assembly.empty_scene_image_id == new_image.id
    assert saved.assembly.empty_scene_size == {
        "width": new_image.width,
        "height": new_image.height,
    }
    assert saved.assembly.updated_at is not None
    assert saved.chapter_assets == selected.chapter_assets
    assert saved.complete_images[0].id == complete_image.id
    assert saved.complete_images[0].pipeline_run_id == "run_alignment_review"
    assert saved.complete_images[0].pipeline_run_status == "ready"


def test_add_complete_scene_image_without_selected_empty_scene_is_allowed(
    tmp_path: Path,
) -> None:
    store, chapter = make_store_with_prompt(tmp_path)

    package = store.add_complete_scene_image(
        chapter.id,
        image_bytes=make_png_bytes(width=96, height=64),
        original_filename="complete.png",
        prompt_snapshot=None,
        generation_note="",
    )

    complete = package.complete_images[0]

    assert complete.empty_scene_image_id is None
    assert complete.status == "active"


def test_add_complete_scene_image_uses_selected_empty_scene_snapshot(
    tmp_path: Path,
) -> None:
    store, chapter, empty_scene = make_store_with_selected_empty_scene(tmp_path)
    image_bytes = make_png_bytes(width=96, height=64)

    package = store.add_complete_scene_image(
        chapter.id,
        image_bytes=image_bytes,
        original_filename="complete.png",
        prompt_snapshot=None,
        generation_note="brighter morning light",
    )

    complete = package.complete_images[0]
    complete_path, media_type = store.read_chapter_scene_package_media(
        chapter.id,
        "complete_images",
        complete.id,
    )

    assert complete.storage_path == f"complete_images/{complete.id}.png"
    assert complete.empty_scene_image_id == empty_scene.id
    assert complete.width == 96
    assert complete.height == 64
    assert complete.status == "active"
    assert "A low-shadow bedroom empty scene." in complete.prompt_snapshot
    assert "Bed against back wall" in complete.prompt_snapshot
    assert "Target objects: book" in complete.prompt_snapshot
    assert "Selected empty scene image" in complete.prompt_snapshot
    assert complete.reference_snapshot.current_empty_scene_image_id == empty_scene.id
    assert complete.generation_note == "brighter morning light"
    assert complete_path.read_bytes() == image_bytes
    assert media_type == "image/png"


def test_add_complete_scene_image_rejects_invalid_png_as_validation_error(
    tmp_path: Path,
) -> None:
    store, chapter, _ = make_store_with_selected_empty_scene(tmp_path)

    with pytest.raises(ScenePackageValidationError, match="valid PNG"):
        store.add_complete_scene_image(
            chapter.id,
            image_bytes=b"not-a-png",
            original_filename="complete.png",
            prompt_snapshot=None,
            generation_note="",
        )


def test_record_complete_image_import_run(tmp_path: Path) -> None:
    store, chapter, image = make_store_with_complete_image(tmp_path)

    package = store.record_complete_image_import_run(
        chapter.id,
        image.id,
        run_id="run_123",
        run_status="completed",
    )

    updated = package.complete_images[0]

    assert updated.pipeline_run_id == "run_123"
    assert updated.pipeline_run_status == "completed"


def test_add_direct_chapter_asset_materializes_copy(tmp_path: Path) -> None:
    store, chapter, _ = make_store_with_selected_empty_scene(tmp_path)
    image_bytes = make_png_bytes(width=32, height=32)

    package = store.add_direct_chapter_asset(
        chapter.id,
        image_bytes=image_bytes,
        original_filename="nested/direct/book.png",
        display_name="book",
        linked_target_object_id="target_object_001",
    )

    asset = package.chapter_assets[0]
    asset_path = scene_package_json_path(tmp_path, chapter).parent / asset.storage_path

    assert asset.display_name == "book"
    assert asset.original_filename == "book.png"
    assert asset.storage_path == f"assets/{asset.id}.png"
    assert asset.media_type == "image/png"
    assert asset.lineage.source_kind == "direct_upload"
    assert asset.linked_target_object_id == "target_object_001"
    assert asset.status == "available"
    assert asset_path.read_bytes() == image_bytes


def test_add_direct_chapter_asset_rejects_unknown_target_object(
    tmp_path: Path,
) -> None:
    store, chapter, _ = make_store_with_selected_empty_scene(tmp_path)

    with pytest.raises(ScenePackageValidationError, match="Unknown target object id"):
        store.add_direct_chapter_asset(
            chapter.id,
            image_bytes=make_png_bytes(width=32, height=32),
            original_filename="lamp.png",
            display_name="lamp",
            linked_target_object_id="target_object_missing",
        )


@pytest.mark.parametrize(
    "storage_path",
    [
        "/tmp/escape.png",
        "../escape.png",
        "empty_scene_images/../../escape.png",
    ],
)
def test_read_scene_package_media_rejects_storage_path_outside_package_root(
    tmp_path: Path,
    storage_path: str,
) -> None:
    store, chapter, _ = make_store_with_empty_scene_image(tmp_path)
    package_path = scene_package_json_path(tmp_path, chapter)
    package_payload = store.read_chapter_scene_package(chapter.id).model_dump(mode="json")
    package_payload["empty_scene_images"][0]["storage_path"] = storage_path
    store._write_json(package_path, package_payload)

    with pytest.raises(ValueError, match="package-relative"):
        store.read_chapter_scene_package_media(
            chapter.id,
            "empty_scene_images",
            "empty_scene_001",
        )


def test_scene_package_media_path_rejects_empty_storage_path(tmp_path: Path) -> None:
    store, chapter = make_store_with_chapter(tmp_path)

    with pytest.raises(ValueError, match="package-relative"):
        store._scene_package_media_path(
            chapter.scene_pack_id,
            chapter.id,
            "",
        )


def test_upload_methods_sanitize_original_filename_metadata(tmp_path: Path) -> None:
    store, chapter = make_store_with_prompt(tmp_path)
    empty_scene = store.add_empty_scene_image(
        chapter.id,
        image_bytes=make_png_bytes(width=72, height=48),
        original_filename=r"C:\foo\bar.png",
        prompt_snapshot=None,
    ).empty_scene_images[0]
    store.select_empty_scene_image(chapter.id, empty_scene.id)
    complete = store.add_complete_scene_image(
        chapter.id,
        image_bytes=make_png_bytes(width=96, height=64),
        original_filename="nested/final/scene.png",
        prompt_snapshot=None,
        generation_note="brighter morning light",
    ).complete_images[0]
    direct_asset = store.add_direct_chapter_asset(
        chapter.id,
        image_bytes=make_png_bytes(width=20, height=10),
        original_filename="/Users/alice/private.png",
        display_name="book",
    ).chapter_assets[0]

    package = store.read_chapter_scene_package(chapter.id)

    assert package.empty_scene_images[0].original_filename == "bar.png"
    assert complete.original_filename == "scene.png"
    assert direct_asset.original_filename == "private.png"
