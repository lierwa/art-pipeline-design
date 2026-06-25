from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

from PIL import Image, ImageDraw

from art_pipeline.exporting.files import resolve_workspace_path


@dataclass(frozen=True)
class CodexFinalBriefRemovedChild:
    element_id: str
    name: str
    mask_path: str
    bbox: dict[str, int]
    canvas: dict[str, int]


@dataclass(frozen=True)
class CodexFinalBrief:
    image_path: Path
    json_path: Path
    target_bounds: dict[str, int]
    removed_children: tuple[CodexFinalBriefRemovedChild, ...]
    exclude_fill_regions: tuple[dict[str, Any], ...]


def render_codex_final_brief(
    workspace_root: Path,
    *,
    source_crop_path: str,
    rough_cutout_path: str,
    mask_path: str,
    target_canvas: dict[str, int],
    removed_children: Sequence[CodexFinalBriefRemovedChild],
    image_path: Path,
    json_path: Path,
) -> CodexFinalBrief:
    source_file = resolve_workspace_path(workspace_root, source_crop_path)
    rough_file = resolve_workspace_path(workspace_root, rough_cutout_path)
    mask_file = resolve_workspace_path(workspace_root, mask_path)

    with Image.open(source_file) as source_image:
        source = source_image.convert("RGBA")
    with Image.open(rough_file) as rough_image:
        rough = rough_image.convert("RGBA")
    with Image.open(mask_file) as mask_image:
        mask = mask_image.convert("L")

    mask_bbox = mask.getbbox()
    if mask_bbox is None:
        raise ValueError("Codex generation requires a non-empty SAM2 mask.")
    _validate_canvas_size("target image", "target canvas", target_canvas, source.size)
    target_bounds = _bounds_from_bbox(mask_bbox)
    task_map, exclude_regions = _render_task_map(
        workspace_root,
        target_size=source.size,
        target_canvas=target_canvas,
        mask=mask,
        target_bounds=target_bounds,
        removed_children=removed_children,
    )
    image_path.parent.mkdir(parents=True, exist_ok=True)
    _compose_three_column_image(source, rough, task_map).save(image_path, format="PNG")

    payload: dict[str, Any] = {
        "sourceCropPath": source_crop_path,
        "roughCutoutPath": rough_cutout_path,
        "maskPath": mask_path,
        "targetBounds": target_bounds,
        "removedChildren": [_removed_child_payload(child) for child in removed_children],
    }
    if exclude_regions:
        payload["excludeFillRegions"] = list(exclude_regions)
    json_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return CodexFinalBrief(
        image_path=image_path,
        json_path=json_path,
        target_bounds=target_bounds,
        removed_children=tuple(removed_children),
        exclude_fill_regions=exclude_regions,
    )


def _render_task_map(
    workspace_root: Path,
    *,
    target_size: tuple[int, int],
    target_canvas: dict[str, int],
    mask: Image.Image,
    target_bounds: dict[str, int],
    removed_children: Sequence[CodexFinalBriefRemovedChild],
) -> tuple[Image.Image, tuple[dict[str, Any], ...]]:
    task_map = Image.new("RGBA", target_size, (245, 247, 250, 255))
    accepted_layer = Image.new("RGBA", target_size, (65, 135, 245, 0))
    accepted_layer.putalpha(mask.point(lambda value: 72 if value else 0))
    task_map.alpha_composite(accepted_layer)
    draw = ImageDraw.Draw(task_map)

    # WHY: 子物体区域是父物体补全任务里最容易被模型误带回来的信息；
    # 把它投影成视觉排除/填补区域，比只在 prompt 里描述更稳定。
    exclude_regions = tuple(
        _render_child_exclude_region(
            workspace_root,
            task_map,
            target_size=target_size,
            target_canvas=target_canvas,
            child=child,
        )
        for child in removed_children
    )

    _draw_target_bounds(draw, target_bounds)
    _draw_center_cross(draw, target_bounds, target_size)
    return task_map, exclude_regions


def _render_child_exclude_region(
    workspace_root: Path,
    task_map: Image.Image,
    *,
    target_size: tuple[int, int],
    target_canvas: dict[str, int],
    child: CodexFinalBriefRemovedChild,
) -> dict[str, Any]:
    child_mask_file = resolve_workspace_path(workspace_root, child.mask_path)
    with Image.open(child_mask_file) as image:
        child_mask = image.convert("L")

    projected_mask, offset = _project_child_mask(child_mask, child.canvas, target_canvas, target_size)
    fill_layer = Image.new("RGBA", target_size, (255, 92, 35, 0))
    fill_layer.putalpha(projected_mask.point(lambda value: 136 if value else 0))
    task_map.alpha_composite(fill_layer)

    bounds = projected_mask.getbbox()
    target_bounds = _bounds_from_bbox(bounds) if bounds is not None else {"x": offset[0], "y": offset[1], "w": 0, "h": 0}
    if bounds is not None:
        ImageDraw.Draw(task_map).rectangle(
            (bounds[0], bounds[1], bounds[2] - 1, bounds[3] - 1),
            outline=(180, 40, 20, 255),
            width=1,
        )
    return {
        "elementId": child.element_id,
        "name": child.name,
        "maskPath": child.mask_path,
        "bbox": child.bbox,
        "canvas": child.canvas,
        "targetBounds": target_bounds,
    }


def _project_child_mask(
    child_mask: Image.Image,
    child_canvas: dict[str, int],
    target_canvas: dict[str, int],
    target_size: tuple[int, int],
) -> tuple[Image.Image, tuple[int, int]]:
    _validate_canvas_size("child mask", "child canvas", child_canvas, child_mask.size)
    _validate_canvas_size("target image", "target canvas", target_canvas, target_size)
    offset = (
        child_canvas["x"] - target_canvas["x"],
        child_canvas["y"] - target_canvas["y"],
    )
    projected = Image.new("L", target_size, 0)
    projected.paste(child_mask, offset)
    return projected, offset


def _compose_three_column_image(
    source: Image.Image,
    rough: Image.Image,
    task_map: Image.Image,
) -> Image.Image:
    panel_width = max(source.width, rough.width, task_map.width)
    panel_height = max(source.height, rough.height, task_map.height)
    output = Image.new("RGBA", (panel_width * 3, panel_height), (255, 255, 255, 255))
    output.alpha_composite(_panel_with_background(source, panel_width, panel_height), (0, 0))
    output.alpha_composite(_panel_with_background(rough, panel_width, panel_height), (panel_width, 0))
    output.alpha_composite(_panel_with_background(task_map, panel_width, panel_height), (panel_width * 2, 0))
    return output


def _panel_with_background(image: Image.Image, width: int, height: int) -> Image.Image:
    panel = Image.new("RGBA", (width, height), (255, 255, 255, 255))
    panel.alpha_composite(image, ((width - image.width) // 2, (height - image.height) // 2))
    return panel


def _draw_target_bounds(draw: ImageDraw.ImageDraw, bounds: dict[str, int]) -> None:
    x = bounds["x"]
    y = bounds["y"]
    right = x + bounds["w"] - 1
    bottom = y + bounds["h"] - 1
    draw.rectangle((x, y, right, bottom), outline=(225, 42, 42, 255), width=1)


def _draw_center_cross(
    draw: ImageDraw.ImageDraw,
    bounds: dict[str, int],
    target_size: tuple[int, int],
) -> None:
    center_x = bounds["x"] + bounds["w"] // 2
    center_y = bounds["y"] + bounds["h"] // 2
    radius = max(2, min(target_size) // 10)
    draw.line((center_x - radius, center_y, center_x + radius, center_y), fill=(225, 42, 42, 255), width=1)
    draw.line((center_x, center_y - radius, center_x, center_y + radius), fill=(225, 42, 42, 255), width=1)


def _bounds_from_bbox(bbox: tuple[int, int, int, int]) -> dict[str, int]:
    return {"x": bbox[0], "y": bbox[1], "w": bbox[2] - bbox[0], "h": bbox[3] - bbox[1]}


def _validate_canvas_size(
    image_label: str,
    canvas_label: str,
    canvas: dict[str, int],
    size: tuple[int, int],
) -> None:
    if canvas.get("w") == size[0] and canvas.get("h") == size[1]:
        return
    raise ValueError(
        f"{image_label} size does not match {canvas_label}: "
        f"size={size[0]}x{size[1]}, canvas={canvas.get('w')}x{canvas.get('h')}"
    )


def _removed_child_payload(child: CodexFinalBriefRemovedChild) -> dict[str, Any]:
    return {
        "elementId": child.element_id,
        "name": child.name,
        "maskPath": child.mask_path,
        "bbox": child.bbox,
        "canvas": child.canvas,
    }
