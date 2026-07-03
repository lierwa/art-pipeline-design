from __future__ import annotations

from typing import TYPE_CHECKING

from art_pipeline.course_planner.models import (
    CharacterIpProfile,
    ReferenceLibraryImage,
)
from art_pipeline.course_planner.scene_package_errors import (
    ScenePackageValidationError,
)

if TYPE_CHECKING:
    from art_pipeline.course_planner.scene_package_models import (
        ChapterCastAssignment,
        ChapterReferenceSelection,
        ChapterScenePackage,
    )


LibraryPayload = tuple[list[CharacterIpProfile], list[ReferenceLibraryImage]]


def is_prompt_ready(package: ChapterScenePackage) -> bool:
    has_character = all(
        assignment.character_ip_id.strip()
        and assignment.action_intent.strip()
        and assignment.reference_image_ids
        for assignment in package.cast_assignments
    ) and bool(package.cast_assignments)
    has_target_objects = bool(package.target_objects)
    has_avoid_review = package.prompt_confirmations.avoid_objects_reviewed
    has_spatial_contract = bool(package.prompt.scene_spatial_contract.strip())
    has_style_resolution = (
        any(
            selection.prompt_role == "style"
            for selection in package.reference_selections
        )
        or package.prompt_confirmations.style_reference_mode == "confirmed_empty"
    )
    return (
        bool(package.prompt.prompt_text.strip())
        and has_character
        and has_target_objects
        and has_avoid_review
        and has_spatial_contract
        and has_style_resolution
    )


def build_empty_scene_prompt(
    package: ChapterScenePackage,
    libraries: LibraryPayload | None = None,
) -> str:
    return "\n".join(_prompt_projection_parts(package, libraries))


def build_complete_prompt(
    package: ChapterScenePackage,
    libraries: LibraryPayload | None = None,
) -> str:
    parts = _prompt_projection_parts(package, libraries)
    if package.current_empty_scene_image_id:
        parts.append(
            f"Selected empty scene image: {package.current_empty_scene_image_id}"
        )
    return "\n".join(parts)


def _prompt_projection_parts(
    package: ChapterScenePackage,
    libraries: LibraryPayload | None,
) -> list[str]:
    character_lookup, reference_lookup = _library_lookups(package, libraries)
    parts: list[str] = []
    if package.prompt.prompt_text.strip():
        parts.append(package.prompt.prompt_text.strip())
    if package.prompt.scene_spatial_contract.strip():
        parts.append(package.prompt.scene_spatial_contract.strip())
    if package.cast_assignments:
        parts.extend(
            _cast_prompt_lines(
                package.cast_assignments,
                character_lookup,
                reference_lookup,
            )
        )
    if package.target_objects:
        target_text = ", ".join(item.label.strip() for item in package.target_objects)
        parts.append(f"Target objects: {target_text}")
    if package.avoid_objects:
        avoid_text = ", ".join(item.label.strip() for item in package.avoid_objects)
        parts.append(f"Avoid objects: {avoid_text}")
    if package.reference_selections:
        parts.extend(
            _reference_selection_lines(
                package.reference_selections,
                reference_lookup,
            )
        )
    return parts


def _library_lookups(
    package: ChapterScenePackage,
    libraries: LibraryPayload | None,
) -> tuple[dict[str, CharacterIpProfile], dict[str, ReferenceLibraryImage]]:
    if not package.cast_assignments and not package.reference_selections:
        return {}, {}
    if libraries is None:
        raise ScenePackageValidationError(
            "Prompt projection requires library records when cast assignments or reference selections exist."
        )
    characters, reference_images = libraries
    return (
        {character.id: character for character in characters},
        {image.id: image for image in reference_images},
    )


def _cast_prompt_lines(
    cast_assignments: list[ChapterCastAssignment],
    character_lookup: dict[str, CharacterIpProfile],
    reference_lookup: dict[str, ReferenceLibraryImage],
) -> list[str]:
    lines: list[str] = []
    for assignment in cast_assignments:
        character = character_lookup.get(assignment.character_ip_id)
        if character is None:
            raise ScenePackageValidationError(
                "Missing character library record for cast assignment "
                f"{assignment.id}: {assignment.character_ip_id}"
            )
        missing_reference_ids = [
            reference_id
            for reference_id in assignment.reference_image_ids
            if reference_id not in reference_lookup
        ]
        if missing_reference_ids:
            raise ScenePackageValidationError(
                "Missing reference library records for cast assignment "
                f"{assignment.id}: {', '.join(missing_reference_ids)}"
            )
        line = (
            f"Cast {assignment.role_label}: {character.display_name}; "
            f"action: {assignment.action_intent}"
        )
        if character.visual_invariants.strip():
            line += f"; invariants: {character.visual_invariants.strip()}"
        reference_names = [
            reference_lookup[reference_id].original_filename
            for reference_id in assignment.reference_image_ids
        ]
        if reference_names:
            line += f"; references: {', '.join(reference_names)}"
        lines.append(line)
    return lines


def _reference_selection_lines(
    reference_selections: list[ChapterReferenceSelection],
    reference_lookup: dict[str, ReferenceLibraryImage],
) -> list[str]:
    lines: list[str] = []
    for selection in reference_selections:
        reference = reference_lookup.get(selection.reference_image_id)
        if reference is None:
            raise ScenePackageValidationError(
                "Missing reference library record for selection "
                f"{selection.id}: {selection.reference_image_id}"
            )
        line = f"Reference {selection.prompt_role}: {reference.original_filename}"
        if reference.notes.strip():
            line += f" ({reference.notes.strip()})"
        lines.append(line)
    return lines
