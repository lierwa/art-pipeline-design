from __future__ import annotations

from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import art_pipeline.api as workspace_api
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


def test_detect_uses_configured_provider_without_cv_fallback(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class StaticProvider:
        name = "test_provider"

        def detect(self, image, vocabulary, prompt):
            return [
                {
                    "label": "cabinet",
                    "confidence": 0.88,
                    "bbox": {"x": 10, "y": 12, "w": 30, "h": 40},
                    "sourcePrompt": "cabinet",
                },
                {
                    "label": "sink",
                    "confidence": 0.78,
                    "bbox": {"x": 52, "y": 20, "w": 18, "h": 16},
                    "sourcePrompt": "sink",
                },
            ]

    def fail_if_called(*args, **kwargs):
        raise AssertionError("/api/workspace/detect must not call generate_proposals")

    monkeypatch.setattr(workspace_api, "generate_proposals", fail_if_called)
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
    assert len(body["elements"]) == 2
    assert body["elements"][0]["label"] == "cabinet"
    assert body["elements"][0]["status"] == "model_detected"
    assert body["elements"][0]["sourceProvider"] == "test_provider"
    assert all(element["source"] == "model_detection" for element in body["elements"])


@pytest.mark.parametrize(
    "invalid_result",
    [
        {
            "confidence": 0.72,
            "bbox": {"x": 52, "y": 20, "w": 18, "h": 16},
            "sourcePrompt": "sink",
        },
        {
            "label": "sink",
            "confidence": 0.72,
            "bbox": {"x": 52, "y": 20, "w": -18, "h": 16},
            "sourcePrompt": "sink",
        },
        {
            "label": "sink",
            "confidence": 1.2,
            "bbox": {"x": 52, "y": 20, "w": 18, "h": 16},
            "sourcePrompt": "sink",
        },
        {
            "label": "sink",
            "confidence": 0.72,
            "bbox": {"x": 110, "y": 20, "w": 18, "h": 16},
            "sourcePrompt": "sink",
        },
    ],
)
def test_detect_rejects_invalid_provider_results_without_partial_writes(
    tmp_path: Path,
    invalid_result: dict,
) -> None:
    class MalformedProvider:
        name = "malformed_provider"

        def detect(self, image, vocabulary, prompt):
            return [
                {
                    "label": "cabinet",
                    "confidence": 0.88,
                    "bbox": {"x": 10, "y": 12, "w": 30, "h": 40},
                    "sourcePrompt": "cabinet",
                },
                invalid_result,
            ]

    workspace_root = tmp_path / "workspace"
    app = create_app(
        workspace_root=workspace_root,
        detection_provider=MalformedProvider(),
    )
    client = TestClient(app, raise_server_exceptions=False)
    client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_synthetic_scene_bytes(), "image/png")},
    )

    response = client.post("/api/workspace/detect")

    assert response.status_code == 502
    assert "Invalid provider result" in response.json()["detail"]
    state = client.get("/api/workspace/state").json()
    assert state["elements"] == []
    assert not (workspace_root / "elements").exists()


def test_detect_returns_502_when_provider_raises(tmp_path: Path) -> None:
    class FailingProvider:
        name = "failing_provider"

        def detect(self, image, vocabulary, prompt):
            raise RuntimeError("model runner unavailable")

    app = create_app(
        workspace_root=tmp_path / "workspace",
        detection_provider=FailingProvider(),
    )
    client = TestClient(app, raise_server_exceptions=False)
    client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_synthetic_scene_bytes(), "image/png")},
    )

    response = client.post("/api/workspace/detect")

    assert response.status_code == 502
    assert response.json()["detail"] == (
        "Detection provider 'failing_provider' failed: model runner unavailable"
    )


def test_detect_replaces_previous_detections_with_deterministic_ids_and_outputs(
    tmp_path: Path,
) -> None:
    class QueueProvider:
        name = "queue_provider"

        def __init__(self) -> None:
            self.calls = 0

        def detect(self, image, vocabulary, prompt):
            self.calls += 1
            if self.calls == 1:
                return [
                    {
                        "label": "cabinet",
                        "confidence": 0.88,
                        "bbox": {"x": 10, "y": 12, "w": 30, "h": 40},
                        "sourcePrompt": "cabinet",
                    }
                ]
            return [
                {
                    "label": "sink",
                    "confidence": 0.82,
                    "bbox": {"x": 52, "y": 20, "w": 18, "h": 16},
                    "sourcePrompt": "sink",
                }
            ]

    workspace_root = tmp_path / "workspace"
    app = create_app(
        workspace_root=workspace_root,
        detection_provider=QueueProvider(),
    )
    client = TestClient(app)
    client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_synthetic_scene_bytes(), "image/png")},
    )
    first = client.post("/api/workspace/detect")
    assert first.status_code == 200
    assert first.json()["elements"][0]["id"] == "element_001"

    stale_output = workspace_root / "elements" / "element_999" / "stale.png"
    stale_output.parent.mkdir(parents=True)
    stale_output.write_bytes(b"stale")

    second = client.post("/api/workspace/detect")

    assert second.status_code == 200
    elements = second.json()["elements"]
    assert len(elements) == 1
    assert elements[0]["id"] == "element_001"
    assert elements[0]["label"] == "sink"
    assert elements[0]["thumbnail"] == "elements/element_001/thumb.png"
    assert (workspace_root / "elements" / "element_001" / "thumb.png").exists()
    assert not stale_output.exists()
