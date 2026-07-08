from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from art_pipeline.course_planner.store import CoursePlannerStore
from art_pipeline.workspace.store import run_root
from generated_assets_route_test_helpers import (
    _create_chapter_with_complete_run,
    _generated_element,
    _quality_report_path,
    _write_run_with_generated_assets,
)
from route_test_helpers import client_with_provider
from scene_package_route_test_helpers import _png_bytes


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


def test_materialize_generated_asset_ignores_quality_report_failures(
    client: TestClient,
) -> None:
    chapter_id = _create_chapter_with_complete_run(client)
    _write_run_with_generated_assets(
        client,
        "run_current",
        [_generated_element("element_functional", "debug fixture cat", source_provider="codex_agent")],
        quality_reports={
            "element_functional": {
                "status": "failed",
                "errors": ["not production-realistic"],
            }
        },
    )

    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/generated-assets/materialize",
        json={
            "completeSceneImageId": "complete_scene_001",
            "pipelineRunId": "run_current",
            "runAssetId": "element_functional",
        },
    )

    assert response.status_code == 200
    asset = response.json()["chapterAsset"]
    assert asset["display_name"] == "debug fixture cat"
    assert asset["lineage"]["run_asset_id"] == "element_functional"
    assert _quality_report_path(client, "run_current", "element_functional").is_file()


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
