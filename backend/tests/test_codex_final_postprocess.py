from __future__ import annotations

from pathlib import Path

from PIL import Image

from art_pipeline.codex_postprocess import CODEX_FINAL_OUTPUT_PADDING_PX, finalize_codex_raw_output


CHROMA_KEY = (0, 255, 0)


def test_finalize_codex_raw_output_removes_background_and_trims_to_padded_visible_bounds(tmp_path: Path) -> None:
    raw = tmp_path / "codex_raw.png"
    candidate = tmp_path / "candidate_asset.png"
    reference = tmp_path / "reference.png"
    Image.new("RGBA", (4, 4), (120, 80, 40, 255)).save(reference, format="PNG")
    image = Image.new("RGB", (240, 220), CHROMA_KEY)
    image.putpixel((20, 20), (44, 255, 0))
    image.putpixel((210, 180), (44, 255, 0))
    for x in range(100, 140):
        for y in range(90, 130):
            image.putpixel((x, y), (40, 90, 220))
    image.save(raw, format="PNG")

    diagnostics = finalize_codex_raw_output(raw, candidate, reference, CHROMA_KEY)

    with Image.open(candidate) as output:
        rgba = output.convert("RGBA")
    assert CODEX_FINAL_OUTPUT_PADDING_PX > 0
    expected_bbox = [
        100 - CODEX_FINAL_OUTPUT_PADDING_PX,
        90 - CODEX_FINAL_OUTPUT_PADDING_PX,
        140 + CODEX_FINAL_OUTPUT_PADDING_PX,
        130 + CODEX_FINAL_OUTPUT_PADDING_PX,
    ]
    assert rgba.size == (expected_bbox[2] - expected_bbox[0], expected_bbox[3] - expected_bbox[1])
    assert rgba.getchannel("A").getbbox() == (
        CODEX_FINAL_OUTPUT_PADDING_PX,
        CODEX_FINAL_OUTPUT_PADDING_PX,
        CODEX_FINAL_OUTPUT_PADDING_PX + 40,
        CODEX_FINAL_OUTPUT_PADDING_PX + 40,
    )
    assert rgba.getpixel((0, 0))[3] == 0
    assert rgba.getpixel((CODEX_FINAL_OUTPUT_PADDING_PX, CODEX_FINAL_OUTPUT_PADDING_PX)) == (40, 90, 220, 255)
    assert diagnostics["trimmedOutputBbox"] == expected_bbox
    assert diagnostics["isOutputIdenticalToReference"] is False
    assert diagnostics["rawForegroundBbox"] == [100, 90, 140, 130]
    assert diagnostics["cleanedForegroundBbox"] == [100, 90, 140, 130]
    assert diagnostics["retainedComponentCount"] == 1
    assert diagnostics["removedComponentCount"] == 0
    assert diagnostics["removedComponentArea"] == 0
    assert diagnostics["postprocessWarnings"] == []


def test_finalize_codex_raw_output_ignores_isolated_chroma_residue_when_trimming(tmp_path: Path) -> None:
    raw = tmp_path / "codex_raw.png"
    candidate = tmp_path / "candidate_asset.png"
    reference = tmp_path / "reference.png"
    Image.new("RGBA", (4, 4), (120, 80, 40, 255)).save(reference, format="PNG")
    image = Image.new("RGB", (240, 220), CHROMA_KEY)
    image.putpixel((2, 218), (50, 255, 0))
    for x in range(100, 140):
        for y in range(90, 130):
            image.putpixel((x, y), (40, 90, 220))
    image.save(raw, format="PNG")

    diagnostics = finalize_codex_raw_output(raw, candidate, reference, CHROMA_KEY)

    with Image.open(candidate) as output:
        rgba = output.convert("RGBA")
    expected_bbox = [
        100 - CODEX_FINAL_OUTPUT_PADDING_PX,
        90 - CODEX_FINAL_OUTPUT_PADDING_PX,
        140 + CODEX_FINAL_OUTPUT_PADDING_PX,
        130 + CODEX_FINAL_OUTPUT_PADDING_PX,
    ]
    assert rgba.size == (expected_bbox[2] - expected_bbox[0], expected_bbox[3] - expected_bbox[1])
    assert rgba.getchannel("A").getbbox() == (
        CODEX_FINAL_OUTPUT_PADDING_PX,
        CODEX_FINAL_OUTPUT_PADDING_PX,
        CODEX_FINAL_OUTPUT_PADDING_PX + 40,
        CODEX_FINAL_OUTPUT_PADDING_PX + 40,
    )
    assert diagnostics["rawForegroundBbox"] == [2, 90, 140, 219]
    assert diagnostics["cleanedForegroundBbox"] == [100, 90, 140, 130]
    assert diagnostics["trimmedOutputBbox"] == expected_bbox
    assert diagnostics["retainedComponentCount"] == 1
    assert diagnostics["removedComponentCount"] == 1
    assert diagnostics["removedComponentArea"] == 1
    assert diagnostics["postprocessWarnings"] == []


def test_finalize_codex_raw_output_retains_multiple_significant_components(tmp_path: Path) -> None:
    raw = tmp_path / "codex_raw.png"
    candidate = tmp_path / "candidate_asset.png"
    reference = tmp_path / "reference.png"
    Image.new("RGBA", (4, 4), (120, 80, 40, 255)).save(reference, format="PNG")
    image = Image.new("RGB", (260, 180), CHROMA_KEY)
    for x in range(40, 70):
        for y in range(80, 120):
            image.putpixel((x, y), (220, 80, 120))
    for x in range(150, 200):
        for y in range(50, 110):
            image.putpixel((x, y), (240, 220, 170))
    image.save(raw, format="PNG")

    diagnostics = finalize_codex_raw_output(raw, candidate, reference, CHROMA_KEY)

    expected_bbox = [
        40 - CODEX_FINAL_OUTPUT_PADDING_PX,
        50 - CODEX_FINAL_OUTPUT_PADDING_PX,
        200 + CODEX_FINAL_OUTPUT_PADDING_PX,
        120 + CODEX_FINAL_OUTPUT_PADDING_PX,
    ]
    with Image.open(candidate) as output:
        rgba = output.convert("RGBA")
    assert rgba.size == (expected_bbox[2] - expected_bbox[0], expected_bbox[3] - expected_bbox[1])
    assert diagnostics["cleanedForegroundBbox"] == [40, 50, 200, 120]
    assert diagnostics["retainedComponentCount"] == 2
    assert diagnostics["removedComponentCount"] == 0
    assert diagnostics["trimmedOutputBbox"] == expected_bbox


def test_finalize_codex_raw_output_warns_when_many_components_are_removed(tmp_path: Path) -> None:
    raw = tmp_path / "codex_raw.png"
    candidate = tmp_path / "candidate_asset.png"
    reference = tmp_path / "reference.png"
    Image.new("RGBA", (4, 4), (120, 80, 40, 255)).save(reference, format="PNG")
    image = Image.new("RGB", (240, 220), CHROMA_KEY)
    for x in range(100, 140):
        for y in range(90, 130):
            image.putpixel((x, y), (40, 90, 220))
    for offset in range(20):
        image.putpixel((10 + offset * 3, 200), (50, 255, 0))
    image.save(raw, format="PNG")

    diagnostics = finalize_codex_raw_output(raw, candidate, reference, CHROMA_KEY)

    assert diagnostics["retainedComponentCount"] == 1
    assert diagnostics["removedComponentCount"] == 20
    assert diagnostics["removedComponentArea"] == 20
    assert "small_components_removed" in diagnostics["postprocessWarnings"]


def test_finalize_codex_raw_output_adds_padding_when_subject_touches_raw_edge(tmp_path: Path) -> None:
    raw = tmp_path / "codex_raw.png"
    candidate = tmp_path / "candidate_asset.png"
    reference = tmp_path / "reference.png"
    Image.new("RGBA", (4, 4), (120, 80, 40, 255)).save(reference, format="PNG")
    image = Image.new("RGB", (80, 70), CHROMA_KEY)
    for x in range(0, 20):
        for y in range(10, 30):
            image.putpixel((x, y), (40, 90, 220))
    image.save(raw, format="PNG")

    diagnostics = finalize_codex_raw_output(raw, candidate, reference, CHROMA_KEY)

    with Image.open(candidate) as output:
        rgba = output.convert("RGBA")
    assert rgba.size == (20 + CODEX_FINAL_OUTPUT_PADDING_PX * 2, 20 + CODEX_FINAL_OUTPUT_PADDING_PX * 2)
    assert rgba.getchannel("A").getbbox() == (
        CODEX_FINAL_OUTPUT_PADDING_PX,
        CODEX_FINAL_OUTPUT_PADDING_PX,
        CODEX_FINAL_OUTPUT_PADDING_PX + 20,
        CODEX_FINAL_OUTPUT_PADDING_PX + 20,
    )
    assert rgba.getpixel((0, 0))[3] == 0
    assert rgba.getpixel((CODEX_FINAL_OUTPUT_PADDING_PX, CODEX_FINAL_OUTPUT_PADDING_PX)) == (40, 90, 220, 255)
    assert diagnostics["trimmedOutputBbox"] == [
        -CODEX_FINAL_OUTPUT_PADDING_PX,
        10 - CODEX_FINAL_OUTPUT_PADDING_PX,
        20 + CODEX_FINAL_OUTPUT_PADDING_PX,
        30 + CODEX_FINAL_OUTPUT_PADDING_PX,
    ]
