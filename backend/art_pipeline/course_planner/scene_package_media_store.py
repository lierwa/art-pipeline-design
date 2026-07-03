from __future__ import annotations

from pathlib import Path

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
    CompleteSceneImage,
    EmptySceneImage,
    FinalChapterScene,
    ImageReferenceSnapshot,
    build_complete_prompt,
    build_empty_scene_prompt,
)
from art_pipeline.workspace.store import utc_now


class CoursePlannerScenePackageMediaStoreMixin:
    def add_empty_scene_image(
        self,
        chapter_id: str,
        *,
        image_bytes: bytes,
        original_filename: str,
        prompt_snapshot: str | None,
        reference_image_ids: list[str],
    ) -> ChapterScenePackage:
        current, scene_pack_id = self._load_scene_package_for_write(chapter_id)
        width, height = read_scene_package_png_size(image_bytes, "Empty scene image")
        image_id, storage_path = next_scene_package_media_slot(
            current.empty_scene_images,
            kind="empty_scene_images",
            prefix="empty_scene",
        )
        image = EmptySceneImage(
            id=image_id,
            original_filename=sanitize_original_filename(original_filename),
            storage_path=storage_path,
            media_type="image/png",
            width=width,
            height=height,
            prompt_snapshot=self._resolve_empty_scene_prompt_snapshot(
                current,
                prompt_snapshot,
            ),
            reference_snapshot=self._build_reference_snapshot(
                current,
                reference_image_ids,
            ),
            created_at=utc_now(),
        )
        self._write_scene_package_media_file(
            scene_pack_id,
            current.chapter_id,
            image.storage_path,
            image_bytes,
        )
        return self.write_chapter_scene_package(
            current.model_copy(
                update={"empty_scene_images": [*current.empty_scene_images, image]}
            )
        )

    def add_complete_scene_image(
        self,
        chapter_id: str,
        *,
        image_bytes: bytes,
        original_filename: str,
        prompt_snapshot: str | None,
        reference_image_ids: list[str],
        generation_note: str,
    ) -> ChapterScenePackage:
        current, scene_pack_id = self._load_scene_package_for_write(chapter_id)
        width, height = read_scene_package_png_size(image_bytes, "Complete scene image")
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
            empty_scene_image_id=current.current_empty_scene_image_id,
            prompt_snapshot=self._resolve_complete_prompt_snapshot(
                current,
                prompt_snapshot,
            ),
            reference_snapshot=self._build_reference_snapshot(
                current,
                reference_image_ids,
                current_empty_scene_image_id=current.current_empty_scene_image_id,
            ),
            generation_note=generation_note,
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

    def add_direct_chapter_asset(
        self,
        chapter_id: str,
        *,
        image_bytes: bytes,
        original_filename: str,
        display_name: str,
        linked_target_object_id: str | None = None,
    ) -> ChapterScenePackage:
        current, scene_pack_id = self._load_scene_package_for_write(chapter_id)
        validate_scene_package_png_bytes(image_bytes, "Direct scene asset image")
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
            lineage=ChapterAssetLineage(source_kind="direct_upload"),
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
                source_kind="pipeline_run_asset",
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

    def lock_final_chapter_scene(
        self,
        chapter_id: str,
        *,
        image_bytes: bytes,
        original_filename: str,
    ) -> ChapterScenePackage:
        current, scene_pack_id = self._load_scene_package_for_write(chapter_id)
        if not current.current_empty_scene_image_id:
            raise ScenePackagePreconditionError(
                "Lock Final requires a selected Empty Scene Image."
            )
        if not current.assembly.placements:
            raise ScenePackagePreconditionError(
                "Lock Final requires at least one placed Scene Asset."
            )
        width, height = read_scene_package_png_size(
            image_bytes,
            "Final chapter scene image",
        )
        final_id, storage_path = next_scene_package_media_slot(
            [current.final_scene] if current.final_scene else [],
            kind="final_scene",
            prefix="final_scene",
        )
        final_scene = FinalChapterScene(
            id=final_id,
            original_filename=sanitize_original_filename(original_filename),
            storage_path=storage_path,
            media_type="image/png",
            width=width,
            height=height,
            empty_scene_image_id=current.current_empty_scene_image_id,
            assembly_snapshot=current.assembly,
            prompt_snapshot=build_complete_prompt(current),
            reference_snapshot=self._build_reference_snapshot(
                current,
                [
                    selection.reference_image_id
                    for selection in current.reference_selections
                ],
                current_empty_scene_image_id=current.current_empty_scene_image_id,
            ),
            created_at=utc_now(),
        )
        self._write_scene_package_media_file(
            scene_pack_id,
            current.chapter_id,
            final_scene.storage_path,
            image_bytes,
        )
        return self.write_chapter_scene_package(
            current.model_copy(update={"final_scene": final_scene})
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

    def _resolve_empty_scene_prompt_snapshot(
        self,
        package: ChapterScenePackage,
        prompt_snapshot: str | None,
    ) -> str:
        if prompt_snapshot is not None:
            return prompt_snapshot
        return build_empty_scene_prompt(package)

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
        reference_image_ids: list[str],
        *,
        current_empty_scene_image_id: str | None = None,
    ) -> ImageReferenceSnapshot:
        known_reference_image_ids = {
            selection.reference_image_id for selection in package.reference_selections
        }
        missing_reference_image_ids = [
            reference_image_id
            for reference_image_id in reference_image_ids
            if reference_image_id not in known_reference_image_ids
        ]
        if missing_reference_image_ids:
            raise ScenePackageValidationError(
                "Unknown scene package reference image ids: "
                + ", ".join(missing_reference_image_ids)
            )
        return ImageReferenceSnapshot(
            reference_image_ids=list(reference_image_ids),
            current_empty_scene_image_id=(
                package.current_empty_scene_image_id
                if current_empty_scene_image_id is None
                else current_empty_scene_image_id
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
