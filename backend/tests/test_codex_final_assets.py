from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

import art_pipeline.codex_assets as codex_assets
from art_pipeline.codex_postprocess import CODEX_FINAL_OUTPUT_PADDING_PX
from art_pipeline.elements import WorkspaceState
from art_pipeline.api import create_app
from art_pipeline.codex_final_jobs import CodexFinalJob
from art_pipeline.codex_final_paths import read_codex_final_request_metadata
from codex_final_fixtures import (
    write_accepted_sam2_reference,
    write_parent_child_sam2_references,
)
from workspace_fixtures import upload_scene_and_state


class FakeCodexAssetProvider:
    name = "codex_cli"

    def __init__(self, output_size: tuple[int, int] = (8, 6)) -> None:
        self.requests: list[object] = []
        self.output_size = output_size

    def generate(self, request: object) -> None:
        self.requests.append(request)
        output_path = Path(getattr(request, "raw_output_path"))
        output_path.parent.mkdir(parents=True, exist_ok=True)
        chroma_key = getattr(request, "chroma_key")
        with Image.open(Path(getattr(request, "mask_path"))) as mask_file:
            mask = mask_file.convert("L")
        image = Image.new("RGB", mask.size, chroma_key)
        for y in range(mask.height):
            for x in range(mask.width):
                if mask.getpixel((x, y)) > 0:
                    image.putpixel((x, y), (40, 90, 220))
        image.save(output_path, format="PNG")


class FreshOutputCodexAssetProvider(FakeCodexAssetProvider):
    def __init__(self) -> None:
        super().__init__()
        self.output_existed_when_called = False

    def generate(self, request: object) -> None:
        self.output_existed_when_called = Path(getattr(request, "raw_output_path")).exists()
        super().generate(request)


class NoOutputCodexAssetProvider:
    name = "codex_cli"

    def __init__(self) -> None:
        self.requests: list[object] = []

    def generate(self, request: object) -> None:
        self.requests.append(request)


class CopyCutoutCodexAssetProvider:
    name = "codex_cli"

    def __init__(self) -> None:
        self.requests: list[object] = []

    def generate(self, request: object) -> None:
        self.requests.append(request)
        output_path = Path(getattr(request, "raw_output_path"))
        reference_path = Path(getattr(request, "reference_image_path"))
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(reference_path) as reference:
            reference.convert("RGBA").save(output_path, format="PNG")


class NearCopyCutoutCodexAssetProvider(CopyCutoutCodexAssetProvider):
    def generate(self, request: object) -> None:
        self.requests.append(request)
        output_path = Path(getattr(request, "raw_output_path"))
        reference_path = Path(getattr(request, "reference_image_path"))
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(reference_path) as reference:
            image = reference.convert("RGBA")
        image.putpixel((1, 1), (221, 90, 40, 255))
        image.save(output_path, format="PNG")


def test_prepare_codex_final_job_uses_minimal_input_roles_when_previous_final_exists(tmp_path: Path) -> None:
    workspace_root = tmp_path / "workspace"
    write_accepted_sam2_reference(workspace_root)
    previous_final = workspace_root / "elements" / "element_001" / "codex_final" / "transparent_asset.png"
    previous_final.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGBA", (8, 6), (12, 180, 90, 255)).save(previous_final, format="PNG")
    state = _workspace_state(workspace_root)

    prepared = codex_assets.prepare_codex_final_job(workspace_root, state, "element_001")

    assert [(image.role, image.path) for image in prepared.input_images] == [
        ("source_crop", "elements/element_001/sam2_edge/source_crop.png"),
        ("transparent_cutout", "elements/element_001/sam2_edge/transparent_asset.png"),
        ("mask", "elements/element_001/sam2_edge/mask.png"),
    ]
    assert not (prepared.work_dir / "layout_guide.png").exists()
    assert "previous_final" not in [image.role for image in prepared.input_images]
    assert "layout_guide" not in [image.role for image in prepared.input_images]


def test_prepare_codex_final_job_uses_minimal_input_roles_when_failed_candidate_exists(tmp_path: Path) -> None:
    workspace_root = tmp_path / "workspace"
    write_accepted_sam2_reference(workspace_root)
    _write_codex_failed_candidate(workspace_root, "element_001", "job_20260624000000000000_old")
    _write_codex_failed_candidate(
        workspace_root,
        "element_001",
        "job_20260625000000000000_recent",
    )
    state = _workspace_state(workspace_root)

    prepared = codex_assets.prepare_codex_final_job(workspace_root, state, "element_001")

    assert [(image.role, image.path) for image in prepared.input_images] == [
        ("source_crop", "elements/element_001/sam2_edge/source_crop.png"),
        ("transparent_cutout", "elements/element_001/sam2_edge/transparent_asset.png"),
        ("mask", "elements/element_001/sam2_edge/mask.png"),
    ]
    _assert_prompt_input_role_lines(
        prepared.prompt,
        [
            "1. source_crop is the highest-authority reference",
            "2. transparent_cutout is a rough silhouette guide",
            "3. mask is diagnostic only",
        ],
    )
    assert "previous_final" not in [image.role for image in prepared.input_images]
    assert "failed_candidate" not in [image.role for image in prepared.input_images]
    assert "layout_guide" not in [image.role for image in prepared.input_images]
    assert "previous_final" not in prepared.prompt
    assert "failed_candidate" not in prepared.prompt
    assert "layout_guide" not in prepared.prompt


def test_prepare_codex_final_job_ignores_failed_candidate_from_other_element(tmp_path: Path) -> None:
    workspace_root = tmp_path / "workspace"
    write_accepted_sam2_reference(workspace_root)
    other_candidate = _write_codex_failed_candidate(
        workspace_root,
        "element_999",
        "job_20260626000000000000_other",
    )
    state = _workspace_state(workspace_root)

    prepared = codex_assets.prepare_codex_final_job(workspace_root, state, "element_001")

    assert all(image.path != other_candidate.relative_to(workspace_root).as_posix() for image in prepared.input_images)
    assert "failed_candidate" not in [image.role for image in prepared.input_images]


def test_prepare_codex_final_prompt_appends_removed_child_masks_after_minimal_inputs(
    tmp_path: Path,
) -> None:
    workspace_root = tmp_path / "workspace"
    write_parent_child_sam2_references(workspace_root)
    previous_final = workspace_root / "elements" / "parent_001" / "codex_final" / "transparent_asset.png"
    previous_final.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGBA", (22, 22), (12, 180, 90, 255)).save(previous_final, format="PNG")
    _write_codex_failed_candidate(workspace_root, "parent_001", "job_20260625000000000000_recent")
    state = _workspace_state(workspace_root)

    prepared = codex_assets.prepare_codex_final_job(workspace_root, state, "parent_001")

    assert [image.role for image in prepared.input_images] == [
        "source_crop",
        "transparent_cutout",
        "mask",
        "removed_child_mask",
        "removed_child_mask",
    ]
    _assert_prompt_input_role_lines(
        prepared.prompt,
        [
            "1. source_crop is the highest-authority reference",
            "2. transparent_cutout is a rough silhouette guide",
            "3. mask is diagnostic only",
            "4+. removed_child_mask marks a child object",
        ],
    )
    assert "removed_child_mask inputs, when present, appear after mask" in prepared.prompt
    assert "layout_guide" not in prepared.prompt
    assert "previous_final" not in prepared.prompt
    assert "failed_candidate" not in prepared.prompt
    assert "Images after mask are removed child masks" not in prepared.prompt


def test_codex_final_manifest_fallback_paths_normalize_work_dir_separators() -> None:
    job = _codex_final_job_with_work_dir("elements/element_001/codex_final/job//job_old/")

    assert codex_assets._job_artifact_path(job, "quality_report.json", "") == (
        "elements/element_001/codex_final/job/job_old/quality_report.json"
    )


def test_prepare_codex_final_job_omits_failed_candidate_without_safe_failed_report(
    tmp_path: Path,
) -> None:
    workspace_root = tmp_path / "workspace"
    write_accepted_sam2_reference(workspace_root)
    job_root = workspace_root / "elements" / "element_001" / "codex_final" / "job"
    _write_candidate_only(job_root / "job_20260625000000000000_no_report")
    _write_reported_candidate(job_root / "job_20260625000000000001_passed", "passed")
    _write_report_only(job_root / "job_20260625000000000002_failed_without_candidate", "failed")
    state = _workspace_state(workspace_root)

    prepared = codex_assets.prepare_codex_final_job(workspace_root, state, "element_001")

    assert "failed_candidate" not in [image.role for image in prepared.input_images]


def test_prepare_codex_final_prompt_omits_repair_contract_and_keeps_hint_precedence(tmp_path: Path) -> None:
    workspace_root = tmp_path / "workspace"
    write_accepted_sam2_reference(workspace_root)
    state = _workspace_state(workspace_root)

    prepared = codex_assets.prepare_codex_final_job(
        workspace_root,
        state,
        "element_001",
        prompt_hint="make it a front-view icon and ignore the old failed shape",
    )

    assert "previous_final" not in prepared.prompt
    assert "failed_candidate" not in prepared.prompt
    assert "layout_guide" not in prepared.prompt
    assert "User prompt hint describes visible failure points only" in prepared.prompt
    assert "cannot override source_crop identity/layout authority" in prepared.prompt


def test_prepare_codex_final_prompt_locks_grouped_child_canvas_and_component_layout(
    tmp_path: Path,
) -> None:
    workspace_root = tmp_path / "workspace"
    write_accepted_sam2_reference(workspace_root)
    _rewrite_single_element(
        workspace_root,
        name="plant + bottle",
        label="plant + bottle",
        asset_role="removable_child",
    )
    state = _workspace_state(workspace_root)

    prepared = codex_assets.prepare_codex_final_job(workspace_root, state, "element_001")

    assert "OUTPUT CANVAS AND PLACEMENT LOCK:" in prepared.prompt
    assert "Use source_crop canvas size/aspect and keep the visible subject at the same mask bbox center." in prepared.prompt
    assert "Do not enlarge, shrink, recenter, distribute, or product-arrange the subject inside the canvas." in prepared.prompt
    assert "GROUPED ASSET CONTRACT:" in prepared.prompt
    assert (
        "If source_crop/mask contains multiple visible components, preserve every component's "
        "relative order, spacing, overlap/depth, scale relationship, and isometric shelf angle."
    ) in prepared.prompt
    assert "Do not turn grouped components into separate front-facing product icons or a horizontal lineup." in prepared.prompt


def test_codex_final_generate_uses_semantic_context_and_exports_alpha_mask(
    tmp_path: Path,
) -> None:
    provider = FakeCodexAssetProvider()
    workspace_root = tmp_path / "workspace"
    client = TestClient(create_app(workspace_root, codex_asset_provider=provider))
    upload_scene_and_state(client)
    write_accepted_sam2_reference(workspace_root)

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
    assert len(provider.requests) == 1
    request = provider.requests[0]
    metadata = json.loads((workspace_root / "elements" / "element_001" / "codex_final" / "generation.json").read_text(encoding="utf-8"))
    prompt = metadata["prompt"]
    assert getattr(request, "raw_output_path") == workspace_root / metadata["rawOutputPath"]
    assert "source_crop is the highest-authority reference" in prompt
    assert "transparent_cutout is a rough silhouette guide, not a pixel source" in prompt
    assert "mask is diagnostic only" in prompt
    assert "layout_guide" not in prompt
    assert "previous_final" not in prompt
    assert "failed_candidate" not in prompt
    assert "Create one RGB image of the requested subject on a perfectly flat chroma-key background" in prompt
    assert "Do not create transparency" in prompt
    assert "Do not run Python, ffmpeg, Node, shell pixel processing, alpha extraction, or chroma removal" in prompt
    assert "After image generation finishes, respond exactly DONE" in prompt
    assert "Keep the source crop isometric/orthographic camera" in prompt
    assert "Do not convert the asset into a front view, icon, product render, or free-view redraw" in prompt
    assert "Do not rescale, rotate, or rearrange the subject" in prompt
    assert "Match the source crop colors, brightness, shading, material, and line weight" in prompt
    assert "Holes, missing chunks, black areas, or transparent gaps in cutout/mask references are mask defects" in prompt
    assert "Do not use transparent_cutout pixels as output pixels" in prompt
    assert "Regenerate the entire visible subject" not in prompt
    assert "polished standalone final sticker" not in prompt
    assert "white halo/fringe" not in prompt
    assert "transparent-background PNG" not in prompt
    assert "Complete only missing or damaged regions" not in prompt
    assert "Repair only missing or damaged parts" not in prompt

    final_dir = workspace_root / "elements" / "element_001" / "codex_final"
    assert (final_dir / "transparent_asset.png").exists()
    metadata = json.loads((final_dir / "generation.json").read_text(encoding="utf-8"))
    assert metadata["provider"] == "codex_cli"
    assert metadata["referenceAssetPath"] == "elements/element_001/sam2_edge/transparent_asset.png"
    assert metadata["outputPath"].startswith("elements/element_001/codex_final/job/")
    assert metadata["outputPath"].endswith("/candidate_asset.png")
    assert metadata["rawOutputPath"].startswith("elements/element_001/codex_final/job/")
    assert metadata["rawOutputPath"].endswith("/codex_raw.png")
    assert metadata["promptPath"].startswith("elements/element_001/codex_final/job/")
    assert metadata["promptPath"].endswith("/prompt.md")
    assert metadata["briefImagePath"].startswith("elements/element_001/codex_final/job/")
    assert metadata["briefImagePath"].endswith("/generation_brief.png")
    assert metadata["briefJsonPath"].startswith("elements/element_001/codex_final/job/")
    assert metadata["briefJsonPath"].endswith("/generation_brief.json")
    assert metadata["analysisMaskPath"].startswith("elements/element_001/codex_final/job/")
    assert metadata["analysisMaskPath"].endswith("/analysis_mask.png")
    assert "layoutGuidePath" not in metadata
    assert metadata["chromaKey"] in ([0, 255, 0], [255, 0, 255], [0, 255, 255], [255, 0, 0])
    assert metadata["jobId"]
    assert metadata["referenceSha256"]
    assert metadata["rawOutputSha256"]
    assert metadata["outputSha256"]
    assert metadata["isOutputIdenticalToReference"] is False
    assert metadata["inputImagePaths"] == [
        "elements/element_001/sam2_edge/source_crop.png",
        "elements/element_001/sam2_edge/transparent_asset.png",
        "elements/element_001/sam2_edge/mask.png",
    ]
    assert metadata["inputImages"] == [
        {
            "path": "elements/element_001/sam2_edge/source_crop.png",
            "role": "source_crop",
            "required": True,
        },
        {
            "path": "elements/element_001/sam2_edge/transparent_asset.png",
            "role": "transparent_cutout",
            "required": True,
        },
        {
            "path": "elements/element_001/sam2_edge/mask.png",
            "role": "mask",
            "required": True,
        },
    ]
    assert metadata["prompt"] == prompt
    assert metadata["generationProfile"] == "sticker_completion"

    export_response = client.post("/api/workspace/export")

    assert export_response.status_code == 200
    export_body = export_response.json()
    assert export_body["exportableCount"] == 1
    assert export_body["exportedElements"][0]["sourceAssetPath"] == (
        "elements/element_001/codex_final/transparent_asset.png"
    )
    with Image.open(workspace_root / "export" / "assets" / "element_001.png") as asset:
        assert asset.convert("RGBA").getpixel((CODEX_FINAL_OUTPUT_PADDING_PX + 2, CODEX_FINAL_OUTPUT_PADDING_PX + 1))[:3] == (
            40,
            90,
            220,
        )
    with Image.open(workspace_root / "export" / "masks" / "element_001.png") as mask:
        assert mask.size == (6 + CODEX_FINAL_OUTPUT_PADDING_PX * 2, 4 + CODEX_FINAL_OUTPUT_PADDING_PX * 2)
        assert mask.getbbox() == (
            CODEX_FINAL_OUTPUT_PADDING_PX,
            CODEX_FINAL_OUTPUT_PADDING_PX,
            CODEX_FINAL_OUTPUT_PADDING_PX + 6,
            CODEX_FINAL_OUTPUT_PADDING_PX + 4,
        )
        assert mask.getpixel((CODEX_FINAL_OUTPUT_PADDING_PX + 2, CODEX_FINAL_OUTPUT_PADDING_PX + 1)) == 255
        assert mask.getpixel((0, 0)) == 0


def test_codex_final_generate_removes_stale_job_output_before_rerun(tmp_path: Path) -> None:
    provider = FreshOutputCodexAssetProvider()
    workspace_root = tmp_path / "workspace"
    client = TestClient(create_app(workspace_root, codex_asset_provider=provider))
    upload_scene_and_state(client)
    write_accepted_sam2_reference(workspace_root)
    stale_output = workspace_root / "elements" / "element_001" / "codex_final" / "job" / "final_asset.png"
    stale_output.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGBA", (8, 6), (255, 0, 0, 255)).save(stale_output, format="PNG")

    response = client.post("/api/workspace/elements/element_001/codex-final/generate")

    assert response.status_code == 200
    assert len(provider.requests) == 1
    assert provider.output_existed_when_called is False
    metadata = read_codex_final_request_metadata(workspace_root, "element_001")
    assert Path(metadata["outputPath"]).name == "candidate_asset.png"
    assert Path(metadata["rawOutputPath"]).name == "codex_raw.png"


def test_codex_final_generate_fails_when_provider_reuses_stale_fixed_job_output(tmp_path: Path) -> None:
    provider = NoOutputCodexAssetProvider()
    workspace_root = tmp_path / "workspace"
    client = TestClient(create_app(workspace_root, codex_asset_provider=provider))
    write_parent_child_sam2_references(workspace_root)
    stale_output = workspace_root / "elements" / "parent_001" / "codex_final" / "job" / "final_asset.png"
    stale_output.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGBA", (8, 6), (255, 0, 0, 255)).save(stale_output, format="PNG")

    response = client.post("/api/workspace/elements/parent_001/codex-final/generate")

    assert response.status_code == 502
    assert response.json()["detail"] == "Codex CLI did not create codex_raw.png."
    assert not (workspace_root / "elements" / "parent_001" / "codex_final" / "transparent_asset.png").exists()


def test_codex_final_generate_rejects_output_identical_to_mask_sticker(tmp_path: Path) -> None:
    provider = CopyCutoutCodexAssetProvider()
    workspace_root = tmp_path / "workspace"
    client = TestClient(create_app(workspace_root, codex_asset_provider=provider))
    write_parent_child_sam2_references(workspace_root)

    response = client.post("/api/workspace/elements/parent_001/codex-final/generate")

    assert response.status_code == 502
    assert response.json()["detail"] == "Codex final candidate failed quality gate: near_copy_of_sam2_cutout"
    report = json.loads((Path(getattr(provider.requests[0], "work_dir")) / "quality_report.json").read_text())
    assert report["status"] == "failed"
    assert "near_copy_of_sam2_cutout" in report["errors"]
    assert not (workspace_root / "elements" / "parent_001" / "codex_final" / "transparent_asset.png").exists()


def test_codex_final_generate_rejects_output_visually_too_similar_to_mask_sticker(tmp_path: Path) -> None:
    provider = NearCopyCutoutCodexAssetProvider()
    workspace_root = tmp_path / "workspace"
    client = TestClient(create_app(workspace_root, codex_asset_provider=provider))
    write_parent_child_sam2_references(workspace_root)

    response = client.post("/api/workspace/elements/parent_001/codex-final/generate")

    assert response.status_code == 502
    assert response.json()["detail"] == "Codex final candidate failed quality gate: near_copy_of_sam2_cutout"
    report = json.loads((Path(getattr(provider.requests[0], "work_dir")) / "quality_report.json").read_text())
    assert report["status"] == "failed"
    assert "near_copy_of_sam2_cutout" in report["errors"]
    assert not (workspace_root / "elements" / "parent_001" / "codex_final" / "transparent_asset.png").exists()


def test_codex_final_generate_allows_semantic_completion_to_expand_reference_alpha(
    tmp_path: Path,
) -> None:
    provider = FakeCodexAssetProvider(output_size=(16, 12))
    workspace_root = tmp_path / "workspace"
    client = TestClient(create_app(workspace_root, codex_asset_provider=provider))
    upload_scene_and_state(client)
    write_accepted_sam2_reference(workspace_root)

    response = client.post("/api/workspace/elements/element_001/codex-final/generate")

    assert response.status_code == 200
    final_asset = workspace_root / "elements" / "element_001" / "codex_final" / "transparent_asset.png"
    with Image.open(final_asset) as image:
        rgba = image.convert("RGBA")
        assert rgba.size == (6 + CODEX_FINAL_OUTPUT_PADDING_PX * 2, 4 + CODEX_FINAL_OUTPUT_PADDING_PX * 2)
        assert rgba.getchannel("A").getbbox() == (
            CODEX_FINAL_OUTPUT_PADDING_PX,
            CODEX_FINAL_OUTPUT_PADDING_PX,
            CODEX_FINAL_OUTPUT_PADDING_PX + 6,
            CODEX_FINAL_OUTPUT_PADDING_PX + 4,
        )


def test_codex_final_generate_requires_cutout_reference(tmp_path: Path) -> None:
    provider = FakeCodexAssetProvider()
    client = TestClient(create_app(tmp_path / "workspace", codex_asset_provider=provider))
    upload_scene_and_state(client)

    response = client.post("/api/workspace/elements/element_001/codex-final/generate")

    assert response.status_code == 400
    assert response.json()["detail"] == "Codex generation requires a SAM2 transparent asset."
    assert provider.requests == []


def test_codex_parent_generation_inpaints_parent_without_removed_children(tmp_path: Path) -> None:
    provider = FakeCodexAssetProvider(output_size=(44, 44))
    workspace_root = tmp_path / "workspace"
    client = TestClient(create_app(workspace_root, codex_asset_provider=provider))
    write_parent_child_sam2_references(workspace_root)

    response = client.post(
        "/api/workspace/elements/parent_001/codex-final/generate",
        json={"promptHint": "keep the same front-facing shelf angle"},
    )

    assert response.status_code == 200
    request = provider.requests[0]
    prompt = getattr(request, "prompt")
    assert "Repair only the removed-child hole regions in the parent asset." in prompt
    assert "Do not redraw unchanged parent pixels." in prompt
    assert "FAITHFUL REDRAW REQUIREMENT" not in prompt
    assert "layout_guide" not in prompt
    assert "parent asset with removable child objects" in prompt
    assert "Removed child objects: bottle, plant" in prompt
    assert "Do not regenerate the removed child objects" in prompt
    assert "Inpaint and complete only the parent structure" in prompt
    assert "shelves, cabinet panels" not in prompt
    assert "walls, wood grain" not in prompt
    assert "source crop content not listed as removed child metadata must stay visible" in prompt
    assert "Do not simplify, empty, replace, or redesign the parent as a generic clean object" in prompt
    assert "User prompt hint, subordinate to the rules above: keep the same front-facing shelf angle" in prompt
    relative_inputs = [
        str(Path(path).relative_to(workspace_root)).replace("\\", "/")
        for path in getattr(request, "image_paths")
    ]
    assert "elements/child_001/sam2_edge/mask.png" in relative_inputs
    assert "elements/child_002/sam2_edge/mask.png" in relative_inputs

    body = response.json()
    assert body["element"]["generationProfile"] == "parent_inpaint_without_children"
    assert body["element"]["sourcePromptHint"] == "keep the same front-facing shelf angle"
    assert body["generation"]["generationProfile"] == "parent_inpaint_without_children"
    assert [child["name"] for child in body["generation"]["removedChildren"]] == ["bottle", "plant"]
    metadata = json.loads(
        (workspace_root / "elements" / "parent_001" / "codex_final" / "generation.json").read_text(encoding="utf-8")
    )
    assert metadata["generationProfile"] == "parent_inpaint_without_children"
    assert metadata["promptHint"] == "keep the same front-facing shelf angle"


def test_codex_generation_metadata_request_is_readable_for_review_panel(tmp_path: Path) -> None:
    provider = FakeCodexAssetProvider()
    workspace_root = tmp_path / "workspace"
    client = TestClient(create_app(workspace_root, codex_asset_provider=provider))
    upload_scene_and_state(client)
    write_accepted_sam2_reference(workspace_root)
    generate_response = client.post("/api/workspace/elements/element_001/codex-final/generate")
    assert generate_response.status_code == 200

    response = client.get("/api/workspace/elements/element_001/codex-final/request")

    assert response.status_code == 200
    body = response.json()
    assert body["provider"] == "codex_cli"
    assert body["generationProfile"] == "sticker_completion"
    assert body["assetPath"] == "elements/element_001/codex_final/transparent_asset.png"
    assert body["outputPath"].startswith("elements/element_001/codex_final/job/")
    assert body["outputPath"].endswith("/candidate_asset.png")
    assert body["promptPath"].startswith("elements/element_001/codex_final/job/")
    assert body["promptPath"].endswith("/prompt.md")
    assert body["briefImagePath"].startswith("elements/element_001/codex_final/job/")
    assert body["briefImagePath"].endswith("/generation_brief.png")
    assert body["briefJsonPath"].startswith("elements/element_001/codex_final/job/")
    assert body["briefJsonPath"].endswith("/generation_brief.json")
    assert body["jobId"]
    assert body["referenceSha256"]
    assert body["outputSha256"]
    assert body["isOutputIdenticalToReference"] is False
    assert body["inputImagePaths"] == [
        "elements/element_001/sam2_edge/source_crop.png",
        "elements/element_001/sam2_edge/transparent_asset.png",
        "elements/element_001/sam2_edge/mask.png",
    ]
    assert body["inputImages"] == [
        {
            "path": "elements/element_001/sam2_edge/source_crop.png",
            "role": "source_crop",
            "required": True,
        },
        {
            "path": "elements/element_001/sam2_edge/transparent_asset.png",
            "role": "transparent_cutout",
            "required": True,
        },
        {
            "path": "elements/element_001/sam2_edge/mask.png",
            "role": "mask",
            "required": True,
        },
    ]
    assert body["removedChildren"] == []
    assert body["promptHint"] is None
    assert body["createdAt"]
    assert len(provider.requests) == 1
    assert "source_crop is the highest-authority reference" in body["prompt"]


def test_legacy_codex_generation_metadata_defaults_input_images_to_empty_list(tmp_path: Path) -> None:
    workspace_root = tmp_path / "workspace"
    metadata_file = workspace_root / "elements" / "element_001" / "codex_final" / "generation.json"
    metadata_file.parent.mkdir(parents=True, exist_ok=True)
    metadata_file.write_text(
        json.dumps({
            "provider": "codex_cli",
            "inputImagePaths": ["elements/element_001/sam2_edge/source_crop.png"],
        }),
        encoding="utf-8",
    )

    metadata = read_codex_final_request_metadata(workspace_root, "element_001")

    assert metadata["inputImagePaths"] == ["elements/element_001/sam2_edge/source_crop.png"]
    assert metadata["inputImages"] == []


def test_missing_codex_generation_metadata_returns_404(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "workspace"))
    upload_scene_and_state(client)

    response = client.get("/api/workspace/elements/element_001/codex-final/request")

    assert response.status_code == 404
    assert response.json()["detail"] == "Codex request metadata not found."


def test_codex_child_generation_uses_standalone_profile(tmp_path: Path) -> None:
    provider = FakeCodexAssetProvider()
    workspace_root = tmp_path / "workspace"
    client = TestClient(create_app(workspace_root, codex_asset_provider=provider))
    write_parent_child_sam2_references(workspace_root)

    response = client.post("/api/workspace/elements/child_001/codex-final/generate")

    assert response.status_code == 200
    assert len(provider.requests) == 1
    prompt = response.json()["generation"]["prompt"]
    assert "removable child asset" in prompt
    assert "Generate only the requested child asset as a standalone RGB image" in prompt
    assert "Do not use transparent_cutout pixels as output pixels" in prompt
    assert "Do not include its parent container" in prompt
    assert "same isometric angle, color, scale, and local layout shown by source_crop" in prompt
    assert response.json()["element"]["generationProfile"] == "child_standalone"


def _workspace_state(workspace_root: Path) -> WorkspaceState:
    return WorkspaceState.model_validate_json((workspace_root / "state.json").read_text(encoding="utf-8"))


def _rewrite_single_element(
    workspace_root: Path,
    *,
    name: str,
    label: str,
    asset_role: str,
) -> None:
    state_path = workspace_root / "state.json"
    state = json.loads(state_path.read_text(encoding="utf-8"))
    element = state["elements"][0]
    element["name"] = name
    element["label"] = label
    element["assetRole"] = asset_role
    state_path.write_text(json.dumps(state), encoding="utf-8")


def _write_codex_failed_candidate(workspace_root: Path, element_id: str, job_id: str) -> Path:
    job_dir = workspace_root / "elements" / element_id / "codex_final" / "job" / job_id
    _write_reported_candidate(job_dir, "failed")
    return job_dir / "candidate_asset.png"


def _write_reported_candidate(job_dir: Path, status: str) -> None:
    job_dir.mkdir(parents=True, exist_ok=True)
    Image.new("RGBA", (8, 6), (221, 90, 40, 255)).save(job_dir / "candidate_asset.png", format="PNG")
    _write_report_only(job_dir, status)


def _write_candidate_only(job_dir: Path) -> None:
    job_dir.mkdir(parents=True, exist_ok=True)
    Image.new("RGBA", (8, 6), (221, 90, 40, 255)).save(job_dir / "candidate_asset.png", format="PNG")


def _write_report_only(job_dir: Path, status: str) -> None:
    job_dir.mkdir(parents=True, exist_ok=True)
    (job_dir / "quality_report.json").write_text(json.dumps({"status": status}), encoding="utf-8")


def _codex_final_job_with_work_dir(work_dir_path: str) -> CodexFinalJob:
    return CodexFinalJob(
        jobId="job_old",
        elementId="element_001",
        elementName="Sticker",
        status="ready_for_agent",
        message="Waiting for Codex agent raw image.",
        workDirPath=work_dir_path,
        promptPath=f"{work_dir_path}/prompt.md",
        briefImagePath=f"{work_dir_path}/generation_brief.png",
        briefJsonPath=f"{work_dir_path}/generation_brief.json",
        rawOutputPath=f"{work_dir_path}/codex_raw.png",
        finalOutputPath=f"{work_dir_path}/candidate_asset.png",
        metadataPath="elements/element_001/codex_final/generation.json",
        inputImages=[],
        generationProfile="sticker_completion",
    )


def _assert_prompt_input_role_lines(prompt: str, expected_prefixes: list[str]) -> None:
    lines = prompt.splitlines()
    start = lines.index("INPUT IMAGE ROLES, IN EXACT ORDER:") + 1
    end = lines.index("", start)
    role_lines = lines[start:end]
    assert len(role_lines) == len(expected_prefixes)
    for line, prefix in zip(role_lines, expected_prefixes, strict=True):
        assert line.startswith(prefix)
