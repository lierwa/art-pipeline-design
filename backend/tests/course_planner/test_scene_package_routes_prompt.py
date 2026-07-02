from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from art_pipeline.course_planner.scene_package_errors import (
    ScenePackagePreconditionError,
    UnknownBaseCandidateError,
    UnknownCompleteSceneImageError,
)
from art_pipeline.course_planner.store import CoursePlannerStore
from route_test_helpers import client_with_provider
from scene_package_route_test_helpers import _create_chapter, _create_locked_base, _png_bytes, _upload_reference


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    return client_with_provider(tmp_path)


def test_get_scene_package_lazily_creates_package(client: TestClient) -> None:
    chapter_id = _create_chapter(client)

    response = client.get(f"/api/course-planner/chapters/{chapter_id}/scene-package")

    assert response.status_code == 200
    assert response.json()["scenePackage"]["chapter_id"] == chapter_id


def test_patch_scene_package_prompt_updates_prompt_and_targets(
    client: TestClient,
) -> None:
    chapter_id = _create_chapter(client)

    response = client.patch(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/prompt",
        json={
            "promptText": "Low-shadow room scene.",
            "negativeConstraints": "No strong shadows.",
            "styleNotes": "Soft watercolor edges.",
            "targetObjects": [
                {
                    "label": "book",
                    "description": "Yellow cover.",
                    "priority": "required",
                }
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()["scenePackage"]
    assert payload["prompt"]["prompt_text"] == "Low-shadow room scene."
    assert payload["prompt"]["negative_constraints"] == "No strong shadows."
    assert payload["prompt"]["style_notes"] == "Soft watercolor edges."
    assert payload["target_objects"][0]["label"] == "book"
    assert payload["target_objects"][0]["description"] == "Yellow cover."
    assert payload["target_objects"][0]["priority"] == "required"


def test_patch_scene_package_prompt_invalid_body_returns_400(client: TestClient) -> None:
    chapter_id = _create_chapter(client)

    missing_field_response = client.patch(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/prompt",
        json={"negativeConstraints": "No strong shadows."},
    )
    invalid_field_response = client.patch(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/prompt",
        json={"promptText": 123, "targetObjects": []},
    )

    assert missing_field_response.status_code == 400
    assert invalid_field_response.status_code == 400


def test_patch_scene_package_prompt_preserves_omitted_metadata_and_targets(
    client: TestClient,
) -> None:
    chapter_id = _create_chapter(client)

    seed_response = client.patch(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/prompt",
        json={
            "promptText": "Low-shadow room scene.",
            "negativeConstraints": "No strong shadows.",
            "styleNotes": "Soft watercolor edges.",
            "targetObjects": [
                {
                    "label": "book",
                    "description": "Yellow cover.",
                    "priority": "required",
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
            "negativeConstraints": "",
            "styleNotes": "",
            "targetObjects": [],
        },
    )

    assert seed_response.status_code == 200
    assert preserve_response.status_code == 200
    preserved_payload = preserve_response.json()["scenePackage"]
    assert preserved_payload["prompt"]["prompt_text"] == "Brighter breakfast room."
    assert preserved_payload["prompt"]["negative_constraints"] == "No strong shadows."
    assert preserved_payload["prompt"]["style_notes"] == "Soft watercolor edges."
    assert preserved_payload["target_objects"] == [
        {
            "id": "target_object_001",
            "label": "book",
            "description": "Yellow cover.",
            "priority": "required",
        }
    ]

    assert clear_response.status_code == 200
    cleared_payload = clear_response.json()["scenePackage"]
    assert cleared_payload["prompt"]["negative_constraints"] == ""
    assert cleared_payload["prompt"]["style_notes"] == ""
    assert cleared_payload["target_objects"] == []


def test_upload_scene_reference_returns_scene_package(client: TestClient) -> None:
    chapter_id = _create_chapter(client)

    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/references",
        data={"promptRole": "style", "notes": "warm palette"},
        files={"file": ("style.png", _png_bytes(), "image/png")},
    )

    assert response.status_code == 200
    reference = response.json()["scenePackage"]["references"][0]
    assert reference["original_filename"] == "style.png"
    assert reference["prompt_role"] == "style"
    assert reference["notes"] == "warm palette"


def test_upload_scene_reference_rejects_invalid_png_bytes(client: TestClient) -> None:
    chapter_id = _create_chapter(client)

    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/references",
        files={"file": ("style.png", b"not-a-png", "image/png")},
    )

    assert response.status_code == 400
    assert "valid PNG" in response.json()["detail"]


def test_upload_scene_reference_missing_file_returns_400(client: TestClient) -> None:
    chapter_id = _create_chapter(client)

    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/references",
        data={"promptRole": "style"},
    )

    assert response.status_code == 400


def test_add_base_candidate_and_lock_it(client: TestClient) -> None:
    chapter_id = _create_chapter(client)
    reference_id = _upload_reference(client, chapter_id)

    upload_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/base-candidates",
        data={
            "referenceIds": reference_id,
            "promptSnapshot": "Custom base prompt snapshot.",
        },
        files={"file": ("base.png", _png_bytes(width=120, height=80), "image/png")},
    )

    candidate_id = upload_response.json()["scenePackage"]["base_candidates"][0]["id"]
    lock_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/base-candidates/{candidate_id}/lock"
    )

    assert upload_response.status_code == 200
    candidate = upload_response.json()["scenePackage"]["base_candidates"][0]
    assert candidate["width"] == 120
    assert candidate["prompt_snapshot"] == "Custom base prompt snapshot."
    assert (
        candidate["reference_snapshot"]["reference_ids"]
        == [reference_id]
    )
    assert lock_response.status_code == 200
    assert lock_response.json()["scenePackage"]["locked_base_candidate_id"] == candidate_id


def test_lock_missing_base_candidate_returns_409(client: TestClient) -> None:
    chapter_id = _create_chapter(client)

    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/base-candidates/base_candidate_999/lock"
    )

    assert response.status_code == 409


def test_lock_unknown_base_candidate_uses_exception_type_not_message(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    chapter_id = _create_chapter(client)

    def fake_lock(self: CoursePlannerStore, chapter_id: str, candidate_id: str):
        raise UnknownBaseCandidateError("not the legacy message")

    monkeypatch.setattr(CoursePlannerStore, "lock_empty_base_scene", fake_lock)

    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/base-candidates/base_candidate_999/lock"
    )

    assert response.status_code == 409
