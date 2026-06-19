from __future__ import annotations

from typing import Any

import numpy as np

try:
    import torch
    from PIL import Image
    from transformers import Sam2Model, Sam2Processor
except ImportError as exc:  # pragma: no cover - exercised through API config tests.
    raise ImportError(
        "SAM2 dependencies are not installed. "
        "Install the backend with the optional 'model' extra."
    ) from exc


class TransformersSam2Provider:
    name = "sam2"
    default_model_id = "facebook/sam2.1-hiera-tiny"

    def __init__(self, model_id: str = default_model_id) -> None:
        self.model_id = model_id
        self.device = _select_device()
        self.processor = Sam2Processor.from_pretrained(model_id)
        self.model = Sam2Model.from_pretrained(model_id).to(self.device)
        self.model.eval()

    def detect(self, image: Image.Image, prompt: dict[str, Any]) -> Image.Image:
        inputs = self._build_inputs(image.convert("RGB"), prompt).to(self.device)
        with torch.no_grad():
            outputs = self.model(**inputs, multimask_output=False)

        masks = self.processor.post_process_masks(
            outputs.pred_masks.cpu(),
            inputs["original_sizes"],
        )[0]
        mask = _select_first_mask(masks)
        return _tensor_mask_to_image(mask)

    def _build_inputs(self, image: Image.Image, prompt: dict[str, Any]):
        inputs: dict[str, Any] = {
            "images": image,
            "return_tensors": "pt",
        }
        if "bbox" in prompt and prompt["bbox"]:
            inputs["input_boxes"] = [[_bbox_to_xyxy(prompt["bbox"])]]

        points = _prompt_points(prompt, image.size)
        if points:
            inputs["input_points"] = [[[point["xy"] for point in points]]]
            inputs["input_labels"] = [[[point["label"] for point in points]]]

        if "input_boxes" not in inputs and "input_points" not in inputs:
            raise ValueError("SAM2 prompt must include a bbox or point prompts.")

        return self.processor(**inputs)


def _select_device() -> str:
    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def _bbox_to_xyxy(bbox: dict[str, Any]) -> list[int]:
    x = int(bbox["x"])
    y = int(bbox["y"])
    return [
        x,
        y,
        x + int(bbox["w"]),
        y + int(bbox["h"]),
    ]


def _prompt_points(
    prompt: dict[str, Any],
    image_size: tuple[int, int] | None = None,
) -> list[dict[str, Any]]:
    points = []
    for point in prompt.get("points", []):
        label = 1 if point.get("label") == "positive" else 0
        x = int(point["x"])
        y = int(point["y"])
        if image_size is not None:
            width, height = image_size
            # WHY: extremity prompts may intentionally sit just outside a tight detector bbox;
            # clamping here keeps that recall boost compatible with SAM2 image bounds.
            x = min(max(0, x), width - 1)
            y = min(max(0, y), height - 1)
        points.append({"xy": [x, y], "label": label})
    return points


def _select_first_mask(masks):
    ndim = getattr(masks, "ndim", None)
    if ndim == 4:
        return masks[0, 0]
    if ndim == 3:
        return masks[0]
    if ndim == 2:
        return masks

    # WHY: Transformers 不同版本的 SAM/SAM2 mask 维度可能变化；这里先压缩冗余轴，
    # 但仍在下游拒绝非二维图像，兼顾版本兼容与错误可见性。
    array = np.asarray(masks.cpu().numpy() if hasattr(masks, "cpu") else masks)
    return np.squeeze(array)


def _tensor_mask_to_image(mask) -> Image.Image:
    if hasattr(mask, "detach"):
        mask = mask.detach()
    if hasattr(mask, "cpu"):
        mask = mask.cpu()

    array = np.asarray(mask.numpy() if hasattr(mask, "numpy") else mask)
    array = np.squeeze(array)
    if array.ndim != 2:
        raise ValueError("SAM2 provider returned a mask with unsupported dimensions.")

    return Image.fromarray((array > 0).astype(np.uint8) * 255, mode="L")
