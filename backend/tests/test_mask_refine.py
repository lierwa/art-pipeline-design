from __future__ import annotations

from PIL import Image, ImageDraw

from art_pipeline.mask_refine import polish_mask_alpha


def test_polish_mask_alpha_preserves_visible_outline_pixels() -> None:
    mask = Image.new("L", (20, 20), 0)
    ImageDraw.Draw(mask).rectangle((5, 5, 14, 14), fill=255)

    alpha = polish_mask_alpha(mask)

    assert alpha.getpixel((5, 10)) >= 240
    assert alpha.getpixel((10, 5)) >= 240
    assert alpha.getpixel((10, 10)) == 255


def test_polish_mask_alpha_adds_edge_antialias_without_expanding_far() -> None:
    mask = Image.new("L", (20, 20), 0)
    ImageDraw.Draw(mask).rectangle((5, 5, 14, 14), fill=255)

    alpha = polish_mask_alpha(mask)

    assert 0 < alpha.getpixel((4, 10)) < 180
    assert alpha.getpixel((3, 10)) == 0


def test_polish_mask_alpha_preserves_source_outline_just_outside_mask() -> None:
    mask = Image.new("L", (20, 20), 0)
    ImageDraw.Draw(mask).rectangle((5, 5, 14, 14), fill=255)
    source = Image.new("RGBA", (20, 20), (238, 232, 214, 255))
    ImageDraw.Draw(source).line((4, 5, 4, 14), fill=(54, 38, 30, 255), width=1)

    alpha = polish_mask_alpha(mask, source)

    assert alpha.getpixel((4, 10)) >= 220
    assert alpha.getpixel((3, 10)) == 0


def test_polish_mask_alpha_preserves_source_outline_two_pixels_outside_mask() -> None:
    mask = Image.new("L", (22, 22), 0)
    ImageDraw.Draw(mask).rectangle((6, 5, 15, 16), fill=255)
    source = Image.new("RGBA", (22, 22), (238, 232, 214, 255))
    ImageDraw.Draw(source).line((4, 5, 4, 16), fill=(54, 38, 30, 255), width=1)

    alpha = polish_mask_alpha(mask, source)

    assert alpha.getpixel((4, 10)) >= 220
    assert alpha.getpixel((3, 10)) == 0


def test_polish_mask_alpha_softens_plain_source_boundary() -> None:
    mask = Image.new("L", (20, 20), 0)
    ImageDraw.Draw(mask).rectangle((5, 5, 14, 14), fill=255)
    source = Image.new("RGBA", (20, 20), (238, 232, 214, 255))

    alpha = polish_mask_alpha(mask, source)

    assert 120 <= alpha.getpixel((5, 10)) <= 190
    assert alpha.getpixel((4, 10)) >= 60
    assert alpha.getpixel((3, 10)) == 0
    assert alpha.getpixel((10, 10)) == 255


def test_polish_mask_alpha_preserves_source_outline_on_mask_boundary() -> None:
    mask = Image.new("L", (20, 20), 0)
    ImageDraw.Draw(mask).rectangle((5, 5, 14, 14), fill=255)
    source = Image.new("RGBA", (20, 20), (238, 232, 214, 255))
    ImageDraw.Draw(source).line((5, 5, 5, 14), fill=(54, 38, 30, 255), width=1)

    alpha = polish_mask_alpha(mask, source)

    assert alpha.getpixel((5, 10)) >= 240
    assert alpha.getpixel((4, 10)) < alpha.getpixel((5, 10))


def test_polish_mask_alpha_does_not_treat_dark_background_as_outline() -> None:
    mask = Image.new("L", (20, 20), 0)
    ImageDraw.Draw(mask).rectangle((5, 5, 14, 14), fill=255)
    source = Image.new("RGBA", (20, 20), (20, 30, 40, 255))
    ImageDraw.Draw(source).rectangle((5, 5, 14, 14), fill=(220, 90, 40, 255))

    alpha = polish_mask_alpha(mask, source)

    assert 0 < alpha.getpixel((4, 10)) < 180
    assert alpha.getpixel((3, 10)) == 0
