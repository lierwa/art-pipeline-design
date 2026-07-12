from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from route_test_helpers import client_with_provider
from scene_package_route_test_helpers import _create_chapter, _png_bytes


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    return client_with_provider(tmp_path)


def test_create_and_list_minimal_global_library_records(client: TestClient) -> None:
    character = _create_character_ip(client, "团团")
    style = _create_scene_style(client, "暖色绘本室内")

    assert set(character) == {
        "id",
        "display_name",
        "current_model_sheet_id",
        "created_at",
        "updated_at",
    }
    assert set(style) == {
        "id",
        "display_name",
        "current_image_id",
        "created_at",
        "updated_at",
    }
    assert client.get("/api/course-planner/character-ips").json()["characterIps"] == [character]
    assert client.get("/api/course-planner/scene-style-references").json()["sceneStyleReferences"] == [style]
    assert client.get(f"/api/course-planner/character-ips/{character['id']}/model-sheet").content == _png_bytes(width=320, height=180)
    assert client.get(f"/api/course-planner/scene-style-references/{style['id']}/image").content == _png_bytes(width=320, height=180)


@pytest.mark.parametrize(
    ("path", "payload"),
    [
        (
            "/api/course-planner/character-ips",
            {"displayName": "团团", "visualInvariants": "legacy", "referenceImageIds": []},
        ),
        (
            "/api/course-planner/reference-library/images",
            {"notes": "legacy", "tags": ["style"]},
        ),
    ],
)
def test_removed_library_contracts_are_not_accepted(
    client: TestClient,
    path: str,
    payload: dict[str, object],
) -> None:
    response = client.post(path, json=payload)

    assert response.status_code in {400, 404}


def test_library_names_are_unique_inside_each_library(client: TestClient) -> None:
    _create_character_ip(client, "团团")
    _create_scene_style(client, "暖色绘本室内")

    character_duplicate = _post_character_ip(client, "  团团  ")
    style_duplicate = _post_scene_style(client, "暖色绘本室内")

    assert character_duplicate.status_code == 400
    assert style_duplicate.status_code == 400
    assert "Duplicate library displayName" in character_duplicate.json()["detail"]
    assert "Duplicate library displayName" in style_duplicate.json()["detail"]


def test_replacing_current_images_keeps_previous_media_immutable(client: TestClient) -> None:
    character = _create_character_ip(client, "团团")
    style = _create_scene_style(client, "暖色绘本室内")
    old_character_media_id = str(character["current_model_sheet_id"])
    old_style_media_id = str(style["current_image_id"])

    character_response = client.patch(
        f"/api/course-planner/character-ips/{character['id']}",
        data={"displayName": "团团 v2"},
        files={"file": ("tuantuan-v2.png", _png_bytes(width=640, height=360), "image/png")},
    )
    style_response = client.patch(
        f"/api/course-planner/scene-style-references/{style['id']}",
        files={"file": ("warm-v2.png", _png_bytes(width=640, height=360), "image/png")},
    )

    updated_character = character_response.json()["characterIp"]
    updated_style = style_response.json()["sceneStyleReference"]
    assert updated_character["current_model_sheet_id"] != old_character_media_id
    assert updated_style["current_image_id"] != old_style_media_id
    assert _media_path(client, "character_ips", str(character["id"]), old_character_media_id).exists()
    assert _media_path(client, "scene_style_references", str(style["id"]), old_style_media_id).exists()


def test_chapter_selects_multiple_characters_and_one_scene_style(client: TestClient) -> None:
    chapter_id = _create_chapter(client)
    first = _create_character_ip(client, "团团")
    second = _create_character_ip(client, "妈妈")
    style = _create_scene_style(client, "暖色绘本室内")

    for character, role in ((first, "child"), (second, "parent")):
        response = client.post(
            f"/api/course-planner/chapters/{chapter_id}/scene-package/cast-assignments",
            json={
                "characterIpId": character["id"],
                "roleLabel": role,
                "actionIntent": "整理房间",
            },
        )
        assert response.status_code == 200
    style_response = client.put(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/scene-style-reference",
        json={"sceneStyleReferenceId": style["id"]},
    )

    package = style_response.json()["scenePackage"]
    assert [item["character_ip_id"] for item in package["cast_assignments"]] == [first["id"], second["id"]]
    assert all("reference_image_ids" not in item for item in package["cast_assignments"])
    assert package["scene_style_reference_id"] == style["id"]
    assert "reference_selections" not in package


def test_chapter_rejects_character_reference_overrides(client: TestClient) -> None:
    chapter_id = _create_chapter(client)
    character = _create_character_ip(client, "团团")

    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/cast-assignments",
        json={
            "characterIpId": character["id"],
            "roleLabel": "child",
            "actionIntent": "整理房间",
            "referenceImageIds": ["legacy_reference"],
        },
    )

    assert response.status_code == 400


def test_referenced_library_records_return_stable_delete_conflict(client: TestClient) -> None:
    chapter_id = _create_chapter(client)
    character = _create_character_ip(client, "团团")
    style = _create_scene_style(client, "暖色绘本室内")
    client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/cast-assignments",
        json={"characterIpId": character["id"], "roleLabel": "child", "actionIntent": "整理房间"},
    )
    client.put(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/scene-style-reference",
        json={"sceneStyleReferenceId": style["id"]},
    )

    for path in (
        f"/api/course-planner/character-ips/{character['id']}",
        f"/api/course-planner/scene-style-references/{style['id']}",
    ):
        response = client.delete(path)
        assert response.status_code == 409
        assert response.json()["detail"] == {
            "code": "library_item_in_use",
            "referencedChapterCount": 1,
        }


def test_unreferenced_delete_removes_record_but_preserves_immutable_media(client: TestClient) -> None:
    character = _create_character_ip(client, "团团")
    media_path = _media_path(
        client,
        "character_ips",
        str(character["id"]),
        str(character["current_model_sheet_id"]),
    )

    response = client.delete(f"/api/course-planner/character-ips/{character['id']}")

    assert response.status_code == 204
    assert client.get("/api/course-planner/character-ips").json()["characterIps"] == []
    assert media_path.exists()


def _post_character_ip(client: TestClient, display_name: str):
    return client.post(
        "/api/course-planner/character-ips",
        data={"displayName": display_name},
        files={"file": ("character-sheet.png", _png_bytes(width=320, height=180), "image/png")},
    )


def _create_character_ip(client: TestClient, display_name: str) -> dict[str, object]:
    response = _post_character_ip(client, display_name)
    assert response.status_code == 200
    return response.json()["characterIp"]


def _post_scene_style(client: TestClient, display_name: str):
    return client.post(
        "/api/course-planner/scene-style-references",
        data={"displayName": display_name},
        files={"file": ("style.png", _png_bytes(width=320, height=180), "image/png")},
    )


def _create_scene_style(client: TestClient, display_name: str) -> dict[str, object]:
    response = _post_scene_style(client, display_name)
    assert response.status_code == 200
    return response.json()["sceneStyleReference"]


def _media_path(client: TestClient, owner_kind: str, owner_id: str, media_id: str) -> Path:
    return (
        client.app.state.scene_library_root
        / "global_reference_library"
        / owner_kind
        / owner_id
        / "media"
        / f"{media_id}.png"
    )
