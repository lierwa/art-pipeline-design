from __future__ import annotations

from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image


def upload_scene_and_state(client: TestClient) -> None:
    upload_response = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", scene_bytes(), "image/png")},
    )
    assert upload_response.status_code == 200
    state_response = client.put(
        "/api/workspace/state",
        json={
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
                }
            ],
        },
    )
    assert state_response.status_code == 200


def scene_bytes() -> bytes:
    image = Image.new("RGBA", (12, 10), (20, 30, 40, 255))
    for x in range(3, 9):
        for y in range(2, 8):
            image.putpixel((x, y), (220, 90, 40, 255))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()
