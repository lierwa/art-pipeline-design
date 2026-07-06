# Course Planner Assembly UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement every confirmed point from `docs/course-planner-ux-issue-record-2026-07-06.md` across Scene Pack Board, Chapter Studio, and Assembly Editor without leaving rejected behavior behind.

**Architecture:** Keep Course Planner facts in the Chapter Scene Package manifest and keep editor UI state local. Reuse existing product chrome, `CoursePlannerDrawer`, `ConfirmActionDialog`, `react-resizable-panels`, `react-arborist`, and the main art-pipeline canvas/tree interaction protocols instead of building parallel editor infrastructure. Split implementation into parallel workstreams with a small serial cleanup/setup step and a final integration gate.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, React Testing Library, React Router, lucide-react, Radix AlertDialog/Tooltip, react-resizable-panels, react-arborist, FastAPI, Pydantic, Pillow, pytest.

---

## Source Of Truth

- Issue record: `docs/course-planner-ux-issue-record-2026-07-06.md`
- Task 0 audit: `docs/superpowers/plans/2026-07-06-course-planner-ux-assembly-overhaul-task0-audit.md`
- ADR: `docs/adr/0018-use-shared-art-pipeline-authoring-protocols-for-assembly.md`
- Stale audit warning: `output/verification/assembly-rebuild-patch-audit-2026-07-05.md` predates this plan and must not be used as execution authority.
- UI visual restoration references:
  - Normal Assembly Editor: `docs/assets/course-planner-assembly-editor-normal-reference.png`
  - Generated Assets drawer overlay: `docs/assets/course-planner-assembly-generated-assets-drawer-overlay-on-current-reference.png`
- Domain glossary: `CONTEXT.md`
- Project rules: `AGENTS.md`

Every implementation task below lists the issue-record IDs it covers. A task is not complete until the listed IDs have code and tests or explicit negative tests for rejected behavior.

## UI Visual Restoration Requirements

The generated reference images are required UI restoration guides, not decorative documentation. The normal Assembly Editor must match the normal reference's product relationship: product navigation remains visible, the local Assembly header stays compact and useful, the left Asset Pool, center canvas, and right Properties/Layers rail form the primary editor, and the page contains no redundant explanatory chrome. Any implementation of the `Generated Chapter Assets` drawer must match the drawer reference's product relationship: the drawer opens from the Assembly Asset Pool import action, appears as a fixed-position overlay on the current Assembly Editor, covers the right side without adding a fourth column, and does not resize the left Asset Pool, center canvas, or right Properties/Layers rail.

Final visual QA must compare the running UI against:

`docs/assets/course-planner-assembly-editor-normal-reference.png`

`docs/assets/course-planner-assembly-generated-assets-drawer-overlay-on-current-reference.png`

## Verification Levels

Use the smallest verification level that matches task risk. Do not run the full product flow for every small task.

- **L1 Focused:** one or two exact unit/component tests for the changed file.
- **L2 Feature slice:** all related Course Planner frontend tests or backend course planner route/model tests.
- **L3 Integration:** frontend build plus backend course planner pytest subset.
- **L4 Final gate:** full frontend Course Planner tests, full backend Course Planner tests, frontend build, and manual screenshot check.

Default command forms:

```powershell
cd D:\work\art-pipeline-v2-demo\frontend
npm test -- --run tests/coursePlanner/<test-file>.tsx
npm run build
```

```powershell
cd D:\work\art-pipeline-v2-demo\backend
python -m pytest tests/course_planner/<test_file>.py -q
```

## Parallel Execution Model

### Serial Setup

Task 0 must run first. It classifies existing bad tests and current diff so workers do not build on rejected patches.

### Parallel Batch 1

These tasks can run in parallel after Task 0:

- Task 1: Navigation shell and local headers
- Task 2: Chapter Studio drawer actions and delete confirmations
- Task 3: Scene Pack Board density and icon-button cleanup
- Task 4: Backend generated asset materialization API
- Task 5: Shared Assembly authoring protocol extraction

### Parallel Batch 2

These tasks can run after their listed dependencies:

- Task 6 after Task 5: Assembly Layer Tree, grouping, z-order, delete semantics
- Task 7 after Task 5: Assembly canvas selection, marquee, drag-drop, keyboard, sizing
- Task 8 after Task 4: Generated Chapter Assets drawer and Asset Pool source grouping
- Task 9 after Task 5: Assembly Properties batch editing and readiness/final lock cleanup
- Task 10 after Task 1 and Task 5: resizable editor layout and fixed overlay drawer behavior

### Final Batch

Task 11 runs after Tasks 1-10. It performs the coverage audit, old-patch cleanup proof, visual QA, and final verification.

## File Responsibility Map

### Existing Shared UI / Protocols

- `frontend/src/features/coursePlanner/components/CoursePlannerChrome.tsx`  
  Existing `CoursePlannerDrawer`, `CoursePlannerPageHeader`, status badge, and inline action primitives. Reuse and tune; do not create a second Course Planner drawer.

- `frontend/src/shared/ui/ConfirmActionDialog.tsx`  
  Existing destructive confirmation primitive. Use for every delete and destructive replacement path.

- `frontend/src/shared/ui/IconButton.tsx`  
  Existing icon-button primitive. Use where it already fits; otherwise keep Course Planner-specific button classes but preserve icon-button semantics.

- `frontend/src/features/canvas/useCanvasInteractionController.ts`  
  Main art-pipeline selection and canvas interaction controller. Extract shared pieces only when needed; do not fork behavior inside Course Planner.

- `frontend/src/features/inspector/AssetTreePanel.tsx` and `frontend/src/features/inspector/assetTreeModel.ts`  
  Main art-pipeline tree/list selection and move protocol. Extract reusable selection/move resolution into shared helpers where Assembly can adapt Placement/Group nodes.

### Course Planner Frontend

- `frontend/src/app/routes/AppRoutes.tsx`  
  Product `TopAppBar` visibility and shell class contract.

- `frontend/src/features/coursePlanner/pages/ChapterWorkspacePage.tsx`  
  Chapter Studio local header/back context.

- `frontend/src/features/coursePlanner/pages/ChapterAssemblyEditorPage.tsx`  
  Assembly route load shell and error states.

- `frontend/src/features/coursePlanner/components/ChapterSceneStudio.tsx`  
  Chapter Studio structure and drawer state wiring.

- `frontend/src/features/coursePlanner/components/LibrarySelectionPanel.tsx`  
  Convert inline disclosures to drawer-trigger actions.

- `frontend/src/features/coursePlanner/components/AssemblyWorkspacePanel.tsx`  
  Assembly editor shell, three-panel layout, resizable panels, generated-assets drawer state.

- `frontend/src/features/coursePlanner/components/useAssemblyWorkspaceController.ts`  
  Assembly manifest state, selection state, history, save/autosave, placement creation, keyboard command handlers.

- `frontend/src/features/coursePlanner/components/AssemblyAuthoringCanvas.tsx`  
  Canvas-stage adapter for selection, marquee, drag/drop placement, fit behavior, hit-test order, and pointer interactions.

- `frontend/src/features/coursePlanner/components/AssemblyEditorCanvas.tsx`  
  Canvas toolbar/status bar, icon buttons, zoom/fit display, and layout sizing.

- `frontend/src/features/coursePlanner/components/AssemblyLayerTree.tsx`  
  Visible group-aware layer tree.

- `frontend/src/features/coursePlanner/components/assemblyLayerTreeModel.ts`  
  Assembly adapter from manifest `placements/groups/layer_order` into reusable tree model.

- `frontend/src/features/coursePlanner/components/AssemblyPlacementProperties.tsx`  
  Single and multi-selection properties rail.

- `frontend/src/features/coursePlanner/components/AssemblyAssetPoolPanel.tsx` and `assemblyAssetPoolBrowser.tsx`  
  Asset source grouping, usage counts, drag source, upload as secondary action.

- Create `frontend/src/features/coursePlanner/components/GeneratedChapterAssetsDrawer.tsx`  
  Drawer UI for current-Chapter generated outputs.

- Create `frontend/src/features/coursePlanner/components/generatedChapterAssetsModel.ts`  
  Frontend projection for generated output groups, importable/unavailable state, and already-added state.

- `frontend/src/features/coursePlanner/scenePackageApi.ts` and `types.ts`  
  API client/types for listing and materializing generated assets.

- `frontend/src/features/coursePlanner/components/coursePlanner.css`  
  Product area layout, drawer fixed overlay, board density, editor resizable shell, no fixed canvas height.

### Course Planner Backend

- `backend/art_pipeline/course_planner/scene_package_models.py`  
  Extend `ChapterAssetLineage` with generated-output lineage and validation.

- `backend/art_pipeline/course_planner/scene_package_routes.py`  
  Add generated asset list/materialize endpoints and tighten delete/replacement confirmation-compatible behavior.

- Create `backend/art_pipeline/course_planner/generated_assets.py`  
  Resolve current-Chapter Complete Image pipeline outputs into importable generated asset records. Keep workspace/run filesystem details behind this boundary.

- `backend/art_pipeline/course_planner/scene_package_media_store.py` and `scene_package_media.py`  
  Copy generated image files into chapter-owned scene package media.

- `backend/art_pipeline/course_planner/scene_package_assembly_validation.py`  
  Readiness/final-lock facts for required placements, valid assets, and complete `layer_order`.

### Tests

- Frontend tests stay under `frontend/tests/coursePlanner/`.
- Backend tests stay under `backend/tests/course_planner/`.
- Do not add tests under runtime `src/`, `lib/`, `ui/`, `tools/`, or `prompts`.

---

## Task 0: Patch Hygiene And Contract Audit

**Type:** simple mandatory setup  
**Can run in parallel:** no  
**Covers issue IDs:** 7, 9, 11  
**Verification level:** L1 audit plus no test run required unless files are changed

**Files:**
- Modify as needed: `frontend/tests/coursePlanner/chapter-workspace.test.tsx`
- Modify as needed: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx`
- Modify as needed: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-asset-pool.test.tsx`
- Modify as needed: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-canvas.test.tsx`
- Modify as needed: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-properties.test.tsx`

- [ ] **Step 1: Capture current diff before editing**

Run:

```powershell
cd D:\work\art-pipeline-v2-demo
git status --short
git diff -- frontend/src/features/coursePlanner frontend/tests/coursePlanner backend/art_pipeline/course_planner backend/tests/course_planner docs
```

Expected: a readable diff. Classify existing changes into:

- unrelated user changes: leave untouched
- rejected behavior locks: rewrite or delete in the owning implementation task
- useful helpers: keep only if they protect a confirmed issue-record invariant

- [ ] **Step 2: Mark rejected test assertions for rewrite**

Find and rewrite tests that assert:

- `TopAppBar` absent on Chapter or Assembly routes
- grouping controls absent
- Shift-click canvas selection collapses to single selection
- direct-upload-only asset source assumptions
- one placement per Chapter Asset
- flat-only `AssemblyLayerTree`

Use replacement assertions from later tasks, not compatibility branches.

- [ ] **Step 3: Add a temporary coverage checklist to the implementation PR description or local notes**

Copy the coverage matrix from this plan. During implementation, update each row when its test passes.

## Task 1: Unified Course Planner Navigation Shell

**Type:** simple frontend  
**Can run in parallel:** yes, after Task 0  
**Covers issue IDs:** 1, 6, 7, 35  
**Verification level:** L1 focused routing tests

**Files:**
- Modify: `frontend/src/app/routes/AppRoutes.tsx`
- Modify: `frontend/src/features/coursePlanner/pages/ChapterWorkspacePage.tsx`
- Modify: `frontend/src/features/coursePlanner/pages/ChapterAssemblyEditorPage.tsx`
- Modify: `frontend/src/features/coursePlanner/components/AssemblyWorkspaceFeedback.tsx`
- Modify: `frontend/src/features/coursePlanner/components/coursePlanner.css`
- Test: `frontend/tests/coursePlanner/course-planner-routing.test.tsx`
- Test: `frontend/tests/coursePlanner/chapter-workspace.test.tsx`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor.test.tsx`

- [ ] **Step 1: Write routing/header tests**

Assert:

- `/course-planner` renders product `TopAppBar`
- `/course-planner/chapters/:chapterId` renders product `TopAppBar`
- `/course-planner/chapters/:chapterId/assembly` renders product `TopAppBar`
- Chapter Studio has local back/breadcrumb to Scene Pack Board
- Assembly Editor has local back to Chapter Studio and a useful local header

Run:

```powershell
cd D:\work\art-pipeline-v2-demo\frontend
npm test -- --run tests/coursePlanner/course-planner-routing.test.tsx tests/coursePlanner/chapter-workspace.test.tsx tests/coursePlanner/chapter-workspace-assembly-editor.test.tsx
```

Expected before implementation: fails on old hidden top bar assertions.

- [ ] **Step 2: Remove immersive hide behavior**

In `AppRoutes.tsx`, keep `TopAppBar` for all `/course-planner` routes. Retain course-planner shell class only for styling, not for hiding global navigation.

- [ ] **Step 3: Add local headers**

Use `CoursePlannerPageHeader` or the existing compact Assembly header pattern. The header must contain only useful navigation and state:

- back action
- current workspace label
- chapter title
- saved/error state where relevant
- exit/back command for Assembly

- [ ] **Step 4: Run focused tests**

Run the command from Step 1. Expected: pass.

## Task 2: Chapter Studio Drawers And Destructive Confirmation

**Type:** simple-to-medium frontend  
**Can run in parallel:** yes, after Task 0  
**Covers issue IDs:** 2, 3, 7, 25  
**Verification level:** L1 focused component tests

**Files:**
- Modify: `frontend/src/features/coursePlanner/components/ChapterSceneStudio.tsx`
- Modify: `frontend/src/features/coursePlanner/components/LibrarySelectionPanel.tsx`
- Modify: `frontend/src/features/coursePlanner/components/CoursePlannerChrome.tsx` only if fixed overlay/focus behavior needs a small reusable prop
- Modify: `frontend/src/features/coursePlanner/components/coursePlanner.css`
- Test: `frontend/tests/coursePlanner/chapter-workspace-library-actions.test.tsx`

- [ ] **Step 1: Rewrite library action tests**

Assert:

- clicking `Bind Character IP` opens `CoursePlannerDrawer`
- clicking `Upload Reference` opens `CoursePlannerDrawer`
- the readiness row does not expand inline with `<details>/<summary>`
- closing the drawer returns focus to the trigger

Run:

```powershell
cd D:\work\art-pipeline-v2-demo\frontend
npm test -- --run tests/coursePlanner/chapter-workspace-library-actions.test.tsx
```

Expected before implementation: fails because inline disclosure is still present.

- [ ] **Step 2: Replace inline disclosures**

Remove `InlineDisclosure` usage from `LibrarySelectionPanel.tsx`. Keep row actions as icon/text buttons that call parent drawer open handlers. Render `CharacterBindingPanel` and `ReferenceImagesPanel` inside `CoursePlannerDrawer` owned by `ChapterSceneStudio.tsx`.

- [ ] **Step 3: Confirm destructive actions**

Audit Course Planner delete/replace/clear actions touched by this task. Every delete uses `ConfirmActionDialog`; no direct delete button may call a destructive handler without confirmation.

- [ ] **Step 4: Run focused tests**

Run the command from Step 1. Expected: pass.

## Task 3: Scene Pack Board Density And Useful Chrome

**Type:** simple frontend styling/component cleanup  
**Can run in parallel:** yes, after Task 0  
**Covers issue IDs:** 2, 6  
**Verification level:** L1 board tests plus visual inspection

**Files:**
- Modify: `frontend/src/features/coursePlanner/pages/SceneCategoryBoardPage.tsx`
- Modify: `frontend/src/features/coursePlanner/components/SceneCategoryList.tsx`
- Modify: `frontend/src/features/coursePlanner/components/SelectedChapterSequence.tsx`
- Modify: `frontend/src/features/coursePlanner/components/CandidateChapterBoard.tsx`
- Modify: `frontend/src/features/coursePlanner/components/coursePlanner.css`
- Test: `frontend/tests/coursePlanner/scene-category-board.test.tsx`
- Test: `frontend/tests/coursePlanner/scene-category-board-chapter-status.test.tsx`

- [ ] **Step 1: Add density regression tests**

Assert:

- low-frequency Scene Pack actions are not oversized primary blocks
- Chapter drag handle has accessible label and does not reserve a large empty hit area
- destructive actions still require confirmation
- visible content remains Scene Packs, candidates, and Chapter List, not a large empty header band

Run:

```powershell
cd D:\work\art-pipeline-v2-demo\frontend
npm test -- --run tests/coursePlanner/scene-category-board.test.tsx tests/coursePlanner/scene-category-board-chapter-status.test.tsx
```

- [ ] **Step 2: Compact board layout**

Reduce `CoursePlannerPageHeader` board min-height, collapse low-frequency actions into icon buttons/menus where possible, and keep Chapter/candidate content dominant.

- [ ] **Step 3: Run focused tests and inspect**

Run the Step 1 command. Then start the frontend only if screenshot inspection is needed:

```powershell
cd D:\work\art-pipeline-v2-demo\frontend
npm run dev
```

Manual check: no large empty band like the red-box screenshot remains.

## Task 4: Backend Generated Asset Materialization

**Type:** complex backend  
**Can run in parallel:** yes, after Task 0  
**Covers issue IDs:** 5, 12, 13, 14, 15, 34, 36, 37, 42  
**Verification level:** L2 backend course planner tests

**Files:**
- Create: `backend/art_pipeline/course_planner/generated_assets.py`
- Modify: `backend/art_pipeline/course_planner/scene_package_models.py`
- Modify: `backend/art_pipeline/course_planner/scene_package_routes.py`
- Modify: `backend/art_pipeline/course_planner/scene_package_media_store.py`
- Modify: `backend/art_pipeline/course_planner/scene_package_media.py`
- Modify: `backend/art_pipeline/course_planner/scene_package_assembly_validation.py`
- Test: `backend/tests/course_planner/test_scene_package_routes_complete_assets.py`
- Test: `backend/tests/course_planner/test_scene_package_models.py`
- Test: `backend/tests/course_planner/test_scene_package_assembly_validation.py`
- Test: create `backend/tests/course_planner/test_scene_package_routes_generated_assets.py`

- [ ] **Step 1: Extend model tests first**

Add tests proving:

- `ChapterAssetLineage.source_kind` accepts `direct_upload`
- `ChapterAssetLineage.source_kind` accepts generated asset lineage with `complete_scene_image_id`, `pipeline_run_id`, and `run_asset_id`
- invalid generated lineage without the required ids fails validation
- generated lineage serializes through scene package round trip

Run:

```powershell
cd D:\work\art-pipeline-v2-demo\backend
python -m pytest tests/course_planner/test_scene_package_models.py -q
```

- [ ] **Step 2: Implement lineage model**

Use a discriminated or validated Pydantic model shape. Keep a single authority for lineage validation in `scene_package_models.py`; do not parse lineage ad hoc in routes.

- [ ] **Step 3: Add generated asset resolver tests**

In `test_scene_package_routes_generated_assets.py`, build fixtures where a Complete Scene Image references a pipeline run with generated image files. Assert:

- list endpoint returns every current-Chapter output that completed Codex image generation and has an image file
- image quality does not affect importability
- missing file returns an unavailable reason
- unreadable dimensions returns an unavailable reason
- already materialized output returns `added` state and existing Chapter Asset id
- outputs from another Chapter are not returned

- [ ] **Step 4: Implement `generated_assets.py`**

Responsibilities:

- resolve only current Chapter `complete_images[].pipeline_run_id`
- include any output that completed Codex image generation and produced an image file
- compute dimensions with Pillow at the boundary
- return unavailable records with explicit reasons instead of raising for the whole list
- avoid reading or scanning `node_modules`

- [ ] **Step 5: Add materialize route tests**

Assert:

- materializing copies the generated image into Chapter Scene Package media
- materializing creates `ChapterAsset` with generated lineage
- repeated default materialize of the same `run_id + run_asset_id` returns/locates the existing active Chapter Asset
- explicit duplicate/copy action can create another Chapter Asset if the API exposes that mode
- deleting a Chapter Asset removes only the chapter-owned asset and current assembly references, never the source run asset, Complete Image, or locked Final

- [ ] **Step 6: Implement list and materialize routes**

Add route names in the same style as existing `scene_package_routes.py`. Keep copy/materialization logic in store/media helpers, not in the React client.

- [ ] **Step 7: Run backend feature slice**

Run:

```powershell
cd D:\work\art-pipeline-v2-demo\backend
python -m pytest tests/course_planner/test_scene_package_routes_generated_assets.py tests/course_planner/test_scene_package_routes_complete_assets.py tests/course_planner/test_scene_package_models.py tests/course_planner/test_scene_package_assembly_validation.py -q
```

Expected: pass.

## Task 5: Shared Assembly Authoring Protocol Extraction

**Type:** complex frontend architecture  
**Can run in parallel:** yes, after Task 0  
**Covers issue IDs:** 3, 4, 5, 8, 11, 19, 20, 29  
**Verification level:** L1 protocol tests, no full UI run

**Files:**
- Modify or extract from: `frontend/src/features/canvas/useCanvasInteractionController.ts`
- Modify or extract from: `frontend/src/features/inspector/assetTreeModel.ts`
- Create if needed: `frontend/src/features/authoring/selectionModel.ts`
- Create if needed: `frontend/src/features/authoring/layerTreeMoveModel.ts`
- Modify: `frontend/src/features/coursePlanner/components/assemblyLayerTreeModel.ts`
- Modify: `frontend/src/features/coursePlanner/assembly/assemblyManifestDraft.ts`
- Test: create `frontend/tests/coursePlanner/assembly-authoring-protocol.test.ts`
- Test: create `frontend/tests/coursePlanner/assembly-layer-tree-model.test.ts`

- [ ] **Step 1: Write protocol tests**

Assert:

- replace selection selects one id
- toggle selection adds/removes without losing primary selection rules
- Shift/range selection works from anchor to target in tree order
- layer tree move resolves root reorder, group insert, and invalid nested group attempts
- `layer_order[0]` remains frontmost
- hit-test order can be projected front-to-back

Run:

```powershell
cd D:\work\art-pipeline-v2-demo\frontend
npm test -- --run tests/coursePlanner/assembly-authoring-protocol.test.ts tests/coursePlanner/assembly-layer-tree-model.test.ts
```

Expected before implementation: fails where new helpers do not exist or Assembly model is flat-only.

- [ ] **Step 2: Extract shared helpers only where there are real callers**

Allowed shared helpers:

- selection reducer used by main canvas/tree and Assembly
- layer tree move resolver used by main `AssetTreePanel` and Assembly adapter, or a generic helper with both callers

Do not create manager/coordinator layers that only forward calls.

- [ ] **Step 3: Adapt Assembly manifest to protocol**

Keep Assembly-specific facts in `assemblyManifestDraft.ts`:

- `placements`
- `groups`
- `layer_order`
- transform
- runtime role
- required dependencies

The generic protocol must not know Chapter-specific backend shapes.

- [ ] **Step 4: Run protocol tests**

Run the Step 1 command. Expected: pass.

## Task 6: Assembly Layer Tree, Grouping, Z-Order, And Delete Semantics

**Type:** complex frontend  
**Can run in parallel:** yes, after Task 5  
**Covers issue IDs:** 4, 5, 8, 9, 20, 21, 23, 25, 26, 29, 31, 32, 38  
**Verification level:** L2 Assembly layer tests

**Files:**
- Modify: `frontend/src/features/coursePlanner/components/AssemblyLayerTree.tsx`
- Modify: `frontend/src/features/coursePlanner/components/assemblyLayerTreeModel.ts`
- Modify: `frontend/src/features/coursePlanner/assembly/assemblyManifestDraft.ts`
- Modify: `frontend/src/features/coursePlanner/components/useAssemblyWorkspaceController.ts`
- Modify: `frontend/src/features/coursePlanner/components/AssemblyWorkspacePanel.tsx`
- Modify: `frontend/src/features/coursePlanner/components/coursePlanner.css`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx`
- Test: `frontend/tests/coursePlanner/assembly-layer-tree-model.test.ts`

- [ ] **Step 1: Rewrite layer tests**

Assert:

- group controls are visible when multi-selection supports grouping
- grouping creates a group row with child placements
- one-level groups only; dragging a group into another group is rejected
- ungroup preserves child placements
- deleting a group opens confirmation and deletes group plus child placements after confirm
- deleting a placement opens confirmation
- collapsed group state is local UI state, not manifest/autosave input
- list top row is frontmost; moving row upward brings it forward
- the same Chapter Asset can appear as multiple placement rows with distinct names

Run:

```powershell
cd D:\work\art-pipeline-v2-demo\frontend
npm test -- --run tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx tests/coursePlanner/assembly-layer-tree-model.test.ts
```

- [ ] **Step 2: Wire group-aware tree**

Use `buildLayerTreeData`, `groupPlacements`, `ungroupPlacementGroup`, and the shared move protocol. Delete the old flat-only comment and behavior in `AssemblyLayerTree.tsx`.

- [ ] **Step 3: Add confirmed delete behavior**

Every delete trigger in the Layer Tree uses `ConfirmActionDialog`. `Delete group` deletes group and child placements. `Ungroup` is a separate command.

- [ ] **Step 4: Add duplicate placement naming**

Default names:

- first placement: Chapter Asset display name
- repeated placement: display name plus suffix such as `Lamp 2`, `Lamp 3`

Renaming a placement or group never renames the source Chapter Asset.

- [ ] **Step 5: Run feature tests**

Run the Step 1 command. Expected: pass.

## Task 7: Assembly Canvas Interactions, Drag-To-Canvas, Keyboard, And Sizing

**Type:** complex frontend  
**Can run in parallel:** yes, after Task 5  
**Covers issue IDs:** 4, 8, 16, 17, 18, 19, 22, 24, 27, 30, 31, 33, 39, 40, 41  
**Verification level:** L2 Assembly canvas tests

**Files:**
- Modify: `frontend/src/features/coursePlanner/components/AssemblyAuthoringCanvas.tsx`
- Modify: `frontend/src/features/coursePlanner/components/AssemblyEditorCanvas.tsx`
- Modify: `frontend/src/features/coursePlanner/components/useAssemblyWorkspaceController.ts`
- Modify: `frontend/src/features/coursePlanner/assembly/assemblyCanvasViewModel.ts`
- Modify: `frontend/src/features/coursePlanner/assembly/assemblyAutosavePolicy.ts`
- Modify: `frontend/src/features/coursePlanner/components/assemblyCanvasControls.ts`
- Modify: `frontend/src/features/coursePlanner/components/coursePlanner.css`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-canvas.test.tsx`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-autosave.test.tsx`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-autosave-retry.test.tsx`

- [ ] **Step 1: Rewrite canvas tests**

Assert:

- Shift-click and modifier-click multi-select on canvas
- marquee selection selects multiple placements
- canvas hit-test uses front-to-back z-order
- drag Asset Pool item to canvas creates placement centered on release point
- click add creates placement at viewport center
- default longest displayed side is about 25% of empty-scene short side and preserves aspect ratio
- generated 1024x1024 source image is not placed at raw pixel size
- initial load and Empty Scene change auto-fit
- after user pan/zoom, resize does not auto-reset until explicit Fit
- panel widths and zoom/pan do not enter manifest/autosave key
- undo/redo affects manifest facts only and does not persist across refresh
- Delete/Backspace opens confirmation before deleting
- Ctrl/Cmd+G groups, Ctrl/Cmd+Shift+G ungroups, Ctrl/Cmd+A selects all, Escape clears/close state, arrows nudge, Shift+arrows larger nudge, Space-drag pans
- replacing Empty Scene with existing placements requires confirmation and preserves relative placement transforms after confirm

Run:

```powershell
cd D:\work\art-pipeline-v2-demo\frontend
npm test -- --run tests/coursePlanner/chapter-workspace-assembly-editor-canvas.test.tsx tests/coursePlanner/chapter-workspace-assembly-editor-autosave.test.tsx tests/coursePlanner/chapter-workspace-assembly-editor-autosave-retry.test.tsx
```

- [ ] **Step 2: Replace single-selection adapter**

Stop passing `selectedElementIds={selectedPlacementId ? [selectedPlacementId] : []}` as the only selection truth. Selection state must hold ordered selected ids plus primary id/anchor where needed.

- [ ] **Step 3: Implement drag-to-canvas**

Use pointer or HTML5 drag/drop consistently with existing React test utilities. The asset id must travel from Asset Pool to canvas. The release coordinate becomes placement center.

- [ ] **Step 4: Implement initial transform policy**

Replace the old 40% default with the confirmed display policy:

- source file keeps original dimensions
- default display transform uses about 25% of empty-scene short side as longest side
- preserve aspect ratio
- click-add at viewport center
- drag-drop at pointer release

- [ ] **Step 5: Implement keyboard commands and history**

History covers manifest changes only:

- placements
- groups
- `layer_order`
- transforms
- runtime role
- `requires_placed`
- placement/group names

Do not include selection, drawer state, panel widths, search, collapsed rows, zoom/pan, or routes.

- [ ] **Step 6: Implement basic alignment**

Add icon-button actions for align left, horizontal center, right, top, vertical middle, and bottom. Do not add complex smart snapping/guides in this task.

- [ ] **Step 7: Run feature tests**

Run the Step 1 command. Expected: pass.

## Task 8: Generated Chapter Assets Drawer And Asset Pool

**Type:** complex frontend, depends on backend API contract  
**Can run in parallel:** yes, after Task 4  
**Covers issue IDs:** 5, 8, 12, 13, 14, 15, 30, 31, 32, 33, 34, 35, 36, 37  
**Verification level:** L2 Asset Pool tests

**Files:**
- Create: `frontend/src/features/coursePlanner/components/GeneratedChapterAssetsDrawer.tsx`
- Create: `frontend/src/features/coursePlanner/components/generatedChapterAssetsModel.ts`
- Modify: `frontend/src/features/coursePlanner/components/AssemblyAssetPoolPanel.tsx`
- Modify: `frontend/src/features/coursePlanner/components/assemblyAssetPoolBrowser.tsx`
- Modify: `frontend/src/features/coursePlanner/components/AssemblyWorkspacePanel.tsx`
- Modify: `frontend/src/features/coursePlanner/scenePackageApi.ts`
- Modify: `frontend/src/features/coursePlanner/types.ts`
- Modify: `frontend/src/features/coursePlanner/components/coursePlanner.css`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-asset-pool.test.tsx`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-asset-actions.test.tsx`
- Test: `frontend/tests/coursePlanner/course-planner-scene-package-api.test.ts`

- [ ] **Step 1: Add API/client tests**

Assert:

- client lists generated assets for current Chapter
- client materializes generated asset into Chapter Asset
- unavailable reason and added state are represented
- direct upload remains available but secondary

Run:

```powershell
cd D:\work\art-pipeline-v2-demo\frontend
npm test -- --run tests/coursePlanner/course-planner-scene-package-api.test.ts
```

- [ ] **Step 2: Add Asset Pool UI tests**

Assert:

- pipeline-derived/generated assets appear in the primary group
- Uploads group is secondary
- search spans generated and uploaded assets
- usage count shows `0 uses`, `1 use`, `2 uses`
- the same Chapter Asset can be added multiple times
- `Import generated assets` icon button opens `Generated Chapter Assets` drawer
- drawer is rendered as fixed overlay, not a fourth grid column
- unavailable generated outputs show disabled state plus reason
- already materialized outputs show Added/locate state

Run:

```powershell
cd D:\work\art-pipeline-v2-demo\frontend
npm test -- --run tests/coursePlanner/chapter-workspace-assembly-editor-asset-pool.test.tsx tests/coursePlanner/chapter-workspace-assembly-editor-asset-actions.test.tsx
```

- [ ] **Step 3: Implement generated assets model**

Project backend records into:

- group by Complete Image
- optional group by Run
- importable
- unavailable with reason
- added with existing Chapter Asset id

Quality score or visual judgment must not affect importability.

- [ ] **Step 4: Implement drawer**

Use `CoursePlannerDrawer`. It must be fixed overlay per reference image and not part of the editor panel grid. Drawer content:

- title `Generated Chapter Assets`
- close X
- `By Complete Image` / `By Run`
- search/filter
- grouped rows with thumbnail, name, dimensions, status, Add/Added
- footer note and Close button

- [ ] **Step 5: Update Asset Pool**

Make generated assets primary. Keep Upload as secondary. Replace used/unused dot with usage count. Add drag source affordance for canvas drop.

- [ ] **Step 6: Run feature tests**

Run the commands from Steps 1 and 2. Expected: pass.

## Task 9: Properties Rail, Batch Editing, Readiness, And Final Lock

**Type:** medium frontend/backend validation  
**Can run in parallel:** yes, after Task 5; backend readiness portions can coordinate with Task 4  
**Covers issue IDs:** 8, 15, 21, 22, 27, 28, 39, 42  
**Verification level:** L2 focused properties/final tests

**Files:**
- Modify: `frontend/src/features/coursePlanner/components/AssemblyPlacementProperties.tsx`
- Modify: `frontend/src/features/coursePlanner/components/AssemblyTargetCoveragePanel.tsx`
- Modify: `frontend/src/features/coursePlanner/components/FinalScenePanel.tsx`
- Modify: `frontend/src/features/coursePlanner/components/useAssemblyWorkspaceController.ts`
- Modify: `frontend/src/features/coursePlanner/assembly/assemblyReadiness.ts`
- Modify: `backend/art_pipeline/course_planner/scene_package_assembly_validation.py`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-properties.test.tsx`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-final.test.tsx`
- Test: `backend/tests/course_planner/test_scene_package_assembly_validation.py`

- [ ] **Step 1: Write batch properties tests**

Assert:

- single selection shows detailed Placement form
- multi-selection shows `N selected`
- mixed geometry fields show mixed state
- entering a geometry value applies to all selected placements
- batch role/required flags apply where valid
- batch delete/group/alignment actions are available
- placement/group rename does not rename source Chapter Asset

Run:

```powershell
cd D:\work\art-pipeline-v2-demo\frontend
npm test -- --run tests/coursePlanner/chapter-workspace-assembly-editor-properties.test.tsx
```

- [ ] **Step 2: Write readiness/final tests**

Assert readiness/final lock depends only on:

- Empty Scene exists
- required target placements are satisfied
- `layer_order` is complete and valid
- placement asset references resolve to available Chapter Assets
- required dependency references are valid

Assert UI state does not affect readiness:

- selection
- zoom
- collapsed rows
- drawer state
- panel widths

Run:

```powershell
cd D:\work\art-pipeline-v2-demo\frontend
npm test -- --run tests/coursePlanner/chapter-workspace-assembly-editor-final.test.tsx
cd D:\work\art-pipeline-v2-demo\backend
python -m pytest tests/course_planner/test_scene_package_assembly_validation.py -q
```

- [ ] **Step 3: Implement properties rail**

Use single/multi selection projection from the shared selection model. Keep UI state local. Manifest mutations go through `useAssemblyWorkspaceController`.

- [ ] **Step 4: Implement readiness rules**

Make readiness/final lock use manifest/domain facts only. Remove any dependency on UI state.

- [ ] **Step 5: Run focused tests**

Run the commands from Steps 1 and 2. Expected: pass.

## Task 10: Resizable Assembly Editor Layout And Fixed Drawer Overlay

**Type:** medium frontend layout  
**Can run in parallel:** yes, after Tasks 1 and 5  
**Covers issue IDs:** 8, 16, 17, 18, 35  
**Verification level:** L1 layout tests plus manual screenshot

**Files:**
- Modify: `frontend/src/features/coursePlanner/components/AssemblyWorkspacePanel.tsx`
- Modify: `frontend/src/features/coursePlanner/components/AssemblyEditorCanvas.tsx`
- Modify: `frontend/src/features/coursePlanner/components/CoursePlannerChrome.tsx`
- Modify: `frontend/src/features/coursePlanner/components/coursePlanner.css`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor.test.tsx`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-canvas.test.tsx`

- [ ] **Step 1: Write layout tests**

Assert:

- Assembly editor exists below product `TopAppBar`
- editor shell fills remaining viewport height
- center canvas fills available remaining height
- no hard fixed canvas/editor height is required for normal operation
- left/right rails are resizable through `react-resizable-panels`
- panel widths persist only in local UI/localStorage
- panel widths do not enter manifest/autosave key
- generated assets drawer overlays the current editor and does not resize panel grid

Run:

```powershell
cd D:\work\art-pipeline-v2-demo\frontend
npm test -- --run tests/coursePlanner/chapter-workspace-assembly-editor.test.tsx tests/coursePlanner/chapter-workspace-assembly-editor-canvas.test.tsx
```

- [ ] **Step 2: Implement resizable panels**

Use existing `react-resizable-panels`. Do not add a new resizing library. Store layout preference locally, keyed by Course Planner Assembly editor context, not in scene package manifest.

- [ ] **Step 3: Make drawer fixed overlay**

Adjust `CoursePlannerDrawer` or add a Course Planner-specific prop/class so generated-assets drawer is `fixed` and overlays the editor. It must not become a fourth column.

- [ ] **Step 4: Run focused tests and compare references**

Run Step 1 command. Manual compare to both Assembly visual references:

`docs/assets/course-planner-assembly-editor-normal-reference.png`

`docs/assets/course-planner-assembly-generated-assets-drawer-overlay-on-current-reference.png`

Expected: normal editor matches the useful three-column Assembly reference, and drawer overlays right side without shrinking canvas.

## Task 11: Final Coverage Audit, Visual QA, And Full Verification

**Type:** final integration  
**Can run in parallel:** no  
**Covers issue IDs:** 1-42  
**Verification level:** L4 final gate

**Files:**
- Modify if needed: `docs/course-planner-ux-issue-record-2026-07-06.md`
- Modify if needed: `docs/adr/0018-use-shared-art-pipeline-authoring-protocols-for-assembly.md`
- No runtime files unless fixing integration bugs found by this task

- [ ] **Step 1: Run coverage matrix audit**

For every row in the matrix below, identify:

- runtime file implementing it
- test file protecting it
- whether old rejected behavior was deleted, inverted, or replaced

If any issue id lacks a runtime implementation or test, return to the owning task.

- [ ] **Step 2: Run frontend Course Planner tests**

Run:

```powershell
cd D:\work\art-pipeline-v2-demo\frontend
npm test -- --run tests/coursePlanner
```

Expected: pass.

- [ ] **Step 3: Run backend Course Planner tests**

Run:

```powershell
cd D:\work\art-pipeline-v2-demo\backend
python -m pytest tests/course_planner -q
```

Expected: pass.

- [ ] **Step 4: Run frontend build**

Run:

```powershell
cd D:\work\art-pipeline-v2-demo\frontend
npm run build
```

Expected: pass.

- [ ] **Step 5: Manual visual QA**

Start app:

```powershell
cd D:\work\art-pipeline-v2-demo
npm run dev
```

Check:

- Scene Pack Board has dense useful layout
- Chapter Studio keeps top navigation and local back context
- Library actions open drawer, not inline blocks
- Assembly Editor keeps top navigation and fills remaining viewport
- normal Assembly Editor matches `docs/assets/course-planner-assembly-editor-normal-reference.png`
- left/right rails resize
- canvas does not use fixed height
- generated-assets drawer overlays current page as fixed drawer
- generated-assets drawer matches `docs/assets/course-planner-assembly-generated-assets-drawer-overlay-on-current-reference.png`
- drag-to-canvas, marquee, multi-select, group/ungroup, layer drag, delete confirmation, and final lock all behave as specified

- [ ] **Step 6: Document old patch cleanup**

In final implementation summary, list:

- tests deleted or inverted
- flat-only tree code removed
- direct-upload-only assumptions removed
- single-selection assumptions removed
- hidden-topbar assertions removed

---

## Coverage Matrix

| Issue ID | Required outcome | Owning task(s) |
|---:|---|---|
| 1 | Product `TopAppBar` on Board, Chapter Studio, Assembly; local back/breadcrumbs | 1 |
| 2 | Board wastes less space; useful content dominates | 3 |
| 3 | Library actions use drawer, not inline disclosures | 2 |
| 4 | Assembly canvas/tree multi-select complete | 5, 6, 7 |
| 5 | Layer grouping/hierarchy wired visibly | 5, 6 |
| 6 | Asset Pool no longer direct-upload-only bucket | 4, 8 |
| 7 | Tests/docs conflict cleaned | 0, 11 |
| 8 | Three-column Assembly responsibilities fixed | 6, 7, 8, 9, 10 |
| 9 | Old rejected tests/patches cleared | 0, 11 |
| 10 | ADR 0018 remains architecture reference | 11 |
| 11 | Protocol cleanup before visual-only work | 0, 5, 11 |
| 12 | Generated assets limited to current Chapter Complete Image runs | 4, 8 |
| 13 | Materialize by copying into chapter-owned assets | 4, 8 |
| 14 | Default dedupe by `run_id + run_asset_id` | 4, 8 |
| 15 | Chapter Asset delete affects chapter-owned asset and Assembly refs only | 4, 8, 9 |
| 16 | No fixed editor/canvas height; fills remaining viewport | 7, 10 |
| 17 | Panel width local only, not manifest | 7, 10 |
| 18 | Canvas auto-fit policy | 7, 10 |
| 19 | Mature editor canvas conventions | 5, 7 |
| 20 | Mature layer-panel conventions | 5, 6 |
| 21 | Placement/Group names editable; Asset name separate | 6, 9 |
| 22 | Autosave manifest facts only | 7, 9 |
| 23 | Collapsed tree state local only | 6 |
| 24 | Keyboard shortcuts | 7 |
| 25 | Every delete confirms | 2, 6, 7, 8 |
| 26 | Delete group deletes group plus child placements; Ungroup separate | 6 |
| 27 | Undo/redo manifest session only | 7, 9 |
| 28 | Multi-selection properties batch mode | 9 |
| 29 | Layer Tree top row is frontmost | 5, 6, 7 |
| 30 | New placement display size independent from source size | 7, 8 |
| 31 | Same Chapter Asset can be placed multiple times | 6, 7, 8 |
| 32 | Duplicate placement naming suffixes | 6, 8 |
| 33 | Drag Asset Pool item to canvas creates placement | 7, 8 |
| 34 | Asset Pool source grouping prioritizes generated assets | 8 |
| 35 | Generated assets drawer entry lives in Assembly Asset Pool | 1, 8, 10 |
| 36 | Any completed Codex-generated image file is importable regardless of quality | 4, 8 |
| 37 | Unavailable generated outputs show disabled state plus reason | 4, 8 |
| 38 | No nested groups in first version | 6 |
| 39 | Basic alignment/nudging, no complex snapping | 7, 9 |
| 40 | Canvas marquee selection first version | 7 |
| 41 | Empty Scene replacement confirms and preserves relative transforms | 7 |
| 42 | Readiness/final lock uses manifest/domain facts only | 4, 9 |

## Completion Rule

Do not mark the implementation complete until:

- every coverage matrix row has a passing test or a verified visual/manual check where automated testing is impractical
- every old test that protected rejected behavior is deleted, inverted, or replaced
- no new dependency is added for drawer, confirmation, resizing, tree, icon, or tooltip behavior
- generated asset import uses Chapter-owned materialization and never treats workspace run files as the Chapter Asset Pool authority
- final response names any test that could not be run and why
