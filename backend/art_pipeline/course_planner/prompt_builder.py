from __future__ import annotations

from art_pipeline.course_planner.models import (
    CastBinding,
    PromptPackage,
    PromptTuning,
    SceneDirectorPlan,
    SceneVocabulary,
)


def build_prompt_package(
    scene_director_plan: SceneDirectorPlan,
    cast_bindings: list[CastBinding],
    scene_vocabulary: SceneVocabulary,
    prompt_tuning: PromptTuning,
) -> PromptPackage:
    if not cast_bindings:
        raise ValueError("Prompt package requires confirmed cast bindings.")

    character_lines = [_format_cast_binding(binding) for binding in cast_bindings]
    invariant_lines = _character_invariants(cast_bindings)
    anchor_lines = _bullet_lines(scene_vocabulary.narrative_anchors)
    candidate_text = _comma_list(scene_vocabulary.optional_vocabulary_candidates)
    avoid_values = _avoid_values(scene_vocabulary, prompt_tuning)
    avoid_lines = _bullet_lines(avoid_values) if avoid_values else ["- Avoid unsafe, off-theme, cluttered, or unexplained elements."]
    style_anchor = prompt_tuning.style_anchor or scene_director_plan.style_and_constraints
    negative_values = [*avoid_values, scene_director_plan.style_and_constraints]
    full_prompt = "\n".join(
        [
            "Create one high-quality ChatGPT Image2 illustration.",
            "",
            "Output goal:",
            "Create a single polished scene-first story moment. The image must read as one coherent visual event led by the selected cat IP characters, not a catalog, worksheet, collage, or object grid.",
            "",
            "Style anchor:",
            style_anchor,
            "",
            "Selected character IP and role assignment:",
            *character_lines,
            "",
            "Character invariants:",
            *invariant_lines,
            "Do not introduce unassigned main characters or generic human-role substitutes.",
            "",
            "Scene / story event:",
            scene_director_plan.story_event,
            "",
            "Composition and camera:",
            scene_director_plan.scene_composition,
            "",
            "Spatial layout:",
            scene_director_plan.spatial_structure,
            "",
            "Action and interaction design:",
            scene_director_plan.action_design,
            "",
            "Narrative anchors:",
            *(anchor_lines or ["- Keep the story event readable without overloading props."]),
            "",
            "Ambient scene detail:",
            scene_vocabulary.ambient_furnishing_policy
            or "Include natural, lived-in background details appropriate to the room; do not limit the scene to only the listed narrative anchors.",
            "",
            "Optional scene vocabulary candidates:",
            candidate_text or "none",
            "Use these only when they naturally fit the scene. Do not force every candidate object into the image. The story event, selected character IP, and readable composition are more important than vocabulary coverage.",
            "",
            "Reference image usage:",
            _reference_usage_text(cast_bindings, prompt_tuning),
            "",
            "Constraints / avoid list:",
            *avoid_lines,
            "No visible text, watermark, logo, UI, labels, speech bubbles, flat inventory layout, floating object showcase, extra limbs, duplicated characters, or mixed species unless explicitly assigned above.",
        ]
    )
    # WHY: Image2 的可控点是角色/参考图/叙事焦点，而不是逐物体排布。
    # 候选词只作为可选词池写入软约束，避免把学习 vocabulary 误编译成必出清单。
    return PromptPackage(
        full_prompt=full_prompt,
        short_prompt=f"{scene_director_plan.story_event} Cast: {_comma_list([binding.display_name for binding in cast_bindings])}.",
        negative_constraints=(
            "no visible text, no watermark, no logo, no UI, no labels, no speech bubbles, "
            "no object catalog layout, no forced vocabulary coverage, no generic human-role substitutes, "
            "no extra limbs, no duplicated characters; "
            + "; ".join(value for value in negative_values if value.strip())
        ),
        revision_prompt=(
            "Revise the image and preserve the same style anchor, selected cat IP identities, "
            "reference-image identity cues, scene-first story event, and camera/composition logic. "
            "Only adjust the issues described by the reviewer; do not add every optional vocabulary candidate."
        ),
    )


build_image2_prompt_package = build_prompt_package


def _format_cast_binding(binding: CastBinding) -> str:
    references = _comma_list(binding.reference_image_ids) or "reference pending"
    return (
        f"- {binding.display_name} ({binding.character_id}), role: {binding.role_in_scene}; "
        f"action: {binding.action_intent}; references: {references}"
    )


def _character_invariants(cast_bindings: list[CastBinding]) -> list[str]:
    lines: list[str] = []
    for binding in cast_bindings:
        if binding.invariants:
            lines.append(f"- {binding.display_name}: {_comma_list(binding.invariants)}")
        else:
            lines.append(f"- {binding.display_name}: preserve all visible identity cues from the attached character references.")
    return lines


def _reference_usage_text(
    cast_bindings: list[CastBinding],
    prompt_tuning: PromptTuning,
) -> str:
    character_refs = [ref for binding in cast_bindings for ref in binding.reference_image_ids]
    style_refs = prompt_tuning.style_reference_image_ids
    scene_refs = prompt_tuning.scene_reference_image_ids
    return (
        "Use attached character references as identity anchors; preserve species, silhouette, face markings, outfit logic, and personality. "
        f"Character refs: {_comma_list(character_refs) or 'pending manual attachment'}. "
        f"Style refs: {_comma_list(style_refs) or 'pending manual attachment'}. "
        f"Scene refs: {_comma_list(scene_refs) or 'pending manual attachment'}."
    )


def _avoid_values(
    scene_vocabulary: SceneVocabulary,
    prompt_tuning: PromptTuning,
) -> list[str]:
    values = [*scene_vocabulary.avoid_objects, *prompt_tuning.avoid]
    return _dedupe_values([_safe_avoid_value(value) for value in values])


def _safe_avoid_value(value: str) -> str:
    normalized = value.strip()
    lower = normalized.lower()
    forbidden_role_terms = ("student", "child", "parent", "kid", "小学生", "孩子", "家长")
    if any(term in lower for term in forbidden_role_terms):
        return "generic human-role substitute"
    return normalized


def _dedupe_values(values: list[str]) -> list[str]:
    result: list[str] = []
    for value in values:
        if value and value not in result:
            result.append(value)
    return result


def _bullet_lines(values: list[str]) -> list[str]:
    return [f"- {value}" for value in values if value.strip()]


def _comma_list(values: list[str]) -> str:
    return ", ".join(value.strip() for value in values if value.strip())
