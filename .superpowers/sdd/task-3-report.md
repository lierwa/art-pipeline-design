# Task 3 Report: Remove PromptVersion And ImageAttempt Backend Runtime

## Scope

- Removed backend-only PromptVersion/ImageAttempt runtime from Course Planner.
- Kept ScenePack, Chapter CRUD, candidate generation, scene-package routes/store, and scene-version import-to-pipeline behavior working.
- Did not touch frontend.

## Changes

### 1. Runtime model and route removal

- Removed PromptVersion, ImageAttemptReview, ImageAttempt, and adopted prompt-version state from backend course-planner models.
- Removed `/prompt-versions*` and `/image-attempts*` backend routes.
- Simplified `/api/course-planner/state` to return only:
  - `scenePacks`
  - `chapters`
  - `tasks`

### 2. Persistence/store cleanup

- Rewrote `store_hierarchy.py` to keep only ScenePack/Chapter hierarchy persistence.
- Removed prompt/image-specific store methods, ids, and path helpers.
- Kept archive semantics for ScenePack so Chapter + scene-package subtree still remains recoverable.

### 3. AI/runtime cleanup

- Rewrote `ai_tasks.py` to keep only chapter-candidate generation AI behavior and shared AI task record helpers.
- Removed prompt-generation/review output types and old prompt-review task flow.
- Removed legacy prompt-builder backend module and its tests because it only served the deleted runtime.

### 4. Import behavior cleanup

- Rewrote `import_to_pipeline.py` to keep only locked scene-version import.
- Removed image-attempt import lineage/runtime.

### 5. Test cleanup

- Added the required red test asserting `/state` no longer exposes prompt/image runtime fields.
- Rewrote backend route/store/AI/model/import tests so they protect remaining ScenePack/Chapter and scene-version behavior instead of deleted PromptVersion/ImageAttempt behavior.
- Removed prompt-builder backend tests with the deleted module.

## Verification

### Required red

- `uv run --python 3.12 --extra dev pytest tests/course_planner/test_routes.py::test_state_payload_does_not_expose_prompt_versions_or_image_attempts -q`
- Result: failed first as expected because old `/state` still exposed `promptVersions`.

### Required green

- `uv run --python 3.12 --extra dev pytest tests/course_planner/test_routes.py tests/course_planner/test_store.py tests/course_planner/test_ai_tasks.py tests/course_planner/test_scene_package_models.py tests/course_planner/test_scene_package_prompt_projection.py tests/course_planner/test_scene_package_assembly_validation.py tests/course_planner/test_scene_package_store_media.py tests/course_planner/test_scene_package_store_lifecycle.py tests/course_planner/test_scene_package_routes_complete_assets.py tests/course_planner/test_scene_package_routes_assembly_media_delete.py tests/course_planner/test_scene_package_routes_prompt.py -q`
- Result: `120 passed`

### Additional verification

- `uv run --python 3.12 --extra dev pytest tests/course_planner/test_import_to_pipeline.py tests/course_planner/test_models.py -q`
- Result: `20 passed`

- `rg -n "PromptVersion|ImageAttempt|prompt-versions|image-attempts|promptPackage|prompt_package|GeneratePromptVersionOutput|ImageAttemptReview" backend/art_pipeline/course_planner backend/tests/course_planner`
- Result: no output

- `wc -l` on all substantially touched files
- Result: all touched files are `<= 500` lines

- `git diff --check`
- Result: clean

## Patch hygiene

- Deleted the old prompt/image runtime implementation instead of preserving dead endpoints or dead persistence helpers.
- Removed the old prompt-builder backend path because it existed only to support the deleted PromptVersion flow.
- Removed old prompt/image assertions from tests instead of updating tests to protect deleted behavior.

## Task Reviewer Findings Requiring Fix

Critical:
- Restore a spec-aligned Course Planner import route. The surviving import path must import the current Final Chapter Scene, not legacy scene_version files, and must be exposed through backend routes.

Important:
- Reuse shared PNG/media helpers in import_to_pipeline.py instead of duplicate `_load_png_size` logic.

## Reviewer Fix Implementation (2026-07-03)

### Fix summary

- Replaced the legacy scene-version import helper with `import_final_chapter_scene_to_pipeline(...)`.
- Added backend route `POST /api/course-planner/chapters/{chapterId}/scene-package/final-scene/import`.
- Switched import source-of-truth to `read_chapter_scene_package(chapter_id).final_scene` and resolved media bytes through scene-package media/path helpers.
- Wrote run `scene_context.json` with:
  - `source: course_planner`
  - `chapter_id`
  - `final_scene_id`
  - `final_scene_storage_path`
  - `selected_empty_scene_image_id`
  - `target_object_labels`
- Replaced local PNG parsing with shared `read_scene_package_png_size(...)`.

### Files changed

- `backend/art_pipeline/course_planner/import_to_pipeline.py`
- `backend/art_pipeline/course_planner/routes.py`
- `backend/tests/course_planner/test_import_to_pipeline.py`
- `backend/tests/course_planner/test_routes.py`

### Tests and results

- Focused import tests:
  - `cd /Users/guojunxi/Desktop/work/art-pipeline-design/backend && uv run --python 3.12 --extra dev pytest tests/course_planner/test_import_to_pipeline.py tests/course_planner/test_routes.py -q`
  - Result: `11 passed`

- Task 3 required green suite:
  - `cd /Users/guojunxi/Desktop/work/art-pipeline-design/backend && uv run --python 3.12 --extra dev pytest tests/course_planner/test_routes.py tests/course_planner/test_store.py tests/course_planner/test_ai_tasks.py tests/course_planner/test_scene_package_models.py tests/course_planner/test_scene_package_prompt_projection.py tests/course_planner/test_scene_package_assembly_validation.py tests/course_planner/test_scene_package_store_media.py tests/course_planner/test_scene_package_store_lifecycle.py tests/course_planner/test_scene_package_routes_complete_assets.py tests/course_planner/test_scene_package_routes_assembly_media_delete.py tests/course_planner/test_scene_package_routes_prompt.py tests/course_planner/test_import_to_pipeline.py tests/course_planner/test_models.py -q`
  - Result: `138 passed`

### Grep gates

- `rg -n "PromptVersion|ImageAttempt|prompt-versions|image-attempts|promptPackage|prompt_package|GeneratePromptVersionOutput|ImageAttemptReview" backend/art_pipeline/course_planner backend/tests/course_planner`
  - Result: no output

- `rg -n "import_locked_scene_version_to_pipeline|_load_png_size|scene_version_id|scene_version_path" backend/art_pipeline/course_planner/import_to_pipeline.py backend/art_pipeline/course_planner/routes.py backend/tests/course_planner/test_import_to_pipeline.py backend/tests/course_planner/test_routes.py`
  - Result: no output

### Line counts

- `backend/art_pipeline/course_planner/import_to_pipeline.py`: `140`
- `backend/art_pipeline/course_planner/routes.py`: `312`
- `backend/tests/course_planner/test_import_to_pipeline.py`: `132`
- `backend/tests/course_planner/test_routes.py`: `311`

### Hygiene

- `git diff --check`
  - Result: clean

## Task 3 Second Reviewer Findings Requiring Fix

Important:
- Remove dead backend prompt-authoring schema types from models.py: SceneDirectorPlan, ObjectPlan, CastBinding, SceneVocabulary, PromptTuning, and related PromptPackage-only structures if no surviving backend route/test imports them. In particular, remove PromptTuning.must_keep/avoid as a second facts source.

## Task 3 Legacy Backend Model Cleanup Fix (2026-07-03)

### Fix summary

- Removed dead backend prompt-authoring schema exports from `backend/art_pipeline/course_planner/models.py`:
  - `SceneDirectorPlan`
  - `ObjectPlan`
  - `CastBinding`
  - `SceneVocabulary`
  - `PromptTuning`
- Removed dead legacy scene-version/AI-review backend runtime from `backend/art_pipeline/course_planner/store.py`, including:
  - `SceneVersion`
  - `SceneVersionLock`
  - `AIReview`
  - scene-version create/read/lock/review helpers
  - scene-version PNG/version-id helper functions and imports
- Added narrow regression tests to keep the deleted backend API surface from reappearing.

### Evidence

- Codegraph caller check for `create_scene_version`: no callers.
- Codegraph caller check for `SceneDirectorPlan`: no backend callers.
- Repo grep outside `backend/art_pipeline/course_planner/**` found no surviving backend/test callers for the deleted runtime symbols.

### Verification

- Red:
  - `cd /Users/guojunxi/Desktop/work/art-pipeline-design/backend && uv run --python 3.12 --extra dev pytest tests/course_planner/test_models.py::test_models_module_does_not_export_dead_prompt_authoring_types tests/course_planner/test_store.py::test_store_does_not_expose_legacy_scene_version_runtime -q`
  - Result before fix: `2 failed`

- Green:
  - Same targeted command after fix
  - Result: `2 passed`

## Task 3 Review Fixes (2026-07-03)

### Fix summary

- Removed stale backend `Chapter.status` values `prompt_ready` and `has_attempts`; surviving backend vocabulary is now `draft | designing | imported`.
- Added backend regression coverage that rejects those deleted status values at model-validation time.
- Restored atomic temp-file + `os.replace(...)` semantics for `scene_context.json` writes in `import_to_pipeline.py`.
- Deleted the last concrete frontend consumer of the removed uploads review workflow:
  - `ImageAttemptReviewPage` route import and route entry from `AppRoutes.tsx`
  - `frontend/src/features/coursePlanner/pages/ImageAttemptReviewPage.tsx`
  - `frontend/tests/coursePlanner/image-attempt-review.test.tsx`

### Patch hygiene

- Did not re-add `/api/course-planner/uploads/{asset_path:path}` because that endpoint only served the deleted ImageAttempt review surface.
- Removed the concrete stale route/page/test instead of adding compatibility code on top of the dead workflow.
