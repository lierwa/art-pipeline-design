from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Callable, TypeVar
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field

from art_pipeline.course_planner.codex_json_provider import CodexJsonProvider
from art_pipeline.course_planner.models import (
    Chapter,
    ChapterSeed,
    CharacterConceptHint,
    ScenePack,
)
from art_pipeline.course_planner.scene_package_models import ChapterScenePackage
from art_pipeline.course_planner.scene_package_prompt_generation import (
    generate_chapter_prompt_package,
)
from art_pipeline.course_planner.store import CoursePlannerStore
from art_pipeline.workspace.store import utc_now

SLUG_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]*$")
ResultT = TypeVar("ResultT")


class GenerateChapterCandidateDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    chapter_title: str = Field(min_length=1)
    chapter_intent: str = Field(min_length=1)
    scene_domain: str = Field(min_length=1)
    daily_moment: str | None = None
    event_seed: str = Field(min_length=1)
    spatial_seed: str = Field(min_length=1)
    object_coverage_hint: list[str] = Field(default_factory=list)
    character_concept_hint: CharacterConceptHint
    style_notes: str | None = None


class GenerateChapterCandidatesOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    planning_summary: str = Field(min_length=1)
    candidates: list[GenerateChapterCandidateDraft] = Field(min_length=1)


class AiTaskRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    kind: str
    status: str
    target: dict[str, str]
    created_at: str
    updated_at: str
    error: str | None = None


class AiTaskFailedError(RuntimeError):
    def __init__(self, task: AiTaskRecord, cause: Exception) -> None:
        super().__init__(str(cause))
        self.task = task
        self.cause = cause


class CoursePlannerAiService:
    def __init__(
        self,
        *,
        store: CoursePlannerStore,
        provider: CodexJsonProvider | None = None,
    ) -> None:
        self.store = store
        self.provider = provider or CodexJsonProvider()

    def generate_chapter_candidates(
        self,
        scene_pack: ScenePack,
        feedback: str = "",
    ) -> list[dict[str, Any]]:
        artifact_dir = self._artifact_dir("generate_chapter_candidates", scene_pack.id)
        try:
            output = self.provider.run_json_task(
                prompt=_generate_chapter_candidates_prompt(scene_pack, feedback),
                output_model=GenerateChapterCandidatesOutput,
                artifact_dir=artifact_dir,
            )
            batch_id = uuid4().hex[:12]
            return [
                _candidate_payload(scene_pack, candidate, index, batch_id)
                for index, candidate in enumerate(output.candidates, start=1)
            ]
        except Exception as exc:
            _write_error_artifact(artifact_dir, exc)
            raise

    def generate_chapter_prompt_package(
        self,
        chapter: Chapter,
        package: ChapterScenePackage,
        *,
        feedback: str = "",
    ) -> ChapterScenePackage:
        artifact_dir = self._artifact_dir(
            "generate_chapter_prompt_package",
            chapter.id,
        )
        try:
            return generate_chapter_prompt_package(
                store=self.store,
                provider=self.provider,
                chapter=chapter,
                package=package,
                feedback=feedback,
                artifact_dir=artifact_dir,
            )
        except Exception as exc:
            _write_error_artifact(artifact_dir, exc)
            raise

    def _artifact_dir(self, task_name: str, *ids: str) -> Path:
        safe_parts = [_validate_slug(task_name, "Task name")]
        safe_parts.extend(_validate_slug(value, "Artifact id") for value in ids)
        candidate = self.store.scene_library_root.joinpath("ai_tasks", *safe_parts).resolve()
        try:
            candidate.relative_to(self.store.scene_library_root)
        except ValueError as exc:
            raise ValueError("AI task artifact paths must stay inside scene_library.") from exc
        return candidate


def run_ai_task(
    store: CoursePlannerStore,
    kind: str,
    target: dict[str, str],
    operation: Callable[[], ResultT],
) -> tuple[ResultT, AiTaskRecord]:
    task_id = f"task_{uuid4().hex}"
    now = utc_now()
    try:
        result = operation()
    except Exception as exc:
        # WHY: 当前后端仍是同步 AI 调用；记录终态比伪造队列状态更诚实。
        task = AiTaskRecord(
            id=task_id,
            kind=kind,
            status="failed",
            target=target,
            created_at=now,
            updated_at=utc_now(),
            error=str(exc)[:2000],
        )
        write_ai_task_record(store, task)
        raise AiTaskFailedError(task, exc) from exc
    task = AiTaskRecord(
        id=task_id,
        kind=kind,
        status="succeeded",
        target=target,
        created_at=now,
        updated_at=utc_now(),
    )
    write_ai_task_record(store, task)
    return result, task


def collect_ai_task_records(store: CoursePlannerStore) -> list[dict[str, object]]:
    records_root = _ai_task_records_root(store)
    if not records_root.exists():
        return []
    records: list[AiTaskRecord] = []
    for path in records_root.glob("task_*.json"):
        try:
            records.append(
                AiTaskRecord.model_validate_json(path.read_text(encoding="utf-8"))
            )
        except ValueError:
            continue
    return [
        record.model_dump(mode="json")
        for record in sorted(records, key=lambda item: item.created_at)
    ]


def read_ai_task_record(store: CoursePlannerStore, task_id: str) -> AiTaskRecord:
    path = _ai_task_records_root(store).joinpath(f"{task_id}.json").resolve()
    try:
        path.relative_to(_ai_task_records_root(store))
    except ValueError as exc:
        raise FileNotFoundError(task_id) from exc
    if not path.exists():
        raise FileNotFoundError(task_id)
    return AiTaskRecord.model_validate_json(path.read_text(encoding="utf-8"))


def write_ai_task_record(store: CoursePlannerStore, task: AiTaskRecord) -> None:
    path = _ai_task_records_root(store) / f"{task.id}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_name(f"{path.name}.{uuid4().hex}.tmp")
    temp_path.write_text(
        json.dumps(task.model_dump(mode="json"), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    os.replace(temp_path, path)


def _ai_task_records_root(store: CoursePlannerStore) -> Path:
    return store.scene_library_root.joinpath("ai_task_records").resolve()


def _candidate_payload(
    scene_pack: ScenePack,
    candidate: GenerateChapterCandidateDraft,
    index: int,
    batch_id: str,
) -> dict[str, Any]:
    seed = ChapterSeed(
        scene_pack_id=scene_pack.id,
        scene_pack_title=scene_pack.title,
        chapter_id="pending",
        chapter_title=candidate.chapter_title,
        chapter_intent=candidate.chapter_intent,
        scene_domain=candidate.scene_domain,
        daily_moment=candidate.daily_moment,
        event_seed=candidate.event_seed,
        spatial_seed=candidate.spatial_seed,
        object_coverage_hint=candidate.object_coverage_hint,
        character_concept_hint=candidate.character_concept_hint,
        style_notes=candidate.style_notes,
    )
    return {
        # WHY: 候选不落盘但会在前端追加合并；批次前缀避免“生成更多”覆盖上一批同序号候选。
        "id": f"candidate_{batch_id}_{index:03d}",
        "scene_pack_id": scene_pack.id,
        "title": candidate.chapter_title,
        "seed": seed.model_dump(mode="json"),
        "summary": candidate.event_seed,
    }


def _generate_chapter_candidates_prompt(scene_pack: ScenePack, feedback: str) -> str:
    return _json_task_prompt(
        "Generate Scene Pack chapter candidates for an image-first course planner. "
        "Return high-quality ChapterSeed drafts only; do not ask the user for ids or fixed counts. "
        "Each candidate must be a concrete visual scene with event_seed, spatial_seed, object_coverage_hint, "
        "and character_concept_hint strong enough to feed the Chapter Scene Designer. "
        "Use delete/remove or revision language for unwanted candidates.",
        {
            "scene_pack": scene_pack.model_dump(mode="json"),
            "feedback": feedback,
            "output_schema": {
                "planning_summary": "short planning rationale",
                "candidates": [
                    {
                        "chapter_title": "title for accepted Chapter",
                        "chapter_intent": "why this visual scene exists",
                        "scene_domain": "space/domain such as kitchen",
                        "daily_moment": "optional daily moment",
                        "event_seed": "clear event",
                        "spatial_seed": "spatial object relationships",
                        "object_coverage_hint": ["visual object names"],
                        "character_concept_hint": {
                            "cast_mode": "main_cast_and_supporting_cast",
                            "main_cast_hint": "main character concept",
                            "supporting_cast_hint": "optional supporting cast",
                            "reference_asset_ids": [
                                "optional ids from future character/style reference library"
                            ],
                            "constraints": ["character constraints"],
                        },
                        "style_notes": "optional visual style notes",
                    }
                ],
            },
        },
    )


def _json_task_prompt(instruction: str, payload: dict[str, object]) -> str:
    return (
        f"{instruction}\n"
        "Return only valid JSON, either directly or inside <json>...</json>. "
        "Avoid language-learning CMS fields, manual ids, target levels, fixed chapter counts, "
        "and decline-state flows.\n"
        f"{json.dumps(payload, ensure_ascii=False, indent=2)}"
    )


def _validate_slug(value: str, label: str) -> str:
    if not SLUG_PATTERN.fullmatch(value):
        raise ValueError(
            f"{label} {value!r} must be a slug containing only letters, numbers, "
            "underscores, and hyphens."
        )
    return value


def _write_error_artifact(artifact_dir: Path, exc: Exception) -> None:
    artifact_dir.mkdir(parents=True, exist_ok=True)
    (artifact_dir / "error.json").write_text(
        json.dumps({"error": str(exc)[:2000]}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
