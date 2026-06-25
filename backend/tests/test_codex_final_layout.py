from pathlib import Path

from PIL import Image

from art_pipeline.codex_final_layout import render_codex_final_layout_guide


def test_layout_guide_writes_python_generated_artifacts_into_job_directory(
    tmp_path: Path,
) -> None:
    source_crop_file = tmp_path / "source_crop.png"
    mask_file = tmp_path / "mask.png"
    analysis_mask_file = tmp_path / "job" / "analysis_mask.png"
    guide_file = tmp_path / "job" / "layout_guide.png"
    Image.new("RGB", (32, 24), (240, 238, 232)).save(source_crop_file)
    mask = Image.new("L", (32, 24), 0)
    for y in range(6, 18):
        for x in range(8, 22):
            mask.putpixel((x, y), 255)
    mask.save(mask_file)

    guide = render_codex_final_layout_guide(
        source_crop_file=source_crop_file,
        mask_file=mask_file,
        analysis_mask_file=analysis_mask_file,
        guide_file=guide_file,
    )

    assert guide.analysis_mask_path == analysis_mask_file
    assert guide.layout_guide_path == guide_file
    assert guide.canvas_size == (32, 24)
    assert guide.analysis_bbox == (8, 6, 22, 18)
    assert guide.analysis_centroid == (14.5, 11.5)
    assert guide.safe_bbox == (2, 2, 30, 22)
    assert analysis_mask_file.exists()
    assert guide_file.exists()
    with Image.open(analysis_mask_file) as analysis_mask:
        assert analysis_mask.mode == "L"
        assert analysis_mask.getbbox() == (8, 6, 22, 18)
    with Image.open(guide_file) as rendered_guide:
        assert rendered_guide.mode == "RGB"
        assert rendered_guide.size == (32, 24)


def test_layout_guide_uses_cleaned_analysis_mask_not_raw_speck_bbox(
    tmp_path: Path,
) -> None:
    source_crop_file = tmp_path / "source_crop.png"
    mask_file = tmp_path / "mask.png"
    analysis_mask_file = tmp_path / "job" / "analysis_mask.png"
    guide_file = tmp_path / "job" / "layout_guide.png"
    Image.new("RGB", (40, 30), (245, 244, 240)).save(source_crop_file)
    mask = Image.new("L", (40, 30), 0)
    for y in range(7, 21):
        for x in range(9, 25):
            mask.putpixel((x, y), 255)
    mask.putpixel((37, 27), 255)
    mask.save(mask_file)

    guide = render_codex_final_layout_guide(
        source_crop_file=source_crop_file,
        mask_file=mask_file,
        analysis_mask_file=analysis_mask_file,
        guide_file=guide_file,
    )

    assert Image.open(mask_file).getbbox() == (9, 7, 38, 28)
    assert guide.analysis_bbox == (9, 7, 25, 21)
    with Image.open(analysis_mask_file) as analysis_mask:
        assert analysis_mask.getbbox() == (9, 7, 25, 21)
        assert analysis_mask.getpixel((37, 27)) == 0
