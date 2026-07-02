# Chapter Scene Package Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the chapter scene package review findings without expanding the product scope.

**Architecture:** Keep `ChapterScenePackage` as the single authority for chapter scene data. Move repeatable media-path/upload protocol into focused helper modules, keep HTTP routes as thin adapters, and keep frontend scene-package calls behind one small client module re-exported by the existing API surface.

**Tech Stack:** Python 3.12, FastAPI, Pydantic, PIL, TypeScript, Vitest.

## Global Constraints

- Do not scan `node_modules`.
- Keep every touched source/test file at or below 500 lines.
- Tests must remain under package `tests/` directories, mirrored by feature area.
- Use existing FastAPI/Pydantic/frontend API patterns; do not introduce a new framework.
- Preserve the external image-2 workflow assumption: the app stores prompts and uploaded images, it does not call image-2.
- Prompt snapshots stored on base candidates and complete scene images are projected strings, not mutable `ChapterScenePrompt` objects.
- Assembly `layer_order` is runtime/manifest data and must not be included in image-generation prompts.
- Deletion behavior remains unchanged and must still map child-not-found/precondition errors to the current HTTP status codes.
- Final branch must be squashed back to one commit over `5b0261b`.

---

### Task 1: Prompt Projection Contract

**Files:**
- Modify: `backend/art_pipeline/course_planner/scene_package_models.py`
- Modify: `backend/art_pipeline/course_planner/scene_package_store.py`
- Modify: `frontend/src/features/coursePlanner/types.ts`
- Test: `backend/tests/course_planner/test_scene_package_models.py`
- Test: `backend/tests/course_planner/test_scene_package_store_*.py`
- Test: `frontend/tests/coursePlanner/course-planner-scene-package-api.test.ts`

**Interfaces:**
- Produces: `build_base_prompt(package: ChapterScenePackage) -> str`
- Updates: `build_complete_prompt(package: ChapterScenePackage) -> str`
- Updates: `EmptyBaseSceneCandidate.prompt_snapshot: str`
- Updates: `CompleteSceneImage.prompt_snapshot: str`

- [ ] Change model fields so base and complete images store `prompt_snapshot` as `str`.
- [ ] Add `build_base_prompt()` that projects current prompt text, target object labels, style notes, and negative constraints.
- [ ] Update `build_complete_prompt()` to reuse the same projection plus locked base reference, and remove `assembly.layer_order`.
- [ ] Replace store snapshot resolution with separate base/complete prompt builders when upload callers omit an explicit snapshot.
- [ ] Update backend/frontend tests so persisted/uploaded payloads assert string snapshots.
- [ ] Run: `cd backend && uv run --python 3.12 --extra dev pytest tests/course_planner/test_scene_package_models.py tests/course_planner/test_scene_package_store_lifecycle.py tests/course_planner/test_scene_package_store_media.py -q`
- [ ] Run: `cd frontend && npm test -- --run course-planner-scene-package-api`

### Task 2: Chapter Asset HTTP And Frontend Entry

**Files:**
- Modify: `backend/art_pipeline/course_planner/api_models.py`
- Modify: `backend/art_pipeline/course_planner/scene_package_routes.py`
- Modify: `frontend/src/features/coursePlanner/api.ts`
- Modify/Create: `frontend/src/features/coursePlanner/scenePackageApi.ts`
- Test: `backend/tests/course_planner/test_scene_package_routes_*.py`
- Test: `frontend/tests/coursePlanner/course-planner-scene-package-api.test.ts`

**Interfaces:**
- Produces route: `POST /api/course-planner/chapters/{chapterId}/scene-package/chapter-assets`
- Produces frontend call: `uploadChapterAssetFromRunAsset(chapterId, file, input, fetcher?)`
- Input fields: `sourceRunId`, `sourceRunAssetId`, `displayName`, optional `sourceCompleteImageId`, optional `linkedTargetObjectId`
- Base/complete upload input also accepts optional `promptSnapshot` so upload-time snapshots can be edited instead of always using defaults.

- [ ] Add multipart route that calls `CoursePlannerStore.add_chapter_asset_from_run_asset()`.
- [ ] Map duplicate/missing asset source validation to `400`, missing chapter to `404`.
- [ ] Add frontend input type and API function using `FormData`.
- [ ] Update frontend route-call tests to include `/chapter-assets`.
- [ ] Run: `cd backend && uv run --python 3.12 --extra dev pytest tests/course_planner/test_scene_package_routes_prompt.py tests/course_planner/test_scene_package_routes_complete_assets.py tests/course_planner/test_scene_package_routes_assembly_media_delete.py -q`
- [ ] Run: `cd frontend && npm test -- --run course-planner-scene-package-api`

### Task 3: Deepen Scene Package Modules And Split Oversized Tests

**Files:**
- Modify: `backend/art_pipeline/course_planner/scene_package_store.py`
- Create: `backend/art_pipeline/course_planner/scene_package_media.py`
- Modify: `backend/art_pipeline/course_planner/scene_package_routes.py`
- Create: `backend/art_pipeline/course_planner/scene_package_route_helpers.py`
- Split: `backend/tests/course_planner/test_scene_package_store.py`
- Split: `backend/tests/course_planner/test_scene_package_routes.py`
- Split: `frontend/tests/coursePlanner/course-planner-api.test.ts`
- Modify/Create: frontend scene-package test files under `frontend/tests/coursePlanner/`

**Interfaces:**
- Produces media helpers: path validation, PNG validation, slot allocation, original filename sanitization.
- Produces route helper: shared exception-to-HTTP mapping for scene package handlers.
- Preserves store public methods and route paths from Tasks 1-2.

- [ ] Move PNG validation, storage path generation/validation, media lookup protocol, and filename sanitization out of `scene_package_store.py`.
- [ ] Keep `CoursePlannerScenePackageStoreMixin` as the business write interface; do not add a pass-through manager layer.
- [ ] Centralize repeated scene-package HTTP exception mapping without changing route status semantics.
- [ ] Split backend store and route tests by concern: prompt/media, base/complete, chapter assets, assembly/delete.
- [ ] Split frontend API tests so general course-planner API and scene-package API are separate files.
- [ ] Verify line counts with `wc -l` for all touched files.
- [ ] Run: `cd backend && uv run --python 3.12 --extra dev pytest tests/course_planner -q`
- [ ] Run: `cd frontend && npm test -- --run course-planner`

### Task 4: Final Verification, Review, And Squash

**Files:**
- No new product files unless a review fix requires them.

**Interfaces:**
- Consumes all previous task outputs.
- Produces one clean commit: `feat: add chapter scene package foundation`

- [ ] Run: `git diff --check`.
- [ ] Run: `cd backend && uv run --python 3.12 --extra dev pytest tests/course_planner -q`.
- [ ] Run: `cd frontend && npm test -- --run course-planner`.
- [ ] Run: `cd frontend && npm run build`.
- [ ] Run the `code-review` skill again over `5b0261b...HEAD`.
- [ ] Fix any Critical/Important findings and rerun the relevant tests.
- [ ] Squash all changes back to one commit over `5b0261b`.
- [ ] Confirm `git status --short` is clean.
