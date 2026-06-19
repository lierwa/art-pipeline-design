from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol

from PIL import Image

from art_pipeline.elements import ElementRecord, WorkspaceState
from art_pipeline.export_files import resolve_workspace_path
from art_pipeline.segment_assets import sam2_edge_paths


CODEX_FINAL_STAGE = "codex_final"
CODEX_FINAL_METADATA_FILENAME = "generation.json"
CODEX_FINAL_PROVIDER = "codex_cli"


@dataclass(frozen=True)
class CodexAssetRequest:
    element_id: str
    element_name: str
    reference_image_path: Path
    source_crop_path: Path
    mask_path: Path
    image_paths: tuple[Path, ...]
    output_path: Path
    work_dir: Path
    prompt: str


class CodexAssetProvider(Protocol):
    name: str

    def generate(self, request: CodexAssetRequest) -> None:
        ...


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


def generate_codex_final_asset(
    workspace_root: Path,
    state: WorkspaceState,
    element_id: str,
    provider: CodexAssetProvider,
    prompt_override: str | None = None,
) -> tuple[WorkspaceState, ElementRecord, dict[str, Any]]:
    element = _find_element(state, element_id)
    reference_asset_path = sam2_edge_paths(element.id)["assetPath"]
    source_crop_path = sam2_edge_paths(element.id)["sourceCropPath"]
    mask_path = sam2_edge_paths(element.id)["maskPath"]
    reference_asset_file = resolve_workspace_path(workspace_root, reference_asset_path)
    source_crop_file = resolve_workspace_path(workspace_root, source_crop_path)
    mask_file = resolve_workspace_path(workspace_root, mask_path)
    if not reference_asset_file.exists():
        raise ValueError("Codex generation requires a SAM2 transparent asset.")
    if not source_crop_file.exists():
        raise ValueError("Codex generation requires a SAM2 source crop.")
    if not mask_file.exists():
        raise ValueError("Codex generation requires a SAM2 mask.")

    paths = codex_final_paths(element.id)
    final_asset_file = resolve_workspace_path(workspace_root, paths["assetPath"])
    final_source_crop_file = resolve_workspace_path(workspace_root, paths["sourceCropPath"])
    work_dir = resolve_workspace_path(workspace_root, f"elements/{element.id}/{CODEX_FINAL_STAGE}/job")
    work_dir.mkdir(parents=True, exist_ok=True)
    output_file = work_dir / "final_asset.png"
    if output_file.exists():
        # WHY: 语义补全会反复重跑问题元素；先清掉旧 job 输出，避免 CLI 未写新图时误用 stale PNG。
        output_file.unlink()
    prompt = prompt_override or _default_codex_prompt(element)

    request = CodexAssetRequest(
        element_id=element.id,
        element_name=element.name,
        reference_image_path=reference_asset_file,
        source_crop_path=source_crop_file,
        mask_path=mask_file,
        image_paths=(source_crop_file, reference_asset_file, mask_file),
        output_path=output_file,
        work_dir=work_dir,
        prompt=prompt,
    )
    provider.generate(request)
    _write_normalized_final_asset(output_file, final_asset_file, reference_asset_file)
    _copy_source_crop(source_crop_file, final_source_crop_file)

    metadata = {
        "provider": provider.name,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "referenceAssetPath": reference_asset_path,
        "sourceCropPath": source_crop_path,
        "maskPath": mask_path,
        "inputImagePaths": [source_crop_path, reference_asset_path, mask_path],
        "assetPath": paths["assetPath"],
        "prompt": prompt,
    }
    metadata_file = resolve_workspace_path(workspace_root, paths["metadataPath"])
    metadata_file.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    updated = element.model_copy(
        update={
            "status": "repair_complete",
            "repairStatus": "repair_complete",
            "exportStatus": "ready",
            "sourceProvider": provider.name,
            "sourcePrompt": prompt,
        }
    )
    next_state = WorkspaceState(
        source=state.source,
        elements=[updated if current.id == element_id else current for current in state.elements],
        detectionVocabulary=state.detectionVocabulary,
    )
    generation = {
        **paths,
        "provider": provider.name,
        "referenceAssetPath": reference_asset_path,
        "inputImagePaths": [source_crop_path, reference_asset_path, mask_path],
        "prompt": prompt,
    }
    return next_state, updated, generation


def _default_codex_prompt(element: ElementRecord) -> str:
    label = element.label or element.name
    return "\n".join(
        [
            "$imagegen",
            "Use the attached images as diagnostic context for semantic completion: source crop first, transparent cutout second, mask third.",
            "Create one production-ready transparent PNG game sticker from the subject, not a literal copy of the cutout artifacts.",
            f"Subject: {label}.",
            "The transparent cutout may be clipped, occluded, or contaminated by nearby objects.",
            "Keep the same object identity, pose, cute isometric/cartoon material style, and approximate canvas framing.",
            "Infer and complete the whole canonical subject when edges, corners, caps, legs, or bottoms are missing.",
            "If the subject touches a crop, cutout, or mask boundary, synthesize plausible hidden surfaces so the asset reads as physically complete.",
            "Prefer a complete self-contained sticker over strict copying of the damaged silhouette.",
            "Do not preserve truncated cut lines, flat sliced sides, missing caps, missing bases, or accidental holes.",
            "Remove unrelated neighboring object fragments that are not part of the subject label.",
            "Remove all cutout artifacts: no ragged alpha edge, no black speckles, no interior holes, no checkerboard, no shadow background.",
            "Output must be a clean transparent-background PNG saved exactly as final_asset.png in the current working directory.",
        ]
    )


def _write_normalized_final_asset(source_file: Path, target_file: Path, reference_file: Path) -> None:
    if not source_file.exists():
        raise RuntimeError("Codex CLI did not create final_asset.png.")
    with Image.open(source_file) as image:
        image.load()
        rgba = image.convert("RGBA")
    with Image.open(reference_file) as reference:
        reference.load()
        target_size = reference.size
    if rgba.getchannel("A").getbbox() is None:
        raise RuntimeError("Codex final asset has empty alpha.")
    if rgba.size != target_size:
        rgba = _fit_to_semantic_canvas(rgba, target_size)
    # WHY: 下游导出从 alpha 派生 mask；这里统一重写 PNG，避免 Codex 输出模式或编码差异扩散到导出层。
    target_file.parent.mkdir(parents=True, exist_ok=True)
    rgba.save(target_file, format="PNG")


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


def _copy_source_crop(source_file: Path, target_file: Path) -> None:
    with Image.open(source_file) as image:
        image.load()
        rgba = image.convert("RGBA")
    target_file.parent.mkdir(parents=True, exist_ok=True)
    rgba.save(target_file, format="PNG")


def _find_element(state: WorkspaceState, element_id: str) -> ElementRecord:
    for element in state.elements:
        if element.id == element_id:
            return element
    raise ValueError(f"Element {element_id} not found.")
