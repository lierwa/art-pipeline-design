from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

from art_pipeline.api import create_app
from workspace_fixtures import upload_scene_and_state


class FakeCodexAssetProvider:
    name = "codex_cli"

    def __init__(self, output_size: tuple[int, int] = (8, 6)) -> None:
        self.requests: list[object] = []
        self.output_size = output_size

    def generate(self, request: object) -> None:
        self.requests.append(request)
        output_path = Path(getattr(request, "output_path"))
        output_path.parent.mkdir(parents=True, exist_ok=True)
        image = Image.new("RGBA", self.output_size, (0, 0, 0, 0))
        for x in range(self.output_size[0] // 4, self.output_size[0] * 3 // 4):
            for y in range(self.output_size[1] // 4, self.output_size[1] * 3 // 4):
                image.putpixel((x, y), (12, 180, 90, 255))
        image.save(output_path, format="PNG")


class FreshOutputCodexAssetProvider(FakeCodexAssetProvider):
    def __init__(self) -> None:
        super().__init__()
        self.output_existed_when_called = False

    def generate(self, request: object) -> None:
        self.output_existed_when_called = Path(getattr(request, "output_path")).exists()
        super().generate(request)


def test_codex_final_generate_uses_semantic_context_and_exports_alpha_mask(
    tmp_path: Path,
) -> None:
    provider = FakeCodexAssetProvider()
    workspace_root = tmp_path / "workspace"
    client = TestClient(create_app(workspace_root, codex_asset_provider=provider))
    upload_scene_and_state(client)
    _write_accepted_sam2_reference(workspace_root)

    response = client.post("/api/workspace/elements/element_001/codex-final/generate")

    assert response.status_code == 200
    body = response.json()
    element = body["element"]
    assert element["sourceProvider"] == "codex_cli"
    assert element["status"] == "repair_complete"
    assert element["repairStatus"] == "repair_complete"
    assert element["exportStatus"] == "ready"
    assert body["generation"]["assetPath"] == (
        "elements/element_001/codex_final/transparent_asset.png"
    )
    request = provider.requests[0]
    assert [path.name for path in getattr(request, "image_paths")] == [
        "source_crop.png",
        "transparent_asset.png",
        "mask.png",
    ]
    prompt = getattr(request, "prompt")
    assert "semantic completion" in prompt
    assert "may be clipped, occluded, or contaminated" in prompt
    assert "physically complete" in prompt
    assert "touches a crop, cutout, or mask boundary" in prompt
    assert "Do not preserve truncated cut lines" in prompt
    assert "Remove unrelated neighboring object fragments" in prompt

    final_dir = workspace_root / "elements" / "element_001" / "codex_final"
    assert (final_dir / "transparent_asset.png").exists()
    metadata = json.loads((final_dir / "generation.json").read_text(encoding="utf-8"))
    assert metadata["provider"] == "codex_cli"
    assert metadata["referenceAssetPath"] == "elements/element_001/sam2_edge/transparent_asset.png"
    assert metadata["inputImagePaths"] == [
        "elements/element_001/sam2_edge/source_crop.png",
        "elements/element_001/sam2_edge/transparent_asset.png",
        "elements/element_001/sam2_edge/mask.png",
    ]

    export_response = client.post("/api/workspace/export")

    assert export_response.status_code == 200
    export_body = export_response.json()
    assert export_body["exportableCount"] == 1
    assert export_body["exportedElements"][0]["sourceAssetPath"] == (
        "elements/element_001/codex_final/transparent_asset.png"
    )
    with Image.open(workspace_root / "export" / "assets" / "element_001.png") as asset:
        assert asset.convert("RGBA").getpixel((3, 2))[:3] == (12, 180, 90)
    with Image.open(workspace_root / "export" / "masks" / "element_001.png") as mask:
        assert mask.getpixel((3, 2)) == 255
        assert mask.getpixel((0, 0)) == 0


def test_codex_final_generate_removes_stale_job_output_before_rerun(tmp_path: Path) -> None:
    provider = FreshOutputCodexAssetProvider()
    workspace_root = tmp_path / "workspace"
    client = TestClient(create_app(workspace_root, codex_asset_provider=provider))
    upload_scene_and_state(client)
    _write_accepted_sam2_reference(workspace_root)
    stale_output = workspace_root / "elements" / "element_001" / "codex_final" / "job" / "final_asset.png"
    stale_output.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGBA", (8, 6), (255, 0, 0, 255)).save(stale_output, format="PNG")

    response = client.post("/api/workspace/elements/element_001/codex-final/generate")

    assert response.status_code == 200
    assert provider.output_existed_when_called is False


def test_codex_final_generate_allows_semantic_completion_to_expand_reference_alpha(
    tmp_path: Path,
) -> None:
    provider = FakeCodexAssetProvider(output_size=(16, 12))
    workspace_root = tmp_path / "workspace"
    client = TestClient(create_app(workspace_root, codex_asset_provider=provider))
    upload_scene_and_state(client)
    _write_accepted_sam2_reference(workspace_root)

    response = client.post("/api/workspace/elements/element_001/codex-final/generate")

    assert response.status_code == 200
    final_asset = workspace_root / "elements" / "element_001" / "codex_final" / "transparent_asset.png"
    with Image.open(final_asset) as image:
        rgba = image.convert("RGBA")
        assert rgba.size == (8, 6)
        assert rgba.getchannel("A").getbbox() == (0, 0, 8, 6)


def test_codex_final_generate_requires_cutout_reference(tmp_path: Path) -> None:
    provider = FakeCodexAssetProvider()
    client = TestClient(create_app(tmp_path / "workspace", codex_asset_provider=provider))
    upload_scene_and_state(client)

    response = client.post("/api/workspace/elements/element_001/codex-final/generate")

    assert response.status_code == 400
    assert response.json()["detail"] == "Codex generation requires a SAM2 transparent asset."
    assert provider.requests == []


def _write_accepted_sam2_reference(workspace_root: Path) -> None:
    stage_dir = workspace_root / "elements" / "element_001" / "sam2_edge"
    stage_dir.mkdir(parents=True, exist_ok=True)
    source_crop = Image.new("RGBA", (8, 6), (220, 90, 40, 255))
    source_crop.save(stage_dir / "source_crop.png", format="PNG")
    cutout = Image.new("RGBA", (8, 6), (0, 0, 0, 0))
    for x in range(1, 7):
        for y in range(1, 5):
            cutout.putpixel((x, y), (220, 90, 40, 255))
    cutout.save(stage_dir / "transparent_asset.png", format="PNG")
    mask = cutout.getchannel("A")
    mask.save(stage_dir / "mask.png", format="PNG")
    state = {
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
                "segmentationStatus": "mask_accepted",
                "segmentationQuality": {
                    "selectedProfile": "base",
                    "candidateCount": 1,
                    "foregroundArea": 24,
                    "detachedArea": 0,
                    "filledHoleCount": 0,
                    "filledHoleArea": 0,
                    "qualityStatus": "pass",
                    "qualityReasons": [],
                },
                "mask": "elements/element_001/sam2_edge/mask.png",
            }
        ],
    }
    (workspace_root / "state.json").write_text(json.dumps(state), encoding="utf-8")
