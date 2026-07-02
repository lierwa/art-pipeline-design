from __future__ import annotations

from pathlib import Path

import pytest

from art_pipeline.course_planner.scene_package_errors import ScenePackageValidationError
from art_pipeline.course_planner.scene_package_models import ChapterScenePackage
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


def test_add_scene_reference_generates_storage_name(tmp_path: Path) -> None:
    store, chapter = make_store_with_chapter(tmp_path)
    image_bytes = make_png_bytes(width=16, height=12)

    package = store.add_chapter_scene_reference(
        chapter.id,
        image_bytes=image_bytes,
        original_filename="ChatGPT Image Jul 1.png",
        prompt_role="style",
        notes="reference only",
    )

    reference = package.references[0]
    reference_path, media_type = store.read_chapter_scene_package_media(
        chapter.id,
        "references",
        reference.id,
    )

    assert reference.original_filename == "ChatGPT Image Jul 1.png"
    assert reference.storage_path.startswith("references/")
    assert "ChatGPT Image" not in reference.storage_path
    assert reference.storage_path == f"references/{reference.id}.png"
    assert reference_path.read_bytes() == image_bytes
    assert media_type == "image/png"


def test_add_base_candidate_captures_prompt_and_reference_snapshot(tmp_path: Path) -> None:
    store, chapter, reference_id = make_store_with_prompt_and_reference(tmp_path)

    package = store.add_empty_base_scene_candidate(
        chapter.id,
        image_bytes=make_png_bytes(width=120, height=80),
        original_filename="base.png",
        prompt_snapshot=None,
        reference_ids=[reference_id],
    )

    candidate = package.base_candidates[0]

    assert candidate.original_filename == "base.png"
    assert candidate.storage_path == f"base_candidates/{candidate.id}.png"
    assert candidate.width == 120
    assert candidate.height == 80
    assert candidate.status == "candidate"
    assert "A low-shadow bedroom base scene." in candidate.prompt_snapshot
    assert "Target objects: book" in candidate.prompt_snapshot
    assert "Style notes: Soft watercolor edges." in candidate.prompt_snapshot
    assert "Negative constraints: No hard shadows." in candidate.prompt_snapshot
    assert candidate.reference_snapshot.reference_ids == [reference_id]
    assert candidate.reference_snapshot.locked_base_candidate_id is None


def test_lock_base_candidate_sets_current_base(tmp_path: Path) -> None:
    store, chapter, candidate = make_store_with_base_candidate(tmp_path)

    package = store.lock_empty_base_scene(chapter.id, candidate.id)

    assert package.locked_base_candidate_id == candidate.id
    assert package.base_candidates[0].status == "locked"
    assert package.base_candidates[0].locked_at is not None
    assert package.assembly.base_candidate_id == candidate.id
    assert package.assembly.base_size == {
        "width": candidate.width,
        "height": candidate.height,
    }


def test_lock_base_candidate_rejects_unknown_candidate_id(tmp_path: Path) -> None:
    store, chapter = make_store_with_chapter(tmp_path)

    with pytest.raises(ValueError, match="Unknown base candidate id"):
        store.lock_empty_base_scene(chapter.id, "base_candidate_999")


def test_replacing_base_historicizes_complete_images_and_clears_placements(
    tmp_path: Path,
) -> None:
    store, chapter, old_candidate, new_candidate = make_store_with_locked_base_and_assembly(
        tmp_path
    )

    package = store.lock_empty_base_scene(chapter.id, new_candidate.id)

    assert package.locked_base_candidate_id == new_candidate.id
    assert [candidate.status for candidate in package.base_candidates] == [
        "inactive",
        "locked",
    ]
    assert package.assembly.base_candidate_id == new_candidate.id
    assert package.assembly.base_size == {
        "width": new_candidate.width,
        "height": new_candidate.height,
    }
    assert package.assembly.placements == []
    assert package.assembly.groups == []
    assert package.assembly.layer_order == []
    assert [
        image.status
        for image in package.complete_images
        if image.base_candidate_id == old_candidate.id
    ] == ["historical"]


def test_complete_image_requires_locked_base(tmp_path: Path) -> None:
    store, chapter = make_store_with_chapter(tmp_path)

    with pytest.raises(ValueError, match="locked base"):
        store.add_complete_scene_image(
            chapter.id,
            image_bytes=make_png_bytes(),
            original_filename="complete.png",
            prompt_snapshot=None,
            reference_ids=[],
            variation_prompt="",
        )


def test_add_complete_scene_image_uses_locked_base_snapshot(tmp_path: Path) -> None:
    store, chapter, locked_base_id, reference_id = make_store_with_locked_base(tmp_path)
    image_bytes = make_png_bytes(width=96, height=64)

    package = store.add_complete_scene_image(
        chapter.id,
        image_bytes=image_bytes,
        original_filename="complete.png",
        prompt_snapshot=None,
        reference_ids=[reference_id],
        variation_prompt="brighter morning light",
    )

    complete = package.complete_images[0]
    complete_path, media_type = store.read_chapter_scene_package_media(
        chapter.id,
        "complete_images",
        complete.id,
    )

    assert complete.storage_path == f"complete_images/{complete.id}.png"
    assert complete.base_candidate_id == locked_base_id
    assert complete.width == 96
    assert complete.height == 64
    assert complete.status == "active"
    assert "A low-shadow bedroom base scene." in complete.prompt_snapshot
    assert "Target objects: book" in complete.prompt_snapshot
    assert f"Locked empty base scene reference: {locked_base_id}" in complete.prompt_snapshot
    assert complete.reference_snapshot.reference_ids == [reference_id]
    assert complete.reference_snapshot.locked_base_candidate_id == locked_base_id
    assert complete.variation_prompt == "brighter morning light"
    assert complete_path.read_bytes() == image_bytes
    assert media_type == "image/png"


def test_add_complete_scene_image_rejects_invalid_png_as_validation_error(
    tmp_path: Path,
) -> None:
    store, chapter, _, _ = make_store_with_locked_base(tmp_path)

    with pytest.raises(ScenePackageValidationError, match="valid PNG"):
        store.add_complete_scene_image(
            chapter.id,
            image_bytes=b"not-a-png",
            original_filename="complete.png",
            prompt_snapshot=None,
            reference_ids=[],
            variation_prompt="",
        )


def test_add_complete_scene_image_rejects_unknown_reference_ids_as_validation_error(
    tmp_path: Path,
) -> None:
    store, chapter, _, _ = make_store_with_locked_base(tmp_path)

    with pytest.raises(
        ScenePackageValidationError,
        match="Unknown scene package reference ids",
    ):
        store.add_complete_scene_image(
            chapter.id,
            image_bytes=make_png_bytes(width=96, height=64),
            original_filename="complete.png",
            prompt_snapshot=None,
            reference_ids=["reference_missing"],
            variation_prompt="",
        )


def test_associate_complete_image_with_pipeline_run(tmp_path: Path) -> None:
    store, chapter, image = make_store_with_complete_image(tmp_path)

    package = store.associate_complete_image_run(
        chapter.id,
        image.id,
        run_id="run_123",
        run_status="completed",
    )

    updated = package.complete_images[0]

    assert updated.pipeline_run_id == "run_123"
    assert updated.pipeline_run_status == "completed"


def test_add_chapter_asset_from_run_asset_materializes_copy(tmp_path: Path) -> None:
    store, chapter, image = make_store_with_complete_image(tmp_path)
    image_bytes = make_png_bytes(width=32, height=32)

    package = store.add_chapter_asset_from_run_asset(
        chapter.id,
        source_run_id="run_123",
        source_run_asset_id="asset_456",
        source_complete_image_id=image.id,
        image_bytes=image_bytes,
        original_filename="nested/run/book.png",
        display_name="book",
        linked_target_object_id="target_object_001",
    )

    asset = package.chapter_assets[0]
    asset_path = (
        scene_package_json_path(tmp_path, chapter).parent / asset.storage_path
    )

    assert asset.display_name == "book"
    assert asset.original_filename == "book.png"
    assert asset.storage_path == f"assets/{asset.id}.png"
    assert asset.media_type == "image/png"
    assert asset.lineage.source_run_id == "run_123"
    assert asset.lineage.source_run_asset_id == "asset_456"
    assert asset.lineage.source_complete_image_id == image.id
    assert asset.linked_target_object_id == "target_object_001"
    assert asset.status == "available"
    assert asset_path.read_bytes() == image_bytes


def test_add_chapter_asset_from_run_asset_rejects_duplicate_available_source_asset(
    tmp_path: Path,
) -> None:
    store, chapter, image = make_store_with_complete_image(tmp_path)
    store.add_chapter_asset_from_run_asset(
        chapter.id,
        source_run_id="run_123",
        source_run_asset_id="asset_456",
        source_complete_image_id=image.id,
        image_bytes=make_png_bytes(width=32, height=32),
        original_filename="book.png",
        display_name="book",
    )

    with pytest.raises(ValueError, match="source_run_asset_id"):
        store.add_chapter_asset_from_run_asset(
            chapter.id,
            source_run_id="run_123",
            source_run_asset_id="asset_456",
            source_complete_image_id=image.id,
            image_bytes=make_png_bytes(width=24, height=24),
            original_filename="book-duplicate.png",
            display_name="book copy",
        )


def test_replacing_base_preserves_existing_chapter_assets(tmp_path: Path) -> None:
    store, chapter, old_candidate, new_candidate = make_store_with_locked_base_and_assembly(
        tmp_path
    )
    seeded_package = store.read_chapter_scene_package(chapter.id)

    package = store.lock_empty_base_scene(chapter.id, new_candidate.id)

    assert [asset.model_dump(mode="json") for asset in package.chapter_assets] == [
        asset.model_dump(mode="json") for asset in seeded_package.chapter_assets
    ]
    assert [
        image.status
        for image in package.complete_images
        if image.base_candidate_id == old_candidate.id
    ] == ["historical"]


@pytest.mark.parametrize(
    "storage_path",
    [
        "/tmp/escape.png",
        "../escape.png",
        "references/../../escape.png",
    ],
)


def test_read_scene_package_media_rejects_storage_path_outside_package_root(
    tmp_path: Path,
    storage_path: str,
) -> None:
    store, chapter, reference_id = make_store_with_prompt_and_reference(tmp_path)
    package_path = scene_package_json_path(tmp_path, chapter)
    package_payload = store.read_chapter_scene_package(chapter.id).model_dump(mode="json")
    package_payload["references"][0]["storage_path"] = storage_path
    store._write_json(package_path, package_payload)

    with pytest.raises(ValueError, match="package-relative"):
        store.read_chapter_scene_package_media(
            chapter.id,
            "references",
            reference_id,
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
    store, chapter = make_store_with_chapter(tmp_path)
    reference = store.add_chapter_scene_reference(
        chapter.id,
        image_bytes=make_png_bytes(width=20, height=10),
        original_filename="/Users/alice/private.png",
        prompt_role="style",
    ).references[0]
    store.update_chapter_scene_prompt(
        chapter.id,
        prompt_text="A low-shadow bedroom base scene.",
        target_objects=[{"label": "book"}],
    )
    candidate_package = store.add_empty_base_scene_candidate(
        chapter.id,
        image_bytes=make_png_bytes(width=72, height=48),
        original_filename=r"C:\foo\bar.png",
        prompt_snapshot=None,
        reference_ids=[reference.id],
    )
    locked_base_id = candidate_package.base_candidates[0].id
    store.write_chapter_scene_package(
        candidate_package.model_copy(update={"locked_base_candidate_id": locked_base_id})
    )
    complete = store.add_complete_scene_image(
        chapter.id,
        image_bytes=make_png_bytes(width=96, height=64),
        original_filename="nested/final/scene.png",
        prompt_snapshot=None,
        reference_ids=[reference.id],
        variation_prompt="brighter morning light",
    ).complete_images[0]

    package = store.read_chapter_scene_package(chapter.id)

    assert package.references[0].original_filename == "private.png"
    assert package.base_candidates[0].original_filename == "bar.png"
    assert complete.original_filename == "scene.png"
