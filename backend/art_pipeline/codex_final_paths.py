from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from art_pipeline.elements import ElementRecord
from art_pipeline.exporting.files import resolve_workspace_path


CODEX_FINAL_STAGE = "codex_final"
CODEX_FINAL_METADATA_FILENAME = "generation.json"


def codex_final_paths(element_id: str) -> dict[str, str]:
    base = f"elements/{element_id}/{CODEX_FINAL_STAGE}"
    return {
        "sourceCropPath": f"{base}/source_crop.png",
        "assetPath": f"{base}/transparent_asset.png",
        "metadataPath": f"{base}/{CODEX_FINAL_METADATA_FILENAME}",
    }


def codex_final_asset_path(element: ElementRecord) -> str:
    return codex_final_paths(element.id)["assetPath"]


def has_codex_final_asset(workspace_root: Path, element: ElementRecord) -> bool:
    return resolve_workspace_path(workspace_root, codex_final_asset_path(element)).exists()


def read_codex_final_request_metadata(workspace_root: Path, element_id: str) -> dict[str, Any]:
    metadata_file = resolve_workspace_path(
        workspace_root,
        codex_final_paths(element_id)["metadataPath"],
    )
    if not metadata_file.exists():
        raise FileNotFoundError("Codex request metadata not found.")
    metadata = json.loads(metadata_file.read_text(encoding="utf-8"))
    if not isinstance(metadata, dict):
        raise ValueError("Codex request metadata must be an object.")
    return {
        "provider": metadata.get("provider"),
        "createdAt": metadata.get("createdAt"),
        "generationProfile": metadata.get("generationProfile"),
        "assetPath": metadata.get("assetPath"),
        "outputPath": metadata.get("outputPath"),
        "rawOutputPath": metadata.get("rawOutputPath"),
        "workDirPath": metadata.get("workDirPath"),
        "promptPath": metadata.get("promptPath"),
        "briefImagePath": metadata.get("briefImagePath"),
        "briefJsonPath": metadata.get("briefJsonPath"),
        "jobId": metadata.get("jobId"),
        "codexThreadId": metadata.get("codexThreadId"),
        "timing": metadata.get("timing"),
        "chromaKey": metadata.get("chromaKey"),
        "referenceSha256": metadata.get("referenceSha256"),
        "rawOutputSha256": metadata.get("rawOutputSha256"),
        "outputSha256": metadata.get("outputSha256"),
        "isOutputIdenticalToReference": metadata.get("isOutputIdenticalToReference"),
        "inputImagePaths": metadata.get("inputImagePaths", []),
        "inputImages": metadata.get("inputImages", []),
        "removedChildren": metadata.get("removedChildren", []),
        "promptHint": metadata.get("promptHint"),
        "prompt": metadata.get("prompt"),
    }
