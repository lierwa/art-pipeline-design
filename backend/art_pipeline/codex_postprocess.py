from __future__ import annotations

import hashlib
import math
import os
from collections import Counter
from pathlib import Path
from uuid import uuid4

from PIL import Image

CHROMA_KEY_CANDIDATES: tuple[tuple[int, int, int], ...] = (
    (0, 255, 0),
    (255, 0, 255),
    (0, 255, 255),
    (255, 0, 0),
)
CODEX_FINAL_OUTPUT_PADDING_PX = 64
CODEX_FINAL_CONTENT_ALPHA_THRESHOLD = 48

def choose_chroma_key(source_file: Path) -> tuple[int, int, int]:
    with Image.open(source_file) as image:
        image.load()
        rgba = image.convert("RGBA")
    visible_pixels = [
        (red, green, blue)
        for red, green, blue, alpha in rgba.getdata()
        if alpha > 0
    ]
    if not visible_pixels:
        return CHROMA_KEY_CANDIDATES[0]
    return max(
        CHROMA_KEY_CANDIDATES,
        key=lambda candidate: _nearest_color_distance(candidate, visible_pixels),
    )


def finalize_codex_raw_output(
    raw_file: Path,
    candidate_file: Path,
    reference_file: Path,
    chroma_key: tuple[int, int, int],
) -> dict[str, str | bool | int | list[int]]:
    if not raw_file.exists():
        raise RuntimeError("Codex CLI did not create codex_raw.png.")
    with Image.open(raw_file) as image:
        image.load()
        raw_rgba = image.convert("RGBA")

    transparent = _clear_low_alpha_residue(
        _remove_chroma_key(raw_rgba, chroma_key),
        CODEX_FINAL_CONTENT_ALPHA_THRESHOLD,
    )
    visible_bbox = _content_bbox(transparent, CODEX_FINAL_CONTENT_ALPHA_THRESHOLD)
    crop_bbox = _padded_bbox(visible_bbox, CODEX_FINAL_OUTPUT_PADDING_PX)
    output = _crop_with_transparent_margin(transparent, crop_bbox) if crop_bbox else transparent

    # WHY: Codex 现在只负责生成 RGB 内容；透明、尺寸与 mask 语义必须由本地确定性代码完成。
    # 这里先过滤低透明背景残留，再保留可调安全边距，避免噪点撑大框或最小框裁得过紧。
    candidate_file.parent.mkdir(parents=True, exist_ok=True)
    output.save(candidate_file, format="PNG")
    return {
        "referenceSha256": _sha256_file(reference_file),
        "rawOutputSha256": _sha256_file(raw_file),
        "outputSha256": _sha256_file(candidate_file),
        "trimmedOutputBbox": list(crop_bbox) if crop_bbox else [],
        "outputWidth": output.width,
        "outputHeight": output.height,
        "isOutputIdenticalToReference": False,
    }


def promote_codex_final_candidate(candidate_file: Path, target_file: Path) -> None:
    target_file.parent.mkdir(parents=True, exist_ok=True)
    temp_file = target_file.with_name(f".{target_file.stem}.{uuid4().hex}.tmp.png")
    try:
        with Image.open(candidate_file) as image:
            image.load()
            image.save(temp_file, format="PNG")
        # WHY: promotion 是唯一写 canonical final 的边界；先写同目录临时 PNG 再
        # os.replace，牺牲一次额外落盘，换取进程中断或 PIL 保存失败时旧 final 不被截断。
        os.replace(temp_file, target_file)
    except Exception:
        temp_file.unlink(missing_ok=True)
        raise


def _nearest_color_distance(
    candidate: tuple[int, int, int],
    pixels: list[tuple[int, int, int]],
) -> float:
    sample_stride = max(len(pixels) // 2000, 1)
    sampled = pixels[::sample_stride]
    return min(_color_distance(candidate, pixel) for pixel in sampled)


def _remove_chroma_key(image: Image.Image, chroma_key: tuple[int, int, int]) -> Image.Image:
    key = _dominant_border_color(image, chroma_key)
    output: list[tuple[int, int, int, int]] = []
    for red, green, blue, alpha in image.getdata():
        distance = _color_distance((red, green, blue), key)
        if distance <= 30:
            next_alpha = 0
        elif distance >= 110:
            next_alpha = alpha
        else:
            next_alpha = round(alpha * ((distance - 30) / 80))
        output.append((*_despill((red, green, blue), key, next_alpha), next_alpha))
    result = Image.new("RGBA", image.size)
    result.putdata(output)
    return result


def _content_bbox(image: Image.Image, alpha_threshold: int) -> tuple[int, int, int, int] | None:
    alpha = image.getchannel("A")
    mask = Image.new("L", alpha.size, 0)
    source = alpha.load()
    target = mask.load()
    width, height = alpha.size
    for y in range(height):
        for x in range(width):
            if source[x, y] >= alpha_threshold:
                target[x, y] = 255
    return mask.getbbox()


def _clear_low_alpha_residue(image: Image.Image, alpha_threshold: int) -> Image.Image:
    pixels: list[tuple[int, int, int, int]] = []
    for red, green, blue, alpha in image.getdata():
        pixels.append((red, green, blue, 0) if alpha < alpha_threshold else (red, green, blue, alpha))
    cleaned = Image.new("RGBA", image.size)
    cleaned.putdata(pixels)
    return cleaned


def _padded_bbox(
    bbox: tuple[int, int, int, int] | None,
    padding: int,
) -> tuple[int, int, int, int] | None:
    if bbox is None:
        return None
    left, top, right, bottom = bbox
    return (
        left - padding,
        top - padding,
        right + padding,
        bottom + padding,
    )


def _crop_with_transparent_margin(image: Image.Image, bbox: tuple[int, int, int, int]) -> Image.Image:
    left, top, right, bottom = bbox
    output = Image.new("RGBA", (right - left, bottom - top), (0, 0, 0, 0))
    source_box = (
        max(0, left),
        max(0, top),
        min(image.width, right),
        min(image.height, bottom),
    )
    if source_box[0] >= source_box[2] or source_box[1] >= source_box[3]:
        return output
    output.alpha_composite(image.crop(source_box), (source_box[0] - left, source_box[1] - top))
    return output


def _dominant_border_color(image: Image.Image, fallback: tuple[int, int, int]) -> tuple[int, int, int]:
    width, height = image.size
    if width == 0 or height == 0:
        return fallback
    pixels = image.convert("RGB").load()
    border: list[tuple[int, int, int]] = []
    for x in range(width):
        border.append(pixels[x, 0])
        border.append(pixels[x, height - 1])
    for y in range(height):
        border.append(pixels[0, y])
        border.append(pixels[width - 1, y])
    fallback_hits = sum(1 for pixel in border if _color_distance(pixel, fallback) <= 30)
    # WHY: 物体可能合法贴边，导致边框主色不是 chroma。只要边框仍能看到
    # 明确传入的 chroma key，就优先用它，避免把主体色误当背景擦掉。
    if fallback_hits >= max(1, int(len(border) * 0.01)):
        return fallback
    quantized = [
        (round(red / 8) * 8, round(green / 8) * 8, round(blue / 8) * 8)
        for red, green, blue in border
    ]
    return Counter(quantized).most_common(1)[0][0] if quantized else fallback


def _despill(
    pixel: tuple[int, int, int],
    key: tuple[int, int, int],
    alpha: int,
) -> tuple[int, int, int]:
    red, green, blue = pixel
    if alpha == 0 or alpha >= 245:
        return pixel
    dominant_channel = max(range(3), key=lambda index: key[index])
    channels = [red, green, blue]
    other_max = max(value for index, value in enumerate(channels) if index != dominant_channel)
    if channels[dominant_channel] > other_max + 24:
        channels[dominant_channel] = max(other_max, channels[dominant_channel] - 24)
    return tuple(channels)


def _color_distance(left: tuple[int, int, int], right: tuple[int, int, int]) -> float:
    return math.sqrt(sum((left[index] - right[index]) ** 2 for index in range(3)))


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
