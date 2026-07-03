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
                "chapter_intent": "团团在厨房水槽前清洗苹果。",
                "scene_domain": "厨房",
                "daily_moment": "早餐前",
                "event_seed": "团团发现苹果需要先洗干净。",
                "spatial_seed": "水槽在前景，餐桌在后方，冰箱在左侧。",
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


def chapter_seed_payload() -> dict[str, object]:
    return candidate_ai_payload()["candidates"][0]


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
