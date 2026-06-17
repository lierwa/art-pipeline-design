from __future__ import annotations

from io import BytesIO
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

from art_pipeline.api import create_app


def test_detect_fails_when_no_provider_is_configured(tmp_path: Path) -> None:
    app = create_app(workspace_root=tmp_path / "workspace", detection_provider=None)
    client = TestClient(app)
    upload = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_synthetic_scene_bytes(), "image/png")},
    )
    assert upload.status_code == 200

    response = client.post("/api/workspace/detect")

    assert response.status_code == 503
    assert response.json()["detail"] == "Detection provider is not configured."


def make_synthetic_scene_bytes() -> bytes:
    image = Image.new("RGBA", (120, 90), (245, 245, 245, 255))
    for x in range(12, 42):
        for y in range(16, 48):
            image.putpixel((x, y), (220, 64, 64, 255))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def test_detect_uses_configured_provider_without_cv_fallback(tmp_path: Path) -> None:
    class StaticProvider:
        name = "test_provider"

        def detect(self, image, vocabulary, prompt):
            return [
                {
                    "label": "cabinet",
                    "confidence": 0.88,
                    "bbox": {"x": 10, "y": 12, "w": 30, "h": 40},
                    "sourcePrompt": "cabinet",
                }
            ]

    app = create_app(
        workspace_root=tmp_path / "workspace",
        detection_provider=StaticProvider(),
    )
    client = TestClient(app)
    client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_synthetic_scene_bytes(), "image/png")},
    )

    response = client.post("/api/workspace/detect")

    assert response.status_code == 200
    body = response.json()
    assert body["elements"][0]["label"] == "cabinet"
    assert body["elements"][0]["status"] == "model_detected"
    assert body["elements"][0]["sourceProvider"] == "test_provider"
    assert body["elements"][0]["source"] != "auto_cv"
