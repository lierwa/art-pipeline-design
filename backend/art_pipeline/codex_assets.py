from __future__ import annotations

import json
import time
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, Protocol, Sequence, cast
from uuid import uuid4

from art_pipeline.codex_final_analysis_mask import write_codex_final_analysis_mask
from art_pipeline.codex_final_brief import (
    CodexFinalBriefRemovedChild,
    render_codex_final_brief,
)
from art_pipeline.codex_final_prompt import (
    CodexFinalPromptRemovedChild,
    build_codex_final_prompt,
    normalize_codex_prompt_hint,
)
from art_pipeline.codex_final_inputs import (
    MASK_ROLE,
    SOURCE_CROP_ROLE,
    TRANSPARENT_CUTOUT_ROLE,
    CodexFinalInputImage,
    build_codex_final_input_images,
    codex_final_input_images_from_job_inputs,
    required_input_path,
    resolve_codex_final_input_paths,
)
from art_pipeline.codex_final_quality import (
    CodexFinalQualityReport,
    assess_codex_final_candidate,
    write_codex_final_quality_report,
)
from art_pipeline.codex_final_jobs import CodexFinalJob
from art_pipeline.codex_final_paths import (
    CODEX_FINAL_CANDIDATE_FILENAME,
    CODEX_FINAL_STAGE,
    codex_final_asset_path,
    codex_final_paths,
    has_codex_final_asset,
    read_codex_final_request_metadata,
)
from art_pipeline.codex_final_sources import (
    copy_codex_source_crop,
    materialize_codex_selected_source,
)
from art_pipeline.codex_postprocess import (
    choose_chroma_key,
    finalize_codex_raw_output,
    promote_codex_final_candidate,
)
from art_pipeline.elements import ElementRecord, GenerationProfile, WorkspaceState
from art_pipeline.exporting.files import resolve_workspace_path
from art_pipeline.segment.assets import sam2_edge_paths


@dataclass(frozen=True)
class CodexAssetRequest:
    element_id: str
    element_name: str
    reference_image_path: Path
    source_crop_path: Path
    mask_path: Path
    image_paths: tuple[Path, ...]
    output_path: Path
    raw_output_path: Path
    work_dir: Path
    chroma_key: tuple[int, int, int]
    prompt: str


@dataclass(frozen=True)
class PreparedCodexFinalJob:
    element: ElementRecord
    generation_profile: GenerationProfile
    removed_children: tuple["RemovedChildContext", ...]
    prompt_hint: str | None
    paths: dict[str, str]
    source_crop_workspace_path: str
    reference_asset_workspace_path: str
    mask_workspace_path: str
    input_images: tuple[CodexFinalInputImage, ...]
    reference_asset_path: Path
    source_crop_path: Path
    mask_path: Path
    analysis_mask_path: Path
    quality_report_path: Path
    final_asset_path: Path
    final_source_crop_path: Path
    work_dir: Path
    output_path: Path
    raw_output_path: Path
    prompt_path: Path
    brief_image_path: Path
    brief_json_path: Path
    chroma_key: tuple[int, int, int]
    prompt: str
    request: CodexAssetRequest


@dataclass(frozen=True)
class RemovedChildContext:
    element_id: str
    name: str
    mask_path: str
    bbox: dict[str, int]
    canvas: dict[str, int]


CodexPromptHint = str | None


class CodexAssetProvider(Protocol):
    name: str

    def generate(self, request: CodexAssetRequest) -> dict[str, Any] | None:
        ...


def generate_codex_final_asset(
    workspace_root: Path,
    state: WorkspaceState,
    element_id: str,
    provider: CodexAssetProvider,
    prompt_hint: CodexPromptHint = None,
) -> tuple[WorkspaceState, ElementRecord, dict[str, Any]]:
    prepared = prepare_codex_final_job(workspace_root, state, element_id, prompt_hint)
    request_started_ns = time.time_ns()
    provider_metadata = provider.generate(prepared.request) or {}
    return finalize_codex_final_job(
        workspace_root,
        state,
        prepared,
        prepared.raw_output_path,
        provider.name,
        provider_metadata,
        request_started_ns=request_started_ns,
    )


def prepare_codex_final_job(
    workspace_root: Path,
    state: WorkspaceState,
    element_id: str,
    prompt_hint: CodexPromptHint = None,
) -> PreparedCodexFinalJob:
    element = _find_element(state, element_id)
    removed_children = tuple(_removed_child_contexts(workspace_root, state, element))
    generation_profile = _generation_profile(element, removed_children)
    reference_asset_path = sam2_edge_paths(element.id)["assetPath"]
    source_crop_path = sam2_edge_paths(element.id)["sourceCropPath"]
    mask_path = sam2_edge_paths(element.id)["maskPath"]
    reference_asset_file = resolve_workspace_path(workspace_root, reference_asset_path)
    source_crop_file = resolve_workspace_path(workspace_root, source_crop_path)
    mask_file = resolve_workspace_path(workspace_root, mask_path)
    if not reference_asset_file.exists():
        raise ValueError("Codex generation requires a SAM2 transparent asset.")
    if not source_crop_file.exists():
        raise ValueError("Codex generation requires a SAM2 source crop.")
    if not mask_file.exists():
        raise ValueError("Codex generation requires a SAM2 mask.")

    paths = codex_final_paths(element.id)
    final_asset_file = resolve_workspace_path(workspace_root, paths["assetPath"])
    final_source_crop_file = resolve_workspace_path(workspace_root, paths["sourceCropPath"])
    job_id = _new_codex_job_id()
    work_dir = resolve_workspace_path(workspace_root, f"elements/{element.id}/{CODEX_FINAL_STAGE}/job/{job_id}")
    work_dir.mkdir(parents=True, exist_ok=True)
    output_file = work_dir / CODEX_FINAL_CANDIDATE_FILENAME
    raw_output_file = work_dir / "codex_raw.png"
    prompt_file = work_dir / "prompt.md"
    brief_image_file = work_dir / "generation_brief.png"
    brief_json_file = work_dir / "generation_brief.json"
    analysis_mask_file = work_dir / "analysis_mask.png"
    quality_report_file = work_dir / "quality_report.json"
    chroma_key = choose_chroma_key(source_crop_file)
    write_codex_final_analysis_mask(mask_file, analysis_mask_file)
    render_codex_final_brief(
        workspace_root,
        source_crop_path=source_crop_path,
        rough_cutout_path=reference_asset_path,
        mask_path=mask_path,
        target_canvas=(element.canvas or element.bbox).model_dump(mode="json"),
        removed_children=_brief_removed_children(removed_children),
        image_path=brief_image_file,
        json_path=brief_json_file,
    )
    input_images = build_codex_final_input_images(
        source_crop_path=source_crop_path,
        transparent_cutout_path=reference_asset_path,
        mask_path=mask_path,
        removed_child_mask_paths=tuple(child.mask_path for child in removed_children),
    )
    # WHY: prompt 的编号必须跟实际发送给 Codex 的 input_images 完全一致。
    # 这里让 input_images 成为唯一顺序来源，避免 optional repair roles 缺省时错位。
    prompt = build_codex_final_prompt(
        element,
        generation_profile,
        _prompt_removed_children(removed_children),
        input_images,
        prompt_hint,
        chroma_key,
    )
    prompt_file.write_text(prompt, encoding="utf-8")
    image_paths = resolve_codex_final_input_paths(workspace_root, input_images)

    request = CodexAssetRequest(
        element_id=element.id,
        element_name=element.name,
        reference_image_path=reference_asset_file,
        source_crop_path=source_crop_file,
        mask_path=mask_file,
        image_paths=image_paths,
        output_path=output_file,
        raw_output_path=raw_output_file,
        work_dir=work_dir,
        chroma_key=chroma_key,
        prompt=prompt,
    )
    return PreparedCodexFinalJob(
        element=element,
        generation_profile=generation_profile,
        removed_children=removed_children,
        prompt_hint=normalize_codex_prompt_hint(prompt_hint),
        paths=paths,
        source_crop_workspace_path=source_crop_path,
        reference_asset_workspace_path=reference_asset_path,
        mask_workspace_path=mask_path,
        input_images=input_images,
        reference_asset_path=reference_asset_file,
        source_crop_path=source_crop_file,
        mask_path=mask_file,
        analysis_mask_path=analysis_mask_file,
        quality_report_path=quality_report_file,
        final_asset_path=final_asset_file,
        final_source_crop_path=final_source_crop_file,
        work_dir=work_dir,
        output_path=output_file,
        raw_output_path=raw_output_file,
        prompt_path=prompt_file,
        brief_image_path=brief_image_file,
        brief_json_path=brief_json_file,
        chroma_key=chroma_key,
        prompt=prompt,
        request=request,
    )


def prepared_codex_final_job_from_manifest_job(
    workspace_root: Path,
    state: WorkspaceState,
    job: CodexFinalJob,
) -> PreparedCodexFinalJob:
    element = _find_element(state, job.elementId)
    input_images = codex_final_input_images_from_job_inputs(job.inputImages)
    source_crop_path = required_input_path(input_images, SOURCE_CROP_ROLE.role)
    reference_asset_path = required_input_path(input_images, TRANSPARENT_CUTOUT_ROLE.role)
    mask_path = required_input_path(input_images, MASK_ROLE.role)
    analysis_mask_path = _job_artifact_path(job, "analysis_mask.png", job.analysisMaskPath)
    quality_report_path = _job_artifact_path(job, "quality_report.json", job.qualityReportPath)
    source_crop_file = resolve_workspace_path(workspace_root, source_crop_path)
    reference_asset_file = resolve_workspace_path(workspace_root, reference_asset_path)
    mask_file = resolve_workspace_path(workspace_root, mask_path)
    prompt_file = resolve_workspace_path(workspace_root, job.promptPath)
    prompt = prompt_file.read_text(encoding="utf-8")
    paths = codex_final_paths(element.id)
    request = CodexAssetRequest(
        element_id=element.id,
        element_name=element.name,
        reference_image_path=reference_asset_file,
        source_crop_path=source_crop_file,
        mask_path=mask_file,
        image_paths=resolve_codex_final_input_paths(workspace_root, input_images),
        output_path=resolve_workspace_path(workspace_root, job.finalOutputPath),
        raw_output_path=resolve_workspace_path(workspace_root, job.rawOutputPath),
        work_dir=resolve_workspace_path(workspace_root, job.workDirPath),
        chroma_key=choose_chroma_key(source_crop_file),
        prompt=prompt,
    )
    return PreparedCodexFinalJob(
        element=element,
        generation_profile=cast(GenerationProfile, job.generationProfile),
        removed_children=_removed_child_contexts_from_manifest(state, job),
        prompt_hint=normalize_codex_prompt_hint(job.promptHint),
        paths=paths,
        source_crop_workspace_path=source_crop_path,
        reference_asset_workspace_path=reference_asset_path,
        mask_workspace_path=mask_path,
        input_images=input_images,
        reference_asset_path=reference_asset_file,
        source_crop_path=source_crop_file,
        mask_path=mask_file,
        analysis_mask_path=resolve_workspace_path(workspace_root, analysis_mask_path),
        quality_report_path=resolve_workspace_path(workspace_root, quality_report_path),
        final_asset_path=resolve_workspace_path(workspace_root, paths["assetPath"]),
        final_source_crop_path=resolve_workspace_path(workspace_root, paths["sourceCropPath"]),
        work_dir=request.work_dir,
        output_path=request.output_path,
        raw_output_path=request.raw_output_path,
        prompt_path=prompt_file,
        brief_image_path=resolve_workspace_path(workspace_root, job.briefImagePath),
        brief_json_path=resolve_workspace_path(workspace_root, job.briefJsonPath),
        chroma_key=request.chroma_key,
        prompt=prompt,
        request=request,
    )


def finalize_codex_final_job(
    workspace_root: Path,
    state: WorkspaceState,
    prepared: PreparedCodexFinalJob,
    selected_source_path: Path,
    provider_name: str,
    provider_metadata: dict[str, Any] | None = None,
    *,
    request_started_ns: int | None = None,
) -> tuple[WorkspaceState, ElementRecord, dict[str, Any]]:
    finalize_started = time.perf_counter()
    step_started = time.perf_counter()
    materialize_codex_selected_source(
        workspace_root,
        selected_source_path,
        prepared.raw_output_path,
        request_started_ns,
    )
    timing: dict[str, float] = {
        "materializeRawSeconds": _elapsed_seconds(step_started),
    }
    step_started = time.perf_counter()
    output_diagnostics = finalize_codex_raw_output(
        prepared.raw_output_path,
        prepared.output_path,
        prepared.reference_asset_path,
        prepared.chroma_key,
    )
    next_provider_metadata = dict(provider_metadata or {})
    quality_report = assess_codex_final_candidate(
        candidate_file=prepared.output_path,
        reference_file=prepared.reference_asset_path,
        analysis_mask_file=prepared.analysis_mask_path,
        chroma_key=prepared.chroma_key,
    )
    quality_report = _merge_postprocess_warnings(quality_report, output_diagnostics)
    write_codex_final_quality_report(prepared.quality_report_path, quality_report)
    if quality_report.has_blocking_errors:
        raise RuntimeError("Codex final candidate failed quality gate: " + quality_report.summary)
    promote_codex_final_candidate(prepared.output_path, prepared.final_asset_path)
    timing["transparentFinalizeSeconds"] = _elapsed_seconds(step_started)
    return _complete_codex_final_success(
        workspace_root,
        state,
        prepared,
        provider_name=provider_name,
        provider_metadata=next_provider_metadata,
        output_file=prepared.output_path,
        raw_output_file=prepared.raw_output_path,
        output_diagnostics=output_diagnostics,
        quality_report=quality_report,
        timing=timing,
        finalize_started=finalize_started,
    )


def _complete_codex_final_success(
    workspace_root: Path,
    state: WorkspaceState,
    prepared: PreparedCodexFinalJob,
    *,
    provider_name: str,
    provider_metadata: dict[str, Any] | None,
    output_file: Path,
    raw_output_file: Path | None,
    output_diagnostics: dict[str, Any],
    quality_report: CodexFinalQualityReport,
    timing: dict[str, float],
    finalize_started: float,
) -> tuple[WorkspaceState, ElementRecord, dict[str, Any]]:
    step_started = time.perf_counter()
    copy_codex_source_crop(prepared.source_crop_path, prepared.final_source_crop_path)
    timing["copySourceCropSeconds"] = _elapsed_seconds(step_started)

    metadata = {
        "provider": provider_name,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "jobId": prepared.work_dir.name,
        "workDirPath": _workspace_relative_path(workspace_root, prepared.work_dir),
        "outputPath": _workspace_relative_path(workspace_root, output_file),
        "rawOutputPath": _workspace_relative_path(workspace_root, raw_output_file) if raw_output_file else None,
        "promptPath": _workspace_relative_path(workspace_root, prepared.prompt_path),
        "briefImagePath": _workspace_relative_path(workspace_root, prepared.brief_image_path),
        "briefJsonPath": _workspace_relative_path(workspace_root, prepared.brief_json_path),
        "analysisMaskPath": _workspace_relative_path(workspace_root, prepared.analysis_mask_path),
        "qualityReportPath": _workspace_relative_path(workspace_root, prepared.quality_report_path),
        "referenceAssetPath": prepared.reference_asset_workspace_path,
        "sourceCropPath": prepared.source_crop_workspace_path,
        "maskPath": prepared.mask_workspace_path,
        "inputImagePaths": [image.path for image in prepared.input_images],
        "inputImages": _input_image_metadata(prepared.input_images),
        "assetPath": prepared.paths["assetPath"],
        "generationProfile": prepared.generation_profile,
        "chromaKey": list(prepared.chroma_key),
        "removedChildren": [_removed_child_metadata(child) for child in prepared.removed_children],
        "promptHint": prepared.prompt_hint,
        "prompt": prepared.prompt,
        **(provider_metadata or {}),
        **output_diagnostics,
        "qualityStatus": quality_report.status,
        "qualityErrors": list(quality_report.errors),
        "qualityWarnings": list(quality_report.warnings),
        "repairNote": quality_report.repair_note,
        "timing": timing,
    }
    metadata_file = resolve_workspace_path(workspace_root, prepared.paths["metadataPath"])
    metadata_file.parent.mkdir(parents=True, exist_ok=True)
    # WHY: generation.json 自身需要包含 metadata 写入耗时。精确自描述会变成
    # 无限递归更新；这里用一次小文件写入作为稳定近似，再写入最终统计。
    metadata["timing"] = {
        **timing,
        "metadataWriteSeconds": 0.0,
        "finalizeTotalSeconds": 0.0,
    }
    step_started = time.perf_counter()
    metadata_file.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    timing["metadataWriteSeconds"] = _elapsed_seconds(step_started)
    timing["finalizeTotalSeconds"] = _elapsed_seconds(finalize_started)
    metadata["timing"] = timing
    metadata_file.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    element = prepared.element
    updated = element.model_copy(
        update={
            "status": "repair_complete",
            "repairStatus": "repair_complete",
            "exportStatus": "ready",
            "sourceProvider": provider_name,
            "sourcePrompt": prepared.prompt,
            "sourcePromptHint": prepared.prompt_hint,
            "generationProfile": prepared.generation_profile,
        }
    )
    next_state = WorkspaceState(
        source=state.source,
        elements=[updated if current.id == element.id else current for current in state.elements],
        detectionVocabulary=state.detectionVocabulary,
    )
    generation = {
        **prepared.paths,
        "provider": provider_name,
        "referenceAssetPath": prepared.reference_asset_workspace_path,
        "outputPath": metadata["outputPath"],
        "rawOutputPath": metadata["rawOutputPath"],
        "workDirPath": metadata["workDirPath"],
        "promptPath": metadata["promptPath"],
        "briefImagePath": metadata["briefImagePath"],
        "briefJsonPath": metadata["briefJsonPath"],
        "analysisMaskPath": metadata["analysisMaskPath"],
        "qualityReportPath": metadata["qualityReportPath"],
        "jobId": metadata["jobId"],
        "codexThreadId": metadata.get("codexThreadId"),
        "timing": metadata.get("timing"),
        "chromaKey": metadata["chromaKey"],
        "referenceSha256": metadata["referenceSha256"],
        "rawOutputSha256": metadata["rawOutputSha256"],
        "outputSha256": metadata["outputSha256"],
        "isOutputIdenticalToReference": metadata["isOutputIdenticalToReference"],
        "qualityStatus": metadata["qualityStatus"],
        "qualityErrors": metadata["qualityErrors"],
        "qualityWarnings": metadata["qualityWarnings"],
        "repairNote": metadata["repairNote"],
        "rawForegroundBbox": metadata.get("rawForegroundBbox", []),
        "cleanedForegroundBbox": metadata.get("cleanedForegroundBbox", []),
        "trimmedOutputBbox": metadata.get("trimmedOutputBbox", []),
        "outputWidth": metadata.get("outputWidth"),
        "outputHeight": metadata.get("outputHeight"),
        "retainedComponentCount": metadata.get("retainedComponentCount"),
        "removedComponentCount": metadata.get("removedComponentCount"),
        "removedComponentArea": metadata.get("removedComponentArea"),
        "postprocessWarnings": metadata.get("postprocessWarnings", []),
        "inputImagePaths": metadata["inputImagePaths"],
        "inputImages": metadata["inputImages"],
        "generationProfile": prepared.generation_profile,
        "removedChildren": metadata["removedChildren"],
        "promptHint": metadata["promptHint"],
        "prompt": prepared.prompt,
    }
    return next_state, updated, generation


def _merge_postprocess_warnings(
    quality_report: CodexFinalQualityReport,
    output_diagnostics: dict[str, Any],
) -> CodexFinalQualityReport:
    warnings = output_diagnostics.get("postprocessWarnings")
    if not isinstance(warnings, list):
        return quality_report
    merged = tuple(
        dict.fromkeys(
            [
                *quality_report.warnings,
                *(warning for warning in warnings if isinstance(warning, str)),
            ]
        )
    )
    if merged == quality_report.warnings:
        return quality_report
    return replace(quality_report, warnings=merged)


def _input_image_metadata(input_images: Sequence[CodexFinalInputImage]) -> list[dict[str, Any]]:
    # WHY: input role 顺序是 prompt / review UI 的协议事实；metadata 必须保留
    # role，而不是让前端从 index 反推，避免 layout_guide / repair refs 错位。
    return [
        {
            "path": image.path,
            "role": image.role,
            "required": image.required,
        }
        for image in input_images
    ]


def _generation_profile(
    element: ElementRecord,
    removed_children: Sequence[RemovedChildContext],
) -> GenerationProfile:
    if element.assetRole == "removable_child":
        return "child_standalone"
    if element.assetRole == "parent" and removed_children:
        return "parent_inpaint_without_children"
    return "sticker_completion"


def _removed_child_contexts(
    workspace_root: Path,
    state: WorkspaceState,
    parent: ElementRecord,
) -> list[RemovedChildContext]:
    if parent.assetRole != "parent":
        return []
    children = [
        child
        for child in state.elements
        if child.assetRole == "removable_child"
        and child.removeFromParent == parent.id
        and child.mergedInto is None
        and child.status != "rejected"
        and child.mode != "rejected"
    ]
    return [
        RemovedChildContext(
            element_id=child.id,
            name=child.label or child.name,
            mask_path=sam2_edge_paths(child.id)["maskPath"],
            bbox=child.bbox.model_dump(mode="json"),
            canvas=child.canvas.model_dump(mode="json"),
        )
        for child in children
        if resolve_workspace_path(workspace_root, sam2_edge_paths(child.id)["maskPath"]).exists()
    ]


def _removed_child_contexts_from_manifest(
    state: WorkspaceState,
    job: CodexFinalJob,
) -> tuple[RemovedChildContext, ...]:
    contexts: list[RemovedChildContext] = []
    for removed_child in job.removedChildren:
        element = _find_element(state, removed_child.elementId)
        contexts.append(
            RemovedChildContext(
                element_id=removed_child.elementId,
                name=removed_child.name,
                mask_path=removed_child.maskPath,
                bbox=element.bbox.model_dump(mode="json"),
                canvas=element.canvas.model_dump(mode="json"),
            )
        )
    return tuple(contexts)


def _brief_removed_children(
    removed_children: Sequence[RemovedChildContext],
) -> tuple[CodexFinalBriefRemovedChild, ...]:
    return tuple(
        CodexFinalBriefRemovedChild(
            element_id=child.element_id,
            name=child.name,
            mask_path=child.mask_path,
            bbox=child.bbox,
            canvas=child.canvas,
        )
        for child in removed_children
    )


def _prompt_removed_children(
    removed_children: Sequence[RemovedChildContext],
) -> tuple[CodexFinalPromptRemovedChild, ...]:
    return tuple(CodexFinalPromptRemovedChild(name=child.name) for child in removed_children)


def _removed_child_metadata(child: RemovedChildContext) -> dict[str, Any]:
    return {
        "elementId": child.element_id,
        "name": child.name,
        "maskPath": child.mask_path,
        "bbox": child.bbox,
        "canvas": child.canvas,
    }


def _job_artifact_path(job: CodexFinalJob, filename: str, explicit_path: str) -> str:
    if explicit_path:
        return explicit_path
    # WHY: 早期 manifest 没有独立 layout/analysis 字段；job work dir 是该批
    # 中间产物的唯一持久边界；PurePosixPath 避免手写斜杠在尾 slash/平台上漂移。
    return (PurePosixPath(job.workDirPath) / filename).as_posix()


def _new_codex_job_id() -> str:
    return f"job_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}_{uuid4().hex[:8]}"


def _workspace_relative_path(workspace_root: Path, path: Path) -> str:
    return path.resolve().relative_to(workspace_root.resolve()).as_posix()


def _elapsed_seconds(started: float) -> float:
    return round(time.perf_counter() - started, 6)


def _find_element(state: WorkspaceState, element_id: str) -> ElementRecord:
    for element in state.elements:
        if element.id == element_id:
            return element
    raise ValueError(f"Element {element_id} not found.")
