from __future__ import annotations

import json
from io import BytesIO
from pathlib import Path

import pytest
from PIL import Image

import art_pipeline.course_planner.import_to_pipeline as import_module
from art_pipeline.course_planner.import_to_pipeline import (
    import_locked_scene_version_to_pipeline,
)
from art_pipeline.course_planner.models import (
    CourseProject,
    SceneKeywords,
    Space,
)
from art_pipeline.course_planner.store import CoursePlannerStore
from art_pipeline.workspace.store import read_runs, read_state
from art_pipeline.workspace.workflow import read_workflow


def test_scene_version_index_increments(tmp_path: Path) -> None:
    planner_store = CoursePlannerStore(tmp_path / "scene_library")

    first = planner_store.create_scene_version(
        "course_001",
        "space_001",
        "chapter_001",
        _png_bytes(color=(255, 0, 0)),
    )
    second = planner_store.create_scene_version(
        "course_001",
        "space_001",
        "chapter_001",
        _png_bytes(color=(0, 255, 0)),
    )

    assert first.id == "version_001"
    assert first.index == 1
    assert first.image_path == "versions/v001/image.png"
    assert second.id == "version_002"
    assert second.index == 2
    assert second.image_path == "versions/v002/image.png"

    chapter_root = _chapter_root(planner_store, "course_001", "space_001", "chapter_001")
    assert (chapter_root / "versions" / "v001" / "image.png").exists()
    assert (chapter_root / "versions" / "v001" / "scene_version.json").exists()
    assert (chapter_root / "versions" / "v002" / "image.png").exists()
    assert planner_store.read_scene_versions("course_001", "space_001", "chapter_001") == [
        first,
        second,
    ]


def test_create_scene_version_rejects_invalid_png_without_consuming_index(
    tmp_path: Path,
) -> None:
    planner_store = CoursePlannerStore(tmp_path / "scene_library")

    with pytest.raises(ValueError, match="valid PNG"):
        planner_store.create_scene_version(
            "course_001",
            "space_001",
            "chapter_001",
            b"not a png",
        )

    chapter_root = _chapter_root(planner_store, "course_001", "space_001", "chapter_001")
    assert not (chapter_root / "versions" / "v001" / "image.png").exists()
    assert not (chapter_root / "versions" / "v001" / "scene_version.json").exists()

    version = planner_store.create_scene_version(
        "course_001",
        "space_001",
        "chapter_001",
        _png_bytes(),
    )
    assert version.id == "version_001"
    assert version.index == 1


def test_lock_scene_version_is_unique_per_chapter(tmp_path: Path) -> None:
    planner_store = CoursePlannerStore(tmp_path / "scene_library")
    first = planner_store.create_scene_version(
        "course_001",
        "space_001",
        "chapter_001",
        _png_bytes(color=(255, 0, 0)),
    )
    second = planner_store.create_scene_version(
        "course_001",
        "space_001",
        "chapter_001",
        _png_bytes(color=(0, 255, 0)),
    )

    locked_first = planner_store.lock_scene_version(
        "course_001",
        "space_001",
        "chapter_001",
        first.id,
    )
    locked_second = planner_store.lock_scene_version(
        "course_001",
        "space_001",
        "chapter_001",
        second.id,
    )

    assert locked_first.status == "locked"
    assert locked_second.status == "locked"
    versions = planner_store.read_scene_versions("course_001", "space_001", "chapter_001")
    assert [version.status for version in versions] == ["uploaded", "locked"]


def test_lock_scene_version_write_failure_preserves_previous_lock(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    planner_store = CoursePlannerStore(tmp_path / "scene_library")
    first = planner_store.create_scene_version(
        "course_001",
        "space_001",
        "chapter_001",
        _png_bytes(color=(255, 0, 0)),
    )
    second = planner_store.create_scene_version(
        "course_001",
        "space_001",
        "chapter_001",
        _png_bytes(color=(0, 255, 0)),
    )
    planner_store.lock_scene_version("course_001", "space_001", "chapter_001", first.id)
    original_write_json = planner_store._write_json

    def failing_lock_write(path: Path, payload: object) -> None:
        if path.name == "version_lock.json":
            raise RuntimeError("lock write failed")
        original_write_json(path, payload)

    monkeypatch.setattr(planner_store, "_write_json", failing_lock_write)

    with pytest.raises(RuntimeError, match="lock write failed"):
        planner_store.lock_scene_version("course_001", "space_001", "chapter_001", second.id)

    versions = planner_store.read_scene_versions("course_001", "space_001", "chapter_001")
    assert [(version.id, version.status) for version in versions] == [
        (first.id, "locked"),
        (second.id, "uploaded"),
    ]


def test_import_locked_scene_version_creates_workspace_run_with_keywords(
    tmp_path: Path,
) -> None:
    scene_library = tmp_path / "scene_library"
    workspace_root = tmp_path / "workspace"
    planner_store = CoursePlannerStore(scene_library)
    _write_course_context(planner_store)
    planner_store.write_scene_keywords(
        "course_001",
        "space_001",
        "chapter_001",
        SceneKeywords(chapter_id="chapter_001", keywords=["cat", "bathtub", "window"]),
    )
    version = planner_store.create_scene_version(
        "course_001",
        "space_001",
        "chapter_001",
        _png_bytes(size=(13, 7), color=(10, 20, 30)),
    )
    planner_store.lock_scene_version("course_001", "space_001", "chapter_001", version.id)

    result = import_locked_scene_version_to_pipeline(
        planner_store=planner_store,
        workspace_root=workspace_root,
        course_id="course_001",
        space_id="space_001",
        chapter_id="chapter_001",
        version_id=version.id,
    )

    run_root = workspace_root / "runs" / result.run.id
    assert (run_root / "source" / "original.png").read_bytes() == (
        scene_library
        / "courses"
        / "course_001"
        / "spaces"
        / "space_001"
        / "chapters"
        / "chapter_001"
        / "versions"
        / "v001"
        / "image.png"
    ).read_bytes()

    state = read_state(run_root)
    assert state.source is not None
    assert state.source.filename == "original.png"
    assert state.source.path == "source/original.png"
    assert state.source.width == 13
    assert state.source.height == 7
    assert state.elements == []
    assert state.detectionVocabulary == ["cat", "bathtub", "window"]

    workflow = read_workflow(run_root, state)
    assert workflow.stage == "upload"
    assert (run_root / "workflow.json").exists()

    scene_context = json.loads((run_root / "scene_context.json").read_text(encoding="utf-8"))
    assert scene_context == {
        "source": "course_planner",
        "course_id": "course_001",
        "space_id": "space_001",
        "chapter_id": "chapter_001",
        "scene_version_id": "version_001",
        "scene_version_path": (
            "courses/course_001/spaces/space_001/chapters/chapter_001/"
            "versions/v001/scene_version.json"
        ),
        "image_path": (
            "courses/course_001/spaces/space_001/chapters/chapter_001/"
            "versions/v001/image.png"
        ),
        "keywords": ["cat", "bathtub", "window"],
    }
    assert read_runs(workspace_root)[0] == result.run
    assert result.run.status == "uploaded"
    assert result.run.elementCount == 0


def test_import_failure_removes_partial_workspace_run_and_keeps_lock(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    planner_store = CoursePlannerStore(tmp_path / "scene_library")
    workspace_root = tmp_path / "workspace"
    _write_course_context(planner_store)
    planner_store.write_scene_keywords(
        "course_001",
        "space_001",
        "chapter_001",
        SceneKeywords(chapter_id="chapter_001", keywords=["cat"]),
    )
    version = planner_store.create_scene_version(
        "course_001",
        "space_001",
        "chapter_001",
        _png_bytes(),
    )
    planner_store.lock_scene_version("course_001", "space_001", "chapter_001", version.id)

    def failing_context_write(path: Path, payload: object) -> None:
        raise RuntimeError("context write failed")

    monkeypatch.setattr(import_module, "_write_json", failing_context_write)

    with pytest.raises(RuntimeError, match="context write failed"):
        import_locked_scene_version_to_pipeline(
            planner_store=planner_store,
            workspace_root=workspace_root,
            course_id="course_001",
            space_id="space_001",
            chapter_id="chapter_001",
            version_id=version.id,
        )

    runs_root = workspace_root / "runs"
    if runs_root.exists():
        assert not any(runs_root.iterdir())
    assert planner_store.read_scene_version(
        "course_001",
        "space_001",
        "chapter_001",
        version.id,
    ).status == "locked"


def test_import_rejects_unlocked_version(tmp_path: Path) -> None:
    planner_store = CoursePlannerStore(tmp_path / "scene_library")
    workspace_root = tmp_path / "workspace"
    _write_course_context(planner_store)
    planner_store.write_scene_keywords(
        "course_001",
        "space_001",
        "chapter_001",
        SceneKeywords(chapter_id="chapter_001", keywords=["cat"]),
    )
    version = planner_store.create_scene_version(
        "course_001",
        "space_001",
        "chapter_001",
        _png_bytes(),
    )

    with pytest.raises(ValueError, match="locked"):
        import_locked_scene_version_to_pipeline(
            planner_store=planner_store,
            workspace_root=workspace_root,
            course_id="course_001",
            space_id="space_001",
            chapter_id="chapter_001",
            version_id=version.id,
        )

    assert planner_store.read_scene_version(
        "course_001",
        "space_001",
        "chapter_001",
        version.id,
    ).status == "uploaded"
    assert not (workspace_root / "runs").exists()


def _write_course_context(planner_store: CoursePlannerStore) -> None:
    course = CourseProject(id="course_001", title_zh="猫咪浴室冒险")
    space = Space(
        id="space_001",
        course_id=course.id,
        title_zh="浴室",
        target_language="en",
        storyline_mode="linear",
        space_type="bathroom",
        notes="",
        order=1,
    )
    planner_store.write_course(course)
    planner_store.write_space(course.id, space)


def _png_bytes(
    *,
    size: tuple[int, int] = (2, 2),
    color: tuple[int, int, int] = (255, 0, 0),
) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", size, color=color).save(buffer, format="PNG")
    return buffer.getvalue()


def _chapter_root(
    planner_store: CoursePlannerStore,
    course_id: str,
    space_id: str,
    chapter_id: str,
) -> Path:
    return (
        planner_store.scene_library_root
        / "courses"
        / course_id
        / "spaces"
        / space_id
        / "chapters"
        / chapter_id
    )
