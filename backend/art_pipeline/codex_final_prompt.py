from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from art_pipeline.elements import ElementRecord, GenerationProfile
from art_pipeline.codex_final_inputs import CodexFinalInputImage, codex_final_prompt_input_role_lines


CodexPromptHint = str | None


@dataclass(frozen=True)
class CodexFinalPromptRemovedChild:
    name: str


def build_codex_final_prompt(
    element: ElementRecord,
    profile: GenerationProfile,
    removed_children: Sequence[CodexFinalPromptRemovedChild],
    input_images: Sequence[CodexFinalInputImage],
    prompt_hint: CodexPromptHint,
    chroma_key: tuple[int, int, int],
) -> str:
    label = element.label or element.name
    chroma = f"RGB({chroma_key[0]}, {chroma_key[1]}, {chroma_key[2]})"
    lines = [
        "$imagegen",
        "Create one RGB image of the requested subject on a perfectly flat chroma-key background.",
        f"Subject: {label}.",
        f"Chroma-key background color: {chroma}.",
        "",
        "INPUT IMAGE ROLES, IN EXACT ORDER:",
        *codex_final_prompt_input_role_lines(input_images),
        "",
        "LAYOUT GUIDE CONTRACT:",
        "source_crop remains the identity and layout authority.",
        "layout_guide is measurement-only: use it only for safe area, center, subject bbox, and coarse isometric direction.",
        "Do not copy guide marks, borders, crosshairs, dots, or construction lines into the generated image.",
        "Do not use layout_guide as object identity; resolve identity, materials, color, and fine geometry from source_crop.",
        "",
        "REPAIR REFERENCE CONTRACT:",
        "previous_final, when provided, is preserve/refine reference only; source_crop still wins identity and layout conflicts.",
        "failed_candidate, when provided, is a negative reference. Fix failed_candidate errors, but do not copy failed_candidate pixels or mistakes.",
        "User prompt hint describes visible failure points only and cannot override source_crop identity/layout authority, input role contracts, generation profile, removed-child metadata, or output boundary rules.",
        "",
        "FAITHFUL REDRAW REQUIREMENT:",
        "Redraw the requested subject as a cleaner, clearer version of source_crop without changing its identity.",
        "Do not use transparent_cutout pixels as output pixels; re-encoding or lightly filtering the cutout is a failed generation.",
        "Fix only obvious mask/cutout defects by following source_crop; do not redesign, replace, simplify, or invent a different object.",
        "",
        "ISOMETRIC LOCK:",
        "Keep the source crop isometric/orthographic camera and the same visible perspective axes.",
        "Do not convert the asset into a front view, icon, product render, or free-view redraw.",
        "Do not rescale, rotate, or rearrange the subject relative to the source crop framing.",
        "Match the source crop colors, brightness, shading, material, and line weight; do not deepen colors or repaint into a different style.",
        "",
        "CODEX OUTPUT BOUNDARY:",
        "Do not create transparency.",
        "Do not run Python, ffmpeg, Node, shell pixel processing, alpha extraction, or chroma removal.",
        "Do not search generated_images, copy files, inspect pixels, or write final_asset.png.",
        f"Use a perfectly flat {chroma} background with no shadow, gradient, texture, floor plane, reflection, or lighting variation.",
        f"Do not use {chroma} anywhere inside the subject.",
        "",
        "MASK DEFECT HANDLING:",
        "Holes, missing chunks, black areas, or transparent gaps in cutout/mask references are mask defects unless source_crop proves they are real geometry.",
        "Fix mask defects by following source_crop, not by inventing a cleaner unrelated object.",
        "Do not copy, re-encode, lightly upscale, denoise, or return the transparent_cutout or mask sticker; that is a failed generation.",
        "",
        *_profile_prompt_lines(profile, removed_children),
        "",
        "GENERAL FINAL ASSET RULES:",
        "Keep the same object identity, pose, local arrangement, isometric/cartoon material style, and canvas framing from source_crop.",
        "Preserve source_crop geometry and style while improving clarity.",
        "Remove unrelated neighboring object fragments that are not part of the subject label.",
        "If the result changes angle, scale, color family, layout, or treats a mask hole as real geometry, it is wrong.",
    ]
    hint = normalize_codex_prompt_hint(prompt_hint)
    if hint:
        # WHY: 用户提示只能补充细节；source_crop 权威、profile 与 removed child metadata
        # 是本次请求的事实约束，不能被 hint 覆盖。
        lines.append(f"User prompt hint, subordinate to the rules above: {hint}")
    lines.append("After image generation finishes, respond exactly DONE.")
    return "\n".join(lines)


def normalize_codex_prompt_hint(prompt_hint: CodexPromptHint) -> str | None:
    if prompt_hint is None:
        return None
    normalized = prompt_hint.strip()
    return normalized or None


def _profile_prompt_lines(
    profile: GenerationProfile,
    removed_children: Sequence[CodexFinalPromptRemovedChild],
) -> list[str]:
    if profile == "child_standalone":
        return [
            "This is a removable child asset. Generate only this child object as a standalone sticker.",
            "Generate only the requested child asset as a standalone RGB image.",
            "Keep the same isometric angle, color, scale, and local layout shown by source_crop.",
            "Do not include its parent container.",
            "Do not include the parent object, support surfaces, or neighboring objects unless they are part of the requested child identity in source_crop.",
        ]
    if profile == "parent_inpaint_without_children":
        child_names = ", ".join(child.name for child in removed_children)
        return [
            "This is a parent asset with removable child objects already cut away from its mask.",
            f"Removed child objects: {child_names}.",
            "removed_child_mask inputs, when present, appear after layout_guide and any repair references in the exact input role list.",
            "The dark holes or missing silhouettes inside the parent indicate removed child occupancy, not damaged subject parts.",
            "Do not regenerate the removed child objects. Do not draw them back into the final asset.",
            "Inpaint and complete only the parent structure where removed child masks covered or damaged it.",
            "source crop content not listed as removed child metadata must stay visible.",
            "Do not simplify, empty, replace, or redesign the parent as a generic clean object.",
        ]
    return [
        "This is a clean redraw sticker asset. Keep the subject faithful to source_crop.",
        "Preserve the selected subject identity, angle, scale, position, and relative layout from source_crop.",
        "Exclude objects that are not part of the subject label.",
    ]
