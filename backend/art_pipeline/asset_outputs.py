from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

from art_pipeline.elements import ElementRecord


def extraction_relative_paths(element_id: str) -> dict[str, str]:
    base = f"elements/{element_id}"
    return {
        "maskPath": f"{base}/mask.png",
        "assetPath": f"{base}/asset_incomplete.png",
        "metadataPath": f"{base}/extraction.json",
        "sourceCropPath": f"{base}/source_crop.png",
    }


def write_extraction_outputs(
    workspace_root: Path,
    element: ElementRecord,
    strategy: str,
    mask: Image.Image,
    asset: Image.Image,
    source_crop: Image.Image,
) -> dict:
    paths = extraction_relative_paths(element.id)
    output_dir = workspace_root / "elements" / element.id
    output_dir.mkdir(parents=True, exist_ok=True)

    mask.save(workspace_root / paths["maskPath"], format="PNG")
    asset.save(workspace_root / paths["assetPath"], format="PNG")
    source_crop.save(workspace_root / paths["sourceCropPath"], format="PNG")

    metadata = {
        "elementId": element.id,
        "strategy": strategy,
        "sourcePixelsOnly": True,
        "maskPath": paths["maskPath"],
        "assetPath": paths["assetPath"],
        "sourceCropPath": paths["sourceCropPath"],
        "canvas": element.canvas.model_dump(mode="json") if element.canvas else None,
        "bbox": element.bbox.model_dump(mode="json"),
    }
    (workspace_root / paths["metadataPath"]).write_text(
        json.dumps(metadata, indent=2),
        encoding="utf-8",
    )
    return {
        **metadata,
        "metadataPath": paths["metadataPath"],
    }


def clear_extraction_outputs(workspace_root: Path, element_id: str) -> None:
    output_dir = workspace_root / "elements" / element_id
    for filename in (
        "mask.png",
        "asset_incomplete.png",
        "extraction.json",
        "source_crop.png",
    ):
        path = output_dir / filename
        if path.exists():
            path.unlink()
