from __future__ import annotations

import os
from typing import Any, Callable, Protocol

from fastapi import FastAPI, HTTPException
from PIL import Image

from art_pipeline.codex_assets import CodexAssetProvider
from art_pipeline.detection import (
    DetectionProvider,
    DetectionProviderNotConfigured,
)
from art_pipeline.model_runners.codex_cli import CodexCliAssetProvider

DETECTION_PROVIDER_ENV = "ART_PIPELINE_DETECTION_PROVIDER"
GROUNDING_DINO_MODEL_ENV = "ART_PIPELINE_GROUNDING_DINO_MODEL"
GROUNDING_DINO_STREAM_CHUNK_SIZE_ENV = "ART_PIPELINE_DETECTION_STREAM_CHUNK_SIZE"
GROUNDING_DINO_STREAM_WORKERS_ENV = "ART_PIPELINE_DETECTION_STREAM_WORKERS"
SAM2_PROVIDER_ENV = "ART_PIPELINE_SAM2_PROVIDER"
SAM2_MODEL_ENV = "ART_PIPELINE_SAM2_MODEL"
CODEX_PROVIDER_ENV = "ART_PIPELINE_CODEX_PROVIDER"
CODEX_BIN_ENV = "ART_PIPELINE_CODEX_BIN"
CODEX_TIMEOUT_ENV = "ART_PIPELINE_CODEX_TIMEOUT_SECONDS"
CODEX_SANDBOX_ENV = "ART_PIPELINE_CODEX_SANDBOX"


class Sam2ClickProvider(Protocol):
    name: str

    def detect(
        self,
        image: Image.Image,
        prompt: dict[str, Any],
    ) -> Image.Image:
        raise NotImplementedError


def get_detection_provider(app: FastAPI) -> DetectionProvider | None:
    provider = app.state.detection_provider
    if provider is not None:
        return provider

    provider_factory = app.state.detection_provider_factory
    if provider_factory is None:
        return None

    try:
        provider = provider_factory()
    except DetectionProviderNotConfigured as exc:
        app.state.detection_provider_config_error = str(exc)
        return None

    app.state.detection_provider = provider
    app.state.detection_provider_config_error = None
    return provider


def get_sam2_provider(app: FastAPI) -> Sam2ClickProvider | None:
    provider = app.state.sam2_provider
    if provider is not None:
        return provider

    provider_factory = app.state.sam2_provider_factory
    if provider_factory is None:
        return None

    try:
        provider = provider_factory()
    except DetectionProviderNotConfigured as exc:
        app.state.sam2_provider_config_error = str(exc)
        return None

    app.state.sam2_provider = provider
    app.state.sam2_provider_config_error = None
    return provider


def detection_filter_vocabulary(vocabulary: list[str]) -> list[str]:
    labels = list(vocabulary)
    # WHY: Grounding DINO 等开源检测模型常把 "bathroom cabinet" 回传成 "cabinet"；
    # 仅当当前词表包含原始短语时追加别名，避免自定义词表被默认别名放宽。
    if "bathroom cabinet" in labels and "cabinet" not in labels:
        labels.append("cabinet")
    return labels


def detection_provider_factory_from_env() -> Callable[[], DetectionProvider] | None:
    raw_provider_name = os.getenv(DETECTION_PROVIDER_ENV)
    # WHY: 本 demo 的默认体验必须能直接 Run Detection；空 env 常来自本机 shell/.env 残留，
    # 这里按“未配置”处理为 demo，只有测试显式注入 None 才禁用 provider。
    provider_name = (raw_provider_name.strip().lower() if raw_provider_name is not None else "demo") or "demo"

    if provider_name == "demo":
        return create_demo_provider

    if provider_name != "grounding_dino":
        raise DetectionProviderNotConfigured(
            f"Unsupported detection provider {provider_name!r}. "
            f"Set {DETECTION_PROVIDER_ENV}=demo or {DETECTION_PROVIDER_ENV}=grounding_dino."
        )

    model_id = os.getenv(GROUNDING_DINO_MODEL_ENV, "").strip()
    return lambda: create_grounding_dino_provider(model_id or None)


def sam2_provider_factory_from_env() -> Callable[[], Sam2ClickProvider] | None:
    provider_name = os.getenv(SAM2_PROVIDER_ENV, "").strip().lower()
    if not provider_name:
        return None

    if provider_name not in {"transformers", "sam2", "hf"}:
        raise DetectionProviderNotConfigured(
            f"Unsupported SAM2 provider {provider_name!r}. "
            f"Set {SAM2_PROVIDER_ENV}=transformers."
        )

    model_id = os.getenv(SAM2_MODEL_ENV, "").strip()
    return lambda: create_transformers_sam2_provider(model_id or None)


def get_codex_asset_provider(app: FastAPI) -> CodexAssetProvider:
    provider = app.state.codex_asset_provider
    if provider is not None:
        return provider

    try:
        provider = codex_asset_provider_from_env()
    except DetectionProviderNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    app.state.codex_asset_provider = provider
    return provider


def codex_asset_provider_from_env() -> CodexAssetProvider:
    provider_name = os.getenv(CODEX_PROVIDER_ENV, "cli").strip().lower()
    if provider_name not in {"cli", "codex_cli"}:
        raise DetectionProviderNotConfigured(
            f"Unsupported Codex asset provider {provider_name!r}. "
            f"Set {CODEX_PROVIDER_ENV}=cli."
        )

    timeout_raw = os.getenv(CODEX_TIMEOUT_ENV, "900").strip()
    try:
        timeout_seconds = int(timeout_raw)
    except ValueError as exc:
        raise DetectionProviderNotConfigured(
            f"{CODEX_TIMEOUT_ENV} must be an integer number of seconds."
        ) from exc
    if timeout_seconds <= 0:
        raise DetectionProviderNotConfigured(
            f"{CODEX_TIMEOUT_ENV} must be greater than zero."
        )

    codex_bin = os.getenv(CODEX_BIN_ENV, "").strip() or None
    sandbox = os.getenv(CODEX_SANDBOX_ENV, "").strip() or None
    return CodexCliAssetProvider(
        codex_bin=codex_bin,
        timeout_seconds=timeout_seconds,
        sandbox=sandbox,
    )


def create_demo_provider() -> DetectionProvider:
    from art_pipeline.model_runners.demo import DemoDetectionProvider

    return DemoDetectionProvider()


def create_grounding_dino_provider(model_id: str | None = None) -> DetectionProvider:
    try:
        from art_pipeline.model_runners.grounding_dino import GroundingDinoProvider
    except ImportError as exc:
        raise DetectionProviderNotConfigured(str(exc)) from exc

    try:
        kwargs = {
            "stream_chunk_size": _positive_int_env(GROUNDING_DINO_STREAM_CHUNK_SIZE_ENV, 6),
            "stream_max_workers": _positive_int_env(GROUNDING_DINO_STREAM_WORKERS_ENV, 2),
        }
        if model_id:
            return GroundingDinoProvider(model_id=model_id, **kwargs)
        return GroundingDinoProvider(**kwargs)
    except Exception as exc:
        raise DetectionProviderNotConfigured(
            f"Detection provider 'grounding_dino' could not be initialized: {exc}"
        ) from exc


def create_transformers_sam2_provider(model_id: str | None = None) -> Sam2ClickProvider:
    try:
        from art_pipeline.model_runners.sam2 import TransformersSam2Provider
    except ImportError as exc:
        raise DetectionProviderNotConfigured(str(exc)) from exc

    try:
        if model_id:
            return TransformersSam2Provider(model_id=model_id)
        return TransformersSam2Provider()
    except Exception as exc:
        raise DetectionProviderNotConfigured(
            f"SAM2 provider 'transformers' could not be initialized: {exc}"
        ) from exc


def _positive_int_env(name: str, default: int) -> int:
    raw_value = os.getenv(name, "").strip()
    if not raw_value:
        return default
    try:
        value = int(raw_value)
    except ValueError as exc:
        raise DetectionProviderNotConfigured(f"{name} must be a positive integer.") from exc
    if value <= 0:
        raise DetectionProviderNotConfigured(f"{name} must be a positive integer.")
    return value
