from __future__ import annotations

import json
from io import BytesIO
from pathlib import Path

from PIL import Image

from route_test_helpers import (
    FakeProvider,
    candidate_ai_payload,
    chapter_seed_payload,
    client_with_provider,
    create_chapter,
    create_scene_pack,
    scene_pack_payload,
)
from art_pipeline.workspace.store import read_runs, read_state


def test_scene_pack_crud_and_state_use_hierarchy_contract(tmp_path: Path) -> None:
    client = client_with_provider(tmp_path)

    create_response = client.post(
        "/api/course-planner/scene-packs",
        json=scene_pack_payload("厨房专项"),
    )
    scene_pack_id = create_response.json()["scenePack"]["id"]
    patch_response = client.patch(
        f"/api/course-planner/scene-packs/{scene_pack_id}",
        json={"title": "厨房早餐篇", "notes": "强化水槽动作。"},
    )
    list_response = client.get("/api/course-planner/scene-packs")
    delete_response = client.delete(f"/api/course-planner/scene-packs/{scene_pack_id}")
    deleted_state_response = client.get("/api/course-planner/state")

    assert create_response.status_code == 200
    created = create_response.json()["scenePack"]
    assert created["id"].startswith("scene_pack_")
    assert created["title"] == "厨房专项"
    assert "target_level" not in created
    assert "chapter_count" not in created

    assert patch_response.status_code == 200
    assert patch_response.json()["scenePack"]["title"] == "厨房早餐篇"
    assert list_response.json()["scenePacks"][0]["id"] == scene_pack_id
    assert delete_response.status_code == 200
    assert delete_response.json()["scenePack"]["status"] == "archived"
    assert deleted_state_response.json()["scenePacks"][0]["status"] == "archived"


def test_candidate_batch_is_ephemeral_and_accepting_creates_generated_chapter_id(
    tmp_path: Path,
) -> None:
    provider = FakeProvider([candidate_ai_payload(), candidate_ai_payload()])
    client = client_with_provider(tmp_path, provider)
    scene_pack_id = create_scene_pack(client)

    batch_response = client.post(
        f"/api/course-planner/scene-packs/{scene_pack_id}/candidate-batches",
        json={"feedback": "多一点厨房动作"},
    )
    revision_response = client.post(
        f"/api/course-planner/scene-packs/{scene_pack_id}/candidate-revisions",
        json={"feedback": "保留厨房，但强化水槽附近动作"},
    )
    accept_response = client.post(
        f"/api/course-planner/scene-packs/{scene_pack_id}/chapters",
        json=chapter_seed_payload(),
    )
    chapters_response = client.get(
        f"/api/course-planner/scene-packs/{scene_pack_id}/chapters"
    )

    assert batch_response.status_code == 200
    payload = batch_response.json()
    candidate_ids = [candidate["id"] for candidate in payload["candidates"]]
    assert payload["task"]["kind"] == "generate_chapter_candidates"
    assert len(candidate_ids) == 2
    assert len(set(candidate_ids)) == 2
    assert all(candidate_id.startswith("candidate_") for candidate_id in candidate_ids)
    assert payload["candidates"][0]["scene_pack_id"] == scene_pack_id
    assert payload["candidates"][0]["title"] == "清洗苹果"
    assert payload["candidates"][0]["seed"]["object_coverage_hint"]
    assert payload["candidates"][0]["seed"]["character_concept_hint"]["main_cast_hint"]
    assert payload["candidatePersistence"] == "ephemeral"
    delete_candidate_response = client.delete(
        f"/api/course-planner/candidates/{candidate_ids[0]}"
    )
    assert revision_response.status_code == 200
    assert revision_response.json()["task"]["kind"] == "revise_chapter_candidates"
    assert revision_response.json()["candidatePersistence"] == "ephemeral"
    prompt = provider.requests[0][0]
    assert "Scene Pack" in prompt
    assert "target_level" not in prompt
    assert "chapter_count" not in prompt
    assert "reject" not in prompt.lower()

    assert delete_candidate_response.status_code == 200
    assert delete_candidate_response.json()["candidateId"] == candidate_ids[0]
    assert delete_candidate_response.json()["candidatePersistence"] == "ephemeral"
    assert accept_response.status_code == 200
    chapter = accept_response.json()["chapter"]
    assert chapter["id"].startswith("chapter_")
    assert chapter["id"] not in candidate_ids
    assert chapter["seed"]["chapter_id"] == chapter["id"]
    assert chapter["seed"]["scene_pack_id"] == scene_pack_id
    assert chapters_response.json()["chapters"][0]["id"] == chapter["id"]


def test_candidate_batch_failure_returns_public_error_without_schema_leak(
    tmp_path: Path,
) -> None:
    provider = FakeProvider(
        [
            RuntimeError(
                "Codex CLI JSON task failed: invalid_json_schema Missing cast_mode text.format.schema"
            )
        ]
    )
    client = client_with_provider(tmp_path, provider)
    scene_pack_id = create_scene_pack(client)

    response = client.post(
        f"/api/course-planner/scene-packs/{scene_pack_id}/candidate-batches",
        json={"feedback": ""},
    )

    assert response.status_code == 502
    detail = response.json()["detail"]
    assert (
        detail["message"]
        == "Course Planner AI task failed. Check the AI task record for diagnostics."
    )
    assert detail["task"]["status"] == "failed"
    assert "task_" in detail["task"]["id"]
    assert "invalid_json_schema" not in json.dumps(detail)
    assert "cast_mode" not in json.dumps(detail)


def test_chapter_order_and_delete_share_one_list_state(tmp_path: Path) -> None:
    client = client_with_provider(tmp_path)
    scene_pack_id = create_scene_pack(client)
    first_id = create_chapter(client, scene_pack_id)
    second_response = client.post(
        f"/api/course-planner/scene-packs/{scene_pack_id}/chapters",
        json={**chapter_seed_payload(), "chapter_title": "摆好餐盘"},
    )
    second_id = second_response.json()["chapter"]["id"]

    reorder_response = client.patch(
        f"/api/course-planner/scene-packs/{scene_pack_id}/chapter-order",
        json={"chapterIds": [second_id, first_id]},
    )
    delete_response = client.delete(
        f"/api/course-planner/scene-packs/{scene_pack_id}/chapters/{first_id}"
    )
    chapters_response = client.get(
        f"/api/course-planner/scene-packs/{scene_pack_id}/chapters"
    )

    assert reorder_response.status_code == 200
    assert reorder_response.json()["scenePack"]["chapter_ids"] == [second_id, first_id]
    assert delete_response.status_code == 200
    assert chapters_response.json()["chapters"][0]["id"] == second_id


def test_state_payload_does_not_expose_prompt_versions_or_image_attempts(
    tmp_path: Path,
) -> None:
    client = client_with_provider(tmp_path)
    scene_pack_id = create_scene_pack(client)
    create_chapter(client, scene_pack_id)

    response = client.get("/api/course-planner/state")

    assert response.status_code == 200
    payload = response.json()
    version_list_field = "prompt" + "Versions"
    attempt_list_field = "image" + "Attempts"
    selected_version_field = "selected" + "Prompt" + "VersionId"
    adopted_version_field = "adopted" + "Prompt" + "VersionId"
    assert version_list_field not in payload
    assert attempt_list_field not in payload
    assert selected_version_field not in payload
    assert adopted_version_field not in json.dumps(payload)
    assert set(payload) == {"scenePacks", "chapters", "tasks"}


def test_cross_pack_chapter_delete_rejects_ownership_before_descendant_check(
    tmp_path: Path,
) -> None:
    client = client_with_provider(tmp_path)
    route_scene_pack_id = create_scene_pack(client)
    owner_scene_pack_id = client.post(
        "/api/course-planner/scene-packs",
        json=scene_pack_payload("卧室专项"),
    ).json()["scenePack"]["id"]
    owned_chapter_id = create_chapter(client, owner_scene_pack_id)

    response = client.delete(
        f"/api/course-planner/scene-packs/{route_scene_pack_id}/chapters/{owned_chapter_id}"
    )
    owner_chapters_response = client.get(
        f"/api/course-planner/scene-packs/{owner_scene_pack_id}/chapters"
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Chapter not found."
    assert owner_chapters_response.json()["chapters"][0]["id"] == owned_chapter_id


def test_final_scene_import_route_uses_scene_package_final_scene(tmp_path: Path) -> None:
    client = client_with_provider(tmp_path)
    scene_pack_id = create_scene_pack(client)
    chapter_id = create_chapter(client, scene_pack_id)
    client.patch(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/prompt",
        json={
            "promptText": "Bedroom reading corner.",
            "sceneSpatialContract": "Desk by the window, lamp near the book stack.",
            "targetObjects": [
                {"label": "book", "priority": "required"},
                {"label": "lamp", "priority": "recommended"},
            ],
            "avoidObjects": [],
            "promptConfirmations": {
                "avoidObjectsReviewed": True,
                "styleReferenceMode": "confirmed_empty",
            },
        },
    )
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
        data={"displayName": "book", "linkedTargetObjectId": "target_object_001"},
        files={"file": ("book.png", _png_bytes(width=32, height=32), "image/png")},
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
                    "display_name": "book",
                    "runtime_role": "target",
                    "transform": {"cx": 0.5, "cy": 0.5, "w": 0.2, "h": 0.2, "rotation_deg": 0},
                    "requires_placed": [],
                }
            ],
            "groups": [],
            "layer_order": ["placement_001"],
        },
    )
    client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/final-scene",
        files={"file": ("final.png", _png_bytes(width=120, height=80), "image/png")},
    )

    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/final-scene/import"
    )

    assert response.status_code == 200
    run = response.json()["run"]
    run_root = client.app.state.workspace_root / "runs" / run["id"]
    state = read_state(run_root)
    assert state.detectionVocabulary == ["book", "lamp"]
    scene_context = json.loads((run_root / "scene_context.json").read_text(encoding="utf-8"))
    assert scene_context["source"] == "course_planner"
    assert scene_context["chapter_id"] == chapter_id
    assert scene_context["final_scene_id"].startswith("final_scene_")
    assert scene_context["selected_empty_scene_image_id"] == empty_id
    assert scene_context["target_object_labels"] == ["book", "lamp"]
    assert scene_context["final_scene_storage_path"].startswith("final_scene/")
    assert read_runs(client.app.state.workspace_root)[0].id == run["id"]


def test_final_scene_import_route_requires_locked_final_scene(tmp_path: Path) -> None:
    client = client_with_provider(tmp_path)
    scene_pack_id = create_scene_pack(client)
    chapter_id = create_chapter(client, scene_pack_id)

    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/final-scene/import"
    )

    assert response.status_code == 409
    assert "Final chapter scene must be locked before importing to pipeline." in response.json()[
        "detail"
    ]


def _png_bytes(*, width: int = 16, height: int = 12) -> bytes:
    image = Image.new("RGBA", (width, height), (255, 0, 0, 255))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()
