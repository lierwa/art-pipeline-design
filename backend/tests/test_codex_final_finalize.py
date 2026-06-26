from __future__ import annotations

import json
import os
from pathlib import Path

import pytest
from PIL import Image

import art_pipeline.codex_assets as codex_assets
import art_pipeline.codex_postprocess as codex_postprocess
from art_pipeline.codex_final_inputs import codex_final_job_inputs
from art_pipeline.codex_final_jobs import (
    CodexFinalJob,
    CodexFinalJobManifest,
    read_codex_final_job_manifest,
    write_codex_final_job_manifest,
)
from art_pipeline.elements import WorkspaceState
from codex_final_fixtures import (
    write_accepted_sam2_reference,
    write_parent_child_sam2_references,
    write_semantic_rgb_output,
)


def test_finalize_codex_final_job_accepts_prepared_raw_output_path(
    tmp_path: Path,
) -> None:
    workspace_root = tmp_path / "workspace"
    write_accepted_sam2_reference(workspace_root)
    state = WorkspaceState.model_validate_json((workspace_root / "state.json").read_text(encoding="utf-8"))
    prepared = codex_assets.prepare_codex_final_job(workspace_root, state, "element_001")
    _write_mask_aligned_rgb_output(prepared.raw_output_path, prepared)

    next_state, updated, generation = codex_assets.finalize_codex_final_job(
        workspace_root,
        state,
        prepared,
        prepared.raw_output_path,
        "codex_agent",
        {"codexThreadId": "thread_codex_123"},
    )

    assert prepared.raw_output_path.exists()
    assert updated.sourceProvider == "codex_agent"
    assert next_state.elements[0].sourceProvider == "codex_agent"
    assert generation["provider"] == "codex_agent"
    assert generation["promptPath"] == prepared.prompt_path.relative_to(workspace_root).as_posix()
    assert generation["briefImagePath"] == prepared.brief_image_path.relative_to(workspace_root).as_posix()
    assert generation["briefJsonPath"] == prepared.brief_json_path.relative_to(workspace_root).as_posix()
    assert generation["inputImagePaths"] == [
        "elements/element_001/sam2_edge/source_crop.png",
        "elements/element_001/sam2_edge/transparent_asset.png",
        "elements/element_001/sam2_edge/mask.png",
    ]
    assert generation["codexThreadId"] == "thread_codex_123"


def test_finalize_codex_final_job_records_raw_and_transparency_timing(
    tmp_path: Path,
) -> None:
    workspace_root = tmp_path / "workspace"
    write_accepted_sam2_reference(workspace_root)
    state = WorkspaceState.model_validate_json((workspace_root / "state.json").read_text(encoding="utf-8"))
    prepared = codex_assets.prepare_codex_final_job(workspace_root, state, "element_001")
    _write_mask_aligned_rgb_output(prepared.raw_output_path, prepared)

    _next_state, _updated, generation = codex_assets.finalize_codex_final_job(
        workspace_root,
        state,
        prepared,
        prepared.raw_output_path,
        "codex_agent",
    )

    timing = generation["timing"]
    for key in (
        "materializeRawSeconds",
        "transparentFinalizeSeconds",
        "copySourceCropSeconds",
        "metadataWriteSeconds",
        "finalizeTotalSeconds",
    ):
        assert isinstance(timing[key], float)
        assert timing[key] >= 0
    metadata = json.loads((workspace_root / generation["metadataPath"]).read_text(encoding="utf-8"))
    assert metadata["timing"] == timing


def test_finalize_writes_candidate_before_promoting_canonical_final(
    tmp_path: Path,
) -> None:
    workspace_root = tmp_path / "workspace"
    write_accepted_sam2_reference(workspace_root)
    state = WorkspaceState.model_validate_json((workspace_root / "state.json").read_text(encoding="utf-8"))
    prepared = codex_assets.prepare_codex_final_job(workspace_root, state, "element_001")
    _write_mask_aligned_rgb_output(prepared.raw_output_path, prepared)

    _next_state, _updated, generation = codex_assets.finalize_codex_final_job(
        workspace_root,
        state,
        prepared,
        prepared.raw_output_path,
        "codex_agent",
    )

    assert Path(generation["outputPath"]).name == "candidate_asset.png"
    assert (workspace_root / generation["assetPath"]).exists()


def test_finalize_merges_postprocess_warnings_into_generation_and_quality_report(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace_root = tmp_path / "workspace"
    write_accepted_sam2_reference(workspace_root)
    state = WorkspaceState.model_validate_json((workspace_root / "state.json").read_text(encoding="utf-8"))
    prepared = codex_assets.prepare_codex_final_job(workspace_root, state, "element_001")
    _write_mask_aligned_rgb_output(prepared.raw_output_path, prepared)

    def finalize_with_warning(
        raw_file: Path,
        candidate_file: Path,
        reference_file: Path,
        chroma_key: tuple[int, int, int],
    ) -> dict[str, object]:
        Image.new("RGBA", (8, 7), (12, 180, 90, 255)).save(candidate_file, format="PNG")
        return {
            "referenceSha256": "reference-sha",
            "rawOutputSha256": "raw-sha",
            "outputSha256": "output-sha",
            "rawForegroundBbox": [0, 0, 20, 20],
            "cleanedForegroundBbox": [5, 5, 15, 15],
            "trimmedOutputBbox": [0, 0, 8, 7],
            "outputWidth": 8,
            "outputHeight": 7,
            "retainedComponentCount": 1,
            "removedComponentCount": 20,
            "removedComponentArea": 20,
            "postprocessWarnings": ["small_components_removed"],
            "isOutputIdenticalToReference": False,
        }

    monkeypatch.setattr(codex_assets, "finalize_codex_raw_output", finalize_with_warning)

    _next_state, _updated, generation = codex_assets.finalize_codex_final_job(
        workspace_root,
        state,
        prepared,
        prepared.raw_output_path,
        "codex_agent",
    )

    metadata = json.loads((workspace_root / generation["metadataPath"]).read_text(encoding="utf-8"))
    quality_report = json.loads(prepared.quality_report_path.read_text(encoding="utf-8"))
    assert generation["postprocessWarnings"] == ["small_components_removed"]
    assert "small_components_removed" in generation["qualityWarnings"]
    assert metadata["postprocessWarnings"] == ["small_components_removed"]
    assert "small_components_removed" in metadata["qualityWarnings"]
    assert "small_components_removed" in quality_report["warnings"]


def test_generate_codex_final_asset_requires_provider_raw_output_for_normal_asset(
    tmp_path: Path,
) -> None:
    workspace_root = tmp_path / "workspace"
    write_accepted_sam2_reference(workspace_root)
    state = WorkspaceState.model_validate_json((workspace_root / "state.json").read_text(encoding="utf-8"))
    provider = _MaskAlignedOutputProvider()

    next_state, updated, generation = codex_assets.generate_codex_final_asset(
        workspace_root,
        state,
        "element_001",
        provider,
    )

    assert provider.request_count == 1
    assert updated.sourceProvider == "codex_agent"
    assert next_state.elements[0].sourceProvider == "codex_agent"
    assert generation["provider"] == "codex_agent"
    assert generation["rawOutputPath"].endswith("/codex_raw.png")
    assert Path(generation["outputPath"]).name == "candidate_asset.png"
    with Image.open(workspace_root / generation["assetPath"]) as final:
        padding = codex_postprocess.CODEX_FINAL_OUTPUT_PADDING_PX
        assert final.convert("RGBA").size == (6 + padding * 2, 4 + padding * 2)
        assert final.getchannel("A").getbbox() == (padding, padding, padding + 6, padding + 4)


def test_parent_finalize_promotes_trimmed_raw_without_local_candidate_rewrite(
    tmp_path: Path,
) -> None:
    workspace_root = tmp_path / "workspace"
    write_parent_child_sam2_references(workspace_root)
    state = WorkspaceState.model_validate_json((workspace_root / "state.json").read_text(encoding="utf-8"))
    prepared = codex_assets.prepare_codex_final_job(workspace_root, state, "parent_001")
    write_semantic_rgb_output(prepared.raw_output_path, prepared.chroma_key, (22, 22))

    _next_state, _updated, generation = codex_assets.finalize_codex_final_job(
        workspace_root,
        state,
        prepared,
        prepared.raw_output_path,
        "codex_agent",
    )

    with Image.open(workspace_root / generation["assetPath"]) as final_file:
        final = final_file.convert("RGBA")
    with Image.open(prepared.output_path) as candidate_file:
        candidate = candidate_file.convert("RGBA")

    padding = codex_postprocess.CODEX_FINAL_OUTPUT_PADDING_PX
    assert final.size == (11 + padding * 2, 11 + padding * 2)
    assert candidate.size == final.size
    assert final.getchannel("A").getbbox() == (padding, padding, padding + 11, padding + 11)
    assert final.getpixel((0, 0))[3] == 0
    assert final.getpixel((padding, padding)) == (40, 90, 220, 255)
    assert generation["outputPath"] == prepared.output_path.relative_to(workspace_root).as_posix()
    metadata = json.loads((workspace_root / generation["metadataPath"]).read_text(encoding="utf-8"))
    assert "parentRepairBasePath" not in metadata
    assert "parentRepairRawCandidatePath" not in metadata
    assert "spatialNormalized" not in metadata


def test_finalize_does_not_overwrite_previous_final_when_candidate_quality_fails(
    tmp_path: Path,
) -> None:
    workspace_root = tmp_path / "workspace"
    write_accepted_sam2_reference(workspace_root)
    state = WorkspaceState.model_validate_json((workspace_root / "state.json").read_text(encoding="utf-8"))
    prepared = codex_assets.prepare_codex_final_job(workspace_root, state, "element_001")
    final_asset_path = workspace_root / "elements" / "element_001" / "codex_final" / "transparent_asset.png"
    final_asset_path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGBA", (8, 6), (90, 40, 210, 255)).save(final_asset_path, format="PNG")
    previous_bytes = final_asset_path.read_bytes()
    Image.new("RGB", (8, 6), prepared.chroma_key).save(prepared.raw_output_path, format="PNG")

    with pytest.raises(RuntimeError, match="Codex final candidate failed quality gate"):
        codex_assets.finalize_codex_final_job(
            workspace_root,
            state,
            prepared,
            prepared.raw_output_path,
            "codex_agent",
        )

    assert final_asset_path.read_bytes() == previous_bytes
    quality_report_path = prepared.work_dir / "quality_report.json"
    quality_report = json.loads(quality_report_path.read_text(encoding="utf-8"))
    assert quality_report["status"] == "failed"
    assert "empty_alpha" in quality_report["errors"]
    assert quality_report["repairNote"] == "Candidate has no visible subject."


def test_promote_candidate_keeps_previous_final_when_replace_fails(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    candidate_file = tmp_path / "candidate_asset.png"
    target_file = tmp_path / "codex_final" / "transparent_asset.png"
    candidate_file.parent.mkdir(parents=True, exist_ok=True)
    target_file.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGBA", (4, 4), (12, 180, 90, 255)).save(candidate_file, format="PNG")
    Image.new("RGBA", (4, 4), (90, 40, 210, 255)).save(target_file, format="PNG")
    previous_bytes = target_file.read_bytes()
    original_save = Image.Image.save

    def fail_direct_target_save(self: Image.Image, fp: object, *args: object, **kwargs: object) -> None:
        if Path(fp) == target_file:
            target_file.write_bytes(b"truncated")
            raise OSError("direct target write failed")
        original_save(self, fp, *args, **kwargs)

    def fail_replace(_source: object, _target: object) -> None:
        raise OSError("replace failed")

    monkeypatch.setattr(Image.Image, "save", fail_direct_target_save)
    monkeypatch.setattr(os, "replace", fail_replace)

    with pytest.raises(OSError, match="replace failed"):
        codex_postprocess.promote_codex_final_candidate(candidate_file, target_file)

    assert target_file.read_bytes() == previous_bytes


def test_finalize_codex_final_job_rejects_workspace_relative_selected_source(
    tmp_path: Path,
) -> None:
    workspace_root = tmp_path / "workspace"
    write_accepted_sam2_reference(workspace_root)
    state = WorkspaceState.model_validate_json((workspace_root / "state.json").read_text(encoding="utf-8"))
    prepared = codex_assets.prepare_codex_final_job(workspace_root, state, "element_001")
    selected_source = workspace_root / "scratch" / "agent_selected.png"
    _write_mask_aligned_rgb_output(selected_source, prepared)

    with pytest.raises(RuntimeError, match="outside allowed Codex source roots"):
        codex_assets.finalize_codex_final_job(
            workspace_root,
            state,
            prepared,
            Path("scratch/agent_selected.png"),
            "codex_agent",
        )

    assert not prepared.raw_output_path.exists()


def test_finalize_codex_final_job_rejects_absolute_source_outside_allowed_roots(
    tmp_path: Path,
) -> None:
    workspace_root = tmp_path / "workspace"
    write_accepted_sam2_reference(workspace_root)
    state = WorkspaceState.model_validate_json((workspace_root / "state.json").read_text(encoding="utf-8"))
    prepared = codex_assets.prepare_codex_final_job(workspace_root, state, "element_001")
    selected_source = tmp_path / "outside.png"
    write_semantic_rgb_output(selected_source, prepared.chroma_key, (8, 6))

    with pytest.raises(RuntimeError, match="outside allowed Codex source roots"):
        codex_assets.finalize_codex_final_job(
            workspace_root,
            state,
            prepared,
            selected_source.resolve(),
            "codex_agent",
        )

    assert not prepared.raw_output_path.exists()


def test_finalize_codex_final_job_rejects_workspace_absolute_selected_source(
    tmp_path: Path,
) -> None:
    workspace_root = tmp_path / "workspace"
    write_accepted_sam2_reference(workspace_root)
    state = WorkspaceState.model_validate_json((workspace_root / "state.json").read_text(encoding="utf-8"))
    prepared = codex_assets.prepare_codex_final_job(workspace_root, state, "element_001")
    selected_source = workspace_root / "scratch" / "absolute_agent_selected.png"
    write_semantic_rgb_output(selected_source, prepared.chroma_key, (8, 6))

    with pytest.raises(RuntimeError, match="outside allowed Codex source roots"):
        codex_assets.finalize_codex_final_job(
            workspace_root,
            state,
            prepared,
            selected_source.resolve(),
            "codex_agent",
        )

    assert not prepared.raw_output_path.exists()


def test_finalize_codex_final_job_accepts_generated_images_source(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace_root = tmp_path / "workspace"
    codex_home = tmp_path / "codex-home"
    monkeypatch.setenv("CODEX_HOME", str(codex_home))
    write_accepted_sam2_reference(workspace_root)
    state = WorkspaceState.model_validate_json((workspace_root / "state.json").read_text(encoding="utf-8"))
    prepared = codex_assets.prepare_codex_final_job(workspace_root, state, "element_001")
    selected_source = codex_home / "generated_images" / "thread_001" / "image.png"
    _write_mask_aligned_rgb_output(selected_source, prepared)
    os.utime(selected_source, (1, 1))

    _next_state, updated, generation = codex_assets.finalize_codex_final_job(
        workspace_root,
        state,
        prepared,
        selected_source.resolve(),
        "codex_agent",
    )

    assert prepared.raw_output_path.read_bytes() == selected_source.read_bytes()
    assert updated.sourceProvider == "codex_agent"
    assert generation["provider"] == "codex_agent"


def test_manifest_job_reconstructs_prepared_job_for_finalize_without_prepare(
    tmp_path: Path,
) -> None:
    workspace_root = tmp_path / "workspace"
    write_accepted_sam2_reference(workspace_root)
    state = WorkspaceState.model_validate_json((workspace_root / "state.json").read_text(encoding="utf-8"))
    prepared = codex_assets.prepare_codex_final_job(workspace_root, state, "element_001")
    manifest = CodexFinalJobManifest(
        version=1,
        taskId="task_202606240000000000_ab12cd",
        createdAt="2026-06-24T00:00:00+00:00",
        jobs=[_manifest_job_from_prepared(workspace_root, prepared)],
    )
    write_codex_final_job_manifest(workspace_root, manifest)
    loaded_job = read_codex_final_job_manifest(workspace_root, manifest.taskId).jobs[0]

    reconstructed = codex_assets.prepared_codex_final_job_from_manifest_job(
        workspace_root,
        state,
        loaded_job,
    )
    _write_mask_aligned_rgb_output(reconstructed.raw_output_path, reconstructed)
    _next_state, updated, generation = codex_assets.finalize_codex_final_job(
        workspace_root,
        state,
        reconstructed,
        Path(loaded_job.rawOutputPath),
        "codex_agent",
        {"codexThreadId": "thread_from_manifest"},
    )

    assert updated.sourceProvider == "codex_agent"
    assert generation["jobId"] == loaded_job.jobId
    assert generation["inputImagePaths"] == [item.path for item in loaded_job.inputImages]
    assert generation["codexThreadId"] == "thread_from_manifest"


def test_finalize_codex_final_job_rejects_selected_source_near_copy_with_quality_report(tmp_path: Path) -> None:
    workspace_root = tmp_path / "workspace"
    write_accepted_sam2_reference(workspace_root)
    state = WorkspaceState.model_validate_json((workspace_root / "state.json").read_text(encoding="utf-8"))
    prepared = codex_assets.prepare_codex_final_job(workspace_root, state, "element_001")
    with Image.open(prepared.reference_asset_path) as reference:
        image = reference.convert("RGBA")
    image.putpixel((1, 1), (221, 90, 40, 255))
    image.save(prepared.raw_output_path, format="PNG")
    os.utime(prepared.raw_output_path, (1, 1))

    with pytest.raises(RuntimeError, match="Codex final candidate failed quality gate"):
        codex_assets.finalize_codex_final_job(
            workspace_root,
            state,
            prepared,
            prepared.raw_output_path,
            "codex_agent",
        )

    quality_report = json.loads((prepared.work_dir / "quality_report.json").read_text(encoding="utf-8"))
    assert quality_report["status"] == "failed"
    assert "near_copy_of_sam2_cutout" in quality_report["errors"]
    assert not (workspace_root / "elements" / "element_001" / "codex_final" / "transparent_asset.png").exists()


def _manifest_job_from_prepared(
    workspace_root: Path,
    prepared: codex_assets.PreparedCodexFinalJob,
) -> CodexFinalJob:
    return CodexFinalJob(
        jobId=prepared.work_dir.name,
        elementId=prepared.element.id,
        elementName=prepared.element.name,
        status="ready_for_agent",
        message="Waiting for Codex agent raw image.",
        workDirPath=prepared.work_dir.relative_to(workspace_root).as_posix(),
        promptPath=prepared.prompt_path.relative_to(workspace_root).as_posix(),
        briefImagePath=prepared.brief_image_path.relative_to(workspace_root).as_posix(),
        briefJsonPath=prepared.brief_json_path.relative_to(workspace_root).as_posix(),
        rawOutputPath=prepared.raw_output_path.relative_to(workspace_root).as_posix(),
        finalOutputPath=prepared.output_path.relative_to(workspace_root).as_posix(),
        metadataPath=prepared.paths["metadataPath"],
        inputImages=codex_final_job_inputs(prepared.input_images),
        promptHint=prepared.prompt_hint or "",
        generationProfile=prepared.generation_profile,
        removedChildren=[],
    )


class _MaskAlignedOutputProvider:
    name = "codex_agent"

    def __init__(self) -> None:
        self.request_count = 0

    def generate(self, request: codex_assets.CodexAssetRequest) -> dict[str, object]:
        self.request_count += 1
        request.raw_output_path.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(request.mask_path) as mask_file:
            mask = mask_file.convert("L")
        image = Image.new("RGB", mask.size, request.chroma_key)
        for y in range(mask.height):
            for x in range(mask.width):
                if mask.getpixel((x, y)) > 0:
                    image.putpixel((x, y), (40, 90, 220))
        image.save(request.raw_output_path, format="PNG")
        return {"codexThreadId": "thread_codex_provider"}


def _write_mask_aligned_rgb_output(
    path: Path,
    prepared: codex_assets.PreparedCodexFinalJob,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(prepared.mask_path) as mask_file:
        mask = mask_file.convert("L")
    image = Image.new("RGB", mask.size, prepared.chroma_key)
    for y in range(mask.height):
        for x in range(mask.width):
            if mask.getpixel((x, y)) > 0:
                image.putpixel((x, y), (40, 90, 220))
    image.save(path, format="PNG")
