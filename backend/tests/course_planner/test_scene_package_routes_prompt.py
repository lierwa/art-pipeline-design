from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from art_pipeline.course_planner.scene_package_errors import (
    ScenePackageChildNotFoundError,
)
from art_pipeline.course_planner.store import CoursePlannerStore
from route_test_helpers import client_with_provider
from scene_package_route_test_helpers import _create_chapter, _png_bytes


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    return client_with_provider(tmp_path)


def test_get_scene_package_lazily_creates_package(client: TestClient) -> None:
    chapter_id = _create_chapter(client)

    response = client.get(f"/api/course-planner/chapters/{chapter_id}/scene-package")

    assert response.status_code == 200
    assert response.json()["scenePackage"]["chapter_id"] == chapter_id


def test_patch_scene_package_prompt_updates_new_model_surface(
    client: TestClient,
) -> None:
    chapter_id = _create_chapter(client)

    response = client.patch(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/prompt",
        json={
            "promptText": "Low-shadow room scene.",
            "sceneSpatialContract": "Bed against back wall, desk by window, floor kept clear.",
            "targetObjects": [
                {
                    "label": "book",
                    "description": "Yellow cover.",
                    "priority": "required",
                }
            ],
            "avoidObjects": [{"label": "shattered glass", "description": "unsafe prop"}],
            "promptConfirmations": {
                "avoidObjectsReviewed": True,
                "styleReferenceMode": "confirmed_empty",
            },
            "referenceSelections": [
                {
                    "referenceImageId": "reference_style_001",
                    "promptRole": "style",
                    "notes": "warm palette",
                }
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()["scenePackage"]
    assert payload["prompt"]["prompt_text"] == "Low-shadow room scene."
    assert payload["prompt"]["scene_spatial_contract"].startswith("Bed against back wall")
    assert payload["target_objects"][0]["label"] == "book"
    assert payload["avoid_objects"][0]["label"] == "shattered glass"
    assert payload["prompt_confirmations"]["avoid_objects_reviewed"] is True
    assert payload["reference_selections"][0]["reference_image_id"] == "reference_style_001"


def test_patch_scene_package_prompt_invalid_body_returns_400(client: TestClient) -> None:
    chapter_id = _create_chapter(client)

    missing_field_response = client.patch(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/prompt",
        json={"sceneSpatialContract": "No prompt text."},
    )
    invalid_field_response = client.patch(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/prompt",
        json={"promptText": 123, "targetObjects": []},
    )

    assert missing_field_response.status_code == 400
    assert invalid_field_response.status_code == 400


def test_patch_scene_package_prompt_preserves_omitted_metadata_and_lists(
    client: TestClient,
) -> None:
    chapter_id = _create_chapter(client)

    seed_response = client.patch(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/prompt",
        json={
            "promptText": "Low-shadow room scene.",
            "sceneSpatialContract": "Bed against back wall, desk by window, floor kept clear.",
            "targetObjects": [
                {
                    "label": "book",
                    "description": "Yellow cover.",
                    "priority": "required",
                }
            ],
            "avoidObjects": [{"label": "shattered glass"}],
            "referenceSelections": [
                {
                    "referenceImageId": "reference_style_001",
                    "promptRole": "style",
                }
            ],
        },
    )
    preserve_response = client.patch(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/prompt",
        json={"promptText": "Brighter breakfast room."},
    )
    clear_response = client.patch(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/prompt",
        json={
            "promptText": "Brighter breakfast room.",
            "sceneSpatialContract": "",
            "avoidObjects": [],
            "referenceSelections": [],
        },
    )

    assert seed_response.status_code == 200
    assert preserve_response.status_code == 200
    preserved_payload = preserve_response.json()["scenePackage"]
    assert preserved_payload["prompt"]["prompt_text"] == "Brighter breakfast room."
    assert preserved_payload["prompt"]["scene_spatial_contract"].startswith(
        "Bed against back wall"
    )
    assert preserved_payload["avoid_objects"] == [
        {
            "id": "avoid_object_001",
            "label": "shattered glass",
            "description": "",
        }
    ]
    assert preserved_payload["reference_selections"][0]["reference_image_id"] == (
        "reference_style_001"
    )

    assert clear_response.status_code == 200
    cleared_payload = clear_response.json()["scenePackage"]
    assert cleared_payload["prompt"]["scene_spatial_contract"] == ""
    assert cleared_payload["avoid_objects"] == []
    assert cleared_payload["reference_selections"] == []


def test_upload_empty_scene_and_select_current_image(client: TestClient) -> None:
    chapter_id = _create_chapter(client)

    upload_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/empty-scene-images",
        data={"promptSnapshot": "Custom empty scene prompt snapshot."},
        files={"file": ("empty.png", _png_bytes(width=120, height=80), "image/png")},
    )

    empty_scene_id = upload_response.json()["scenePackage"]["empty_scene_images"][0]["id"]
    select_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/current-empty-scene",
        json={"emptySceneImageId": empty_scene_id},
    )

    assert upload_response.status_code == 200
    image = upload_response.json()["scenePackage"]["empty_scene_images"][0]
    assert image["width"] == 120
    assert image["prompt_snapshot"] == "Custom empty scene prompt snapshot."
    assert image["reference_snapshot"]["reference_image_ids"] == []
    assert select_response.status_code == 200
    assert select_response.json()["scenePackage"]["current_empty_scene_image_id"] == (
        empty_scene_id
    )


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
