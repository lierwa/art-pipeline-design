from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import BaseModel, ValidationError

from art_pipeline.course_planner.ai_tasks import (
    CoursePlannerAiService,
    GenerateChapterCandidatesOutput,
)
from art_pipeline.course_planner.models import Chapter, ChapterSeed, ScenePack
from art_pipeline.course_planner.store import CoursePlannerStore


class FakeProvider:
    def __init__(self, payload: object | Exception) -> None:
        self.payload = payload
        self.requests: list[tuple[str, type[BaseModel], Path]] = []

    def run_json_task(
        self,
        *,
        prompt: str,
        output_model: type[BaseModel],
        artifact_dir: Path,
    ) -> BaseModel:
        self.requests.append((prompt, output_model, artifact_dir))
        if isinstance(self.payload, Exception):
            raise self.payload
        return output_model.model_validate(self.payload)


def test_candidate_schema_keeps_candidate_and_chapter_ids_system_owned() -> None:
    schema = GenerateChapterCandidatesOutput.model_json_schema()
    candidate_schema = schema["$defs"]["GenerateChapterCandidateDraft"]

    assert "id" not in candidate_schema["properties"]
    assert "chapter_id" not in candidate_schema["properties"]
    assert "chapter_title" in candidate_schema["properties"]


def test_generate_chapter_candidates_uses_scene_pack_context_without_persisting(
    tmp_path: Path,
) -> None:
    store = CoursePlannerStore(tmp_path / "scene_library")
    scene_pack = store.create_scene_pack(
        title="室内家庭篇",
        intent="围绕厨房生成日常记忆场景。",
        notes="保持儿童绘本风格。",
    )
    service = CoursePlannerAiService(
        store=store,
        provider=FakeProvider(_candidate_output()),
    )

    candidates = service.generate_chapter_candidates(
        scene_pack,
        feedback="多一点水槽附近动作。",
    )

    candidate_ids = [candidate["id"] for candidate in candidates]
    assert len(candidate_ids) == 2
    assert len(set(candidate_ids)) == 2
    assert all(candidate_id.startswith("candidate_") for candidate_id in candidate_ids)
    assert candidates[0]["scene_pack_id"] == scene_pack.id
    assert candidates[0]["title"] == "清洗苹果"
    assert candidates[0]["summary"] == "孩子发现苹果需要先洗干净。"
    assert candidates[0]["seed"]["scene_pack_id"] == scene_pack.id
    assert candidates[0]["seed"]["chapter_id"] == "pending"
    assert candidates[0]["seed"]["object_coverage_hint"]
    assert candidates[0]["seed"]["character_concept_hint"]["main_cast_hint"]
    prompt = service.provider.requests[0][0]
    assert "Scene Pack" in prompt
    assert "ChapterSeed" in prompt
    assert "event_seed" in prompt
    assert "spatial_seed" in prompt
    assert "object_coverage_hint" in prompt
    assert "character_concept_hint" in prompt
    assert "室内家庭篇" in prompt
    assert "多一点水槽附近动作" in prompt
    assert "target_level" not in prompt
    assert "chapter_count" not in prompt
    assert "Reject" not in prompt
    assert store.list_chapters(scene_pack.id) == []


def test_generate_chapter_candidates_returns_batch_unique_candidate_ids(
    tmp_path: Path,
) -> None:
    store = CoursePlannerStore(tmp_path / "scene_library")
    scene_pack = store.create_scene_pack(
        title="室内家庭篇",
        intent="围绕厨房生成日常记忆场景。",
    )
    service = CoursePlannerAiService(
        store=store,
        provider=FakeProvider(_candidate_output()),
    )

    first_batch = service.generate_chapter_candidates(scene_pack)
    second_batch = service.generate_chapter_candidates(scene_pack)

    first_ids = {candidate["id"] for candidate in first_batch}
    second_ids = {candidate["id"] for candidate in second_batch}
    assert first_ids.isdisjoint(second_ids)
    assert all(
        candidate_id.startswith("candidate_")
        for candidate_id in first_ids | second_ids
    )


def test_generate_chapter_candidates_rejects_invalid_candidate_without_business_write(
    tmp_path: Path,
) -> None:
    store = CoursePlannerStore(tmp_path / "scene_library")
    scene_pack = store.create_scene_pack(title="厨房专项", intent="厨房动作")
    service = CoursePlannerAiService(
        store=store,
        provider=FakeProvider(
            {
                "planning_summary": "缺字段。",
                "candidates": [{"chapter_title": "", "chapter_intent": ""}],
            }
        ),
    )

    with pytest.raises(ValidationError):
        service.generate_chapter_candidates(scene_pack)

    assert store.list_chapters(scene_pack.id) == []
    assert _task_error_path(store, "generate_chapter_candidates", scene_pack.id).exists()


def test_generate_chapter_candidates_failure_writes_error_artifact(
    tmp_path: Path,
) -> None:
    store = CoursePlannerStore(tmp_path / "scene_library")
    scene_pack = store.create_scene_pack(title="室内家庭篇", intent="厨房日常场景")
    service = CoursePlannerAiService(
        store=store,
        provider=FakeProvider(RuntimeError("codex failed")),
    )

    with pytest.raises(RuntimeError, match="codex failed"):
        service.generate_chapter_candidates(scene_pack)

    assert _task_error_path(store, "generate_chapter_candidates", scene_pack.id).exists()


def _candidate_output() -> dict[str, object]:
    return {
        "planning_summary": "围绕厨房动线生成场景候选。",
        "candidates": [
            {
                "chapter_title": "清洗苹果",
                "chapter_intent": "团团在厨房水槽前清洗苹果。",
                "scene_domain": "厨房",
                "daily_moment": "早餐前",
                "event_seed": "孩子发现苹果需要先洗干净。",
                "spatial_seed": "水槽在前景，餐桌在后方。",
                "object_coverage_hint": ["水槽", "苹果", "餐桌"],
                "character_concept_hint": {
                    "main_cast_hint": "团团作为主角猫",
                    "supporting_cast_hint": "阿布在背景记录",
                    "constraints": ["角色表情清楚", "只使用猫咪主角团"],
                },
                "style_notes": "温暖厨房光线。",
            },
            {
                "chapter_title": "摆好餐盘",
                "chapter_intent": "孩子把餐盘放到餐桌中央。",
                "scene_domain": "厨房",
                "daily_moment": "早餐前",
                "event_seed": "孩子为家人准备吃苹果的位置。",
                "spatial_seed": "餐盘在餐桌中央，椅子围绕桌边。",
                "object_coverage_hint": ["餐桌", "餐盘", "椅子"],
                "character_concept_hint": {
                    "main_cast_hint": "主角孩子",
                    "constraints": ["餐盘必须清楚"],
                },
            },
        ],
    }


def _task_error_path(store: CoursePlannerStore, task_name: str, scene_pack_id: str) -> Path:
    return (
        store.scene_library_root
        / "ai_tasks"
        / task_name
        / scene_pack_id
        / "error.json"
    )
