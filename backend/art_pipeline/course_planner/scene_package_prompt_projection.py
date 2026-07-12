from __future__ import annotations

from typing import TYPE_CHECKING

from art_pipeline.course_planner.models import (
    CharacterIpProfile,
    LibraryImageAsset,
    SceneStyleReference,
)
from art_pipeline.course_planner.scene_package_errors import ScenePackageValidationError

if TYPE_CHECKING:
    from art_pipeline.course_planner.scene_package_models import (
        ChapterCastAssignment,
        ChapterScenePackage,
    )


LibraryPayload = tuple[
    list[CharacterIpProfile],
    list[SceneStyleReference],
    dict[str, LibraryImageAsset],
]


def is_prompt_ready(package: ChapterScenePackage) -> bool:
    has_character = bool(package.cast_assignments) and all(
        assignment.character_ip_id.strip() and assignment.action_intent.strip()
        for assignment in package.cast_assignments
    )
    return (
        bool(package.prompt.prompt_text.strip())
        and has_character
        and bool(package.target_objects)
        and package.prompt_confirmations.avoid_objects_reviewed
        and bool(package.prompt.scene_spatial_contract.strip())
        and bool(package.scene_style_reference_id)
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
        parts.append(f"Selected empty scene image: {package.current_empty_scene_image_id}")
    return "\n".join(parts)


def _prompt_projection_parts(
    package: ChapterScenePackage,
    libraries: LibraryPayload | None,
) -> list[str]:
    character_lookup, style_lookup, asset_lookup = _library_lookups(package, libraries)
    parts: list[str] = []
    if package.prompt.prompt_text.strip():
        parts.append(package.prompt.prompt_text.strip())
    if package.prompt.scene_spatial_contract.strip():
        parts.append(package.prompt.scene_spatial_contract.strip())
    parts.extend(_cast_prompt_lines(package.cast_assignments, character_lookup, asset_lookup))
    if package.target_objects:
        parts.append("Target objects: " + ", ".join(item.label.strip() for item in package.target_objects))
    if package.avoid_objects:
        parts.append("Avoid objects: " + ", ".join(item.label.strip() for item in package.avoid_objects))
    if package.scene_style_reference_id:
        parts.append(
            _style_prompt_line(package.scene_style_reference_id, style_lookup, asset_lookup)
        )
    return parts


def _library_lookups(
    package: ChapterScenePackage,
    libraries: LibraryPayload | None,
) -> tuple[
    dict[str, CharacterIpProfile],
    dict[str, SceneStyleReference],
    dict[str, LibraryImageAsset],
]:
    if not package.cast_assignments and not package.scene_style_reference_id:
        return {}, {}, {}
    if libraries is None:
        raise ScenePackageValidationError(
            "Prompt projection requires global library records for selected characters and style."
        )
    characters, styles, assets = libraries
    return (
        {character.id: character for character in characters},
        {style.id: style for style in styles},
        assets,
    )


def _cast_prompt_lines(
    cast_assignments: list[ChapterCastAssignment],
    character_lookup: dict[str, CharacterIpProfile],
    asset_lookup: dict[str, LibraryImageAsset],
) -> list[str]:
    lines: list[str] = []
    for assignment in cast_assignments:
        character = character_lookup.get(assignment.character_ip_id)
        if character is None:
            raise ScenePackageValidationError(
                "Missing character library record for cast assignment "
                f"{assignment.id}: {assignment.character_ip_id}"
            )
        asset = asset_lookup.get(character.current_model_sheet_id)
        if asset is None:
            raise ScenePackageValidationError(
                "Missing Character Model Sheet for cast assignment "
                f"{assignment.id}: {character.current_model_sheet_id}"
            )
        lines.append(
            f"Cast {assignment.role_label}: {character.display_name}; "
            f"action: {assignment.action_intent}; "
            f"model sheet: {asset.original_filename} [{asset.id}]"
        )
    return lines


def _style_prompt_line(
    style_id: str,
    style_lookup: dict[str, SceneStyleReference],
    asset_lookup: dict[str, LibraryImageAsset],
) -> str:
    style = style_lookup.get(style_id)
    if style is None:
        raise ScenePackageValidationError(
            f"Missing Scene Style Reference library record: {style_id}"
        )
    asset = asset_lookup.get(style.current_image_id)
    if asset is None:
        raise ScenePackageValidationError(
            f"Missing Scene Style Reference image: {style.current_image_id}"
        )
    return f"Scene style: {style.display_name}; reference: {asset.original_filename} [{asset.id}]"
