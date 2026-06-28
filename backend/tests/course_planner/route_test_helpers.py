from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient
from pydantic import BaseModel

from art_pipeline.api import create_app


class FakeProvider:
    def __init__(self, payloads: list[object | Exception]) -> None:
        self.payloads = payloads
        self.requests: list[tuple[str, type[BaseModel], Path]] = []

    def run_json_task(
        self,
        *,
        prompt: str,
        output_model: type[BaseModel],
        artifact_dir: Path,
    ) -> BaseModel:
        self.requests.append((prompt, output_model, artifact_dir))
        artifact_dir.mkdir(parents=True, exist_ok=True)
        payload = self.payloads.pop(0)
        if isinstance(payload, Exception):
            raise payload
        return output_model.model_validate(payload)


def client_with_provider(tmp_path: Path, provider: FakeProvider | None = None) -> TestClient:
    return TestClient(
        create_app(
            workspace_root=tmp_path / "workspace",
            course_planner_ai_provider=provider,
        )
    )


def scene_pack_payload(title: str = "室内家庭篇") -> dict[str, object]:
    return {
        "title": title,
        "intent": "围绕家庭空间生成日常记忆场景。",
        "notes": "保持儿童绘本风格。",
    }


def candidate_ai_payload() -> dict[str, object]:
    return {
        "planning_summary": "围绕厨房动线生成场景候选。",
        "candidates": [
            {
                "chapter_title": "清洗苹果",
                "chapter_intent": "孩子在厨房水槽前清洗苹果。",
                "scene_domain": "厨房",
                "daily_moment": "早餐前",
                "event_seed": "孩子发现苹果需要先洗干净。",
                "spatial_seed": "水槽在前景，餐桌在后方，冰箱在左侧。",
                "object_coverage_hint": ["水槽", "苹果", "餐桌"],
                "character_concept_hint": {
                    "main_cast_hint": "主角孩子",
                    "supporting_cast_hint": "家长在背景准备早餐",
                    "constraints": ["角色表情清楚", "动作适合儿童"],
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


def chapter_seed_payload() -> dict[str, object]:
    return candidate_ai_payload()["candidates"][0]


def prompt_version_ai_payload() -> dict[str, object]:
    return {
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
    }


def review_ai_payload() -> dict[str, object]:
    return {
        "summary": "画面符合水槽清洗苹果的版本目标。",
        "strengths": ["主体清楚", "空间关系明确"],
        "issues": ["背景餐桌略弱"],
        "recommendation": "accept",
    }


def create_scene_pack(client: TestClient) -> str:
    response = client.post("/api/course-planner/scene-packs", json=scene_pack_payload())
    assert response.status_code == 200
    return response.json()["scenePack"]["id"]


def create_chapter(client: TestClient, scene_pack_id: str) -> str:
    response = client.post(
        f"/api/course-planner/scene-packs/{scene_pack_id}/chapters",
        json=chapter_seed_payload(),
    )
    assert response.status_code == 200
    return response.json()["chapter"]["id"]


def create_prompt_version(client: TestClient, chapter_id: str) -> str:
    response = client.post(f"/api/course-planner/chapters/{chapter_id}/prompt-versions")
    assert response.status_code == 200
    return response.json()["promptVersion"]["id"]
