from __future__ import annotations

import pytest

from art_pipeline.course_planner.scene_package_models import (
    AssemblyGroup,
    AssemblyPlacement,
    AssemblyTransform,
    ChapterSceneAssembly,
    ChapterAsset,
    ChapterAssetLineage,
    ChapterSceneReference,
    ChapterScenePackage,
    ChapterScenePrompt,
    CompleteSceneImage,
    EmptyBaseSceneCandidate,
    ImageReferenceSnapshot,
    TargetObjectItem,
    build_base_prompt,
    build_complete_prompt,
    frontmost_layer_id,
    is_prompt_ready,
    validate_assembly_manifest,
)


def test_scene_package_defaults_to_empty_authoring_state() -> None:
    package = ChapterScenePackage(chapter_id="chapter_001")

    assert package.chapter_id == "chapter_001"
    assert package.locked_base_candidate_id is None
    assert package.prompt.prompt_text == ""
    assert package.prompt.negative_constraints == ""
    assert package.prompt.style_notes == ""
    assert package.prompt.updated_at is None
    assert package.target_objects == []
    assert package.assembly.schema_version == 1
    assert package.assembly.base_candidate_id is None
    assert package.assembly.base_size is None
    assert package.assembly.placements == []
    assert package.assembly.groups == []
    assert package.assembly.layer_order == []
    assert package.assembly.updated_at is None
    assert package.references == []
    assert package.base_candidates == []
    assert package.complete_images == []
    assert package.chapter_assets == []


def test_image_reference_snapshot_defaults_to_empty_selection() -> None:
    snapshot = ImageReferenceSnapshot()

    assert snapshot.reference_ids == []
    assert snapshot.locked_base_candidate_id is None
    assert snapshot.notes == ""


def test_scene_image_models_accept_contract_fields() -> None:
    reference = ChapterSceneReference(
        id="reference_001",
        original_filename="style.png",
        storage_path="references/reference_001.png",
        media_type="image/png",
        created_at="2026-07-02T10:00:00Z",
        prompt_role="style",
        notes="warm palette",
    )
    prompt_snapshot = "A clean bedroom base scene."
    reference_snapshot = ImageReferenceSnapshot(reference_ids=[reference.id])

    candidate = EmptyBaseSceneCandidate(
        id="base_candidate_001",
        original_filename="base.png",
        storage_path="base_candidates/base_candidate_001.png",
        media_type="image/png",
        width=120,
        height=80,
        prompt_snapshot=prompt_snapshot,
        reference_snapshot=reference_snapshot,
        created_at="2026-07-02T10:00:00Z",
    )
    complete = CompleteSceneImage(
        id="complete_scene_001",
        original_filename="complete.png",
        storage_path="complete_images/complete_scene_001.png",
        media_type="image/png",
        width=120,
        height=80,
        base_candidate_id=candidate.id,
        prompt_snapshot=prompt_snapshot,
        reference_snapshot=reference_snapshot.model_copy(
            update={"locked_base_candidate_id": candidate.id}
        ),
        variation_prompt="brighter morning light",
        pipeline_run_id=None,
        pipeline_run_status=None,
        created_at="2026-07-02T10:05:00Z",
    )
    chapter_asset = ChapterAsset(
        id="chapter_asset_001",
        display_name="book",
        original_filename="book.png",
        storage_path="assets/chapter_asset_001.png",
        media_type="image/png",
        lineage=ChapterAssetLineage(
            source_run_id="run_123",
            source_run_asset_id="asset_456",
            source_complete_image_id=complete.id,
        ),
        linked_target_object_id="target_001",
        created_at="2026-07-02T10:06:00Z",
    )

    assert reference.prompt_role == "style"
    assert candidate.status == "candidate"
    assert candidate.locked_at is None
    assert complete.status == "active"
    assert complete.pipeline_run_id is None
    assert chapter_asset.status == "available"
    assert chapter_asset.lineage.source_complete_image_id == complete.id


def test_assembly_manifest_accepts_contract_fields() -> None:
    manifest = make_manifest(asset_id="chapter_asset_001")

    assert manifest.schema_version == 1
    assert manifest.base_candidate_id == "base_candidate_001"
    assert manifest.base_size == {"width": 120, "height": 80}
    assert manifest.placements[0].runtime_role == "target"
    assert manifest.placements[0].transform.rotation_deg == 12.5
    assert manifest.placements[0].group_id == "group_001"
    assert manifest.placements[0].requires_placed == []
    assert manifest.groups[0].placement_ids == ["placement_001"]
    assert manifest.layer_order == ["placement_001"]


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


def test_prompt_ready_requires_prompt_and_target_objects() -> None:
    package = ChapterScenePackage(
        chapter_id="chapter_001",
        prompt=ChapterScenePrompt(prompt_text="A clean bedroom base scene."),
        target_objects=[TargetObjectItem(id="target_001", label="book")],
    )

    assert is_prompt_ready(package)


def test_prompt_not_ready_without_target_objects() -> None:
    package = ChapterScenePackage(
        chapter_id="chapter_001",
        prompt=ChapterScenePrompt(prompt_text="A clean bedroom base scene."),
    )

    assert not is_prompt_ready(package)


def test_complete_prompt_includes_text_targets_and_locked_base_reference() -> None:
    package = make_package_with_locked_base()

    prompt = build_complete_prompt(package)

    assert package.prompt.prompt_text in prompt
    assert "book" in prompt
    assert "locked empty base scene" in prompt.lower()
    assert package.locked_base_candidate_id in prompt


def test_base_prompt_includes_prompt_metadata_and_targets() -> None:
    package = make_package_with_locked_base()
    package = package.model_copy(
        update={
            "prompt": ChapterScenePrompt(
                prompt_text="A clean bedroom base scene.",
                negative_constraints="No hard shadows.",
                style_notes="Soft watercolor edges.",
            )
        }
    )

    prompt = build_base_prompt(package)

    assert "A clean bedroom base scene." in prompt
    assert "Target objects: book" in prompt
    assert "Style notes: Soft watercolor edges." in prompt
    assert "Negative constraints: No hard shadows." in prompt


def test_complete_prompt_does_not_leak_assembly_layer_order() -> None:
    package = make_package_with_locked_base()

    prompt = build_complete_prompt(package)

    assert "Layer order" not in prompt
    assert "placement_001" not in prompt


def test_scene_prompt_accepts_domain_contract_fields() -> None:
    prompt = ChapterScenePrompt(
        prompt_text="A clean bedroom base scene.",
        negative_constraints="No hard shadows.",
        style_notes="Soft watercolor edges.",
        updated_at="2026-07-02T10:00:00Z",
    )

    assert prompt.negative_constraints == "No hard shadows."
    assert prompt.style_notes == "Soft watercolor edges."
    assert prompt.updated_at == "2026-07-02T10:00:00Z"


def test_target_object_item_accepts_domain_contract_fields() -> None:
    target = TargetObjectItem(
        id="target_001",
        label="book",
        description="yellow cover",
        priority="core",
    )

    assert target.description == "yellow cover"
    assert target.priority == "core"


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

    assert any("unknown" in error.lower() and "missing_placement" in error for error in errors)


def test_manifest_rejects_layer_order_missing_placement() -> None:
    package = make_package_with_one_placement(layer_order=["missing_placement"])

    errors = validate_assembly_manifest(package)

    assert any("layer_order" in error for error in errors)


def test_manifest_rejects_duplicate_layer_order_entry() -> None:
    package = make_package_with_two_placements(
        first_requires=[],
        second_requires=[],
        layer_order=["placement_a", "placement_a", "placement_b"],
    )

    errors = validate_assembly_manifest(package)

    assert any("duplicate" in error.lower() and "placement_a" in error for error in errors)


def test_manifest_rejects_unknown_group_placement_reference() -> None:
    package = make_package_with_one_placement(
        layer_order=["placement_001"],
        groups=[
            AssemblyGroup(
                id="group_001",
                display_name="book set",
                placement_ids=["missing_placement"],
            )
        ],
    )

    errors = validate_assembly_manifest(package)

    assert any("group" in error.lower() and "missing_placement" in error for error in errors)


def test_manifest_rejects_mismatched_locked_base_for_placements() -> None:
    package = make_package_with_locked_base(
        assembly=make_manifest(
            asset_id="chapter_asset_001",
            base_candidate_id="base_candidate_999",
        ),
    )

    errors = validate_assembly_manifest(package)

    assert any("base_candidate_id" in error for error in errors)


def test_manifest_rejects_unknown_or_unavailable_asset() -> None:
    package = make_package_with_locked_base(
        chapter_assets=[
            make_chapter_asset("chapter_asset_001").model_copy(update={"status": "removed"})
        ]
    )

    errors = validate_assembly_manifest(package)

    assert any("asset" in error.lower() and "chapter_asset_001" in error for error in errors)


def test_frontmost_layer_id_uses_first_layer_order_entry() -> None:
    package = make_package_with_two_placements(
        first_requires=[],
        second_requires=[],
        layer_order=["placement_b", "placement_a"],
    )

    assert frontmost_layer_id(package) == "placement_b"


def make_package_with_locked_base(
    *,
    assembly: ChapterSceneAssembly | None = None,
    chapter_assets: list[ChapterAsset] | None = None,
) -> ChapterScenePackage:
    locked_base_candidate_id = "base_candidate_001"
    resolved_assets = chapter_assets or [make_chapter_asset("chapter_asset_001")]
    return ChapterScenePackage(
        chapter_id="chapter_001",
        locked_base_candidate_id=locked_base_candidate_id,
        prompt=ChapterScenePrompt(prompt_text="A clean bedroom base scene."),
        target_objects=[TargetObjectItem(id="target_001", label="book")],
        assembly=assembly or make_manifest(asset_id=resolved_assets[0].id),
        chapter_assets=resolved_assets,
    )


def make_package_with_two_placements(
    *,
    first_requires: list[str],
    second_requires: list[str],
    layer_order: list[str] | None = None,
) -> ChapterScenePackage:
    assets = [
        make_chapter_asset("chapter_asset_a"),
        make_chapter_asset("chapter_asset_b"),
    ]
    return ChapterScenePackage(
        chapter_id="chapter_001",
        locked_base_candidate_id="base_candidate_001",
        prompt=ChapterScenePrompt(prompt_text="A clean bedroom base scene."),
        target_objects=[
            TargetObjectItem(id="target_a", label="book"),
            TargetObjectItem(id="target_b", label="lamp"),
        ],
        assembly=ChapterSceneAssembly(
            base_candidate_id="base_candidate_001",
            base_size={"width": 120, "height": 80},
            placements=[
                AssemblyPlacement(
                    id="placement_a",
                    asset_id=assets[0].id,
                    display_name="book",
                    transform=AssemblyTransform(
                        cx=0.3,
                        cy=0.4,
                        w=0.2,
                        h=0.2,
                        rotation_deg=0,
                    ),
                    requires_placed=first_requires,
                ),
                AssemblyPlacement(
                    id="placement_b",
                    asset_id=assets[1].id,
                    display_name="lamp",
                    transform=AssemblyTransform(
                        cx=0.6,
                        cy=0.5,
                        w=0.25,
                        h=0.25,
                        rotation_deg=0,
                    ),
                    requires_placed=second_requires,
                ),
            ],
            layer_order=layer_order or ["placement_a", "placement_b"],
        ),
        chapter_assets=assets,
    )


def make_package_with_one_placement(
    *,
    layer_order: list[str],
    groups: list[AssemblyGroup] | None = None,
) -> ChapterScenePackage:
    asset = make_chapter_asset("chapter_asset_001")
    return ChapterScenePackage(
        chapter_id="chapter_001",
        locked_base_candidate_id="base_candidate_001",
        prompt=ChapterScenePrompt(prompt_text="A clean bedroom base scene."),
        target_objects=[TargetObjectItem(id="target_001", label="book")],
        assembly=ChapterSceneAssembly(
            base_candidate_id="base_candidate_001",
            base_size={"width": 120, "height": 80},
            placements=[
                AssemblyPlacement(
                    id="placement_001",
                    asset_id=asset.id,
                    display_name="book",
                    transform=AssemblyTransform(
                        cx=0.5,
                        cy=0.5,
                        w=0.25,
                        h=0.25,
                        rotation_deg=0,
                    ),
                )
            ],
            groups=groups or [],
            layer_order=layer_order,
        ),
        chapter_assets=[asset],
    )


def make_manifest(
    *,
    asset_id: str,
    base_candidate_id: str = "base_candidate_001",
) -> ChapterSceneAssembly:
    return ChapterSceneAssembly(
        base_candidate_id=base_candidate_id,
        base_size={"width": 120, "height": 80},
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
                    rotation_deg=12.5,
                ),
                group_id="group_001",
            )
        ],
        groups=[
            AssemblyGroup(
                id="group_001",
                display_name="book set",
                placement_ids=["placement_001"],
            )
        ],
        layer_order=["placement_001"],
    )


def make_chapter_asset(asset_id: str) -> ChapterAsset:
    return ChapterAsset(
        id=asset_id,
        display_name="book",
        original_filename="book.png",
        storage_path=f"assets/{asset_id}.png",
        media_type="image/png",
        lineage=ChapterAssetLineage(
            source_run_id="run_123",
            source_run_asset_id=f"source_{asset_id}",
        ),
        linked_target_object_id="target_001",
        created_at="2026-07-02T10:06:00Z",
    )
