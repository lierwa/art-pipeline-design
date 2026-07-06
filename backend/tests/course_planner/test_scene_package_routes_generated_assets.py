from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from art_pipeline.course_planner.store import CoursePlannerStore
from art_pipeline.elements import BoundingBox, ElementRecord, SourceMetadata, WorkspaceState
from art_pipeline.workspace.store import (
    WorkspaceRunSummary,
    run_root,
    upsert_run,
    utc_now,
    write_state,
)
from route_test_helpers import client_with_provider
from scene_package_route_test_helpers import (
    _create_chapter,
    _png_bytes,
)


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    return client_with_provider(tmp_path)


def test_list_generated_assets_returns_current_chapter_codex_outputs(
    client: TestClient,
) -> None:
    chapter_id = _create_chapter_with_complete_run(client)
    _write_run_with_generated_assets(
        client,
        "run_current",
        [
            _generated_element("element_good", "book", source_provider="codex_agent"),
            _generated_element("element_bad_quality", "lamp", source_provider="codex_agent"),
            _generated_element("element_missing_file", "pillow", source_provider="codex_agent"),
            _generated_element("element_unreadable", "plant", source_provider="codex_cli"),
            _generated_element("element_not_codex", "chair", source_provider="sam2"),
        ],
        missing_asset_ids={"element_missing_file"},
        corrupt_asset_ids={"element_unreadable"},
        quality_reports={
            "element_bad_quality": {
                "status": "failed",
                "errors": ["near-copy risk"],
                "warnings": ["thin alpha fringe"],
            }
        },
    )

    response = client.get(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/generated-assets"
    )

    assert response.status_code == 200
    assets = response.json()["generatedAssets"]
    by_id = {asset["run_asset_id"]: asset for asset in assets}
    assert set(by_id) == {
        "element_good",
        "element_bad_quality",
        "element_missing_file",
        "element_unreadable",
    }
    assert by_id["element_good"]["state"] == "available"
    assert by_id["element_good"]["width"] == 18
    assert by_id["element_good"]["height"] == 14
    assert by_id["element_bad_quality"]["state"] == "available"
    assert _quality_report_path(client, "run_current", "element_bad_quality").is_file()
    assert by_id["element_missing_file"]["state"] == "unavailable"
    assert "missing" in by_id["element_missing_file"]["unavailable_reason"].lower()
    assert by_id["element_unreadable"]["state"] == "unavailable"
    assert "dimensions" in by_id["element_unreadable"]["unavailable_reason"].lower()


def test_list_generated_assets_excludes_other_chapter_runs(client: TestClient) -> None:
    chapter_id = _create_chapter_with_complete_run(client)
    other_chapter_id = _create_chapter_with_complete_run(
        client,
        complete_id="complete_scene_001",
        run_id="run_other",
    )
    _write_run_with_generated_assets(
        client,
        "run_current",
        [_generated_element("element_current", "book", source_provider="codex_agent")],
    )
    _write_run_with_generated_assets(
        client,
        "run_other",
        [_generated_element("element_other", "lamp", source_provider="codex_agent")],
    )

    response = client.get(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/generated-assets"
    )

    assert response.status_code == 200
    assert [asset["run_asset_id"] for asset in response.json()["generatedAssets"]] == [
        "element_current"
    ]
    assert other_chapter_id != chapter_id


def test_list_generated_assets_marks_existing_materialization_added(
    client: TestClient,
) -> None:
    chapter_id = _create_chapter_with_complete_run(client)
    _write_run_with_generated_assets(
        client,
        "run_current",
        [_generated_element("element_good", "book", source_provider="codex_agent")],
    )
    materialized = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/generated-assets/materialize",
        json={
            "completeSceneImageId": "complete_scene_001",
            "pipelineRunId": "run_current",
            "runAssetId": "element_good",
        },
    )
    assert materialized.status_code == 200
    asset_id = materialized.json()["chapterAsset"]["id"]

    response = client.get(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/generated-assets"
    )

    assert response.status_code == 200
    generated_asset = response.json()["generatedAssets"][0]
    assert generated_asset["state"] == "added"
    assert generated_asset["chapter_asset_id"] == asset_id


def test_materialize_generated_asset_copies_into_chapter_assets(
    client: TestClient,
) -> None:
    chapter_id = _create_chapter_with_complete_run(client)
    _write_run_with_generated_assets(
        client,
        "run_current",
        [_generated_element("element_good", "book", source_provider="codex_agent")],
    )

    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/generated-assets/materialize",
        json={
            "completeSceneImageId": "complete_scene_001",
            "pipelineRunId": "run_current",
            "runAssetId": "element_good",
        },
    )

    assert response.status_code == 200
    asset = response.json()["chapterAsset"]
    assert asset["display_name"] == "book"
    assert asset["lineage"] == {
        "source_kind": "generated_asset",
        "complete_scene_image_id": "complete_scene_001",
        "pipeline_run_id": "run_current",
        "run_asset_id": "element_good",
    }
    assert response.json()["scenePackage"]["chapter_assets"][0]["id"] == asset["id"]
    media_response = client.get(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/media/chapter_assets/{asset['id']}"
    )
    assert media_response.status_code == 200
    assert media_response.content == _png_bytes(width=18, height=14)


def test_materialize_generated_asset_is_idempotent_by_default(
    client: TestClient,
) -> None:
    chapter_id = _create_chapter_with_complete_run(client)
    _write_run_with_generated_assets(
        client,
        "run_current",
        [_generated_element("element_good", "book", source_provider="codex_agent")],
    )
    payload = {
        "completeSceneImageId": "complete_scene_001",
        "pipelineRunId": "run_current",
        "runAssetId": "element_good",
    }

    first = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/generated-assets/materialize",
        json=payload,
    )
    second = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/generated-assets/materialize",
        json=payload,
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["chapterAsset"]["id"] == first.json()["chapterAsset"]["id"]
    assert len(second.json()["scenePackage"]["chapter_assets"]) == 1


def test_materialize_generated_asset_is_idempotent_across_complete_images(
    client: TestClient,
) -> None:
    chapter_id = _create_chapter_with_complete_run(client)
    _write_run_with_generated_assets(
        client,
        "run_current",
        [_generated_element("element_good", "book", source_provider="codex_agent")],
    )
    second_complete_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/complete-images",
        files={"file": ("complete-2.png", _png_bytes(width=96, height=64), "image/png")},
    )
    assert second_complete_response.status_code == 200
    second_complete_id = second_complete_response.json()["scenePackage"][
        "complete_images"
    ][1]["id"]
    CoursePlannerStore(
        client.app.state.scene_library_root
    ).record_complete_image_import_run(
        chapter_id,
        second_complete_id,
        run_id="run_current",
        run_status="succeeded",
    )

    first = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/generated-assets/materialize",
        json={
            "completeSceneImageId": "complete_scene_001",
            "pipelineRunId": "run_current",
            "runAssetId": "element_good",
        },
    )
    second = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/generated-assets/materialize",
        json={
            "completeSceneImageId": second_complete_id,
            "pipelineRunId": "run_current",
            "runAssetId": "element_good",
        },
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["chapterAsset"]["id"] == first.json()["chapterAsset"]["id"]
    assert len(second.json()["scenePackage"]["chapter_assets"]) == 1


def test_active_generated_asset_blocks_source_complete_image_delete(
    client: TestClient,
) -> None:
    chapter_id = _create_chapter_with_complete_run(client)
    _write_run_with_generated_assets(
        client,
        "run_current",
        [_generated_element("element_good", "book", source_provider="codex_agent")],
    )
    materialized = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/generated-assets/materialize",
        json={
            "completeSceneImageId": "complete_scene_001",
            "pipelineRunId": "run_current",
            "runAssetId": "element_good",
        },
    )
    assert materialized.status_code == 200

    response = client.delete(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/complete-images/complete_scene_001"
    )

    assert response.status_code == 409
    assert "chapter assets" in response.json()["detail"]


def test_delete_materialized_generated_asset_preserves_source_outputs(
    client: TestClient,
) -> None:
    chapter_id = _create_chapter_with_complete_run(client)
    _write_run_with_generated_assets(
        client,
        "run_current",
        [_generated_element("element_good", "book", source_provider="codex_agent")],
    )
    materialized = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/generated-assets/materialize",
        json={
            "completeSceneImageId": "complete_scene_001",
            "pipelineRunId": "run_current",
            "runAssetId": "element_good",
        },
    )
    asset = materialized.json()["chapterAsset"]
    package = materialized.json()["scenePackage"]
    empty_id = package["current_empty_scene_image_id"]
    assembly_response = client.put(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/assembly",
        json={
            "schema_version": 1,
            "empty_scene_image_id": empty_id,
            "empty_scene_size": {"width": 72, "height": 48},
            "placements": [
                {
                    "id": "placement_001",
                    "asset_id": asset["id"],
                    "display_name": "book",
                    "runtime_role": "target",
                    "transform": {
                        "cx": 0.5,
                        "cy": 0.5,
                        "w": 0.2,
                        "h": 0.2,
                        "rotation_deg": 0,
                    },
                    "requires_placed": [],
                }
            ],
            "groups": [],
            "layer_order": ["placement_001"],
        },
    )
    assert assembly_response.status_code == 200
    source_asset = (
        run_root(client.app.state.workspace_root, "run_current")
        / "elements"
        / "element_good"
        / "codex_final"
        / "transparent_asset.png"
    )
    complete_media = CoursePlannerStore(
        client.app.state.scene_library_root
    ).read_chapter_scene_package_media(
        chapter_id,
        "complete_images",
        "complete_scene_001",
    )[0]

    response = client.delete(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/chapter-assets/{asset['id']}"
    )

    assert response.status_code == 200
    next_package = response.json()["scenePackage"]
    assert next_package["chapter_assets"][0]["status"] == "removed"
    assert next_package["assembly"]["placements"] == []
    assert next_package["complete_images"][0]["status"] == "active"
    assert source_asset.exists()
    assert complete_media.exists()


def _create_chapter_with_complete_run(
    client: TestClient,
    *,
    complete_id: str = "complete_scene_001",
    run_id: str = "run_current",
) -> str:
    chapter_id = _create_chapter(client)
    prompt_response = client.patch(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/prompt",
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
    assert prompt_response.status_code == 200, prompt_response.text
    empty_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/empty-scene-images",
        files={"file": ("empty.png", _png_bytes(width=72, height=48), "image/png")},
    )
    assert empty_response.status_code == 200, empty_response.text
    empty_scene_id = empty_response.json()["scenePackage"]["empty_scene_images"][0]["id"]
    select_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/current-empty-scene",
        json={"emptySceneImageId": empty_scene_id},
    )
    assert select_response.status_code == 200, select_response.text
    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/complete-images",
        files={"file": ("complete.png", _png_bytes(width=96, height=64), "image/png")},
    )
    assert response.status_code == 200
    assert response.json()["scenePackage"]["complete_images"][0]["id"] == complete_id
    package = CoursePlannerStore(
        client.app.state.scene_library_root
    ).record_complete_image_import_run(
        chapter_id,
        complete_id,
        run_id=run_id,
        run_status="succeeded",
    )
    assert package.complete_images[0].pipeline_run_id == run_id
    return chapter_id


def _write_run_with_generated_assets(
    client: TestClient,
    run_id: str,
    elements: list[ElementRecord],
    *,
    missing_asset_ids: set[str] | None = None,
    corrupt_asset_ids: set[str] | None = None,
    quality_reports: dict[str, dict[str, object]] | None = None,
) -> None:
    workspace_root = client.app.state.workspace_root
    root = run_root(workspace_root, run_id)
    root.mkdir(parents=True, exist_ok=True)
    state = WorkspaceState(
        source=SourceMetadata(
            filename="original.png",
            path="source/original.png",
            width=96,
            height=64,
        ),
        elements=elements,
    )
    write_state(root, state)
    now = utc_now()
    upsert_run(
        workspace_root,
        WorkspaceRunSummary(
            id=run_id,
            title=run_id,
            sourceFilename=f"{run_id}.png",
            createdAt=now,
            updatedAt=now,
            status="extracting",
            elementCount=len(elements),
        ),
    )
    missing_asset_ids = missing_asset_ids or set()
    corrupt_asset_ids = corrupt_asset_ids or set()
    quality_reports = quality_reports or {}
    for element in elements:
        codex_final_dir = root / "elements" / element.id / "codex_final"
        asset_path = codex_final_dir / "transparent_asset.png"
        if element.id in missing_asset_ids:
            continue
        asset_path.parent.mkdir(parents=True, exist_ok=True)
        if element.id in corrupt_asset_ids:
            asset_path.write_bytes(b"not-a-png")
            continue
        asset_path.write_bytes(_png_bytes(width=18, height=14))
        if quality_report := quality_reports.get(element.id):
            (codex_final_dir / "quality_report.json").write_text(
                json.dumps(quality_report),
                encoding="utf-8",
            )


def _quality_report_path(client: TestClient, run_id: str, element_id: str) -> Path:
    return (
        run_root(client.app.state.workspace_root, run_id)
        / "elements"
        / element_id
        / "codex_final"
        / "quality_report.json"
    )


def _generated_element(
    element_id: str,
    name: str,
    *,
    source_provider: str,
) -> ElementRecord:
    return ElementRecord(
        id=element_id,
        name=name,
        status="repair_complete",
        mode="completed_by_codex" if source_provider.startswith("codex") else "visible_only",
        sourceProvider=source_provider,
        repairStatus="repair_complete",
        exportStatus="ready",
        bbox=BoundingBox(x=0, y=0, w=18, h=14),
    )
