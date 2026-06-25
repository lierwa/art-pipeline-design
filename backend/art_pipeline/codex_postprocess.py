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
) -> dict[str, str | bool]:
    if not raw_file.exists():
        raise RuntimeError("Codex CLI did not create codex_raw.png.")
    with Image.open(raw_file) as image:
        image.load()
        raw_rgba = image.convert("RGBA")
    with Image.open(reference_file) as reference:
        reference.load()
        target_size = reference.size

    transparent = _remove_chroma_key(raw_rgba, chroma_key)
    if transparent.size != target_size:
        transparent = _fit_to_semantic_canvas(transparent, target_size)

    # WHY: Codex 现在只负责生成 RGB 内容；透明、尺寸与 mask 语义必须由本地确定性代码完成。
    # 这里先写 job-local candidate，避免失败候选图在 QA 前覆盖上一版可用 canonical final。
    candidate_file.parent.mkdir(parents=True, exist_ok=True)
    transparent.save(candidate_file, format="PNG")
    return {
        "referenceSha256": _sha256_file(reference_file),
        "rawOutputSha256": _sha256_file(raw_file),
        "outputSha256": _sha256_file(candidate_file),
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


def _fit_to_semantic_canvas(
    image: Image.Image,
    size: tuple[int, int],
) -> Image.Image:
    source_bbox = image.getchannel("A").getbbox()
    cropped = image.crop(source_bbox) if source_bbox else image.copy()
    fitted = cropped.copy()
    fitted.thumbnail(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    left = max((size[0] - fitted.width) // 2, 0)
    top = max((size[1] - fitted.height) // 2, 0)
    # WHY: 语义补全需要能长回缺失边角；这里只约束到元素 canvas，避免旧 SAM2 alpha bbox 把补全再次裁掉。
    canvas.alpha_composite(fitted, (left, top))
    return canvas


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
