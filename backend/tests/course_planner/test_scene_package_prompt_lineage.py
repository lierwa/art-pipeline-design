from __future__ import annotations

from pathlib import Path

from route_test_helpers import FakeProvider, client_with_provider
from scene_package_route_test_helpers import (
    _create_chapter,
    _create_character_ip,
    _generate_prompt_package,
    _png_bytes,
    _prepare_prompt_generation,
    _prompt_ai_output,
    _select_characters,
)


def test_empty_scene_upload_freezes_generated_empty_prompt_and_references(
    tmp_path: Path,
) -> None:
    provider = FakeProvider([])
    client, chapter_id, character_ids = _prepare_prompt_generation(tmp_path, provider)
    provider.payloads.append(_prompt_ai_output(character_ids))
    generated = _generate_prompt_package(client, chapter_id).json()["scenePackage"]

    response = _upload_empty_scene(client, chapter_id)

    image = response.json()["scenePackage"]["empty_scene_images"][0]
    snapshot = generated["current_prompt_package"]["reference_snapshot"]
    assert image["prompt_snapshot"] == "Empty kitchen shell without characters or detachable props."
    assert image["reference_snapshot"]["reference_image_ids"] == [
        snapshot["character_model_sheets"][0]["model_sheet_id"],
        snapshot["scene_style_image_id"],
    ]


def test_complete_scene_upload_freezes_generated_complete_prompt_and_empty_scene(
    tmp_path: Path,
) -> None:
    provider = FakeProvider([])
    client, chapter_id, character_ids = _prepare_prompt_generation(tmp_path, provider)
    provider.payloads.extend(
        [_prompt_ai_output(character_ids), _prompt_ai_output(character_ids)]
    )
    _generate_prompt_package(client, chapter_id)
    empty_id = _upload_empty_scene(client, chapter_id).json()["scenePackage"][
        "empty_scene_images"
    ][0]["id"]
    _select_empty_scene(client, chapter_id, empty_id)
    _generate_prompt_package(client, chapter_id, feedback="use selected empty")

    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/complete-images",
        files={
            "file": ("complete.png", _png_bytes(width=120, height=80), "image/png")
        },
    )

    complete = response.json()["scenePackage"]["complete_images"][0]
    assert complete["prompt_snapshot"] == "Complete kitchen scene with Abu cleaning the table."
    assert complete["reference_snapshot"]["current_empty_scene_image_id"] == empty_id


def test_local_upload_without_generated_prompt_has_no_prompt_lineage(
    tmp_path: Path,
) -> None:
    client = client_with_provider(tmp_path)
    chapter_id = _create_chapter(client)

    response = _upload_empty_scene(client, chapter_id)

    image = response.json()["scenePackage"]["empty_scene_images"][0]
    assert image["prompt_snapshot"] == ""
    assert image["reference_snapshot"]["reference_image_ids"] == []


def test_cast_change_makes_generated_prompt_stale_for_later_uploads(
    tmp_path: Path,
) -> None:
    provider = FakeProvider([])
    client, chapter_id, character_ids = _prepare_prompt_generation(tmp_path, provider)
    provider.payloads.append(_prompt_ai_output(character_ids))
    _generate_prompt_package(client, chapter_id)
    second = _create_character_ip(client, "妈妈")
    _select_characters(client, chapter_id, [*character_ids, str(second["id"])])

    image = _upload_empty_scene(client, chapter_id).json()["scenePackage"][
        "empty_scene_images"
    ][0]

    assert image["prompt_snapshot"] == ""
    assert image["reference_snapshot"]["reference_image_ids"] == []


def test_reference_image_replacement_makes_generated_prompt_stale(
    tmp_path: Path,
) -> None:
    provider = FakeProvider([])
    client, chapter_id, character_ids = _prepare_prompt_generation(tmp_path, provider)
    provider.payloads.append(_prompt_ai_output(character_ids))
    _generate_prompt_package(client, chapter_id)
    character = client.get("/api/course-planner/character-ips").json()["characterIps"][0]
    style = client.get("/api/course-planner/scene-style-references").json()[
        "sceneStyleReferences"
    ][0]
    client.patch(
        f"/api/course-planner/character-ips/{character['id']}",
        files={
            "file": ("abu-v2.png", _png_bytes(width=320, height=180), "image/png")
        },
    )
    client.patch(
        f"/api/course-planner/scene-style-references/{style['id']}",
        files={
            "file": ("style-v2.png", _png_bytes(width=320, height=180), "image/png")
        },
    )

    image = _upload_empty_scene(client, chapter_id).json()["scenePackage"][
        "empty_scene_images"
    ][0]

    assert image["prompt_snapshot"] == ""


def test_selecting_empty_scene_makes_earlier_prompt_stale_until_regeneration(
    tmp_path: Path,
) -> None:
    provider = FakeProvider([])
    client, chapter_id, character_ids = _prepare_prompt_generation(tmp_path, provider)
    provider.payloads.append(_prompt_ai_output(character_ids))
    _generate_prompt_package(client, chapter_id)
    empty_id = _upload_empty_scene(client, chapter_id).json()["scenePackage"][
        "empty_scene_images"
    ][0]["id"]
    _select_empty_scene(client, chapter_id, empty_id)

    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/complete-images",
        files={
            "file": ("complete.png", _png_bytes(width=120, height=80), "image/png")
        },
    )

    complete = response.json()["scenePackage"]["complete_images"][0]
    assert complete["prompt_snapshot"] == ""
    assert complete["reference_snapshot"]["reference_image_ids"] == []


def test_lock_final_rejects_assembly_without_current_prompt_package(
    tmp_path: Path,
) -> None:
    client = client_with_provider(tmp_path)
    chapter_id = _create_chapter(client)
    empty_id = _upload_empty_scene(client, chapter_id).json()["scenePackage"][
        "empty_scene_images"
    ][0]["id"]
    _select_empty_scene(client, chapter_id, empty_id)
    asset_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/"
        "chapter-assets/direct-upload",
        data={"displayName": "book"},
        files={"file": ("book.png", _png_bytes(width=32, height=32), "image/png")},
    )
    asset_id = asset_response.json()["scenePackage"]["chapter_assets"][0]["id"]
    assembly_response = client.put(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/assembly",
        json={
            "schema_version": 1,
            "empty_scene_image_id": empty_id,
            "empty_scene_size": {"width": 120, "height": 80},
            "placements": [
                {
                    "id": "placement_001",
                    "asset_id": asset_id,
                    "display_name": "book",
                    "runtime_role": "target",
                    "transform": {"cx": 0.5, "cy": 0.5, "w": 0.2, "h": 0.2},
                    "requires_placed": [],
                }
            ],
            "groups": [],
            "layer_order": ["placement_001"],
        },
    )

    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/final-scene",
        files={"file": ("final.png", _png_bytes(width=120, height=80), "image/png")},
    )

    assert assembly_response.status_code == 200
    assert response.status_code == 409
    assert "prompt" in str(response.json()).lower()


def _upload_empty_scene(client, chapter_id: str):
    return client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/empty-scene-images",
        files={"file": ("empty.png", _png_bytes(width=120, height=80), "image/png")},
    )


def _select_empty_scene(client, chapter_id: str, image_id: str) -> None:
    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/current-empty-scene",
        json={"emptySceneImageId": image_id},
    )
    assert response.status_code == 200
