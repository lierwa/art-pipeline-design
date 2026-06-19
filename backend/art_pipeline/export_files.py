from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any, Callable

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont


EXPORT_RELATIVE_ROOT = "export"
TEMP_EXPORT_RELATIVE_ROOT = "export.tmp"
BACKUP_EXPORT_RELATIVE_ROOT = "export.previous"
EXPORT_ASSETS_DIR = "export/assets"
EXPORT_MASKS_DIR = "export/masks"
EXPORT_SOURCE_CROPS_DIR = "export/source_crops"
MANIFEST_PATH = "export/manifest.json"
LEVEL_PATH = "export/level.json"
CONTACT_SHEET_PATH = "export/contact_sheet.png"
QA_REPORT_PATH = "export/qa_report.json"


def export_paths() -> dict[str, str]:
    return {
        "assetsDir": EXPORT_ASSETS_DIR,
        "masksDir": EXPORT_MASKS_DIR,
        "sourceCropsDir": EXPORT_SOURCE_CROPS_DIR,
        "manifest": MANIFEST_PATH,
        "level": LEVEL_PATH,
        "contactSheet": CONTACT_SHEET_PATH,
        "qaReport": QA_REPORT_PATH,
    }


def prepare_temp_export_dir(workspace_root: Path) -> Path:
    temp_export_dir = resolve_workspace_path(workspace_root, TEMP_EXPORT_RELATIVE_ROOT)
    if temp_export_dir.exists():
        shutil.rmtree(temp_export_dir)
    (temp_export_dir / "assets").mkdir(parents=True, exist_ok=True)
    (temp_export_dir / "masks").mkdir(parents=True, exist_ok=True)
    (temp_export_dir / "source_crops").mkdir(parents=True, exist_ok=True)
    return temp_export_dir


def replace_export_dir(workspace_root: Path, temp_export_dir: Path) -> None:
    export_dir = resolve_workspace_path(workspace_root, EXPORT_RELATIVE_ROOT)
    backup_dir = resolve_workspace_path(workspace_root, BACKUP_EXPORT_RELATIVE_ROOT)
    if backup_dir.exists():
        shutil.rmtree(backup_dir)

    moved_existing = False
    try:
        if export_dir.exists():
            export_dir.rename(backup_dir)
            moved_existing = True
        temp_export_dir.rename(export_dir)
    except Exception:
        if moved_existing and backup_dir.exists() and not export_dir.exists():
            backup_dir.rename(export_dir)
        raise
    else:
        if backup_dir.exists():
            shutil.rmtree(backup_dir)


def temp_export_relative(export_relative_path: str) -> str:
    if export_relative_path == EXPORT_RELATIVE_ROOT:
        return TEMP_EXPORT_RELATIVE_ROOT
    prefix = f"{EXPORT_RELATIVE_ROOT}/"
    if export_relative_path.startswith(prefix):
        return f"{TEMP_EXPORT_RELATIVE_ROOT}/{export_relative_path.removeprefix(prefix)}"
    raise ValueError("Temporary export paths must be under the export directory.")


def copy_workspace_file(workspace_root: Path, source_relative: str, target_relative: str) -> None:
    source_path = resolve_workspace_path(workspace_root, source_relative)
    target_path = resolve_workspace_path(workspace_root, target_relative)
    if not source_path.exists():
        raise ValueError(f"Export source file is missing: {source_relative}")
    target_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_path, target_path)


def write_sticker_asset(
    workspace_root: Path,
    source_relative: str,
    target_relative: str,
    outline_width: int = 1,
) -> None:
    source_path = resolve_workspace_path(workspace_root, source_relative)
    target_path = resolve_workspace_path(workspace_root, target_relative)
    with Image.open(source_path) as source:
        source.load()
        asset = source.convert("RGBA")
    sticker = add_alpha_outline(asset, outline_width=outline_width)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    sticker.save(target_path, format="PNG")


def add_alpha_outline(
    asset: Image.Image,
    outline_width: int = 1,
    outline_color: tuple[int, int, int] = (255, 255, 255),
) -> Image.Image:
    rgba = asset.convert("RGBA")
    if outline_width <= 0:
        return rgba

    alpha = rgba.getchannel("A").point(lambda value: 255 if value > 0 else 0)
    dilated = _dilate_alpha(alpha, outline_width)
    outline_alpha = ImageChops.subtract(dilated, alpha)
    outline = Image.new("RGBA", rgba.size, (*outline_color, 0))
    outline.putalpha(outline_alpha)

    # WHY: final pack 的 PNG 要直接可被游戏当贴纸使用；mask 仍保持 SAM2/repair 的原始语义，
    # 白边只在导出的可视 asset 上膨胀 alpha，避免污染后续 QA 和父子擦除协议。
    sticker = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    sticker.alpha_composite(outline)
    sticker.alpha_composite(rgba)
    return sticker


def _dilate_alpha(alpha: Image.Image, outline_width: int) -> Image.Image:
    dilated = alpha.convert("L")
    for _ in range(outline_width):
        dilated = dilated.filter(ImageFilter.MaxFilter(3))
    return dilated


def asset_has_alpha_channel(workspace_root: Path, source_relative: str) -> bool:
    source_path = resolve_workspace_path(workspace_root, source_relative)
    try:
        with Image.open(source_path) as asset:
            asset.load()
            return "A" in asset.getbands()
    except OSError:
        return False


def write_alpha_mask(workspace_root: Path, source_relative: str, target_relative: str) -> None:
    source_path = resolve_workspace_path(workspace_root, source_relative)
    target_path = resolve_workspace_path(workspace_root, target_relative)
    with Image.open(source_path) as asset:
        asset.load()
        if "A" not in asset.getbands():
            raise ValueError(f"Export source asset has no alpha channel: {source_relative}")
        mask = asset.getchannel("A").point(lambda value: 255 if value > 0 else 0)

    target_path.parent.mkdir(parents=True, exist_ok=True)
    mask.save(target_path, format="PNG")


def workspace_file_exists(workspace_root: Path, relative_path: str) -> bool:
    return resolve_workspace_path(workspace_root, relative_path).exists()


def resolve_workspace_path(workspace_root: Path, relative_path: str) -> Path:
    workspace_path = Path(workspace_root).resolve()
    resolved = (workspace_path / relative_path).resolve()
    try:
        resolved.relative_to(workspace_path)
    except ValueError as exc:
        raise ValueError("Export paths must stay inside the workspace root.") from exc
    return resolved


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def write_contact_sheet(
    workspace_root: Path,
    exported_elements: list[dict[str, Any]],
    output_relative_path: str = CONTACT_SHEET_PATH,
    asset_path_mapper: Callable[[str], str] | None = None,
) -> None:
    contact_sheet_path = resolve_workspace_path(workspace_root, output_relative_path)
    contact_sheet_path.parent.mkdir(parents=True, exist_ok=True)

    font = ImageFont.load_default()
    if not exported_elements:
        sheet = Image.new("RGB", (420, 180), (17, 21, 29))
        draw = ImageDraw.Draw(sheet)
        draw.text((24, 74), "No exported assets", fill=(230, 236, 243), font=font)
        sheet.save(contact_sheet_path, format="PNG")
        return

    cell_width = 180
    cell_height = 190
    columns = min(4, max(1, len(exported_elements)))
    rows = (len(exported_elements) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * cell_width, rows * cell_height), (17, 21, 29))
    draw = ImageDraw.Draw(sheet)

    for index, exported in enumerate(exported_elements):
        column = index % columns
        row = index // columns
        left = column * cell_width
        top = row * cell_height
        asset_relative_path = exported["assetPath"]
        if asset_path_mapper is not None:
            asset_relative_path = asset_path_mapper(asset_relative_path)
        asset_path = resolve_workspace_path(workspace_root, asset_relative_path)
        with Image.open(asset_path) as asset:
            asset.load()
            preview = _fit_asset_on_checkerboard(asset.convert("RGBA"), (144, 128))
        sheet.paste(preview, (left + 18, top + 14))
        label = f"{exported['elementId']}  {exported['name']}"
        draw.text((left + 18, top + 154), label[:28], fill=(230, 236, 243), font=font)

    sheet.save(contact_sheet_path, format="PNG")


def _fit_asset_on_checkerboard(asset: Image.Image, size: tuple[int, int]) -> Image.Image:
    preview = Image.new("RGBA", size, (13, 17, 23, 255))
    draw = ImageDraw.Draw(preview)
    tile = 12
    for y in range(0, size[1], tile):
        for x in range(0, size[0], tile):
            fill = (41, 49, 66, 255) if (x // tile + y // tile) % 2 == 0 else (18, 23, 32, 255)
            draw.rectangle((x, y, x + tile - 1, y + tile - 1), fill=fill)

    fitted = asset.copy()
    fitted.thumbnail((size[0] - 16, size[1] - 16), Image.Resampling.LANCZOS)
    offset = ((size[0] - fitted.width) // 2, (size[1] - fitted.height) // 2)
    preview.alpha_composite(fitted, offset)
    return preview.convert("RGB")
