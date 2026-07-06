from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import Field

from art_pipeline.codex_final_paths import codex_final_asset_path
from art_pipeline.course_planner.models import CoursePlannerModel
from art_pipeline.course_planner.scene_package_errors import (
    ScenePackageChildNotFoundError,
    ScenePackageValidationError,
)
from art_pipeline.course_planner.scene_package_media import read_scene_package_png_size
from art_pipeline.course_planner.scene_package_models import (
    ChapterAsset,
    ChapterAssetLineage,
    ChapterScenePackage,
    CompleteSceneImage,
)
from art_pipeline.course_planner.store import CoursePlannerStore
from art_pipeline.elements import ElementRecord
from art_pipeline.exporting.files import resolve_workspace_path
from art_pipeline.workspace.store import read_state, run_root


GeneratedAssetState = Literal["available", "unavailable", "added"]


class GeneratedChapterAsset(CoursePlannerModel):
    complete_scene_image_id: str = Field(min_length=1)
    pipeline_run_id: str = Field(min_length=1)
    run_asset_id: str = Field(min_length=1)
    display_name: str = Field(min_length=1)
    state: GeneratedAssetState
    width: int | None = None
    height: int | None = None
    unavailable_reason: str | None = None
    chapter_asset_id: str | None = None


class MaterializedGeneratedAsset(CoursePlannerModel):
    package: ChapterScenePackage
    asset: ChapterAsset


def list_generated_chapter_assets(
    *,
    store: CoursePlannerStore,
    workspace_root: Path,
    chapter_id: str,
) -> list[GeneratedChapterAsset]:
    package = store.read_chapter_scene_package(chapter_id)
    records: list[GeneratedChapterAsset] = []
    for complete_image in _complete_images_with_runs(package):
        records.extend(
            _records_for_complete_image(
                workspace_root=workspace_root,
                package=package,
                complete_image=complete_image,
            )
        )
    return records


def materialize_generated_chapter_asset(
    *,
    store: CoursePlannerStore,
    workspace_root: Path,
    chapter_id: str,
    complete_scene_image_id: str,
    pipeline_run_id: str,
    run_asset_id: str,
) -> MaterializedGeneratedAsset:
    package = store.read_chapter_scene_package(chapter_id)
    complete_image = _require_complete_image_run(
        package,
        complete_scene_image_id,
        pipeline_run_id,
    )
    existing = _existing_materialized_asset(
        package,
        pipeline_run_id=pipeline_run_id,
        run_asset_id=run_asset_id,
    )
    if existing is not None:
        return MaterializedGeneratedAsset(package=package, asset=existing)

    element = _require_run_element(workspace_root, pipeline_run_id, run_asset_id)
    if not _is_codex_generated_element(element):
        raise ScenePackageValidationError(
            f"Run asset {run_asset_id} was not completed through Codex image generation."
        )
    asset_path = _codex_asset_path(workspace_root, pipeline_run_id, element)
    if not asset_path.is_file():
        raise ScenePackageValidationError(
            f"Generated asset image is missing for run asset {run_asset_id}."
        )
    try:
        read_scene_package_png_size(
            asset_path.read_bytes(),
            "Generated scene asset image",
        )
    except ScenePackageValidationError as exc:
        raise ScenePackageValidationError(
            f"Generated asset image dimensions are unreadable for run asset {run_asset_id}."
        ) from exc

    lineage = ChapterAssetLineage(
        source_kind="generated_asset",
        complete_scene_image_id=complete_image.id,
        pipeline_run_id=pipeline_run_id,
        run_asset_id=run_asset_id,
    )
    next_package = store.add_generated_chapter_asset(
        chapter_id,
        image_bytes=asset_path.read_bytes(),
        original_filename=f"{run_asset_id}.png",
        display_name=_display_name(element),
        lineage=lineage,
    )
    materialized = _existing_materialized_asset(
        next_package,
        pipeline_run_id=pipeline_run_id,
        run_asset_id=run_asset_id,
    )
    if materialized is None:
        raise ScenePackageValidationError("Generated asset materialization did not persist.")
    return MaterializedGeneratedAsset(package=next_package, asset=materialized)


def _complete_images_with_runs(
    package: ChapterScenePackage,
) -> list[CompleteSceneImage]:
    return [
        complete
        for complete in package.complete_images
        if complete.status != "deleted" and complete.pipeline_run_id
    ]


def _records_for_complete_image(
    *,
    workspace_root: Path,
    package: ChapterScenePackage,
    complete_image: CompleteSceneImage,
) -> list[GeneratedChapterAsset]:
    run_id = complete_image.pipeline_run_id or ""
    try:
        state = read_state(run_root(workspace_root, run_id))
    except Exception:
        return []
    records: list[GeneratedChapterAsset] = []
    for element in state.elements:
        if not _is_codex_generated_element(element):
            continue
        records.append(
            _record_for_element(
                workspace_root=workspace_root,
                package=package,
                complete_image=complete_image,
                element=element,
            )
        )
    return records


def _record_for_element(
    *,
    workspace_root: Path,
    package: ChapterScenePackage,
    complete_image: CompleteSceneImage,
    element: ElementRecord,
) -> GeneratedChapterAsset:
    run_id = complete_image.pipeline_run_id or ""
    existing = _existing_materialized_asset(
        package,
        pipeline_run_id=run_id,
        run_asset_id=element.id,
    )
    asset_path = _codex_asset_path(workspace_root, run_id, element)
    if existing is not None:
        return GeneratedChapterAsset(
            complete_scene_image_id=complete_image.id,
            pipeline_run_id=run_id,
            run_asset_id=element.id,
            display_name=_display_name(element),
            state="added",
            chapter_asset_id=existing.id,
            **_dimensions_or_empty(asset_path),
        )
    if not asset_path.is_file():
        return _unavailable_record(
            complete_image,
            element,
            "Generated asset image file is missing.",
        )
    try:
        width, height = read_scene_package_png_size(
            asset_path.read_bytes(),
            "Generated scene asset image",
        )
    except ScenePackageValidationError:
        return _unavailable_record(
            complete_image,
            element,
            "Generated asset image dimensions are unreadable.",
        )
    return GeneratedChapterAsset(
        complete_scene_image_id=complete_image.id,
        pipeline_run_id=run_id,
        run_asset_id=element.id,
        display_name=_display_name(element),
        state="available",
        width=width,
        height=height,
    )


def _unavailable_record(
    complete_image: CompleteSceneImage,
    element: ElementRecord,
    reason: str,
) -> GeneratedChapterAsset:
    return GeneratedChapterAsset(
        complete_scene_image_id=complete_image.id,
        pipeline_run_id=complete_image.pipeline_run_id or "",
        run_asset_id=element.id,
        display_name=_display_name(element),
        state="unavailable",
        unavailable_reason=reason,
    )


def _dimensions_or_empty(path: Path) -> dict[str, int]:
    try:
        width, height = read_scene_package_png_size(
            path.read_bytes(),
            "Generated scene asset image",
        )
    except (OSError, ScenePackageValidationError):
        return {}
    return {"width": width, "height": height}


def _existing_materialized_asset(
    package: ChapterScenePackage,
    *,
    pipeline_run_id: str,
    run_asset_id: str,
) -> ChapterAsset | None:
    for asset in package.chapter_assets:
        lineage = asset.lineage
        if (
            asset.status == "available"
            and lineage.source_kind == "generated_asset"
            and lineage.pipeline_run_id == pipeline_run_id
            and lineage.run_asset_id == run_asset_id
        ):
            return asset
    return None


def _require_complete_image_run(
    package: ChapterScenePackage,
    complete_scene_image_id: str,
    pipeline_run_id: str,
) -> CompleteSceneImage:
    for complete in package.complete_images:
        if (
            complete.id == complete_scene_image_id
            and complete.status != "deleted"
            and complete.pipeline_run_id == pipeline_run_id
        ):
            return complete
    raise ScenePackageChildNotFoundError(
        f"Generated asset source complete image not found: {complete_scene_image_id}."
    )


def _require_run_element(
    workspace_root: Path,
    pipeline_run_id: str,
    run_asset_id: str,
) -> ElementRecord:
    state = read_state(run_root(workspace_root, pipeline_run_id))
    for element in state.elements:
        if element.id == run_asset_id:
            return element
    raise ScenePackageChildNotFoundError(
        f"Generated run asset not found: {run_asset_id}."
    )


def _codex_asset_path(
    workspace_root: Path,
    pipeline_run_id: str,
    element: ElementRecord,
) -> Path:
    return resolve_workspace_path(
        run_root(workspace_root, pipeline_run_id),
        codex_final_asset_path(element),
    )


def _is_codex_generated_element(element: ElementRecord) -> bool:
    provider = element.sourceProvider or ""
    return (
        provider.startswith("codex")
        or element.mode == "completed_by_codex"
        or element.repairStatus == "repair_complete"
        and provider.startswith("codex")
    )


def _display_name(element: ElementRecord) -> str:
    return (element.label or element.name or element.id).strip() or element.id
