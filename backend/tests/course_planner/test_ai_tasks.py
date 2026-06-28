from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import BaseModel, ValidationError

from art_pipeline.course_planner.ai_tasks import (
    CoursePlannerAiService,
    GenerateChapterCandidatesOutput,
    GeneratePromptVersionOutput,
)
from art_pipeline.course_planner.models import (
    Chapter,
    ChapterSeed,
    CharacterConceptHint,
    ImageAttemptReview,
    PromptVersion,
    ScenePack,
)
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

    assert [candidate["id"] for candidate in candidates] == [
        "candidate_001",
        "candidate_002",
    ]
    assert candidates[0]["seed"]["scene_pack_id"] == scene_pack.id
    assert candidates[0]["seed"]["chapter_id"] == "pending"
    prompt = service.provider.requests[0][0]
    assert "Scene Pack" in prompt
    assert "室内家庭篇" in prompt
    assert "多一点水槽附近动作" in prompt
    assert "target_level" not in prompt
    assert "chapter_count" not in prompt
    assert "Reject" not in prompt
    assert store.list_chapters(scene_pack.id) == []


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


def test_prompt_version_schema_requires_plans_not_prompt_version_ids() -> None:
    schema = GeneratePromptVersionOutput.model_json_schema()

    assert "id" not in schema["properties"]
    assert "chapter_id" not in schema["properties"]
    assert "scene_director_plan" in schema["properties"]
    assert "object_plan" in schema["properties"]


def test_generate_prompt_version_builds_package_from_generated_plans(
    tmp_path: Path,
) -> None:
    store = CoursePlannerStore(tmp_path / "scene_library")
    scene_pack, chapter = _scene_pack_with_chapter(store)
    service = CoursePlannerAiService(
        store=store,
        provider=FakeProvider(_prompt_version_output()),
    )

    payload = service.generate_prompt_version(scene_pack, chapter, feedback="强调红苹果")

    assert payload["title"] == "厨房水槽构图"
    assert payload["scene_director_plan"]["story_event"] == "孩子在水槽前清洗红苹果。"
    assert payload["object_plan"]["core_objects"][0]["name"] == "红苹果"
    assert "红苹果" in payload["prompt_package"]["full_prompt"]
    assert "水槽" in payload["prompt_package"]["full_prompt"]
    prompt = service.provider.requests[0][0]
    assert chapter.seed.chapter_title in prompt
    assert "SceneDirectorPlan" in prompt
    assert "ObjectPlan" in prompt
    assert "target_level" not in prompt


def test_review_image_attempt_is_scoped_to_prompt_version_and_attempt(
    tmp_path: Path,
) -> None:
    store = CoursePlannerStore(tmp_path / "scene_library")
    scene_pack, chapter = _scene_pack_with_chapter(store)
    version = store.create_prompt_version(chapter.id, _prompt_version_payload())
    attempt = store.create_image_attempt(version.id, "upload_001")
    service = CoursePlannerAiService(
        store=store,
        provider=FakeProvider(
            {
                "summary": "画面符合水槽清洗苹果的版本目标。",
                "strengths": ["主体清楚"],
                "issues": ["背景餐桌略弱"],
                "recommendation": "accept",
            }
        ),
    )

    review = service.review_image_attempt(scene_pack, chapter, version, attempt)

    assert review == ImageAttemptReview(
        summary="画面符合水槽清洗苹果的版本目标。",
        strengths=["主体清楚"],
        issues=["背景餐桌略弱"],
        recommendation="accept",
    )
    prompt = service.provider.requests[0][0]
    assert version.id in prompt
    assert attempt.id in prompt
    assert "PromptVersion" in prompt
    assert "ImageAttempt" in prompt


def test_generate_prompt_version_failure_writes_error_artifact(tmp_path: Path) -> None:
    store = CoursePlannerStore(tmp_path / "scene_library")
    scene_pack, chapter = _scene_pack_with_chapter(store)
    service = CoursePlannerAiService(
        store=store,
        provider=FakeProvider(RuntimeError("codex failed")),
    )

    with pytest.raises(RuntimeError, match="codex failed"):
        service.generate_prompt_version(scene_pack, chapter)

    assert _task_error_path(
        store,
        "generate_prompt_version",
        scene_pack.id,
        chapter.id,
    ).exists()


def _scene_pack_with_chapter(store: CoursePlannerStore) -> tuple[ScenePack, Chapter]:
    scene_pack = store.create_scene_pack(title="室内家庭篇", intent="厨房日常场景")
    chapter = store.create_chapter_from_seed(scene_pack.id, _chapter_seed(scene_pack))
    return scene_pack, chapter


def _chapter_seed(scene_pack: ScenePack) -> ChapterSeed:
    return ChapterSeed(
        scene_pack_id=scene_pack.id,
        scene_pack_title=scene_pack.title,
        chapter_id="pending",
        chapter_title="清洗苹果",
        chapter_intent="孩子在厨房水槽前清洗苹果。",
        scene_domain="厨房",
        daily_moment="早餐前",
        event_seed="孩子发现苹果需要先洗干净。",
        spatial_seed="水槽在前景，餐桌在后方。",
        object_coverage_hint=["水槽", "苹果", "餐桌"],
        character_concept_hint=CharacterConceptHint(
            main_cast_hint="主角孩子",
            supporting_cast_hint="家长在背景准备早餐",
            constraints=["动作适合儿童"],
        ),
        style_notes="温暖厨房光线。",
    )


def _candidate_output() -> dict[str, object]:
    return {
        "planning_summary": "围绕厨房动线生成场景候选。",
        "candidates": [
            {
                "chapter_title": "清洗苹果",
                "chapter_intent": "孩子在厨房水槽前清洗苹果。",
                "scene_domain": "厨房",
                "daily_moment": "早餐前",
                "event_seed": "孩子发现苹果需要先洗干净。",
                "spatial_seed": "水槽在前景，餐桌在后方。",
                "object_coverage_hint": ["水槽", "苹果", "餐桌"],
                "character_concept_hint": {
                    "main_cast_hint": "主角孩子",
                    "supporting_cast_hint": "家长在背景准备早餐",
                    "constraints": ["动作适合儿童"],
                },
                "style_notes": "温暖厨房光线。",
            },
            {
                "chapter_title": "摆好餐盘",
                "chapter_intent": "孩子把餐盘放到餐桌中央。",
                "scene_domain": "厨房",
                "event_seed": "孩子为家人准备吃苹果的位置。",
                "spatial_seed": "餐盘在餐桌中央。",
                "object_coverage_hint": ["餐桌", "餐盘"],
                "character_concept_hint": {"main_cast_hint": "主角孩子"},
            },
        ],
    }


def _prompt_version_output() -> dict[str, object]:
    return {
        "title": "厨房水槽构图",
        "scene_director_plan": _prompt_version_payload()["scene_director_plan"],
        "object_plan": _prompt_version_payload()["object_plan"],
    }


def _prompt_version_payload() -> dict[str, object]:
    return {
        "id": "ignored",
        "chapter_id": "ignored",
        "version_label": "ignored",
        "title": "厨房水槽构图",
        "scene_director_plan": {
            "story_event": "孩子在水槽前清洗红苹果。",
            "scene_composition": "中景构图，水槽和苹果位于视觉中心。",
            "spatial_structure": "水槽前景，餐桌后景，冰箱左侧。",
            "character_arrangement": "孩子站在水槽前，家长在背景。",
            "action_design": "孩子双手托着苹果放在水流下。",
            "style_and_constraints": "温暖绘本风格，避免文字和水印。",
        },
        "object_plan": {
            "core_objects": [
                {
                    "name": "红苹果",
                    "role_in_scene": "动作目标",
                    "placement_hint": "孩子双手之间",
                    "priority": "core",
                }
            ],
            "required_objects": [
                {
                    "name": "水槽",
                    "role_in_scene": "主要空间锚点",
                    "placement_hint": "画面前景",
                    "priority": "required",
                }
            ],
            "recommended_objects": [],
            "avoid_or_move_objects": [],
        },
        "prompt_package": {
            "full_prompt": "placeholder",
            "negative_constraints": "placeholder",
        },
    }


def _task_error_path(store: CoursePlannerStore, *parts: str) -> Path:
    return store.scene_library_root.joinpath("ai_tasks", *parts, "error.json")
