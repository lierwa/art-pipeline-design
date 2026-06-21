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

def test_export_completed_repair_mask_matches_completed_asset_alpha(
    client: TestClient,
    tmp_path: Path,
) -> None:
    element_dir = _prepare_repair_package(client, tmp_path)
    repair_dir = element_dir / "repair"

    with Image.open(element_dir / "asset_incomplete.png") as incomplete:
        completed = incomplete.convert("RGBA")
    completed.putpixel((2, 1), (12, 34, 56, 255))
    completed.save(repair_dir / "completed_asset.png", format="PNG")
    (repair_dir / "repair_report.json").write_text('{"summary":"filled missing pixel"}', encoding="utf-8")

    response = client.post("/api/workspace/export")

    assert response.status_code == 200
    body = response.json()
    assert body["exportableCount"] == 1
    assert body["blockedCount"] == 0
    assert body["exportedElements"][0]["sourceAssetPath"] == (
        "elements/element_001/repair/completed_asset.png"
    )
    assert body["exportedElements"][0]["maskPath"] == "export/masks/element_001.png"

    with Image.open(repair_dir / "completed_asset.png") as exported_source:
        expected_mask = exported_source.getchannel("A").point(lambda value: 255 if value > 0 else 0)
    with Image.open(tmp_path / "workspace" / "export" / "masks" / "element_001.png") as mask:
        assert mask.mode == "L"
        assert list(mask.getdata()) == list(expected_mask.getdata())
        assert mask.getpixel((2, 1)) == 255


def test_export_accepts_warn_repair_qa_and_carries_warning(
    client: TestClient,
    tmp_path: Path,
) -> None:
    element_dir = _prepare_repair_package(
        client,
        tmp_path,
        missing_bbox={"x": 0, "y": 0, "w": 5, "h": 3},
    )
    repair_dir = element_dir / "repair"

    with Image.open(element_dir / "asset_incomplete.png") as incomplete:
        completed = incomplete.convert("RGBA")
    completed.putpixel((0, 0), (12, 34, 56, 255))
    completed.save(repair_dir / "completed_asset.png", format="PNG")
    (repair_dir / "repair_report.json").write_text('{"summary":"usable with warning"}', encoding="utf-8")

    response = client.post("/api/workspace/export")

    assert response.status_code == 200
    body = response.json()
    assert body["exportableCount"] == 1
    assert body["blockedCount"] == 0
    assert body["exportedElements"][0]["warnings"] == [
        "repair QA warning: missing_area_ratio_high"
    ]
    assert body["warnings"] == [
        "element_001 repair QA warning: missing_area_ratio_high"
    ]

    qa_report = workspace_api.json.loads(
        (tmp_path / "workspace" / "export" / "qa_report.json").read_text(encoding="utf-8")
    )
    assert qa_report["repairQaReports"]["element_001"]["status"] == "warn"
    assert qa_report["warnings"] == body["warnings"]


def test_failed_export_preserves_previous_export_manifest(
    client: TestClient,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _prepare_completion_element(client, tmp_path, mode="visible_only")
    _promote_visible_element_to_sam2_accepted(client, tmp_path)
    export_dir = tmp_path / "workspace" / "export"
    export_dir.mkdir(parents=True, exist_ok=True)
    marker_path = export_dir / "manifest.json"
    marker_path.write_text('{"marker":"previous export"}', encoding="utf-8")

    def fail_copy(*args: object, **kwargs: object) -> None:
        _ = args
        _ = kwargs
        raise ValueError("simulated export copy failure")

    monkeypatch.setattr(workspace_exporter, "_copy_workspace_file", fail_copy)

    response = client.post("/api/workspace/export")

    assert response.status_code == 400
    assert response.json()["detail"] == "simulated export copy failure"
    assert marker_path.read_text(encoding="utf-8") == '{"marker":"previous export"}'


def test_export_uses_completed_asset_after_repair_qa_pass(
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
    validate_response = client.post("/api/workspace/elements/element_001/repair/validate")
    assert validate_response.status_code == 200
    element = validate_response.json()["state"]["elements"][0]
    assert element["repairStatus"] == "repair_complete"
    assert element["exportStatus"] == "ready"

    response = client.post("/api/workspace/export")

    assert response.status_code == 200
    body = response.json()
    assert body["exportableCount"] == 1
    assert body["blockedCount"] == 0
    assert body["exportedElements"][0]["sourceAssetPath"] == "elements/element_001/repair/completed_asset.png"
    assert body["exportedElements"][0]["assetPath"] == "export/assets/element_001.png"

    export_asset = tmp_path / "workspace" / "export" / "assets" / "element_001.png"
    with Image.open(export_asset) as image:
        assert image.getpixel((2, 1)) == (250, 120, 10, 255)

    qa_report = workspace_api.json.loads(
        (tmp_path / "workspace" / "export" / "qa_report.json").read_text(encoding="utf-8")
    )
    assert qa_report["repairQaReports"]["element_001"]["status"] == "pass"


def test_export_revalidates_repair_when_completed_asset_changes_after_qa(
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
    validate_response = client.post("/api/workspace/elements/element_001/repair/validate")
    assert validate_response.status_code == 200
    assert validate_response.json()["qa"]["status"] == "pass"

    with Image.open(repair_dir / "completed_asset.png") as validated:
        stale_completed = validated.convert("RGBA")
    stale_completed.putpixel((0, 0), (12, 34, 56, 255))
    stale_completed.save(repair_dir / "completed_asset.png", format="PNG")

    response = client.post("/api/workspace/export")

    assert response.status_code == 200
    body = response.json()
    assert body["exportableCount"] == 0
    assert body["blockedCount"] == 1
    assert body["blockedElements"] == [
        {
            "elementId": "element_001",
            "name": "Cup",
            "reason": "needs_completion_without_valid_repair",
        }
    ]

    qa_report = workspace_api.json.loads(
        (tmp_path / "workspace" / "export" / "qa_report.json").read_text(encoding="utf-8")
    )
    assert qa_report["repairQaReports"]["element_001"]["status"] == "fail"
    assert "pixels_changed_outside_missing_mask" in qa_report["repairQaReports"]["element_001"]["reasons"]
    assert not (tmp_path / "workspace" / "export" / "assets" / "element_001.png").exists()


