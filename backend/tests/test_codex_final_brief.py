from __future__ import annotations

import json
from pathlib import Path

import pytest
from PIL import Image

from art_pipeline.codex_assets import prepare_codex_final_job
from art_pipeline.codex_final_inputs import codex_final_job_inputs
from art_pipeline.codex_final_brief import (
    CodexFinalBriefRemovedChild,
    render_codex_final_brief,
)
from art_pipeline.elements import WorkspaceState
from codex_final_fixtures import write_parent_child_sam2_references


def test_prepare_codex_final_job_writes_visual_brief(tmp_path: Path) -> None:
    workspace_root = tmp_path / "workspace"
    write_parent_child_sam2_references(workspace_root)
    state = WorkspaceState.model_validate_json((workspace_root / "state.json").read_text(encoding="utf-8"))

    prepared = prepare_codex_final_job(workspace_root, state, "parent_001")

    assert prepared.prompt_path.exists()
    assert prepared.brief_image_path.exists()
    assert prepared.brief_json_path.exists()
    assert [path.name for path in prepared.request.image_paths] == [
        "source_crop.png",
        "generation_brief.png",
        "transparent_asset.png",
        "mask.png",
        "layout_guide.png",
        "mask.png",
        "mask.png",
    ]
    assert [input_image.role for input_image in prepared.input_images] == [
        "source_crop",
        "visual_generation_brief",
        "transparent_cutout",
        "mask",
        "layout_guide",
        "removed_child_mask",
        "removed_child_mask",
    ]
    assert [item.role for item in codex_final_job_inputs(prepared.input_images)] == [
        input_image.role for input_image in prepared.input_images
    ]
    assert [Path(item.path).name for item in codex_final_job_inputs(prepared.input_images)] == [
        path.name for path in prepared.request.image_paths
    ]
    assert "1. source_crop is the highest-authority reference" in prepared.prompt
    assert "2. visual_generation_brief is a local deterministic task map" in prepared.prompt
    assert "3. transparent_cutout is a rough silhouette guide" in prepared.prompt
    assert "4. mask is diagnostic only" in prepared.prompt
    assert "5. layout_guide is a measurement-only construction reference" in prepared.prompt
    assert "6+. removed_child_mask" in prepared.prompt
    assert "6. previous_final" not in prepared.prompt
    assert "7. failed_candidate" not in prepared.prompt
    assert "8+. removed_child_mask" not in prepared.prompt
    brief = json.loads(prepared.brief_json_path.read_text(encoding="utf-8"))
    assert brief["sourceCropPath"] == "elements/parent_001/sam2_edge/source_crop.png"
    assert brief["roughCutoutPath"] == "elements/parent_001/sam2_edge/transparent_asset.png"
    assert brief["maskPath"] == "elements/parent_001/sam2_edge/mask.png"
    assert brief["targetBounds"] == {"x": 1, "y": 1, "w": 20, "h": 20}
    assert [child["name"] for child in brief["removedChildren"]] == ["bottle", "plant"]
    assert brief["excludeFillRegions"] == [
        {
            "elementId": "child_001",
            "name": "bottle",
            "maskPath": "elements/child_001/sam2_edge/mask.png",
            "bbox": {"x": 9, "y": 8, "w": 4, "h": 6},
            "canvas": {"x": 8, "y": 7, "w": 6, "h": 8},
            "targetBounds": {"x": 7, "y": 7, "w": 4, "h": 6},
        },
        {
            "elementId": "child_002",
            "name": "plant",
            "maskPath": "elements/child_002/sam2_edge/mask.png",
            "bbox": {"x": 14, "y": 5, "w": 5, "h": 5},
            "canvas": {"x": 13, "y": 4, "w": 7, "h": 7},
            "targetBounds": {"x": 12, "y": 4, "w": 5, "h": 5},
        },
    ]
    with Image.open(prepared.brief_image_path) as image:
        assert image.size == (66, 22)


def test_visual_brief_rejects_child_mask_canvas_mismatch(tmp_path: Path) -> None:
    workspace_root = tmp_path / "workspace"
    write_parent_child_sam2_references(workspace_root)
    Image.new("L", (4, 4), 255).save(
        workspace_root / "elements" / "child_001" / "sam2_edge" / "mask.png",
        format="PNG",
    )

    with pytest.raises(ValueError, match="child mask size does not match child canvas"):
        _render_parent_brief(workspace_root)


def test_visual_brief_rejects_parent_canvas_mismatch(tmp_path: Path) -> None:
    workspace_root = tmp_path / "workspace"
    write_parent_child_sam2_references(workspace_root)

    with pytest.raises(ValueError, match="target image size does not match target canvas"):
        _render_parent_brief(workspace_root, target_canvas={"x": 2, "y": 1, "w": 20, "h": 20})


def _render_parent_brief(
    workspace_root: Path,
    target_canvas: dict[str, int] | None = None,
) -> None:
    render_codex_final_brief(
        workspace_root,
        source_crop_path="elements/parent_001/sam2_edge/source_crop.png",
        rough_cutout_path="elements/parent_001/sam2_edge/transparent_asset.png",
        mask_path="elements/parent_001/sam2_edge/mask.png",
        target_canvas=target_canvas or {"x": 2, "y": 1, "w": 22, "h": 22},
        removed_children=(
            CodexFinalBriefRemovedChild(
                element_id="child_001",
                name="bottle",
                mask_path="elements/child_001/sam2_edge/mask.png",
                bbox={"x": 9, "y": 8, "w": 4, "h": 6},
                canvas={"x": 8, "y": 7, "w": 6, "h": 8},
            ),
        ),
        image_path=workspace_root / "brief.png",
        json_path=workspace_root / "brief.json",
    )
