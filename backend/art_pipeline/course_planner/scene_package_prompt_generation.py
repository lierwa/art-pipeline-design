from __future__ import annotations

import json
import unicodedata
from pathlib import Path
from typing import Literal
from uuid import NAMESPACE_URL, uuid5

from pydantic import Field, model_validator

from art_pipeline.course_planner.codex_json_provider import CodexJsonProvider
from art_pipeline.course_planner.models import Chapter, CoursePlannerModel
from art_pipeline.course_planner.scene_package_errors import (
    ScenePackagePreconditionError,
)
from art_pipeline.course_planner.scene_package_models import (
    AvoidObjectItem,
    CharacterModelSheetSnapshot,
    ChapterScenePackage,
    GeneratedChapterCastDirection,
    GeneratedChapterPromptPackage,
    GeneratedChapterPromptReferenceSnapshot,
    TargetObjectItem,
)
from art_pipeline.course_planner.store import CoursePlannerStore
from art_pipeline.workspace.store import utc_now


class GeneratedTargetObjectDraft(CoursePlannerModel):
    label: str = Field(min_length=1)
    description: str = ""
    priority: Literal["core", "required", "recommended"] = "required"


class GeneratedAvoidObjectDraft(CoursePlannerModel):
    label: str = Field(min_length=1)
    description: str = ""


class GenerateChapterPromptPackageOutput(CoursePlannerModel):
    empty_scene_prompt: str = Field(min_length=1)
    complete_scene_prompt: str = Field(min_length=1)
    scene_spatial_contract: str = Field(min_length=1)
    cast_directions: list[GeneratedChapterCastDirection] = Field(min_length=1)
    target_objects: list[GeneratedTargetObjectDraft] = Field(default_factory=list)
    avoid_objects: list[GeneratedAvoidObjectDraft] = Field(default_factory=list)

    @model_validator(mode="after")
    def _require_unique_generated_items(self) -> "GenerateChapterPromptPackageOutput":
        _require_unique_labels(self.target_objects, "target object")
        _require_unique_labels(self.avoid_objects, "avoid object")
        return self


def require_prompt_generation_inputs(package: ChapterScenePackage) -> None:
    if not 1 <= len(package.selected_character_ip_ids) <= 2:
        raise ScenePackagePreconditionError(
            "Prompt generation requires one or two selected Character IPs."
        )
    if package.scene_style_reference_id is None:
        raise ScenePackagePreconditionError(
            "Prompt generation requires a Scene Style Reference."
        )


def generate_chapter_prompt_package(
    *,
    store: CoursePlannerStore,
    provider: CodexJsonProvider,
    chapter: Chapter,
    package: ChapterScenePackage,
    feedback: str,
    artifact_dir: Path,
) -> ChapterScenePackage:
    require_prompt_generation_inputs(package)
    characters = [
        store.get_character_ip(character_id)
        for character_id in package.selected_character_ip_ids
    ]
    character_inputs = []
    character_snapshots = []
    for character in characters:
        _, model_sheet = store.read_character_model_sheet(character.id)
        character_inputs.append(
            {
                "character_ip": character.model_dump(mode="json"),
                "model_sheet": model_sheet.model_dump(mode="json"),
            }
        )
        character_snapshots.append(
            CharacterModelSheetSnapshot(
                character_ip_id=character.id,
                model_sheet_id=model_sheet.id,
            )
        )
    style = store.get_scene_style_reference(package.scene_style_reference_id)
    _, style_image = store.read_scene_style_image(style.id)
    current_empty_scene = _current_empty_scene_payload(package)
    output = provider.run_json_task(
        prompt=_generation_prompt(
            chapter=chapter,
            character_inputs=character_inputs,
            scene_style={
                "scene_style_reference": style.model_dump(mode="json"),
                "image": style_image.model_dump(mode="json"),
            },
            current_empty_scene=current_empty_scene,
            feedback=feedback,
        ),
        output_model=GenerateChapterPromptPackageOutput,
        artifact_dir=artifact_dir,
    )
    direction_ids = [item.character_ip_id for item in output.cast_directions]
    if direction_ids != package.selected_character_ip_ids:
        raise ValueError(
            "AI cast_directions must cover exactly the selected Character IPs in selection order."
        )
    prompt_package = GeneratedChapterPromptPackage(
        empty_scene_prompt=output.empty_scene_prompt,
        complete_scene_prompt=output.complete_scene_prompt,
        scene_spatial_contract=output.scene_spatial_contract,
        cast_directions=output.cast_directions,
        reference_snapshot=GeneratedChapterPromptReferenceSnapshot(
            character_model_sheets=character_snapshots,
            scene_style_reference_id=style.id,
            scene_style_image_id=style_image.id,
            current_empty_scene_image_id=package.current_empty_scene_image_id,
            global_reference_image_ids=[],
        ),
        generation_feedback=feedback,
        generated_at=utc_now(),
    )
    updated = package.model_copy(
        update={
            "current_prompt_package": prompt_package,
            "target_objects": [
                TargetObjectItem(
                    id=_stable_item_id(chapter.id, "target_object", item.label),
                    label=item.label,
                    description=item.description,
                    priority=item.priority,
                )
                for item in output.target_objects
            ],
            "avoid_objects": [
                AvoidObjectItem(
                    id=_stable_item_id(chapter.id, "avoid_object", item.label),
                    label=item.label,
                    description=item.description,
                )
                for item in output.avoid_objects
            ],
        }
    )
    # WHY: provider 输出和跨字段角色覆盖全部通过后才写整包；任何 AI/协议失败都不会
    # 先清空上一份成功结果，保持当前 Prompt Package 的原子替换语义。
    return store.write_chapter_scene_package(updated, validate_assembly=False)


def _generation_prompt(
    *,
    chapter: Chapter,
    character_inputs: list[dict[str, object]],
    scene_style: dict[str, object],
    current_empty_scene: dict[str, object] | None,
    feedback: str,
) -> str:
    payload = {
        "chapter_seed": chapter.seed.model_dump(mode="json"),
        "selected_characters": character_inputs,
        "scene_style": scene_style,
        "current_empty_scene": current_empty_scene,
        "feedback": feedback,
    }
    return (
        "Generate one coherent Chapter Prompt Package as strict JSON. "
        "cast_directions must contain exactly the selected Character IP ids in input order; "
        "never add generic children, parents, students, animals, or any unselected character. "
        "The Empty Scene Prompt must describe only the spatial shell, layout, camera, style, "
        "lighting, and negative constraints, excluding all characters and detachable target objects. "
        "The Complete Scene Prompt must include the selected characters, their generated actions, "
        "target objects, spatial relationships, and style constraints. If current_empty_scene exists, "
        "treat it as a visual reference. Return both prompts on every generation.\n"
        + json.dumps(payload, ensure_ascii=False, indent=2)
    )


def _current_empty_scene_payload(
    package: ChapterScenePackage,
) -> dict[str, object] | None:
    if package.current_empty_scene_image_id is None:
        return None
    return next(
        (
            image.model_dump(mode="json")
            for image in package.empty_scene_images
            if image.id == package.current_empty_scene_image_id
        ),
        None,
    )


def _stable_item_id(chapter_id: str, kind: str, label: str) -> str:
    normalized = unicodedata.normalize("NFKC", label).strip().casefold()
    digest = uuid5(NAMESPACE_URL, f"chapter-prompt:{chapter_id}:{kind}:{normalized}")
    return f"{kind}_{digest.hex[:16]}"


def _require_unique_labels(items: list[object], label: str) -> None:
    normalized = [
        unicodedata.normalize("NFKC", str(getattr(item, "label"))).strip().casefold()
        for item in items
    ]
    if len(normalized) != len(set(normalized)):
        raise ValueError(f"AI output contains duplicate {label} labels.")
