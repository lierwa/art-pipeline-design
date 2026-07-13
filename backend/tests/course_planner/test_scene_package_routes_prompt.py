from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from art_pipeline.course_planner.scene_package_errors import (
    ScenePackageChildNotFoundError,
)
from art_pipeline.course_planner.store import CoursePlannerStore
from route_test_helpers import client_with_provider
from scene_package_route_test_helpers import (
    _create_chapter,
    _create_character_ip,
    _png_bytes,
)


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    return client_with_provider(tmp_path)


def test_cast_selection_saves_empty_draft(client: TestClient) -> None:
    chapter_id = _create_chapter(client)

    response = _put_cast_selection(client, chapter_id, [])

    assert response.status_code == 200
    assert response.json()["scenePackage"]["selected_character_ip_ids"] == []


def test_cast_selection_saves_one_character(client: TestClient) -> None:
    chapter_id = _create_chapter(client)
    character = _create_character_ip(client, "阿布")

    response = _put_cast_selection(client, chapter_id, [str(character["id"])])

    assert response.status_code == 200
    assert response.json()["scenePackage"]["selected_character_ip_ids"] == [
        character["id"]
    ]


def test_cast_selection_saves_two_characters_in_request_order(client: TestClient) -> None:
    chapter_id = _create_chapter(client)
    first = _create_character_ip(client, "阿布")
    second = _create_character_ip(client, "妈妈")

    response = _put_cast_selection(
        client,
        chapter_id,
        [str(first["id"]), str(second["id"])],
    )

    assert response.status_code == 200
    assert response.json()["scenePackage"]["selected_character_ip_ids"] == [
        first["id"],
        second["id"],
    ]


def test_cast_selection_rejects_duplicate_character_ids(client: TestClient) -> None:
    chapter_id = _create_chapter(client)
    character = _create_character_ip(client, "阿布")

    response = _put_cast_selection(
        client,
        chapter_id,
        [str(character["id"]), str(character["id"])],
    )

    assert response.status_code == 400
    assert "duplicate" in str(response.json()).lower()


def test_cast_selection_rejects_more_than_two_characters(client: TestClient) -> None:
    chapter_id = _create_chapter(client)
    characters = [
        _create_character_ip(client, display_name)
        for display_name in ("阿布", "妈妈", "爸爸")
    ]

    response = _put_cast_selection(
        client,
        chapter_id,
        [str(character["id"]) for character in characters],
    )

    assert response.status_code == 400


def test_cast_selection_rejects_unknown_character_id(client: TestClient) -> None:
    chapter_id = _create_chapter(client)

    response = _put_cast_selection(client, chapter_id, ["character_ip_missing"])

    assert response.status_code == 400
    assert "character" in str(response.json()).lower()


def test_cast_selection_replaces_the_whole_selection_without_role_or_action(
    client: TestClient,
) -> None:
    chapter_id = _create_chapter(client)
    first = _create_character_ip(client, "阿布")
    second = _create_character_ip(client, "妈妈")
    _put_cast_selection(client, chapter_id, [str(first["id"])])

    response = _put_cast_selection(client, chapter_id, [str(second["id"])])

    package = response.json()["scenePackage"]
    assert package["selected_character_ip_ids"] == [second["id"]]
    assert "cast_assignments" not in package
    assert "role_label" not in str(package)
    assert "action_intent" not in str(package)


def test_legacy_per_character_cast_routes_are_removed(client: TestClient) -> None:
    chapter_id = _create_chapter(client)

    post_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/cast-assignments",
        json={
            "characterIpId": "character_ip_missing",
            "roleLabel": "main",
            "actionIntent": "legacy",
        },
    )
    delete_response = client.delete(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/"
        "cast-assignments/character_ip_missing"
    )

    assert post_response.status_code == 404
    assert delete_response.status_code == 404


def test_get_scene_package_lazily_creates_schema_v2_package(client: TestClient) -> None:
    chapter_id = _create_chapter(client)

    response = client.get(f"/api/course-planner/chapters/{chapter_id}/scene-package")

    assert response.status_code == 200
    assert response.json()["scenePackage"]["schema_version"] == 2


def test_upload_empty_scene_and_select_current_image(client: TestClient) -> None:
    chapter_id = _create_chapter(client)
    upload_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/empty-scene-images",
        files={"file": ("empty.png", _png_bytes(width=120, height=80), "image/png")},
    )

    empty_scene_id = upload_response.json()["scenePackage"]["empty_scene_images"][0]["id"]
    select_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/current-empty-scene",
        json={"emptySceneImageId": empty_scene_id},
    )

    assert upload_response.status_code == 200
    assert upload_response.json()["scenePackage"]["empty_scene_images"][0][
        "prompt_snapshot"
    ] == ""
    assert select_response.status_code == 200


def test_select_missing_empty_scene_returns_404(client: TestClient) -> None:
    chapter_id = _create_chapter(client)

    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/current-empty-scene",
        json={"emptySceneImageId": "empty_scene_999"},
    )

    assert response.status_code == 404


def test_select_unknown_empty_scene_uses_exception_type_not_message(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    chapter_id = _create_chapter(client)

    def fake_select(self: CoursePlannerStore, chapter_id: str, image_id: str):
        raise ScenePackageChildNotFoundError("not the legacy message")

    monkeypatch.setattr(CoursePlannerStore, "select_empty_scene_image", fake_select)
    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/current-empty-scene",
        json={"emptySceneImageId": "empty_scene_999"},
    )

    assert response.status_code == 404


def _put_cast_selection(
    client: TestClient,
    chapter_id: str,
    character_ip_ids: list[str],
):
    return client.put(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/cast-selection",
        json={"characterIpIds": character_ip_ids},
    )
