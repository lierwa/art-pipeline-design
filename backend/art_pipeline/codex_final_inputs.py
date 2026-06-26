from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

from art_pipeline.codex_final_jobs import CodexFinalJobInput
from art_pipeline.exporting.files import resolve_workspace_path


@dataclass(frozen=True)
class CodexFinalInputRole:
    role: str
    description: str
    required: bool = True


@dataclass(frozen=True)
class CodexFinalInputImage:
    path: str
    role: str
    required: bool = True


SOURCE_CROP_ROLE = CodexFinalInputRole(
    role="source_crop",
    description=(
        "is the highest-authority reference for object identity, isometric angle, "
        "scale, canvas occupancy, anchor point, color, material, line weight, lighting, and layout."
    ),
)
TRANSPARENT_CUTOUT_ROLE = CodexFinalInputRole(
    role="transparent_cutout",
    description=(
        "is a rough silhouette guide, not a pixel source. It may be clipped, polluted, incomplete, "
        "jagged, or missing interior/exterior regions; it must never override source_crop."
    ),
)
MASK_ROLE = CodexFinalInputRole(
    role="mask",
    description="is diagnostic only. It describes selection/missing regions and does not define real object geometry.",
)
REMOVED_CHILD_MASK_ROLE = CodexFinalInputRole(
    role="removed_child_mask",
    description=(
        "marks a child object that must stay excluded from the parent final asset."
    ),
)
INPUT_ROLE_BY_NAME = {
    role.role: role
    for role in (
        SOURCE_CROP_ROLE,
        TRANSPARENT_CUTOUT_ROLE,
        MASK_ROLE,
        REMOVED_CHILD_MASK_ROLE,
    )
}


def build_codex_final_input_images(
    *,
    source_crop_path: str,
    transparent_cutout_path: str,
    mask_path: str,
    removed_child_mask_paths: Sequence[str],
) -> tuple[CodexFinalInputImage, ...]:
    base_images = (
        CodexFinalInputImage(path=source_crop_path, role=SOURCE_CROP_ROLE.role),
        CodexFinalInputImage(path=transparent_cutout_path, role=TRANSPARENT_CUTOUT_ROLE.role),
        CodexFinalInputImage(path=mask_path, role=MASK_ROLE.role),
    )
    child_images = tuple(
        CodexFinalInputImage(path=path, role=REMOVED_CHILD_MASK_ROLE.role)
        for path in removed_child_mask_paths
    )
    return (*base_images, *child_images)


def codex_final_prompt_input_role_lines(
    input_images: Sequence[CodexFinalInputImage],
) -> list[str]:
    lines: list[str] = []
    index = 1
    while index <= len(input_images):
        image = input_images[index - 1]
        end = index
        while end < len(input_images) and input_images[end].role == image.role:
            end += 1
        role = INPUT_ROLE_BY_NAME[image.role]
        marker = f"{index}+." if end > index else f"{index}."
        lines.append(f"{marker} {role.role} {role.description}")
        index = end + 1
    return lines


def resolve_codex_final_input_paths(
    workspace_root: Path,
    input_images: Sequence[CodexFinalInputImage],
) -> tuple[Path, ...]:
    return tuple(resolve_workspace_path(workspace_root, image.path) for image in input_images)


def codex_final_job_inputs(
    input_images: Sequence[CodexFinalInputImage],
) -> list[CodexFinalJobInput]:
    return [
        CodexFinalJobInput(path=image.path, role=image.role, required=image.required)
        for image in input_images
    ]


def codex_final_input_images_from_job_inputs(
    input_images: Sequence[CodexFinalJobInput],
) -> tuple[CodexFinalInputImage, ...]:
    return tuple(
        CodexFinalInputImage(path=image.path, role=image.role, required=image.required)
        for image in input_images
    )


def required_input_path(
    input_images: Sequence[CodexFinalInputImage],
    role: str,
) -> str:
    for image in input_images:
        if image.role == role:
            return image.path
    raise ValueError(f"Codex final job is missing required input role {role}.")
