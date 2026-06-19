from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

from art_pipeline.asset_outputs import element_output_dir
from art_pipeline.elements import ElementRecord
from art_pipeline.mask_refine import normalize_mask
from art_pipeline.repair_tasks import (
    PARENT_REMOVAL_CONTRACT_FILENAME,
    build_repair_prompt,
    create_guide_overlay,
    create_scene_context,
    repair_output_dir,
    repair_relative_path,
    fingerprint_image,
    write_repair_authority,
)


def create_parent_removal_repair_contract(
    workspace_root: Path,
    source_image: Image.Image,
    parent: ElementRecord,
    removed_children: list[ElementRecord],
) -> dict[str, str]:
    if parent.assetRole != "parent":
        raise ValueError(f"Element {parent.id} must be a parent for removal repair.")
    if not removed_children:
        raise ValueError(f"Parent {parent.id} needs at least one removed child.")

    source_crop = _load_segment_source_crop(workspace_root, parent)
    parent_asset = _load_segment_asset(workspace_root, parent)
    parent_mask = _load_segment_mask(workspace_root, parent, parent_asset.size)
    remove_mask = _compose_parent_remove_mask(workspace_root, parent, removed_children)
    preserve_mask = _create_parent_preserve_mask(parent_mask, remove_mask)

    incomplete_asset = parent_asset.copy()
    incomplete_asset.putalpha(preserve_mask)
    context_crop = create_scene_context(source_image, parent)
    guide_overlay = create_guide_overlay(incomplete_asset, remove_mask)

    element_dir = element_output_dir(workspace_root, parent.id, create=True)
    repair_dir = repair_output_dir(workspace_root, parent.id, create=True)
    for stale_filename in (
        "completed_asset.png",
        "repair_report.json",
        "qa_report.json",
        "changed_pixels_overlay.png",
    ):
        stale_path = repair_dir / stale_filename
        if stale_path.exists():
            stale_path.unlink()

    source_crop.save(repair_dir / "source_crop.png", format="PNG")
    context_crop.save(repair_dir / "scene_context.png", format="PNG")
    context_crop.save(repair_dir / "context_crop.png", format="PNG")
    incomplete_asset.save(repair_dir / "incomplete_asset.png", format="PNG")
    preserve_mask.save(repair_dir / "preserve_mask.png", format="PNG")
    remove_mask.save(repair_dir / "missing_mask.png", format="PNG")
    remove_mask.save(repair_dir / "remove_mask.png", format="PNG")
    guide_overlay.save(repair_dir / "guide_overlay.png", format="PNG")
    source_crop.save(element_dir / "source_crop.png", format="PNG")
    incomplete_asset.save(element_dir / "asset_incomplete.png", format="PNG")
    remove_mask.save(element_dir / "missing_mask.png", format="PNG")
    (repair_dir / "repair_prompt.md").write_text(
        _build_parent_removal_repair_prompt(parent, removed_children),
        encoding="utf-8",
    )
    write_repair_authority(
        workspace_root,
        parent,
        incomplete_asset,
        remove_mask,
        preserve_mask,
    )
    _write_parent_removal_contract(workspace_root, repair_dir, parent, removed_children)

    return {
        "sourceCropPath": repair_relative_path(parent.id, "source_crop.png"),
        "contextCropPath": repair_relative_path(parent.id, "context_crop.png"),
        "incompleteAssetPath": repair_relative_path(parent.id, "incomplete_asset.png"),
        "removeMaskPath": repair_relative_path(parent.id, "remove_mask.png"),
        "preserveMaskPath": repair_relative_path(parent.id, "preserve_mask.png"),
        "repairPromptPath": repair_relative_path(parent.id, "repair_prompt.md"),
        "repairContractPath": repair_relative_path(parent.id, PARENT_REMOVAL_CONTRACT_FILENAME),
    }


def parent_removal_contract_covers_children(
    workspace_root: Path,
    parent: ElementRecord,
    removed_children: list[ElementRecord],
) -> bool:
    contract_path = repair_output_dir(workspace_root, parent.id) / PARENT_REMOVAL_CONTRACT_FILENAME
    if not contract_path.exists():
        return False
    try:
        payload = json.loads(contract_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return False
    if not isinstance(payload, dict):
        return False

    contract_children = payload.get("removedChildren")
    if not isinstance(contract_children, list):
        return False

    current_children = _parent_removal_child_inputs(workspace_root, parent, removed_children)
    return contract_children == current_children


def _build_parent_removal_repair_prompt(
    parent: ElementRecord,
    removed_children: list[ElementRecord],
) -> str:
    child_names = ", ".join(child.name for child in removed_children)
    base_prompt = build_repair_prompt(parent)
    return "\n".join(
        [
            base_prompt.rstrip(),
            "",
            "Parent removal context:",
            f"- Remove child sticker pixels from: {child_names}.",
            "- Fill only the pixels marked by remove_mask.png.",
            "",
        ]
    )


def _write_parent_removal_contract(
    workspace_root: Path,
    repair_dir: Path,
    parent: ElementRecord,
    removed_children: list[ElementRecord],
) -> None:
    child_inputs = _parent_removal_child_inputs(workspace_root, parent, removed_children)
    contract = {
        "version": 1,
        "kind": "parent_removal_repair",
        "parentElementId": parent.id,
        "removedChildElementIds": [child.id for child in removed_children],
        "removedChildren": child_inputs,
        "inputs": {
            "sourceCrop": "source_crop.png",
            "incompleteAsset": "incomplete_asset.png",
            "removeMask": "remove_mask.png",
            "preserveMask": "preserve_mask.png",
            "contextCrop": "context_crop.png",
            "prompt": "repair_prompt.md",
        },
        "outputs": {
            "completedAsset": "completed_asset.png",
            "repairReport": "repair_report.json",
        },
    }
    (repair_dir / PARENT_REMOVAL_CONTRACT_FILENAME).write_text(
        json.dumps(contract, indent=2),
        encoding="utf-8",
    )


def _parent_removal_child_inputs(
    workspace_root: Path,
    parent: ElementRecord,
    removed_children: list[ElementRecord],
) -> list[dict[str, object]]:
    result: list[dict[str, object]] = []
    for child in sorted(removed_children, key=lambda candidate: candidate.id):
        if child.canvas is None:
            raise ValueError(f"Removed child {child.id} canvas is required for repair.")
        mask = _load_segment_mask(
            workspace_root,
            child,
            (child.canvas.w, child.canvas.h),
        )
        result.append(
            {
                "elementId": child.id,
                "canvas": child.canvas.model_dump(mode="json"),
                # WHY: parent repair 的擦除区域由 child mask+canvas 决定；id 不变但 mask 重算时必须让旧修复失效。
                "mask": fingerprint_image(mask.convert("L")),
            }
        )
    return result


def _load_segment_source_crop(workspace_root: Path, element: ElementRecord) -> Image.Image:
    crop_path = element_output_dir(workspace_root, element.id) / "sam2_edge" / "source_crop.png"
    if crop_path.exists():
        with Image.open(crop_path) as crop:
            crop.load()
            return crop.convert("RGBA")
    raise ValueError(f"Element {element.id} needs a SAM2 source crop before repair.")


def _load_segment_asset(workspace_root: Path, element: ElementRecord) -> Image.Image:
    asset_path = element_output_dir(workspace_root, element.id) / "sam2_edge" / "transparent_asset.png"
    if asset_path.exists():
        with Image.open(asset_path) as asset:
            asset.load()
            return asset.convert("RGBA")
    raise ValueError(f"Element {element.id} needs a SAM2 transparent asset before repair.")


def _load_segment_mask(
    workspace_root: Path,
    element: ElementRecord,
    expected_size: tuple[int, int],
) -> Image.Image:
    mask_path = element_output_dir(workspace_root, element.id) / "sam2_edge" / "mask.png"
    if not mask_path.exists():
        raise ValueError(f"Element {element.id} needs a SAM2 mask before repair.")
    with Image.open(mask_path) as mask:
        mask.load()
        return normalize_mask(element.id, mask, expected_size)


def _compose_parent_remove_mask(
    workspace_root: Path,
    parent: ElementRecord,
    removed_children: list[ElementRecord],
) -> Image.Image:
    if parent.canvas is None:
        raise ValueError(f"Parent {parent.id} canvas is required for repair.")

    remove_mask = Image.new("L", (parent.canvas.w, parent.canvas.h), 0)
    for child in removed_children:
        if child.canvas is None:
            raise ValueError(f"Removed child {child.id} canvas is required for repair.")
        child_mask = _load_segment_mask(
            workspace_root,
            child,
            (child.canvas.w, child.canvas.h),
        )
        offset = (child.canvas.x - parent.canvas.x, child.canvas.y - parent.canvas.y)
        remove_mask.paste(child_mask, offset, child_mask)
    return remove_mask.point(lambda value: 255 if value > 0 else 0)


def _create_parent_preserve_mask(parent_mask: Image.Image, remove_mask: Image.Image) -> Image.Image:
    parent_alpha = parent_mask.convert("L").point(lambda value: 255 if value > 0 else 0)
    removal = remove_mask.convert("L").point(lambda value: 255 if value > 0 else 0)
    preserve = Image.new("L", parent_alpha.size, 0)
    preserve.putdata(
        [
            255 if parent_value > 0 and remove_value == 0 else 0
            for parent_value, remove_value in zip(parent_alpha.getdata(), removal.getdata())
        ]
    )
    return preserve
