from __future__ import annotations

from art_pipeline.course_planner.scene_package_errors import (
    ScenePackageChildNotFoundError,
    ScenePackagePreconditionError,
)
from art_pipeline.course_planner.scene_package_models import ChapterScenePackage


class CoursePlannerScenePackageDeleteStoreMixin:
    def delete_empty_scene_image(
        self,
        chapter_id: str,
        image_id: str,
    ) -> ChapterScenePackage:
        current, scene_pack_id = self._load_scene_package_for_write(chapter_id)
        image = next(
            (item for item in current.empty_scene_images if item.id == image_id),
            None,
        )
        if image is None:
            raise ScenePackageChildNotFoundError(image_id)
        if self._is_empty_scene_image_in_use(current, image_id):
            raise ScenePackagePreconditionError(
                f"Empty scene image {image_id} is still in use."
            )
        self._delete_scene_package_media_file(
            scene_pack_id,
            current.chapter_id,
            image.storage_path,
        )
        return self.write_chapter_scene_package(
            current.model_copy(
                update={
                    "empty_scene_images": [
                        item
                        for item in current.empty_scene_images
                        if item.id != image_id
                    ]
                }
            ),
            validate_assembly=False,
        )

    def delete_complete_scene_image(
        self,
        chapter_id: str,
        complete_image_id: str,
    ) -> ChapterScenePackage:
        current, _ = self._load_scene_package_for_write(chapter_id)
        if not any(
            complete.id == complete_image_id for complete in current.complete_images
        ):
            raise ScenePackageChildNotFoundError(complete_image_id)
        if self._is_complete_scene_image_in_use(current, complete_image_id):
            raise ScenePackagePreconditionError(
                f"Complete scene image {complete_image_id} is still used by chapter assets."
            )
        updated_complete_images = [
            complete.model_copy(update={"status": "deleted"})
            if complete.id == complete_image_id
            else complete
            for complete in current.complete_images
        ]
        # WHY: complete image 删除先保留 media 与 lineage，避免后续资产审计或回滚时
        # 出现“记录还在但二进制已消失”的悬空状态；foundation 阶段先把权威状态收敛到模型里。
        return self.write_chapter_scene_package(
            current.model_copy(update={"complete_images": updated_complete_images}),
            validate_assembly=False,
        )

    def delete_chapter_asset(
        self,
        chapter_id: str,
        asset_id: str,
    ) -> ChapterScenePackage:
        current, _ = self._load_scene_package_for_write(chapter_id)
        asset = next((item for item in current.chapter_assets if item.id == asset_id), None)
        if asset is None:
            raise ScenePackageChildNotFoundError(asset_id)
        updated_assets = [
            item.model_copy(update={"status": "removed"}) if item.id == asset_id else item
            for item in current.chapter_assets
        ]
        updated_assembly = self._remove_asset_from_assembly(current, asset_id)
        # WHY: delete chapter asset 只撤销 chapter-local 可用状态与 assembly 引用，
        # 不删除媒体文件，这样后续审计仍能看到历史素材与 lineage。
        return self.write_chapter_scene_package(
            current.model_copy(
                update={
                    "chapter_assets": updated_assets,
                    "assembly": updated_assembly,
                }
            ),
            validate_assembly=False,
        )

    def _delete_scene_package_media_file(
        self,
        scene_pack_id: str,
        chapter_id: str,
        storage_path: str,
    ) -> None:
        path = self._scene_package_media_path(scene_pack_id, chapter_id, storage_path)
        if path.exists():
            path.unlink()

    def _is_empty_scene_image_in_use(
        self,
        package: ChapterScenePackage,
        image_id: str,
    ) -> bool:
        if package.current_empty_scene_image_id == image_id:
            return True
        if package.assembly.empty_scene_image_id == image_id:
            return True
        if package.final_scene and package.final_scene.empty_scene_image_id == image_id:
            return True
        return any(
            complete.empty_scene_image_id == image_id
            for complete in package.complete_images
            if complete.status != "deleted"
        )

    def _is_complete_scene_image_in_use(
        self,
        package: ChapterScenePackage,
        complete_image_id: str,
    ) -> bool:
        return any(
            getattr(asset.lineage, "source_complete_image_id", None)
            == complete_image_id
            and asset.status == "available"
            for asset in package.chapter_assets
        )

    def _remove_asset_from_assembly(
        self,
        package: ChapterScenePackage,
        asset_id: str,
    ) -> ChapterScenePackage["assembly"]:
        removed_placement_ids = {
            placement.id
            for placement in package.assembly.placements
            if placement.asset_id == asset_id
        }
        if not removed_placement_ids:
            return package.assembly
        remaining_placements = [
            placement.model_copy(
                update={
                    "requires_placed": [
                        required_id
                        for required_id in placement.requires_placed
                        if required_id not in removed_placement_ids
                    ]
                }
            )
            for placement in package.assembly.placements
            if placement.asset_id != asset_id
        ]
        remaining_groups = [
            group.model_copy(
                update={
                    "placement_ids": [
                        placement_id
                        for placement_id in group.placement_ids
                        if placement_id not in removed_placement_ids
                    ]
                }
            )
            for group in package.assembly.groups
        ]
        remaining_groups = [
            group for group in remaining_groups if len(group.placement_ids) >= 2
        ]
        valid_group_ids = {group.id for group in remaining_groups}
        normalized_placements = [
            placement.model_copy(
                update={
                    "group_id": (
                        placement.group_id
                        if placement.group_id in valid_group_ids
                        else None
                    )
                }
            )
            for placement in remaining_placements
        ]
        return package.assembly.model_copy(
            update={
                "placements": normalized_placements,
                "groups": remaining_groups,
                "layer_order": [
                    placement_id
                    for placement_id in package.assembly.layer_order
                    if placement_id not in removed_placement_ids
                ],
            }
        )
