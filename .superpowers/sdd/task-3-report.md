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
