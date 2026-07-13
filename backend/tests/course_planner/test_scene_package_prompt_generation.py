from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from art_pipeline.course_planner import scene_package_models
from art_pipeline.course_planner.scene_package_models import ChapterScenePackage
from route_test_helpers import FakeProvider, client_with_provider
from scene_package_route_test_helpers import (
    _create_chapter,
    _create_character_ip,
    _create_scene_style,
    _generate_prompt_package,
    _prepare_prompt_generation,
    _prompt_ai_output,
    _select_characters,
    _select_style,
)


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
EXISTING_PACKAGE_PATHS = (
    Path(
        "scene_library/scene_packs/scene_pack_3cff5bc75d25/chapters/"
        "chapter_f09ad1c29d5f/scene_package/package.json"
    ),
    Path(
        "scene_library/scene_packs/scene_pack_3cff5bc75d25/chapters/"
        "chapter_96eb047029b6/scene_package/package.json"
    ),
)


def test_new_scene_package_uses_schema_v2_defaults() -> None:
    package = ChapterScenePackage(chapter_id="chapter_001")

    assert package.schema_version == 2
    assert package.selected_character_ip_ids == []
    assert package.current_prompt_package is None


@pytest.mark.parametrize("relative_path", EXISTING_PACKAGE_PATHS)
def test_existing_scene_package_migrates_without_losing_production_assets(
    relative_path: Path,
) -> None:
    payload = json.loads((REPOSITORY_ROOT / relative_path).read_text(encoding="utf-8"))

    package = ChapterScenePackage.model_validate(payload)
    migrated = package.model_dump(mode="json")

    assert migrated["schema_version"] == 2
    assert package.current_empty_scene_image_id == payload["current_empty_scene_image_id"]
    assert package.scene_style_reference_id == payload.get("scene_style_reference_id")
    assert package.assembly.model_dump(mode="json") == payload["assembly"]
    assert len(package.empty_scene_images) == len(payload["empty_scene_images"])
    assert len(package.complete_images) == len(payload["complete_images"])
    assert len(package.chapter_assets) == len(payload["chapter_assets"])
    assert "prompt" not in migrated
    assert "prompt_confirmations" not in migrated
    assert "cast_assignments" not in migrated
    assert "reference_selections" not in migrated


def test_legacy_cast_migration_keeps_character_ids_but_discards_manual_direction() -> None:
    package = ChapterScenePackage.model_validate(
        {
            "chapter_id": "chapter_001",
            "cast_assignments": [
                {
                    "id": "cast_001",
                    "character_ip_id": "character_abu",
                    "role_label": "main",
                    "action_intent": "收拾雨伞",
                }
            ],
        }
    )

    assert package.selected_character_ip_ids == ["character_abu"]
    serialized = package.model_dump(mode="json")
    assert "main" not in str(serialized)
    assert "收拾雨伞" not in str(serialized)


def test_generated_prompt_package_is_a_strict_typed_boundary() -> None:
    payload = {
        "schema_version": 2,
        "chapter_id": "chapter_001",
        "selected_character_ip_ids": ["character_abu"],
        "scene_style_reference_id": "scene_style_cankao_1",
        "current_prompt_package": {
            "empty_scene_prompt": "A quiet kitchen shell with no characters or props.",
            "complete_scene_prompt": "Abu wipes the breakfast table beside the sink.",
            "scene_spatial_contract": "Eye-level view; sink left, table centered.",
            "cast_directions": [
                {"character_ip_id": "character_abu", "action": "wipes the table"}
            ],
            "reference_snapshot": {
                "character_model_sheets": [
                    {
                        "character_ip_id": "character_abu",
                        "model_sheet_id": "model_sheet_abu_001",
                    }
                ],
                "scene_style_reference_id": "scene_style_cankao_1",
                "scene_style_image_id": "scene_style_image_001",
                "current_empty_scene_image_id": None,
                "global_reference_image_ids": [],
            },
            "generation_feedback": "",
            "generated_at": "2026-07-14T00:00:00Z",
        },
    }

    package = ChapterScenePackage.model_validate(payload)

    assert package.current_prompt_package is not None
    assert package.current_prompt_package.cast_directions[0].action == "wipes the table"
    invalid = payload | {
        "current_prompt_package": payload["current_prompt_package"] | {"role_label": "main"}
    }
    with pytest.raises(ValidationError, match="role_label"):
        ChapterScenePackage.model_validate(invalid)


def test_obsolete_prompt_and_cast_models_are_removed() -> None:
    assert not hasattr(scene_package_models, "ChapterCastAssignment")
    assert not hasattr(scene_package_models, "ChapterScenePrompt")
    assert not hasattr(scene_package_models, "PromptReadinessConfirmation")


def test_generate_prompt_package_requires_at_least_one_selected_character(
    tmp_path: Path,
) -> None:
    provider = FakeProvider([_prompt_ai_output(["unused"])])
    client = client_with_provider(tmp_path, provider)
    chapter_id = _create_chapter(client)
    style = _create_scene_style(client, "cankao-1")
    _select_style(client, chapter_id, str(style["id"]))

    response = _generate_prompt_package(client, chapter_id)

    assert response.status_code == 409
    assert provider.requests == []


def test_generate_prompt_package_requires_scene_style(tmp_path: Path) -> None:
    provider = FakeProvider([_prompt_ai_output(["unused"])])
    client = client_with_provider(tmp_path, provider)
    chapter_id = _create_chapter(client)
    character = _create_character_ip(client, "阿布")
    _select_characters(client, chapter_id, [str(character["id"])])

    response = _generate_prompt_package(client, chapter_id)

    assert response.status_code == 409
    assert provider.requests == []


def test_generate_prompt_package_returns_both_prompts_actions_and_task(
    tmp_path: Path,
) -> None:
    provider = FakeProvider([])
    client, chapter_id, character_ids = _prepare_prompt_generation(tmp_path, provider)
    provider.payloads.append(_prompt_ai_output(character_ids))

    response = _generate_prompt_package(client, chapter_id)

    assert response.status_code == 200
    body = response.json()
    package = body["scenePackage"]
    assert package["current_prompt_package"]["empty_scene_prompt"].startswith(
        "Empty kitchen shell"
    )
    assert package["current_prompt_package"]["complete_scene_prompt"].startswith(
        "Complete kitchen scene"
    )
    assert package["current_prompt_package"]["cast_directions"] == [
        {"character_ip_id": character_ids[0], "action": "擦拭早餐桌"}
    ]
    assert body["task"]["status"] == "succeeded"
    assert body["task"]["kind"] == "generate_chapter_prompt_package"


def test_generate_prompt_package_sends_seed_reference_metadata_and_feedback(
    tmp_path: Path,
) -> None:
    provider = FakeProvider([])
    client, chapter_id, character_ids = _prepare_prompt_generation(tmp_path, provider)
    provider.payloads.append(_prompt_ai_output(character_ids))

    response = _generate_prompt_package(client, chapter_id, feedback="桌面再整洁一点")

    assert response.status_code == 200
    prompt = provider.requests[0][0]
    assert "object_coverage_hint" in prompt
    assert "阿布" in prompt
    assert "current_model_sheet_id" in prompt
    assert "cankao-1" in prompt
    assert "current_image_id" in prompt
    assert "桌面再整洁一点" in prompt


@pytest.mark.parametrize("direction_mode", ["missing", "extra"])
def test_generate_prompt_package_requires_exactly_the_selected_characters(
    tmp_path: Path,
    direction_mode: str,
) -> None:
    provider = FakeProvider([])
    client, chapter_id, character_ids = _prepare_prompt_generation(tmp_path, provider)
    output_ids = [] if direction_mode == "missing" else [*character_ids, "character_extra"]
    provider.payloads.append(_prompt_ai_output(output_ids))

    response = _generate_prompt_package(client, chapter_id)

    assert response.status_code == 502
    package = client.get(
        f"/api/course-planner/chapters/{chapter_id}/scene-package"
    ).json()["scenePackage"]
    assert package["current_prompt_package"] is None


def test_regeneration_keeps_target_object_ids_stable_for_same_label(
    tmp_path: Path,
) -> None:
    provider = FakeProvider([])
    client, chapter_id, character_ids = _prepare_prompt_generation(tmp_path, provider)
    provider.payloads.extend(
        [_prompt_ai_output(character_ids), _prompt_ai_output(character_ids)]
    )

    first = _generate_prompt_package(client, chapter_id).json()["scenePackage"]
    second = _generate_prompt_package(client, chapter_id).json()["scenePackage"]

    assert first["target_objects"][0]["id"] == second["target_objects"][0]["id"]
    assert first["target_objects"][0]["id"].startswith("target_object_")


def test_regeneration_records_feedback_on_the_current_prompt_package(
    tmp_path: Path,
) -> None:
    provider = FakeProvider([])
    client, chapter_id, character_ids = _prepare_prompt_generation(tmp_path, provider)
    provider.payloads.append(_prompt_ai_output(character_ids))

    response = _generate_prompt_package(client, chapter_id, feedback="动作更轻柔")

    current = response.json()["scenePackage"]["current_prompt_package"]
    assert current["generation_feedback"] == "动作更轻柔"


def test_generation_failure_preserves_the_last_successful_prompt_package(
    tmp_path: Path,
) -> None:
    provider = FakeProvider([])
    client, chapter_id, character_ids = _prepare_prompt_generation(tmp_path, provider)
    provider.payloads.extend(
        [_prompt_ai_output(character_ids), RuntimeError("provider unavailable")]
    )
    successful = _generate_prompt_package(client, chapter_id).json()["scenePackage"]

    failed = _generate_prompt_package(client, chapter_id, feedback="try again")

    assert failed.status_code == 502
    current = client.get(
        f"/api/course-planner/chapters/{chapter_id}/scene-package"
    ).json()["scenePackage"]
    assert current["current_prompt_package"] == successful["current_prompt_package"]


def test_generate_prompt_package_rejects_extra_ai_output_fields(tmp_path: Path) -> None:
    provider = FakeProvider([])
    client, chapter_id, character_ids = _prepare_prompt_generation(tmp_path, provider)
    provider.payloads.append(_prompt_ai_output(character_ids) | {"role_label": "legacy"})

    response = _generate_prompt_package(client, chapter_id)

    assert response.status_code == 502
    assert response.json()["detail"]["task"]["status"] == "failed"
