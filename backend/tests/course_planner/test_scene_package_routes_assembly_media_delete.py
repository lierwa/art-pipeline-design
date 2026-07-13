from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from art_pipeline.course_planner.store import CoursePlannerStore
from route_test_helpers import client_with_provider
from scene_package_route_test_helpers import (
    _create_chapter,
    _create_selected_empty_scene,
    _create_selected_empty_scene_with_asset,
    _png_bytes,
    _store_for_client,
)


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    return client_with_provider(tmp_path)


def test_put_scene_package_assembly_returns_scene_package(
    client: TestClient,
) -> None:
    chapter_id, empty_scene_id, asset_id = _create_selected_empty_scene_with_asset(client)

    response = client.put(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/assembly",
        json={
            "schema_version": 1,
            "empty_scene_image_id": empty_scene_id,
            "empty_scene_size": {"width": 72, "height": 48},
            "placements": [
                {
                    "id": "placement_001",
                    "asset_id": asset_id,
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
    assert response.json()["scenePackage"]["assembly"]["placements"][0]["asset_id"] == asset_id


def test_put_scene_package_assembly_invalid_body_returns_400(client: TestClient) -> None:
    chapter_id, _, _ = _create_selected_empty_scene_with_asset(client)

    response = client.put(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/assembly",
        json={"schema_version": "wrong", "placements": "bad"},
    )

    assert response.status_code == 400


def test_put_scene_package_assembly_rejects_out_of_bounds_transform(
    client: TestClient,
) -> None:
    chapter_id, empty_scene_id, asset_id = _create_selected_empty_scene_with_asset(client)

    response = client.put(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/assembly",
        json={
            "schema_version": 1,
            "empty_scene_image_id": empty_scene_id,
            "empty_scene_size": {"width": 72, "height": 48},
            "placements": [
                {
                    "id": "placement_001",
                    "asset_id": asset_id,
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
        f"/api/course-planner/chapters/{chapter_id}/scene-package/empty-scene-images",
        files={"file": ("empty.png", image_bytes, "image/png")},
    )
    empty_scene_id = response.json()["scenePackage"]["empty_scene_images"][0]["id"]

    media_response = client.get(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/media/empty_scene_images/{empty_scene_id}"
    )

    assert media_response.status_code == 200
    assert media_response.content == image_bytes
    assert media_response.headers["content-type"] == "image/png"


def test_delete_empty_scene_image_removes_unused_image(client: TestClient) -> None:
    chapter_id = _create_chapter(client)
    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/empty-scene-images",
        files={"file": ("empty.png", _png_bytes(width=72, height=48), "image/png")},
    )
    empty_scene_id = response.json()["scenePackage"]["empty_scene_images"][0]["id"]

    delete_response = client.delete(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/empty-scene-images/{empty_scene_id}"
    )

    assert delete_response.status_code == 200
    assert delete_response.json()["scenePackage"]["empty_scene_images"] == []


def test_delete_current_empty_scene_returns_409(client: TestClient) -> None:
    chapter_id, empty_scene_id = _create_selected_empty_scene(client)

    response = client.delete(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/empty-scene-images/{empty_scene_id}"
    )

    assert response.status_code == 409


def test_delete_complete_image_marks_it_deleted(client: TestClient) -> None:
    chapter_id, _ = _create_selected_empty_scene(client)
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


def test_duplicate_chapter_asset_clones_metadata_and_media(client: TestClient) -> None:
    chapter_id, _, asset_id = _create_selected_empty_scene_with_asset(client)

    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/chapter-assets/{asset_id}/duplicate"
    )

    assert response.status_code == 200
    assets = response.json()["scenePackage"]["chapter_assets"]
    assert len(assets) == 2
    original_asset, duplicated_asset = assets
    assert duplicated_asset["id"] != original_asset["id"]
    assert duplicated_asset["original_filename"] == original_asset["original_filename"]
    assert duplicated_asset["media_type"] == original_asset["media_type"]
    assert duplicated_asset["lineage"] == original_asset["lineage"]
    assert duplicated_asset["linked_target_object_id"] == original_asset["linked_target_object_id"]
    assert duplicated_asset["status"] == "available"

    store = _store_for_client(client)
    original_path, _ = store.read_chapter_scene_package_media(chapter_id, "chapter_assets", original_asset["id"])
    duplicate_path, _ = store.read_chapter_scene_package_media(chapter_id, "chapter_assets", duplicated_asset["id"])
    assert duplicate_path.read_bytes() == original_path.read_bytes()


def test_duplicate_chapter_asset_rejects_removed_source(client: TestClient) -> None:
    chapter_id, _, asset_id = _create_selected_empty_scene_with_asset(client)
    delete_response = client.delete(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/chapter-assets/{asset_id}"
    )
    assert delete_response.status_code == 200

    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/chapter-assets/{asset_id}/duplicate"
    )

    assert response.status_code == 404


def test_delete_chapter_asset_marks_it_removed_and_normalizes_surviving_assembly(
    client: TestClient,
) -> None:
    chapter_id, empty_scene_id, asset_id = _create_selected_empty_scene_with_asset(
        client,
        target_labels=("book", "lamp"),
    )
    second_asset_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/chapter-assets/direct-upload",
        data={"displayName": "lamp", "linkedTargetObjectId": "target_object_002"},
        files={"file": ("lamp.png", _png_bytes(width=24, height=24), "image/png")},
    )
    assert second_asset_response.status_code == 200
    second_asset_id = second_asset_response.json()["scenePackage"]["chapter_assets"][1]["id"]
    assembly_response = client.put(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/assembly",
        json={
            "schema_version": 1,
            "empty_scene_image_id": empty_scene_id,
            "empty_scene_size": {"width": 72, "height": 48},
            "placements": [
                {
                    "id": "placement_anchor",
                    "asset_id": asset_id,
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
                },
                {
                    "id": "placement_dependent",
                    "asset_id": second_asset_id,
                    "display_name": "lamp",
                    "runtime_role": "initial",
                    "transform": {
                        "cx": 0.25,
                        "cy": 0.25,
                        "w": 0.1,
                        "h": 0.1,
                        "rotation_deg": 0,
                    },
                    "group_id": "group_pair",
                    "requires_placed": ["placement_anchor"],
                },
            ],
            "groups": [
                {
                    "id": "group_pair",
                    "display_name": "foreground pair",
                    "placement_ids": ["placement_anchor", "placement_dependent"],
                }
            ],
            "layer_order": ["placement_dependent", "placement_anchor"],
            "updated_at": None,
        },
    )
    assert assembly_response.status_code == 200

    response = client.delete(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/chapter-assets/{asset_id}"
    )

    assert response.status_code == 200
    scene_package = response.json()["scenePackage"]
    assert scene_package["chapter_assets"][0]["status"] == "removed"
    assert scene_package["chapter_assets"][1]["status"] == "available"
    assert scene_package["assembly"]["placements"] == [
        {
            "id": "placement_dependent",
            "asset_id": second_asset_id,
            "display_name": "lamp",
            "runtime_role": "initial",
            "transform": {
                "cx": 0.25,
                "cy": 0.25,
                "w": 0.1,
                "h": 0.1,
                "rotation_deg": 0.0,
            },
            "group_id": None,
            "requires_placed": [],
        }
    ]
    assert scene_package["assembly"]["groups"] == []
    assert scene_package["assembly"]["layer_order"] == ["placement_dependent"]


def test_scene_package_routes_return_404_for_missing_chapter(client: TestClient) -> None:
    response = client.get("/api/course-planner/chapters/chapter_missing/scene-package")

    assert response.status_code == 404
