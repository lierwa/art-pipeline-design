from __future__ import annotations

from pathlib import Path

import pytest

from art_pipeline.codex_final_jobs import (
    CodexFinalJob,
    CodexFinalJobInput,
    CodexFinalJobManifest,
    codex_final_agent_handoff_path,
    codex_final_job_dir,
    codex_final_job_manifest_path,
    read_codex_final_job_manifest,
    write_codex_final_job_manifest,
)


def test_manifest_round_trips_codex_final_jobs(tmp_path: Path) -> None:
    manifest = _manifest(
        selected_source_path="elements/element_002/sam2_edge/source_crop.png",
        qa_note="Raw image has enough detail for ingest.",
        codex_thread_id="thread_codex_001",
    )

    write_codex_final_job_manifest(tmp_path, manifest)
    loaded = read_codex_final_job_manifest(tmp_path, "task_202606240000000000_ab12cd")

    assert loaded.jobs[0].status == "ready_for_agent"
    assert loaded.jobs[0].inputImages[0].required is True
    assert loaded.jobs[0].selectedSourcePath == "elements/element_002/sam2_edge/source_crop.png"
    assert loaded.jobs[0].qaNote == "Raw image has enough detail for ingest."
    assert loaded.jobs[0].codexThreadId == "thread_codex_001"
    assert codex_final_job_manifest_path(tmp_path, manifest.taskId) == (
        tmp_path / "tasks" / "task_202606240000000000_ab12cd" / "codex-final-jobs.json"
    )
    assert codex_final_agent_handoff_path(tmp_path, manifest.taskId) == (
        tmp_path / "tasks" / "task_202606240000000000_ab12cd" / "codex-final-agent-handoff.md"
    )


def test_write_manifest_overwrites_existing_manifest_without_direct_target_write(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    task_id = "task_202606240000000000_ab12cd"
    write_codex_final_job_manifest(tmp_path, _manifest(task_id=task_id, message="Initial manifest."))
    replacement = _manifest(
        task_id=task_id,
        status="raw_ready",
        message="Raw image ready.",
        selected_source_path="elements/element_002/codex_final/job/job_202606240000000000_ab12cd/codex_raw.png",
        qa_note="Ready for final ingest.",
        codex_thread_id="thread_codex_002",
    )
    manifest_path = codex_final_job_manifest_path(tmp_path, task_id)
    original_write_text = Path.write_text

    def fail_on_final_path(self: Path, data: str, *args: object, **kwargs: object) -> int:
        if self == manifest_path:
            original_write_text(self, '{"version":', encoding="utf-8")
            raise RuntimeError("direct final-path write")
        return original_write_text(self, data, *args, **kwargs)

    # WHY: manifest 是 durable handoff；重写必须先落临时文件，避免 reader 看到被截断的目标 JSON。
    monkeypatch.setattr(Path, "write_text", fail_on_final_path)

    write_codex_final_job_manifest(tmp_path, replacement)
    loaded = read_codex_final_job_manifest(tmp_path, task_id)

    assert loaded.jobs[0].status == "raw_ready"
    assert loaded.jobs[0].message == "Raw image ready."
    assert loaded.jobs[0].selectedSourcePath == (
        "elements/element_002/codex_final/job/job_202606240000000000_ab12cd/codex_raw.png"
    )
    assert loaded.jobs[0].qaNote == "Ready for final ingest."
    assert loaded.jobs[0].codexThreadId == "thread_codex_002"
    assert not manifest_path.with_suffix(".json.tmp").exists()


@pytest.mark.parametrize("task_id", ["../escape", "codex/escape", "/tmp/escape"])
def test_invalid_task_ids_cannot_escape_tasks_folder(tmp_path: Path, task_id: str) -> None:
    with pytest.raises(FileNotFoundError):
        codex_final_job_dir(tmp_path, task_id)


def _manifest(
    task_id: str = "task_202606240000000000_ab12cd",
    status: str = "ready_for_agent",
    message: str = "Waiting for Codex agent raw image.",
    selected_source_path: str | None = None,
    qa_note: str | None = None,
    codex_thread_id: str | None = None,
) -> CodexFinalJobManifest:
    return CodexFinalJobManifest(
        version=1,
        taskId=task_id,
        createdAt="2026-06-24T00:00:00+00:00",
        jobs=[
            CodexFinalJob(
                jobId="job_202606240000000000_ab12cd",
                elementId="element_002",
                elementName="bathtub",
                status=status,
                message=message,
                workDirPath="elements/element_002/codex_final/job/job_202606240000000000_ab12cd",
                promptPath="elements/element_002/codex_final/job/job_202606240000000000_ab12cd/prompt.md",
                briefImagePath="elements/element_002/codex_final/job/job_202606240000000000_ab12cd/generation_brief.png",
                briefJsonPath="elements/element_002/codex_final/job/job_202606240000000000_ab12cd/generation_brief.json",
                rawOutputPath="elements/element_002/codex_final/job/job_202606240000000000_ab12cd/codex_raw.png",
                finalOutputPath="elements/element_002/codex_final/job/job_202606240000000000_ab12cd/final_asset.png",
                metadataPath="elements/element_002/codex_final/generation.json",
                inputImages=[
                    CodexFinalJobInput(
                        path="elements/element_002/sam2_edge/source_crop.png",
                        role="source_crop",
                    )
                ],
                promptHint="",
                generationProfile="sticker_completion",
                removedChildren=[],
                selectedSourcePath=selected_source_path,
                qaNote=qa_note,
                codexThreadId=codex_thread_id,
            )
        ],
    )
