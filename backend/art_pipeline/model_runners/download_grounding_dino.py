from __future__ import annotations

import os

from art_pipeline.model_runners.grounding_dino import (
    AutoModelForZeroShotObjectDetection,
    AutoProcessor,
    GroundingDinoProvider,
)


GROUNDING_DINO_MODEL_ENV = "ART_PIPELINE_GROUNDING_DINO_MODEL"


def download_model(model_id: str | None = None) -> str:
    selected_model_id = (
        model_id
        or os.getenv(GROUNDING_DINO_MODEL_ENV, "").strip()
        or GroundingDinoProvider.default_model_id
    )
    AutoProcessor.from_pretrained(selected_model_id)
    AutoModelForZeroShotObjectDetection.from_pretrained(selected_model_id)
    return selected_model_id


def main() -> None:
    model_id = download_model()
    print(f"Downloaded GroundingDINO model: {model_id}")


if __name__ == "__main__":
    main()
