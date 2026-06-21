from __future__ import annotations

from PIL import Image, ImageDraw

from art_pipeline.elements import ElementRecord
from art_pipeline.segment.canvas import expanded_canvas_for_source_mask


def test_expanded_canvas_is_stable_across_repeated_suggestions() -> None:
    source = Image.new("RGB", (100, 100), "white")
    mask = Image.new("L", (100, 100), 0)
    ImageDraw.Draw(mask).rectangle((18, 18, 44, 44), fill=255)
    element = ElementRecord(
        id="element_canvas",
        name="Object",
        bbox={"x": 20, "y": 20, "w": 20, "h": 20},
    )

    first = expanded_canvas_for_source_mask(source, element, mask)
    repeated = expanded_canvas_for_source_mask(
        source,
        element.model_copy(update={"canvas": first}),
        mask,
    )

    assert repeated == first
