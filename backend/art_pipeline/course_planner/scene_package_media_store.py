from __future__ import annotations

from pathlib import Path

from art_pipeline.course_planner.scene_package_errors import (
    ScenePackageChildNotFoundError,
    ScenePackagePreconditionError,
    ScenePackageValidationError,
    UnknownCompleteSceneImageError,
)
from art_pipeline.course_planner.scene_package_assembly_validation import (
    validate_assembly_manifest,
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
    FinalScenePlacedAssetSnapshot,
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
            ),
            validate_assembly=False,
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
            ),
            validate_assembly=False,
        )

    def record_complete_image_import_run(
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
            current.model_copy(update={"complete_images": updated_complete_images}),
            validate_assembly=False,
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
        linked_target_object_id = _validated_linked_target_object_id(
            current,
            linked_target_object_id,
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
            ),
            validate_assembly=False,
        )

    def duplicate_chapter_asset(
        self,
        chapter_id: str,
        asset_id: str,
    ) -> ChapterScenePackage:
        current, scene_pack_id = self._load_scene_package_for_write(chapter_id)
        source_asset = next(
            (asset for asset in current.chapter_assets if asset.id == asset_id),
            None,
        )
        if source_asset is None or source_asset.status != "available":
            raise ScenePackageChildNotFoundError(asset_id)
        linked_target_object_id = _validated_linked_target_object_id(
            current,
            source_asset.linked_target_object_id,
        )
        duplicated_asset_id, storage_path = next_scene_package_media_slot(
            current.chapter_assets,
            kind="assets",
            prefix="chapter_asset",
        )
        source_path = self._scene_package_media_path(
            scene_pack_id,
            current.chapter_id,
            source_asset.storage_path,
        )
        duplicated_asset = source_asset.model_copy(
            update={
                "id": duplicated_asset_id,
                "storage_path": storage_path,
                "linked_target_object_id": linked_target_object_id,
                "status": "available",
                "created_at": utc_now(),
            }
        )
        # WHY: duplicate 复用已经校验过的媒体与 lineage，避免页面各自拼接一份“近似复制”
        # 的资产快照，导致文件系统事实和 scene-package 记录再次分叉。
        self._write_scene_package_media_file(
            scene_pack_id,
            current.chapter_id,
            duplicated_asset.storage_path,
            source_path.read_bytes(),
        )
        return self.write_chapter_scene_package(
            current.model_copy(
                update={
                    "chapter_assets": [*current.chapter_assets, duplicated_asset]
                }
            ),
            validate_assembly=False,
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
        assembly_errors = validate_assembly_manifest(current)
        if assembly_errors:
            # WHY: Lock Final 是把当前 assembly 固化成 final_scene 的唯一入口；
            # 这里必须复用同一份 backend readiness 合同，避免前端禁用态被直接 API 调用绕过。
            raise ScenePackagePreconditionError(
                "Lock Final requires a ready assembly manifest: "
                + "; ".join(assembly_errors)
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
            placed_assets=self._build_final_scene_placed_asset_snapshots(current),
            prompt_snapshot=build_complete_prompt(
                current,
                self._prompt_projection_libraries(),
            ),
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
            current.model_copy(update={"final_scene": final_scene}),
            validate_assembly=False,
        )

    def _build_final_scene_placed_asset_snapshots(
        self,
        package: ChapterScenePackage,
    ) -> list[FinalScenePlacedAssetSnapshot]:
        available_assets = {
            asset.id: asset for asset in package.chapter_assets if asset.status == "available"
        }
        snapshots: list[FinalScenePlacedAssetSnapshot] = []
        for placement in package.assembly.placements:
            asset = available_assets.get(placement.asset_id)
            if asset is None:
                # WHY: backend readiness 已经禁止 removed/unknown asset 进入 Lock Final；
                # 这里继续显式报错，避免 final_scene 落盘成“有 placement 但缺少资产快照”的半冻结状态。
                raise ScenePackagePreconditionError(
                    "Lock Final requires a ready assembly manifest: "
                    f"Placement {placement.id} references unknown or unavailable asset_id: {placement.asset_id}"
                )
            snapshots.append(
                FinalScenePlacedAssetSnapshot(
                    placement_id=placement.id,
                    asset_id=asset.id,
                    display_name=asset.display_name,
                    original_filename=asset.original_filename,
                    storage_path=asset.storage_path,
                    media_type=asset.media_type,
                    lineage=asset.lineage,
                    linked_target_object_id=asset.linked_target_object_id,
                    status=asset.status,
                )
            )
        return snapshots

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
        return build_empty_scene_prompt(package, self._prompt_projection_libraries())

    def _resolve_complete_prompt_snapshot(
        self,
        package: ChapterScenePackage,
        prompt_snapshot: str | None,
    ) -> str:
        if prompt_snapshot is not None:
            return prompt_snapshot
        return build_complete_prompt(package, self._prompt_projection_libraries())

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

    def _prompt_projection_libraries(self):
        return (self.list_character_ips(), self.list_reference_library_images())


def _validated_linked_target_object_id(
    package: ChapterScenePackage,
    linked_target_object_id: str | None,
) -> str | None:
    if linked_target_object_id is None:
        return None
    target_object_ids = {target.id for target in package.target_objects}
    if linked_target_object_id in target_object_ids:
        return linked_target_object_id
    # WHY: linked_target_object_id 会参与 backend readiness 覆盖计算；
    # 在写入边界拒绝未知目标，避免 asset pool 里出现“看似绑定、实际永远不覆盖”的第二套事实。
    raise ScenePackageValidationError(
        f"Unknown target object id for linkedTargetObjectId: {linked_target_object_id}"
    )
