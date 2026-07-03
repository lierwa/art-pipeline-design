from __future__ import annotations

import json
from pathlib import Path

import pytest

import art_pipeline.course_planner.import_to_pipeline as import_module
from art_pipeline.workspace.store import read_runs, read_state
from art_pipeline.workspace.workflow import read_workflow
from scene_package_store_helpers import (
    make_manifest,
    make_png_bytes,
    make_store_with_chapter_asset,
)


def test_import_final_chapter_scene_creates_workspace_run_with_scene_package_context(
    tmp_path: Path,
) -> None:
    workspace_root = tmp_path / "workspace"
    store, chapter, locked_package = _make_locked_final_scene(tmp_path)
    final_scene = locked_package.final_scene
    assert final_scene is not None

    result = import_module.import_final_chapter_scene_to_pipeline(
        planner_store=store,
        workspace_root=workspace_root,
        chapter_id=chapter.id,
    )

    run_root = workspace_root / "runs" / result.run.id
    final_scene_path, media_type = store.read_chapter_scene_package_media(
        chapter.id,
        "final_scene",
        final_scene.id,
    )

    assert media_type == "image/png"
    assert (run_root / "source" / "original.png").read_bytes() == final_scene_path.read_bytes()

    state = read_state(run_root)
    assert state.source is not None
    assert state.source.filename == "original.png"
    assert state.source.path == "source/original.png"
    assert state.source.width == 120
    assert state.source.height == 80
    assert state.elements == []
    assert state.detectionVocabulary == ["book"]

    workflow = read_workflow(run_root, state)
    assert workflow.stage == "upload"

    scene_context = json.loads((run_root / "scene_context.json").read_text(encoding="utf-8"))
    assert scene_context == {
        "source": "course_planner",
        "chapter_id": chapter.id,
        "final_scene_id": final_scene.id,
        "final_scene_storage_path": final_scene.storage_path,
        "selected_empty_scene_image_id": final_scene.empty_scene_image_id,
        "target_object_labels": ["book"],
    }
    assert read_runs(workspace_root) == [result.run]
    assert result.run.sourceFilename == f"{chapter.id}_{final_scene.id}.png"
    assert result.run.title == f"{chapter.id} {final_scene.id}"
    assert result.run.status == "uploaded"
    assert result.run.elementCount == 0


def test_import_final_chapter_scene_failure_removes_partial_workspace_run_and_keeps_final_scene(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    store, chapter, locked_package = _make_locked_final_scene(tmp_path)
    workspace_root = tmp_path / "workspace"
    final_scene = locked_package.final_scene
    assert final_scene is not None

    def failing_context_write(path: Path, payload: object) -> None:
        raise RuntimeError("context write failed")

    monkeypatch.setattr(import_module, "_write_json", failing_context_write)

    with pytest.raises(RuntimeError, match="context write failed"):
        import_module.import_final_chapter_scene_to_pipeline(
            planner_store=store,
            workspace_root=workspace_root,
            chapter_id=chapter.id,
        )

    assert read_runs(workspace_root) == []
    assert not (workspace_root / "runs").exists() or not any(
        (workspace_root / "runs").iterdir()
    )
    assert store.read_chapter_scene_package(chapter.id).final_scene == final_scene


def test_import_final_chapter_scene_requires_locked_final_scene(tmp_path: Path) -> None:
    workspace_root = tmp_path / "workspace"
    store, chapter, _ = make_store_with_chapter_asset(tmp_path)

    with pytest.raises(
        ValueError,
        match="Final chapter scene must be locked before importing to pipeline.",
    ):
        import_module.import_final_chapter_scene_to_pipeline(
            planner_store=store,
            workspace_root=workspace_root,
            chapter_id=chapter.id,
        )


def _make_locked_final_scene(tmp_path: Path):
    store, chapter, asset = make_store_with_chapter_asset(tmp_path)
    package = store.read_chapter_scene_package(chapter.id)
    store.save_chapter_scene_assembly(
        chapter.id,
        make_manifest(
            asset_id=asset.id,
            empty_scene_image_id=package.current_empty_scene_image_id or "empty_scene_001",
            empty_scene_size=package.assembly.empty_scene_size,
        ),
    )
    return (
        store,
        chapter,
        store.lock_final_chapter_scene(
            chapter.id,
            image_bytes=make_png_bytes(width=120, height=80),
            original_filename="final.png",
        ),
    )
