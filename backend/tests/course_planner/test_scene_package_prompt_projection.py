from __future__ import annotations

import pytest

from art_pipeline.course_planner.scene_package_errors import ScenePackageValidationError
from art_pipeline.course_planner.scene_package_models import (
    ChapterCastAssignment,
    ChapterReferenceSelection,
    ChapterScenePackage,
    ChapterScenePrompt,
    PromptReadinessConfirmation,
)
from art_pipeline.course_planner.scene_package_prompt_projection import (
    build_complete_prompt,
    build_empty_scene_prompt,
    is_prompt_ready,
)
from scene_package_model_helpers import (
    make_library_payload,
    make_library_payload_with_missing_style_reference,
    make_prompt_ready_package,
)


def test_prompt_ready_requires_confirmed_character_reference_targets_avoid_spatial_and_style() -> None:
    package = make_prompt_ready_package()

    assert is_prompt_ready(package)


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


def test_empty_scene_prompt_requires_library_records_for_selected_cast_and_library_entries() -> None:
    package = make_prompt_ready_package()

    with pytest.raises(
        ScenePackageValidationError,
        match="requires library records",
    ):
        build_empty_scene_prompt(package)


def test_complete_prompt_rejects_missing_selected_library_ids() -> None:
    package = make_prompt_ready_package().model_copy(
        update={"current_empty_scene_image_id": "empty_scene_001"}
    )
    libraries = make_library_payload_with_missing_style_reference()

    with pytest.raises(
        ScenePackageValidationError,
        match="Missing reference library record for selection selection_style_001: reference_style_001",
    ):
        build_complete_prompt(package, libraries=libraries)


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
