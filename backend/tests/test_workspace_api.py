from __future__ import annotations

from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from art_pipeline.api import create_app


@pytest.fixture()
def client(tmp_path: Path) -> TestClient:
    app = create_app(workspace_root=tmp_path / "workspace")
    return TestClient(app)


def make_png_bytes() -> bytes:
    image = Image.new("RGBA", (2, 2), (120, 45, 200, 255))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def test_upload_png_initializes_workspace_state(client: TestClient, tmp_path: Path) -> None:
    response = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_png_bytes(), "image/png")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["source"]["filename"] == "original.png"
    assert payload["source"]["width"] == 2
    assert payload["source"]["height"] == 2
    assert payload["elements"] == []

    source_path = tmp_path / "workspace" / "source" / "original.png"
    state_path = tmp_path / "workspace" / "state.json"
    assert source_path.exists()
    assert state_path.exists()

    source_response = client.get("/api/workspace/source")
    assert source_response.status_code == 200
    assert source_response.headers["content-type"] == "image/png"

    state_response = client.get("/api/workspace/state")
    assert state_response.status_code == 200
    assert state_response.json()["source"]["path"] == "source/original.png"


def test_upload_rejects_non_png(client: TestClient) -> None:
    response = client.post(
        "/api/workspace/source",
        files={"file": ("scene.txt", b"not a png", "text/plain")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Only PNG uploads are supported."
