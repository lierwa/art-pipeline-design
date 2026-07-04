from __future__ import annotations

from collections.abc import Callable

import pytest
from pydantic import ValidationError

from art_pipeline.course_planner.scene_package_errors import (
    ScenePackageChildNotFoundError,
    ScenePackageValidationError,
)
from art_pipeline.course_planner.scene_package_media import find_scene_package_media
from art_pipeline.course_planner.scene_package_models import (
    AssemblyTransform,
    ChapterAsset,
    ChapterAssetLineage,
    ChapterReferenceSelection,
    ChapterScenePackage,
    CompleteSceneImage,
    EmptySceneImage,
    FinalChapterScene,
    ImageReferenceSnapshot,
    TargetObjectExemption,
)
from scene_package_model_helpers import (
    make_chapter_asset,
    make_manifest,
)


def test_scene_package_defaults_to_clean_studio_state() -> None:
    package = ChapterScenePackage(chapter_id="chapter_001")

    assert package.current_empty_scene_image_id is None
    assert package.empty_scene_images == []
    assert package.complete_images == []
    assert package.chapter_assets == []
    assert package.assembly.empty_scene_image_id is None
    assert package.final_scene is None
    assert package.cast_assignments == []
    assert package.reference_selections == []
    assert package.avoid_objects == []
    assert package.target_object_exemptions == []


def test_complete_image_does_not_require_empty_scene_image_id() -> None:
    image = CompleteSceneImage(
        id="complete_scene_001",
        original_filename="complete.png",
        storage_path="complete_images/complete_scene_001.png",
        media_type="image/png",
        width=120,
        height=80,
        prompt_snapshot="Complete scene prompt.",
        reference_snapshot=ImageReferenceSnapshot(reference_image_ids=[]),
        created_at="2026-07-03T10:00:00Z",
    )

    assert image.empty_scene_image_id is None
    assert image.status == "active"


def test_asset_lineage_only_accepts_direct_upload() -> None:
    direct = ChapterAssetLineage(source_kind="direct_upload")

    assert direct.source_kind == "direct_upload"
    with pytest.raises(ValidationError):
        ChapterAssetLineage(source_kind="_".join(("pipeline", "run", "asset")))


def test_target_object_references_prune_stale_exemptions_and_asset_links() -> None:
    with pytest.raises(ValidationError, match="reason"):
        TargetObjectExemption(target_object_id="target_001", reason="   ")

    package = ChapterScenePackage.model_validate(
        {
            "chapter_id": "chapter_001",
            "target_objects": [
                {"id": "target_001", "label": "book", "priority": "required"}
            ],
            "target_object_exemptions": [
                {"target_object_id": "target_001", "reason": "already baked into backdrop"},
                {"target_object_id": "target_999", "reason": "stale"},
            ],
            "chapter_assets": [
                {
                    "id": "chapter_asset_001",
                    "display_name": "book",
                    "original_filename": "book.png",
                    "storage_path": "assets/chapter_asset_001.png",
                    "media_type": "image/png",
                    "lineage": {"source_kind": "direct_upload"},
                    "linked_target_object_id": "target_999",
                    "created_at": "2026-07-03T10:00:00Z",
                }
            ],
        }
    )

    assert package.target_object_exemptions == [
        TargetObjectExemption(
            target_object_id="target_001",
            reason="already baked into backdrop",
        )
    ]
    assert package.chapter_assets[0].linked_target_object_id is None


def test_chapter_reference_selection_rejects_notes_lane() -> None:
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        ChapterReferenceSelection.model_validate(
            {
                "id": "selection_001",
                "reference_image_id": "reference_style_001",
                "prompt_role": "style",
                "notes": "warm palette",
            }
        )

@pytest.mark.parametrize(
    ("field_name", "field_value"),
    [
        ("cx", -0.01),
        ("cx", 1.01),
        ("cy", -0.01),
        ("cy", 1.01),
        ("w", 0),
        ("w", 1.01),
        ("h", 0),
        ("h", 1.01),
    ],
)
def test_assembly_transform_rejects_out_of_bounds_normalized_values(
    field_name: str,
    field_value: float,
) -> None:
    payload = {
        "cx": 0.5,
        "cy": 0.5,
        "w": 0.25,
        "h": 0.25,
        "rotation_deg": 0,
    }
    payload[field_name] = field_value

    with pytest.raises(ValueError):
        AssemblyTransform.model_validate(payload)
def test_find_scene_package_media_uses_new_media_kinds() -> None:
    empty_scene = EmptySceneImage(
        id="empty_scene_001",
        original_filename="empty.png",
        storage_path="empty_scene_images/empty_scene_001.png",
        media_type="image/png",
        width=120,
        height=80,
        prompt_snapshot="Empty scene prompt.",
        created_at="2026-07-03T10:00:00Z",
    )
    complete_scene = CompleteSceneImage(
        id="complete_scene_001",
        original_filename="complete.png",
        storage_path="complete_images/complete_scene_001.png",
        media_type="image/png",
        width=120,
        height=80,
        prompt_snapshot="Complete scene prompt.",
        created_at="2026-07-03T10:00:00Z",
    )
    final_scene = FinalChapterScene(
        id="final_scene_001",
        original_filename="final.png",
        storage_path="final_scene/final_scene_001.png",
        media_type="image/png",
        width=120,
        height=80,
        empty_scene_image_id="empty_scene_001",
        assembly_snapshot=make_manifest(asset_id="chapter_asset_001"),
        prompt_snapshot="Final scene prompt.",
        reference_snapshot=ImageReferenceSnapshot(
            reference_image_ids=["reference_character_001"]
        ),
        created_at="2026-07-03T10:00:00Z",
    )
    package = ChapterScenePackage(
        chapter_id="chapter_001",
        empty_scene_images=[empty_scene],
        complete_images=[complete_scene],
        chapter_assets=[make_chapter_asset("chapter_asset_001")],
        final_scene=final_scene,
    )

    assert (
        find_scene_package_media(package, "empty_scene_images", "empty_scene_001").id
        == "empty_scene_001"
    )
    assert (
        find_scene_package_media(package, "complete_images", "complete_scene_001").id
        == "complete_scene_001"
    )
    assert (
        find_scene_package_media(package, "chapter_assets", "chapter_asset_001").id
        == "chapter_asset_001"
    )
    assert find_scene_package_media(package, "assets", "chapter_asset_001").id == (
        "chapter_asset_001"
    )
    assert find_scene_package_media(package, "final_scene", "final_scene_001").id == (
        "final_scene_001"
    )


@pytest.mark.parametrize(
    "legacy_kind",
    ["ref" "erences", "base_" "candidates", "base-" "candidates"],
)
def test_find_scene_package_media_rejects_legacy_kinds(legacy_kind: str) -> None:
    package = ChapterScenePackage(chapter_id="chapter_001")

    with pytest.raises(
        ScenePackageValidationError,
        match=f"Unknown scene package media kind: {legacy_kind}",
    ):
        find_scene_package_media(package, legacy_kind, "missing")


def test_find_scene_package_media_raises_child_not_found_for_missing_final_scene() -> None:
    package = ChapterScenePackage(chapter_id="chapter_001")

    with pytest.raises(ScenePackageChildNotFoundError, match="final_scene/final_scene_001"):
        find_scene_package_media(package, "final_scene", "final_scene_001")


@pytest.mark.parametrize(
    "model_factory",
    [
        lambda: EmptySceneImage(
            id="empty_scene_001",
            original_filename="empty.png",
            storage_path="../escape.png",
            media_type="image/png",
            width=120,
            height=80,
            prompt_snapshot="Empty scene prompt.",
            created_at="2026-07-03T10:00:00Z",
        ),
        lambda: CompleteSceneImage(
            id="complete_scene_001",
            original_filename="complete.png",
            storage_path="../escape.png",
            media_type="image/png",
            width=120,
            height=80,
            prompt_snapshot="Complete scene prompt.",
            created_at="2026-07-03T10:00:00Z",
        ),
        lambda: ChapterAsset(
            id="chapter_asset_001",
            display_name="book",
            original_filename="book.png",
            storage_path="../escape.png",
            media_type="image/png",
            lineage=ChapterAssetLineage(source_kind="direct_upload"),
            created_at="2026-07-03T10:00:00Z",
        ),
        lambda: FinalChapterScene(
            id="final_scene_001",
            original_filename="final.png",
            storage_path="../escape.png",
            media_type="image/png",
            width=120,
            height=80,
            empty_scene_image_id="empty_scene_001",
            assembly_snapshot=make_manifest(asset_id="chapter_asset_001"),
            prompt_snapshot="Final scene prompt.",
            reference_snapshot=ImageReferenceSnapshot(
                reference_image_ids=["reference_character_001"]
            ),
            created_at="2026-07-03T10:00:00Z",
        ),
    ],
)
def test_scene_package_media_models_reject_invalid_storage_paths(
    model_factory: Callable[[], object],
) -> None:
    with pytest.raises(ValidationError, match="package-relative POSIX path"):
        model_factory()
