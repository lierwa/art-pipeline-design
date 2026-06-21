from __future__ import annotations

from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from art_pipeline.api import create_app

CORE_OBJECT_WORKSPACE_VOCABULARY = [
    "cat",
    "bathtub",
    "toilet",
    "sink",
    "bathroom cabinet",
    "mirror",
    "window",
    "curtain",
    "towel",
    "basket",
    "stool",
    "bottle",
    "plant",
    "shelf",
    "rug",
    "bucket",
    "basin",
]

@pytest.fixture()
def client(tmp_path: Path) -> TestClient:
    app = create_app(workspace_root=tmp_path / "workspace")
    return TestClient(app)


def make_png_bytes() -> bytes:
    image = Image.new("RGBA", (2, 2), (120, 45, 200, 255))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def make_synthetic_scene_bytes() -> bytes:
    image = Image.new("RGBA", (120, 90), (245, 245, 245, 255))
    for x in range(12, 42):
        for y in range(16, 48):
            image.putpixel((x, y), (220, 64, 64, 255))
    for x in range(64, 102):
        for y in range(28, 70):
            image.putpixel((x, y), (64, 118, 220, 255))

    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def make_gradient_scene_bytes(width: int = 8, height: int = 6) -> bytes:
    image = Image.new("RGBA", (width, height), (0, 0, 0, 255))
    for x in range(width):
        for y in range(height):
            image.putpixel((x, y), ((x * 31) % 256, (y * 41) % 256, ((x + y) * 23) % 256, 255))

    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _prepare_repair_package(
    client: TestClient,
    tmp_path: Path,
    missing_bbox: dict[str, int] | None = None,
) -> Path:
    element_dir = _prepare_completion_element(client, tmp_path)
    bbox = missing_bbox or {"x": 2, "y": 1, "w": 1, "h": 1}
    mask_response = client.post(
        "/api/workspace/elements/element_001/repair/missing-mask",
        json={
            "shape": {
                "type": "rectangle",
                "coordinateSpace": "canvas",
                "bbox": bbox,
            }
        },
    )
    assert mask_response.status_code == 200
    task_response = client.post("/api/workspace/elements/element_001/repair/task")
    assert task_response.status_code == 200
    return element_dir


def _validate_repair_package_with_missing_pixel(
    client: TestClient,
    repair_dir: Path,
):
    with Image.open(repair_dir / "incomplete_asset.png") as incomplete:
        completed = incomplete.convert("RGBA")
    completed.putpixel((2, 1), (250, 120, 10, 255))
    completed.save(repair_dir / "completed_asset.png", format="PNG")
    (repair_dir / "repair_report.json").write_text(
        '{"summary":"filled missing pixel"}',
        encoding="utf-8",
    )
    validate_response = client.post("/api/workspace/elements/element_001/repair/validate")
    assert validate_response.status_code == 200
    assert validate_response.json()["qa"]["status"] == "pass"
    return validate_response


def _promote_visible_element_to_sam2_accepted(client: TestClient, tmp_path: Path) -> None:
    element_dir = tmp_path / "workspace" / "elements" / "element_001"
    sam2_dir = element_dir / "sam2_edge"
    sam2_dir.mkdir(parents=True, exist_ok=True)
    with Image.open(element_dir / "source_crop.png") as source_crop:
        source_crop.save(sam2_dir / "source_crop.png", format="PNG")
    with Image.open(element_dir / "mask.png") as mask:
        mask.save(sam2_dir / "mask.png", format="PNG")
    with Image.open(element_dir / "asset_incomplete.png") as asset:
        asset.save(sam2_dir / "transparent_asset.png", format="PNG")

    state = client.get("/api/workspace/state").json()
    for element in state["elements"]:
        if element["id"] == "element_001":
            element["segmentationStatus"] = "mask_accepted"
            element["segmentationQuality"] = {
                "selectedProfile": "fixture",
                "candidateCount": 1,
                "foregroundArea": 4,
                "detachedArea": 0,
                "filledHoleCount": 0,
                "filledHoleArea": 0,
                "removedDetachedCount": 0,
                "removedDetachedArea": 0,
                "supportPointCount": 0,
                "missedSupportPointCount": 0,
            }
            element["mask"] = "elements/element_001/sam2_edge/mask.png"
            element["exportStatus"] = "ready"
    assert client.put("/api/workspace/state", json=state).status_code == 200


def _prepare_completion_element(
    client: TestClient,
    tmp_path: Path,
    mode: str = "needs_completion",
) -> Path:
    upload_response = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_gradient_scene_bytes(), "image/png")},
    )
    assert upload_response.status_code == 200

    state_response = client.put(
        "/api/workspace/state",
        json={
            "source": {
                "filename": "original.png",
                "path": "source/original.png",
                "width": 8,
                "height": 6,
            },
            "elements": [
                {
                    "id": "element_001",
                    "name": "Cup",
                    "status": "accepted",
                    "mode": mode,
                    "bbox": {"x": 3, "y": 2, "w": 2, "h": 2},
                    "canvas": {"x": 1, "y": 1, "w": 5, "h": 4},
                    "layer": 1,
                    "thumbnail": None,
                    "mask": None,
                    "parentId": None,
                    "source": "manual",
                    "notes": "",
                    "visible": True,
                    "confidence": None,
                }
            ],
        },
    )
    assert state_response.status_code == 200

    extract_response = client.post(
        "/api/workspace/extract",
        json={"elementIds": ["element_001"], "strategy": "bbox_alpha"},
    )
    assert extract_response.status_code == 200
    return tmp_path / "workspace" / "elements" / "element_001"
