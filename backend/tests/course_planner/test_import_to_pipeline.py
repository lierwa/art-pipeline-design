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
    ChapterSeed,
    CharacterConceptHint,
    CourseProject,
    ObjectPlan,
    PlannedObject,
    PromptPackage,
    PromptVersion,
    SceneKeywords,
    SceneDirectorPlan,
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


def test_import_image_attempt_preserves_hierarchy_lineage_and_prompt_package(
    tmp_path: Path,
) -> None:
    scene_library = tmp_path / "scene_library"
    workspace_root = tmp_path / "workspace"
    planner_store = CoursePlannerStore(scene_library)
    pack, chapter, version, attempt = _write_attempt_hierarchy(planner_store)
    source_image_path = scene_library / attempt.uploaded_image_id
    source_image_path.parent.mkdir(parents=True)
    source_image_path.write_bytes(_png_bytes(size=(17, 11), color=(40, 80, 120)))

    result = import_module.import_image_attempt_to_pipeline(
        planner_store=planner_store,
        workspace_root=workspace_root,
        image_attempt_id=attempt.id,
    )

    run_root = workspace_root / "runs" / result.run.id
    state = read_state(run_root)
    assert state.source is not None
    assert state.source.width == 17
    assert state.source.height == 11
    assert (run_root / "source" / "original.png").read_bytes() == source_image_path.read_bytes()

    scene_context = json.loads((run_root / "scene_context.json").read_text(encoding="utf-8"))
    assert scene_context["source_type"] == "course_planner_image_attempt"
    assert scene_context["scene_pack_id"] == pack.id
    assert scene_context["chapter_id"] == chapter.id
    assert scene_context["prompt_version_id"] == version.id
    assert scene_context["image_attempt_id"] == attempt.id
    assert scene_context["uploaded_image_id"] == attempt.uploaded_image_id
    assert scene_context["prompt_package"] == version.prompt_package.model_dump(mode="json")
    assert read_runs(workspace_root)[0] == result.run
    assert planner_store.get_image_attempt(attempt.id).status == "uploaded"


def test_import_image_attempt_rejects_unrecoverable_lineage(
    tmp_path: Path,
) -> None:
    scene_library = tmp_path / "scene_library"
    workspace_root = tmp_path / "workspace"
    planner_store = CoursePlannerStore(scene_library)
    pack, _, _, attempt = _write_attempt_hierarchy(planner_store)
    planner_store._write_model(
        planner_store._scene_pack_path(pack.id),
        pack.model_copy(update={"chapter_ids": []}),
    )

    with pytest.raises(ValueError, match="recoverable lineage"):
        import_module.import_image_attempt_to_pipeline(
            planner_store=planner_store,
            workspace_root=workspace_root,
            image_attempt_id=attempt.id,
        )

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


def _write_attempt_hierarchy(
    planner_store: CoursePlannerStore,
) -> tuple[object, object, object, object]:
    pack = planner_store.create_scene_pack(
        title="室内家庭篇",
        intent="家庭日常空间",
        status="active",
    )
    chapter = planner_store.create_chapter_from_seed(
        pack.id,
        _chapter_seed(scene_pack_id=pack.id, scene_pack_title=pack.title),
    )
    version = planner_store.create_prompt_version(chapter.id, _prompt_version_payload())
    attempt = planner_store.create_image_attempt(version.id, "uploads/generated.png")
    return pack, chapter, version, attempt


def _chapter_seed(
    *,
    scene_pack_id: str,
    scene_pack_title: str,
) -> ChapterSeed:
    return ChapterSeed(
        scene_pack_id=scene_pack_id,
        scene_pack_title=scene_pack_title,
        chapter_id="chapter_candidate_from_ai",
        chapter_title="厨房早餐打翻",
        chapter_intent="厨房早餐中的日常家庭场景。",
        scene_domain="home_kitchen",
        daily_moment="breakfast",
        event_seed="孩子不小心打翻牛奶，家长拿纸巾处理。",
        spatial_seed="厨房台面、餐桌、水槽、冰箱和地面活动区。",
        object_coverage_hint=["milk", "cup", "plate", "tissue"],
        character_concept_hint=CharacterConceptHint(
            main_cast_hint="温和的家庭主角",
            supporting_cast_hint="帮忙整理的家人",
            reference_asset_ids=["asset_main_cast"],
            constraints=["保持儿童绘本风格"],
        ),
        style_notes="温暖、明亮、低冲突。",
    )


def _prompt_version_payload() -> PromptVersion:
    return PromptVersion(
        id="version_from_user_should_be_ignored",
        chapter_id="chapter_from_user_should_be_ignored",
        version_label="V999",
        title="温馨厨房早餐版",
        scene_director_plan=SceneDirectorPlan(
            story_event="孩子不小心打翻牛奶。",
            scene_composition="餐桌居中，角色围绕桌边形成清晰动作线。",
            spatial_structure="前景餐桌，中景水槽，背景冰箱。",
            character_arrangement="主角在桌边，家人在旁边递纸巾。",
            action_design="牛奶流向桌沿，纸巾正被递出。",
            style_and_constraints="明亮绘本质感，避免混乱构图。",
        ),
        object_plan=ObjectPlan(
            core_objects=[
                PlannedObject(
                    name="milk",
                    role_in_scene="触发故事事件",
                    placement_hint="餐桌中央倒下的杯子旁",
                    priority="core",
                )
            ],
        ),
        prompt_package=PromptPackage(
            full_prompt="Warm kitchen breakfast scene with spilled milk.",
            short_prompt="Kitchen breakfast spill.",
            negative_constraints="No clutter, no scary mood.",
        ),
    )


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
