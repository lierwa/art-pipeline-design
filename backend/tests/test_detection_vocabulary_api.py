from __future__ import annotations

from io import BytesIO
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

from art_pipeline.api import create_app


def test_detection_vocabulary_persists_and_filters_detect_results(
    tmp_path: Path,
) -> None:
    provider = RecordingDetectionProvider()
    app = create_app(
        workspace_root=tmp_path / "workspace",
        detection_provider=provider,
    )
    client = TestClient(app)
    upload = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_scene_bytes(), "image/png")},
    )
    assert upload.status_code == 200

    vocabulary_response = client.post(
        "/api/workspace/detection-vocabulary",
        json=["cat", "bucket", "bucket"],
    )
    assert vocabulary_response.status_code == 200
    assert vocabulary_response.json()["detectionVocabulary"] == ["cat", "bucket"]

    detect_response = client.post("/api/workspace/detect")

    assert detect_response.status_code == 200
    assert provider.vocabulary == ["cat", "bucket"]
    assert detect_response.json()["elements"][0]["label"] == "bucket"
    assert [element["label"] for element in detect_response.json()["elements"]] == [
        "bucket"
    ]


def test_detection_vocabulary_survives_element_patch_before_detect(
    tmp_path: Path,
) -> None:
    provider = RecordingDetectionProvider()
    app = create_app(
        workspace_root=tmp_path / "workspace",
        detection_provider=provider,
    )
    client = TestClient(app)
    upload = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_scene_bytes(), "image/png")},
    )
    assert upload.status_code == 200
    create_response = client.post(
        "/api/workspace/elements",
        json={"name": "manual", "bbox": {"x": 1, "y": 2, "w": 8, "h": 9}},
    )
    assert create_response.status_code == 200
    element_id = create_response.json()["element"]["id"]
    vocabulary_response = client.post(
        "/api/workspace/detection-vocabulary",
        json=["cat", "bucket"],
    )
    assert vocabulary_response.status_code == 200

    patch_response = client.patch(
        f"/api/workspace/elements/{element_id}",
        json={"label": "patched bucket"},
    )
    assert patch_response.status_code == 200
    detect_response = client.post("/api/workspace/detect")

    assert detect_response.status_code == 200
    assert provider.vocabulary == ["cat", "bucket"]


class RecordingDetectionProvider:
    name = "recording_provider"

    def __init__(self) -> None:
        self.vocabulary: list[str] | None = None

    def detect(self, image, vocabulary, prompt):
        self.vocabulary = list(vocabulary)
        return [
            {
                "label": "bucket",
                "confidence": 0.91,
                "bbox": {"x": 3, "y": 4, "w": 5, "h": 6},
                "sourcePrompt": "bucket",
            },
            {
                "label": "cabinet",
                "confidence": 0.89,
                "bbox": {"x": 10, "y": 11, "w": 7, "h": 8},
                "sourcePrompt": "cabinet",
            },
        ]


def make_scene_bytes() -> bytes:
    image = Image.new("RGBA", (40, 32), (245, 245, 245, 255))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()
