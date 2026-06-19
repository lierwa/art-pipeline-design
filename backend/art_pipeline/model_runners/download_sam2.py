from __future__ import annotations

import os

from art_pipeline.model_runners.sam2 import (
    Sam2Model,
    Sam2Processor,
    TransformersSam2Provider,
)


SAM2_MODEL_ENV = "ART_PIPELINE_SAM2_MODEL"


def download_model(model_id: str | None = None) -> str:
    selected_model_id = (
        model_id
        or os.getenv(SAM2_MODEL_ENV, "").strip()
        or TransformersSam2Provider.default_model_id
    )
    try:
        Sam2Processor.from_pretrained(selected_model_id)
    except OSError:
        # WHY: Transformers 可能会探测视觉模型并不需要的可选 chat-template 文件；
        # 若核心模型已在缓存中，下载命令应继续可用，而不是被一次可选元数据请求阻断。
        Sam2Processor.from_pretrained(selected_model_id, local_files_only=True)
    Sam2Model.from_pretrained(selected_model_id)
    return selected_model_id


def main() -> None:
    model_id = download_model()
    print(f"Downloaded SAM2 model: {model_id}")


if __name__ == "__main__":
    main()
