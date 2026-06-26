from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

from codex_final_visual_harness import write_codex_final_visual_audit


def test_visual_harness_writes_audit_sheet_and_summary_for_failed_rerun(tmp_path: Path) -> None:
    workspace_root = tmp_path / "workspace"
    element_dir = workspace_root / "elements" / "element_025"
    sam2_dir = element_dir / "sam2_edge"
    final_dir = element_dir / "codex_final"
    job_dir = final_dir / "job" / "job_20260626000102030405_test"
    sam2_dir.mkdir(parents=True)
    job_dir.mkdir(parents=True)

    _write_rgba(sam2_dir / "source_crop.png", (64, 48), (180, 120, 50, 255))
    _write_rgba(sam2_dir / "transparent_asset.png", (64, 48), (0, 0, 0, 0), bbox=(12, 12, 48, 36))
    Image.open(sam2_dir / "transparent_asset.png").getchannel("A").save(sam2_dir / "mask.png")
    _write_rgba(final_dir / "transparent_asset.png", (64, 48), (30, 120, 200, 255), bbox=(14, 14, 46, 34))
    _write_rgba(job_dir / "codex_raw.png", (64, 48), (20, 200, 80, 255), bbox=(2, 2, 62, 46))
    _write_rgba(job_dir / "candidate_asset.png", (64, 48), (20, 200, 80, 255), bbox=(2, 2, 62, 46))
    (job_dir / "quality_report.json").write_text(
        json.dumps(
            {
                "status": "failed",
                "errors": ["empty_alpha"],
                "warnings": [],
                "metrics": {"candidateVisibleArea": 0, "hasCandidateAlpha": False},
            }
        ),
        encoding="utf-8",
    )
    (workspace_root / "state.json").write_text(
        json.dumps(
            {
                "source": {"filename": "scene.png", "path": "source/scene.png", "width": 100, "height": 100},
                "elements": [
                    {
                        "id": "element_025",
                        "name": "plant + bottle",
                        "label": "plant + bottle",
                        "status": "accepted",
                        "assetRole": "removable_child",
                        "bbox": {"x": 0, "y": 0, "w": 64, "h": 48},
                        "canvas": {"x": 0, "y": 0, "w": 64, "h": 48},
                        "layer": 1,
                        "visible": True,
                        "segmentationStatus": "mask_accepted",
                        "mask": "elements/element_025/sam2_edge/mask.png",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    sheet_path = tmp_path / "audit.png"
    summary_path = tmp_path / "audit.json"

    summary = write_codex_final_visual_audit(
        workspace_root=workspace_root,
        element_id="element_025",
        output_path=sheet_path,
        summary_path=summary_path,
    )

    assert sheet_path.exists()
    assert summary_path.exists()
    assert summary["elementId"] == "element_025"
    assert summary["name"] == "plant + bottle"
    assert summary["status"] == "failed"
    assert summary["qualityErrors"] == ["empty_alpha"]
    assert summary["metrics"]["candidateVisibleArea"] == 0
    stored = json.loads(summary_path.read_text(encoding="utf-8"))
    assert stored["jobDirPath"].endswith("job_20260626000102030405_test")


def _write_rgba(
    path: Path,
    size: tuple[int, int],
    color: tuple[int, int, int, int],
    *,
    bbox: tuple[int, int, int, int] | None = None,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGBA", size, (0, 0, 0, 0) if bbox else color)
    if bbox:
        for y in range(bbox[1], bbox[3]):
            for x in range(bbox[0], bbox[2]):
                image.putpixel((x, y), color)
    image.save(path, format="PNG")
