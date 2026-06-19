from __future__ import annotations

from io import BytesIO
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

from art_pipeline.api import create_app


def test_click_detect_converts_sam2_mask_bounds_to_candidate(
    tmp_path: Path,
) -> None:
    provider = FakeSam2Provider()
    app = create_app(
        workspace_root=tmp_path / "workspace",
        sam2_provider=provider,
    )
    client = TestClient(app)
    upload = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_scene_bytes(), "image/png")},
    )
    assert upload.status_code == 200

    response = client.post(
        "/api/workspace/click-detect",
        json={"x": 6, "y": 7, "label": "bucket"},
    )

    assert response.status_code == 200
    assert provider.prompt == {
        "coordinateSpace": "source",
        "points": [{"x": 6, "y": 7, "label": "positive"}],
    }
    element = response.json()["element"]
    assert element["bbox"] == {"x": 3, "y": 4, "w": 5, "h": 4}
    assert element["status"] == "click_detected"
    assert element["source"] == "click_detect"
    assert element["sourceProvider"] == "sam2"
    assert response.json()["state"]["elements"][0]["id"] == element["id"]


def test_click_detect_rejects_empty_sam2_mask_without_writing_candidate(
    tmp_path: Path,
) -> None:
    app = create_app(
        workspace_root=tmp_path / "workspace",
        sam2_provider=EmptyMaskSam2Provider(),
    )
    client = TestClient(app, raise_server_exceptions=False)
    upload = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_scene_bytes(), "image/png")},
    )
    assert upload.status_code == 200

    response = client.post(
        "/api/workspace/click-detect",
        json={"x": 6, "y": 7, "label": "bucket"},
    )

    assert response.status_code == 502
    assert response.json()["detail"] == "SAM2 provider returned an empty mask."
    assert client.get("/api/workspace/state").json()["elements"] == []


class FakeSam2Provider:
    def __init__(self) -> None:
        self.prompt: dict | None = None

    def detect(self, image, prompt):
        self.prompt = prompt
        mask = Image.new("L", image.size, 0)
        for x in range(3, 8):
            for y in range(4, 8):
                mask.putpixel((x, y), 255)
        return mask


class EmptyMaskSam2Provider:
    def detect(self, image, prompt):
        return Image.new("L", image.size, 0)


def make_scene_bytes() -> bytes:
    image = Image.new("RGBA", (16, 16), (245, 245, 245, 255))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()
