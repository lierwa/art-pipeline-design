from PIL import Image

from art_pipeline.codex_final_analysis_mask import build_codex_final_analysis_mask


def test_analysis_mask_removes_tiny_far_away_speck() -> None:
    mask = Image.new("L", (20, 20), 0)
    for y in range(3, 13):
        for x in range(2, 12):
            mask.putpixel((x, y), 255)
    mask.putpixel((18, 18), 255)

    result = build_codex_final_analysis_mask(mask)

    assert result.bbox == (2, 3, 12, 13)
    assert result.visible_area == 100
    assert result.kept_component_count == 1
    assert result.removed_component_count >= 1
    assert result.image.mode == "L"
    assert result.image.getpixel((18, 18)) == 0


def test_analysis_mask_keeps_meaningful_nearby_components() -> None:
    mask = Image.new("L", (24, 16), 0)
    for y in range(3, 13):
        for x in range(2, 12):
            mask.putpixel((x, y), 255)
    for y in range(6, 8):
        for x in range(15, 17):
            mask.putpixel((x, y), 255)

    result = build_codex_final_analysis_mask(mask)

    assert result.bbox == (2, 3, 17, 13)
    assert result.visible_area == 104
    assert result.kept_component_count == 2
    assert result.removed_component_count == 0
    assert result.image.getpixel((15, 6)) == 255


def test_analysis_mask_returns_empty_metrics_for_empty_mask() -> None:
    result = build_codex_final_analysis_mask(Image.new("L", (8, 6), 0))

    assert result.bbox is None
    assert result.centroid is None
    assert result.visible_area == 0
    assert result.kept_component_count == 0
    assert result.removed_component_count == 0
    assert result.image.mode == "L"
    assert result.image.getbbox() is None


def test_analysis_mask_uses_rgba_alpha_channel() -> None:
    image = Image.new("RGBA", (6, 5), (255, 255, 255, 0))
    for y in range(1, 4):
        for x in range(2, 5):
            image.putpixel((x, y), (255, 255, 255, 180))

    result = build_codex_final_analysis_mask(image)

    assert result.bbox == (2, 1, 5, 4)
    assert result.visible_area == 9
    assert result.centroid == (3.0, 2.0)
