from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any, Protocol

from PIL import Image
from PIL import ImageChops

from art_pipeline.asset_outputs import element_output_dir
from art_pipeline.elements import CanvasBox, ElementRecord, SegmentationQuality, WorkspaceState
from art_pipeline.extraction import compose_asset_from_source, crop_source_to_canvas
from art_pipeline.mask_refine import normalize_mask, polish_mask_alpha
from art_pipeline.parent_repair_contracts import (
    create_parent_removal_repair_contract,
    parent_removal_contract_covers_children,
)
from art_pipeline.repair_tasks import clear_repair_outputs
from art_pipeline.segment_canvas import expanded_canvas_for_source_mask
from art_pipeline.segment_quality import (
    SEGMENTATION_QUALITY_FAILED_REASON,
    SEGMENTATION_QUALITY_MISSING_REASON,
    build_sam2_prompt,
    build_sam2_prompt_candidates,
    quality_metadata_for_candidate,
    quality_metadata_for_mask,
    repair_and_score_sam2_candidate,
    segmentation_quality_block_reason,
    select_best_sam2_candidate,
)


class Sam2MaskProvider(Protocol):
    def detect(self, image: Image.Image, prompt: dict[str, Any]) -> Image.Image | None:
        ...


SAM2_EDGE_STAGE = "sam2_edge"
SAM2_METADATA_FILENAME = "segmentation.json"


def suggest_sam2_edge_mask(
    workspace_root: Path,
    source_image: Image.Image,
    element: ElementRecord,
    provider: Sam2MaskProvider,
) -> tuple[ElementRecord, dict[str, Any]]:
    if not _is_segmentable(element):
        raise ValueError(f"Element {element.id} is not segmentable.")

    mask, prompt, quality, output_canvas = _detect_best_sam2_mask(source_image, element, provider)
    if mask.getbbox() is None:
        raise RuntimeError("SAM2 provider returned an empty mask.")

    output_element = element.model_copy(update={"canvas": output_canvas})
    source_crop = crop_source_to_canvas(source_image, output_element)
    asset = compose_asset_from_source(source_crop, polish_mask_alpha(mask, source_crop))
    paths = _write_sam2_edge_outputs(
        workspace_root,
        output_element,
        source_crop,
        mask,
        asset,
        prompt,
        quality,
    )
    updated = output_element.model_copy(
        update={
            "segmentationStatus": "mask_suggested",
            "segmentationQuality": SegmentationQuality.model_validate(quality),
            "mask": paths["maskPath"],
            "exportStatus": "not_ready",
        }
    )
    return updated, paths


def accept_sam2_edge_mask(
    workspace_root: Path,
    source_image: Image.Image,
    state: WorkspaceState,
    element_id: str,
) -> tuple[WorkspaceState, ElementRecord]:
    by_id = {element.id: element for element in state.elements}
    element = by_id[element_id]
    if not _has_sam2_suggestion(workspace_root, element):
        raise ValueError(f"Element {element.id} has no SAM2 mask suggestion to accept.")
    quality_block_reason = segmentation_quality_block_reason(element)
    if quality_block_reason == SEGMENTATION_QUALITY_MISSING_REASON:
        raise ValueError(f"Element {element.id} has no segmentation quality report.")
    if quality_block_reason == SEGMENTATION_QUALITY_FAILED_REASON:
        reasons = ", ".join(element.segmentationQuality.qualityReasons) if element.segmentationQuality else "unknown"
        raise ValueError(f"Element {element.id} segmentation quality failed: {reasons}.")

    accepted = element.model_copy(update={"segmentationStatus": "mask_accepted"})
    merged = [accepted if current.id == element.id else current for current in state.elements]
    next_elements = _apply_sticker_statuses(workspace_root, source_image, merged)
    next_state = WorkspaceState(
        source=state.source,
        elements=next_elements,
        detectionVocabulary=state.detectionVocabulary,
    )
    return next_state, _find_element(next_elements, element_id)


def patch_sam2_edge_mask(
    workspace_root: Path,
    source_image: Image.Image,
    element: ElementRecord,
    patch_mask: Image.Image,
    operation: str,
) -> tuple[ElementRecord, dict[str, Any]]:
    if not _is_segmentable(element):
        raise ValueError(f"Element {element.id} is not segmentable.")
    if operation not in {"replace", "add", "subtract"}:
        raise ValueError("Segment mask patch operation must be replace, add, or subtract.")

    mask = _combine_manual_patch(workspace_root, element, patch_mask, operation)
    source_crop = crop_source_to_canvas(source_image, element)
    asset = compose_asset_from_source(source_crop, polish_mask_alpha(mask))
    paths = _write_sam2_edge_outputs(
        workspace_root,
        element,
        source_crop,
        mask,
        asset,
        _build_manual_patch_prompt(element, operation),
        quality_metadata_for_mask(mask, "manual_patch", 1),
    )
    updated = element.model_copy(
        update={
            "segmentationStatus": "mask_suggested",
            "segmentationQuality": SegmentationQuality.model_validate(paths["quality"]),
            "mask": paths["maskPath"],
            "exportStatus": "not_ready",
        }
    )
    return updated, paths


def recompute_sticker_statuses(
    workspace_root: Path,
    source_image: Image.Image,
    state: WorkspaceState,
) -> WorkspaceState:
    next_elements = _apply_sticker_statuses(workspace_root, source_image, state.elements)
    return WorkspaceState(
        source=state.source,
        elements=next_elements,
        detectionVocabulary=state.detectionVocabulary,
    )


def sam2_edge_paths(element_id: str) -> dict[str, str]:
    base = f"elements/{element_id}/{SAM2_EDGE_STAGE}"
    return {
        "sourceCropPath": f"{base}/source_crop.png",
        "maskPath": f"{base}/mask.png",
        "assetPath": f"{base}/transparent_asset.png",
        "metadataPath": f"{base}/{SAM2_METADATA_FILENAME}",
    }


def sam2_edge_asset_path(element: ElementRecord) -> str:
    return sam2_edge_paths(element.id)["assetPath"]


def has_sam2_edge_asset(workspace_root: Path, element: ElementRecord) -> bool:
    return _workspace_file(workspace_root, sam2_edge_asset_path(element)).exists()


def _apply_sticker_statuses(
    workspace_root: Path,
    source_image: Image.Image,
    elements: list[ElementRecord],
) -> list[ElementRecord]:
    by_id = {element.id: element for element in elements}
    removable_children = _removed_children_by_parent(elements)
    accepted_removed_children = _accepted_removed_children(elements)
    updated: list[ElementRecord] = []

    for element in elements:
        if element.segmentationStatus != "mask_accepted":
            updated.append(element)
            continue

        role = element.assetRole
        if role in {"sticker", "removable_child"}:
            updated.append(
                element.model_copy(
                    update={
                        "repairStatus": "not_required",
                        "exportStatus": "ready",
                    }
                )
            )
            continue

        if role == "embedded_keep":
            updated.append(
                element.model_copy(
                    update={
                        "repairStatus": "not_required",
                        "exportStatus": "blocked",
                    }
                )
            )
            continue

        if role == "skip":
            updated.append(
                element.model_copy(
                    update={
                        "repairStatus": "not_required",
                        "exportStatus": "blocked",
                    }
                )
            )
            continue

        if role == "parent":
            all_children = [
                by_id[child_id]
                for child_id in removable_children.get(element.id, [])
                if child_id in by_id
            ]
            children = [
                by_id[child_id]
                for child_id in accepted_removed_children.get(element.id, [])
                if child_id in by_id
            ]
            if not all_children:
                if element.repairStatus != "not_required" or element.mode != "visible_only":
                    # WHY: removable_child 关系被撤销后，旧 repair 包已经不再代表当前父图；
                    # 这里回收为普通 SAM2 贴纸，避免导出层继续按 needs_completion 路径拦截。
                    clear_repair_outputs(workspace_root, element.id)
                updated.append(
                    element.model_copy(
                        update={
                            "status": "accepted",
                            "mode": "visible_only",
                            "repairStatus": "not_required",
                            "exportStatus": "ready",
                        }
                    )
                )
                continue
            if len(children) != len(all_children):
                if element.repairStatus != "required" or element.mode != "visible_only":
                    # WHY: 父物体的补全必须基于已验收的 removable child mask；
                    # 手工编辑后的 suggested mask 不能继续授权旧 repair 输出。
                    clear_repair_outputs(workspace_root, element.id)
                updated.append(
                    element.model_copy(
                        update={
                            "status": "accepted",
                            "mode": "visible_only",
                            "repairStatus": "required",
                            "exportStatus": "blocked",
                        }
                    )
                )
                continue
            if (
                element.repairStatus == "repair_complete"
                and parent_removal_contract_covers_children(workspace_root, element, children)
            ):
                updated.append(element.model_copy(update={"exportStatus": "ready"}))
                continue

            # WHY: removable_child 表示父图上要真实擦除并补全的像素；
            # embedded_keep 只是父图内部保留的装饰/子结构，混在同一个 mask 会把“要修复”和“要保护”
            # 的语义冲掉，所以父物体分支只消费 removable_child 的 accepted mask。
            create_parent_removal_repair_contract(
                workspace_root,
                source_image,
                element,
                children,
            )
            updated.append(
                element.model_copy(
                    update={
                        "status": "repair_pending",
                        "mode": "needs_completion",
                        "repairStatus": "task_created",
                        "exportStatus": "blocked",
                    }
                )
            )
            continue

        updated.append(element)

    return updated


def _removed_children_by_parent(elements: list[ElementRecord]) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    for element in elements:
        if element.assetRole == "removable_child" and element.removeFromParent:
            result.setdefault(element.removeFromParent, []).append(element.id)
    return result


def _accepted_removed_children(elements: list[ElementRecord]) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    for element in elements:
        if (
            element.assetRole == "removable_child"
            and element.removeFromParent
            and element.segmentationStatus == "mask_accepted"
        ):
            result.setdefault(element.removeFromParent, []).append(element.id)
    return result


def _is_segmentable(element: ElementRecord) -> bool:
    return (
        element.status in {"accepted", "extract_ready", "extracted", "repair_pending", "repair_complete"}
        and element.mode != "rejected"
        and element.assetRole != "skip"
        and element.visible
    )


def _has_sam2_suggestion(workspace_root: Path, element: ElementRecord) -> bool:
    paths = sam2_edge_paths(element.id)
    return (
        element.segmentationStatus == "mask_suggested"
        and element.mask == paths["maskPath"]
        and _workspace_file(workspace_root, paths["maskPath"]).exists()
        and _workspace_file(workspace_root, paths["assetPath"]).exists()
    )


def _detect_best_sam2_mask(
    source_image: Image.Image,
    element: ElementRecord,
    provider: Sam2MaskProvider,
) -> tuple[Image.Image, dict[str, Any], dict[str, Any], CanvasBox]:
    candidates = []

    for prompt in build_sam2_prompt_candidates(element, SAM2_EDGE_STAGE):
        raw_mask = provider.detect(source_image, prompt)
        if raw_mask is None:
            continue
        mask, output_canvas = _mask_to_canvas(source_image, element, raw_mask)
        candidate_prompt = {
            **prompt,
            "canvas": output_canvas.model_dump(mode="json"),
        }
        candidates.append(
            repair_and_score_sam2_candidate(
                element.id,
                candidate_prompt,
                mask,
            )
        )

    if not candidates:
        raise RuntimeError("SAM2 provider did not return a mask.")

    selected = select_best_sam2_candidate(candidates)
    return (
        selected.mask,
        selected.prompt,
        quality_metadata_for_candidate(selected, len(candidates)),
        CanvasBox.model_validate(selected.prompt["canvas"]),
    )


def _build_manual_patch_prompt(element: ElementRecord, operation: str) -> dict[str, Any]:
    return {
        **build_sam2_prompt(element, SAM2_EDGE_STAGE),
        "manualEdit": {
            "operation": operation,
            "source": "human_mask_patch",
        },
    }


def _combine_manual_patch(
    workspace_root: Path,
    element: ElementRecord,
    patch_mask: Image.Image,
    operation: str,
) -> Image.Image:
    if element.canvas is None:
        raise ValueError(f"Element {element.id} canvas is required for segmentation.")

    patch = normalize_mask(element.id, patch_mask, (element.canvas.w, element.canvas.h))
    if operation == "replace":
        return patch

    current_path = _workspace_file(workspace_root, sam2_edge_paths(element.id)["maskPath"])
    if not current_path.exists():
        raise ValueError(f"Element {element.id} has no SAM2 mask suggestion to edit.")
    with Image.open(current_path) as current_file:
        current = normalize_mask(
            element.id,
            current_file.copy(),
            (element.canvas.w, element.canvas.h),
        )

    if operation == "add":
        return normalize_mask(element.id, ImageChops.lighter(current, patch), current.size)

    # WHY: 橡皮只在当前建议 mask 内做扣减，保留 SAM2/人工已有结果作为单一编辑基线。
    inverted_patch = ImageChops.invert(patch)
    return normalize_mask(element.id, ImageChops.multiply(current, inverted_patch), current.size)


def _mask_to_canvas(
    source_image: Image.Image,
    element: ElementRecord,
    raw_mask: Image.Image,
) -> tuple[Image.Image, CanvasBox]:
    if element.canvas is None:
        raise ValueError(f"Element {element.id} canvas is required for segmentation.")

    mask = raw_mask.convert("L").point(lambda value: 255 if value > 0 else 0)
    output_canvas = element.canvas
    canvas_size = (output_canvas.w, output_canvas.h)
    if mask.size == canvas_size:
        return normalize_mask(element.id, mask, canvas_size), output_canvas
    if mask.size == source_image.size:
        output_canvas = expanded_canvas_for_source_mask(source_image, element, mask)
        cropped = mask.crop(
            (
                output_canvas.x,
                output_canvas.y,
                output_canvas.x + output_canvas.w,
                output_canvas.y + output_canvas.h,
            )
        )
        return normalize_mask(element.id, cropped, (output_canvas.w, output_canvas.h)), output_canvas
    raise ValueError(
        f"SAM2 mask for element {element.id} must match source or canvas dimensions."
    )


def _write_sam2_edge_outputs(
    workspace_root: Path,
    element: ElementRecord,
    source_crop: Image.Image,
    mask: Image.Image,
    asset: Image.Image,
    prompt: dict[str, Any],
    quality: dict[str, Any],
) -> dict[str, Any]:
    paths = sam2_edge_paths(element.id)
    element_dir = element_output_dir(workspace_root, element.id, create=True)
    output_dir = (element_dir / SAM2_EDGE_STAGE).resolve()
    try:
        output_dir.relative_to(element_dir.resolve())
    except ValueError as exc:
        raise ValueError("SAM2 output path must stay inside the element directory.") from exc
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    source_crop.save(output_dir / "source_crop.png", format="PNG")
    mask.save(output_dir / "mask.png", format="PNG")
    asset.save(output_dir / "transparent_asset.png", format="PNG")
    metadata = {
        "elementId": element.id,
        "stage": SAM2_EDGE_STAGE,
        "sourcePixelsOnly": True,
        "paths": paths,
        "prompt": prompt,
        "quality": quality,
    }
    (output_dir / SAM2_METADATA_FILENAME).write_text(
        json.dumps(metadata, indent=2),
        encoding="utf-8",
    )
    return {
        **paths,
        "stage": SAM2_EDGE_STAGE,
        "quality": quality,
    }


def _workspace_file(workspace_root: Path, relative_path: str) -> Path:
    workspace_path = Path(workspace_root).resolve()
    resolved = (workspace_path / relative_path).resolve()
    try:
        resolved.relative_to(workspace_path)
    except ValueError as exc:
        raise ValueError("Workspace artifact path must stay inside workspace root.") from exc
    return resolved


def _find_element(elements: list[ElementRecord], element_id: str) -> ElementRecord:
    for element in elements:
        if element.id == element_id:
            return element
    raise ValueError(f"Element {element_id} not found.")
