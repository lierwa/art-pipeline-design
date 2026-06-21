from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import art_pipeline.api as workspace_api
import art_pipeline.exporting.exporter as workspace_exporter
from art_pipeline.elements import DEFAULT_WORKSPACE_VOCABULARY, EXPANDED_DEFAULT_WORKSPACE_VOCABULARY
from workspace_api_helpers import (
    CORE_OBJECT_WORKSPACE_VOCABULARY,
    client,
    make_gradient_scene_bytes,
    make_png_bytes,
    make_synthetic_scene_bytes,
    _prepare_completion_element,
    _prepare_repair_package,
    _promote_visible_element_to_sam2_accepted,
    _validate_repair_package_with_missing_pixel,
)

def test_split_marks_parent_and_creates_children_with_thumbnails(
    client: TestClient,
    tmp_path: Path,
) -> None:
    upload_response = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_synthetic_scene_bytes(), "image/png")},
    )
    assert upload_response.status_code == 200

    created_response = client.post(
        "/api/workspace/elements",
        json={
            "name": "Cabinet",
            "bbox": {"x": 12, "y": 16, "w": 30, "h": 32},
        },
    )
    assert created_response.status_code == 200
    parent = created_response.json()["element"]

    split_response = client.post(
        f"/api/workspace/elements/{parent['id']}/split",
        json={
            "regions": [
                {"name": "Left Door", "bbox": {"x": 12, "y": 16, "w": 14, "h": 32}},
                {"name": "Right Door", "bbox": {"x": 26, "y": 16, "w": 16, "h": 32}},
            ]
        },
    )

    assert split_response.status_code == 200
    payload = split_response.json()
    updated_parent = next(element for element in payload["state"]["elements"] if element["id"] == parent["id"])
    assert updated_parent["status"] == "split_parent"

    children = payload["children"]
    assert len(children) == 2
    assert {child["name"] for child in children} == {"Left Door", "Right Door"}
    assert {child["parentId"] for child in children} == {parent["id"]}
    assert all(child["status"] == "accepted" for child in children)
    assert all(child["mode"] == "visible_only" for child in children)
    assert all(child["layer"] in {1, 2} for child in children)

    for child in children:
        thumb_path = tmp_path / "workspace" / child["thumbnail"]
        assert thumb_path.exists()


def test_create_split_request_writes_expected_contract(
    client: TestClient,
    tmp_path: Path,
) -> None:
    upload_response = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_synthetic_scene_bytes(), "image/png")},
    )
    assert upload_response.status_code == 200

    created_response = client.post(
        "/api/workspace/elements",
        json={
            "name": "Mirror",
            "bbox": {"x": 64, "y": 28, "w": 38, "h": 42},
        },
    )
    assert created_response.status_code == 200
    element = created_response.json()["element"]

    request_response = client.post(
        "/api/workspace/split-requests",
        json={
            "elementId": element["id"],
            "description": "separate the reflection frame from the glass",
        },
    )

    assert request_response.status_code == 200
    body = request_response.json()
    request_path = tmp_path / "workspace" / body["path"]
    assert request_path.exists()

    contract = workspace_api.json.loads(request_path.read_text(encoding="utf-8"))
    assert contract["elementId"] == element["id"]
    assert contract["description"] == "separate the reflection frame from the glass"
    assert contract["sourceImagePath"] == "source/original.png"
    assert contract["sourceCropPath"].endswith(".png")
    assert contract["expectedOutput"]["type"] == "split_children"
    assert contract["expectedOutput"]["parentStatus"] == "split_parent"


def test_create_split_request_rejects_blank_description(client: TestClient) -> None:
    upload_response = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_synthetic_scene_bytes(), "image/png")},
    )
    assert upload_response.status_code == 200

    created_response = client.post(
        "/api/workspace/elements",
        json={
            "name": "Mirror",
            "bbox": {"x": 64, "y": 28, "w": 38, "h": 42},
        },
    )
    assert created_response.status_code == 200
    element = created_response.json()["element"]

    response = client.post(
        "/api/workspace/split-requests",
        json={
            "elementId": element["id"],
            "description": "   ",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Split description must not be blank."



