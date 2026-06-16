from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

from art_pipeline.elements import ElementRecord, validate_element_id


def element_output_dir(
    workspace_root: Path,
    element_id: str,
    create: bool = False,
) -> Path:
    validate_element_id(element_id)
    workspace_path = Path(workspace_root).resolve()
    elements_dir = (workspace_path / "elements").resolve()
    output_dir = (elements_dir / element_id).resolve()
    try:
        output_dir.relative_to(elements_dir)
    except ValueError as exc:
        raise ValueError(
            f"Element output path for {element_id!r} must stay inside workspace elements."
        ) from exc

    if create:
        output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir


def element_relative_path(
    workspace_root: Path,
    element_id: str,
    filename: str,
) -> str:
    workspace_path = Path(workspace_root).resolve()
    output_path = element_output_dir(workspace_path, element_id) / filename
    return str(output_path.relative_to(workspace_path).as_posix())


def extraction_relative_paths(element_id: str) -> dict[str, str]:
    validate_element_id(element_id)
    base = f"elements/{element_id}"
    return {
        "maskPath": f"{base}/mask.png",
        "assetPath": f"{base}/asset_incomplete.png",
        "metadataPath": f"{base}/extraction.json",
        "sourceCropPath": f"{base}/source_crop.png",
    }


def write_mask_output(
    workspace_root: Path,
    element: ElementRecord,
    mask: Image.Image,
) -> str:
    output_dir = element_output_dir(workspace_root, element.id, create=True)
    mask_path = element_relative_path(workspace_root, element.id, "mask.png")
    mask.save(output_dir / "mask.png", format="PNG")
    return mask_path


def write_extraction_outputs(
    workspace_root: Path,
    element: ElementRecord,
    strategy: str,
    mask: Image.Image,
    asset: Image.Image,
    source_crop: Image.Image,
) -> dict:
    paths = extraction_relative_paths(element.id)
    output_dir = element_output_dir(workspace_root, element.id, create=True)

    write_mask_output(workspace_root, element, mask)
    asset.save(output_dir / "asset_incomplete.png", format="PNG")
    source_crop.save(output_dir / "source_crop.png", format="PNG")

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
    (output_dir / "extraction.json").write_text(
        json.dumps(metadata, indent=2),
        encoding="utf-8",
    )
    return {
        **metadata,
        "metadataPath": paths["metadataPath"],
    }


def clear_extraction_outputs(workspace_root: Path, element_id: str) -> None:
    output_dir = element_output_dir(workspace_root, element_id)
    for filename in (
        "mask.png",
        "asset_incomplete.png",
        "extraction.json",
        "source_crop.png",
    ):
        path = output_dir / filename
        if path.exists():
            path.unlink()


def clear_stale_asset_outputs(workspace_root: Path, element_id: str) -> None:
    output_dir = element_output_dir(workspace_root, element_id)
    for filename in (
        "asset_incomplete.png",
        "extraction.json",
        "source_crop.png",
    ):
        path = output_dir / filename
        if path.exists():
            path.unlink()
