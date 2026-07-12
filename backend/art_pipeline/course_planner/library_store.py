from __future__ import annotations

from pathlib import Path, PurePosixPath
from uuid import uuid4

from art_pipeline.course_planner.models import (
    CharacterIpProfile,
    LibraryImageAsset,
    SceneStyleReference,
)
from art_pipeline.course_planner.scene_package_errors import (
    LibraryItemInUseError,
    ScenePackageValidationError,
)
from art_pipeline.course_planner.scene_package_media import (
    read_scene_package_png_size,
    sanitize_original_filename,
)
from art_pipeline.course_planner.scene_package_models import ChapterScenePackage
from art_pipeline.course_planner.store_common import validate_slug
from art_pipeline.workspace.store import utc_now


class CoursePlannerLibraryStoreMixin:
    def list_character_ips(self) -> list[CharacterIpProfile]:
        return self._list_library_records(
            self._character_ips_root_path(),
            "record.json",
            CharacterIpProfile,
        )

    def get_character_ip(self, character_ip_id: str) -> CharacterIpProfile:
        return self._read_model(
            self._character_ip_path(character_ip_id),
            CharacterIpProfile,
        )

    def create_character_ip(
        self,
        *,
        display_name: str,
        image_bytes: bytes,
        original_filename: str,
    ) -> CharacterIpProfile:
        self._require_unique_name(self.list_character_ips(), display_name)
        character_id = self._new_library_id("character_ip", self._character_ip_path)
        image = self._new_library_image(
            owner_kind="character_ips",
            owner_id=character_id,
            media_prefix="character_model_sheet",
            image_bytes=image_bytes,
            original_filename=original_filename,
        )
        now = utc_now()
        character = CharacterIpProfile(
            id=character_id,
            display_name=display_name,
            current_model_sheet_id=image.id,
            created_at=now,
        )
        self._write_library_create(character, image, image_bytes, self._character_ip_path(character_id))
        return character

    def update_character_ip(
        self,
        character_ip_id: str,
        *,
        display_name: str | None,
        image_bytes: bytes | None,
        original_filename: str | None,
    ) -> CharacterIpProfile:
        current = self.get_character_ip(character_ip_id)
        resolved_name = current.display_name if display_name is None else display_name
        self._require_unique_name(self.list_character_ips(), resolved_name, exclude_id=current.id)
        return self._update_library_record(
            current=current,
            display_name=resolved_name,
            image_bytes=image_bytes,
            original_filename=original_filename,
            owner_kind="character_ips",
            media_prefix="character_model_sheet",
            pointer_field="current_model_sheet_id",
            record_path=self._character_ip_path(current.id),
        )

    def delete_character_ip(self, character_ip_id: str) -> None:
        current = self.get_character_ip(character_ip_id)
        reference_count = self._count_library_references("character", current.id)
        if reference_count:
            raise LibraryItemInUseError(
                item_kind="character_ip",
                referenced_chapter_count=reference_count,
            )
        # WHY: 删除只移除可管理记录；历史生成快照可能仍引用旧 media id，
        # 因而不可删除该角色目录下的不可变图片与媒体元数据。
        self._character_ip_path(current.id).unlink()

    def read_character_model_sheet(self, character_ip_id: str) -> tuple[Path, LibraryImageAsset]:
        character = self.get_character_ip(character_ip_id)
        asset = self._read_library_asset(
            "character_ips",
            character.id,
            character.current_model_sheet_id,
        )
        return self._library_storage_path(asset.storage_path), asset

    def list_scene_style_references(self) -> list[SceneStyleReference]:
        return self._list_library_records(
            self._scene_styles_root_path(),
            "record.json",
            SceneStyleReference,
        )

    def get_scene_style_reference(self, style_id: str) -> SceneStyleReference:
        return self._read_model(
            self._scene_style_path(style_id),
            SceneStyleReference,
        )

    def create_scene_style_reference(
        self,
        *,
        display_name: str,
        image_bytes: bytes,
        original_filename: str,
    ) -> SceneStyleReference:
        self._require_unique_name(self.list_scene_style_references(), display_name)
        style_id = self._new_library_id("scene_style", self._scene_style_path)
        image = self._new_library_image(
            owner_kind="scene_style_references",
            owner_id=style_id,
            media_prefix="scene_style_image",
            image_bytes=image_bytes,
            original_filename=original_filename,
        )
        style = SceneStyleReference(
            id=style_id,
            display_name=display_name,
            current_image_id=image.id,
            created_at=utc_now(),
        )
        self._write_library_create(style, image, image_bytes, self._scene_style_path(style_id))
        return style

    def update_scene_style_reference(
        self,
        style_id: str,
        *,
        display_name: str | None,
        image_bytes: bytes | None,
        original_filename: str | None,
    ) -> SceneStyleReference:
        current = self.get_scene_style_reference(style_id)
        resolved_name = current.display_name if display_name is None else display_name
        self._require_unique_name(
            self.list_scene_style_references(),
            resolved_name,
            exclude_id=current.id,
        )
        return self._update_library_record(
            current=current,
            display_name=resolved_name,
            image_bytes=image_bytes,
            original_filename=original_filename,
            owner_kind="scene_style_references",
            media_prefix="scene_style_image",
            pointer_field="current_image_id",
            record_path=self._scene_style_path(current.id),
        )

    def delete_scene_style_reference(self, style_id: str) -> None:
        current = self.get_scene_style_reference(style_id)
        reference_count = self._count_library_references("style", current.id)
        if reference_count:
            raise LibraryItemInUseError(
                item_kind="scene_style_reference",
                referenced_chapter_count=reference_count,
            )
        self._scene_style_path(current.id).unlink()

    def read_scene_style_image(self, style_id: str) -> tuple[Path, LibraryImageAsset]:
        style = self.get_scene_style_reference(style_id)
        asset = self._read_library_asset(
            "scene_style_references",
            style.id,
            style.current_image_id,
        )
        return self._library_storage_path(asset.storage_path), asset

    def _require_character_ip(self, character_ip_id: str) -> CharacterIpProfile:
        try:
            return self.get_character_ip(character_ip_id)
        except FileNotFoundError as exc:
            raise ScenePackageValidationError(
                f"Unknown character IP id: {character_ip_id}"
            ) from exc

    def _require_scene_style_reference(self, style_id: str) -> SceneStyleReference:
        try:
            return self.get_scene_style_reference(style_id)
        except FileNotFoundError as exc:
            raise ScenePackageValidationError(
                f"Unknown scene style reference id: {style_id}"
            ) from exc

    def _current_library_assets(self) -> dict[str, LibraryImageAsset]:
        assets: dict[str, LibraryImageAsset] = {}
        for character in self.list_character_ips():
            asset = self._read_library_asset(
                "character_ips", character.id, character.current_model_sheet_id
            )
            assets[asset.id] = asset
        for style in self.list_scene_style_references():
            asset = self._read_library_asset(
                "scene_style_references", style.id, style.current_image_id
            )
            assets[asset.id] = asset
        return assets

    def _write_library_create(self, record, asset, image_bytes: bytes, record_path: Path) -> None:
        asset_path = self._library_storage_path(asset.storage_path)
        asset_model_path = asset_path.with_suffix(".json")
        try:
            self._write_bytes(asset_path, image_bytes)
            self._write_model(asset_model_path, asset)
            self._write_model(record_path, record)
        except Exception:
            # WHY: 对用户而言名称与图片是一次创建；任何一步失败都清掉本次新媒体，
            # 防止无法从资料库访问的孤立文件长期堆积。
            asset_path.unlink(missing_ok=True)
            asset_model_path.unlink(missing_ok=True)
            record_path.unlink(missing_ok=True)
            raise

    def _update_library_record(
        self,
        *,
        current,
        display_name: str,
        image_bytes: bytes | None,
        original_filename: str | None,
        owner_kind: str,
        media_prefix: str,
        pointer_field: str,
        record_path: Path,
    ):
        if image_bytes is None:
            updated = current.model_copy(
                update={"display_name": display_name, "updated_at": utc_now()}
            )
            validated = type(current).model_validate(updated.model_dump(mode="json"))
            self._write_model(record_path, validated)
            return validated
        asset = self._new_library_image(
            owner_kind=owner_kind,
            owner_id=current.id,
            media_prefix=media_prefix,
            image_bytes=image_bytes,
            original_filename=original_filename or "upload.png",
        )
        asset_path = self._library_storage_path(asset.storage_path)
        asset_model_path = asset_path.with_suffix(".json")
        updated = current.model_copy(
            update={
                "display_name": display_name,
                pointer_field: asset.id,
                "updated_at": utc_now(),
            }
        )
        validated = type(current).model_validate(updated.model_dump(mode="json"))
        try:
            self._write_bytes(asset_path, image_bytes)
            self._write_model(asset_model_path, asset)
            self._write_model(record_path, validated)
        except Exception:
            asset_path.unlink(missing_ok=True)
            asset_model_path.unlink(missing_ok=True)
            raise
        return validated

    def _new_library_image(
        self,
        *,
        owner_kind: str,
        owner_id: str,
        media_prefix: str,
        image_bytes: bytes,
        original_filename: str,
    ) -> LibraryImageAsset:
        width, height = read_scene_package_png_size(image_bytes, "Library image")
        media_id = f"{media_prefix}_{uuid4().hex[:12]}"
        storage_path = PurePosixPath(
            "global_reference_library", owner_kind, owner_id, "media", f"{media_id}.png"
        ).as_posix()
        return LibraryImageAsset(
            id=media_id,
            original_filename=sanitize_original_filename(original_filename),
            storage_path=storage_path,
            media_type="image/png",
            width=width,
            height=height,
            created_at=utc_now(),
        )

    def _read_library_asset(self, owner_kind: str, owner_id: str, media_id: str) -> LibraryImageAsset:
        validate_slug(media_id, "Library media id")
        return self._read_model(
            self._resolve(
                "global_reference_library", owner_kind, owner_id, "media", f"{media_id}.json"
            ),
            LibraryImageAsset,
        )

    def _count_library_references(self, item_kind: str, item_id: str) -> int:
        count = 0
        for pack in self.list_scene_packs():
            for chapter_id in pack.chapter_ids:
                path = self._scene_package_json_path(pack.id, chapter_id)
                if not path.exists():
                    continue
                package = self._read_model(path, ChapterScenePackage)
                referenced = (
                    any(item.character_ip_id == item_id for item in package.cast_assignments)
                    if item_kind == "character"
                    else package.scene_style_reference_id == item_id
                )
                count += int(referenced)
        return count

    @staticmethod
    def _require_unique_name(records, display_name: str, exclude_id: str | None = None) -> None:
        normalized = display_name.strip().casefold()
        if not normalized:
            raise ScenePackageValidationError("displayName is required.")
        if any(record.id != exclude_id and record.display_name.casefold() == normalized for record in records):
            raise ScenePackageValidationError(f"Duplicate library displayName: {display_name.strip()}")

    @staticmethod
    def _list_library_records(root: Path, filename: str, model_type):
        if not root.exists():
            return []
        return [model_type.model_validate_json(path.read_text("utf-8")) for path in sorted(root.glob(f"*/{filename}"))]

    def _character_ips_root_path(self) -> Path:
        return self._resolve("global_reference_library", "character_ips")

    def _character_ip_path(self, character_ip_id: str) -> Path:
        return self._character_ips_root_path() / validate_slug(character_ip_id, "Character IP id") / "record.json"

    def _scene_styles_root_path(self) -> Path:
        return self._resolve("global_reference_library", "scene_style_references")

    def _scene_style_path(self, style_id: str) -> Path:
        return self._scene_styles_root_path() / validate_slug(style_id, "Scene Style Reference id") / "record.json"

    def _library_storage_path(self, storage_path: str) -> Path:
        return self._resolve(*PurePosixPath(storage_path).parts)

    @staticmethod
    def _new_library_id(prefix: str, path_factory) -> str:
        while True:
            item_id = f"{prefix}_{uuid4().hex[:12]}"
            if not path_factory(item_id).exists():
                return item_id
