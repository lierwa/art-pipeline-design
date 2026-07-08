# Course Planner UX Gap Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every `G01-G21` gap from `docs/course-planner-ux-gap-audit-2026-07-07.md` with code, tests, screenshot evidence, and explicit old-patch cleanup.

**Architecture:** Treat the July 7 gap audit and the July 6 issue record as the product contract. Keep Course Planner business facts in `ChapterScenePackage` and `ChapterSceneAssembly` models, keep editor-only state local, reuse existing Course Planner chrome/drawer/confirmation primitives, and reuse the shared canvas/tree authoring protocols instead of adding parallel editor infrastructure.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, React Testing Library, lucide-react, Radix UI primitives, react-resizable-panels, react-arborist, FastAPI, Pydantic, Pillow, pytest, Playwright-compatible screenshot tooling.

---

## Source Of Truth

- Gap audit: `docs/course-planner-ux-gap-audit-2026-07-07.md`
- July 6 issue record: `docs/course-planner-ux-issue-record-2026-07-06.md`
- Prior implementation plan: `docs/superpowers/plans/2026-07-06-course-planner-ux-assembly-overhaul.md`
- ADR: `docs/adr/0018-use-shared-art-pipeline-authoring-protocols-for-assembly.md`
- Domain glossary: `CONTEXT.md`
- Normal Assembly reference: `docs/assets/course-planner-assembly-editor-normal-reference.png`
- Generated assets drawer reference: `docs/assets/course-planner-assembly-generated-assets-drawer-overlay-on-current-reference.png`

## User-Confirmed Correction - 2026-07-07

- Current test assets do not need to be realistic. The repair target is real layout, real controls, and real editor behavior using whatever functional test assets are present.
- Left Asset Pool is complete only when each item is a compact card with a fixed rectangular image frame, a clear top/middle/bottom structure, section collapse affordances, and a sticky bottom upload button.
- The center toolbar must remove the red-marked alignment/parent-child-looking button group and the red-marked dashed-box `Show boxes` toggle. The save action must be icon-only with accessible label and tooltip, with no visible `Save Assembly` text.
- Canvas selection must use one visual box system. The selected frame and handles must render above the placed image, handle cursors must match standard resize cursors, and rotation must be operable from the canvas so the Properties rotation field is not fake.
- The right rail is accepted by the layer list quality, not by a large Properties form. The desired list is a compact grouped tree like the reference: row-level drag without a visible dotted handle, thumbnail/name/role in one row, right eye icon, optional lock later, and drag-to-reorder or drag-to-group behavior.
- Wrapping is a page-level bug: text that should stay on one compact row must not wrap, and text that needs room must be given a valid container instead of overflowing or forcing unrelated rows taller.

## Bug List Coverage Map

This plan covers the latest bug list from commit `7d65d1a Add course planner UX gap audit`: `docs/course-planner-ux-gap-audit-2026-07-07.md`. A task is not complete until its mapped bug-list rows have code, tests, and screenshot evidence in `docs/course-planner-ux-gap-coverage-2026-07-07.md`.

### G01-G21

| Gap | Bug-list summary | Owner task |
|---|---|---|
| G01 | Board Scene Pack action icons are wrong size/density | Task 2 |
| G02 | Board Chapter List item layout is wrong | Task 2 |
| G03 | Route transition loading state looks broken | Task 1 |
| G04 | Chapter Studio top layout overlaps/collides | Task 1, Task 3 |
| G05 | Chapter Studio content layout is chaotic | Task 3 |
| G06 | Assembly Editor does not restore normal reference | Task 4, Task 5, Task 6 |
| G07 | Assembly Asset Pool does not prioritize generated pipeline assets | Task 5 |
| G08 | Asset cards contain stray/misleading UI | Task 5 |
| G09 | Assembly toolbar exposes noisy alignment controls | Task 4 |
| G10 | Visible `Save Assembly` text button violates reference direction | Task 4 |
| G11 | Assembly canvas sizing/framing misses requested behavior | Task 4 |
| G12 | Right properties/layers panel lacks reference interaction quality | Task 6 |
| G13 | Multi-select and grouping need interaction/visual proof | Task 6 |
| G14 | Delete confirmation coverage must be re-verified | Task 3, Task 6 |
| G15 | Button/icon sizing is inconsistent across screens | Task 2, Task 3, Task 4 |
| G16 | Status badges collide/duplicate | Task 1 |
| G17 | Board and Chapter screens waste useful areas | Task 2, Task 3 |
| G18 | Generated Chapter Assets drawer not proven in real app state | Task 5 |
| G19 | Drawer reuse requirement needs implementation audit | Task 3, Task 5 |
| G20 | Visual QA failed to catch obvious regressions | Task 0, Task 7 |
| G21 | Implementation coverage must reconcile every July 6 issue | Task 0, Task 7 |

### July 6 Issue IDs 1-42

| ID | Requirement summary | Owner task |
|---:|---|---|
| 1 | Keep product `TopAppBar`; add local back/breadcrumbs | Task 1 |
| 2 | Chapter library actions use drawer/sheet, not inline disclosure | Task 3 |
| 3 | Assembly reuses/extracts main art-pipeline selection/tree protocols | Task 4, Task 6 |
| 4 | Restore grouping as first-class Layer Tree operation | Task 6 |
| 5 | Asset Pool primary source is pipeline outputs materialized into chapter assets | Task 5 |
| 6 | Scene Pack Board is a dense planning workspace | Task 2 |
| 7 | Chapter Studio keeps structure but gets local optimization | Task 3 |
| 8 | Assembly keeps three-column editor with corrected side rails | Task 4, Task 5, Task 6 |
| 9 | Delete or rewrite old tests/patches protecting rejected behavior | Task 0 |
| 10 | ADR 0018 remains architecture reference | Task 0, Task 7 |
| 11 | Protocol cleanup precedes visual-only work | Task 0, Task 4, Task 6 |
| 12 | Pipeline asset picker shows current Chapter Complete Image runs first | Task 5 |
| 13 | Selected pipeline run assets copy into chapter-owned assets | Task 5 |
| 14 | Default dedupe by source run asset per Chapter | Task 5 |
| 15 | Chapter Asset deletion affects current Chapter/Assembly refs only | Task 5, Task 6 |
| 16 | Assembly canvas fills remaining viewport, not fixed height | Task 4 |
| 17 | Resized panel widths are local only, not manifest | Task 4, Task 7 |
| 18 | Canvas auto-fit before user manipulation and after Empty Scene change | Task 4 |
| 19 | Canvas operations follow mature editor conventions | Task 4, Task 6 |
| 20 | Layer Tree follows mature layer-panel conventions | Task 6 |
| 21 | Placement and Group names editable without renaming source asset | Task 6 |
| 22 | Autosave persists manifest facts only | Task 1, Task 4 |
| 23 | Layer Tree collapsed state stays local, not manifest | Task 6 |
| 24 | Assembly includes baseline mature-editor shortcuts | Task 4, Task 6 |
| 25 | Every delete operation requires confirmation | Task 3, Task 5, Task 6 |
| 26 | Deleting group deletes group plus child placements; ungroup separate | Task 6 |
| 27 | Undo/redo covers only current Assembly manifest edits | Task 4 |
| 28 | Properties rail supports batch editing for multi-selection | Task 6 |
| 29 | Layer Tree top row represents front/topmost canvas layer | Task 6 |
| 30 | New placements use display size separate from raw source dimensions | Task 4, Task 5 |
| 31 | Same Chapter Asset can be placed multiple times | Task 5, Task 6 |
| 32 | Repeated placements get distinct default names | Task 5, Task 6 |
| 33 | Drag Asset Pool item to canvas creates placement | Task 5 |
| 34 | Pipeline-derived assets are primary Asset Pool grouping | Task 5 |
| 35 | Generated asset import workflow lives in Assembly Asset Pool | Task 5 |
| 36 | Completed Codex-generated image files import regardless quality | Task 5 |
| 37 | Unavailable generated outputs show disabled state and reason | Task 5 |
| 38 | No nested groups in first version | Task 6 |
| 39 | Basic alignment/nudging is scoped; no complex snapping | Task 4 |
| 40 | Canvas marquee selection included in first version | Task 6 |
| 41 | Empty Scene replacement confirms and preserves relative transforms | Task 3, Task 6 |
| 42 | Assembly readiness/final lock uses manifest/domain facts only | Task 1, Task 3 |

## Hard Rules For This Repair

- Do not claim completion from tests alone; every visible workflow needs screenshot evidence.
- Do not use `output/verification/*2026-07-05*` as success evidence. Those files are useful failure history only.
- Do not reintroduce hidden `TopAppBar`, inline library disclosures, direct-upload-only asset assumptions, flat-only layer tree behavior, single-selection canvas behavior, visible `Save Assembly` text toolbar action, always-visible alignment toolbar rows, or the top-toolbar `Show boxes` toggle.
- Do not treat current cat/test images as a product gap. Test asset realism is out of scope unless an actual asset-loading bug appears.
- Do not ship a Properties rotation input unless canvas rotation exists and updates the same `placement.transform.rotation_deg` source of truth.
- Do not ship layer rows that wrap into two-line cards. Layer rows must be compact, single-row, tree-aware rows.
- Do not scan `node_modules`.
- Keep tests under `frontend/tests/coursePlanner/` and `backend/tests/course_planner/`.
- Every destructive action must use `ConfirmActionDialog` or the existing confirmation pattern.
- Each phase must update a coverage row before being marked complete.

## File Responsibility Map

### Planning And Evidence

- Create/update: `docs/course-planner-ux-gap-coverage-2026-07-07.md`
  Tracks `G01-G21`, the 42 July 6 decisions, owning task, implementation status, test command, and screenshot evidence path.
- Update: `docs/course-planner-ux-gap-audit-2026-07-07.md` only if a gap status changes after verified repair.
- Use: `frontend/tools/capture-course-planner-screenshots.mjs` for final visual evidence.

### Shell, Loading, And Route Status

- Modify: `frontend/src/app/routes/AppRoutes.tsx`
- Modify: `frontend/src/features/coursePlanner/pages/ChapterWorkspacePage.tsx`
- Modify: `frontend/src/features/coursePlanner/pages/ChapterAssemblyEditorPage.tsx`
- Modify: `frontend/src/features/coursePlanner/components/CoursePlannerChrome.tsx`
- Modify: `frontend/src/features/coursePlanner/components/coursePlanner.css`
- Modify: `frontend/src/features/coursePlanner/components/chapterStudioLayout.css`
- Modify: `frontend/src/features/coursePlanner/components/assemblyEditorShell.css`
- Test: `frontend/tests/coursePlanner/course-planner-routing.test.tsx`
- Test: `frontend/tests/coursePlanner/chapter-workspace.test.tsx`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor.test.tsx`

### Board Density

- Modify: `frontend/src/features/coursePlanner/pages/SceneCategoryBoardPage.tsx`
- Modify: `frontend/src/features/coursePlanner/components/SceneCategoryList.tsx`
- Modify: `frontend/src/features/coursePlanner/components/SelectedChapterSequence.tsx`
- Modify: `frontend/src/features/coursePlanner/components/coursePlanner.css`
- Test: `frontend/tests/coursePlanner/scene-category-board.test.tsx`
- Test: `frontend/tests/coursePlanner/scene-category-board-chapter-status.test.tsx`

### Chapter Studio

- Modify: `frontend/src/features/coursePlanner/components/ChapterSceneStudio.tsx`
- Modify: `frontend/src/features/coursePlanner/components/LibrarySelectionPanel.tsx`
- Modify: `frontend/src/features/coursePlanner/components/PromptFactsPanel.tsx`
- Modify: `frontend/src/features/coursePlanner/components/EmptySceneImagesPanel.tsx`
- Modify: `frontend/src/features/coursePlanner/components/CompleteSceneImagesPanel.tsx`
- Modify: `frontend/src/features/coursePlanner/components/FinalScenePanel.tsx`
- Modify: `frontend/src/features/coursePlanner/components/chapterStudioLayout.css`
- Modify: `frontend/src/features/coursePlanner/components/chapterMediaPanels.css`
- Test: `frontend/tests/coursePlanner/chapter-workspace.test.tsx`
- Test: `frontend/tests/coursePlanner/chapter-workspace-library-actions.test.tsx`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-final.test.tsx`

### Assembly Editor

- Modify: `frontend/src/features/coursePlanner/components/AssemblyWorkspacePanel.tsx`
- Modify: `frontend/src/features/coursePlanner/components/AssemblyWorkspaceFeedback.tsx`
- Modify: `frontend/src/features/coursePlanner/components/AssemblyEditorCanvas.tsx`
- Modify: `frontend/src/features/coursePlanner/components/AssemblyAuthoringCanvas.tsx`
- Modify: `frontend/src/features/coursePlanner/components/AssemblyLayerTree.tsx`
- Modify: `frontend/src/features/coursePlanner/components/AssemblyPlacementProperties.tsx`
- Modify: `frontend/src/features/coursePlanner/components/assemblyEditorShell.css`
- Modify: `frontend/src/features/coursePlanner/components/assemblyWorkspace.css`
- Modify: `frontend/src/features/canvas/CanvasOverlayLayer.tsx`
- Modify: `frontend/src/features/canvas/CanvasBoxEditLayer.tsx`
- Modify: `frontend/src/styles.css`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor.test.tsx`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-canvas.test.tsx`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-properties.test.tsx`

### Generated Assets And Asset Pool

- Modify: `backend/art_pipeline/course_planner/generated_assets.py`
- Modify: `backend/art_pipeline/course_planner/scene_package_routes.py`
- Modify: `backend/art_pipeline/course_planner/scene_package_models.py`
- Modify: `frontend/src/features/coursePlanner/components/AssemblyAssetPoolPanel.tsx`
- Modify: `frontend/src/features/coursePlanner/components/assemblyAssetPool.css`
- Modify: `frontend/src/features/coursePlanner/components/assemblyAssetPoolBrowser.tsx`
- Modify: `frontend/src/features/coursePlanner/components/GeneratedChapterAssetsDrawer.tsx`
- Modify: `frontend/src/features/coursePlanner/components/generatedChapterAssetsModel.ts`
- Modify: `frontend/src/features/coursePlanner/scenePackageApi.ts`
- Modify: `frontend/src/features/coursePlanner/types.ts`
- Test: `backend/tests/course_planner/test_scene_package_routes_generated_assets.py`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-asset-pool.test.tsx`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-final.test.tsx`

---

### Task 0: Coverage Matrix And Patch Hygiene Gate

**Files:**
- Create: `docs/course-planner-ux-gap-coverage-2026-07-07.md`
- Read: `docs/course-planner-ux-gap-audit-2026-07-07.md`
- Read: `docs/course-planner-ux-issue-record-2026-07-06.md`
- Read: `docs/superpowers/plans/2026-07-06-course-planner-ux-assembly-overhaul.md`

- [ ] **Step 1: Capture current worktree state**

Run:

```bash
cd /Users/guojunxi/Desktop/work/art-pipeline-design
git status --short
git diff -- docs frontend/src/features/coursePlanner frontend/tests/coursePlanner backend/art_pipeline/course_planner backend/tests/course_planner
```

Expected: current changes are understood before editing. If unrelated user changes appear, leave them untouched.

- [ ] **Step 2: Create the coverage document**

Create `docs/course-planner-ux-gap-coverage-2026-07-07.md` with two tables. The following block is the original seed template for creating the ledger, not the current repair status:

```markdown
# Course Planner UX Gap Coverage - 2026-07-07

## G01-G21 Repair Matrix

| Gap | Current state | Owner task | Code evidence | Test evidence | Screenshot evidence | Notes |
|---|---|---|---|---|---|---|
| G01 | broken | Task 2 | pending | pending | pending | Scene Pack action density |

## July 6 Issue Coverage Matrix

| ID | Decision summary | Current state | Owner task | Evidence | Notes |
|---:|---|---|---|---|---|
| 1 | Keep product TopAppBar on Board, Chapter, Assembly | partial | Task 1 | pending | TopAppBar exists; loading/status still broken |
```

- [ ] **Step 3: Classify old-patch behavior**

Mark these as rejected locks to delete or rewrite in owning tasks:

- tests or code protecting hidden `TopAppBar`;
- tests or code protecting visible text `Save Assembly` in the canvas toolbar;
- tests or code protecting always-visible alignment toolbar;
- tests or code protecting the top-toolbar `Show boxes` dashed-square toggle;
- tests or CSS protecting the current long/tall Asset Pool card image layout;
- tests or CSS protecting `64px` layer rows that force layer names and roles onto separate lines;
- tests or code proving only single selection;
- tests or code making `Uploads` the dominant asset pool state when generated assets exist;
- tests or code relying on one asset creating only one placement;
- tests or code proving delete without confirmation.

- [ ] **Step 4: Commit only if requested**

Do not commit during plan execution unless the user explicitly asks. Keep the coverage document as the execution ledger.

### Task 1: Stable Shell, Loading, And Status Zones

**Files:**
- Modify: `frontend/src/features/coursePlanner/pages/ChapterWorkspacePage.tsx`
- Modify: `frontend/src/features/coursePlanner/pages/ChapterAssemblyEditorPage.tsx`
- Modify: `frontend/src/features/coursePlanner/components/CoursePlannerChrome.tsx`
- Modify: `frontend/src/features/coursePlanner/components/coursePlanner.css`
- Modify: `frontend/src/features/coursePlanner/components/chapterStudioLayout.css`
- Modify: `frontend/src/features/coursePlanner/components/assemblyEditorShell.css`
- Test: `frontend/tests/coursePlanner/course-planner-routing.test.tsx`
- Test: `frontend/tests/coursePlanner/chapter-workspace.test.tsx`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor.test.tsx`

- [ ] **Step 1: Write loading/status tests**

Add assertions that Chapter loading and Assembly loading keep a stable shell:

```tsx
expect(screen.getByRole("banner", { name: /course planner/i })).toBeInTheDocument();
expect(screen.getByRole("link", { name: "Back to board" })).toBeInTheDocument();
expect(screen.getByRole("status", { name: /loading/i })).toBeInTheDocument();
expect(screen.queryByText(/^Loading$/)?.closest(".course-planner-page-header__actions")).toBeTruthy();
```

- [ ] **Step 2: Run the focused route tests**

Run:

```bash
cd /Users/guojunxi/Desktop/work/art-pipeline-design/frontend
npm test -- --run tests/coursePlanner/course-planner-routing.test.tsx tests/coursePlanner/chapter-workspace.test.tsx tests/coursePlanner/chapter-workspace-assembly-editor.test.tsx
```

Expected before fix: tests fail on missing stable loading/status behavior or current collision-prone structure.

- [ ] **Step 3: Implement one stable route shell**

Keep `TopAppBar` visible. In both Chapter and Assembly pages, render a local header before loading/error/content branches. Loading must be an intentional workspace skeleton or centered placeholder inside the page body, not a stranded right-side pill.

- [ ] **Step 4: Fix CSS row ownership**

Ensure `.course-planner-shell`, `.chapter-workspace-page`, and `.chapter-assembly-editor-page` reserve rows for:

- product top bar from `AppRoutes`;
- local page header or Assembly editor topbar;
- main workspace content;
- Assembly statusbar when present.

- [ ] **Step 5: Verify**

Run the Step 2 command. Capture:

```bash
node tools/capture-course-planner-screenshots.mjs
```

Expected: Board, Chapter loading, Chapter loaded, Assembly loading, and Assembly loaded screenshots are not visually broken.

Update G03, G04, and G16 rows in the coverage document.

### Task 2: Board Density And Icon Button System

**Files:**
- Modify: `frontend/src/features/coursePlanner/pages/SceneCategoryBoardPage.tsx`
- Modify: `frontend/src/features/coursePlanner/components/SceneCategoryList.tsx`
- Modify: `frontend/src/features/coursePlanner/components/SelectedChapterSequence.tsx`
- Modify: `frontend/src/features/coursePlanner/components/coursePlanner.css`
- Test: `frontend/tests/coursePlanner/scene-category-board.test.tsx`
- Test: `frontend/tests/coursePlanner/scene-category-board-chapter-status.test.tsx`

- [ ] **Step 1: Write board regression tests**

Assert that Scene Pack actions use shared icon sizing and Chapter List keeps content dominant:

```tsx
const packActions = within(packItem).getByRole("group", { name: /Scene Pack actions/i });
expect(within(packActions).getByRole("button", { name: /Edit Scene Pack/i })).toHaveClass("course-planner-icon-button");
expect(within(packActions).queryByText(/^Delete$/)).not.toBeInTheDocument();
expect(within(chapterItem).getByRole("link", { name: /Open Designer/i })).toBeInTheDocument();
expect(within(chapterItem).getByRole("button", { name: /Delete Chapter/i })).toHaveClass("course-planner-icon-button");
```

- [ ] **Step 2: Run the board tests**

Run:

```bash
cd /Users/guojunxi/Desktop/work/art-pipeline-design/frontend
npm test -- --run tests/coursePlanner/scene-category-board.test.tsx tests/coursePlanner/scene-category-board-chapter-status.test.tsx
```

- [ ] **Step 3: Recompose Scene Pack cards**

Keep card body as the large selection target. Move edit/archive/delete into one compact action row with consistent `30-34px` hit targets and tooltips.

- [ ] **Step 4: Recompose Chapter List rows**

Use a predictable grid:

- drag handle column;
- chapter number/title/summary content column;
- open action and delete action column.

The right action area must not dominate the content.

- [ ] **Step 5: Verify**

Run the Step 2 command and capture the Board screenshot. Update G01, G02, G15, and G17 rows in the coverage document.

### Task 3: Chapter Studio Layout And Delete Confirmation Sweep

**Files:**
- Modify: `frontend/src/features/coursePlanner/components/ChapterSceneStudio.tsx`
- Modify: `frontend/src/features/coursePlanner/components/LibrarySelectionPanel.tsx`
- Modify: `frontend/src/features/coursePlanner/components/PromptFactsPanel.tsx`
- Modify: `frontend/src/features/coursePlanner/components/EmptySceneImagesPanel.tsx`
- Modify: `frontend/src/features/coursePlanner/components/CompleteSceneImagesPanel.tsx`
- Modify: `frontend/src/features/coursePlanner/components/FinalScenePanel.tsx`
- Modify: `frontend/src/features/coursePlanner/components/chapterStudioLayout.css`
- Modify: `frontend/src/features/coursePlanner/components/chapterMediaPanels.css`
- Test: `frontend/tests/coursePlanner/chapter-workspace.test.tsx`
- Test: `frontend/tests/coursePlanner/chapter-workspace-library-actions.test.tsx`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-final.test.tsx`

- [ ] **Step 1: Write Chapter Studio layout and drawer tests**

Assert:

- product top bar remains visible;
- local back action remains visible;
- library actions open `CoursePlannerDrawer`;
- no `details` or `summary` inline disclosure exists;
- visible delete actions open alert dialogs before mutation handlers run.

- [ ] **Step 2: Run focused Chapter tests**

Run:

```bash
cd /Users/guojunxi/Desktop/work/art-pipeline-design/frontend
npm test -- --run tests/coursePlanner/chapter-workspace.test.tsx tests/coursePlanner/chapter-workspace-library-actions.test.tsx tests/coursePlanner/chapter-workspace-assembly-editor-final.test.tsx
```

- [ ] **Step 3: Normalize header/status placement**

Keep one local Chapter header and one status zone. Do not duplicate `Assembly ready`, `Saved`, or route loading states in unrelated card headers.

- [ ] **Step 4: Confirm destructive paths**

Enumerate and test these paths:

- delete Complete Scene Image;
- replace Empty Scene when placements exist;
- lock/replace Final Scene where existing authored facts are cleared;
- delete Chapter from Board;
- delete Scene Pack from Board.

- [ ] **Step 5: Verify**

Run the Step 2 command and capture Chapter full-page plus header/status crop. Update G04, G05, G14, G15, and G17 rows.

### Task 4: Assembly Toolbar, Save Surface, Canvas Selection, And Rotation

**Files:**
- Modify: `frontend/src/features/coursePlanner/components/AssemblyWorkspacePanel.tsx`
- Modify: `frontend/src/features/coursePlanner/components/AssemblyWorkspaceFeedback.tsx`
- Modify: `frontend/src/features/coursePlanner/components/AssemblyEditorCanvas.tsx`
- Modify: `frontend/src/features/coursePlanner/components/AssemblyAuthoringCanvas.tsx`
- Modify: `frontend/src/features/coursePlanner/components/assemblyEditorShell.css`
- Modify: `frontend/src/features/coursePlanner/components/assemblyWorkspace.css`
- Modify: `frontend/src/features/canvas/CanvasOverlayLayer.tsx`
- Modify: `frontend/src/features/canvas/CanvasBoxEditLayer.tsx`
- Modify: `frontend/src/styles.css`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor.test.tsx`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-canvas.test.tsx`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-autosave.test.tsx`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-properties.test.tsx`

- [ ] **Step 1: Rewrite toolbar tests**

Replace assertions for text `Save Assembly`, always-visible alignment controls, and the top-toolbar dashed-square box toggle with:

```tsx
expect(screen.queryByRole("button", { name: "Save Assembly" })).not.toBeInTheDocument();
expect(screen.queryByRole("toolbar", { name: "Alignment controls" })).not.toBeInTheDocument();
expect(screen.queryByLabelText("Show boxes")).not.toBeInTheDocument();
expect(screen.getByRole("button", { name: /save/i })).toHaveClass("shared-icon-button");
```

- [ ] **Step 2: Run Assembly toolbar tests**

Run:

```bash
cd /Users/guojunxi/Desktop/work/art-pipeline-design/frontend
npm test -- --run tests/coursePlanner/chapter-workspace-assembly-editor.test.tsx tests/coursePlanner/chapter-workspace-assembly-editor-canvas.test.tsx tests/coursePlanner/chapter-workspace-assembly-editor-autosave.test.tsx tests/coursePlanner/chapter-workspace-assembly-editor-properties.test.tsx
```

- [ ] **Step 3: Remove noisy visible toolbar controls**

Remove the current `Alignment controls` group from `AssemblyEditorCanvas.tsx`; this is the red-marked group between undo/redo and zoom. Remove unused lucide imports once the controls are gone.

Remove the current `SquareDashed` `Show boxes` toggle from the top toolbar. The canvas should not expose both always-on box overlays and edit-selection boxes as two visible box systems.

- [ ] **Step 4: Convert save action**

Use autosave/statusbar as the primary save feedback. If manual save remains, make it an icon-only `IconButton` with tooltip and accessible label; remove `showLabel` so no visible `Save Assembly` text appears in the toolbar.

- [ ] **Step 5: Make selection render above image content**

In the shared canvas layers, keep placed images as content and render the selected frame, handles, and label above them. Acceptance checks:

```tsx
expect(screen.getByTestId("overlay-box-placement_bowl")).toBeVisible();
expect(screen.getByTestId("canvas-edit-region-placement_bowl")).toHaveClass("canvas-edit-region");
expect(screen.getByTestId("resize-handle-placement_bowl-nw")).toHaveClass("resize-handle-nw");
```

CSS must preserve the existing standard cursors already used by `.canvas-edit-region`, `.resize-handle-nw`, `.resize-handle-ne`, `.resize-handle-e`, `.resize-handle-s`, and related handle classes. Browser QA must verify the computed cursor changes on the frame body, each resize handle, and the rotation handle.

- [ ] **Step 6: Add canvas rotation interaction**

Add a rotation handle or equivalent canvas interaction for the selected placement. It must update `placement.transform.rotation_deg` through the same draft update path used by `AssemblyPlacementProperties`.

Focused assertion:

```tsx
fireEvent.pointerDown(screen.getByTestId("rotate-handle-placement_bowl"), { clientX: 720, clientY: 280 });
fireEvent.pointerMove(document, { clientX: 760, clientY: 250 });
fireEvent.pointerUp(document);
expect(savedDraft.placements.find((placement) => placement.id === "placement_bowl")?.transform.rotation_deg).not.toBe(0);
```

- [ ] **Step 7: Fix canvas framing**

Ensure the editor fills remaining viewport height below product navigation and local Assembly topbar. Left/right panels may resize; center canvas must consume remaining space and not look like a card embedded inside a page.

- [ ] **Step 8: Verify**

Run the Step 2 command and capture Assembly normal screenshot plus toolbar/canvas/statusbar crops. Update G06, G09, G10, G11, and G20 rows.

### Task 5: Generated Assets, Asset Pool Layout, And Sticky Upload

**Files:**
- Modify: `backend/art_pipeline/course_planner/generated_assets.py`
- Modify: `backend/art_pipeline/course_planner/scene_package_routes.py`
- Modify: `backend/art_pipeline/course_planner/scene_package_models.py`
- Modify: `frontend/src/features/coursePlanner/components/AssemblyAssetPoolPanel.tsx`
- Modify: `frontend/src/features/coursePlanner/components/assemblyAssetPool.css`
- Modify: `frontend/src/features/coursePlanner/components/assemblyAssetPoolBrowser.tsx`
- Modify: `frontend/src/features/coursePlanner/components/GeneratedChapterAssetsDrawer.tsx`
- Modify: `frontend/src/features/coursePlanner/components/generatedChapterAssetsModel.ts`
- Modify: `frontend/src/features/coursePlanner/scenePackageApi.ts`
- Modify: `frontend/src/features/coursePlanner/types.ts`
- Test: `backend/tests/course_planner/test_scene_package_routes_generated_assets.py`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-asset-pool.test.tsx`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-final.test.tsx`

- [ ] **Step 1: Write backend generated-asset tests**

Assert:

- current Chapter complete-image runs are listed;
- Codex-generated image files are importable regardless of quality;
- missing files return unavailable reason;
- already materialized run assets return `added` with existing chapter asset id;
- another Chapter's run assets are excluded.

- [ ] **Step 2: Run backend tests**

Run:

```bash
cd /Users/guojunxi/Desktop/work/art-pipeline-design/backend
python -m pytest tests/course_planner/test_scene_package_routes_generated_assets.py -q
```

- [ ] **Step 3: Write frontend asset-pool tests**

Assert:

- `Generated assets` group appears before `Uploads` when generated-lineage assets exist;
- `Uploads` is secondary;
- functional test assets are accepted regardless of whether they are final production art;
- cards show thumbnail, stable name, dimensions or source metadata, usage count, add action, locate action when used;
- cards do not show stray `x` text or duplicate `Unnamed asset` labels;
- cards use a fixed rectangular image frame and a top/middle/bottom layout rather than the current tall/long row shape;
- group headings expose a small collapse/expand button using the existing shared icon-button style and `aria-expanded`;
- direct upload is available as a sticky bottom button in the left Asset Pool panel, not only as a top toolbar control;
- drawer opens as overlay and is not inside `.assembly-editor-layout`.

- [ ] **Step 4: Run frontend asset tests**

Run:

```bash
cd /Users/guojunxi/Desktop/work/art-pipeline-design/frontend
npm test -- --run tests/coursePlanner/chapter-workspace-assembly-editor-asset-pool.test.tsx tests/coursePlanner/chapter-workspace-assembly-editor-final.test.tsx
```

- [ ] **Step 5: Implement generated-first grouping**

Keep generated-lineage assets first in the visible Asset Pool. Preserve direct upload as a secondary path. Do not let empty generated state hide the import action.

- [ ] **Step 6: Implement compact Asset Pool cards and sticky upload**

In `AssemblyAssetPoolPanel.tsx`, keep `AssetPoolGroup` as the section owner and add local collapsed-section state keyed by group label. The group header should render a small icon button with `aria-label="Collapse Generated assets"` or `aria-label="Expand Generated assets"`.

In `assemblyAssetPool.css`, replace the current long/tall item treatment with:

```css
.assembly-editor-assets-column .assembly-asset-row {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
}

.assembly-editor-assets-column .assembly-asset-thumb {
  width: 100%;
  aspect-ratio: 4 / 3;
  height: auto;
  object-fit: contain;
}
```

Pin the upload action at the bottom of the left panel with a sticky footer class owned by the Asset Pool, so scrolling asset groups does not move the upload button out of reach.

- [ ] **Step 7: Verify**

Run Step 2 and Step 4 commands. Capture Asset Pool generated state and Generated Chapter Assets drawer overlay. Update G07, G08, G18, G19, and generated-asset issue rows.

### Task 6: Compact Grouped Layer Tree, Multi-select, Properties, And Delete Verification

**Files:**
- Modify: `frontend/src/features/coursePlanner/components/AssemblyLayerTree.tsx`
- Modify: `frontend/src/features/coursePlanner/components/assemblyLayerTreeModel.ts`
- Modify: `frontend/src/features/coursePlanner/components/AssemblyPlacementProperties.tsx`
- Modify: `frontend/src/features/coursePlanner/components/useAssemblyWorkspaceController.ts`
- Modify: `frontend/src/features/coursePlanner/assembly/assemblyManifestDraft.ts`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-properties.test.tsx`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-canvas.test.tsx`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-asset-actions.test.tsx`

- [x] **Step 1: Write interaction tests**

Assert:

- Shift-click and modifier-click multi-select on canvas;
- Shift-click and modifier-click multi-select in layer tree;
- grouping creates a group row;
- layer rows render as compact one-line rows with row-level drag, thumbnail, name, role, and visibility eye icon;
- lock controls may be omitted in this pass, but the row must reserve the right-side icon area cleanly;
- layer names and roles do not wrap onto a second row in the normal reference width;
- ungroup preserves child placements;
- deleting group opens confirmation and deletes group plus child placements;
- deleting placement opens confirmation;
- top layer row is frontmost;
- multi-selection properties show `N selected`;
- mixed fields show mixed state rather than internal normalized values.

- [x] **Step 2: Run interaction tests**

Run:

```bash
cd /Users/guojunxi/Desktop/work/art-pipeline-design/frontend
npm test -- --run tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx tests/coursePlanner/chapter-workspace-assembly-editor-properties.test.tsx tests/coursePlanner/chapter-workspace-assembly-editor-canvas.test.tsx tests/coursePlanner/chapter-workspace-assembly-editor-asset-actions.test.tsx
```

- [x] **Step 3: Wire group-aware tree and selection**

Use the existing shared authoring helpers where possible. Keep one-level group support only. Do not save collapsed state, selection, zoom, pan, or panel width to the manifest.

- [x] **Step 4: Recompose the layer row**

Update `AssemblyLayerTree.tsx` from the current `64px` two-line row toward the reference layout:

```tsx
<div className="assembly-layer-row-grid">
  <img className="assembly-layer-thumb" alt="" src={thumbnailUrl} />
  <strong className="assembly-layer-name">{row.name}</strong>
  <span className="assembly-layer-role">{row.typeLabel}</span>
  <button type="button" aria-label={`Hide ${row.name}`} className="assembly-layer-visibility-button">
    <Eye size={15} aria-hidden="true" />
  </button>
</div>
```

The tree remains `react-arborist`. Dragging must still call `handleLayerTreeMove`; the new visual drag handle is not a second drag system.

- [x] **Step 5: Normalize delete confirmation**

Every delete entry point must go through confirmation:

- Scene Pack;
- Chapter;
- Complete Image;
- Empty Scene replacement with existing placements;
- Chapter Asset;
- placement/layer;
- group;
- final replacement or clearing authored facts.

- [x] **Step 6: Verify**

Run the Step 2 command. Capture multi-select, grouped layer tree, properties multi-select, and delete dialog screenshots. Update G12, G13, G14, G20, and related July 6 rows.

### Task 7: Final Visual QA Gate

**Files:**
- Modify: `docs/course-planner-ux-gap-coverage-2026-07-07.md`
- Use: `frontend/tools/capture-course-planner-screenshots.mjs`

- [x] **Step 1: Run frontend Course Planner tests**

Run:

```bash
cd /Users/guojunxi/Desktop/work/art-pipeline-design/frontend
npm test -- --run tests/coursePlanner
npm run build
```

Expected: all Course Planner frontend tests pass and Vite build succeeds.

- [x] **Step 2: Run backend Course Planner tests**

Run:

```bash
cd /Users/guojunxi/Desktop/work/art-pipeline-design/backend
uv run --python 3.12 --extra dev pytest tests/course_planner -q
```

Expected: backend Course Planner tests pass. The literal `python -m pytest ...` command cannot start in this shell because `python` is not on PATH.

- [x] **Step 3: Capture visual states**

Run:

```bash
cd /Users/guojunxi/Desktop/work/art-pipeline-design/frontend
node tools/capture-course-planner-screenshots.mjs
```

Required screenshots:

- Board loaded;
- Chapter loading;
- Chapter loaded;
- Assembly loading;
- Assembly loaded normal state;
- Generated Chapter Assets drawer open;
- Assembly multi-select;
- Assembly grouping;
- delete confirmation dialog.

- [x] **Step 4: Run hygiene gate**

Run:

```bash
cd /Users/guojunxi/Desktop/work/art-pipeline-design
git diff --check
```

Expected: no whitespace errors.

- [x] **Step 5: Final coverage audit**

Update `docs/course-planner-ux-gap-coverage-2026-07-07.md` so no `G01-G21` or July 6 issue row remains `unverified`. Rows may be `verified`, `rejected-with-reason`, or `deferred-with-user-accepted-scope`; no silent gaps.

## Final Completion Checklist

- [x] `G01-G21` have code, test, and screenshot evidence.
- [x] July 6 issue IDs `1-42` have explicit status.
- [x] `Save Assembly` visible text toolbar action is removed or converted.
- [x] Always-visible alignment toolbar row is removed.
- [x] Top-toolbar dashed-square `Show boxes` toggle is removed.
- [x] Selected frame, label, handles, and rotation control render above placement images.
- [x] Properties rotation and canvas rotation both update `placement.transform.rotation_deg`.
- [x] Asset Pool cards use fixed image frames, compact three-part structure, collapsible sections, and sticky bottom upload.
- [x] Generated assets are primary when available; `Uploads` is secondary.
- [x] Layer tree rows are compact one-line rows with left drag handle and right visibility eye icon.
- [x] Every destructive action opens confirmation.
- [x] Normal Assembly reference and drawer overlay reference are visually checked against running UI.
- [x] Old rejected tests are deleted, inverted, or rewritten.
- [x] `npm test -- --run tests/coursePlanner` passes.
- [x] `npm run build` passes.
- [x] `uv run --python 3.12 --extra dev pytest tests/course_planner -q` passes.
- [x] `git diff --check` passes.
