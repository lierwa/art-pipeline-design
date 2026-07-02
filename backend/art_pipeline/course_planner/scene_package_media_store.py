from __future__ import annotations

from pathlib import Path
from typing import Literal

from art_pipeline.course_planner.scene_package_errors import (
    ScenePackagePreconditionError,
    ScenePackageValidationError,
    UnknownCompleteSceneImageError,
)
from art_pipeline.course_planner.scene_package_media import (
    find_scene_package_media,
    next_scene_package_media_slot,
    read_scene_package_png_size,
    sanitize_original_filename,
    validate_scene_package_png_bytes,
)
from art_pipeline.course_planner.scene_package_models import (
    ChapterAsset,
    ChapterAssetLineage,
    ChapterScenePackage,
    ChapterSceneReference,
    CompleteSceneImage,
    EmptyBaseSceneCandidate,
    ImageReferenceSnapshot,
    build_base_prompt,
    build_complete_prompt,
)
from art_pipeline.workspace.store import utc_now


class CoursePlannerScenePackageMediaStoreMixin:
    def add_chapter_scene_reference(
        self,
        chapter_id: str,
        *,
        image_bytes: bytes,
        original_filename: str,
        prompt_role: Literal["style", "scene", "character", "other"] = "other",
        notes: str = "",
    ) -> ChapterScenePackage:
        current, scene_pack_id = self._load_scene_package_for_write(chapter_id)
        validate_scene_package_png_bytes(image_bytes, "Scene package reference image")
        reference_id, storage_path = next_scene_package_media_slot(
            current.references,
            kind="references",
            prefix="reference",
        )
        reference = ChapterSceneReference(
            id=reference_id,
            original_filename=sanitize_original_filename(original_filename),
            storage_path=storage_path,
            media_type="image/png",
            created_at=utc_now(),
            prompt_role=prompt_role,
            notes=notes,
        )
        self._write_scene_package_media_file(
            scene_pack_id,
            current.chapter_id,
            reference.storage_path,
            image_bytes,
        )
        return self.write_chapter_scene_package(
            current.model_copy(update={"references": [*current.references, reference]})
        )

    def add_empty_base_scene_candidate(
        self,
        chapter_id: str,
        *,
        image_bytes: bytes,
        original_filename: str,
        prompt_snapshot: str | None,
        reference_ids: list[str],
    ) -> ChapterScenePackage:
        current, scene_pack_id = self._load_scene_package_for_write(chapter_id)
        width, height = read_scene_package_png_size(
            image_bytes,
            "Base scene candidate image",
        )
        candidate_id, storage_path = next_scene_package_media_slot(
            current.base_candidates,
            kind="base_candidates",
            prefix="base_candidate",
        )
        candidate = EmptyBaseSceneCandidate(
            id=candidate_id,
            original_filename=sanitize_original_filename(original_filename),
            storage_path=storage_path,
            media_type="image/png",
            width=width,
            height=height,
            prompt_snapshot=self._resolve_base_prompt_snapshot(current, prompt_snapshot),
            reference_snapshot=self._build_reference_snapshot(current, reference_ids),
            created_at=utc_now(),
        )
        self._write_scene_package_media_file(
            scene_pack_id,
            current.chapter_id,
            candidate.storage_path,
            image_bytes,
        )
        return self.write_chapter_scene_package(
            current.model_copy(
                update={"base_candidates": [*current.base_candidates, candidate]}
            )
        )

    def add_complete_scene_image(
        self,
        chapter_id: str,
        *,
        image_bytes: bytes,
        original_filename: str,
        prompt_snapshot: str | None,
        reference_ids: list[str],
        variation_prompt: str,
    ) -> ChapterScenePackage:
        current, scene_pack_id = self._load_scene_package_for_write(chapter_id)
        locked_base_candidate_id = current.locked_base_candidate_id
        if not locked_base_candidate_id:
            raise ScenePackagePreconditionError(
                "Complete scene image upload requires a locked base."
            )
        if locked_base_candidate_id not in {
            candidate.id for candidate in current.base_candidates
        }:
            raise ScenePackagePreconditionError(
                "Locked base candidate must exist before complete upload."
            )
        width, height = read_scene_package_png_size(
            image_bytes,
            "Complete scene image",
        )
        complete_id, storage_path = next_scene_package_media_slot(
            current.complete_images,
            kind="complete_images",
            prefix="complete_scene",
        )
        complete = CompleteSceneImage(
            id=complete_id,
            original_filename=sanitize_original_filename(original_filename),
            storage_path=storage_path,
            media_type="image/png",
            width=width,
            height=height,
            base_candidate_id=locked_base_candidate_id,
            prompt_snapshot=self._resolve_complete_prompt_snapshot(
                current,
                prompt_snapshot,
            ),
            reference_snapshot=self._build_reference_snapshot(
                current,
                reference_ids,
                locked_base_candidate_id=locked_base_candidate_id,
            ),
            variation_prompt=variation_prompt,
            created_at=utc_now(),
        )
        self._write_scene_package_media_file(
            scene_pack_id,
            current.chapter_id,
            complete.storage_path,
            image_bytes,
        )
        return self.write_chapter_scene_package(
            current.model_copy(
                update={"complete_images": [*current.complete_images, complete]}
            )
        )

    def associate_complete_image_run(
        self,
        chapter_id: str,
        complete_image_id: str,
        *,
        run_id: str,
        run_status: str | None,
    ) -> ChapterScenePackage:
        current, _ = self._load_scene_package_for_write(chapter_id)
        updated_complete_images = [
            complete.model_copy(
                update={
                    "pipeline_run_id": run_id,
                    "pipeline_run_status": run_status,
                }
            )
            if complete.id == complete_image_id
            else complete
            for complete in current.complete_images
        ]
        if not any(complete.id == complete_image_id for complete in current.complete_images):
            raise UnknownCompleteSceneImageError(
                f"Unknown complete scene image id: {complete_image_id}"
            )
        return self.write_chapter_scene_package(
            current.model_copy(update={"complete_images": updated_complete_images})
        )

    def add_chapter_asset_from_run_asset(
        self,
        chapter_id: str,
        *,
        source_run_id: str,
        source_run_asset_id: str,
        image_bytes: bytes,
        original_filename: str,
        display_name: str,
        source_complete_image_id: str | None = None,
        linked_target_object_id: str | None = None,
    ) -> ChapterScenePackage:
        current, scene_pack_id = self._load_scene_package_for_write(chapter_id)
        validate_scene_package_png_bytes(image_bytes, "Chapter asset image")
        self._validate_chapter_asset_source(
            current,
            source_run_asset_id=source_run_asset_id,
            source_complete_image_id=source_complete_image_id,
        )
        asset_id, storage_path = next_scene_package_media_slot(
            current.chapter_assets,
            kind="assets",
            prefix="chapter_asset",
        )
        asset = ChapterAsset(
            id=asset_id,
            display_name=display_name,
            original_filename=sanitize_original_filename(original_filename),
            storage_path=storage_path,
            media_type="image/png",
            lineage=ChapterAssetLineage(
                source_run_id=source_run_id,
                source_run_asset_id=source_run_asset_id,
                source_complete_image_id=source_complete_image_id,
            ),
            linked_target_object_id=linked_target_object_id,
            created_at=utc_now(),
        )
        self._write_scene_package_media_file(
            scene_pack_id,
            current.chapter_id,
            asset.storage_path,
            image_bytes,
        )
        return self.write_chapter_scene_package(
            current.model_copy(
                update={"chapter_assets": [*current.chapter_assets, asset]}
            )
        )

    def read_chapter_scene_package_media(
        self,
        chapter_id: str,
        kind: str,
        media_id: str,
    ) -> tuple[Path, str]:
        current, scene_pack_id = self._load_scene_package_for_write(chapter_id)
        media = find_scene_package_media(current, kind, media_id)
        return (
            self._scene_package_media_path(
                scene_pack_id,
                current.chapter_id,
                media.storage_path,
            ),
            media.media_type,
        )

    def _write_scene_package_media_file(
        self,
        scene_pack_id: str,
        chapter_id: str,
        storage_path: str,
        image_bytes: bytes,
    ) -> None:
        self._write_bytes(
            self._scene_package_media_path(scene_pack_id, chapter_id, storage_path),
            image_bytes,
        )

    def _resolve_base_prompt_snapshot(
        self,
        package: ChapterScenePackage,
        prompt_snapshot: str | None,
    ) -> str:
        if prompt_snapshot is not None:
            return prompt_snapshot
        return build_base_prompt(package)

    def _resolve_complete_prompt_snapshot(
        self,
        package: ChapterScenePackage,
        prompt_snapshot: str | None,
    ) -> str:
        if prompt_snapshot is not None:
            return prompt_snapshot
        return build_complete_prompt(package)

    def _build_reference_snapshot(
        self,
        package: ChapterScenePackage,
        reference_ids: list[str],
        *,
        locked_base_candidate_id: str | None = None,
    ) -> ImageReferenceSnapshot:
        known_reference_ids = {reference.id for reference in package.references}
        missing_reference_ids = [
            reference_id
            for reference_id in reference_ids
            if reference_id not in known_reference_ids
        ]
        if missing_reference_ids:
            raise ScenePackageValidationError(
                "Unknown scene package reference ids: "
                + ", ".join(missing_reference_ids)
            )
        return ImageReferenceSnapshot(
            reference_ids=list(reference_ids),
            locked_base_candidate_id=(
                package.locked_base_candidate_id
                if locked_base_candidate_id is None
                else locked_base_candidate_id
            ),
        )

    def _validate_chapter_asset_source(
        self,
        package: ChapterScenePackage,
        *,
        source_run_asset_id: str,
        source_complete_image_id: str | None,
    ) -> None:
        # WHY: chapter asset 是对 run asset 的单次 chapter-owned materialization；
        # 同一 source_run_asset_id 若还可用，再次 add 会制造两份直接权威关系，后续
        # duplicate/relink 都无法判断哪份才是“原始引入”。
        if any(
            asset.lineage.source_run_asset_id == source_run_asset_id
            and asset.status == "available"
            for asset in package.chapter_assets
        ):
            raise ScenePackageValidationError(
                "An available chapter asset already exists for source_run_asset_id "
                f"{source_run_asset_id!r}."
            )
        if source_complete_image_id is None:
            return
        if not any(
            complete.id == source_complete_image_id for complete in package.complete_images
        ):
            raise ScenePackageValidationError(
                f"Unknown complete scene image id: {source_complete_image_id}"
            )
