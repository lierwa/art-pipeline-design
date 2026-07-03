from __future__ import annotations

import pytest

from art_pipeline.course_planner.models import CharacterIpProfile, ReferenceLibraryImage
from art_pipeline.course_planner.scene_package_models import (
    AssemblyGroup,
    AssemblyPlacement,
    AssemblyTransform,
    AvoidObjectItem,
    ChapterAsset,
    ChapterAssetLineage,
    ChapterCastAssignment,
    ChapterReferenceSelection,
    ChapterSceneAssembly,
    ChapterScenePackage,
    ChapterScenePrompt,
    CompleteSceneImage,
    EmptySceneImage,
    FinalChapterScene,
    ImageReferenceSnapshot,
    PromptReadinessConfirmation,
    TargetObjectItem,
    build_complete_prompt,
    build_empty_scene_prompt,
    frontmost_layer_id,
    is_prompt_ready,
    validate_assembly_manifest,
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
    assert not is_prompt_ready(package)


def test_prompt_ready_requires_confirmed_character_reference_targets_avoid_spatial_and_style() -> None:
    package = ChapterScenePackage(
        chapter_id="chapter_001",
        prompt=ChapterScenePrompt(
            prompt_text="A calm living room cleanup scene.",
            scene_spatial_contract="Sofa at back wall, tea table centered on rug.",
        ),
        cast_assignments=[
            ChapterCastAssignment(
                id="cast_001",
                character_ip_id="character_tuantuan",
                role_label="child",
                action_intent="整理抱枕",
                reference_image_ids=["reference_character_001"],
            )
        ],
        reference_selections=[
            ChapterReferenceSelection(
                id="selection_001",
                reference_image_id="reference_character_001",
                prompt_role="character",
            )
        ],
        target_objects=[
            TargetObjectItem(id="target_001", label="抱枕", priority="core"),
        ],
        avoid_objects=[
            AvoidObjectItem(id="avoid_001", label="破碎杯子"),
        ],
        prompt_confirmations=PromptReadinessConfirmation(
            avoid_objects_reviewed=True,
            style_reference_mode="confirmed_empty",
        ),
    )

    assert is_prompt_ready(package)


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


def test_direct_asset_lineage_is_distinct_from_run_asset_lineage() -> None:
    direct = ChapterAssetLineage(source_kind="direct_upload")
    run_asset = ChapterAssetLineage(
        source_kind="pipeline_run_asset",
        source_run_id="run_123",
        source_run_asset_id="asset_456",
        source_complete_image_id="complete_scene_001",
    )

    assert direct.source_run_id is None
    assert run_asset.source_run_asset_id == "asset_456"

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


def test_prompt_not_ready_without_target_objects() -> None:
    package = ChapterScenePackage(
        chapter_id="chapter_001",
        prompt=ChapterScenePrompt(
            prompt_text="A calm living room cleanup scene.",
            scene_spatial_contract="Sofa at back wall, tea table centered on rug.",
        ),
        cast_assignments=[
            ChapterCastAssignment(
                id="cast_001",
                character_ip_id="character_tuantuan",
                role_label="child",
                action_intent="整理抱枕",
                reference_image_ids=["reference_character_001"],
            )
        ],
        reference_selections=[
            ChapterReferenceSelection(
                id="selection_001",
                reference_image_id="reference_character_001",
                prompt_role="character",
            )
        ],
        prompt_confirmations=PromptReadinessConfirmation(
            avoid_objects_reviewed=True,
            style_reference_mode="confirmed_empty",
        ),
    )

    assert not is_prompt_ready(package)


def test_empty_scene_prompt_includes_confirmed_prompt_facts() -> None:
    package = make_prompt_ready_package()
    libraries = make_library_payload()

    prompt = build_empty_scene_prompt(package, libraries=libraries)

    assert "A calm living room cleanup scene." in prompt
    assert "Sofa at back wall, tea table centered on rug." in prompt
    assert "抱枕" in prompt
    assert "破碎杯子" in prompt
    assert "团团" in prompt


def test_complete_prompt_includes_selected_empty_scene_reference_without_layer_order_leak() -> None:
    package = make_prompt_ready_package().model_copy(
        update={"current_empty_scene_image_id": "empty_scene_001"}
    )
    libraries = make_library_payload()

    prompt = build_complete_prompt(package, libraries=libraries)

    assert "A calm living room cleanup scene." in prompt
    assert "empty_scene_001" in prompt
    assert "placement_001" not in prompt
    assert "layer_order" not in prompt


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


def test_frontmost_layer_id_uses_first_layer_order_entry() -> None:
    package = make_package_with_two_placements(
        first_requires=[],
        second_requires=[],
        layer_order=["placement_b", "placement_a"],
    )

    assert frontmost_layer_id(package) == "placement_b"


def make_prompt_ready_package() -> ChapterScenePackage:
    return ChapterScenePackage(
        chapter_id="chapter_001",
        prompt=ChapterScenePrompt(
            prompt_text="A calm living room cleanup scene.",
            scene_spatial_contract="Sofa at back wall, tea table centered on rug.",
        ),
        prompt_confirmations=PromptReadinessConfirmation(
            avoid_objects_reviewed=True,
            style_reference_mode="confirmed_empty",
        ),
        cast_assignments=[
            ChapterCastAssignment(
                id="cast_001",
                character_ip_id="character_tuantuan",
                role_label="child",
                action_intent="整理抱枕",
                reference_image_ids=["reference_character_001"],
            )
        ],
        reference_selections=[
            ChapterReferenceSelection(
                id="selection_character_001",
                reference_image_id="reference_character_001",
                prompt_role="character",
            ),
            ChapterReferenceSelection(
                id="selection_style_001",
                reference_image_id="reference_style_001",
                prompt_role="style",
            ),
        ],
        target_objects=[TargetObjectItem(id="target_001", label="抱枕", priority="core")],
        avoid_objects=[AvoidObjectItem(id="avoid_001", label="破碎杯子")],
    )


def make_library_payload() -> tuple[list[CharacterIpProfile], list[ReferenceLibraryImage]]:
    return (
        [
            CharacterIpProfile(
                id="character_tuantuan",
                display_name="团团",
                visual_invariants="圆脸，小学生，浅色睡衣",
                personality_cues="认真但轻松",
                reference_image_ids=["reference_character_001"],
                created_at="2026-07-03T09:00:00Z",
            )
        ],
        [
            ReferenceLibraryImage(
                id="reference_character_001",
                original_filename="tuantuan.png",
                storage_path="reference_library/images/reference_character_001/image.png",
                media_type="image/png",
                width=96,
                height=96,
                tags=["character"],
                notes="主角正面参考",
                created_at="2026-07-03T09:00:00Z",
            ),
            ReferenceLibraryImage(
                id="reference_style_001",
                original_filename="style.png",
                storage_path="reference_library/images/reference_style_001/image.png",
                media_type="image/png",
                width=96,
                height=96,
                tags=["style"],
                notes="暖色低冲突室内",
                created_at="2026-07-03T09:01:00Z",
            ),
        ],
    )


def make_package_with_selected_empty_scene(
    *,
    assembly: ChapterSceneAssembly | None = None,
    chapter_assets: list[ChapterAsset] | None = None,
) -> ChapterScenePackage:
    empty_scene_image_id = "empty_scene_001"
    resolved_assets = chapter_assets or [make_chapter_asset("chapter_asset_001")]
    return make_prompt_ready_package().model_copy(
        update={
            "current_empty_scene_image_id": empty_scene_image_id,
            "assembly": assembly or make_manifest(asset_id=resolved_assets[0].id),
            "chapter_assets": resolved_assets,
        }
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
    return make_prompt_ready_package().model_copy(
        update={
            "current_empty_scene_image_id": "empty_scene_001",
            "target_objects": [
                TargetObjectItem(id="target_a", label="book"),
                TargetObjectItem(id="target_b", label="lamp"),
            ],
            "assembly": ChapterSceneAssembly(
                empty_scene_image_id="empty_scene_001",
                empty_scene_size={"width": 120, "height": 80},
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
            "chapter_assets": assets,
        }
    )


def make_package_with_one_placement(*, layer_order: list[str]) -> ChapterScenePackage:
    asset = make_chapter_asset("chapter_asset_001")
    return make_prompt_ready_package().model_copy(
        update={
            "current_empty_scene_image_id": "empty_scene_001",
            "assembly": ChapterSceneAssembly(
                empty_scene_image_id="empty_scene_001",
                empty_scene_size={"width": 120, "height": 80},
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
                layer_order=layer_order,
            ),
            "chapter_assets": [asset],
        }
    )


def make_manifest(
    *,
    asset_id: str,
    empty_scene_image_id: str = "empty_scene_001",
) -> ChapterSceneAssembly:
    return ChapterSceneAssembly(
        empty_scene_image_id=empty_scene_image_id,
        empty_scene_size={"width": 120, "height": 80},
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
            source_kind="pipeline_run_asset",
            source_run_id="run_123",
            source_run_asset_id=f"source_{asset_id}",
        ),
        linked_target_object_id="target_001",
        created_at="2026-07-02T10:06:00Z",
    )
