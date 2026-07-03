from __future__ import annotations

import pytest

from art_pipeline.course_planner.scene_package_models import frontmost_layer_id
from art_pipeline.course_planner.scene_package_assembly_validation import (
    validate_assembly_manifest,
)
from scene_package_model_helpers import (
    make_chapter_asset,
    make_manifest,
    make_package_with_one_placement,
    make_package_with_selected_empty_scene,
    make_package_with_two_placements,
)


def test_manifest_rejects_dependency_cycles() -> None:
    package = make_package_with_two_placements(
        first_requires=["placement_b"],
        second_requires=["placement_a"],
    )

    errors = validate_assembly_manifest(package)

    assert any("cycle" in error.lower() for error in errors)


def test_manifest_rejects_unknown_dependency_id() -> None:
    package = make_package_with_two_placements(
        first_requires=["missing_placement"],
        second_requires=[],
    )

    errors = validate_assembly_manifest(package)

    assert any(
        "unknown" in error.lower() and "missing_placement" in error for error in errors
    )


def test_manifest_rejects_layer_order_missing_placement() -> None:
    package = make_package_with_one_placement(layer_order=["missing_placement"])

    errors = validate_assembly_manifest(package)

    assert any("layer_order" in error for error in errors)


def test_manifest_rejects_duplicate_layer_order_entries() -> None:
    package = make_package_with_one_placement(
        layer_order=["placement_001", "placement_001"]
    )

    errors = validate_assembly_manifest(package)

    assert any("duplicate" in error.lower() and "layer_order" in error for error in errors)


def test_manifest_rejects_mismatched_empty_scene_reference_for_placements() -> None:
    package = make_package_with_selected_empty_scene(
        assembly=make_manifest(
            asset_id="chapter_asset_001",
            empty_scene_image_id="empty_scene_999",
        ),
    )

    errors = validate_assembly_manifest(package)

    assert any("empty_scene_image_id" in error for error in errors)


def test_manifest_rejects_unknown_or_unavailable_asset() -> None:
    package = make_package_with_selected_empty_scene(
        chapter_assets=[
            make_chapter_asset("chapter_asset_001").model_copy(update={"status": "removed"})
        ]
    )

    errors = validate_assembly_manifest(package)

    assert any("asset" in error.lower() and "chapter_asset_001" in error for error in errors)


def test_manifest_rejects_unknown_group_placement_reference() -> None:
    package = make_package_with_selected_empty_scene(
        assembly=make_manifest(
            asset_id="chapter_asset_001",
            group_placement_ids=["placement_001", "placement_missing"],
        ),
    )

    errors = validate_assembly_manifest(package)

    assert any(
        "group_001" in error
        and "unknown placement ids" in error
        and "placement_missing" in error
        for error in errors
    )


def test_frontmost_layer_id_uses_first_layer_order_entry() -> None:
    package = make_package_with_two_placements(
        first_requires=[],
        second_requires=[],
        layer_order=["placement_b", "placement_a"],
    )

    assert frontmost_layer_id(package) == "placement_b"
