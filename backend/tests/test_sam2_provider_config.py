from __future__ import annotations

import sys
import types
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
import pytest

from art_pipeline.api import create_app
from workspace_fixtures import upload_scene_and_state


def test_segment_suggest_lazily_configures_real_sam2_provider_from_env(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_fake_transformers_sam2(monkeypatch)
    monkeypatch.setenv("ART_PIPELINE_SAM2_PROVIDER", "transformers")
    monkeypatch.setenv("ART_PIPELINE_SAM2_MODEL", "custom/sam2")
    app = create_app(tmp_path / "workspace")
    client = TestClient(app)
    upload_scene_and_state(client)

    response = client.post("/api/workspace/elements/element_001/segment/suggest")

    assert response.status_code == 200
    assert app.state.sam2_provider.model_id == "custom/sam2"
    element = response.json()["element"]
    assert element["segmentationStatus"] == "mask_suggested"
    stage_dir = tmp_path / "workspace" / "elements" / "element_001" / "sam2_edge"
    assert (stage_dir / "mask.png").exists()


def test_download_sam2_falls_back_to_cached_processor_after_optional_fetch_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = __import__(
        "art_pipeline.model_runners.download_sam2",
        fromlist=["download_model"],
    )
    processor_calls: list[dict[str, Any]] = []

    class FlakyProcessor:
        @staticmethod
        def from_pretrained(model_id: str, **kwargs):
            processor_calls.append(kwargs)
            if not kwargs.get("local_files_only"):
                raise OSError("optional chat template lookup failed")
            return object()

    class FakeModel:
        requested_model_id = ""

        @staticmethod
        def from_pretrained(model_id: str):
            FakeModel.requested_model_id = model_id
            return object()

    monkeypatch.setattr(module, "Sam2Processor", FlakyProcessor)
    monkeypatch.setattr(module, "Sam2Model", FakeModel)

    model_id = module.download_model("custom/sam2")

    assert model_id == "custom/sam2"
    assert FakeModel.requested_model_id == "custom/sam2"
    assert processor_calls == [{}, {"local_files_only": True}]


def test_sam2_prompt_points_are_clamped_to_image_bounds(monkeypatch: pytest.MonkeyPatch) -> None:
    _install_fake_transformers_sam2(monkeypatch)
    module = __import__("art_pipeline.model_runners.sam2", fromlist=["_prompt_points"])

    points = module._prompt_points(
        {
            "points": [
                {"x": -5, "y": 25, "label": "positive"},
                {"x": 14, "y": -3, "label": "negative"},
            ]
        },
        (10, 20),
    )

    assert points == [
        {"xy": [0, 19], "label": 1},
        {"xy": [9, 0], "label": 0},
    ]


def _install_fake_transformers_sam2(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delitem(sys.modules, "art_pipeline.model_runners.sam2", raising=False)

    class FakeTensor:
        def __init__(self, data):
            self.data = data

        def cpu(self):
            return self

        def to(self, device):
            self.device = device
            return self

        def __getitem__(self, key):
            value = self.data[key]
            if isinstance(value, list):
                return FakeTensor(value)
            return value

        def numpy(self):
            return self.data

    class FakeInputs(dict):
        def to(self, device):
            self["device"] = device
            return self

    class FakeNoGrad:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, traceback):
            return False

    class FakeSam2Processor:
        requested_model_id = ""

        @staticmethod
        def from_pretrained(model_id):
            FakeSam2Processor.requested_model_id = model_id
            return FakeSam2Processor()

        def __call__(self, images, input_boxes=None, input_points=None, input_labels=None, return_tensors=None):
            return FakeInputs(
                original_sizes=[(images.height, images.width)],
                input_boxes=input_boxes,
                input_points=input_points,
                input_labels=input_labels,
            )

        def post_process_masks(self, pred_masks, original_sizes):
            height, width = original_sizes[0]
            mask = [[False for _x in range(width)] for _y in range(height)]
            for y in range(2, 8):
                for x in range(3, 9):
                    mask[y][x] = True
            return FakeTensor([[[mask]]])

    class FakeOutputs:
        pred_masks = FakeTensor([[[[[True]]]]])

    class FakeSam2Model:
        requested_model_id = ""

        def __init__(self):
            self.device = "cpu"

        @staticmethod
        def from_pretrained(model_id):
            FakeSam2Model.requested_model_id = model_id
            return FakeSam2Model()

        def to(self, device):
            self.device = device
            return self

        def eval(self):
            return self

        def __call__(self, **inputs):
            return FakeOutputs()

    fake_torch = types.SimpleNamespace(
        cuda=types.SimpleNamespace(is_available=lambda: False),
        backends=types.SimpleNamespace(
            mps=types.SimpleNamespace(is_available=lambda: False),
        ),
        no_grad=lambda: FakeNoGrad(),
    )
    fake_transformers = types.SimpleNamespace(
        Sam2Model=FakeSam2Model,
        Sam2Processor=FakeSam2Processor,
    )
    monkeypatch.setitem(sys.modules, "torch", fake_torch)
    monkeypatch.setitem(sys.modules, "transformers", fake_transformers)
