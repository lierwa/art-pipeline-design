from __future__ import annotations

from io import BytesIO
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

from art_pipeline.course_planner.store import CoursePlannerStore
from route_test_helpers import client_with_provider, create_chapter, create_scene_pack


def client(tmp_path: Path) -> TestClient:
    return client_with_provider(tmp_path)


def _create_chapter(client: TestClient) -> str:
    scene_pack_id = create_scene_pack(client)
    return create_chapter(client, scene_pack_id)


def _create_prompt_ready_scene_package(
    client: TestClient,
    *,
    chapter_id: str | None = None,
) -> str:
    resolved_chapter_id = chapter_id or _create_chapter(client)
    response = client.patch(
        f"/api/course-planner/chapters/{resolved_chapter_id}/scene-package/prompt",
        json={
            "promptText": "Low-shadow room scene.",
            "sceneSpatialContract": "Bed against back wall, desk by window, floor kept clear.",
            "targetObjects": [{"label": "book", "priority": "required"}],
            "avoidObjects": [{"label": "shattered glass"}],
            "promptConfirmations": {
                "avoidObjectsReviewed": True,
                "styleReferenceMode": "confirmed_empty",
            },
        },
    )
    assert response.status_code == 200
    return resolved_chapter_id


def _create_selected_empty_scene(client: TestClient) -> tuple[str, str]:
    chapter_id = _create_prompt_ready_scene_package(client)
    empty_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/empty-scene-images",
        files={"file": ("empty.png", _png_bytes(width=72, height=48), "image/png")},
    )
    assert empty_response.status_code == 200
    empty_scene_id = empty_response.json()["scenePackage"]["empty_scene_images"][0]["id"]
    select_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/current-empty-scene",
        json={"emptySceneImageId": empty_scene_id},
    )
    assert select_response.status_code == 200
    return chapter_id, empty_scene_id


def _create_selected_empty_scene_with_asset(client: TestClient) -> tuple[str, str, str]:
    chapter_id, empty_scene_id = _create_selected_empty_scene(client)
    asset_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/chapter-assets/direct-upload",
        data={"displayName": "book", "linkedTargetObjectId": "target_object_001"},
        files={"file": ("book.png", _png_bytes(width=32, height=32), "image/png")},
    )
    assert asset_response.status_code == 200
    asset_id = asset_response.json()["scenePackage"]["chapter_assets"][0]["id"]
    return chapter_id, empty_scene_id, asset_id


def _store_for_client(client: TestClient) -> CoursePlannerStore:
    return CoursePlannerStore(client.app.state.scene_library_root)


def _png_bytes(*, width: int = 16, height: int = 12) -> bytes:
    image = Image.new("RGBA", (width, height), (255, 0, 0, 255))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()
