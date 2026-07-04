from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from art_pipeline.workspace.store import read_runs, read_state
from route_test_helpers import client_with_provider
from scene_package_route_test_helpers import (
    _create_chapter,
    _create_selected_empty_scene,
    _png_bytes,
)


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    return client_with_provider(tmp_path)


def test_create_and_list_reference_image_and_character_ip(
    client: TestClient,
) -> None:
    image_response = _upload_reference_image(client, "nested/style.png")
    image = image_response.json()["referenceImage"]

    character_response = client.post(
        "/api/course-planner/character-ips",
        json={
            "displayName": "团团",
            "visualInvariants": "圆脸，小学生，浅色睡衣",
            "personalityCues": "认真但轻松",
            "referenceImageIds": [image["id"]],
        },
    )
    list_response = client.get("/api/course-planner/character-ips")
    images_response = client.get("/api/course-planner/reference-library/images")

    assert image_response.status_code == 200
    assert image["id"].startswith("reference_image_")
    assert image["original_filename"] == "style.png"
    assert image["media_type"] == "image/png"
    assert image["width"] == 96
    assert image["height"] == 64
    assert image["status"] == "available"

    assert character_response.status_code == 200
    character = character_response.json()["characterIp"]
    assert character["id"].startswith("character_ip_")
    assert character["display_name"] == "团团"
    assert character["reference_image_ids"] == [image["id"]]
    assert character["status"] == "available"

    assert list_response.status_code == 200
    assert list_response.json()["characterIps"] == [character]
    assert images_response.status_code == 200
    assert images_response.json()["referenceImages"] == [image]


def test_create_character_ip_rejects_unknown_reference_image(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/course-planner/character-ips",
        json={
            "displayName": "团团",
            "referenceImageIds": ["reference_image_missing"],
        },
    )

    assert response.status_code == 400
    assert "Unknown reference image ids" in response.json()["detail"]


def test_scene_package_reference_selection_rejects_unknown_reference_image(
    client: TestClient,
) -> None:
    chapter_id = _create_chapter(client)

    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/reference-selections",
        json={"referenceImageId": "reference_image_missing", "promptRole": "style"},
    )

    assert response.status_code == 400
    assert "Unknown reference image id" in response.json()["detail"]


def test_scene_package_cast_assignment_rejects_unknown_character_or_reference(
    client: TestClient,
) -> None:
    chapter_id = _create_chapter(client)
    reference_image = _upload_reference_image(client, "character.png").json()[
        "referenceImage"
    ]

    unknown_character_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/cast-assignments",
        json={
            "characterIpId": "character_ip_missing",
            "roleLabel": "main child",
            "actionIntent": "整理抱枕",
            "referenceImageIds": [reference_image["id"]],
        },
    )
    character = _create_character_ip(client, reference_image["id"])
    unknown_reference_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/cast-assignments",
        json={
            "characterIpId": character["id"],
            "roleLabel": "main child",
            "actionIntent": "整理抱枕",
            "referenceImageIds": ["reference_image_missing"],
        },
    )

    assert unknown_character_response.status_code == 400
    assert "Unknown character IP id" in unknown_character_response.json()["detail"]
    assert unknown_reference_response.status_code == 400
    assert "Unknown reference image ids" in unknown_reference_response.json()["detail"]


def test_scene_package_selection_routes_persist_single_chapter_fact_sources(
    client: TestClient,
) -> None:
    chapter_id = _create_chapter(client)
    reference_image = _upload_reference_image(client, "character.png").json()[
        "referenceImage"
    ]
    character = _create_character_ip(client, reference_image["id"])

    selection_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/reference-selections",
        json={"referenceImageId": reference_image["id"], "promptRole": "character"},
    )
    cast_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/cast-assignments",
        json={
            "characterIpId": character["id"],
            "roleLabel": "main child",
            "actionIntent": "整理抱枕",
            "referenceImageIds": [reference_image["id"]],
        },
    )

    assert selection_response.status_code == 200
    selection_package = selection_response.json()["scenePackage"]
    assert selection_package["reference_selections"] == [
        {
            "id": "reference_selection_001",
            "reference_image_id": reference_image["id"],
            "prompt_role": "character",
        }
    ]

    assert cast_response.status_code == 200
    cast_package = cast_response.json()["scenePackage"]
    assert cast_package["cast_assignments"] == [
        {
            "id": "cast_assignment_001",
            "character_ip_id": character["id"],
            "role_label": "main child",
            "action_intent": "整理抱枕",
            "reference_image_ids": [reference_image["id"]],
        }
    ]


def test_upload_snapshots_project_library_facts_when_prompt_snapshot_is_omitted(
    client: TestClient,
) -> None:
    chapter_id = _create_chapter(client)
    reference_image = _upload_reference_image(client, "character.png").json()[
        "referenceImage"
    ]
    character = _create_character_ip(client, reference_image["id"])

    prompt_response = client.patch(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/prompt",
        json={
            "promptText": "Low-shadow room scene.",
            "sceneSpatialContract": (
                "Bed against back wall, desk by window, floor kept clear."
            ),
            "targetObjects": [{"label": "book", "priority": "required"}],
            "avoidObjects": [{"label": "shattered glass"}],
            "promptConfirmations": {
                "avoidObjectsReviewed": True,
                "styleReferenceMode": "selected",
            },
        },
    )
    selection_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/reference-selections",
        json={"referenceImageId": reference_image["id"], "promptRole": "style"},
    )
    cast_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/cast-assignments",
        json={
            "characterIpId": character["id"],
            "roleLabel": "main child",
            "actionIntent": "整理抱枕",
            "referenceImageIds": [reference_image["id"]],
        },
    )
    empty_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/empty-scene-images",
        data={"referenceImageIds": reference_image["id"]},
        files={"file": ("empty.png", _png_bytes(width=96, height=64), "image/png")},
    )
    empty_image = empty_response.json()["scenePackage"]["empty_scene_images"][0]
    select_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/current-empty-scene",
        json={"emptySceneImageId": empty_image["id"]},
    )
    complete_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/complete-images",
        data={"referenceImageIds": reference_image["id"]},
        files={"file": ("complete.png", _png_bytes(width=96, height=64), "image/png")},
    )

    assert prompt_response.status_code == 200
    assert selection_response.status_code == 200
    assert cast_response.status_code == 200
    assert empty_response.status_code == 200
    assert select_response.status_code == 200
    assert complete_response.status_code == 200

    empty_prompt = empty_image["prompt_snapshot"]
    complete_prompt = complete_response.json()["scenePackage"]["complete_images"][0][
        "prompt_snapshot"
    ]
    for prompt in (empty_prompt, complete_prompt):
        assert "Low-shadow room scene." in prompt
        assert "Cast main child: 团团; action: 整理抱枕" in prompt
        assert "references: character.png" in prompt
        assert "Target objects: book" in prompt
        assert "Avoid objects: shattered glass" in prompt
        assert "Reference style: character.png" in prompt
    assert f"Selected empty scene image: {empty_image['id']}" in complete_prompt


def test_complete_scene_image_import_route_creates_run_and_associates_complete_image(
    client: TestClient,
) -> None:
    chapter_id, _ = _create_selected_empty_scene(client)
    complete_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/complete-images",
        files={"file": ("complete.png", _png_bytes(width=96, height=64), "image/png")},
    )
    complete_image = complete_response.json()["scenePackage"]["complete_images"][0]

    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/complete-images/{complete_image['id']}/import"
    )

    assert response.status_code == 200
    payload = response.json()
    run = payload["run"]
    run_root = client.app.state.workspace_root / "runs" / run["id"]
    state = read_state(run_root)
    scene_context = json.loads((run_root / "scene_context.json").read_text("utf-8"))
    updated_complete = payload["scenePackage"]["complete_images"][0]

    assert state.source is not None
    assert state.source.width == 96
    assert state.source.height == 64
    assert state.detectionVocabulary == ["book"]
    assert scene_context["source"] == "course_planner"
    assert scene_context["chapter_id"] == chapter_id
    assert scene_context["complete_scene_image_id"] == complete_image["id"]
    assert scene_context["complete_scene_storage_path"] == complete_image["storage_path"]
    assert read_runs(client.app.state.workspace_root)[0].id == run["id"]
    assert updated_complete["pipeline_run_id"] == run["id"]
    assert updated_complete["pipeline_run_status"] == run["status"]


def _upload_reference_image(
    client: TestClient,
    filename: str,
) -> object:
    response = client.post(
        "/api/course-planner/reference-library/images",
        files={"file": (filename, _png_bytes(width=96, height=64), "image/png")},
    )
    assert response.status_code == 200
    return response


def _create_character_ip(client: TestClient, reference_image_id: str) -> dict[str, object]:
    response = client.post(
        "/api/course-planner/character-ips",
        json={
            "displayName": "团团",
            "referenceImageIds": [reference_image_id],
        },
    )
    assert response.status_code == 200
    return response.json()["characterIp"]
