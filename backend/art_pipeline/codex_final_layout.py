from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw

from art_pipeline.codex_final_analysis_mask import build_codex_final_analysis_mask


@dataclass(frozen=True)
class CodexFinalLayoutGuide:
    analysis_mask_path: Path
    layout_guide_path: Path
    canvas_size: tuple[int, int]
    safe_bbox: tuple[int, int, int, int]
    analysis_bbox: tuple[int, int, int, int] | None
    analysis_centroid: tuple[float, float] | None


def render_codex_final_layout_guide(
    *,
    source_crop_file: Path,
    mask_file: Path,
    analysis_mask_file: Path,
    guide_file: Path,
) -> CodexFinalLayoutGuide:
    with Image.open(source_crop_file) as source_crop:
        canvas_size = source_crop.size
    with Image.open(mask_file) as mask:
        analysis = build_codex_final_analysis_mask(mask)

    analysis_mask_file.parent.mkdir(parents=True, exist_ok=True)
    guide_file.parent.mkdir(parents=True, exist_ok=True)
    analysis.image.save(analysis_mask_file, format="PNG")

    safe_bbox = _safe_bbox(canvas_size)
    guide = Image.new("RGB", canvas_size, (246, 245, 241))
    draw = ImageDraw.Draw(guide)
    _draw_layout_marks(draw, canvas_size, safe_bbox, analysis.bbox, analysis.centroid)
    guide.save(guide_file, format="PNG")

    return CodexFinalLayoutGuide(
        analysis_mask_path=analysis_mask_file,
        layout_guide_path=guide_file,
        canvas_size=canvas_size,
        safe_bbox=safe_bbox,
        analysis_bbox=analysis.bbox,
        analysis_centroid=analysis.centroid,
    )


def _safe_bbox(size: tuple[int, int]) -> tuple[int, int, int, int]:
    width, height = size
    margin = min(max(2, round(min(size) * 0.08)), max(0, min(width, height) // 2))
    return (margin, margin, width - margin, height - margin)


def _draw_layout_marks(
    draw: ImageDraw.ImageDraw,
    canvas_size: tuple[int, int],
    safe_bbox: tuple[int, int, int, int],
    analysis_bbox: tuple[int, int, int, int] | None,
    analysis_centroid: tuple[float, float] | None,
) -> None:
    width, height = canvas_size
    # WHY: guide 只给 Codex 提供测量参照，禁止文字和语义标签，避免模型把
    # 施工标记误当成最终资产内容复制进去。
    draw.rectangle((0, 0, width - 1, height - 1), outline=(98, 104, 112), width=2)
    draw.rectangle(_inclusive_rect(safe_bbox), outline=(160, 166, 174), width=1)
    center = (width // 2, height // 2)
    cross = max(4, min(width, height) // 10)
    draw.line((center[0] - cross, center[1], center[0] + cross, center[1]), fill=(124, 129, 136), width=1)
    draw.line((center[0], center[1] - cross, center[0], center[1] + cross), fill=(124, 129, 136), width=1)
    _draw_isometric_axis_hints(draw, center, canvas_size)
    if analysis_bbox is not None:
        draw.rectangle(_inclusive_rect(analysis_bbox), outline=(46, 111, 158), width=2)
    if analysis_centroid is not None:
        cx, cy = analysis_centroid
        radius = max(2, min(width, height) // 40)
        draw.ellipse(
            (
                round(cx - radius),
                round(cy - radius),
                round(cx + radius),
                round(cy + radius),
            ),
            fill=(46, 111, 158),
        )


def _draw_isometric_axis_hints(
    draw: ImageDraw.ImageDraw,
    center: tuple[int, int],
    canvas_size: tuple[int, int],
) -> None:
    width, height = canvas_size
    length = max(6, min(width, height) // 5)
    rise = max(3, length // 2)
    x, y = center
    color = (196, 178, 112)
    draw.line((x, y, x + length, y - rise), fill=color, width=1)
    draw.line((x, y, x - length, y - rise), fill=color, width=1)
    draw.line((x, y, x, y + length), fill=color, width=1)


def _inclusive_rect(bbox: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    left, top, right, bottom = bbox
    return (left, top, max(left, right - 1), max(top, bottom - 1))
