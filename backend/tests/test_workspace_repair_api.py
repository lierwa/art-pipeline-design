from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import art_pipeline.api as workspace_api
import art_pipeline.exporting.exporter as workspace_exporter
from art_pipeline.elements import DEFAULT_WORKSPACE_VOCABULARY, EXPANDED_DEFAULT_WORKSPACE_VOCABULARY
from workspace_api_helpers import (
    CORE_OBJECT_WORKSPACE_VOCABULARY,
    client,
    make_gradient_scene_bytes,
    make_png_bytes,
    make_synthetic_scene_bytes,
    _prepare_completion_element,
    _prepare_repair_package,
    _promote_visible_element_to_sam2_accepted,
    _validate_repair_package_with_missing_pixel,
)

def test_create_repair_task_writes_required_canvas_aligned_files(
    client: TestClient,
    tmp_path: Path,
) -> None:
    element_dir = _prepare_completion_element(client, tmp_path)

    mask_response = client.post(
        "/api/workspace/elements/element_001/repair/missing-mask",
        json={
            "shape": {
                "type": "rectangle",
                "coordinateSpace": "canvas",
                "bbox": {"x": 2, "y": 1, "w": 1, "h": 1},
            }
        },
    )
    assert mask_response.status_code == 200
    assert mask_response.json()["missingMaskPath"] == "elements/element_001/missing_mask.png"

    response = client.post("/api/workspace/elements/element_001/repair/task")

    assert response.status_code == 200
    body = response.json()
    element = body["state"]["elements"][0]
    assert element["status"] == "repair_pending"
    assert body["paths"] == {
        "sourceCropPath": "elements/element_001/repair/source_crop.png",
        "sceneContextPath": "elements/element_001/repair/scene_context.png",
        "incompleteAssetPath": "elements/element_001/repair/incomplete_asset.png",
        "preserveMaskPath": "elements/element_001/repair/preserve_mask.png",
        "missingMaskPath": "elements/element_001/repair/missing_mask.png",
        "guideOverlayPath": "elements/element_001/repair/guide_overlay.png",
        "repairPromptPath": "elements/element_001/repair/repair_prompt.md",
    }

    repair_dir = element_dir / "repair"
    for filename in (
        "source_crop.png",
        "scene_context.png",
        "incomplete_asset.png",
        "preserve_mask.png",
        "missing_mask.png",
        "guide_overlay.png",
        "repair_prompt.md",
    ):
        assert (repair_dir / filename).exists(), filename

    with Image.open(element_dir / "missing_mask.png") as missing_mask:
        assert missing_mask.mode == "L"
        assert missing_mask.size == (5, 4)
        assert missing_mask.getpixel((2, 1)) == 255
        assert missing_mask.getpixel((0, 0)) == 0

    with Image.open(repair_dir / "preserve_mask.png") as preserve_mask:
        assert preserve_mask.mode == "L"
        assert preserve_mask.size == (5, 4)
        assert preserve_mask.getpixel((2, 1)) == 0
        assert preserve_mask.getpixel((3, 1)) == 255

    prompt = (repair_dir / "repair_prompt.md").read_text(encoding="utf-8")
    assert "Preserve every pixel inside preserve_mask.png." in prompt
    assert "Modify only pixels inside missing_mask.png." in prompt
    assert "Do not redraw the whole object." in prompt
    assert "Output completed_asset.png with the same size as incomplete_asset.png." in prompt
    assert "Write repair_report.json." in prompt


def test_missing_mask_update_invalidates_completed_repair_state(
    client: TestClient,
    tmp_path: Path,
) -> None:
    element_dir = _prepare_repair_package(client, tmp_path)
    repair_dir = element_dir / "repair"
    validate_response = _validate_repair_package_with_missing_pixel(client, repair_dir)
    repaired_element = validate_response.json()["state"]["elements"][0]
    assert repaired_element["repairStatus"] == "repair_complete"
    assert repaired_element["exportStatus"] == "ready"

    response = client.post(
        "/api/workspace/elements/element_001/repair/missing-mask",
        json={
            "shape": {
                "type": "rectangle",
                "coordinateSpace": "canvas",
                "bbox": {"x": 1, "y": 1, "w": 1, "h": 1},
            }
        },
    )

    assert response.status_code == 200
    element = response.json()["state"]["elements"][0]
    assert element["status"] == "extracted"
    assert element["mode"] == "needs_completion"
    assert element["repairStatus"] == "required"
    assert element["exportStatus"] == "blocked"


def test_repair_metadata_reports_files_and_latest_qa(
    client: TestClient,
    tmp_path: Path,
) -> None:
    element_dir = _prepare_repair_package(client, tmp_path)
    repair_dir = element_dir / "repair"

    package_metadata = client.get("/api/workspace/elements/element_001/repair/metadata")
    assert package_metadata.status_code == 200
    body = package_metadata.json()
    assert body["elementId"] == "element_001"
    assert body["files"]["missingMask"] is True
    assert body["files"]["repairPackage"] is True
    assert body["files"]["completedAsset"] is False
    assert body["files"]["repairReport"] is False
    assert body["files"]["qaReport"] is False
    assert body["paths"]["missingMaskPath"] == "elements/element_001/missing_mask.png"
    assert body["paths"]["completedAssetPath"] is None
    assert body["qaReport"] is None

    with Image.open(repair_dir / "incomplete_asset.png") as incomplete:
        completed = incomplete.convert("RGBA")
    completed.putpixel((2, 1), (250, 120, 10, 255))
    completed.save(repair_dir / "completed_asset.png", format="PNG")
    (repair_dir / "repair_report.json").write_text('{"summary":"filled missing pixel"}', encoding="utf-8")
    validate_response = client.post("/api/workspace/elements/element_001/repair/validate")
    assert validate_response.status_code == 200

    qa_metadata = client.get("/api/workspace/elements/element_001/repair/metadata")

    assert qa_metadata.status_code == 200
    body = qa_metadata.json()
    assert body["files"]["completedAsset"] is True
    assert body["files"]["repairReport"] is True
    assert body["files"]["qaReport"] is True
    assert body["files"]["changedPixelsOverlay"] is True
    assert body["paths"]["completedAssetPath"] == "elements/element_001/repair/completed_asset.png"
    assert body["paths"]["changedPixelsOverlayPath"] == (
        "elements/element_001/repair/changed_pixels_overlay.png"
    )
    assert body["qaReport"]["status"] == "pass"


def test_repair_validate_requires_repair_workflow_and_package(
    client: TestClient,
    tmp_path: Path,
) -> None:
    element_dir = _prepare_completion_element(client, tmp_path, mode="visible_only")

    response = client.post("/api/workspace/elements/element_001/repair/validate")

    assert response.status_code == 400
    assert response.json()["detail"] == "Element element_001 is not in the repair workflow."
    state = client.get("/api/workspace/state").json()
    assert state["elements"][0]["status"] == "extracted"
    assert state["elements"][0]["mode"] == "visible_only"
    assert not (element_dir / "repair" / "qa_report.json").exists()


def test_repair_validate_requires_existing_repair_package(
    client: TestClient,
    tmp_path: Path,
) -> None:
    element_dir = _prepare_completion_element(client, tmp_path)

    response = client.post("/api/workspace/elements/element_001/repair/validate")

    assert response.status_code == 400
    assert response.json()["detail"] == "Element element_001 needs a repair task package before validation."
    state = client.get("/api/workspace/state").json()
    assert state["elements"][0]["status"] == "extracted"
    assert state["elements"][0]["mode"] == "needs_completion"
    assert not (element_dir / "repair" / "qa_report.json").exists()


def test_repair_qa_fails_if_repair_authority_is_missing(
    client: TestClient,
    tmp_path: Path,
) -> None:
    element_dir = _prepare_repair_package(client, tmp_path)
    repair_dir = element_dir / "repair"
    authority_path = element_dir / "repair_authority.json"
    authority_path.unlink(missing_ok=True)

    with Image.open(repair_dir / "incomplete_asset.png") as incomplete:
        completed = incomplete.convert("RGBA")
    completed.putpixel((2, 1), (250, 120, 10, 255))
    completed.save(repair_dir / "completed_asset.png", format="PNG")
    (repair_dir / "repair_report.json").write_text('{"summary":"filled missing pixel"}', encoding="utf-8")

    response = client.post("/api/workspace/elements/element_001/repair/validate")

    assert response.status_code == 200
    body = response.json()
    assert body["qa"]["status"] == "fail"
    assert "repair_authority_missing" in body["qa"]["reasons"]
    assert body["state"]["elements"][0]["status"] == "qa_failed"


def test_missing_mask_rejects_rectangle_outside_asset_canvas(
    client: TestClient,
    tmp_path: Path,
) -> None:
    element_dir = _prepare_completion_element(client, tmp_path)

    response = client.post(
        "/api/workspace/elements/element_001/repair/missing-mask",
        json={
            "shape": {
                "type": "rectangle",
                "coordinateSpace": "canvas",
                "bbox": {"x": 4, "y": 1, "w": 2, "h": 1},
            }
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "Missing mask rectangle for element element_001 must stay inside the 5 x 4 asset canvas."
    )
    assert not (element_dir / "missing_mask.png").exists()


def test_repair_qa_fails_if_preserved_pixels_change(
    client: TestClient,
    tmp_path: Path,
) -> None:
    element_dir = _prepare_repair_package(client, tmp_path)
    repair_dir = element_dir / "repair"

    with Image.open(repair_dir / "incomplete_asset.png") as incomplete:
        completed = incomplete.convert("RGBA")
    completed.putpixel((3, 1), (1, 2, 3, 255))
    completed.save(repair_dir / "completed_asset.png", format="PNG")
    (repair_dir / "repair_report.json").write_text('{"summary":"changed preserved"}', encoding="utf-8")

    response = client.post("/api/workspace/elements/element_001/repair/validate")

    assert response.status_code == 200
    body = response.json()
    assert body["qa"]["status"] == "fail"
    assert "preserve_pixels_changed" in body["qa"]["reasons"]
    assert body["qa"]["metrics"]["preserveChangedPixels"] == 1
    assert body["state"]["elements"][0]["status"] == "qa_failed"


def test_repair_qa_fails_if_pixels_appear_outside_missing_mask(
    client: TestClient,
    tmp_path: Path,
) -> None:
    element_dir = _prepare_repair_package(client, tmp_path)
    repair_dir = element_dir / "repair"

    with Image.open(repair_dir / "incomplete_asset.png") as incomplete:
        completed = incomplete.convert("RGBA")
    completed.putpixel((0, 0), (20, 30, 40, 255))
    completed.save(repair_dir / "completed_asset.png", format="PNG")
    (repair_dir / "repair_report.json").write_text('{"summary":"outside edit"}', encoding="utf-8")

    response = client.post("/api/workspace/elements/element_001/repair/validate")

    assert response.status_code == 200
    body = response.json()
    assert body["qa"]["status"] == "fail"
    assert "pixels_changed_outside_missing_mask" in body["qa"]["reasons"]
    assert body["qa"]["metrics"]["outsideMissingChangedPixels"] == 1
    assert body["state"]["elements"][0]["status"] == "qa_failed"


def test_repair_qa_uses_canonical_artifacts_when_package_inputs_are_tampered(
    client: TestClient,
    tmp_path: Path,
) -> None:
    element_dir = _prepare_repair_package(client, tmp_path)
    repair_dir = element_dir / "repair"

    Image.new("RGBA", (5, 4), (0, 0, 0, 0)).save(
        repair_dir / "incomplete_asset.png",
        format="PNG",
    )
    Image.new("L", (5, 4), 0).save(repair_dir / "preserve_mask.png", format="PNG")
    Image.new("L", (5, 4), 255).save(repair_dir / "missing_mask.png", format="PNG")
    Image.new("RGBA", (5, 4), (8, 9, 10, 255)).save(
        repair_dir / "completed_asset.png",
        format="PNG",
    )
    (repair_dir / "repair_report.json").write_text('{"summary":"full redraw"}', encoding="utf-8")

    validate_response = client.post("/api/workspace/elements/element_001/repair/validate")

    assert validate_response.status_code == 200
    qa = validate_response.json()["qa"]
    assert qa["status"] == "fail"
    assert "preserve_pixels_changed" in qa["reasons"]
    assert "pixels_changed_outside_missing_mask" in qa["reasons"]
    assert qa["metrics"]["insideMissingChangedPixels"] == 1
    assert qa["metrics"]["outsideMissingChangedPixels"] > 0

    export_response = client.post("/api/workspace/export")

    assert export_response.status_code == 200
    body = export_response.json()
    assert body["exportableCount"] == 0
    assert body["blockedElements"] == [
        {
            "elementId": "element_001",
            "name": "Cup",
            "reason": "needs_completion_without_valid_repair",
        }
    ]
    assert not (tmp_path / "workspace" / "export" / "assets" / "element_001.png").exists()


def test_repair_qa_passes_for_missing_mask_only_edit(
    client: TestClient,
    tmp_path: Path,
) -> None:
    element_dir = _prepare_repair_package(client, tmp_path)
    repair_dir = element_dir / "repair"

    with Image.open(repair_dir / "incomplete_asset.png") as incomplete:
        completed = incomplete.convert("RGBA")
    completed.putpixel((2, 1), (250, 120, 10, 255))
    completed.save(repair_dir / "completed_asset.png", format="PNG")
    (repair_dir / "repair_report.json").write_text('{"summary":"filled missing pixel"}', encoding="utf-8")

    response = client.post("/api/workspace/elements/element_001/repair/validate")

    assert response.status_code == 200
    body = response.json()
    assert body["qa"]["status"] == "pass"
    assert body["qa"]["reasons"] == []
    assert body["qa"]["metrics"]["insideMissingChangedPixels"] == 1
    assert body["qa"]["changedPixelsOverlayPath"] == (
        "elements/element_001/repair/changed_pixels_overlay.png"
    )
    assert (repair_dir / "changed_pixels_overlay.png").exists()
    assert (repair_dir / "qa_report.json").exists()
    element = body["state"]["elements"][0]
    assert element["status"] == "repair_complete"
    assert element["mode"] == "completed_by_codex"


def test_repair_qa_fails_when_missing_pixels_are_unchanged(
    client: TestClient,
    tmp_path: Path,
) -> None:
    element_dir = _prepare_repair_package(client, tmp_path)
    repair_dir = element_dir / "repair"

    with Image.open(repair_dir / "incomplete_asset.png") as incomplete:
        completed = incomplete.convert("RGBA")
    completed.save(repair_dir / "completed_asset.png", format="PNG")
    (repair_dir / "repair_report.json").write_text('{"summary":"no changes"}', encoding="utf-8")

    response = client.post("/api/workspace/elements/element_001/repair/validate")

    assert response.status_code == 200
    body = response.json()
    assert body["qa"]["status"] == "fail"
    assert "missing_pixels_unchanged" in body["qa"]["reasons"]
    assert body["qa"]["metrics"]["missingMaskPixels"] == 1
    assert body["qa"]["metrics"]["insideMissingChangedPixels"] == 0
    assert body["state"]["elements"][0]["status"] == "qa_failed"


def test_repair_qa_fails_for_wrong_size_completed_asset(
    client: TestClient,
    tmp_path: Path,
) -> None:
    element_dir = _prepare_repair_package(client, tmp_path)
    repair_dir = element_dir / "repair"

    completed = Image.new("RGBA", (6, 4), (1, 2, 3, 255))
    completed.save(repair_dir / "completed_asset.png", format="PNG")
    (repair_dir / "repair_report.json").write_text('{"summary":"wrong size"}', encoding="utf-8")

    response = client.post("/api/workspace/elements/element_001/repair/validate")

    assert response.status_code == 200
    body = response.json()
    assert body["qa"]["status"] == "fail"
    assert "completed_asset_wrong_dimensions" in body["qa"]["reasons"]
    assert body["state"]["elements"][0]["status"] == "qa_failed"
    assert body["state"]["elements"][0]["repairStatus"] == "qa_failed"
    assert body["state"]["elements"][0]["exportStatus"] == "blocked"


def test_repair_qa_fails_for_completed_asset_without_alpha(
    client: TestClient,
    tmp_path: Path,
) -> None:
    element_dir = _prepare_repair_package(client, tmp_path)
    repair_dir = element_dir / "repair"

    completed = Image.new("RGB", (5, 4), (1, 2, 3))
    completed.save(repair_dir / "completed_asset.png", format="PNG")
    (repair_dir / "repair_report.json").write_text('{"summary":"rgb only"}', encoding="utf-8")

    response = client.post("/api/workspace/elements/element_001/repair/validate")

    assert response.status_code == 200
    body = response.json()
    assert body["qa"]["status"] == "fail"
    assert "completed_asset_missing_alpha" in body["qa"]["reasons"]
    assert body["state"]["elements"][0]["status"] == "qa_failed"


@pytest.mark.parametrize(
    ("report_contents", "expected_reason"),
    [
        (None, "repair_report_missing"),
        ("{not valid json", "repair_report_invalid_json"),
    ],
)
def test_repair_qa_requires_valid_repair_report(
    client: TestClient,
    tmp_path: Path,
    report_contents: str | None,
    expected_reason: str,
) -> None:
    element_dir = _prepare_repair_package(client, tmp_path)
    repair_dir = element_dir / "repair"

    with Image.open(repair_dir / "incomplete_asset.png") as incomplete:
        completed = incomplete.convert("RGBA")
    completed.putpixel((2, 1), (250, 120, 10, 255))
    completed.save(repair_dir / "completed_asset.png", format="PNG")
    if report_contents is not None:
        (repair_dir / "repair_report.json").write_text(report_contents, encoding="utf-8")

    response = client.post("/api/workspace/elements/element_001/repair/validate")

    assert response.status_code == 200
    body = response.json()
    assert body["qa"]["status"] == "fail"
    assert expected_reason in body["qa"]["reasons"]
    assert body["state"]["elements"][0]["status"] == "qa_failed"



