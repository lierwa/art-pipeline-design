from __future__ import annotations

from art_pipeline.course_planner.models import (
    CharacterIpProfile,
    LibraryImageAsset,
    SceneStyleReference,
)
from art_pipeline.course_planner.scene_package_models import (
    AssemblyGroup,
    AssemblyPlacement,
    AssemblyTransform,
    AvoidObjectItem,
    ChapterAsset,
    ChapterAssetLineage,
    ChapterCastAssignment,
    ChapterSceneAssembly,
    ChapterScenePackage,
    ChapterScenePrompt,
    EmptySceneImage,
    PromptReadinessConfirmation,
    TargetObjectItem,
)


def make_prompt_ready_package() -> ChapterScenePackage:
    return ChapterScenePackage(
        chapter_id="chapter_001",
        prompt=ChapterScenePrompt(
            prompt_text="A calm living room cleanup scene.",
            scene_spatial_contract="Sofa at back wall, tea table centered on rug.",
        ),
        prompt_confirmations=PromptReadinessConfirmation(
            avoid_objects_reviewed=True,
        ),
        cast_assignments=[
            ChapterCastAssignment(
                id="cast_001",
                character_ip_id="character_tuantuan",
                role_label="child",
                action_intent="整理抱枕",
            )
        ],
        scene_style_reference_id="scene_style_warm",
        target_objects=[TargetObjectItem(id="target_001", label="抱枕", priority="core")],
        avoid_objects=[AvoidObjectItem(id="avoid_001", label="破碎杯子")],
    )


def make_library_payload() -> tuple[
    list[CharacterIpProfile],
    list[SceneStyleReference],
    dict[str, LibraryImageAsset],
]:
    return (
        [
            CharacterIpProfile(
                id="character_tuantuan",
                display_name="团团",
                current_model_sheet_id="character_model_sheet_001",
                created_at="2026-07-03T09:00:00Z",
            )
        ],
        [
            SceneStyleReference(
                id="scene_style_warm",
                display_name="暖色低冲突室内",
                current_image_id="scene_style_image_001",
                created_at="2026-07-03T09:01:00Z",
            )
        ],
        {
            "character_model_sheet_001": LibraryImageAsset(
                id="character_model_sheet_001",
                original_filename="tuantuan.png",
                storage_path="global_reference_library/character_ips/character_tuantuan/media/character_model_sheet_001.png",
                media_type="image/png",
                width=96,
                height=96,
                created_at="2026-07-03T09:00:00Z",
            ),
            "scene_style_image_001": LibraryImageAsset(
                id="scene_style_image_001",
                original_filename="style.png",
                storage_path="global_reference_library/scene_style_references/scene_style_warm/media/scene_style_image_001.png",
                media_type="image/png",
                width=96,
                height=96,
                created_at="2026-07-03T09:01:00Z",
            ),
        },
    )


def make_library_payload_with_missing_style_reference() -> tuple[
    list[CharacterIpProfile],
    list[SceneStyleReference],
    dict[str, LibraryImageAsset],
]:
    characters, styles, assets = make_library_payload()
    return characters, styles, {
        media_id: asset
        for media_id, asset in assets.items()
        if media_id != "scene_style_image_001"
    }


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
            "empty_scene_images": [make_empty_scene_image(empty_scene_image_id)],
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
            "empty_scene_images": [make_empty_scene_image("empty_scene_001")],
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
            "empty_scene_images": [make_empty_scene_image("empty_scene_001")],
        }
    )


def make_manifest(
    *,
    asset_id: str,
    empty_scene_image_id: str = "empty_scene_001",
    group_placement_ids: list[str] | None = None,
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
                placement_ids=group_placement_ids or ["placement_001"],
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
        lineage=ChapterAssetLineage(source_kind="direct_upload"),
        linked_target_object_id="target_001",
        created_at="2026-07-02T10:06:00Z",
    )


def make_empty_scene_image(image_id: str) -> EmptySceneImage:
    return EmptySceneImage(
        id=image_id,
        original_filename=f"{image_id}.png",
        storage_path=f"empty_scene_images/{image_id}.png",
        media_type="image/png",
        width=120,
        height=80,
        status="available",
        prompt_snapshot="Empty scene prompt.",
        created_at="2026-07-02T10:05:00Z",
    )
