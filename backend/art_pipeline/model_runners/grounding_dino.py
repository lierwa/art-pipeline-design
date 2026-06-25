from __future__ import annotations

import inspect
import math
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

try:
    import torch
    from PIL import Image
    from transformers import AutoModelForZeroShotObjectDetection, AutoProcessor
except ImportError as exc:  # pragma: no cover - exercised through API config tests.
    raise ImportError(
        "Grounding DINO dependencies are not installed. "
        "Install the backend with the optional 'model' extra."
    ) from exc


class GroundingDinoProvider:
    name = "grounding_dino"
    default_model_id = "IDEA-Research/grounding-dino-tiny"

    def __init__(
        self,
        model_id: str = default_model_id,
        box_threshold: float = 0.35,
        text_threshold: float = 0.25,
        stream_chunk_size: int = 6,
        stream_max_workers: int = 2,
    ) -> None:
        self.model_id = model_id
        self.box_threshold = box_threshold
        self.text_threshold = text_threshold
        self.stream_chunk_size = max(1, stream_chunk_size)
        self.stream_max_workers = max(1, stream_max_workers)
        self.device = "mps" if torch.backends.mps.is_available() else "cpu"
        self.processor = AutoProcessor.from_pretrained(model_id)
        self.model = AutoModelForZeroShotObjectDetection.from_pretrained(model_id).to(
            self.device
        )

    def detect(
        self,
        image: Image.Image,
        vocabulary: list[str],
        prompt: str,
    ) -> list[dict[str, Any]]:
        return self._detect_once(image, vocabulary)

    def stream_detect(
        self,
        image: Image.Image,
        vocabulary: list[str],
        prompt: str,
    ):
        chunks = list(_chunk_vocabulary(vocabulary, self.stream_chunk_size))
        if self.stream_max_workers <= 1 or len(chunks) <= 1:
            for chunk in chunks:
                yield from self._detect_once(image, chunk)
            return

        worker_count = min(self.stream_max_workers, len(chunks))
        with ThreadPoolExecutor(max_workers=worker_count) as executor:
            futures = [executor.submit(self._detect_once, image, chunk) for chunk in chunks]
            for future in as_completed(futures):
                yield from future.result()

    def _detect_once(
        self,
        image: Image.Image,
        vocabulary: list[str],
    ) -> list[dict[str, Any]]:
        text = _grounding_dino_prompt(vocabulary)
        inputs = self.processor(
            images=image.convert("RGB"),
            text=text,
            return_tensors="pt",
        ).to(self.device)
        with torch.no_grad():
            outputs = self.model(**inputs)

        target_sizes = torch.tensor([image.size[::-1]], device=self.device)
        threshold_kwargs = _grounding_dino_threshold_kwargs(
            self.processor.post_process_grounded_object_detection,
            self.box_threshold,
        )
        processed = self.processor.post_process_grounded_object_detection(
            outputs,
            inputs.input_ids,
            **threshold_kwargs,
            text_threshold=self.text_threshold,
            target_sizes=target_sizes,
        )[0]

        results: list[dict[str, Any]] = []
        for score, label, box in zip(
            processed["scores"],
            processed["labels"],
            processed["boxes"],
        ):
            x1, y1, x2, y2 = [float(value) for value in box.tolist()]
            bbox = _clamped_bbox(x1, y1, x2, y2, image.width, image.height)
            if bbox is None:
                continue
            normalized_label = str(label).strip().lower()
            results.append(
                {
                    "label": normalized_label,
                    "confidence": round(float(score), 4),
                    "bbox": bbox,
                    "sourcePrompt": normalized_label,
                }
            )
        return results


def _grounding_dino_prompt(vocabulary: list[str]) -> str:
    labels = [label.strip() for label in vocabulary if label.strip()]
    if not labels:
        raise ValueError("Grounding DINO vocabulary must not be empty.")
    return ". ".join(labels) + "."


def _chunk_vocabulary(vocabulary: list[str], chunk_size: int):
    labels = [label for label in vocabulary if label.strip()]
    for index in range(0, len(labels), chunk_size):
        yield labels[index:index + chunk_size]


def _grounding_dino_threshold_kwargs(post_process, threshold: float) -> dict[str, float]:
    parameters = inspect.signature(post_process).parameters
    if "box_threshold" in parameters:
        return {"box_threshold": threshold}
    return {"threshold": threshold}


def _clamped_bbox(
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    image_width: int,
    image_height: int,
) -> dict[str, int] | None:
    if not all(math.isfinite(value) for value in (x1, y1, x2, y2)):
        return None

    clamped_x1 = min(max(x1, 0.0), float(image_width))
    clamped_y1 = min(max(y1, 0.0), float(image_height))
    clamped_x2 = min(max(x2, 0.0), float(image_width))
    clamped_y2 = min(max(y2, 0.0), float(image_height))

    left = math.floor(clamped_x1)
    top = math.floor(clamped_y1)
    right = math.ceil(clamped_x2)
    bottom = math.ceil(clamped_y2)

    width = right - left
    height = bottom - top
    if width <= 0 or height <= 0:
        return None

    return {"x": left, "y": top, "w": width, "h": height}
