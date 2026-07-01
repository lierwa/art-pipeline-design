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
    create_prompt_version,
    create_scene_pack,
    prompt_version_ai_payload,
    review_ai_payload,
    scene_pack_payload,
)


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
    provider = FakeProvider([
        RuntimeError(
            "Codex CLI JSON task failed: invalid_json_schema Missing cast_mode text.format.schema"
        )
    ])
    client = client_with_provider(tmp_path, provider)
    scene_pack_id = create_scene_pack(client)

    response = client.post(
        f"/api/course-planner/scene-packs/{scene_pack_id}/candidate-batches",
        json={"feedback": ""},
    )

    assert response.status_code == 502
    detail = response.json()["detail"]
    assert detail["message"] == "Course Planner AI task failed. Check the AI task record for diagnostics."
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


def test_prompt_versions_package_attempt_review_and_import_are_version_scoped(
    tmp_path: Path,
) -> None:
    provider = FakeProvider([prompt_version_ai_payload(), review_ai_payload()])
    client = client_with_provider(tmp_path, provider)
    scene_pack_id = create_scene_pack(client)
    chapter_id = create_chapter(client, scene_pack_id)

    create_version_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/prompt-versions",
        json={"feedback": "强调水槽和红苹果"},
    )
    version_id = create_version_response.json()["promptVersion"]["id"]
    duplicate_response = client.post(
        f"/api/course-planner/prompt-versions/{version_id}/duplicate"
    )
    package_response = client.post(
        f"/api/course-planner/prompt-versions/{version_id}/prompt-package"
    )
    attempt_response = client.post(
        f"/api/course-planner/prompt-versions/{version_id}/image-attempts",
        json={"uploadedImageId": "uploads/generated.png"},
    )
    attempt_id = attempt_response.json()["imageAttempt"]["id"]
    source_path = tmp_path / "scene_library" / "uploads" / "generated.png"
    source_path.parent.mkdir(parents=True)
    source_path.write_bytes(_png_bytes())
    review_response = client.post(f"/api/course-planner/image-attempts/{attempt_id}/review")
    attempts_response = client.get(
        f"/api/course-planner/prompt-versions/{version_id}/image-attempts"
    )
    import_response = client.post(f"/api/course-planner/image-attempts/{attempt_id}/import")
    delete_response = client.delete(f"/api/course-planner/prompt-versions/{version_id}")

    assert create_version_response.status_code == 200
    version = create_version_response.json()["promptVersion"]
    assert version["chapter_id"] == chapter_id
    assert version["version_label"] == "V001"
    assert version["cast_bindings"][0]["character_id"] == "tuantuan"
    assert version["scene_vocabulary"]["optional_vocabulary_candidates"] == [
        "cup",
        "plate",
        "chair",
        "window",
    ]
    assert "tuantuan" in version["prompt_package"]["full_prompt"]
    assert "Do not force every candidate object into the image" in version["prompt_package"]["full_prompt"]
    assert "Detection keywords" not in version["prompt_package"]["full_prompt"]
    assert provider.requests[0][1].__name__ == "GeneratePromptVersionOutput"

    assert duplicate_response.status_code == 200
    duplicate = duplicate_response.json()["promptVersion"]
    assert duplicate["source_version_id"] == version_id
    assert duplicate["version_label"] == "V002"

    assert package_response.status_code == 200
    assert "红苹果" in package_response.json()["promptPackage"]["full_prompt"]
    assert "Required objects by priority:" not in package_response.json()["promptPackage"]["full_prompt"]
    assert attempt_response.status_code == 200
    assert attempt_response.json()["imageAttempt"]["prompt_version_id"] == version_id
    assert review_response.status_code == 200
    assert review_response.json()["imageAttempt"]["status"] == "ai_reviewed"
    assert attempts_response.json()["imageAttempts"][0]["id"] == attempt_id
    assert import_response.status_code == 200
    imported = import_response.json()
    assert imported["runId"].startswith("run_")
    assert imported["imageAttempt"]["status"] == "imported"
    assert imported["imageAttempt"]["pipeline_import_id"] == imported["runId"]
    run_root = tmp_path / "workspace" / "runs" / imported["runId"]
    context = json.loads((run_root / "scene_context.json").read_text(encoding="utf-8"))
    assert context["prompt_version_id"] == version_id
    assert context["image_attempt_id"] == attempt_id
    assert delete_response.status_code == 200
    assert delete_response.json()["promptVersion"]["status"] == "archived"


def test_adopt_prompt_version_uses_hierarchy_contract(tmp_path: Path) -> None:
    provider = FakeProvider([prompt_version_ai_payload(), prompt_version_ai_payload()])
    client = client_with_provider(tmp_path, provider)
    scene_pack_id = create_scene_pack(client)
    chapter_id = create_chapter(client, scene_pack_id)
    first_id = create_prompt_version(client, chapter_id)
    second_id = create_prompt_version(client, chapter_id)

    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/prompt-versions/{second_id}/adopt"
    )
    state_response = client.get("/api/course-planner/state")

    assert response.status_code == 200
    assert response.json()["chapter"]["adopted_prompt_version_id"] == second_id
    versions = {
        version["id"]: version["status"]
        for version in response.json()["promptVersions"]
    }
    assert versions == {first_id: "prompt_ready", second_id: "adopted"}
    chapter = state_response.json()["chapters"][0]
    assert chapter["adopted_prompt_version_id"] == second_id


def test_prompt_package_preserves_adopted_prompt_version_status(
    tmp_path: Path,
) -> None:
    provider = FakeProvider([prompt_version_ai_payload()])
    client = client_with_provider(tmp_path, provider)
    scene_pack_id = create_scene_pack(client)
    chapter_id = create_chapter(client, scene_pack_id)
    version_id = create_prompt_version(client, chapter_id)

    adopt_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/prompt-versions/{version_id}/adopt"
    )
    package_response = client.post(
        f"/api/course-planner/prompt-versions/{version_id}/prompt-package"
    )
    state_response = client.get("/api/course-planner/state")

    assert adopt_response.status_code == 200
    assert package_response.status_code == 200
    assert package_response.json()["promptVersion"]["status"] == "adopted"
    chapter = state_response.json()["chapters"][0]
    version = state_response.json()["promptVersions"][0]
    assert chapter["adopted_prompt_version_id"] == version_id
    assert version["id"] == version_id
    assert version["status"] == "adopted"


def test_patch_adopted_prompt_version_uses_chapter_pointer_contract(
    tmp_path: Path,
) -> None:
    provider = FakeProvider([prompt_version_ai_payload(), prompt_version_ai_payload()])
    client = client_with_provider(tmp_path, provider)
    scene_pack_id = create_scene_pack(client)
    chapter_id = create_chapter(client, scene_pack_id)
    first_id = create_prompt_version(client, chapter_id)
    second_id = create_prompt_version(client, chapter_id)

    first_adopt_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/prompt-versions/{first_id}/adopt"
    )
    patch_response = client.patch(
        f"/api/course-planner/prompt-versions/{second_id}",
        json={"status": "adopted"},
    )
    package_response = client.post(
        f"/api/course-planner/prompt-versions/{second_id}/prompt-package"
    )
    state_response = client.get("/api/course-planner/state")

    assert first_adopt_response.status_code == 200
    assert patch_response.status_code == 200
    assert patch_response.json()["promptVersion"]["status"] == "adopted"
    assert package_response.status_code == 200
    assert package_response.json()["promptVersion"]["status"] == "adopted"
    state = state_response.json()
    chapter = state["chapters"][0]
    statuses = {version["id"]: version["status"] for version in state["promptVersions"]}
    assert chapter["adopted_prompt_version_id"] == second_id
    assert statuses == {first_id: "prompt_ready", second_id: "adopted"}


def test_archiving_current_adopted_prompt_version_is_rejected(
    tmp_path: Path,
) -> None:
    provider = FakeProvider([prompt_version_ai_payload(), prompt_version_ai_payload()])
    client = client_with_provider(tmp_path, provider)
    scene_pack_id = create_scene_pack(client)
    chapter_id = create_chapter(client, scene_pack_id)
    adopted_id = create_prompt_version(client, chapter_id)
    draft_id = create_prompt_version(client, chapter_id)

    adopt_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/prompt-versions/{adopted_id}/adopt"
    )
    delete_adopted_response = client.delete(
        f"/api/course-planner/prompt-versions/{adopted_id}"
    )
    patch_adopted_response = client.patch(
        f"/api/course-planner/prompt-versions/{adopted_id}",
        json={"status": "archived"},
    )
    delete_draft_response = client.delete(
        f"/api/course-planner/prompt-versions/{draft_id}"
    )
    state_response = client.get("/api/course-planner/state")

    assert adopt_response.status_code == 200
    assert delete_adopted_response.status_code == 409
    assert "adopt" in delete_adopted_response.json()["detail"]
    assert patch_adopted_response.status_code == 409
    assert delete_draft_response.status_code == 200
    assert delete_draft_response.json()["promptVersion"]["status"] == "archived"
    state = state_response.json()
    statuses = {version["id"]: version["status"] for version in state["promptVersions"]}
    assert state["chapters"][0]["adopted_prompt_version_id"] == adopted_id
    assert statuses == {adopted_id: "adopted", draft_id: "archived"}


def test_upload_image_attempt_persists_file_under_scene_library(tmp_path: Path) -> None:
    provider = FakeProvider([prompt_version_ai_payload()])
    client = client_with_provider(tmp_path, provider)
    scene_pack_id = create_scene_pack(client)
    chapter_id = create_chapter(client, scene_pack_id)
    version_id = create_prompt_version(client, chapter_id)

    response = client.post(
        f"/api/course-planner/prompt-versions/{version_id}/image-attempts/upload",
        files={"file": ("kitchen-v001.png", _png_bytes(), "image/png")},
    )

    assert response.status_code == 200
    attempt = response.json()["imageAttempt"]
    assert attempt["prompt_version_id"] == version_id
    assert attempt["uploaded_image_id"].startswith(
        f"uploads/course_planner/{version_id}/"
    )
    stored_path = tmp_path / "scene_library" / attempt["uploaded_image_id"]
    assert stored_path.exists()
    assert stored_path.suffix == ".png"
    preview_response = client.get(
        f"/api/course-planner/uploads/{attempt['uploaded_image_id']}"
    )
    traversal_response = client.get(
        "/api/course-planner/uploads/uploads/course_planner/%2E%2E/secret.png"
    )
    assert preview_response.status_code == 200
    assert preview_response.headers["content-type"] == "image/png"
    assert preview_response.content == stored_path.read_bytes()
    assert traversal_response.status_code in {400, 404}
    import_response = client.post(
        f"/api/course-planner/image-attempts/{attempt['id']}/import"
    )
    assert import_response.status_code == 200
    assert import_response.json()["imageAttempt"]["status"] == "imported"


def test_image_attempt_human_decision_persists_to_state(tmp_path: Path) -> None:
    provider = FakeProvider([prompt_version_ai_payload()])
    client = client_with_provider(tmp_path, provider)
    scene_pack_id = create_scene_pack(client)
    chapter_id = create_chapter(client, scene_pack_id)
    version_id = create_prompt_version(client, chapter_id)
    attempt_response = client.post(
        f"/api/course-planner/prompt-versions/{version_id}/image-attempts",
        json={"uploadedImageId": "uploads/generated.png"},
    )
    attempt_id = attempt_response.json()["imageAttempt"]["id"]

    response = client.patch(
        f"/api/course-planner/image-attempts/{attempt_id}",
        json={"status": "not_accepted", "humanDecision": "delete"},
    )
    state_response = client.get("/api/course-planner/state")

    assert response.status_code == 200
    assert response.json()["imageAttempt"]["status"] == "not_accepted"
    assert response.json()["imageAttempt"]["human_decision"] == "delete"
    stored_attempt = state_response.json()["imageAttempts"][0]
    assert stored_attempt["status"] == "not_accepted"
    assert stored_attempt["human_decision"] == "delete"


def test_prompt_version_source_must_belong_to_target_chapter(tmp_path: Path) -> None:
    provider = FakeProvider([prompt_version_ai_payload()])
    client = client_with_provider(tmp_path, provider)
    scene_pack_id = create_scene_pack(client)
    first_chapter_id = create_chapter(client, scene_pack_id)
    second_chapter_id = create_chapter(client, scene_pack_id)
    source_id = create_prompt_version(client, first_chapter_id)

    response = client.post(
        f"/api/course-planner/chapters/{second_chapter_id}/prompt-versions",
        json={"sourceVersionId": source_id},
    )

    assert response.status_code == 400
    assert "source" in response.json()["detail"].lower()
    assert len(provider.requests) == 1


def test_chapter_delete_rejects_existing_prompt_versions_without_orphaning(
    tmp_path: Path,
) -> None:
    provider = FakeProvider([prompt_version_ai_payload()])
    client = client_with_provider(tmp_path, provider)
    scene_pack_id = create_scene_pack(client)
    chapter_id = create_chapter(client, scene_pack_id)
    create_prompt_version(client, chapter_id)

    response = client.delete(
        f"/api/course-planner/scene-packs/{scene_pack_id}/chapters/{chapter_id}"
    )
    chapters_response = client.get(
        f"/api/course-planner/scene-packs/{scene_pack_id}/chapters"
    )

    assert response.status_code == 409
    assert chapters_response.json()["chapters"][0]["id"] == chapter_id


def test_cross_pack_chapter_delete_rejects_ownership_before_descendant_check(
    tmp_path: Path,
) -> None:
    provider = FakeProvider([prompt_version_ai_payload()])
    client = client_with_provider(tmp_path, provider)
    route_scene_pack_id = create_scene_pack(client)
    owner_scene_pack_id = create_scene_pack(client)
    owned_chapter_id = create_chapter(client, owner_scene_pack_id)
    create_prompt_version(client, owned_chapter_id)

    response = client.delete(
        f"/api/course-planner/scene-packs/{route_scene_pack_id}/chapters/{owned_chapter_id}"
    )
    owner_chapters_response = client.get(
        f"/api/course-planner/scene-packs/{owner_scene_pack_id}/chapters"
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Chapter not found."
    assert owner_chapters_response.json()["chapters"][0]["id"] == owned_chapter_id


def _png_bytes() -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (3, 2), color=(20, 120, 220)).save(buffer, format="PNG")
    return buffer.getvalue()
