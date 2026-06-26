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


def test_quality_does_not_block_spatial_mismatch_after_effective_bounds_crop(tmp_path: Path) -> None:
    candidate, reference, mask = _quality_files(tmp_path)
    _write_rgba(candidate, [_rect(0, 0, 8, 7, (12, 180, 90, 255))], size=(8, 7))
    _write_rgba(reference, [_rect(5, 5, 15, 15, (220, 90, 40, 255))])
    _write_mask(mask, _rect(5, 5, 15, 15, 255))

    report = assess_codex_final_candidate(candidate, reference, mask, CHROMA_KEY)

    assert report.status == "passed"
    assert report.errors == ()
    assert report.metrics["candidateWidth"] == 8
    assert report.metrics["candidateHeight"] == 7


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
    assert report.metrics["visibleChromaResiduePixels"] == 16


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


def test_quality_blocks_cropped_near_copy_of_sam2_cutout(tmp_path: Path) -> None:
    candidate, reference, mask = _quality_files(tmp_path)
    _write_rgba(candidate, [_rect(0, 0, 10, 10, (220, 90, 40, 255))], size=(10, 10))
    _write_rgba(reference, [_rect(5, 5, 15, 15, (220, 90, 40, 255))])
    _write_mask(mask, _rect(5, 5, 15, 15, 255))

    report = assess_codex_final_candidate(candidate, reference, mask, CHROMA_KEY)

    assert report.status == "failed"
    assert "near_copy_of_sam2_cutout" in report.errors
    assert report.metrics["alphaIou"] == 1.0


def test_quality_warnings_do_not_block_candidate(tmp_path: Path) -> None:
    candidate, reference, mask = _quality_files(tmp_path)
    _write_rgba(candidate, [_rect(4, 4, 16, 16, (12, 180, 90, 255))])
    _write_rgba(reference, [_rect(5, 5, 15, 15, (220, 90, 40, 255))])
    _write_mask(mask, _rect(5, 5, 15, 15, 255))

    report = assess_codex_final_candidate(candidate, reference, mask, CHROMA_KEY)

    assert report.status == "passed"
    assert report.errors == ()
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
    *,
    size: tuple[int, int] = (20, 20),
) -> None:
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    pixels = image.load()
    for left, top, right, bottom, fill in rects:
        assert isinstance(fill, tuple)
        for x in range(left, right):
            for y in range(top, bottom):
                pixels[x, y] = fill
    image.save(path, format="PNG")


def _write_mask(
    path: Path,
    *rects: tuple[int, int, int, int, tuple[int, int, int, int] | int],
) -> None:
    image = Image.new("L", (20, 20), 0)
    pixels = image.load()
    for left, top, right, bottom, fill in rects:
        assert isinstance(fill, int)
        for x in range(left, right):
            for y in range(top, bottom):
                pixels[x, y] = fill
    image.save(path, format="PNG")
