from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from art_pipeline.course_planner.scene_package_errors import (
    ScenePackagePreconditionError,
)
from art_pipeline.course_planner.store import CoursePlannerStore
from route_test_helpers import client_with_provider
from scene_package_route_test_helpers import (
    _create_chapter,
    _create_selected_empty_scene,
    _png_bytes,
)


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    return client_with_provider(tmp_path)


def test_upload_complete_image_without_selected_empty_scene_succeeds(
    client: TestClient,
) -> None:
    chapter_id = _create_chapter(client)

    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/complete-images",
        files={"file": ("complete.png", _png_bytes(width=96, height=64), "image/png")},
    )

    assert response.status_code == 200
    image = response.json()["scenePackage"]["complete_images"][0]
    assert image["empty_scene_image_id"] is None
    assert image["status"] == "active"


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


def test_upload_complete_image_records_projected_snapshot(client: TestClient) -> None:
    chapter_id, empty_scene_id = _create_selected_empty_scene(client)

    upload_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/complete-images",
        data={"generationNote": "brighter morning light"},
        files={"file": ("complete.png", _png_bytes(width=96, height=64), "image/png")},
    )

    assert upload_response.status_code == 200
    complete_image = upload_response.json()["scenePackage"]["complete_images"][0]
    assert complete_image["width"] == 96
    assert complete_image["height"] == 64
    assert "Low-shadow room scene." in complete_image["prompt_snapshot"]
    assert complete_image["generation_note"] == "brighter morning light"
    assert complete_image["empty_scene_image_id"] == empty_scene_id


def test_upload_complete_image_invalid_png_returns_400(client: TestClient) -> None:
    chapter_id, _ = _create_selected_empty_scene(client)

    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/complete-images",
        files={"file": ("complete.png", b"not-a-png", "image/png")},
    )

    assert response.status_code == 400
    assert "valid PNG" in response.json()["detail"]


def test_upload_complete_image_unknown_reference_ids_returns_400(
    client: TestClient,
) -> None:
    chapter_id, _ = _create_selected_empty_scene(client)

    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/complete-images",
        data={"referenceImageIds": "reference_missing"},
        files={"file": ("complete.png", _png_bytes(width=96, height=64), "image/png")},
    )

    assert response.status_code == 400
    assert "Unknown scene package reference image ids" in response.json()["detail"]


def test_direct_scene_asset_upload_materializes_asset_without_run_lineage(
    client: TestClient,
) -> None:
    chapter_id, _ = _create_selected_empty_scene(client)

    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/chapter-assets/direct-upload",
        data={
            "displayName": "抱枕",
            "linkedTargetObjectId": "target_object_001",
        },
        files={"file": ("pillow.png", _png_bytes(width=32, height=32), "image/png")},
    )

    assert response.status_code == 200
    asset = response.json()["scenePackage"]["chapter_assets"][0]
    assert asset["display_name"] == "抱枕"
    assert asset["lineage"]["source_kind"] == "direct_upload"
    assert asset["linked_target_object_id"] == "target_object_001"


def test_direct_scene_asset_upload_rejects_unknown_target_object(
    client: TestClient,
) -> None:
    chapter_id, _ = _create_selected_empty_scene(client)

    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/chapter-assets/direct-upload",
        data={
            "displayName": "抱枕",
            "linkedTargetObjectId": "target_object_missing",
        },
        files={"file": ("pillow.png", _png_bytes(width=32, height=32), "image/png")},
    )

    assert response.status_code == 400
    assert "Unknown target object id" in response.json()["detail"]


def test_lock_final_scene_uploads_composed_png_and_records_snapshot(
    client: TestClient,
) -> None:
    chapter_id = _create_chapter(client)
    empty_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/empty-scene-images",
        files={"file": ("empty.png", _png_bytes(width=120, height=80), "image/png")},
    )
    empty_id = empty_response.json()["scenePackage"]["empty_scene_images"][0]["id"]
    client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/current-empty-scene",
        json={"emptySceneImageId": empty_id},
    )
    asset_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/chapter-assets/direct-upload",
        data={"displayName": "抱枕"},
        files={"file": ("pillow.png", _png_bytes(width=32, height=32), "image/png")},
    )
    asset_id = asset_response.json()["scenePackage"]["chapter_assets"][0]["id"]
    client.put(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/assembly",
        json={
            "schema_version": 1,
            "empty_scene_image_id": empty_id,
            "empty_scene_size": {"width": 120, "height": 80},
            "placements": [
                {
                    "id": "placement_001",
                    "asset_id": asset_id,
                    "display_name": "抱枕",
                    "runtime_role": "target",
                    "transform": {"cx": 0.5, "cy": 0.5, "w": 0.2, "h": 0.2, "rotation_deg": 0},
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

    assert response.status_code == 200
    final_scene = response.json()["scenePackage"]["final_scene"]
    assert final_scene["empty_scene_image_id"] == empty_id
    assert final_scene["media_type"] == "image/png"
    assert final_scene["width"] == 120
    assert final_scene["height"] == 80


def test_lock_final_scene_requires_placed_asset(client: TestClient) -> None:
    chapter_id = _create_chapter(client)
    empty_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/empty-scene-images",
        files={"file": ("empty.png", _png_bytes(width=120, height=80), "image/png")},
    )
    empty_id = empty_response.json()["scenePackage"]["empty_scene_images"][0]["id"]
    client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/current-empty-scene",
        json={"emptySceneImageId": empty_id},
    )

    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/final-scene",
        files={"file": ("final.png", _png_bytes(width=120, height=80), "image/png")},
    )

    assert response.status_code == 409
    assert "placed Scene Asset" in response.json()["detail"]
