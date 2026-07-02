# Chapter Scene Package Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first production foundation for one `Chapter Scene Package` per Chapter: business models, file-backed storage, HTTP APIs, and frontend API/types. This phase intentionally does not build the tldraw Assembly Canvas UI.

**Architecture:** Keep the current Course Planner module and scene-library storage root. Add a new package-level domain model beside the existing legacy `PromptVersion` / `ImageAttempt` models, store it under each Chapter at `scene_package/`, and expose it through explicit Chapter-scoped endpoints. Existing old prompt/image routes remain available only for compatibility until the Studio UI migration removes them.

**Tech Stack:** Python, Pydantic, FastAPI, pytest, TypeScript, React feature types/API client, Vitest. Use existing file-store helpers, `Pillow`-backed image validation already present in the backend, and existing frontend fetch-test patterns.

---

## Scope Boundary

This is Phase 1. It creates the authority that later UI work will consume.

In scope:

- New `ChapterScenePackage` domain models.
- Lazy package creation on first read.
- Storage under the Chapter path:

```text
scene_packs/<category_id>/chapters/<chapter_id>/
  chapter.json
  scene_package/
    package.json
    references/
    base_candidates/
    complete_images/
    assets/
    assembly.json
```

- Prompt source and derived readiness.
- Target Object List owned by the package.
- Upload metadata for references, base candidates, and complete scene images.
- Manual lock/replace of the current Empty Base Scene.
- Complete image to pipeline run association metadata.
- Chapter Asset Pool metadata with lineage to run assets.
- Empty Assembly Manifest data contract and validators.
- Frontend TypeScript types and API client methods.

Out of scope:

- Image2 API integration.
- AI scoring/review for base candidates.
- tldraw canvas implementation.
- react-arborist Layer Tree UI.
- Run Asset Relationship Panel UI.
- PromptVersion/ImageAttempt UI deletion.
- Pipeline internals or art-pipeline run implementation.
- Manifest JSON export UI.
- Runtime/game integration.

---

## Non-Negotiable Product Rules

- A Chapter has one current `Chapter Scene Package`.
- The system never calls Image2; users copy prompts externally and upload generated images back.
- Prompt readiness and image upload are independent states.
- There is no prompt-version workflow in the new package. Uploaded images store prompt/reference snapshots.
- Base candidates are manually uploaded and manually locked. There is no score, review, or AI ranking.
- Complete Scene Images are uploaded manually and each may associate with one independent pipeline run.
- `docs/assets` reference images are never auto-imported.
- File storage names are generated IDs. Original filenames are metadata only.
- Replacing the locked base clears current assembly placements and marks old complete images/runs inactive or historical.
- Any delete/remove/replace/clear/unlink UI action will need second confirmation in later UI work. This foundation should expose explicit operations; it does not implement confirmation itself.
- Runtime manifest must be engine-agnostic and must not depend on a tldraw snapshot.
- Placement dependency IDs must reference placement IDs, never names.
- `layerOrder[0]` means frontmost, Photoshop-style.

---

## Current Patch Audit Requirement

Before implementation, run:

```powershell
git status --short
git diff -- backend/art_pipeline/course_planner frontend/src/features/coursePlanner backend/tests/course_planner frontend/tests/coursePlanner
```

Classify existing local changes:

- Keep existing `ScenePack -> Chapter` persistence if it still supports the new `Scene Category -> Chapter` naming migration.
- Do not expand legacy `PromptVersion` / `ImageAttempt` as a new source of truth.
- Do not add compatibility projections from legacy prompt versions into `ChapterScenePackage`.
- If a test only protects the old multi-prompt-version flow, leave it untouched in this phase unless it fails because of the new code. Deleting old workflow tests belongs to the Studio migration phase.
- Any failed or superseded local patch must be deleted or rewritten before adding another fallback.

---

## File Map

Backend create:

- `backend/art_pipeline/course_planner/scene_package_models.py`
  - Owns Pydantic models and pure validators for `ChapterScenePackage`.
- `backend/art_pipeline/course_planner/scene_package_store.py`
  - Owns Chapter-scoped package persistence, generated IDs, upload file writes, base replacement state transitions, and manifest writes.
- `backend/tests/course_planner/test_scene_package_models.py`
- `backend/tests/course_planner/test_scene_package_store.py`
- `backend/tests/course_planner/test_scene_package_routes.py`

Backend modify:

- `backend/art_pipeline/course_planner/store.py`
  - Mix in `CoursePlannerScenePackageStoreMixin`.
- `backend/art_pipeline/course_planner/routes.py`
  - Register new Chapter Scene Package routes or include a focused router from a new file if it keeps `routes.py` under control.
- `backend/art_pipeline/course_planner/api_models.py`
  - Add request models for prompt updates, uploads, locking base, run association, asset materialization, and manifest saves.
- `backend/tests/course_planner/route_test_helpers.py`
  - Add helper only if route tests need repeated package setup.

Frontend create or modify:

- `frontend/src/features/coursePlanner/types.ts`
  - Add Chapter Scene Package types.
- `frontend/src/features/coursePlanner/api.ts`
  - Add typed client functions.
- `frontend/tests/coursePlanner/course-planner-api.test.ts`
  - Add API contract tests for the new methods.

Do not add `*.test.*` files under runtime source directories.

---

## Domain Contract

Create these models in `scene_package_models.py`. Keep them separate from `models.py` to avoid making the already-large legacy planner model file a second mixed authority.

```python
class TargetObjectItem(CoursePlannerModel):
    id: str
    label: str = Field(min_length=1)
    description: str = ""
    priority: Literal["core", "required", "recommended"] = "required"


class ChapterScenePrompt(CoursePlannerModel):
    prompt_text: str = ""
    negative_constraints: str = ""
    style_notes: str = ""
    updated_at: str | None = None


class ImageReferenceSnapshot(CoursePlannerModel):
    reference_ids: list[str] = Field(default_factory=list)
    locked_base_candidate_id: str | None = None
    notes: str = ""


class ChapterSceneReference(CoursePlannerModel):
    id: str
    original_filename: str
    storage_path: str
    media_type: Literal["image/png"]
    created_at: str
    prompt_role: Literal["style", "scene", "character", "other"] = "other"
    notes: str = ""


class EmptyBaseSceneCandidate(CoursePlannerModel):
    id: str
    original_filename: str
    storage_path: str
    media_type: Literal["image/png"]
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    status: Literal["candidate", "locked", "inactive"] = "candidate"
    prompt_snapshot: str
    reference_snapshot: ImageReferenceSnapshot
    created_at: str
    locked_at: str | None = None


class CompleteSceneImage(CoursePlannerModel):
    id: str
    original_filename: str
    storage_path: str
    media_type: Literal["image/png"]
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    base_candidate_id: str
    status: Literal["active", "historical", "deleted"] = "active"
    prompt_snapshot: str
    reference_snapshot: ImageReferenceSnapshot
    variation_prompt: str = ""
    pipeline_run_id: str | None = None
    pipeline_run_status: str | None = None
    created_at: str


class ChapterAssetLineage(CoursePlannerModel):
    source_run_id: str
    source_run_asset_id: str
    source_complete_image_id: str | None = None


class ChapterAsset(CoursePlannerModel):
    id: str
    display_name: str = Field(min_length=1)
    original_filename: str
    storage_path: str
    media_type: Literal["image/png"]
    lineage: ChapterAssetLineage
    linked_target_object_id: str | None = None
    status: Literal["available", "removed"] = "available"
    created_at: str


class AssemblyTransform(CoursePlannerModel):
    cx: float = Field(ge=0, le=1)
    cy: float = Field(ge=0, le=1)
    w: float = Field(gt=0, le=1)
    h: float = Field(gt=0, le=1)
    rotation_deg: float = 0


class AssemblyPlacement(CoursePlannerModel):
    id: str
    asset_id: str
    display_name: str = Field(min_length=1)
    runtime_role: Literal["target", "initial"] = "target"
    transform: AssemblyTransform
    group_id: str | None = None
    requires_placed: list[str] = Field(default_factory=list)


class AssemblyGroup(CoursePlannerModel):
    id: str
    display_name: str = Field(min_length=1)
    placement_ids: list[str] = Field(default_factory=list)


class ChapterSceneAssemblyManifest(CoursePlannerModel):
    schema_version: Literal[1] = 1
    base_candidate_id: str | None = None
    base_size: dict[str, int] | None = None
    placements: list[AssemblyPlacement] = Field(default_factory=list)
    groups: list[AssemblyGroup] = Field(default_factory=list)
    layer_order: list[str] = Field(default_factory=list)
    updated_at: str | None = None


class ChapterScenePackage(CoursePlannerModel):
    chapter_id: str
    prompt: ChapterScenePrompt = Field(default_factory=ChapterScenePrompt)
    target_objects: list[TargetObjectItem] = Field(default_factory=list)
    references: list[ChapterSceneReference] = Field(default_factory=list)
    base_candidates: list[EmptyBaseSceneCandidate] = Field(default_factory=list)
    locked_base_candidate_id: str | None = None
    complete_images: list[CompleteSceneImage] = Field(default_factory=list)
    chapter_assets: list[ChapterAsset] = Field(default_factory=list)
    assembly: ChapterSceneAssemblyManifest = Field(default_factory=ChapterSceneAssemblyManifest)
```

Implementation notes:

- Reuse `CoursePlannerModel` from `models.py` for `extra="forbid"`.
- Keep IDs as generated strings, hidden from normal UI.
- Use `snake_case` in Python models. Existing FastAPI JSON can keep snake_case first; frontend mapping can use the same contract unless this repo already requires camelCase for new APIs.
- Add pure helper functions:
  - `is_prompt_ready(package: ChapterScenePackage) -> bool`
  - `build_base_prompt(package: ChapterScenePackage) -> str`
  - `build_complete_prompt(package: ChapterScenePackage) -> str`
  - `validate_assembly_manifest(package: ChapterScenePackage) -> list[str]`

The helper implementation should be small and testable. Do not create a broad `engine`, `manager`, or `coordinator` layer.

---

## Task 1: Model Tests And Validators

**Type:** Complex, TDD required.

**Purpose:** Lock down the new package invariants before storage/API code exists.

**Files:**

- Create: `backend/tests/course_planner/test_scene_package_models.py`
- Create: `backend/art_pipeline/course_planner/scene_package_models.py`

- [ ] Add tests for package default creation:

```python
def test_scene_package_defaults_to_empty_authoring_state():
    package = ChapterScenePackage(chapter_id="chapter_001")

    assert package.chapter_id == "chapter_001"
    assert package.locked_base_candidate_id is None
    assert package.prompt.prompt_text == ""
    assert package.target_objects == []
    assert package.assembly.placements == []
```

- [ ] Add tests for prompt readiness:

```python
def test_prompt_ready_requires_prompt_and_target_objects():
    package = ChapterScenePackage(
        chapter_id="chapter_001",
        prompt=ChapterScenePrompt(prompt_text="A clean bedroom base scene."),
        target_objects=[TargetObjectItem(id="target_001", label="book")],
    )

    assert is_prompt_ready(package)
```

```python
def test_prompt_not_ready_without_target_objects():
    package = ChapterScenePackage(
        chapter_id="chapter_001",
        prompt=ChapterScenePrompt(prompt_text="A clean bedroom base scene."),
    )

    assert not is_prompt_ready(package)
```

- [ ] Add tests for base and complete prompt projection:

```python
def test_complete_prompt_mentions_locked_base_reference():
    package = make_package_with_locked_base()

    prompt = build_complete_prompt(package)

    assert "locked empty base scene" in prompt.lower()
    assert package.locked_base_candidate_id in prompt
```

Keep the assertion semantic enough that copy editing does not constantly break tests.

- [ ] Add manifest validator tests:

```python
def test_manifest_rejects_dependency_cycles():
    package = make_package_with_two_placements(
        first_requires=["placement_b"],
        second_requires=["placement_a"],
    )

    errors = validate_assembly_manifest(package)

    assert any("cycle" in error.lower() for error in errors)
```

```python
def test_manifest_rejects_layer_order_missing_placement():
    package = make_package_with_one_placement(layer_order=["missing_placement"])

    errors = validate_assembly_manifest(package)

    assert any("layer_order" in error for error in errors)
```

- [ ] Run and confirm failing tests:

```powershell
python -m pytest backend/tests/course_planner/test_scene_package_models.py -q
```

- [ ] Implement models and helpers minimally.

- [ ] Re-run:

```powershell
python -m pytest backend/tests/course_planner/test_scene_package_models.py -q
```

Expected final result: pass.

---

## Task 2: Store Paths And Lazy Package Creation

**Type:** Complex, TDD required.

**Purpose:** Make the package a Chapter child resource with stable generated storage paths.

**Files:**

- Create: `backend/art_pipeline/course_planner/scene_package_store.py`
- Modify: `backend/art_pipeline/course_planner/store.py`
- Create: `backend/tests/course_planner/test_scene_package_store.py`

- [ ] Add store tests for lazy creation:

```python
def test_read_chapter_scene_package_lazily_creates_package(tmp_path):
    store, chapter = make_store_with_chapter(tmp_path)

    package = store.read_chapter_scene_package(chapter.id)

    assert package.chapter_id == chapter.id
    assert (tmp_path / "scene_packs" / chapter.scene_pack_id / "chapters" / chapter.id / "scene_package" / "package.json").exists()
```

- [ ] Add store tests for updating prompt and target objects:

```python
def test_update_scene_package_prompt_persists_prompt_and_targets(tmp_path):
    store, chapter = make_store_with_chapter(tmp_path)

    package = store.update_chapter_scene_prompt(
        chapter.id,
        prompt_text="A low-shadow bedroom base scene.",
        negative_constraints="No hard shadows.",
        target_objects=[{"label": "book"}, {"label": "pencil"}],
    )

    reloaded = store.read_chapter_scene_package(chapter.id)
    assert package.prompt.prompt_text == reloaded.prompt.prompt_text
    assert [item.label for item in reloaded.target_objects] == ["book", "pencil"]
```

- [ ] Add path helpers in the mixin:

```python
class CoursePlannerScenePackageStoreMixin:
    def _scene_package_root_path(self, scene_pack_id: str, chapter_id: str) -> Path: ...
    def _scene_package_json_path(self, scene_pack_id: str, chapter_id: str) -> Path: ...
    def _scene_package_assembly_path(self, scene_pack_id: str, chapter_id: str) -> Path: ...
    def _scene_package_media_dir(self, scene_pack_id: str, chapter_id: str, kind: str) -> Path: ...
```

- [ ] Use `_find_chapter(chapter_id)` from the existing hierarchy store to resolve the owning `scene_pack_id`.

- [ ] Add public store methods:

```python
def read_chapter_scene_package(self, chapter_id: str) -> ChapterScenePackage: ...
def update_chapter_scene_prompt(
    self,
    chapter_id: str,
    *,
    prompt_text: str,
    negative_constraints: str = "",
    style_notes: str = "",
    target_objects: list[dict[str, str]] | None = None,
) -> ChapterScenePackage: ...
def write_chapter_scene_package(self, package: ChapterScenePackage) -> ChapterScenePackage: ...
```

- [ ] Mix the store into `CoursePlannerStore`:

```python
class CoursePlannerStore(
    CoursePlannerHierarchyStoreMixin,
    CoursePlannerScenePackageStoreMixin,
):
    ...
```

Use the existing import order/style in `store.py`.

- [ ] Add a short Chinese WHY comment where lazy creation writes `package.json`: the package is naturally present for every Chapter, and writing on first read gives later upload APIs a stable directory without making Chapter creation do media setup.

- [ ] Run:

```powershell
python -m pytest backend/tests/course_planner/test_scene_package_store.py -q
```

Expected final result: pass.

---

## Task 3: Image Upload Storage

**Type:** Complex, TDD required.

**Purpose:** Persist uploaded references, base candidates, and complete images without trusting original filenames.

**Files:**

- Modify: `backend/art_pipeline/course_planner/scene_package_store.py`
- Modify: `backend/tests/course_planner/test_scene_package_store.py`

- [ ] Add tests for reference upload:

```python
def test_add_scene_reference_generates_storage_name(tmp_path):
    store, chapter = make_store_with_chapter(tmp_path)
    image_bytes = make_png_bytes(width=16, height=12)

    package = store.add_chapter_scene_reference(
        chapter.id,
        image_bytes=image_bytes,
        original_filename="ChatGPT Image Jul 1.png",
        prompt_role="style",
        notes="reference only",
    )

    reference = package.references[0]
    assert reference.original_filename == "ChatGPT Image Jul 1.png"
    assert reference.storage_path.startswith("references/")
    assert "ChatGPT Image" not in reference.storage_path
```

- [ ] Add tests for base candidate upload:

```python
def test_add_base_candidate_captures_prompt_and_reference_snapshot(tmp_path):
    store, chapter = make_store_with_prompt_and_reference(tmp_path)
    image_bytes = make_png_bytes(width=120, height=80)

    package = store.add_empty_base_scene_candidate(
        chapter.id,
        image_bytes=image_bytes,
        original_filename="base.png",
        prompt_snapshot=None,
        reference_ids=[package_reference_id],
    )

    candidate = package.base_candidates[0]
    assert candidate.width == 120
    assert candidate.height == 80
    assert candidate.prompt_snapshot
    assert candidate.reference_snapshot.reference_ids == [package_reference_id]
```

- [ ] Add tests for complete image upload requiring a locked base:

```python
def test_complete_image_requires_locked_base(tmp_path):
    store, chapter = make_store_with_chapter(tmp_path)

    with pytest.raises(ValueError, match="locked base"):
        store.add_complete_scene_image(
            chapter.id,
            image_bytes=make_png_bytes(),
            original_filename="complete.png",
            prompt_snapshot=None,
            reference_ids=[],
            variation_prompt="",
        )
```

- [ ] Add store methods:

```python
def add_chapter_scene_reference(...) -> ChapterScenePackage: ...
def add_empty_base_scene_candidate(...) -> ChapterScenePackage: ...
def add_complete_scene_image(...) -> ChapterScenePackage: ...
def read_chapter_scene_package_media(self, chapter_id: str, kind: str, media_id: str) -> tuple[Path, str]: ...
```

- [ ] First version should accept PNG only, using the existing backend image validation pattern. If JPEG/WebP support is needed later, add one centralized validator instead of duplicating extension checks in routes.

- [ ] Ensure `storage_path` is a POSIX-style package-relative path such as `base_candidates/base_candidate_001.png`.

- [ ] Do not use original filenames for disk paths.

- [ ] Run:

```powershell
python -m pytest backend/tests/course_planner/test_scene_package_store.py -q
```

Expected final result: pass.

---

## Task 4: Base Lock And Replacement Semantics

**Type:** Complex, TDD required.

**Purpose:** Encode the product rule that the locked base is replaceable but replacement clears current assembly placements and makes old complete images historical.

**Files:**

- Modify: `backend/art_pipeline/course_planner/scene_package_store.py`
- Modify: `backend/tests/course_planner/test_scene_package_store.py`

- [ ] Add tests:

```python
def test_lock_base_candidate_sets_current_base(tmp_path):
    store, chapter, candidate = make_store_with_base_candidate(tmp_path)

    package = store.lock_empty_base_scene(chapter.id, candidate.id)

    assert package.locked_base_candidate_id == candidate.id
    assert package.base_candidates[0].status == "locked"
    assert package.assembly.base_candidate_id == candidate.id
```

```python
def test_replacing_base_historicizes_complete_images_and_clears_placements(tmp_path):
    store, chapter, old_candidate, new_candidate = make_store_with_locked_base_and_assembly(tmp_path)

    package = store.lock_empty_base_scene(chapter.id, new_candidate.id)

    assert package.locked_base_candidate_id == new_candidate.id
    assert all(image.status == "historical" for image in package.complete_images)
    assert package.assembly.placements == []
    assert package.assembly.layer_order == []
```

- [ ] Add method:

```python
def lock_empty_base_scene(self, chapter_id: str, candidate_id: str) -> ChapterScenePackage: ...
```

- [ ] Behavior:

- First lock:
  - Target candidate becomes `locked`.
  - Other base candidates stay `candidate`.
  - `assembly.base_candidate_id` and `assembly.base_size` are set from the candidate.

- Replacement:
  - Old locked candidate becomes `inactive`.
  - Target candidate becomes `locked`.
  - Active complete images tied to the old base become `historical`.
  - Assembly placements, groups, and layer order are cleared.
  - Chapter assets remain in the package. Do not delete or mutate asset files.

- [ ] Add a Chinese WHY comment near the replacement write: base replacement changes the spatial contract, so existing placements cannot remain authoritative.

- [ ] Run:

```powershell
python -m pytest backend/tests/course_planner/test_scene_package_store.py -q
```

Expected final result: pass.

---

## Task 5: Complete Image Run Associations And Chapter Assets

**Type:** Complex, TDD required.

**Purpose:** Store the relationship between external pipeline runs and the chapter-owned asset pool without making runs the owner of chapter data.

**Files:**

- Modify: `backend/art_pipeline/course_planner/scene_package_store.py`
- Modify: `backend/tests/course_planner/test_scene_package_store.py`

- [ ] Add tests for run association:

```python
def test_associate_complete_image_with_pipeline_run(tmp_path):
    store, chapter, image = make_store_with_complete_image(tmp_path)

    package = store.associate_complete_image_run(
        chapter.id,
        image.id,
        run_id="run_123",
        run_status="completed",
    )

    updated = package.complete_images[0]
    assert updated.pipeline_run_id == "run_123"
    assert updated.pipeline_run_status == "completed"
```

- [ ] Add tests for materializing a run asset:

```python
def test_add_chapter_asset_from_run_asset_materializes_copy(tmp_path):
    store, chapter, image = make_store_with_complete_image(tmp_path)

    package = store.add_chapter_asset_from_run_asset(
        chapter.id,
        source_run_id="run_123",
        source_run_asset_id="asset_456",
        source_complete_image_id=image.id,
        image_bytes=make_png_bytes(width=32, height=32),
        original_filename="book.png",
        display_name="book",
    )

    asset = package.chapter_assets[0]
    assert asset.display_name == "book"
    assert asset.lineage.source_run_id == "run_123"
    assert asset.lineage.source_run_asset_id == "asset_456"
    assert asset.storage_path.startswith("assets/")
```

- [ ] Add methods:

```python
def associate_complete_image_run(
    self,
    chapter_id: str,
    complete_image_id: str,
    *,
    run_id: str,
    run_status: str | None,
) -> ChapterScenePackage: ...

def add_chapter_asset_from_run_asset(...) -> ChapterScenePackage: ...
```

- [ ] Enforce at most one direct added relationship from the same `source_run_asset_id` to the current chapter. If a user needs two copies, later UI should call Duplicate Chapter Asset, not re-add the same source relationship.

- [ ] Do not read or mutate `workspace/runs/<run_id>` internals here. This API stores lineage and copied media only.

- [ ] Run:

```powershell
python -m pytest backend/tests/course_planner/test_scene_package_store.py -q
```

Expected final result: pass.

---

## Task 6: Assembly Manifest Persistence

**Type:** Complex, TDD required.

**Purpose:** Make the manifest a business contract that can later be edited by tldraw but is not a tldraw document.

**Files:**

- Modify: `backend/art_pipeline/course_planner/scene_package_store.py`
- Modify: `backend/tests/course_planner/test_scene_package_store.py`

- [ ] Add tests:

```python
def test_save_assembly_manifest_persists_valid_manifest(tmp_path):
    store, chapter, asset = make_store_with_chapter_asset(tmp_path)
    manifest = make_manifest(asset_id=asset.id)

    package = store.save_chapter_scene_assembly(chapter.id, manifest)

    assert package.assembly.placements[0].asset_id == asset.id
    assert package.assembly.layer_order == [package.assembly.placements[0].id]
```

```python
def test_save_assembly_manifest_rejects_missing_asset(tmp_path):
    store, chapter = make_store_with_chapter(tmp_path)

    with pytest.raises(ValueError, match="asset"):
        store.save_chapter_scene_assembly(chapter.id, make_manifest(asset_id="missing"))
```

- [ ] Add method:

```python
def save_chapter_scene_assembly(
    self,
    chapter_id: str,
    manifest: ChapterSceneAssemblyManifest,
) -> ChapterScenePackage: ...
```

- [ ] Validation rules:

- `manifest.base_candidate_id` must match the current locked base if placements exist.
- Every placement `asset_id` must reference an available `ChapterAsset`.
- Every `requires_placed` ID must reference another placement in the same manifest.
- No dependency cycles.
- `layer_order` must contain each placement ID exactly once.
- `layer_order[0]` is frontmost; do not sort it automatically.
- Groups may reference placement IDs only. No nested groups in Phase 1.

- [ ] Save both `package.json` and `assembly.json` if the project wants a separate assembly file for easier static export. `package.json` remains the package summary authority; `assembly.json` may mirror the assembly portion for export convenience.

- [ ] Add a Chinese WHY comment explaining why the manifest validator checks business IDs and not editor shape IDs.

- [ ] Run:

```powershell
python -m pytest backend/tests/course_planner/test_scene_package_models.py backend/tests/course_planner/test_scene_package_store.py -q
```

Expected final result: pass.

---

## Task 7: HTTP API

**Type:** Complex, TDD required.

**Purpose:** Expose the package through explicit Chapter-scoped APIs without adding Image2 or scoring endpoints.

**Files:**

- Modify: `backend/art_pipeline/course_planner/api_models.py`
- Modify: `backend/art_pipeline/course_planner/routes.py`
- Create or modify: `backend/tests/course_planner/test_scene_package_routes.py`

- [ ] Add request models:

```python
class TargetObjectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str = Field(min_length=1)
    description: str = ""
    priority: Literal["core", "required", "recommended"] = "required"


class ChapterScenePromptPatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt_text: str = Field(alias="promptText")
    negative_constraints: str = Field(default="", alias="negativeConstraints")
    style_notes: str = Field(default="", alias="styleNotes")
    target_objects: list[TargetObjectRequest] = Field(default_factory=list, alias="targetObjects")


class CompleteSceneImageRunPatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    run_id: str = Field(alias="runId", min_length=1)
    run_status: str | None = Field(default=None, alias="runStatus")
```

Use `populate_by_name=True` only if existing tests need snake_case input as well.

- [ ] Add route tests:

```python
def test_get_scene_package_lazily_creates_package(client):
    chapter = create_chapter(client)

    response = client.get(f"/api/course-planner/chapters/{chapter['id']}/scene-package")

    assert response.status_code == 200
    assert response.json()["scenePackage"]["chapter_id"] == chapter["id"]
```

```python
def test_patch_scene_package_prompt_updates_prompt_and_targets(client):
    chapter = create_chapter(client)

    response = client.patch(
        f"/api/course-planner/chapters/{chapter['id']}/scene-package/prompt",
        json={
            "promptText": "Low-shadow room scene.",
            "negativeConstraints": "No strong shadows.",
            "targetObjects": [{"label": "book"}],
        },
    )

    assert response.status_code == 200
    assert response.json()["scenePackage"]["target_objects"][0]["label"] == "book"
```

```python
def test_upload_complete_image_without_locked_base_returns_409(client):
    chapter = create_chapter(client)

    response = client.post(
        f"/api/course-planner/chapters/{chapter['id']}/scene-package/complete-images",
        files={"file": ("complete.png", make_png_bytes(), "image/png")},
    )

    assert response.status_code == 409
```

- [ ] Add endpoints:

```text
GET    /api/course-planner/chapters/{chapterId}/scene-package
PATCH  /api/course-planner/chapters/{chapterId}/scene-package/prompt
POST   /api/course-planner/chapters/{chapterId}/scene-package/references
DELETE /api/course-planner/chapters/{chapterId}/scene-package/references/{referenceId}
POST   /api/course-planner/chapters/{chapterId}/scene-package/base-candidates
DELETE /api/course-planner/chapters/{chapterId}/scene-package/base-candidates/{candidateId}
POST   /api/course-planner/chapters/{chapterId}/scene-package/base-candidates/{candidateId}/lock
POST   /api/course-planner/chapters/{chapterId}/scene-package/complete-images
DELETE /api/course-planner/chapters/{chapterId}/scene-package/complete-images/{completeImageId}
PATCH  /api/course-planner/chapters/{chapterId}/scene-package/complete-images/{completeImageId}/run
PUT    /api/course-planner/chapters/{chapterId}/scene-package/assembly
GET    /api/course-planner/chapters/{chapterId}/scene-package/media/{mediaKind}/{mediaId}
```

- [ ] Return shapes should be consistent:

```json
{ "scenePackage": { "...": "..." } }
```

For media route, resolve the path by metadata ID and return `FileResponse`. Do not expose arbitrary relative paths to the request.

- [ ] Status code guidance:

- `404`: chapter/package child resource not found.
- `400`: invalid request shape or invalid image bytes.
- `409`: business precondition failure, such as uploading complete image without locked base, deleting an in-use asset, or locking a missing candidate.

- [ ] Delete endpoints in this foundation may be soft-delete/status transitions where domain requires history. They still represent destructive user actions and later UI must wrap them in confirmation.

- [ ] Run:

```powershell
python -m pytest backend/tests/course_planner/test_scene_package_routes.py -q
```

Expected final result: pass.

---

## Task 8: Frontend Types And API Client

**Type:** Moderate, test first where practical.

**Purpose:** Give the later Studio UI a typed client without binding it to legacy prompt/image attempts.

**Files:**

- Modify: `frontend/src/features/coursePlanner/types.ts`
- Modify: `frontend/src/features/coursePlanner/api.ts`
- Modify: `frontend/tests/coursePlanner/course-planner-api.test.ts`

- [ ] Add TypeScript types matching the API response. Keep names aligned with the domain glossary:

```ts
export type RuntimeRole = "target" | "initial";

export interface ChapterScenePackage {
  chapter_id: string;
  prompt: ChapterScenePrompt;
  target_objects: TargetObjectItem[];
  references: ChapterSceneReference[];
  base_candidates: EmptyBaseSceneCandidate[];
  locked_base_candidate_id: string | null;
  complete_images: CompleteSceneImage[];
  chapter_assets: ChapterAsset[];
  assembly: ChapterSceneAssemblyManifest;
}
```

- [ ] Add API methods:

```ts
export async function fetchChapterScenePackage(chapterId: string): Promise<ChapterScenePackage>;
export async function updateChapterScenePrompt(chapterId: string, input: ChapterScenePromptInput): Promise<ChapterScenePackage>;
export async function uploadChapterSceneReference(chapterId: string, file: File, input?: ReferenceUploadInput): Promise<ChapterScenePackage>;
export async function uploadEmptyBaseSceneCandidate(chapterId: string, file: File, input?: BaseCandidateUploadInput): Promise<ChapterScenePackage>;
export async function lockEmptyBaseScene(chapterId: string, candidateId: string): Promise<ChapterScenePackage>;
export async function uploadCompleteSceneImage(chapterId: string, file: File, input?: CompleteImageUploadInput): Promise<ChapterScenePackage>;
export async function associateCompleteImageRun(chapterId: string, completeImageId: string, input: RunAssociationInput): Promise<ChapterScenePackage>;
export async function saveChapterSceneAssembly(chapterId: string, manifest: ChapterSceneAssemblyManifest): Promise<ChapterScenePackage>;
```

- [ ] Use `FormData` for upload APIs. Include JSON fields as string fields, not as filename-derived data.

- [ ] Add Vitest tests that assert URLs, HTTP verbs, and multipart/json body creation:

```ts
it("fetches a chapter scene package", async () => {
  fetchMock.mockResolvedValueOnce(jsonResponse({ scenePackage: packageFixture }));

  const result = await fetchChapterScenePackage("chapter_001");

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/course-planner/chapters/chapter_001/scene-package",
    expect.objectContaining({ method: "GET" }),
  );
  expect(result.chapter_id).toBe("chapter_001");
});
```

- [ ] Do not wire these methods into existing pages yet unless needed for compile. The UI migration belongs to the next phase.

- [ ] Run:

```powershell
cd frontend
npm test -- course-planner-api.test.ts
npm run build
```

If this repo uses a different local package manager in practice, use the current lockfile/package-manager convention, but do not inspect `node_modules`.

Expected final result: tests and build pass.

---

## Task 9: Compatibility And State Boundary

**Type:** Moderate.

**Purpose:** Keep the app stable while introducing the new authority.

**Files:**

- Modify only if required: `frontend/src/features/coursePlanner/api.ts`
- Modify only if required: `frontend/src/features/coursePlanner/hooks/useCoursePlannerState.ts`
- Modify only if required: existing backend state route tests.

- [ ] Do not add `scenePackages` to `/api/course-planner/state` unless a current page needs it. Lazy package reads are acceptable and simpler for this phase.

- [ ] Do not derive `ChapterScenePackage` from `PromptVersion`.

- [ ] Do not make `PromptVersion` point back to `ChapterScenePackage`.

- [ ] If current tests require state normalization updates, add an optional `scenePackagesByChapterId` map that is populated only from explicit package API responses.

- [ ] Keep old PromptVersion/ImageAttempt APIs compiling until the Studio UI migration removes them. Mark any newly touched legacy code with a short comment only when there is a real compatibility reason.

- [ ] Run existing focused tests:

```powershell
python -m pytest backend/tests/course_planner/test_routes.py backend/tests/course_planner/test_store.py -q
cd frontend
npm test -- course-planner
```

Expected final result: existing Course Planner behavior remains green.

---

## Task 10: Final Verification

**Type:** Verification.

Run from repo root unless the command changes directory explicitly:

```powershell
python -m pytest \
  backend/tests/course_planner/test_scene_package_models.py \
  backend/tests/course_planner/test_scene_package_store.py \
  backend/tests/course_planner/test_scene_package_routes.py \
  backend/tests/course_planner/test_models.py \
  backend/tests/course_planner/test_store.py \
  backend/tests/course_planner/test_routes.py \
  -q
```

```powershell
cd frontend
npm test -- course-planner
npm run build
```

```powershell
git diff --check
git status --short
```

Manual smoke target after backend/frontend are connected:

- Open the existing Course Planner page.
- Select a Chapter.
- Call or trigger `GET /chapters/{chapterId}/scene-package`.
- Verify an empty package is created and the old pages still load.
- Upload endpoints can be exercised with route tests in this phase; no UI upload smoke is required until the Studio phase.

---

## Handoff Notes For Next Phase

Once this foundation is merged, the next implementation plan should be `Chapter Scene Studio UI` and should include:

- Studio layout with progress rail: `Prompt / Base / Images / Runs / Assembly`.
- Prompt editor with copy-ready Base Prompt and Complete Prompt.
- Reference upload/list management.
- Base candidate batch upload, preview, and lock/replace confirmation.
- Complete image batch upload and send-to-pipeline action.
- Run Asset Relationship Panel using active/historical views.
- Chapter Asset Pool and Assembly Layer Tree.
- tldraw Assembly Canvas.
- Deletion/replacement confirmation with the existing confirmation pattern.
- Old PromptVersion/ImageAttempt UI removal.
