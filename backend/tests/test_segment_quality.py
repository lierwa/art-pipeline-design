from __future__ import annotations

from PIL import Image, ImageDraw

from art_pipeline.elements import ElementRecord
from art_pipeline.segment.quality import build_sam2_prompt_candidates
from art_pipeline.segment.quality import positive_support_points
from art_pipeline.segment.quality import quality_metadata_for_candidate
from art_pipeline.segment.quality import repair_and_score_sam2_candidate
from art_pipeline.segment.quality import select_best_sam2_candidate
from art_pipeline.segment.quality import segmentation_quality_status


def test_repair_removes_tiny_detached_noise_but_keeps_large_parts() -> None:
    mask = Image.new("L", (24, 14), 0)
    draw = ImageDraw.Draw(mask)
    draw.rectangle((2, 2, 10, 10), fill=255)
    draw.rectangle((14, 5, 19, 9), fill=255)
    draw.point((22, 2), fill=255)
    draw.point((22, 3), fill=255)
    draw.point((21, 3), fill=255)

    candidate = repair_and_score_sam2_candidate(
        "element_test",
        {"supportProfile": "base"},
        mask,
    )

    assert candidate.mask.getpixel((22, 2)) == 0
    assert candidate.mask.getpixel((15, 6)) == 255
    assert candidate.detached_area == 30
    assert candidate.removed_detached_count == 1
    assert candidate.removed_detached_area == 3


def test_repair_removes_scaled_tiny_detached_noise_for_large_masks() -> None:
    mask = Image.new("L", (400, 320), 0)
    draw = ImageDraw.Draw(mask)
    draw.rectangle((10, 10, 310, 280), fill=255)
    draw.rectangle((12, 292, 35, 304), fill=255)
    draw.rectangle((360, 30, 365, 42), fill=255)

    candidate = repair_and_score_sam2_candidate(
        "element_large_noise",
        {"supportProfile": "base"},
        mask,
    )

    assert candidate.mask.getpixel((362, 36)) == 0
    assert candidate.mask.getpixel((20, 300)) == 255
    assert candidate.removed_detached_area == 78
    assert candidate.detached_area == 312


def test_quality_status_warns_for_detached_parts_without_failing() -> None:
    status, reasons = segmentation_quality_status(
        {
            "foregroundArea": 26045,
            "detachedArea": 680,
            "filledHoleArea": 41,
            "candidateCount": 2,
        }
    )

    assert status == "warn"
    assert reasons == ["detached_components_present"]


def test_quality_status_fails_for_empty_foreground() -> None:
    status, reasons = segmentation_quality_status(
        {
            "foregroundArea": 0,
            "detachedArea": 0,
            "filledHoleArea": 0,
            "candidateCount": 1,
        }
    )

    assert status == "fail"
    assert reasons == ["empty_foreground"]


def test_quality_status_fails_when_positive_support_points_are_missing() -> None:
    mask = Image.new("L", (16, 16), 0)
    draw = ImageDraw.Draw(mask)
    draw.rectangle((2, 2, 8, 8), fill=255)

    candidate = repair_and_score_sam2_candidate(
        "element_support",
        {
            "supportProfile": "bottom_support",
            "canvas": {"x": 0, "y": 0, "w": 16, "h": 16},
            "points": [
                {"x": 5, "y": 5, "label": "positive"},
                {"x": 12, "y": 12, "label": "positive"},
            ],
        },
        mask,
    )

    quality = quality_metadata_for_candidate(candidate, 2)

    assert quality["supportPointCount"] == 2
    assert quality["missedSupportPointCount"] == 1
    assert quality["qualityStatus"] == "fail"
    assert quality["qualityReasons"] == ["missed_positive_support_points"]


def test_repair_fills_pinholes_connected_by_one_pixel_mask_leak() -> None:
    mask = Image.new("L", (28, 20), 0)
    draw = ImageDraw.Draw(mask)
    draw.rectangle((4, 3, 23, 16), fill=255)
    draw.rectangle((11, 8, 14, 11), fill=0)
    draw.line((11, 9, 4, 9), fill=0, width=1)
    draw.rectangle((19, 7, 22, 12), fill=0)
    draw.rectangle((21, 7, 23, 12), fill=0)

    candidate = repair_and_score_sam2_candidate(
        "element_pinhole",
        {"supportProfile": "base"},
        mask,
    )

    assert candidate.mask.getpixel((12, 9)) == 255
    assert candidate.mask.getpixel((7, 9)) == 255
    assert candidate.mask.getpixel((22, 9)) == 0
    assert candidate.filled_hole_area >= 16


def test_bottom_support_points_target_visible_feet_without_floor_drift() -> None:
    element = ElementRecord(
        id="element_support_points",
        name="Bathtub",
        bbox={"x": 100, "y": 200, "w": 400, "h": 300},
    )

    points = positive_support_points(element, include_bottom_support=True)

    assert len(points) == 8
    assert points[-3:] == [
        {"x": 148, "y": 416, "label": "positive"},
        {"x": 331, "y": 476, "label": "positive"},
        {"x": 348, "y": 482, "label": "positive"},
    ]


def test_sam2_prompt_candidates_include_visible_extremity_profile() -> None:
    element = ElementRecord(
        id="element_support_profiles",
        name="Cat",
        bbox={"x": 100, "y": 200, "w": 400, "h": 300},
    )

    prompts = build_sam2_prompt_candidates(element, "sam2_edge")

    assert [prompt["supportProfile"] for prompt in prompts] == [
        "base",
        "bottom_support",
        "visible_extremity_support",
        "right_extremity_support",
        "left_extremity_support",
    ]
    assert prompts[2]["points"][-1] == {"x": 356, "y": 500, "label": "positive"}


def test_sam2_prompt_candidates_skip_side_extremity_for_rigid_objects() -> None:
    element = ElementRecord(
        id="element_mirror_profiles",
        name="Mirror",
        bbox={"x": 100, "y": 200, "w": 200, "h": 260},
    )

    prompts = build_sam2_prompt_candidates(element, "sam2_edge")

    assert [prompt["supportProfile"] for prompt in prompts] == [
        "base",
        "bottom_support",
        "visible_extremity_support",
    ]


def test_side_extremity_profiles_target_lower_tail_silhouettes() -> None:
    element = ElementRecord(
        id="element_tail_points",
        name="Cat",
        bbox={"x": 100, "y": 200, "w": 200, "h": 160},
    )

    prompts = build_sam2_prompt_candidates(element, "sam2_edge")
    right_prompt = prompts[3]
    left_prompt = prompts[4]

    assert right_prompt["supportProfile"] == "right_extremity_support"
    assert right_prompt["points"][-2:] == [
        {"x": 286, "y": 324, "label": "positive"},
        {"x": 290, "y": 340, "label": "positive"},
    ]
    assert left_prompt["supportProfile"] == "left_extremity_support"
    assert left_prompt["points"][-2:] == [
        {"x": 114, "y": 324, "label": "positive"},
        {"x": 110, "y": 340, "label": "positive"},
    ]


def test_candidate_reports_lateral_growth_outside_detector_bbox() -> None:
    mask = Image.new("L", (32, 24), 0)
    draw = ImageDraw.Draw(mask)
    draw.rectangle((6, 6, 15, 15), fill=255)
    draw.rectangle((16, 7, 28, 14), fill=255)

    candidate = repair_and_score_sam2_candidate(
        "element_side_merge",
        {
            "supportProfile": "base",
            "bbox": {"x": 6, "y": 6, "w": 10, "h": 10},
            "canvas": {"x": 0, "y": 0, "w": 32, "h": 24},
            "points": [{"x": 10, "y": 10, "label": "positive"}],
        },
        mask,
    )
    quality = quality_metadata_for_candidate(candidate, 1)

    assert quality["bboxLateralGrowthArea"] == 104
    assert quality["qualityStatus"] == "warn"
    assert quality["qualityReasons"] == ["bbox_lateral_growth_present"]


def test_quality_status_fails_for_excessive_lateral_bbox_growth() -> None:
    status, reasons = segmentation_quality_status(
        {
            "foregroundArea": 5000,
            "candidateCount": 1,
            "missedSupportPointCount": 0,
            "bboxLateralGrowthArea": 600,
        }
    )

    assert status == "fail"
    assert reasons == ["bbox_lateral_overgrowth"]


def test_selection_prefers_supported_detached_extremity_over_cleaner_crop() -> None:
    base_mask = Image.new("L", (80, 80), 0)
    draw = ImageDraw.Draw(base_mask)
    draw.rectangle((8, 4, 68, 56), fill=255)
    extremity_mask = base_mask.copy()
    ImageDraw.Draw(extremity_mask).ellipse((38, 62, 44, 68), fill=255)

    base_candidate = repair_and_score_sam2_candidate(
        "element_extremity",
        {
            "supportProfile": "base",
            "canvas": {"x": 0, "y": 0, "w": 80, "h": 80},
            "points": [{"x": 40, "y": 20, "label": "positive"}],
        },
        base_mask,
    )
    extremity_candidate = repair_and_score_sam2_candidate(
        "element_extremity",
        {
            "supportProfile": "visible_extremity_support",
            "canvas": {"x": 0, "y": 0, "w": 80, "h": 80},
            "points": [
                {"x": 40, "y": 20, "label": "positive"},
                {"x": 41, "y": 65, "label": "positive"},
            ],
        },
        extremity_mask,
    )

    selected = select_best_sam2_candidate([base_candidate, extremity_candidate])
    quality = quality_metadata_for_candidate(selected, 2)

    assert selected.prompt["supportProfile"] == "visible_extremity_support"
    assert selected.mask.getpixel((41, 65)) == 255
    assert quality["supportedDetachedArea"] > 0
    assert quality["unsupportedDetachedArea"] == 0
    assert quality["qualityStatus"] == "pass"


def test_selection_allows_supported_side_extremity_growth_without_lateral_overgrowth() -> None:
    base_mask = Image.new("L", (120, 100), 0)
    draw = ImageDraw.Draw(base_mask)
    draw.rectangle((12, 10, 100, 82), fill=255)
    side_mask = base_mask.copy()
    draw = ImageDraw.Draw(side_mask)
    draw.ellipse((84, 58, 112, 92), fill=255)

    base_candidate = repair_and_score_sam2_candidate(
        "element_tail_growth",
        {
            "supportProfile": "base",
            "bbox": {"x": 0, "y": 0, "w": 120, "h": 100},
            "canvas": {"x": 0, "y": 0, "w": 120, "h": 100},
            "points": [{"x": 48, "y": 44, "label": "positive"}],
        },
        base_mask,
    )
    side_candidate = repair_and_score_sam2_candidate(
        "element_tail_growth",
        {
            "supportProfile": "right_extremity_support",
            "bbox": {"x": 0, "y": 0, "w": 120, "h": 100},
            "canvas": {"x": 0, "y": 0, "w": 120, "h": 100},
            "points": [
                {"x": 48, "y": 44, "label": "positive"},
                {"x": 96, "y": 76, "label": "positive"},
            ],
        },
        side_mask,
    )

    selected = select_best_sam2_candidate([base_candidate, side_candidate])

    assert selected.prompt["supportProfile"] == "right_extremity_support"
    assert selected.mask.getpixel((96, 76)) == 255
