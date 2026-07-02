from __future__ import annotations

from art_pipeline.course_planner.scene_package_errors import (
    ScenePackageChildNotFoundError,
    ScenePackagePreconditionError,
)
from art_pipeline.course_planner.scene_package_models import ChapterScenePackage


class CoursePlannerScenePackageDeleteStoreMixin:
    def delete_chapter_scene_reference(
        self,
        chapter_id: str,
        reference_id: str,
    ) -> ChapterScenePackage:
        current, scene_pack_id = self._load_scene_package_for_write(chapter_id)
        reference = next(
            (item for item in current.references if item.id == reference_id),
            None,
        )
        if reference is None:
            raise ScenePackageChildNotFoundError(reference_id)
        if self._is_scene_reference_in_use(current, reference_id):
            raise ScenePackagePreconditionError(
                f"Scene reference {reference_id} is still used by derived records."
            )
        self._delete_scene_package_media_file(
            scene_pack_id,
            current.chapter_id,
            reference.storage_path,
        )
        return self.write_chapter_scene_package(
            current.model_copy(
                update={
                    "references": [
                        item for item in current.references if item.id != reference_id
                    ]
                }
            )
        )

    def delete_empty_base_scene_candidate(
        self,
        chapter_id: str,
        candidate_id: str,
    ) -> ChapterScenePackage:
        current, scene_pack_id = self._load_scene_package_for_write(chapter_id)
        candidate = next(
            (item for item in current.base_candidates if item.id == candidate_id),
            None,
        )
        if candidate is None:
            raise ScenePackageChildNotFoundError(candidate_id)
        if self._is_base_candidate_in_use(current, candidate_id):
            raise ScenePackagePreconditionError(
                f"Base candidate {candidate_id} is still in use."
            )
        self._delete_scene_package_media_file(
            scene_pack_id,
            current.chapter_id,
            candidate.storage_path,
        )
        return self.write_chapter_scene_package(
            current.model_copy(
                update={
                    "base_candidates": [
                        item for item in current.base_candidates if item.id != candidate_id
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

    def _is_scene_reference_in_use(
        self,
        package: ChapterScenePackage,
        reference_id: str,
    ) -> bool:
        if any(
            reference_id in candidate.reference_snapshot.reference_ids
            for candidate in package.base_candidates
        ):
            return True
        return any(
            reference_id in complete.reference_snapshot.reference_ids
            for complete in package.complete_images
            if complete.status != "deleted"
        )

    def _is_base_candidate_in_use(
        self,
        package: ChapterScenePackage,
        candidate_id: str,
    ) -> bool:
        if package.locked_base_candidate_id == candidate_id:
            return True
        if package.assembly.base_candidate_id == candidate_id:
            return True
        return any(
            complete.base_candidate_id == candidate_id
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
