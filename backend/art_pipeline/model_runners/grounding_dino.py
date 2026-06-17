from __future__ import annotations

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

    def __init__(
        self,
        model_id: str = "IDEA-Research/grounding-dino-tiny",
        box_threshold: float = 0.35,
        text_threshold: float = 0.25,
    ) -> None:
        self.model_id = model_id
        self.box_threshold = box_threshold
        self.text_threshold = text_threshold
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
        text = _grounding_dino_prompt(vocabulary)
        inputs = self.processor(
            images=image.convert("RGB"),
            text=text,
            return_tensors="pt",
        ).to(self.device)
        with torch.no_grad():
            outputs = self.model(**inputs)

        target_sizes = torch.tensor([image.size[::-1]], device=self.device)
        processed = self.processor.post_process_grounded_object_detection(
            outputs,
            inputs.input_ids,
            box_threshold=self.box_threshold,
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
            normalized_label = str(label).strip().lower()
            results.append(
                {
                    "label": normalized_label,
                    "confidence": round(float(score), 4),
                    "bbox": {
                        "x": round(x1),
                        "y": round(y1),
                        "w": round(x2 - x1),
                        "h": round(y2 - y1),
                    },
                    "sourcePrompt": normalized_label,
                }
            )
        return results


def _grounding_dino_prompt(vocabulary: list[str]) -> str:
    labels = [label.strip() for label in vocabulary if label.strip()]
    if not labels:
        raise ValueError("Grounding DINO vocabulary must not be empty.")
    return ". ".join(labels) + "."
