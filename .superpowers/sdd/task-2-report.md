# Task 2 Report: Backend Store And Routes for Chapter Scene Studio

## Scope

- Backend scene-package store, media-store, delete-store, routes, errors, request models
- Backend scene-package tests and shared test helpers
- No frontend edits
- No compatibility aliases reintroduced into `scene_package_models.py`

## Red Reproduction

I reproduced the provided collection failure before implementation:

```text
ImportError: cannot import name 'ChapterSceneReference' from art_pipeline.course_planner.scene_package_models
```

This came from `scene_package_media_store.py` still importing the removed Task 1 model names.

## What Changed

### 1. Store/media-store migrated to the Task 1 model surface

- Replaced legacy `base_candidates` flow with `empty_scene_images`
- Replaced `locked_base_candidate_id` flow with `current_empty_scene_image_id`
- Replaced `base_candidate_id` snapshots with `empty_scene_image_id`
- Replaced `variation_prompt` with `generation_note`
- Added `add_empty_scene_image(...)`
- Added `select_empty_scene_image(...)`
- Updated `add_complete_scene_image(...)` so complete uploads do not require a selected Empty Scene Image
- Added `add_direct_chapter_asset(...)` with `ChapterAssetLineage(source_kind="direct_upload")`
- Fixed run-asset uploads to emit `ChapterAssetLineage(source_kind="pipeline_run_asset", ...)`
- Added `lock_final_chapter_scene(...)` with required preconditions:
  - selected Empty Scene Image required
  - at least one placed Scene Asset required

### 2. Delete store migrated off legacy empty-base semantics

- Replaced empty-base deletion with empty-scene-image deletion
- Empty Scene deletion now rejects when the image is still in use by:
  - current selection
  - assembly
  - complete images
  - final scene

### 3. Routes migrated to the new endpoints/contracts

- Added `POST /scene-package/empty-scene-images`
- Added `DELETE /scene-package/empty-scene-images/{imageId}`
- Added `POST /scene-package/current-empty-scene`
- Updated complete image upload to read:
  - `referenceImageIds`
  - `generationNote`
- Added `POST /scene-package/chapter-assets/direct-upload`
- Added `POST /scene-package/final-scene`
- Removed runtime/test usage of legacy `/base-candidates`, `/lock`, and `variationPrompt`

### 4. Prompt patch contract aligned to Task 1 fields

`ChapterScenePromptPatchRequest` and store handling now speak the real Task 1 model shape:

- `promptText`
- `sceneSpatialContract`
- `targetObjects`
- `avoidObjects`
- `promptConfirmations`
- `referenceSelections`

This also removed the stale store logic that still referenced `negative_constraints` and `style_notes`.

### 5. Tests rewritten to the new runtime surface

Rewrote backend scene-package tests/helpers so they validate:

- empty-scene upload/select flows
- complete uploads with/without selected Empty Scene Image
- direct asset upload lineage
- assembly validation against `current_empty_scene_image_id`
- final-scene lock preconditions and snapshot persistence
- prompt patch behavior on the new Task 1 fields

## Verification

### Required pytest command

Passed:

```bash
cd /Users/guojunxi/Desktop/work/art-pipeline-design/backend && \
uv run --python 3.12 --extra dev pytest \
  tests/course_planner/test_scene_package_models.py \
  tests/course_planner/test_scene_package_prompt_projection.py \
  tests/course_planner/test_scene_package_assembly_validation.py \
  tests/course_planner/test_scene_package_store_media.py \
  tests/course_planner/test_scene_package_store_lifecycle.py \
  tests/course_planner/test_scene_package_routes_complete_assets.py \
  tests/course_planner/test_scene_package_routes_assembly_media_delete.py \
  tests/course_planner/test_scene_package_routes_prompt.py \
  tests/course_planner/test_models.py -q
```

Result: `106 passed`

### Legacy-name grep

Ran:

```bash
rg -n "ChapterSceneReference|EmptyBaseSceneCandidate|build_base_prompt|locked_base|base_candidate|base_candidates|base-candidates|variationPrompt|variation_prompt|lock_empty_base_scene|/lock" \
  backend/art_pipeline/course_planner backend/tests/course_planner
```

Result: no output

### File length guard

Checked with `wc -l`. All created/substantially grown files are `<= 500` lines.

Largest touched files:

- `backend/tests/course_planner/test_scene_package_store_media.py` -> 406
- `backend/art_pipeline/course_planner/scene_package_media_store.py` -> 400
- `backend/art_pipeline/course_planner/scene_package_routes.py` -> 367

### Patch hygiene

Passed:

```bash
git diff --check
```

## Notes / Concerns

- I intentionally did **not** edit frontend contracts in this task because the task boundary explicitly said not to edit frontend, even though the larger migration will eventually need frontend to stop sending `variationPrompt`.
- I removed backend runtime/test dependence on chapter-local scene-package reference uploads; prompt/reference snapshots now validate against `reference_selections` on the chapter package instead of recreating a separate image authority here.

## Task Reviewer Findings Requiring Fix

Critical:
- `referenceSelections` currently allow raw ids into the scene-package prompt patch contract before Task 6 Reference Library routes exist, but default prompt snapshots call projection without library payloads. This breaks empty-scene upload, complete upload, and Lock Final after selections exist.

Important:
- Remove durable chapter-local `ChapterReferenceSelection.notes`; chapter package should store selected library image id and role only, not a second reference fact lane.
- Add tests proving default upload/Lock Final do not break after prompt patch, and do not accept unverified referenceSelections before library validation exists.

## Reviewer Rejection Fix (2026-07-03)

### Fix Summary

- Removed `referenceSelections` from the Task 2 prompt PATCH request contract and route-to-store update path.
- Removed durable `ChapterReferenceSelection.notes`; chapter-local selection now stores only `reference_image_id` and `prompt_role`.
- Kept `reference_selections` in the scene-package model/prompt projection for future Task 6 validated library data, but stopped accepting raw prompt-patch writes before that library authority exists.
- Added tests proving:
  - prompt PATCH rejects `referenceSelections`
  - prompt PATCH without `referenceSelections` still supports default prompt snapshots for empty-scene upload, complete-image upload, and Lock Final
  - no prompt-route/store test asserts arbitrary raw `referenceSelections` acceptance

### Files Changed

- `backend/art_pipeline/course_planner/api_models.py`
- `backend/art_pipeline/course_planner/scene_package_models.py`
- `backend/art_pipeline/course_planner/scene_package_routes.py`
- `backend/art_pipeline/course_planner/scene_package_store.py`
- `backend/tests/course_planner/scene_package_store_helpers.py`
- `backend/tests/course_planner/test_scene_package_models.py`
- `backend/tests/course_planner/test_scene_package_routes_prompt.py`
- `backend/tests/course_planner/test_scene_package_store_lifecycle.py`
- `backend/tests/course_planner/test_scene_package_store_media.py`

### Tests / Results

- Required pytest suite:

```bash
cd /Users/guojunxi/Desktop/work/art-pipeline-design/backend && \
uv run --python 3.12 --extra dev pytest \
  tests/course_planner/test_scene_package_models.py \
  tests/course_planner/test_scene_package_prompt_projection.py \
  tests/course_planner/test_scene_package_assembly_validation.py \
  tests/course_planner/test_scene_package_store_media.py \
  tests/course_planner/test_scene_package_store_lifecycle.py \
  tests/course_planner/test_scene_package_routes_complete_assets.py \
  tests/course_planner/test_scene_package_routes_assembly_media_delete.py \
  tests/course_planner/test_scene_package_routes_prompt.py \
  tests/course_planner/test_models.py -q
```

Result: `109 passed`

- Red-first targeted check before implementation:
  - `referenceSelections` prompt PATCH rejection test failed with `200`
  - `ChapterReferenceSelection` notes-lane rejection test failed because model still accepted `notes`

### Grep Gate

Ran:

```bash
rg -n "notes|referenceSelections|reference_selections" \
  backend/art_pipeline/course_planner/api_models.py \
  backend/art_pipeline/course_planner/scene_package_store.py \
  backend/art_pipeline/course_planner/scene_package_routes.py \
  backend/tests/course_planner/test_scene_package_routes_prompt.py \
  backend/art_pipeline/course_planner/scene_package_models.py \
  backend/art_pipeline/course_planner/scene_package_prompt_projection.py
```

Remaining output is expected and limited to:

- route test rejection coverage for `referenceSelections`
- durable `reference_selections` model/projection reads reserved for Task 6 validated library data
- unrelated `notes` fields on `ScenePack`, `ChapterSeed.style_notes`, `ImageReferenceSnapshot.notes`, and `ReferenceLibraryImage.notes`
- legacy explanatory comments mentioning `notes` as a removed compatibility lane

No remaining hit shows prompt PATCH/API/store accepting chapter-local `referenceSelections.notes`, and no request model exposes `referenceSelections`.

### Legacy-Name Gate

Ran:

```bash
rg -n "ChapterSceneReference|EmptyBaseSceneCandidate|build_base_prompt|locked_base|base_candidate|base_candidates|base-candidates|variationPrompt|variation_prompt|lock_empty_base_scene|/lock" \
  backend/art_pipeline/course_planner backend/tests/course_planner
```

Result: no output

### File Length Guard

Ran `wc -l` on touched files. All remained `<= 500` lines.

- `backend/art_pipeline/course_planner/api_models.py` -> 161
- `backend/art_pipeline/course_planner/scene_package_models.py` -> 218
- `backend/art_pipeline/course_planner/scene_package_routes.py` -> 350
- `backend/art_pipeline/course_planner/scene_package_store.py` -> 278
- `backend/tests/course_planner/scene_package_store_helpers.py` -> 244
- `backend/tests/course_planner/test_scene_package_models.py` -> 255
- `backend/tests/course_planner/test_scene_package_routes_prompt.py` -> 310
- `backend/tests/course_planner/test_scene_package_store_lifecycle.py` -> 253
- `backend/tests/course_planner/test_scene_package_store_media.py` -> 404

### Patch Hygiene

Ran:

```bash
git diff --check
```

Result: no output

### Concerns

- `reference_selections` still exists as durable model state and prompt-projection input by design, because Task 6 will own validated library writes later. This fix intentionally avoids adding any temporary fallback or raw-id prompt projection before that route exists.
