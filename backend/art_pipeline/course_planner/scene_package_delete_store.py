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
            )
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
            current.model_copy(update={"complete_images": updated_complete_images})
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
            asset.lineage.source_complete_image_id == complete_image_id
            and asset.status == "available"
            for asset in package.chapter_assets
        )
