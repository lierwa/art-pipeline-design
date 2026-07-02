from __future__ import annotations

from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from route_test_helpers import client_with_provider, create_chapter, create_scene_pack


def client(tmp_path: Path) -> TestClient:
    return client_with_provider(tmp_path)


def _create_chapter(client: TestClient) -> str:
    scene_pack_id = create_scene_pack(client)
    return create_chapter(client, scene_pack_id)


def _create_locked_base(client: TestClient) -> str:
    chapter_id = _create_chapter(client)
    candidate_id = _create_base_candidate(client, chapter_id)
    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/base-candidates/{candidate_id}/lock"
    )
    assert response.status_code == 200
    return chapter_id


def _create_base_candidate(client: TestClient, chapter_id: str) -> str:
    reference_id = _upload_reference(client, chapter_id)
    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/base-candidates",
        data={"referenceIds": reference_id},
        files={"file": ("base.png", _png_bytes(width=72, height=48), "image/png")},
    )
    assert response.status_code == 200
    return response.json()["scenePackage"]["base_candidates"][0]["id"]


def _upload_reference(client: TestClient, chapter_id: str) -> str:
    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/references",
        data={"promptRole": "style"},
        files={"file": ("style.png", _png_bytes(width=24, height=18), "image/png")},
    )
    assert response.status_code == 200
    return response.json()["scenePackage"]["references"][0]["id"]


def _png_bytes(*, width: int = 16, height: int = 12) -> bytes:
    image = Image.new("RGBA", (width, height), (255, 0, 0, 255))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()
