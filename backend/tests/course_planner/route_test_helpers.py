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


def prompt_version_ai_payload() -> dict[str, object]:
    return {
        "title": "厨房水槽构图",
        "scene_director_plan": {
            "story_event": "团团在水槽前清洗红苹果。",
            "scene_composition": "中景构图，水槽和苹果位于视觉中心。",
            "spatial_structure": "水槽前景，餐桌后景，冰箱左侧。",
            "character_arrangement": "团团站在水槽前，阿布在背景记录。",
            "action_design": "团团双手托着苹果放在水流下。",
            "style_and_constraints": "温暖绘本风格，避免文字和水印。",
        },
        "cast_bindings": [
            {
                "character_id": "tuantuan",
                "display_name": "团团",
                "role_in_scene": "main",
                "action_intent": "在水槽前清洗红苹果。",
                "reference_image_ids": ["docs/image-reference/01_主方向_生活化猫咪主角团.png"],
                "invariants": ["白色蓬松猫", "黄色小包", "背带裤"],
            },
            {
                "character_id": "abu",
                "display_name": "阿布",
                "role_in_scene": "support",
                "action_intent": "在背景观察并记录。",
                "reference_image_ids": ["docs/image-reference/04_主角轮廓与动作板.png"],
                "invariants": ["暹罗猫", "圆眼镜", "绿本子"],
            },
        ],
        "scene_vocabulary": {
            "narrative_anchors": ["red apple", "sink faucet"],
            "optional_vocabulary_candidates": ["cup", "plate", "chair", "window"],
            "ambient_furnishing_policy": "自然补足温暖家庭厨房细节，但不要堆成物品目录。",
            "avoid_objects": ["knife", "human child", "parent"],
        },
        "prompt_tuning": {
            "style_anchor": "生活化猫咪主角团，暖色温柔绘本质感。",
            "style_reference_image_ids": [
                "docs/image-reference/01_主方向_生活化猫咪主角团.png"
            ],
            "scene_reference_image_ids": [
                "docs/image-reference/05_生活场景适配换装板.png"
            ],
            "must_keep": ["single-species cat cast", "scene-first story moment"],
            "avoid": ["human student", "object catalog layout"],
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
