# Chapter Scene Studio Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old PromptVersion/ImageAttempt Course Planner workspace with a clean Chapter Scene Studio that uses Character IP selections, Reference Library selections, Empty Scene Images, Complete Scene Images, Scene Assets, Assembly, and Lock Final.

**Architecture:** Make Chapter Scene Package the single chapter-owned authoring resource. Shared Character IP and Reference Library records own reusable visual identity facts; the chapter package stores only selections, upload snapshots, assembly state, and the published Final Chapter Scene snapshot. Remove the locked base model instead of wrapping it: an Empty Scene Image is selected as assembly background, and Lock Final publishes the composed chapter asset.

**Tech Stack:** FastAPI, Pydantic, existing CoursePlannerStore JSON/media helpers, React 18, React Router, Vitest, Pytest, existing PNG validation helpers, existing confirmation UI pattern, `react-arborist` for hierarchy, and current canvas/editor primitives before introducing any new editor dependency.

## Global Constraints

- No user-visible PromptVersion, ImageAttempt, Tune Prompt drawer, Prompt Package modal, or attempt review route remains in the Course Planner workflow.
- Runtime code and tests must not expose `locked_base_candidate_id`, `base_candidate_id`, `base_candidates`, `base-candidates`, `lockEmptyBaseScene`, `lock_empty_base_scene`, or `EmptyBaseSceneCandidate`.
- Empty Scene Image is a selected assembly background, not the final locked chapter asset.
- Lock Final publishes the current assembly as the Final Chapter Scene and must receive or create a final composed PNG asset.
- Character identity comes only from Character IP Library; chapter UI cannot ask authors to type character identity as free text.
- Reference images come only from Reference Library; chapter UI stores selections, not hand-entered image ids or chapter-private reference facts.
- Must Keep and Avoid facts live only in chapter target/avoid/spatial fields; generation notes are per-attempt nudges and cannot become a second authority.
- Existing media helpers must be reused for PNG validation, size reads, filename sanitizing, and storage path validation.
- Tests stay under `backend/tests/course_planner/` and `frontend/tests/coursePlanner/`; no test files are added under runtime source directories.
- Do not scan `node_modules`.
- Run final gates: `uv run --python 3.12 --extra dev pytest tests/course_planner -q`, `npm --prefix frontend test -- --run course-planner`, `npm --prefix frontend run build`, `npm run test:scripts`, and `git diff --check`.

---

## File Map

**Backend model and store files**

- Modify `backend/art_pipeline/course_planner/scene_package_models.py`
  - Replace old base candidate fields with Empty Scene Image, prompt readiness facts, direct upload lineage, and Final Chapter Scene models.
- Modify `backend/art_pipeline/course_planner/scene_package_media_store.py`
  - Rename upload methods and storage slots from base candidate to empty scene image.
  - Allow complete image upload without selected Empty Scene Image.
  - Add direct Scene Asset upload.
  - Add final composed image storage for Lock Final.
- Modify `backend/art_pipeline/course_planner/scene_package_store.py`
  - Replace `lock_empty_base_scene` with `select_empty_scene_image`.
  - Add `lock_final_chapter_scene`.
  - Keep assembly validation concentrated here and in model validators.
- Modify `backend/art_pipeline/course_planner/scene_package_routes.py`
  - Replace `/base-candidates` and `/lock` endpoints with `/empty-scene-images` and `/current-empty-scene`.
  - Add direct asset upload and final lock endpoints.
- Modify `backend/art_pipeline/course_planner/api_models.py`
  - Remove PromptVersion/ImageAttempt request models.
  - Add prompt facts, library selection, direct asset, and final lock request models.
- Modify `backend/art_pipeline/course_planner/models.py`
  - Remove `PromptVersion`, `ImageAttempt`, and AI-only prompt package structures that no remaining runtime code uses.
  - Add `CharacterIpProfile` and `ReferenceLibraryImage` if they are not kept in a separate library model file.
- Modify `backend/art_pipeline/course_planner/store_hierarchy.py`
  - Remove PromptVersion/ImageAttempt persistence methods.
  - Add Character IP Library and Reference Library persistence methods if they are kept inside CoursePlannerStore.
- Modify `backend/art_pipeline/course_planner/routes.py`
  - Remove prompt-version/image-attempt routes and state payload fields.
  - Add library routes only if they are not placed in a new focused route file.
- Create `backend/art_pipeline/course_planner/library_routes.py`
  - Preferred route file for Character IP Library and Reference Library endpoints.

**Frontend files**

- Modify `frontend/src/features/coursePlanner/types.ts`
  - Remove PromptVersion/ImageAttempt types and state fields.
  - Add Character IP, Reference Library, Chapter Scene Package, Empty Scene Image, Scene Asset, and Final Chapter Scene contracts.
- Modify `frontend/src/features/coursePlanner/api.ts`
  - Remove prompt-version/image-attempt functions and state normalizers.
  - Add library fetch/upload/select functions if not placed in `scenePackageApi.ts`.
- Modify `frontend/src/features/coursePlanner/scenePackageApi.ts`
  - Replace base candidate functions with Empty Scene Image functions.
  - Add direct asset upload and Lock Final functions.
- Modify `frontend/src/features/coursePlanner/hooks/useCoursePlannerState.ts`
  - Remove PromptVersion/ImageAttempt state and handlers.
  - Keep Scene Category, Chapter, async status, and task handling.
- Modify `frontend/src/features/coursePlanner/domain/chapterStatus.ts`
  - Derive progress from Chapter Scene Package readiness instead of prompt versions.
- Replace `frontend/src/features/coursePlanner/pages/ChapterWorkspacePage.tsx`
  - Keep the route if useful, but replace the implementation with Chapter Scene Studio.
- Create `frontend/src/features/coursePlanner/components/ChapterSceneStudio.tsx`
- Create `frontend/src/features/coursePlanner/components/PromptFactsPanel.tsx`
- Create `frontend/src/features/coursePlanner/components/LibrarySelectionPanel.tsx`
- Create `frontend/src/features/coursePlanner/components/EmptySceneImagesPanel.tsx`
- Create `frontend/src/features/coursePlanner/components/CompleteSceneImagesPanel.tsx`
- Create `frontend/src/features/coursePlanner/components/ChapterAssetPoolPanel.tsx`
- Create `frontend/src/features/coursePlanner/components/AssemblyWorkspacePanel.tsx`
- Create `frontend/src/features/coursePlanner/components/FinalScenePanel.tsx`
- Delete PromptVersion/ImageAttempt-only components after their imports are gone:
  - `frontend/src/features/coursePlanner/components/PromptVersionList.tsx`
  - `frontend/src/features/coursePlanner/components/PromptVersionPreview.tsx`
  - `frontend/src/features/coursePlanner/components/PromptVersionDraftEditor.tsx`
  - `frontend/src/features/coursePlanner/components/PromptVersionEditDrawer.tsx`
  - `frontend/src/features/coursePlanner/components/promptVersionDraft.ts`
  - `frontend/src/features/coursePlanner/components/PromptPackagePanel.tsx`
  - `frontend/src/features/coursePlanner/components/PromptPackageModal.tsx`
  - `frontend/src/features/coursePlanner/components/ImageAttemptsPanel.tsx`
  - `frontend/src/features/coursePlanner/pages/ImageAttemptReviewPage.tsx`
  - `frontend/src/features/coursePlanner/domain/promptVersionLabels.ts`
  - `frontend/src/features/coursePlanner/domain/promptVersionUiState.ts`

**Tests**

- Modify `backend/tests/course_planner/test_scene_package_models.py`
- Modify `backend/tests/course_planner/test_scene_package_store_media.py`
- Modify `backend/tests/course_planner/test_scene_package_store_lifecycle.py`
- Modify `backend/tests/course_planner/test_scene_package_routes_complete_assets.py`
- Modify `backend/tests/course_planner/test_scene_package_routes_assembly_media_delete.py`
- Modify `backend/tests/course_planner/test_scene_package_routes_prompt.py`
- Modify `backend/tests/course_planner/scene_package_route_test_helpers.py`
- Modify `frontend/tests/coursePlanner/course-planner-scene-package-api.test.ts`
- Replace `frontend/tests/coursePlanner/chapter-workspace.test.tsx`
- Replace `frontend/tests/coursePlanner/course-planner-routing.test.tsx`
- Delete `frontend/tests/coursePlanner/image-attempt-review.test.tsx`
- Modify `frontend/tests/coursePlanner/coursePlannerApiTestHelpers.ts`

---

## Patch Hygiene Inventory

| Old artifact | Action | Reason |
| --- | --- | --- |
| `PromptVersion` / `ImageAttempt` models | Delete from active Course Planner runtime code | The new workflow stores prompt snapshots on uploaded images and final snapshots, not version records. |
| `PromptVersionList`, prompt drawers, prompt package modal | Delete | They expose the wrong authoring model and duplicate prompt facts. |
| Image attempt review page and routes | Delete | Complete Scene Images and pipeline runs replace attempt review. |
| `/base-candidates/{id}/lock` | Delete | The chapter locks the final composed scene, not the background image. |
| `locked_base_candidate_id` | Replace with `current_empty_scene_image_id` where a selected background is required | The selected background is a coordinate reference, not a locked final asset. |
| `base_candidate_id` in assembly | Replace with `empty_scene_image_id` | Assembly coordinates belong to the selected Empty Scene Image. |
| Complete image requiring locked base | Remove | Complete Scene Images are source material and can be uploaded before selecting an Empty Scene Image. |
| Chapter-local reference uploads | Replace with Reference Library upload plus Chapter Reference Selection | Reusable visual facts need one library authority. |
| Required run lineage for Chapter Assets | Replace with discriminated lineage | Direct Scene Asset Upload is a first-class source. |

---

### Task 1: Backend Domain Models

**Files:**
- Modify: `backend/art_pipeline/course_planner/scene_package_models.py`
- Modify: `backend/art_pipeline/course_planner/models.py`
- Test: `backend/tests/course_planner/test_scene_package_models.py`
- Test: `backend/tests/course_planner/test_models.py`

**Interfaces:**
- Produces: `CharacterIpProfile`, `ReferenceLibraryImage`, `ChapterCastAssignment`, `ChapterReferenceSelection`, `EmptySceneImage`, `CompleteSceneImage`, `ChapterAssetLineage`, `FinalChapterScene`, `ChapterScenePackage`, `is_prompt_ready(package)`, `build_empty_scene_prompt(package, libraries)`, `build_complete_prompt(package, libraries)`, `validate_assembly_manifest(package)`.
- Consumes: existing `CoursePlannerModel`, existing `Field`, existing PNG media metadata fields.

- [ ] **Step 1: Write failing model tests for the clean chapter package contract**

Replace old base/lock expectations in `backend/tests/course_planner/test_scene_package_models.py` with:

```python
def test_scene_package_defaults_to_clean_studio_state() -> None:
    package = ChapterScenePackage(chapter_id="chapter_001")

    assert package.current_empty_scene_image_id is None
    assert package.empty_scene_images == []
    assert package.complete_images == []
    assert package.chapter_assets == []
    assert package.assembly.empty_scene_image_id is None
    assert package.final_scene is None
    assert package.cast_assignments == []
    assert package.reference_selections == []
    assert package.avoid_objects == []
    assert not is_prompt_ready(package)


def test_prompt_ready_requires_confirmed_character_reference_targets_avoid_spatial_and_style() -> None:
    package = ChapterScenePackage(
        chapter_id="chapter_001",
        prompt=ChapterScenePrompt(
            prompt_text="A calm living room cleanup scene.",
            scene_spatial_contract="Sofa at back wall, tea table centered on rug.",
        ),
        cast_assignments=[
            ChapterCastAssignment(
                id="cast_001",
                character_ip_id="character_tuantuan",
                role_label="child",
                action_intent="整理抱枕",
                reference_image_ids=["reference_character_001"],
            )
        ],
        reference_selections=[
            ChapterReferenceSelection(
                id="selection_001",
                reference_image_id="reference_character_001",
                prompt_role="character",
            )
        ],
        target_objects=[
            TargetObjectItem(id="target_001", label="抱枕", priority="core"),
        ],
        avoid_objects=[
            AvoidObjectItem(id="avoid_001", label="破碎杯子"),
        ],
        prompt_confirmations=PromptReadinessConfirmation(
            avoid_objects_reviewed=True,
            style_reference_mode="confirmed_empty",
        ),
    )

    assert is_prompt_ready(package)


def test_complete_image_does_not_require_empty_scene_image_id() -> None:
    image = CompleteSceneImage(
        id="complete_scene_001",
        original_filename="complete.png",
        storage_path="complete_images/complete_scene_001.png",
        media_type="image/png",
        width=120,
        height=80,
        prompt_snapshot="Complete scene prompt.",
        reference_snapshot=ImageReferenceSnapshot(reference_image_ids=[]),
        created_at="2026-07-03T10:00:00Z",
    )

    assert image.empty_scene_image_id is None
    assert image.status == "active"


def test_direct_asset_lineage_is_distinct_from_run_asset_lineage() -> None:
    direct = ChapterAssetLineage(source_kind="direct_upload")
    run_asset = ChapterAssetLineage(
        source_kind="pipeline_run_asset",
        source_run_id="run_123",
        source_run_asset_id="asset_456",
        source_complete_image_id="complete_scene_001",
    )

    assert direct.source_run_id is None
    assert run_asset.source_run_asset_id == "asset_456"
```

- [ ] **Step 2: Run the focused model test and confirm it fails on old names**

Run: `uv run --python 3.12 --extra dev pytest tests/course_planner/test_scene_package_models.py -q`

Expected: FAIL with import or attribute errors for `ChapterCastAssignment`, `current_empty_scene_image_id`, and `EmptySceneImage`.

- [ ] **Step 3: Replace scene package models**

In `backend/art_pipeline/course_planner/scene_package_models.py`, replace the old base classes with this model surface:

```python
class ChapterScenePrompt(CoursePlannerModel):
    prompt_text: str = ""
    scene_spatial_contract: str = ""
    updated_at: str | None = None


class AvoidObjectItem(CoursePlannerModel):
    id: str = Field(min_length=1)
    label: str = Field(min_length=1)
    description: str = ""


class PromptReadinessConfirmation(CoursePlannerModel):
    avoid_objects_reviewed: bool = False
    style_reference_mode: Literal["unreviewed", "selected", "confirmed_empty"] = "unreviewed"


class ChapterCastAssignment(CoursePlannerModel):
    id: str = Field(min_length=1)
    character_ip_id: str = Field(min_length=1)
    role_label: str = Field(min_length=1)
    action_intent: str = Field(min_length=1)
    reference_image_ids: list[str] = Field(default_factory=list)


class ChapterReferenceSelection(CoursePlannerModel):
    id: str = Field(min_length=1)
    reference_image_id: str = Field(min_length=1)
    prompt_role: Literal["character", "style", "scene", "other"]
    notes: str = ""


class ImageReferenceSnapshot(CoursePlannerModel):
    reference_image_ids: list[str] = Field(default_factory=list)
    current_empty_scene_image_id: str | None = None
    notes: str = ""


class EmptySceneImage(CoursePlannerModel):
    id: str = Field(min_length=1)
    original_filename: str = Field(min_length=1)
    storage_path: str = Field(min_length=1)
    media_type: Literal["image/png"]
    width: int = Field(ge=1)
    height: int = Field(ge=1)
    status: Literal["available", "removed"] = "available"
    prompt_snapshot: str
    reference_snapshot: ImageReferenceSnapshot = Field(default_factory=ImageReferenceSnapshot)
    created_at: str = Field(min_length=1)


class CompleteSceneImage(CoursePlannerModel):
    id: str = Field(min_length=1)
    original_filename: str = Field(min_length=1)
    storage_path: str = Field(min_length=1)
    media_type: Literal["image/png"]
    width: int = Field(ge=1)
    height: int = Field(ge=1)
    empty_scene_image_id: str | None = None
    status: Literal["active", "historical", "deleted"] = "active"
    prompt_snapshot: str
    reference_snapshot: ImageReferenceSnapshot = Field(default_factory=ImageReferenceSnapshot)
    generation_note: str = ""
    pipeline_run_id: str | None = None
    pipeline_run_status: str | None = None
    created_at: str = Field(min_length=1)


class ChapterAssetLineage(CoursePlannerModel):
    source_kind: Literal["pipeline_run_asset", "direct_upload"]
    source_run_id: str | None = None
    source_run_asset_id: str | None = None
    source_complete_image_id: str | None = None


class FinalChapterScene(CoursePlannerModel):
    id: str = Field(min_length=1)
    original_filename: str = Field(min_length=1)
    storage_path: str = Field(min_length=1)
    media_type: Literal["image/png"]
    width: int = Field(ge=1)
    height: int = Field(ge=1)
    empty_scene_image_id: str = Field(min_length=1)
    assembly_snapshot: ChapterSceneAssembly
    prompt_snapshot: str
    reference_snapshot: ImageReferenceSnapshot
    created_at: str = Field(min_length=1)


class ChapterSceneAssembly(CoursePlannerModel):
    schema_version: Literal[1] = 1
    empty_scene_image_id: str | None = None
    empty_scene_size: dict[str, int] | None = None
    placements: list[AssemblyPlacement] = Field(default_factory=list)
    groups: list[AssemblyGroup] = Field(default_factory=list)
    layer_order: list[str] = Field(default_factory=list)
    updated_at: str | None = None


class ChapterScenePackage(CoursePlannerModel):
    chapter_id: str = Field(min_length=1)
    current_empty_scene_image_id: str | None = None
    prompt: ChapterScenePrompt = Field(default_factory=ChapterScenePrompt)
    prompt_confirmations: PromptReadinessConfirmation = Field(default_factory=PromptReadinessConfirmation)
    cast_assignments: list[ChapterCastAssignment] = Field(default_factory=list)
    reference_selections: list[ChapterReferenceSelection] = Field(default_factory=list)
    target_objects: list[TargetObjectItem] = Field(default_factory=list)
    avoid_objects: list[AvoidObjectItem] = Field(default_factory=list)
    assembly: ChapterSceneAssembly = Field(default_factory=ChapterSceneAssembly)
    empty_scene_images: list[EmptySceneImage] = Field(default_factory=list)
    complete_images: list[CompleteSceneImage] = Field(default_factory=list)
    chapter_assets: list[ChapterAsset] = Field(default_factory=list)
    final_scene: FinalChapterScene | None = None
```

Add lineage validation:

```python
@model_validator(mode="after")
def _validate_lineage(self) -> "ChapterAssetLineage":
    if self.source_kind == "direct_upload":
        if self.source_run_id or self.source_run_asset_id or self.source_complete_image_id:
            raise ValueError("Direct upload lineage cannot include run asset fields.")
        return self
    if not self.source_run_id or not self.source_run_asset_id:
        raise ValueError("Pipeline run asset lineage requires source_run_id and source_run_asset_id.")
    return self
```

The file needs `from pydantic import Field, model_validator`.

- [ ] **Step 4: Implement prompt readiness against confirmed facts**

Replace `is_prompt_ready` with:

```python
def is_prompt_ready(package: ChapterScenePackage) -> bool:
    has_character = all(
        assignment.character_ip_id.strip()
        and assignment.action_intent.strip()
        and assignment.reference_image_ids
        for assignment in package.cast_assignments
    ) and bool(package.cast_assignments)
    has_target_objects = bool(package.target_objects)
    has_avoid_review = package.prompt_confirmations.avoid_objects_reviewed
    has_spatial_contract = bool(package.prompt.scene_spatial_contract.strip())
    has_style_resolution = (
        any(selection.prompt_role == "style" for selection in package.reference_selections)
        or package.prompt_confirmations.style_reference_mode == "confirmed_empty"
    )
    return (
        bool(package.prompt.prompt_text.strip())
        and has_character
        and has_target_objects
        and has_avoid_review
        and has_spatial_contract
        and has_style_resolution
    )
```

- [ ] **Step 5: Update assembly validation names**

Replace `_locked_base_reference_errors` with:

```python
def _empty_scene_reference_errors(package: ChapterScenePackage) -> list[str]:
    if not package.assembly.placements:
        return []
    current_id = package.current_empty_scene_image_id
    if current_id and package.assembly.empty_scene_image_id == current_id:
        return []
    return [
        "Assembly manifest empty_scene_image_id must match current_empty_scene_image_id when placements exist."
    ]
```

Update `validate_assembly_manifest` to call `_empty_scene_reference_errors(package)`.

- [ ] **Step 6: Add shared library models**

In `backend/art_pipeline/course_planner/models.py`, add:

```python
class ReferenceLibraryImage(CoursePlannerModel):
    id: str = Field(min_length=1)
    original_filename: str = Field(min_length=1)
    storage_path: str = Field(min_length=1)
    media_type: Literal["image/png"]
    width: int = Field(ge=1)
    height: int = Field(ge=1)
    tags: list[str] = Field(default_factory=list)
    notes: str = ""
    created_at: str = Field(min_length=1)
    status: Literal["available", "deleted"] = "available"


class CharacterIpProfile(CoursePlannerModel):
    id: str = Field(min_length=1)
    display_name: str = Field(min_length=1)
    visual_invariants: str = ""
    personality_cues: str = ""
    reference_image_ids: list[str] = Field(default_factory=list)
    status: Literal["available", "archived"] = "available"
    created_at: str = Field(min_length=1)
    updated_at: str | None = None
```

- [ ] **Step 7: Run model tests**

Run: `uv run --python 3.12 --extra dev pytest tests/course_planner/test_scene_package_models.py tests/course_planner/test_models.py -q`

Expected: PASS for updated model tests; route/store tests still fail until later tasks replace old routes.

- [ ] **Step 8: Commit Task 1**

```bash
git add backend/art_pipeline/course_planner/scene_package_models.py backend/art_pipeline/course_planner/models.py backend/tests/course_planner/test_scene_package_models.py backend/tests/course_planner/test_models.py
git diff --staged --check
git commit -m "refactor: replace scene package domain model"
```

---

### Task 2: Backend Store And Routes

**Files:**
- Modify: `backend/art_pipeline/course_planner/scene_package_media_store.py`
- Modify: `backend/art_pipeline/course_planner/scene_package_store.py`
- Modify: `backend/art_pipeline/course_planner/scene_package_routes.py`
- Modify: `backend/art_pipeline/course_planner/api_models.py`
- Create: `backend/art_pipeline/course_planner/library_routes.py`
- Test: `backend/tests/course_planner/test_scene_package_store_media.py`
- Test: `backend/tests/course_planner/test_scene_package_store_lifecycle.py`
- Test: `backend/tests/course_planner/test_scene_package_routes_complete_assets.py`
- Test: `backend/tests/course_planner/test_scene_package_routes_assembly_media_delete.py`
- Test: `backend/tests/course_planner/test_scene_package_routes_prompt.py`
- Test: `backend/tests/course_planner/scene_package_route_test_helpers.py`

**Interfaces:**
- Consumes: models from Task 1.
- Produces:
  - `add_empty_scene_image(chapter_id, image_bytes, original_filename, prompt_snapshot, reference_image_ids) -> ChapterScenePackage`
  - `select_empty_scene_image(chapter_id, image_id) -> ChapterScenePackage`
  - `add_complete_scene_image(chapter_id, image_bytes, original_filename, prompt_snapshot, reference_image_ids, generation_note) -> ChapterScenePackage`
  - `add_direct_chapter_asset(chapter_id, image_bytes, original_filename, display_name, linked_target_object_id) -> ChapterScenePackage`
  - `lock_final_chapter_scene(chapter_id, image_bytes, original_filename) -> ChapterScenePackage`
  - `POST /api/course-planner/chapters/{chapterId}/scene-package/empty-scene-images`
  - `POST /api/course-planner/chapters/{chapterId}/scene-package/current-empty-scene`
  - `POST /api/course-planner/chapters/{chapterId}/scene-package/chapter-assets/direct-upload`
  - `POST /api/course-planner/chapters/{chapterId}/scene-package/final-scene`

- [ ] **Step 1: Write failing route tests for new endpoint names**

In `backend/tests/course_planner/test_scene_package_routes_complete_assets.py`, replace the old complete image precondition test with:

```python
def test_upload_complete_image_without_selected_empty_scene_succeeds(client: TestClient) -> None:
    chapter_id = _create_chapter(client)

    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/complete-images",
        files={"file": ("complete.png", _png_bytes(width=96, height=64), "image/png")},
    )

    assert response.status_code == 200
    image = response.json()["scenePackage"]["complete_images"][0]
    assert image["empty_scene_image_id"] is None
    assert image["status"] == "active"
```

In `backend/tests/course_planner/test_scene_package_store_lifecycle.py`, add:

```python
def test_select_empty_scene_image_sets_current_without_locking_complete_images(tmp_path: Path) -> None:
    store = seeded_course_planner_store(tmp_path)
    chapter_id = seed_chapter(store)
    package = store.add_empty_scene_image(
        chapter_id,
        image_bytes=_png_bytes(width=120, height=80),
        original_filename="empty.png",
        prompt_snapshot=None,
        reference_image_ids=[],
    )
    image_id = package.empty_scene_images[0].id

    selected = store.select_empty_scene_image(chapter_id, image_id)

    assert selected.current_empty_scene_image_id == image_id
    assert selected.assembly.empty_scene_image_id == image_id
    assert selected.assembly.empty_scene_size == {"width": 120, "height": 80}
    assert selected.empty_scene_images[0].status == "available"
```

In `backend/tests/course_planner/test_scene_package_routes_complete_assets.py`, add:

```python
def test_direct_scene_asset_upload_materializes_asset_without_run_lineage(client: TestClient) -> None:
    chapter_id = _create_chapter(client)

    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/chapter-assets/direct-upload",
        data={
            "displayName": "抱枕",
            "linkedTargetObjectId": "target_object_001",
        },
        files={"file": ("pillow.png", _png_bytes(width=32, height=32), "image/png")},
    )

    assert response.status_code == 200
    asset = response.json()["scenePackage"]["chapter_assets"][0]
    assert asset["display_name"] == "抱枕"
    assert asset["lineage"]["source_kind"] == "direct_upload"
    assert asset["lineage"]["source_run_id"] is None
```

Add Lock Final route test:

```python
def test_lock_final_scene_uploads_composed_png_and_records_snapshot(client: TestClient) -> None:
    chapter_id = _create_chapter(client)
    empty_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/empty-scene-images",
        files={"file": ("empty.png", _png_bytes(width=120, height=80), "image/png")},
    )
    empty_id = empty_response.json()["scenePackage"]["empty_scene_images"][0]["id"]
    client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/current-empty-scene",
        json={"emptySceneImageId": empty_id},
    )
    asset_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/chapter-assets/direct-upload",
        data={"displayName": "抱枕"},
        files={"file": ("pillow.png", _png_bytes(width=32, height=32), "image/png")},
    )
    asset_id = asset_response.json()["scenePackage"]["chapter_assets"][0]["id"]
    client.put(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/assembly",
        json={
            "schema_version": 1,
            "empty_scene_image_id": empty_id,
            "empty_scene_size": {"width": 120, "height": 80},
            "placements": [
                {
                    "id": "placement_001",
                    "asset_id": asset_id,
                    "display_name": "抱枕",
                    "runtime_role": "target",
                    "transform": {"cx": 0.5, "cy": 0.5, "w": 0.2, "h": 0.2, "rotation_deg": 0},
                    "requires_placed": [],
                }
            ],
            "groups": [],
            "layer_order": ["placement_001"],
        },
    )

    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/final-scene",
        files={"file": ("final.png", _png_bytes(width=120, height=80), "image/png")},
    )

    assert response.status_code == 200
    final_scene = response.json()["scenePackage"]["final_scene"]
    assert final_scene["empty_scene_image_id"] == empty_id
    assert final_scene["media_type"] == "image/png"
    assert final_scene["width"] == 120
    assert final_scene["height"] == 80


def test_lock_final_scene_requires_placed_asset(client: TestClient) -> None:
    chapter_id = _create_chapter(client)
    empty_response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/empty-scene-images",
        files={"file": ("empty.png", _png_bytes(width=120, height=80), "image/png")},
    )
    empty_id = empty_response.json()["scenePackage"]["empty_scene_images"][0]["id"]
    client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/current-empty-scene",
        json={"emptySceneImageId": empty_id},
    )

    response = client.post(
        f"/api/course-planner/chapters/{chapter_id}/scene-package/final-scene",
        files={"file": ("final.png", _png_bytes(width=120, height=80), "image/png")},
    )

    assert response.status_code == 409
    assert "placed Scene Asset" in response.json()["detail"]
```

- [ ] **Step 2: Run route tests and confirm old API failures**

Run: `uv run --python 3.12 --extra dev pytest tests/course_planner/test_scene_package_routes_complete_assets.py tests/course_planner/test_scene_package_store_lifecycle.py -q`

Expected: FAIL because `/empty-scene-images`, `/current-empty-scene`, `/chapter-assets/direct-upload`, and `/final-scene` do not exist yet.

- [ ] **Step 3: Rename media store methods and storage slots**

In `backend/art_pipeline/course_planner/scene_package_media_store.py`:

```python
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
        prompt_snapshot=self._resolve_empty_scene_prompt_snapshot(current, prompt_snapshot),
        reference_snapshot=ImageReferenceSnapshot(reference_image_ids=list(reference_image_ids)),
        created_at=utc_now(),
    )
    self._write_scene_package_media_file(scene_pack_id, current.chapter_id, image.storage_path, image_bytes)
    return self.write_chapter_scene_package(
        current.model_copy(update={"empty_scene_images": [*current.empty_scene_images, image]})
    )
```

Rename `build_base_prompt` usages to `build_empty_scene_prompt`.

- [ ] **Step 4: Remove complete image locked-base precondition**

In `add_complete_scene_image`, delete the branch that raises when no locked base exists and construct:

```python
complete = CompleteSceneImage(
    id=complete_id,
    original_filename=sanitize_original_filename(original_filename),
    storage_path=storage_path,
    media_type="image/png",
    width=width,
    height=height,
    empty_scene_image_id=current.current_empty_scene_image_id,
    prompt_snapshot=self._resolve_complete_prompt_snapshot(current, prompt_snapshot),
    reference_snapshot=ImageReferenceSnapshot(
        reference_image_ids=list(reference_image_ids),
        current_empty_scene_image_id=current.current_empty_scene_image_id,
    ),
    generation_note=generation_note,
    created_at=utc_now(),
)
```

Rename the route/form field from `variationPrompt` to `generationNote` in both backend and frontend. Keep no fallback that reads `variationPrompt`.

- [ ] **Step 5: Add direct asset upload**

Add to `CoursePlannerScenePackageMediaStoreMixin`:

```python
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
    self._write_scene_package_media_file(scene_pack_id, current.chapter_id, asset.storage_path, image_bytes)
    return self.write_chapter_scene_package(
        current.model_copy(update={"chapter_assets": [*current.chapter_assets, asset]})
    )
```

- [ ] **Step 6: Replace lock with current empty scene selection**

In `backend/art_pipeline/course_planner/scene_package_store.py`, replace `lock_empty_base_scene` with:

```python
def select_empty_scene_image(
    self,
    chapter_id: str,
    image_id: str,
) -> ChapterScenePackage:
    current, _ = self._load_scene_package_for_write(chapter_id)
    image = next(
        (candidate for candidate in current.empty_scene_images if candidate.id == image_id and candidate.status == "available"),
        None,
    )
    if image is None:
        raise UnknownEmptySceneImageError(f"Unknown empty scene image id: {image_id}")
    replacing_canvas = (
        current.current_empty_scene_image_id is not None
        and current.current_empty_scene_image_id != image_id
        and bool(current.assembly.placements)
    )
    next_assembly = current.assembly.model_copy(
        update={
            "empty_scene_image_id": image.id,
            "empty_scene_size": {"width": image.width, "height": image.height},
            "placements": [] if replacing_canvas else current.assembly.placements,
            "groups": [] if replacing_canvas else current.assembly.groups,
            "layer_order": [] if replacing_canvas else current.assembly.layer_order,
            "updated_at": utc_now(),
        }
    )
    return self.write_chapter_scene_package(
        current.model_copy(
            update={
                "current_empty_scene_image_id": image.id,
                "assembly": next_assembly,
            }
        )
    )
```

Add `UnknownEmptySceneImageError` in `scene_package_errors.py` and map it to 404 in route helpers.

- [ ] **Step 7: Add final scene lock**

Add to `scene_package_media_store.py`:

```python
def lock_final_chapter_scene(
    self,
    chapter_id: str,
    *,
    image_bytes: bytes,
    original_filename: str,
) -> ChapterScenePackage:
    current, scene_pack_id = self._load_scene_package_for_write(chapter_id)
    if not current.current_empty_scene_image_id:
        raise ScenePackagePreconditionError("Lock Final requires a selected Empty Scene Image.")
    if not current.assembly.placements:
        raise ScenePackagePreconditionError("Lock Final requires at least one placed Scene Asset.")
    width, height = read_scene_package_png_size(image_bytes, "Final chapter scene image")
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
        reference_snapshot=ImageReferenceSnapshot(
            reference_image_ids=[selection.reference_image_id for selection in current.reference_selections],
            current_empty_scene_image_id=current.current_empty_scene_image_id,
        ),
        created_at=utc_now(),
    )
    self._write_scene_package_media_file(scene_pack_id, current.chapter_id, final_scene.storage_path, image_bytes)
    return self.write_chapter_scene_package(current.model_copy(update={"final_scene": final_scene}))
```

- [ ] **Step 8: Replace routes**

In `scene_package_routes.py`, remove `post_base_candidate`, `delete_base_candidate`, and `post_lock_base_candidate`. Add:

```python
@scene_package_router.post("/chapters/{chapterId}/scene-package/empty-scene-images")
async def post_empty_scene_image(request: Request, chapterId: str) -> dict[str, object]:
    form = await request.form()
    file = require_upload_file(form.get("file"))
    try:
        package = store_for_request(request).add_empty_scene_image(
            chapterId,
            image_bytes=await file.read(),
            original_filename=file.filename or "upload.png",
            prompt_snapshot=_optional_prompt_snapshot(form.get("promptSnapshot")),
            reference_image_ids=string_list_form_value(form, "referenceImageIds"),
        )
    except SCENE_PACKAGE_ROUTE_ERRORS as exc:
        raise scene_package_http_exception(exc) from exc
    return scene_package_payload(package)


@scene_package_router.post("/chapters/{chapterId}/scene-package/current-empty-scene")
async def post_current_empty_scene(request: Request, chapterId: str) -> dict[str, object]:
    payload = await parse_json_model(request, CurrentEmptySceneImageRequest)
    try:
        package = store_for_request(request).select_empty_scene_image(
            chapterId,
            payload.empty_scene_image_id,
        )
    except SCENE_PACKAGE_ROUTE_ERRORS as exc:
        raise scene_package_http_exception(exc, child_not_found_detail="Empty Scene Image not found.") from exc
    return scene_package_payload(package)
```

Add direct asset and final scene route handlers using the store methods from this task.

- [ ] **Step 9: Add request models**

In `api_models.py`:

```python
class CurrentEmptySceneImageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    empty_scene_image_id: str = Field(alias="emptySceneImageId", min_length=1)


class ChapterReferenceSelectionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    reference_image_id: str = Field(alias="referenceImageId", min_length=1)
    prompt_role: Literal["character", "style", "scene", "other"] = Field(alias="promptRole")
    notes: str = ""
```

Remove `PromptVersionCreateRequest`, `PromptVersionPatchRequest`, `ImageAttemptCreateRequest`, and `ImageAttemptPatchRequest` when backend routes that use them are deleted in Task 4.

- [ ] **Step 10: Run backend scene package tests**

Run: `uv run --python 3.12 --extra dev pytest tests/course_planner/test_scene_package_models.py tests/course_planner/test_scene_package_store_media.py tests/course_planner/test_scene_package_store_lifecycle.py tests/course_planner/test_scene_package_routes_complete_assets.py tests/course_planner/test_scene_package_routes_assembly_media_delete.py tests/course_planner/test_scene_package_routes_prompt.py -q`

Expected: PASS for scene package tests after route/helper updates.

- [ ] **Step 11: Commit Task 2**

```bash
git add backend/art_pipeline/course_planner backend/tests/course_planner
git diff --staged --check
git commit -m "feat: add clean chapter scene package routes"
```

---

### Task 3: Remove PromptVersion And ImageAttempt Backend Runtime

**Files:**
- Modify: `backend/art_pipeline/course_planner/models.py`
- Modify: `backend/art_pipeline/course_planner/routes.py`
- Modify: `backend/art_pipeline/course_planner/store_hierarchy.py`
- Modify: `backend/art_pipeline/course_planner/ai_tasks.py`
- Modify: `backend/tests/course_planner/test_routes.py`
- Modify: `backend/tests/course_planner/test_store.py`
- Modify: `backend/tests/course_planner/test_ai_tasks.py`

**Interfaces:**
- Consumes: ScenePack and Chapter CRUD from existing routes.
- Produces: Course Planner state payload without `promptVersions`, `imageAttempts`, `selectedPromptVersionId`, or adopted prompt version fields.

- [ ] **Step 1: Write failing state payload test**

In `backend/tests/course_planner/test_routes.py`, add:

```python
def test_state_payload_does_not_expose_prompt_versions_or_image_attempts(client: TestClient) -> None:
    response = client.get("/api/course-planner/state")

    assert response.status_code == 200
    payload = response.json()
    assert "promptVersions" not in payload
    assert "imageAttempts" not in payload
    assert "selectedPromptVersionId" not in payload
```

- [ ] **Step 2: Run backend route tests and confirm old payload is still present**

Run: `uv run --python 3.12 --extra dev pytest tests/course_planner/test_routes.py::test_state_payload_does_not_expose_prompt_versions_or_image_attempts -q`

Expected: FAIL because the current state route still returns old prompt attempt fields.

- [ ] **Step 3: Remove route handlers**

In `backend/art_pipeline/course_planner/routes.py`, remove endpoint handlers whose paths contain:

```text
/prompt-versions
/image-attempts
```

Keep ScenePack, Chapter candidate, chapter CRUD, task, and import routes that are still part of Course Planner.

- [ ] **Step 4: Remove store methods**

In `store_hierarchy.py`, remove methods and helpers whose only caller was a deleted prompt/image route:

```text
create_prompt_version
duplicate_prompt_version
list_prompt_versions
get_prompt_version
update_prompt_version
archive_prompt_version
create_image_attempt
upload_image_attempt
list_image_attempts
get_image_attempt
update_image_attempt
```

Keep Chapter and ScenePack persistence methods.

- [ ] **Step 5: Remove AI task models that only served the old workflow**

In `ai_tasks.py` and `models.py`, remove generated output types whose only endpoint was PromptVersion or ImageAttempt review:

```text
GeneratePromptVersionOutput
ImageAttemptReview
```

If a provider test still needs a generic JSON model, replace it with an existing non-prompt Course Planner output type rather than keeping dead prompt models.

- [ ] **Step 6: Update tests**

Remove backend test functions that assert prompt version CRUD and image attempt review behavior. Keep tests for ScenePack, Chapter, candidate generation, scene package, and import-to-pipeline paths.

Run: `uv run --python 3.12 --extra dev pytest tests/course_planner/test_routes.py tests/course_planner/test_store.py tests/course_planner/test_ai_tasks.py -q`

Expected: PASS with old prompt/image endpoints gone.

- [ ] **Step 7: Runtime keyword gate**

Run:

```bash
rg -n "PromptVersion|ImageAttempt|prompt-versions|image-attempts" backend/art_pipeline/course_planner backend/tests/course_planner
```

Expected: no output.

- [ ] **Step 8: Commit Task 3**

```bash
git add backend/art_pipeline/course_planner backend/tests/course_planner
git diff --staged --check
git commit -m "refactor: remove old prompt attempt backend workflow"
```

---

### Task 4: Frontend API And State Contracts

**Files:**
- Modify: `frontend/src/features/coursePlanner/types.ts`
- Modify: `frontend/src/features/coursePlanner/api.ts`
- Modify: `frontend/src/features/coursePlanner/scenePackageApi.ts`
- Modify: `frontend/src/features/coursePlanner/hooks/useCoursePlannerState.ts`
- Modify: `frontend/src/features/coursePlanner/domain/chapterStatus.ts`
- Test: `frontend/tests/coursePlanner/course-planner-api.test.ts`
- Test: `frontend/tests/coursePlanner/course-planner-scene-package-api.test.ts`
- Test: `frontend/tests/coursePlanner/coursePlannerApiTestHelpers.ts`

**Interfaces:**
- Consumes: backend payload from Tasks 1-3.
- Produces:
  - `CoursePlannerState` without prompt version fields.
  - `uploadEmptySceneImage`, `selectEmptySceneImage`, `uploadDirectChapterAsset`, `lockFinalChapterScene`.
  - State hook with Scene Category / Chapter selection only.

- [ ] **Step 1: Write failing frontend API tests**

In `frontend/tests/coursePlanner/course-planner-scene-package-api.test.ts`, replace base/lock tests with:

```typescript
it("uploads and selects Empty Scene Images without lock endpoints", async () => {
  const fetcher = scenePackageFetcher();
  const file = new File(["png"], "empty.png", { type: "image/png" });

  await uploadEmptySceneImage("chapter_001", file, { referenceImageIds: ["reference_001"] }, fetcher);
  await selectEmptySceneImage("chapter_001", "empty_scene_001", fetcher);

  expect(fetcher.calls.map(([input, init]) => [input, init?.method])).toEqual([
    ["/api/course-planner/chapters/chapter_001/scene-package/empty-scene-images", "POST"],
    ["/api/course-planner/chapters/chapter_001/scene-package/current-empty-scene", "POST"],
  ]);
});

it("uploads direct Scene Assets without run lineage fields", async () => {
  const fetcher = scenePackageFetcher();
  const file = new File(["png"], "pillow.png", { type: "image/png" });

  await uploadDirectChapterAsset(
    "chapter_001",
    file,
    { displayName: "抱枕", linkedTargetObjectId: "target_001" },
    fetcher,
  );

  const [, init] = fetcher.calls[0];
  const body = init?.body as FormData;
  expect(body.get("displayName")).toBe("抱枕");
  expect(body.get("sourceRunId")).toBeNull();
});
```

- [ ] **Step 2: Run frontend API tests and confirm old function names fail**

Run: `npm --prefix frontend test -- --run course-planner-scene-package-api`

Expected: FAIL because the new API function names are not exported.

- [ ] **Step 3: Replace frontend scene package API**

In `frontend/src/features/coursePlanner/scenePackageApi.ts`, rename:

```typescript
export type EmptySceneImageUploadInput = {
  referenceImageIds?: string[];
  promptSnapshot?: string;
};

export async function uploadEmptySceneImage(
  chapterId: string,
  file: File,
  input: EmptySceneImageUploadInput = {},
  fetcher: CoursePlannerFetcher = fetch,
): Promise<ChapterScenePackage> {
  const body = new FormData();
  body.append("file", file);
  appendStringListField(body, "referenceImageIds", input.referenceImageIds);
  appendOptionalStringField(body, "promptSnapshot", input.promptSnapshot);
  return requestScenePackage(
    fetcher,
    `${scenePackagePath(chapterId)}/empty-scene-images`,
    { method: "POST", body },
    "Could not upload Empty Scene Image.",
  );
}

export async function selectEmptySceneImage(
  chapterId: string,
  emptySceneImageId: string,
  fetcher: CoursePlannerFetcher = fetch,
): Promise<ChapterScenePackage> {
  return requestScenePackage(
    fetcher,
    `${scenePackagePath(chapterId)}/current-empty-scene`,
    jsonRequest("POST", { emptySceneImageId }),
    "Could not select Empty Scene Image.",
  );
}
```

Add:

```typescript
export type DirectChapterAssetUploadInput = {
  displayName: string;
  linkedTargetObjectId?: string;
};

export async function uploadDirectChapterAsset(
  chapterId: string,
  file: File,
  input: DirectChapterAssetUploadInput,
  fetcher: CoursePlannerFetcher = fetch,
): Promise<ChapterScenePackage> {
  const body = new FormData();
  body.append("file", file);
  body.append("displayName", input.displayName);
  appendOptionalStringField(body, "linkedTargetObjectId", input.linkedTargetObjectId);
  return requestScenePackage(
    fetcher,
    `${scenePackagePath(chapterId)}/chapter-assets/direct-upload`,
    { method: "POST", body },
    "Could not upload direct Scene Asset.",
  );
}

export async function lockFinalChapterScene(
  chapterId: string,
  file: File,
  fetcher: CoursePlannerFetcher = fetch,
): Promise<ChapterScenePackage> {
  const body = new FormData();
  body.append("file", file);
  return requestScenePackage(
    fetcher,
    `${scenePackagePath(chapterId)}/final-scene`,
    { method: "POST", body },
    "Could not lock Final Chapter Scene.",
  );
}
```

Delete exports named `uploadEmptyBaseSceneCandidate` and `lockEmptyBaseScene`.

- [ ] **Step 4: Replace frontend types**

In `frontend/src/features/coursePlanner/types.ts`, delete `PromptVersion`, `ImageAttempt`, `ImageAttemptReview`, `promptVersionsByChapterId`, `imageAttemptsByVersionId`, and `selectedPromptVersionId`.

Add types matching backend snake_case:

```typescript
export type EmptySceneImage = {
  id: string;
  original_filename: string;
  storage_path: string;
  media_type: "image/png";
  width: number;
  height: number;
  status: "available" | "removed";
  prompt_snapshot: string;
  reference_snapshot: ImageReferenceSnapshot;
  created_at: string;
};

export type ChapterSceneAssemblyManifest = {
  schema_version: 1;
  empty_scene_image_id: string | null;
  empty_scene_size: { width: number; height: number } | null;
  placements: ChapterSceneAssemblyPlacement[];
  groups: ChapterSceneAssemblyGroup[];
  layer_order: string[];
  updated_at: string | null;
};

export type ChapterScenePackage = {
  chapter_id: string;
  current_empty_scene_image_id: string | null;
  prompt: ChapterScenePrompt;
  prompt_confirmations: PromptReadinessConfirmation;
  cast_assignments: ChapterCastAssignment[];
  reference_selections: ChapterReferenceSelection[];
  target_objects: TargetObjectItem[];
  avoid_objects: AvoidObjectItem[];
  empty_scene_images: EmptySceneImage[];
  complete_images: CompleteSceneImage[];
  chapter_assets: ChapterAsset[];
  assembly: ChapterSceneAssemblyManifest;
  final_scene: FinalChapterScene | null;
};
```

- [ ] **Step 5: Simplify Course Planner state hook**

In `useCoursePlannerState.ts`, remove imports and handlers for:

```text
adoptPromptVersion
createImageAttempt
createPromptVersion
deletePromptVersion
duplicatePromptVersion
generatePromptPackage
importImageAttempt
listImageAttempts
listPromptVersions
reviewImageAttempt
updateImageAttempt
updatePromptVersion
uploadImageAttempt
```

Keep `selectedChapterId` and remove every `selectedPromptVersionId` assignment. On chapter delete, only clear `selectedChapterId`.

- [ ] **Step 6: Run frontend API and type tests**

Run: `npm --prefix frontend test -- --run course-planner-api course-planner-scene-package-api`

Expected: PASS for updated API tests.

- [ ] **Step 7: Frontend runtime keyword gate**

Run:

```bash
rg -n "PromptVersion|ImageAttempt|promptVersionsByChapterId|imageAttemptsByVersionId|selectedPromptVersionId|base-candidates|locked_base|base_candidate|lockEmptyBaseScene" frontend/src/features/coursePlanner frontend/tests/coursePlanner
```

Expected: no output after Tasks 4-6 finish. During Task 4 it may still show page/component files scheduled for deletion in Task 5.

- [ ] **Step 8: Commit Task 4**

```bash
git add frontend/src/features/coursePlanner frontend/tests/coursePlanner
git diff --staged --check
git commit -m "refactor: replace course planner frontend contracts"
```

---

### Task 5: Chapter Scene Studio UI

**Files:**
- Replace: `frontend/src/features/coursePlanner/pages/ChapterWorkspacePage.tsx`
- Create: `frontend/src/features/coursePlanner/components/ChapterSceneStudio.tsx`
- Create: `frontend/src/features/coursePlanner/components/PromptFactsPanel.tsx`
- Create: `frontend/src/features/coursePlanner/components/LibrarySelectionPanel.tsx`
- Create: `frontend/src/features/coursePlanner/components/EmptySceneImagesPanel.tsx`
- Create: `frontend/src/features/coursePlanner/components/CompleteSceneImagesPanel.tsx`
- Create: `frontend/src/features/coursePlanner/components/ChapterAssetPoolPanel.tsx`
- Create: `frontend/src/features/coursePlanner/components/AssemblyWorkspacePanel.tsx`
- Create: `frontend/src/features/coursePlanner/components/FinalScenePanel.tsx`
- Modify: `frontend/src/features/coursePlanner/components/coursePlanner.css`
- Test: `frontend/tests/coursePlanner/chapter-workspace.test.tsx`
- Test: `frontend/tests/coursePlanner/chapterWorkspaceTestHelpers.ts`

**Interfaces:**
- Consumes: `ChapterScenePackage`, scene package API functions, simplified `CoursePlannerController`.
- Produces: one stable Studio page with progress rail `Prompt / Empty Scene / Images / Runs / Assembly / Final`.

- [ ] **Step 1: Write failing Studio smoke tests**

Replace `frontend/tests/coursePlanner/chapter-workspace.test.tsx` with tests that assert the new workflow:

```typescript
it("renders Chapter Scene Studio without PromptVersion controls", async () => {
  renderChapterWorkspace({ scenePackage: studioScenePackageFixture() });

  expect(await screen.findByRole("heading", { name: "清晨客厅整理" })).toBeInTheDocument();
  expect(screen.getByText("Prompt")).toBeInTheDocument();
  expect(screen.getByText("Empty Scene")).toBeInTheDocument();
  expect(screen.getByText("Assembly")).toBeInTheDocument();
  expect(screen.queryByText(/PromptVersion/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/Tune Prompt/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/Image Attempt/i)).not.toBeInTheDocument();
});

it("shows character and reference selection as explicit readiness gates", async () => {
  renderChapterWorkspace({ scenePackage: studioScenePackageFixture({ promptReady: false }) });

  expect(await screen.findByText("Character IP")).toBeInTheDocument();
  expect(screen.getByText("Reference Library")).toBeInTheDocument();
  expect(screen.getByText("Avoid reviewed")).toBeInTheDocument();
});

it("offers direct Scene Asset upload", async () => {
  renderChapterWorkspace({ scenePackage: studioScenePackageFixture() });

  expect(await screen.findByRole("button", { name: "Upload Scene Asset" })).toBeEnabled();
});

it("locks final only from the assembly section", async () => {
  renderChapterWorkspace({ scenePackage: studioScenePackageFixture({ assemblyReady: true }) });

  expect(await screen.findByRole("button", { name: "Lock Final" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: /Lock as Base/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the workspace test and confirm old UI is still rendered**

Run: `npm --prefix frontend test -- --run chapter-workspace`

Expected: FAIL because the old PromptVersion workspace is still mounted.

- [ ] **Step 3: Replace the page with Studio shell**

In `ChapterWorkspacePage.tsx`, keep chapter lookup and route selection, then render:

```tsx
return (
  <main className="chapter-workspace-page">
    <CoursePlannerPageHeader
      backTo="/course-planner"
      backLabel="Back to board"
      eyebrow={`${scenePack.title} / Chapter Scene Studio`}
      title={currentChapter.title}
      subtitle={currentChapter.summary}
      status={studioStatusLabel(scenePackage)}
      statusTone={studioStatusTone(scenePackage)}
    />
    <ChapterSceneStudio
      chapter={currentChapter}
      scenePack={scenePack}
      scenePackage={scenePackage}
      asyncStatus={planner.state.asyncStatus}
      onUpdatePrompt={updatePromptFacts}
      onUploadEmptySceneImage={uploadEmptySceneImage}
      onSelectEmptySceneImage={selectEmptySceneImage}
      onUploadCompleteSceneImage={uploadCompleteSceneImage}
      onUploadDirectAsset={uploadDirectChapterAsset}
      onSaveAssembly={saveChapterSceneAssembly}
      onLockFinal={lockFinalChapterScene}
    />
  </main>
);
```

`scenePackage` must be loaded through `fetchChapterScenePackage(chapter.id)` in a focused hook or local effect. Keep that hook private to the page until another caller exists.

- [ ] **Step 4: Implement progress rail**

In `ChapterSceneStudio.tsx`, use this interface:

```tsx
type ChapterSceneStudioProps = {
  chapter: Chapter;
  scenePack: ScenePack;
  scenePackage: ChapterScenePackage;
  asyncStatus: AsyncStatusMap;
  onUpdatePrompt: (input: ChapterScenePromptInput) => Promise<ChapterScenePackage | null>;
  onUploadEmptySceneImage: (file: File, input: EmptySceneImageUploadInput) => Promise<ChapterScenePackage | null>;
  onSelectEmptySceneImage: (imageId: string) => Promise<ChapterScenePackage | null>;
  onUploadCompleteSceneImage: (file: File, input: CompleteImageUploadInput) => Promise<ChapterScenePackage | null>;
  onUploadDirectAsset: (file: File, input: DirectChapterAssetUploadInput) => Promise<ChapterScenePackage | null>;
  onSaveAssembly: (manifest: ChapterSceneAssemblyManifest) => Promise<ChapterScenePackage | null>;
  onLockFinal: (file: File) => Promise<ChapterScenePackage | null>;
};
```

Render sections in this order:

```tsx
const steps = [
  { key: "prompt", label: "Prompt", state: promptReadinessState(scenePackage) },
  { key: "empty-scene", label: "Empty Scene", state: emptySceneState(scenePackage) },
  { key: "images", label: "Images", state: completeImagesState(scenePackage) },
  { key: "runs", label: "Runs", state: runState(scenePackage) },
  { key: "assembly", label: "Assembly", state: assemblyState(scenePackage) },
  { key: "final", label: "Final", state: finalState(scenePackage) },
];
```

- [ ] **Step 5: Implement prompt facts panels**

`PromptFactsPanel` shows:

```text
Character IP
Cast action
Character references
Target objects
Avoid objects
Spatial contract
Style references or confirmed no extra style reference
```

Do not render a generic free-text field named Character IP Binding. Use selection controls that consume Character IP and Reference Library records.

- [ ] **Step 6: Implement image and asset panels**

`EmptySceneImagesPanel` contains:

```text
Upload Empty Scene Image
Select as Empty Scene
Current Empty Scene badge
```

`CompleteSceneImagesPanel` contains:

```text
Upload Complete Scene Image
Send to Pipeline
Run status
```

`ChapterAssetPoolPanel` contains:

```text
Upload Scene Asset
Add from Run Asset
Unused / Used status
```

Do not render `Lock as Base`.

- [ ] **Step 7: Implement final panel**

`FinalScenePanel` contains a single primary action:

```text
Lock Final
```

Disable it unless Assembly Ready is true. The click handler must receive a composed PNG file from the assembly preview/export path and call `lockFinalChapterScene`.

- [ ] **Step 8: Delete old PromptVersion/ImageAttempt components**

Delete the files listed in the File Map after `rg` shows no imports. If a CSS class exists only for deleted components, remove it in the same task.

- [ ] **Step 9: Run frontend workspace tests**

Run: `npm --prefix frontend test -- --run chapter-workspace course-planner-routing`

Expected: PASS with the Studio page and no attempt-review route.

- [ ] **Step 10: Commit Task 5**

```bash
git add frontend/src/features/coursePlanner frontend/tests/coursePlanner
git diff --staged --check
git commit -m "feat: replace chapter workspace with scene studio"
```

---

### Task 6: Library Surfaces

**Files:**
- Create: `backend/art_pipeline/course_planner/library_routes.py`
- Modify: `backend/art_pipeline/course_planner/store_hierarchy.py`
- Modify: `backend/art_pipeline/course_planner/routes.py`
- Modify: `frontend/src/features/coursePlanner/api.ts`
- Create: `frontend/src/features/coursePlanner/components/CharacterIpPicker.tsx`
- Create: `frontend/src/features/coursePlanner/components/ReferenceLibraryPicker.tsx`
- Test: `backend/tests/course_planner/test_routes.py`
- Test: `frontend/tests/coursePlanner/course-planner-api.test.ts`
- Test: `frontend/tests/coursePlanner/chapter-workspace.test.tsx`

**Interfaces:**
- Produces:
  - `GET /api/course-planner/character-ips`
  - `POST /api/course-planner/character-ips`
  - `GET /api/course-planner/reference-library/images`
  - `POST /api/course-planner/reference-library/images`
  - `POST /api/course-planner/chapters/{chapterId}/scene-package/reference-selections`

- [ ] **Step 1: Write library route tests**

Add to `backend/tests/course_planner/test_routes.py`:

```python
def test_reference_library_upload_returns_reusable_image(client: TestClient) -> None:
    response = client.post(
        "/api/course-planner/reference-library/images",
        data={"notes": "团团角色参考"},
        files={"file": ("tuantuan.png", _png_bytes(width=64, height=64), "image/png")},
    )

    assert response.status_code == 200
    image = response.json()["referenceImage"]
    assert image["id"].startswith("reference_image_")
    assert image["width"] == 64
    assert image["status"] == "available"


def test_character_ip_uses_reference_library_ids(client: TestClient) -> None:
    response = client.post(
        "/api/course-planner/character-ips",
        json={
            "displayName": "团团",
            "visualInvariants": "圆脸，小学生，浅色睡衣",
            "personalityCues": "认真但轻松",
            "referenceImageIds": ["reference_image_001"],
        },
    )

    assert response.status_code == 200
    character = response.json()["characterIp"]
    assert character["display_name"] == "团团"
    assert character["reference_image_ids"] == ["reference_image_001"]
```

- [ ] **Step 2: Run tests and confirm routes are missing**

Run: `uv run --python 3.12 --extra dev pytest tests/course_planner/test_routes.py -q`

Expected: FAIL for missing library endpoints.

- [ ] **Step 3: Add store methods**

Add these store methods and path helpers:

```python
def _reference_library_root_path(self) -> Path:
    return self._resolve("reference_library")


def _reference_library_images_root_path(self) -> Path:
    return self._reference_library_root_path() / "images"


def _reference_library_image_path(self, image_id: str) -> Path:
    return self._reference_library_images_root_path() / validate_slug(image_id, "Reference image id") / "reference_image.json"


def _reference_library_image_media_path(self, image_id: str) -> Path:
    return self._reference_library_images_root_path() / validate_slug(image_id, "Reference image id") / "image.png"


def list_reference_library_images(self) -> list[ReferenceLibraryImage]:
    root = self._reference_library_images_root_path()
    if not root.exists():
        return []
    return [
        self._read_model(path, ReferenceLibraryImage)
        for path in sorted(root.glob("*/reference_image.json"))
    ]


def add_reference_library_image(
    self,
    *,
    image_bytes: bytes,
    original_filename: str,
    notes: str = "",
) -> ReferenceLibraryImage:
    width, height = read_scene_package_png_size(image_bytes, "Reference Library image")
    image_id = f"reference_image_{len(self.list_reference_library_images()) + 1:03d}"
    image = ReferenceLibraryImage(
        id=image_id,
        original_filename=sanitize_original_filename(original_filename),
        storage_path=f"reference_library/images/{image_id}/image.png",
        media_type="image/png",
        width=width,
        height=height,
        notes=notes,
        created_at=utc_now(),
    )
    self._write_bytes(self._reference_library_image_media_path(image_id), image_bytes)
    self._write_model(self._reference_library_image_path(image_id), image)
    return image


def _character_ip_root_path(self) -> Path:
    return self._resolve("character_ip_library", "characters")


def _character_ip_path(self, character_id: str) -> Path:
    return self._character_ip_root_path() / validate_slug(character_id, "Character IP id") / "character_ip.json"


def list_character_ips(self) -> list[CharacterIpProfile]:
    root = self._character_ip_root_path()
    if not root.exists():
        return []
    return [
        self._read_model(path, CharacterIpProfile)
        for path in sorted(root.glob("*/character_ip.json"))
    ]


def add_character_ip(self, payload: CharacterIpProfile | dict[str, object]) -> CharacterIpProfile:
    payload_data = payload.model_dump(mode="json") if isinstance(payload, CharacterIpProfile) else dict(payload)
    character_id = payload_data.get("id") or f"character_ip_{len(self.list_character_ips()) + 1:03d}"
    payload_data.update({"id": character_id, "created_at": payload_data.get("created_at") or utc_now()})
    character = CharacterIpProfile.model_validate(payload_data)
    self._write_model(self._character_ip_path(character.id), character)
    return character
```

Use the existing `_read_model`, `_write_model`, `_write_bytes`, PNG size, filename sanitizing, and slug validation helpers. The resulting storage paths are:

```text
reference_library/images/
character_ip_library/characters/
```

- [ ] **Step 4: Add route file and register it**

Create `library_routes.py` with a router prefix `/api/course-planner`. Register it in the same startup path that registers other Course Planner routes.

- [ ] **Step 5: Add frontend library API functions**

In `frontend/src/features/coursePlanner/api.ts`:

```typescript
export async function listCharacterIps(fetcher: CoursePlannerFetcher = fetch): Promise<CharacterIpProfile[]> {
  const payload = toCamel(await requestJson(fetcher, `${API_ROOT}/character-ips`, { method: "GET" }, "Could not load Character IPs."));
  return arrayFromPayload<CharacterIpProfile>(payload, "characterIps");
}

export async function uploadReferenceLibraryImage(
  file: File,
  input: { notes?: string } = {},
  fetcher: CoursePlannerFetcher = fetch,
): Promise<ReferenceLibraryImage> {
  const body = new FormData();
  body.append("file", file);
  appendOptionalStringField(body, "notes", input.notes);
  const payload = toCamel(await requestJson(fetcher, `${API_ROOT}/reference-library/images`, { method: "POST", body }, "Could not upload Reference Image."));
  return payloadValue<ReferenceLibraryImage>(payload, "referenceImage");
}
```

- [ ] **Step 6: Connect pickers to Studio**

`CharacterIpPicker` must render selectable existing characters and an action to add a new character. `ReferenceLibraryPicker` must render existing reference thumbnails and an upload action that creates a library image before selecting it for the chapter.

- [ ] **Step 7: Run library tests**

Run: `uv run --python 3.12 --extra dev pytest tests/course_planner/test_routes.py -q`

Run: `npm --prefix frontend test -- --run course-planner-api chapter-workspace`

Expected: PASS.

- [ ] **Step 8: Commit Task 6**

```bash
git add backend/art_pipeline/course_planner backend/tests/course_planner frontend/src/features/coursePlanner frontend/tests/coursePlanner
git diff --staged --check
git commit -m "feat: add character and reference libraries"
```

---

### Task 7: Final Cleanup And Verification

**Files:**
- Modify: `CONTEXT.md`
- Modify: `docs/superpowers/specs/2026-07-02-chapter-scene-package-design.md`
- Modify: any file that still contains old runtime terms from the gates below.

**Interfaces:**
- Consumes: all earlier tasks.
- Produces: clean runtime code and tests with one current workflow vocabulary.

- [ ] **Step 1: Run old runtime keyword gate**

Run:

```bash
rg -n "PromptVersion|ImageAttempt|prompt-versions|image-attempts|EmptyBaseSceneCandidate|locked_base_candidate_id|base_candidate_id|base_candidates|base-candidates|lockEmptyBaseScene|lock_empty_base_scene|Lock as Base|Tune Prompt|Prompt Package" backend/art_pipeline/course_planner backend/tests/course_planner frontend/src/features/coursePlanner frontend/tests/coursePlanner
```

Expected: no output.

- [ ] **Step 2: Run current vocabulary gate**

Run:

```bash
rg -n "Empty Scene Image|Final Chapter Scene|Character IP|Reference Library|Chapter Scene Studio" CONTEXT.md docs/superpowers/specs/2026-07-02-chapter-scene-package-design.md frontend/src/features/coursePlanner backend/art_pipeline/course_planner
```

Expected: output exists in docs and runtime code, proving the new vocabulary is present.

- [ ] **Step 3: Run backend tests**

Run: `uv run --python 3.12 --extra dev pytest tests/course_planner -q`

Expected: PASS.

- [ ] **Step 4: Run frontend tests and build**

Run: `npm --prefix frontend test -- --run course-planner`

Expected: PASS.

Run: `npm --prefix frontend run build`

Expected: PASS.

- [ ] **Step 5: Run script tests and diff hygiene**

Run: `npm run test:scripts`

Expected: PASS.

Run: `git diff --check`

Expected: no output.

- [ ] **Step 6: Commit Task 7**

```bash
git add CONTEXT.md docs/superpowers/specs/2026-07-02-chapter-scene-package-design.md backend/art_pipeline/course_planner backend/tests/course_planner frontend/src/features/coursePlanner frontend/tests/coursePlanner
git diff --staged --check
git commit -m "chore: clean obsolete course planner workflow"
```

---

## Self-Review Notes

- The plan removes old PromptVersion/ImageAttempt UI, state, backend routes, and tests instead of keeping compatibility entry points.
- The plan replaces locked base semantics with selected Empty Scene Image and Lock Final.
- The plan adds Reference Library and Character IP Library because prompt readiness cannot be truthful without visual identity sources.
- The plan treats direct Scene Asset Upload as a first-class lineage source.
- The plan keeps media storage, PNG validation, and filename handling behind existing helpers because those modules already have a useful interface.
- The final gates include runtime keyword scans to catch old buttons, events, routes, tests, and model fields before delivery.
