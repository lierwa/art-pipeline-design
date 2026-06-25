from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


def write_accepted_sam2_reference(workspace_root: Path) -> None:
    stage_dir = workspace_root / "elements" / "element_001" / "sam2_edge"
    stage_dir.mkdir(parents=True, exist_ok=True)
    source_crop = Image.new("RGBA", (8, 6), (220, 90, 40, 255))
    source_crop.save(stage_dir / "source_crop.png", format="PNG")
    cutout = Image.new("RGBA", (8, 6), (0, 0, 0, 0))
    for x in range(1, 7):
        for y in range(1, 5):
            cutout.putpixel((x, y), (220, 90, 40, 255))
    cutout.save(stage_dir / "transparent_asset.png", format="PNG")
    cutout.getchannel("A").save(stage_dir / "mask.png", format="PNG")
    state = {
        "source": {
            "filename": "original.png",
            "path": "source/original.png",
            "width": 12,
            "height": 10,
        },
        "elements": [
            {
                "id": "element_001",
                "name": "Sticker",
                "status": "accepted",
                "assetRole": "sticker",
                "bbox": {"x": 3, "y": 2, "w": 4, "h": 3},
                "canvas": {"x": 2, "y": 1, "w": 8, "h": 6},
                "layer": 1,
                "visible": True,
                "segmentationStatus": "mask_accepted",
                "segmentationQuality": _segmentation_quality("base", 24),
                "mask": "elements/element_001/sam2_edge/mask.png",
            }
        ],
    }
    (workspace_root / "state.json").write_text(json.dumps(state), encoding="utf-8")


def write_parent_child_sam2_references(workspace_root: Path) -> None:
    elements = [
        ("parent_001", (180, 110, 40, 255), {"x": 3, "y": 2, "w": 20, "h": 20}),
        ("child_001", (230, 90, 120, 255), {"x": 9, "y": 8, "w": 4, "h": 6}),
        ("child_002", (90, 190, 80, 255), {"x": 14, "y": 5, "w": 5, "h": 5}),
    ]
    for element_id, color, bbox in elements:
        element = sam2_state_element(
            element_id,
            "wall cabinet",
            "parent",
            None,
            bbox,
        )
        canvas = element["canvas"]
        if element_id.startswith("child"):
            name = "bottle" if element_id == "child_001" else "plant"
            element = sam2_state_element(element_id, name, "removable_child", "parent_001", bbox)
            canvas = element["canvas"]
        _write_sam2_artifacts(workspace_root, element_id, color, bbox, canvas)

    state = {
        "source": {
            "filename": "original.png",
            "path": "source/original.png",
            "width": 32,
            "height": 32,
        },
        "elements": [
            sam2_state_element("parent_001", "wall cabinet", "parent", None, {"x": 3, "y": 2, "w": 20, "h": 20}),
            sam2_state_element("child_001", "bottle", "removable_child", "parent_001", {"x": 9, "y": 8, "w": 4, "h": 6}),
            sam2_state_element("child_002", "plant", "removable_child", "parent_001", {"x": 14, "y": 5, "w": 5, "h": 5}),
        ],
    }
    (workspace_root / "state.json").write_text(json.dumps(state), encoding="utf-8")


def write_semantic_rgb_output(path: Path, chroma_key: tuple[int, int, int], size: tuple[int, int]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGB", size, chroma_key)
    for x in range(size[0] // 4, size[0] * 3 // 4):
        for y in range(size[1] // 4, size[1] * 3 // 4):
            image.putpixel((x, y), (12, 180, 90))
    image.save(path, format="PNG")


def sam2_state_element(
    element_id: str,
    name: str,
    asset_role: str,
    remove_from_parent: str | None,
    bbox: dict[str, int],
) -> dict:
    return {
        "id": element_id,
        "name": name,
        "label": name,
        "status": "accepted",
        "mode": "needs_completion",
        "assetRole": asset_role,
        "removeFromParent": remove_from_parent,
        "bbox": bbox,
        "canvas": {
            "x": max(0, bbox["x"] - 1),
            "y": max(0, bbox["y"] - 1),
            "w": bbox["w"] + 2,
            "h": bbox["h"] + 2,
        },
        "layer": 1,
        "visible": True,
        "segmentationStatus": "mask_accepted",
        "segmentationQuality": _segmentation_quality("fixture", 36),
        "mask": f"elements/{element_id}/sam2_edge/mask.png",
    }


def _write_sam2_artifacts(
    workspace_root: Path,
    element_id: str,
    color: tuple[int, int, int, int],
    bbox: dict[str, int],
    canvas: dict[str, int],
) -> None:
    stage_dir = workspace_root / "elements" / element_id / "sam2_edge"
    stage_dir.mkdir(parents=True, exist_ok=True)
    source_crop = Image.new("RGBA", (canvas["w"], canvas["h"]), color)
    source_crop.save(stage_dir / "source_crop.png", format="PNG")
    cutout = Image.new("RGBA", (canvas["w"], canvas["h"]), (0, 0, 0, 0))
    local_x = bbox["x"] - canvas["x"]
    local_y = bbox["y"] - canvas["y"]
    for x in range(local_x, local_x + bbox["w"]):
        for y in range(local_y, local_y + bbox["h"]):
            cutout.putpixel((x, y), color)
    cutout.save(stage_dir / "transparent_asset.png", format="PNG")
    cutout.getchannel("A").save(stage_dir / "mask.png", format="PNG")


def _segmentation_quality(profile: str, foreground_area: int) -> dict:
    return {
        "selectedProfile": profile,
        "candidateCount": 1,
        "foregroundArea": foreground_area,
        "detachedArea": 0,
        "filledHoleCount": 0,
        "filledHoleArea": 0,
        "qualityStatus": "pass",
        "qualityReasons": [],
    }
