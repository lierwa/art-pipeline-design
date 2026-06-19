from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from art_pipeline.api import create_app


@pytest.fixture()
def client(tmp_path: Path) -> TestClient:
    app = create_app(workspace_root=tmp_path / "workspace")
    return TestClient(app)


def test_patch_element_updates_asset_role(client: TestClient) -> None:
    assert client.put("/api/workspace/state", json=_state()).status_code == 200

    response = client.patch(
        "/api/workspace/elements/element_001",
        json={"assetRole": "parent"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["element"]["assetRole"] == "parent"
    assert payload["element"]["removeFromParent"] is None
    assert payload["state"]["elements"][0] == payload["element"]


def test_patch_element_rejects_invalid_asset_role(client: TestClient) -> None:
    assert client.put("/api/workspace/state", json=_state()).status_code == 200

    response = client.patch(
        "/api/workspace/elements/element_001",
        json={"assetRole": "background"},
    )

    assert response.status_code == 422


def test_patch_removable_child_requires_existing_parent(client: TestClient) -> None:
    assert client.put("/api/workspace/state", json=_state()).status_code == 200

    response = client.patch(
        "/api/workspace/elements/element_001",
        json={"assetRole": "removable_child", "removeFromParent": "element_999"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "removeFromParent must reference an existing parent element."


def test_patch_removable_child_rejects_non_parent_target(client: TestClient) -> None:
    state = _state()
    state["elements"].append(
        {
            "id": "element_003",
            "name": "Loose sticker",
            "label": "Loose sticker",
            "status": "accepted",
            "assetRole": "sticker",
            "bbox": {"x": 50, "y": 40, "w": 12, "h": 10},
        }
    )
    assert client.put("/api/workspace/state", json=state).status_code == 200

    response = client.patch(
        "/api/workspace/elements/element_002",
        json={"assetRole": "removable_child", "removeFromParent": "element_003"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "removeFromParent must reference an element with parent role."


def test_patch_removable_child_rejects_empty_parent_id(client: TestClient) -> None:
    assert client.put("/api/workspace/state", json=_state()).status_code == 200

    response = client.patch(
        "/api/workspace/elements/element_002",
        json={"assetRole": "removable_child", "removeFromParent": ""},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "removeFromParent must reference an existing parent element."


def test_patch_removable_child_allows_pending_parent_selection(client: TestClient) -> None:
    assert client.put("/api/workspace/state", json=_state()).status_code == 200

    response = client.patch(
        "/api/workspace/elements/element_002",
        json={"assetRole": "removable_child", "removeFromParent": None},
    )

    assert response.status_code == 200
    element = response.json()["element"]
    assert element["assetRole"] == "removable_child"
    assert element["removeFromParent"] is None


def test_patch_removable_child_stores_existing_parent(client: TestClient) -> None:
    state = _state()
    state["elements"][0]["assetRole"] = "parent"
    assert client.put("/api/workspace/state", json=state).status_code == 200

    response = client.patch(
        "/api/workspace/elements/element_002",
        json={"assetRole": "removable_child", "removeFromParent": "element_001"},
    )

    assert response.status_code == 200
    element = response.json()["element"]
    assert element["assetRole"] == "removable_child"
    assert element["removeFromParent"] == "element_001"


def test_patch_non_removable_child_clears_remove_from_parent(client: TestClient) -> None:
    state = _state()
    state["elements"][1]["assetRole"] = "removable_child"
    state["elements"][1]["removeFromParent"] = "element_001"
    assert client.put("/api/workspace/state", json=state).status_code == 200

    response = client.patch(
        "/api/workspace/elements/element_002",
        json={"assetRole": "embedded_keep", "removeFromParent": "element_001"},
    )

    assert response.status_code == 200
    element = response.json()["element"]
    assert element["assetRole"] == "embedded_keep"
    assert element["removeFromParent"] is None


def _state() -> dict:
    return {
        "source": {
            "filename": "original.png",
            "path": "source/original.png",
            "width": 120,
            "height": 90,
        },
        "elements": [
            {
                "id": "element_001",
                "name": "Cabinet",
                "label": "Cabinet",
                "status": "accepted",
                "bbox": {"x": 10, "y": 20, "w": 80, "h": 60},
            },
            {
                "id": "element_002",
                "name": "Sticker",
                "label": "Sticker",
                "status": "accepted",
                "bbox": {"x": 24, "y": 32, "w": 20, "h": 18},
            },
        ],
    }
