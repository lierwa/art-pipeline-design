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


def test_upload_complete_image_without_locked_base_returns_409(
    client: TestClient,
) -> None:
    chapter_id = _create_chapter(client)

    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/complete-images",
        files={"file": ("complete.png", _png_bytes(), "image/png")},
    )

    assert response.status_code == 409


def test_upload_complete_image_precondition_uses_exception_type_not_message(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    chapter_id = _create_chapter(client)

    def fake_upload(self: CoursePlannerStore, chapter_id: str, **kwargs):
        raise ScenePackagePreconditionError("unexpected precondition wording")

    monkeypatch.setattr(CoursePlannerStore, "add_complete_scene_image", fake_upload)

    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/complete-images",
        files={"file": ("complete.png", _png_bytes(), "image/png")},
    )

    assert response.status_code == 409


def test_upload_complete_image_and_patch_run(client: TestClient) -> None:
    chapter_id = _create_locked_base(client)
    reference_id = _upload_reference(client, chapter_id)

    upload_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/complete-images",
        data={
            "variationPrompt": "brighter morning light",
            "promptSnapshot": "Custom complete prompt snapshot.",
            "referenceIds": reference_id,
        },
        files={"file": ("complete.png", _png_bytes(width=96, height=64), "image/png")},
    )
    complete_id = upload_response.json()["scenePackage"]["complete_images"][0]["id"]
    patch_response = client.patch(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/complete-images/{complete_id}/run",
        json={"runId": "run_123", "runStatus": "completed"},
    )

    assert upload_response.status_code == 200
    complete_image = upload_response.json()["scenePackage"]["complete_images"][0]
    assert complete_image["width"] == 96
    assert complete_image["height"] == 64
    assert complete_image["prompt_snapshot"] == "Custom complete prompt snapshot."
    assert complete_image["variation_prompt"] == "brighter morning light"
    assert complete_image["reference_snapshot"]["reference_ids"] == [reference_id]
    assert patch_response.status_code == 200
    assert (
        patch_response.json()["scenePackage"]["complete_images"][0]["pipeline_run_id"]
        == "run_123"
    )


def test_upload_complete_image_invalid_png_returns_400(client: TestClient) -> None:
    chapter_id = _create_locked_base(client)

    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/complete-images",
        files={"file": ("complete.png", b"not-a-png", "image/png")},
    )

    assert response.status_code == 400
    assert "valid PNG" in response.json()["detail"]


def test_upload_complete_image_unknown_reference_ids_returns_400(
    client: TestClient,
) -> None:
    chapter_id = _create_locked_base(client)

    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/complete-images",
        data={"referenceIds": "reference_missing"},
        files={"file": ("complete.png", _png_bytes(width=96, height=64), "image/png")},
    )

    assert response.status_code == 400
    assert "Unknown scene package reference ids" in response.json()["detail"]


def test_patch_complete_image_run_returns_404_for_unknown_image(
    client: TestClient,
) -> None:
    chapter_id = _create_locked_base(client)

    response = client.patch(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/complete-images/complete_scene_999/run",
        json={"runId": "run_123"},
    )

    assert response.status_code == 404


def test_patch_complete_image_run_uses_exception_type_not_message(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    chapter_id = _create_locked_base(client)

    def fake_patch_run(
        self: CoursePlannerStore,
        chapter_id: str,
        complete_image_id: str,
        *,
        run_id: str,
        run_status: str | None,
    ):
        raise UnknownCompleteSceneImageError("not the legacy message")

    monkeypatch.setattr(CoursePlannerStore, "associate_complete_image_run", fake_patch_run)

    response = client.patch(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/complete-images/complete_scene_999/run",
        json={"runId": "run_123"},
    )

    assert response.status_code == 404


def test_post_chapter_asset_materializes_run_asset(client: TestClient) -> None:
    chapter_id = _create_locked_base(client)
    complete_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/complete-images",
        files={"file": ("complete.png", _png_bytes(width=96, height=64), "image/png")},
    )
    complete_id = complete_response.json()["scenePackage"]["complete_images"][0]["id"]

    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/chapter-assets",
        data={
            "sourceRunId": "run_123",
            "sourceRunAssetId": "asset_source_001",
            "sourceCompleteImageId": complete_id,
            "displayName": "book",
            "linkedTargetObjectId": "target_object_001",
        },
        files={"file": ("nested/book.png", _png_bytes(width=32, height=32), "image/png")},
    )

    assert response.status_code == 200
    asset = response.json()["scenePackage"]["chapter_assets"][0]
    assert asset["display_name"] == "book"
    assert asset["original_filename"] == "book.png"
    assert asset["lineage"]["source_run_id"] == "run_123"
    assert asset["lineage"]["source_run_asset_id"] == "asset_source_001"
    assert asset["lineage"]["source_complete_image_id"] == complete_id
    assert asset["linked_target_object_id"] == "target_object_001"


def test_post_chapter_asset_missing_required_field_returns_400(
    client: TestClient,
) -> None:
    chapter_id = _create_locked_base(client)

    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/chapter-assets",
        data={
            "sourceRunId": "run_123",
            "displayName": "book",
        },
        files={"file": ("book.png", _png_bytes(width=32, height=32), "image/png")},
    )

    assert response.status_code == 400
