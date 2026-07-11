# Global Character And Style Library Drawer Implementation Plan

> **Execution:** Use `superpowers:executing-plans` inline. Do not dispatch subagents; this is one small patch. Steps use checkboxes for tracking.

**Goal:** Add a Scene-level global library Drawer for minimal Character IP and Scene Style Reference management, while Chapter remains consumption-only.

**Architecture:** Replace the broad Reference Library model instead of layering compatibility on it. Reuse FastAPI, Pydantic, the existing file store, `CoursePlannerDrawer`, and current confirmation components; add no dependency.

**Design:** `docs/superpowers/specs/2026-07-11-global-character-style-library-drawer-design.md`

## Global Constraints

- Character IP is exactly `name + one Character Model Sheet`.
- Scene Style Reference is exactly `name + one image`.
- Chapter may select multiple characters and one style reference, but cannot manage library data.
- Remove superseded fields and generic prompt-role parsing; do not add fallbacks.
- Keep runtime files under 500 lines and tests under package `tests/` directories.
- Use path APIs and existing PNG validation; add no dependency or platform-specific script.

---

### Task 1: Replace The Backend Library Contract

**Files:**
- Modify: `backend/art_pipeline/course_planner/models.py`
- Modify: `backend/art_pipeline/course_planner/scene_package_models.py`
- Modify: `backend/art_pipeline/course_planner/api_models.py`
- Modify: `backend/art_pipeline/course_planner/store_hierarchy.py`
- Modify: `backend/art_pipeline/course_planner/scene_package_store.py`
- Create: `backend/art_pipeline/course_planner/library_routes.py`
- Modify: `backend/art_pipeline/course_planner/scene_package_routes.py`
- Modify: `backend/art_pipeline/course_planner/scene_package_prompt_projection.py`
- Test: `backend/tests/course_planner/test_scene_package_routes_library_import.py`
- Test: `backend/tests/course_planner/test_scene_package_prompt_projection.py`
- Test: `backend/tests/course_planner/test_scene_package_store_final_scene.py`

**Interfaces:**
- `CharacterIpProfile`: `id`, `display_name`, `current_model_sheet_id`, media metadata/timestamps only.
- `SceneStyleReference`: `id`, `display_name`, `current_image_id`, media metadata/timestamps only.
- CRUD routes under `/api/course-planner/character-ips` and `/api/course-planner/scene-style-references`; create/update use multipart forms.
- Current-image routes at `/character-ips/{id}/model-sheet` and `/scene-style-references/{id}/image` return the PNG used by cards and Chapter prompt packages.
- Singular Chapter style selection route; cast assignment no longer accepts `referenceImageIds`.

- [ ] Write failing route/store tests for atomic create, replacement, per-library unique names, referenced-delete `409`, singular style selection, and immutable historical media IDs.
- [ ] Replace `ReferenceLibraryImage`, prompt roles, character invariants/personality/multiple references, archive/delete statuses, and `confirmed_empty` with the approved models; move global library HTTP adapters into `library_routes.py` so `scene_package_routes.py` returns below 500 lines.
- [ ] Make create/replace clean up failed media writes and make delete preserve media already referenced by historical snapshots.
- [ ] Update prompt projection/final snapshots to resolve current Character Model Sheets plus the selected Scene Style Reference.
- [ ] Run `cd backend; uv run --python 3.12 --extra dev pytest tests/course_planner/test_scene_package_routes_library_import.py tests/course_planner/test_scene_package_prompt_projection.py tests/course_planner/test_scene_package_store_final_scene.py -q` and require PASS.

### Task 2: Add The Scene Library Drawer

**Files:**
- Create: `frontend/src/features/coursePlanner/components/GlobalReferenceLibraryDrawer.tsx`
- Create: `frontend/src/features/coursePlanner/components/globalReferenceLibrary.css`
- Create: `frontend/src/features/coursePlanner/hooks/useGlobalReferenceLibrary.ts`
- Modify: `frontend/src/features/coursePlanner/pages/SceneCategoryBoardPage.tsx`
- Modify: `frontend/src/features/coursePlanner/scenePackageApi.ts`
- Modify: `frontend/src/features/coursePlanner/api.ts`
- Modify: `frontend/src/features/coursePlanner/types.ts`
- Test: `frontend/tests/coursePlanner/global-reference-library-drawer.test.tsx`
- Test: `frontend/tests/coursePlanner/course-planner-library-api.test.ts`

**Interfaces:**
- `GlobalReferenceLibraryDrawer` consumes `isOpen/onClose`; it owns list/create/edit UI state only.
- `useGlobalReferenceLibrary` owns loading and CRUD side effects for both global libraries.
- Cards render one contain-fit image, name, and edit action; forms render only name and one PNG.

- [ ] Write failing API/component tests for the Scene header button, two tabs, minimal cards/forms, single-image preview, retry-preserved form state, duplicate-submit prevention, and referenced-delete feedback.
- [ ] Add typed CRUD API functions and the focused hook; do not route this data through Chapter workspace state.
- [ ] Add the `资料库` button to the existing Scene secondary header and render the shared Drawer without changing the board layout.
- [ ] Implement list/create/edit/delete states with existing buttons and confirmation dialog; omit every field excluded by the design.
- [ ] Run `cd frontend; npm test -- --run tests/coursePlanner/global-reference-library-drawer.test.tsx tests/coursePlanner/course-planner-library-api.test.ts` and require PASS.

### Task 3: Make Chapter Consumption-Only

**Files:**
- Modify: `frontend/src/features/coursePlanner/components/LibrarySelectionPanel.tsx`
- Modify: `frontend/src/features/coursePlanner/components/ChapterSceneStudio.tsx`
- Modify: `frontend/src/features/coursePlanner/hooks/useChapterScenePackageWorkspace.ts`
- Modify: `frontend/src/features/coursePlanner/scenePackageApi.ts`
- Modify: `frontend/src/features/coursePlanner/types.ts`
- Test: `frontend/tests/coursePlanner/chapter-workspace-library-actions.test.tsx`
- Test: `frontend/tests/coursePlanner/chapter-workspace.test.tsx`

- [ ] Rewrite failing Chapter tests to require multiple-character selection, one style selection, Prompt Ready only after both selections, and no create/upload/edit/delete library controls.
- [ ] Remove the Chapter reference upload flow, generic reference drawer, prompt-role selection, character reference override, and style `confirmed_empty` path; the deletion must bring `ChapterSceneStudio.tsx` below 500 lines instead of moving dead UI elsewhere.
- [ ] Keep Chapter-local role/action intent while resolving character/style images from global IDs.
- [ ] Run `cd frontend; npm test -- --run tests/coursePlanner/chapter-workspace-library-actions.test.tsx tests/coursePlanner/chapter-workspace.test.tsx` and require PASS.

### Task 4: Animate The Shared Drawer And Verify

**Files:**
- Create: `frontend/src/features/coursePlanner/components/CoursePlannerDrawer.tsx`
- Create: `frontend/src/features/coursePlanner/components/coursePlannerDrawer.css`
- Modify: `frontend/src/features/coursePlanner/components/CoursePlannerChrome.tsx`
- Create: `frontend/tests/coursePlanner/course-planner-drawer.test.tsx`
- Modify: `frontend/tools/capture-course-planner-screenshots.mjs`

- [ ] Write failing tests for enter/exit phases, unmount-after-exit, overlay/backdrop variants, pointer blocking, ESC compatibility, and reduced motion.
- [ ] Extract the existing Drawer from `CoursePlannerChrome.tsx` into `CoursePlannerDrawer.tsx`, re-export it for consumer compatibility, and keep both files below 500 lines.
- [ ] Add internal presence state to `CoursePlannerDrawer`; keep the public `isOpen/onClose` contract unchanged.
- [ ] Add the approved `180ms` enter, `160ms` exit, `150ms` backdrop, and reduced-motion CSS transitions without an animation library.
- [ ] Capture the real 1920×1080 Scene page with the library Drawer open and verify the underlying three-column board does not reflow.
- [ ] Run `cd frontend; npm test -- --run tests/coursePlanner; npm run build`, then `cd ..; git diff --check`; require all commands to pass.

## Completion Gate

- Backend focused tests pass.
- Full frontend Course Planner tests and build pass.
- Real Scene Drawer screenshot is reviewed.
- Diff contains no legacy duplicate models, Chapter management controls, new dependency, platform-specific script, or unrelated refactor.
