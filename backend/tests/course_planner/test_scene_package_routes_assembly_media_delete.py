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


def test_put_scene_package_assembly_returns_scene_package(
    client: TestClient,
    tmp_path: Path,
) -> None:
    chapter_id = _create_locked_base(client)
    package = CoursePlannerStore(tmp_path / "scene_library").read_chapter_scene_package(
        chapter_id
    )
    asset = CoursePlannerStore(tmp_path / "scene_library").add_chapter_asset_from_run_asset(
        chapter_id,
        source_run_id="run_123",
        source_run_asset_id="asset_456",
        image_bytes=_png_bytes(width=32, height=32),
        original_filename="book.png",
        display_name="book",
        linked_target_object_id="target_object_001",
    ).chapter_assets[0]

    response = client.put(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/assembly",
        json={
            "schema_version": 1,
            "base_candidate_id": package.locked_base_candidate_id,
            "base_size": package.assembly.base_size,
            "placements": [
                {
                    "id": "placement_001",
                    "asset_id": asset.id,
                    "display_name": "book",
                    "runtime_role": "target",
                    "transform": {
                        "cx": 0.5,
                        "cy": 0.5,
                        "w": 0.25,
                        "h": 0.25,
                        "rotation_deg": 0,
                    },
                    "group_id": None,
                    "requires_placed": [],
                }
            ],
            "groups": [],
            "layer_order": ["placement_001"],
            "updated_at": None,
        },
    )

    assert response.status_code == 200
    assert response.json()["scenePackage"]["assembly"]["placements"][0]["asset_id"] == asset.id


def test_put_scene_package_assembly_invalid_body_returns_400(client: TestClient) -> None:
    chapter_id = _create_locked_base(client)

    response = client.put(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/assembly",
        json={"schema_version": "wrong", "placements": "bad"},
    )

    assert response.status_code == 400


def test_put_scene_package_assembly_rejects_out_of_bounds_transform(
    client: TestClient,
    tmp_path: Path,
) -> None:
    chapter_id = _create_locked_base(client)
    store = CoursePlannerStore(tmp_path / "scene_library")
    package = store.read_chapter_scene_package(chapter_id)
    asset = store.add_chapter_asset_from_run_asset(
        chapter_id,
        source_run_id="run_123",
        source_run_asset_id="asset_456",
        image_bytes=_png_bytes(width=32, height=32),
        original_filename="book.png",
        display_name="book",
        linked_target_object_id="target_object_001",
    ).chapter_assets[0]

    response = client.put(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/assembly",
        json={
            "schema_version": 1,
            "base_candidate_id": package.locked_base_candidate_id,
            "base_size": package.assembly.base_size,
            "placements": [
                {
                    "id": "placement_001",
                    "asset_id": asset.id,
                    "display_name": "book",
                    "runtime_role": "target",
                    "transform": {
                        "cx": 1.1,
                        "cy": 0.5,
                        "w": 0.25,
                        "h": 0.25,
                        "rotation_deg": 0,
                    },
                    "group_id": None,
                    "requires_placed": [],
                }
            ],
            "groups": [],
            "layer_order": ["placement_001"],
            "updated_at": None,
        },
    )

    assert response.status_code == 400


def test_get_scene_package_media_resolves_metadata_path(client: TestClient) -> None:
    chapter_id = _create_chapter(client)
    image_bytes = _png_bytes(width=18, height=14)
    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/references",
        data={"promptRole": "style"},
        files={"file": ("style.png", image_bytes, "image/png")},
    )
    reference_id = response.json()["scenePackage"]["references"][0]["id"]

    media_response = client.get(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/media/references/{reference_id}"
    )

    assert media_response.status_code == 200
    assert media_response.content == image_bytes
    assert media_response.headers["content-type"] == "image/png"


def test_delete_scene_reference_removes_unused_reference(client: TestClient) -> None:
    chapter_id = _create_chapter(client)
    reference_id = _upload_reference(client, chapter_id)

    response = client.delete(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/references/{reference_id}"
    )

    assert response.status_code == 200
    assert response.json()["scenePackage"]["references"] == []


def test_delete_locked_base_candidate_returns_409(client: TestClient) -> None:
    chapter_id = _create_locked_base(client)
    package = client.get(
        f"/api/course-planner/chapters/{chapter_id}/scene-package"
    ).json()["scenePackage"]
    candidate_id = package["locked_base_candidate_id"]

    response = client.delete(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/base-candidates/{candidate_id}"
    )

    assert response.status_code == 409


def test_delete_complete_image_marks_it_deleted(client: TestClient) -> None:
    chapter_id = _create_locked_base(client)
    complete_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/complete-images",
        files={"file": ("complete.png", _png_bytes(width=96, height=64), "image/png")},
    )
    complete_id = complete_response.json()["scenePackage"]["complete_images"][0]["id"]

    response = client.delete(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/complete-images/{complete_id}"
    )

    assert response.status_code == 200
    assert response.json()["scenePackage"]["complete_images"][0]["status"] == "deleted"


def test_scene_package_routes_return_404_for_missing_chapter(client: TestClient) -> None:
    response = client.get("/api/course-planner/chapters/chapter_missing/scene-package")

    assert response.status_code == 404
