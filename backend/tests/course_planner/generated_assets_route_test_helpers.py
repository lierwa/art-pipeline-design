from __future__ import annotations

import json
from pathlib import Path

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
from scene_package_route_test_helpers import (
    _create_chapter,
    _png_bytes,
)


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
