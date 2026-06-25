from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

from art_pipeline.codex_final_quality import (
    CodexFinalQualityReport,
    assess_codex_final_candidate,
    write_codex_final_quality_report,
)


CHROMA_KEY = (0, 255, 0)


def test_quality_blocks_empty_alpha(tmp_path: Path) -> None:
    candidate, reference, mask = _quality_files(tmp_path)
    _write_rgba(candidate, [])
    _write_rgba(reference, [_rect(5, 5, 15, 15, (220, 90, 40, 255))])
    _write_mask(mask, _rect(5, 5, 15, 15, 255))

    report = assess_codex_final_candidate(candidate, reference, mask, CHROMA_KEY)

    assert report.status == "failed"
    assert "empty_alpha" in report.errors
    assert report.has_blocking_errors is True


def test_quality_blocks_small_edge_clipped_candidate(tmp_path: Path) -> None:
    candidate, reference, mask = _quality_files(tmp_path)
    _write_rgba(candidate, [_rect(0, 5, 8, 15, (12, 180, 90, 255))])
    _write_rgba(reference, [_rect(5, 5, 15, 15, (220, 90, 40, 255))])
    _write_mask(mask, _rect(5, 5, 15, 15, 255))

    report = assess_codex_final_candidate(candidate, reference, mask, CHROMA_KEY)

    assert report.status == "failed"
    assert "subject_clipped_at_output_edge" in report.errors
    assert report.repair_note == "Candidate appears clipped at the output edge."


def test_quality_blocks_output_bbox_side_too_small(tmp_path: Path) -> None:
    candidate, reference, mask = _quality_files(tmp_path)
    _write_rgba(candidate, [_rect(8, 5, 11, 15, (12, 180, 90, 255))])
    _write_rgba(reference, [_rect(5, 5, 15, 15, (220, 90, 40, 255))])
    _write_mask(mask, _rect(5, 5, 15, 15, 255))

    report = assess_codex_final_candidate(candidate, reference, mask, CHROMA_KEY)

    assert report.status == "failed"
    assert "bbox_side_too_small" in report.errors
    assert report.metrics["candidateBboxWidth"] == 3
    assert report.metrics["analysisBboxWidth"] == 10


def test_quality_blocks_visible_area_extreme_outlier(tmp_path: Path) -> None:
    candidate, reference, mask = _quality_files(tmp_path)
    _write_rgba(candidate, [_rect(0, 0, 20, 20, (12, 180, 90, 255))])
    _write_rgba(reference, [_rect(5, 5, 15, 15, (220, 90, 40, 255))])
    _write_mask(mask, _rect(5, 5, 15, 15, 255))

    report = assess_codex_final_candidate(candidate, reference, mask, CHROMA_KEY)

    assert report.status == "failed"
    assert "visible_area_extreme_outlier" in report.errors
    assert report.metrics["visibleAreaRatio"] == 4.0


def test_quality_blocks_visible_chroma_residue_outside_subject(tmp_path: Path) -> None:
    candidate, reference, mask = _quality_files(tmp_path)
    _write_rgba(
        candidate,
        [
            _rect(5, 5, 15, 15, (12, 180, 90, 255)),
            _rect(1, 1, 5, 5, (0, 250, 0, 96)),
        ],
    )
    _write_rgba(reference, [_rect(5, 5, 15, 15, (220, 90, 40, 255))])
    _write_mask(mask, _rect(5, 5, 15, 15, 255))

    report = assess_codex_final_candidate(candidate, reference, mask, CHROMA_KEY)

    assert report.status == "failed"
    assert "visible_chroma_residue" in report.errors
    assert report.metrics["visibleChromaResiduePixels"] == 15


def test_quality_blocks_non_chroma_background_alpha_pollution(tmp_path: Path) -> None:
    candidate, reference, mask = _quality_files(tmp_path)
    _write_rgba(
        candidate,
        [
            _rect(5, 5, 15, 15, (12, 180, 90, 255)),
            _rect(1, 1, 4, 4, (24, 24, 24, 255)),
        ],
    )
    _write_rgba(reference, [_rect(5, 5, 15, 15, (220, 90, 40, 255))])
    _write_mask(mask, _rect(5, 5, 15, 15, 255))

    report = assess_codex_final_candidate(candidate, reference, mask, CHROMA_KEY)

    assert report.status == "failed"
    assert "background_alpha_pollution" in report.errors
    assert report.metrics["backgroundAlphaPollutionPixels"] == 9
    assert report.repair_note == "Candidate has visible background pixels outside the subject."


def test_quality_blocks_attached_background_alpha_slab_outside_subject(tmp_path: Path) -> None:
    candidate, reference, mask = _quality_files(tmp_path)
    _write_rgba(
        candidate,
        [
            _rect(5, 5, 15, 15, (12, 180, 90, 255)),
            _rect(15, 8, 19, 12, (24, 24, 24, 255)),
        ],
    )
    _write_rgba(reference, [_rect(5, 5, 15, 15, (220, 90, 40, 255))])
    _write_mask(mask, _rect(5, 5, 15, 15, 255))

    report = assess_codex_final_candidate(candidate, reference, mask, CHROMA_KEY)

    assert report.status == "failed"
    assert "background_alpha_pollution" in report.errors
    assert report.metrics["backgroundAlphaPollutionPixels"] == 12


def test_quality_blocks_near_copy_of_sam2_cutout(tmp_path: Path) -> None:
    candidate, reference, mask = _quality_files(tmp_path)
    _write_rgba(candidate, [_rect(5, 5, 15, 15, (220, 90, 40, 255))])
    _write_rgba(reference, [_rect(5, 5, 15, 15, (220, 90, 40, 255))])
    _write_mask(mask, _rect(5, 5, 15, 15, 255))

    report = assess_codex_final_candidate(candidate, reference, mask, CHROMA_KEY)

    assert report.status == "failed"
    assert "near_copy_of_sam2_cutout" in report.errors
    assert report.metrics["alphaIou"] == 1.0


def test_quality_warnings_do_not_block_candidate(tmp_path: Path) -> None:
    candidate, reference, mask = _quality_files(tmp_path)
    _write_rgba(candidate, [_rect(7, 4, 19, 16, (12, 180, 90, 255))])
    _write_rgba(reference, [_rect(5, 5, 15, 15, (220, 90, 40, 255))])
    _write_mask(mask, _rect(5, 5, 15, 15, 255))

    report = assess_codex_final_candidate(candidate, reference, mask, CHROMA_KEY)

    assert report.status == "passed"
    assert report.errors == ()
    assert "bbox_center_shifted" in report.warnings
    assert "visible_area_differs" in report.warnings
    assert report.repair_note is None


def test_quality_report_json_fields_are_stable(tmp_path: Path) -> None:
    report = CodexFinalQualityReport(
        status="failed",
        errors=("empty_alpha",),
        warnings=("visible_area_differs",),
        metrics={"candidateVisibleArea": 0, "alphaIou": 0.0, "hasCandidateAlpha": False},
        repair_note="Candidate has no visible subject.",
    )
    output = tmp_path / "quality_report.json"

    write_codex_final_quality_report(output, report)

    payload = json.loads(output.read_text(encoding="utf-8"))
    assert list(payload) == ["status", "errors", "warnings", "metrics", "repairNote"]
    assert payload == {
        "status": "failed",
        "errors": ["empty_alpha"],
        "warnings": ["visible_area_differs"],
        "metrics": {"candidateVisibleArea": 0, "alphaIou": 0.0, "hasCandidateAlpha": False},
        "repairNote": "Candidate has no visible subject.",
    }


def _quality_files(tmp_path: Path) -> tuple[Path, Path, Path]:
    return (
        tmp_path / "candidate.png",
        tmp_path / "reference.png",
        tmp_path / "analysis_mask.png",
    )


def _rect(
    left: int,
    top: int,
    right: int,
    bottom: int,
    fill: tuple[int, int, int, int] | int,
) -> tuple[int, int, int, int, tuple[int, int, int, int] | int]:
    return (left, top, right, bottom, fill)


def _write_rgba(
    path: Path,
    rects: list[tuple[int, int, int, int, tuple[int, int, int, int] | int]],
) -> None:
    image = Image.new("RGBA", (20, 20), (0, 0, 0, 0))
    pixels = image.load()
    for left, top, right, bottom, fill in rects:
        assert isinstance(fill, tuple)
        for x in range(left, right):
            for y in range(top, bottom):
                pixels[x, y] = fill
    image.save(path, format="PNG")


def _write_mask(
    path: Path,
    rect: tuple[int, int, int, int, tuple[int, int, int, int] | int],
) -> None:
    image = Image.new("L", (20, 20), 0)
    pixels = image.load()
    left, top, right, bottom, fill = rect
    assert isinstance(fill, int)
    for x in range(left, right):
        for y in range(top, bottom):
            pixels[x, y] = fill
    image.save(path, format="PNG")
