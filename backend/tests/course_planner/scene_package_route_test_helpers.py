from __future__ import annotations

from io import BytesIO
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

from art_pipeline.course_planner.store import CoursePlannerStore
from route_test_helpers import (
    FakeProvider,
    client_with_provider,
    create_chapter,
    create_scene_pack,
)
from scene_package_store_helpers import seed_current_prompt_package


def client(tmp_path: Path) -> TestClient:
    return client_with_provider(tmp_path)


def _create_chapter(client: TestClient) -> str:
    scene_pack_id = create_scene_pack(client)
    return create_chapter(client, scene_pack_id)


def _create_character_ip(
    client: TestClient,
    display_name: str,
) -> dict[str, object]:
    response = _post_character_ip(client, display_name)
    assert response.status_code == 200
    return response.json()["characterIp"]


def _post_character_ip(client: TestClient, display_name: str):
    return client.post(
        "/api/course-planner/character-ips",
        data={"displayName": display_name},
        files={
            "file": (
                "character-sheet.png",
                _png_bytes(width=320, height=180),
                "image/png",
            )
        },
    )


def _create_scene_style(
    client: TestClient,
    display_name: str,
) -> dict[str, object]:
    response = _post_scene_style(client, display_name)
    assert response.status_code == 200
    return response.json()["sceneStyleReference"]


def _post_scene_style(client: TestClient, display_name: str):
    return client.post(
        "/api/course-planner/scene-style-references",
        data={"displayName": display_name},
        files={
            "file": (
                "style.png",
                _png_bytes(width=320, height=180),
                "image/png",
            )
        },
    )


def _prepare_prompt_generation(
    tmp_path: Path,
    provider: FakeProvider,
) -> tuple[TestClient, str, list[str]]:
    client = client_with_provider(tmp_path, provider)
    chapter_id = _create_chapter(client)
    character = _create_character_ip(client, "阿布")
    style = _create_scene_style(client, "cankao-1")
    character_ids = [str(character["id"])]
    _select_characters(client, chapter_id, character_ids)
    _select_style(client, chapter_id, str(style["id"]))
    return client, chapter_id, character_ids


def _prompt_ai_output(character_ids: list[str]) -> dict[str, object]:
    return {
        "empty_scene_prompt": "Empty kitchen shell without characters or detachable props.",
        "complete_scene_prompt": "Complete kitchen scene with Abu cleaning the table.",
        "scene_spatial_contract": "Eye-level view; sink left, table centered.",
        "cast_directions": [
            {"character_ip_id": character_id, "action": "擦拭早餐桌"}
            for character_id in character_ids
        ],
        "target_objects": [
            {
                "label": "早餐碗",
                "description": "可拆分的黄色早餐碗",
                "priority": "required",
            }
        ],
        "avoid_objects": [
            {"label": "额外角色", "description": "不要添加未选择角色"}
        ],
    }


def _select_characters(
    client: TestClient,
    chapter_id: str,
    character_ids: list[str],
) -> None:
    response = client.put(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/cast-selection",
        json={"characterIpIds": character_ids},
    )
    assert response.status_code == 200


def _select_style(client: TestClient, chapter_id: str, style_id: str) -> None:
    response = client.put(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/scene-style-reference",
        json={"sceneStyleReferenceId": style_id},
    )
    assert response.status_code == 200


def _generate_prompt_package(
    client: TestClient,
    chapter_id: str,
    *,
    feedback: str = "",
):
    return client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/"
        "prompt-package/generate",
        json={"feedback": feedback},
    )


def _create_prompt_ready_scene_package(
    client: TestClient,
    *,
    chapter_id: str | None = None,
    target_labels: tuple[str, ...] = ("book",),
) -> str:
    resolved_chapter_id = chapter_id or _create_chapter(client)
    suffix = resolved_chapter_id[-6:]
    character = _create_character_ip(client, f"团团-{suffix}")
    style = _create_scene_style(client, f"暖色绘本室内-{suffix}")
    _select_characters(client, resolved_chapter_id, [str(character["id"])])
    _select_style(client, resolved_chapter_id, str(style["id"]))
    seed_current_prompt_package(
        _store_for_client(client),
        resolved_chapter_id,
        target_labels=target_labels,
    )
    return resolved_chapter_id


def _create_selected_empty_scene(
    client: TestClient,
    *,
    target_labels: tuple[str, ...] = ("book",),
) -> tuple[str, str]:
    chapter_id = _create_chapter(client)
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
    _create_prompt_ready_scene_package(
        client,
        chapter_id=chapter_id,
        target_labels=target_labels,
    )
    return chapter_id, empty_scene_id


def _create_selected_empty_scene_with_asset(
    client: TestClient,
    *,
    target_labels: tuple[str, ...] = ("book",),
) -> tuple[str, str, str]:
    chapter_id, empty_scene_id = _create_selected_empty_scene(
        client,
        target_labels=target_labels,
    )
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
