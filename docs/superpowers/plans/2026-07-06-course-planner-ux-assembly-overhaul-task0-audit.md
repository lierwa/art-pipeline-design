# Course Planner Assembly UX Overhaul Task 0 Audit

Date: 2026-07-06

Scope: read-only patch hygiene and contract audit for
`docs/superpowers/plans/2026-07-06-course-planner-ux-assembly-overhaul.md`.
This audit intentionally does not change runtime or test implementation files.

## Refreshed Baseline

Commands used:

```powershell
git status --short
git status --short -- frontend/src/features/coursePlanner frontend/tests/coursePlanner backend/art_pipeline/course_planner backend/tests/course_planner docs
git diff --name-status -- frontend/src/features/coursePlanner frontend/tests/coursePlanner backend/art_pipeline/course_planner backend/tests/course_planner docs
```

Current whole-repository dirty summary:

- Tracked dirty entries: 48
- Untracked entries: 44
- Modified tracked entries: 46
- Deleted tracked entries: 2
- Dirty scope now extends beyond Course Planner into `CONTEXT.md`, `frontend/package*.json`,
  `frontend/src/app/routes/AppRoutes.tsx`, shared canvas files, `frontend/src/styles.css`,
  canvas tests, `frontend/tools/`, `output/`, and `scene_library/.../scene_package/`.

Specified-range tracked diff summary:

- Total tracked diff entries in the specified Task 0 range: 37
- Course Planner frontend runtime entries: 22
- Course Planner frontend test entries: 14
- Docs tracked entries: 1
- Backend specified range dirty entries: 0

Specified-range tracked diff entries:

```text
M docs/adr/0005-use-canvas-and-tree-libraries-for-assembly-authoring.md
M frontend/src/features/coursePlanner/assembly/assemblyManifestDraft.ts
M frontend/src/features/coursePlanner/assembly/assemblyWorkspaceState.ts
D frontend/src/features/coursePlanner/assembly/tldrawAssemblyAdapter.ts
M frontend/src/features/coursePlanner/components/AssemblyAssetPoolPanel.tsx
M frontend/src/features/coursePlanner/components/AssemblyEditorCanvas.tsx
M frontend/src/features/coursePlanner/components/AssemblyLayerTree.tsx
M frontend/src/features/coursePlanner/components/AssemblyPlacementProperties.tsx
M frontend/src/features/coursePlanner/components/AssemblyTargetCoveragePanel.tsx
M frontend/src/features/coursePlanner/components/AssemblyWorkspaceFeedback.tsx
M frontend/src/features/coursePlanner/components/AssemblyWorkspacePanel.tsx
M frontend/src/features/coursePlanner/components/ChapterSceneStudio.tsx
M frontend/src/features/coursePlanner/components/CompleteSceneImagesPanel.tsx
M frontend/src/features/coursePlanner/components/EmptySceneImagesPanel.tsx
M frontend/src/features/coursePlanner/components/FinalScenePanel.tsx
M frontend/src/features/coursePlanner/components/LibrarySelectionPanel.tsx
M frontend/src/features/coursePlanner/components/PromptFactsPanel.tsx
M frontend/src/features/coursePlanner/components/assemblyWorkspace.css
M frontend/src/features/coursePlanner/components/coursePlanner.css
M frontend/src/features/coursePlanner/components/coursePlannerPanels.css
M frontend/src/features/coursePlanner/pages/ChapterWorkspacePage.tsx
M frontend/src/features/coursePlanner/pages/SceneCategoryBoardPage.tsx
M frontend/src/features/coursePlanner/scenePackageMedia.ts
M frontend/tests/coursePlanner/assembly/assemblyManifestDraft.test.ts
D frontend/tests/coursePlanner/assembly/tldrawAssemblyAdapter.test.ts
M frontend/tests/coursePlanner/assemblyEditorDependencyMocks.tsx
M frontend/tests/coursePlanner/assemblyEditorHarness.tsx
M frontend/tests/coursePlanner/assemblyEditorTestUtils.ts
M frontend/tests/coursePlanner/chapter-workspace-assembly-editor-autosave.test.tsx
M frontend/tests/coursePlanner/chapter-workspace-assembly-editor-canvas.test.tsx
M frontend/tests/coursePlanner/chapter-workspace-assembly-editor-final.test.tsx
M frontend/tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx
M frontend/tests/coursePlanner/chapter-workspace-assembly-editor-properties.test.tsx
M frontend/tests/coursePlanner/chapter-workspace-assembly-editor.test.tsx
M frontend/tests/coursePlanner/chapter-workspace-library-actions.test.tsx
M frontend/tests/coursePlanner/chapter-workspace.test.tsx
M frontend/tests/coursePlanner/scene-category-board.test.tsx
```

Baseline capture note:

- The implementation plan asks Task 0 to capture a readable diff. The current working tree is too broad for a
  useful full diff inside this audit document, so this audit records `name-status`, rejected-lock line references,
  and grouped classification as the executable summary.
- Later workers must locally inspect the focused diff for their owning files before editing. Do not rely only on
  this grouped audit when modifying a runtime or test file.

## Scoped Untracked Capture And Classification

Command used:

```powershell
git status --short -- frontend/src/features/coursePlanner frontend/tests/coursePlanner backend/art_pipeline/course_planner backend/tests/course_planner docs
```

Docs source-of-truth, ADR, plans, and reference assets:

- `docs/adr/0016-reuse-art-pipeline-canvas-for-assembly-authoring.md`
- `docs/adr/0017-remove-asset-type-chips-from-assembly-pool.md`
- `docs/adr/0018-use-shared-art-pipeline-authoring-protocols-for-assembly.md`
- `docs/assets/course-planner-assembly-editor-normal-reference.png`
- `docs/assets/course-planner-assembly-generated-assets-drawer-overlay-on-current-reference.png`
- `docs/assets/course-planner-assembly-generated-assets-drawer-overlay-reference.png`
- `docs/assets/course-planner-assembly-generated-assets-drawer-reference.png`
- `docs/course-planner-ux-issue-record-2026-07-06.md`
- `docs/superpowers/plans/2026-07-05-placement-editor-redesign.md`
- `docs/superpowers/plans/2026-07-05-placement-editor-visual-restoration-iteration.md`
- `docs/superpowers/plans/2026-07-06-course-planner-ux-assembly-overhaul.md`
- `docs/superpowers/plans/2026-07-06-course-planner-ux-assembly-overhaul-task0-audit.md`

New Course Planner assembly runtime files:

- Assembly policy/model/controller/lifecycle/save boundaries:
  `frontend/src/features/coursePlanner/assembly/assemblyAutosavePolicy.ts`,
  `frontend/src/features/coursePlanner/assembly/assemblyCanvasViewModel.ts`,
  `frontend/src/features/coursePlanner/components/useAssemblyWorkspaceController.ts`,
  `frontend/src/features/coursePlanner/components/useAssemblyWorkspaceLifecycle.ts`,
  `frontend/src/features/coursePlanner/components/useAssemblyWorkspaceSaveController.ts`
- Assembly authoring UI and route:
  `frontend/src/features/coursePlanner/components/AssemblyAuthoringCanvas.tsx`,
  `frontend/src/features/coursePlanner/components/AssemblyPlacementContextMenu.tsx`,
  `frontend/src/features/coursePlanner/pages/ChapterAssemblyEditorPage.tsx`
- Assembly asset pool, tree, shell, right rail, constants, and display-name helpers:
  `frontend/src/features/coursePlanner/components/assemblyAssetPool.css`,
  `frontend/src/features/coursePlanner/components/assemblyAssetPoolBrowser.tsx`,
  `frontend/src/features/coursePlanner/components/assemblyDisplayNames.ts`,
  `frontend/src/features/coursePlanner/components/assemblyEditorShell.css`,
  `frontend/src/features/coursePlanner/components/assemblyLayerTreeModel.ts`,
  `frontend/src/features/coursePlanner/components/assemblyRightRail.css`,
  `frontend/src/features/coursePlanner/components/assemblyWorkspaceConstants.ts`,
  `frontend/src/features/coursePlanner/components/mediaDisplayNames.ts`
- Chapter Studio layout/media helpers:
  `frontend/src/features/coursePlanner/components/chapterMediaPanels.css`,
  `frontend/src/features/coursePlanner/components/chapterStudioLayout.css`,
  `frontend/src/features/coursePlanner/components/chapterStudioShared.css`,
  `frontend/src/features/coursePlanner/hooks/useChapterScenePackageWorkspace.ts`

New Course Planner tests and harnesses:

- `frontend/tests/coursePlanner/assembly/assemblyCanvasViewModel.test.ts`
- `frontend/tests/coursePlanner/assemblyEditorHarnessComponent.tsx`
- `frontend/tests/coursePlanner/chapter-scene-package-workspace-stale-load.test.tsx`
- `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-asset-actions.test.tsx`
- `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-asset-pool.test.tsx`
- `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-autosave-retry.test.tsx`
- `frontend/tests/coursePlanner/course-planner-visual-screenshot-tool.test.ts`
- `frontend/tests/coursePlanner/coursePlannerVisualReferenceFixtures.ts`

Backend scoped untracked:

- None observed under `backend/art_pipeline/course_planner` or `backend/tests/course_planner` in the scoped
  status output.

## Tracked Dirty Classification

Rewrite or invert rejected locks:

- `frontend/src/features/coursePlanner/components/AssemblyAssetPoolPanel.tsx`
- `frontend/src/features/coursePlanner/components/AssemblyEditorCanvas.tsx`
- `frontend/src/features/coursePlanner/components/AssemblyLayerTree.tsx`
- `frontend/src/features/coursePlanner/components/AssemblyWorkspacePanel.tsx`
- `frontend/src/features/coursePlanner/pages/ChapterWorkspacePage.tsx`
- `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-autosave.test.tsx`
- `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-canvas.test.tsx`
- `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-final.test.tsx`
- `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx`
- `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-properties.test.tsx`
- `frontend/tests/coursePlanner/chapter-workspace-assembly-editor.test.tsx`
- `frontend/tests/coursePlanner/chapter-workspace.test.tsx`

Useful helpers to preserve or expand:

- `frontend/src/features/coursePlanner/assembly/assemblyManifestDraft.ts`
- `frontend/src/features/coursePlanner/assembly/assemblyWorkspaceState.ts`
- `frontend/src/features/coursePlanner/components/AssemblyPlacementProperties.tsx`
- `frontend/src/features/coursePlanner/components/AssemblyTargetCoveragePanel.tsx`
- `frontend/src/features/coursePlanner/components/AssemblyWorkspaceFeedback.tsx`
- `frontend/tests/coursePlanner/assembly/assemblyManifestDraft.test.ts`
- `frontend/tests/coursePlanner/assemblyEditorDependencyMocks.tsx`
- `frontend/tests/coursePlanner/assemblyEditorHarness.tsx`
- `frontend/tests/coursePlanner/assemblyEditorTestUtils.ts`

Docs, reference assets, or source-of-truth changes:

- `docs/adr/0005-use-canvas-and-tree-libraries-for-assembly-authoring.md`

Protocol cleanup that may be useful but must be checked by owning implementation tasks:

- `frontend/src/features/coursePlanner/assembly/tldrawAssemblyAdapter.ts` is deleted.
- `frontend/tests/coursePlanner/assembly/tldrawAssemblyAdapter.test.ts` is deleted.

Unrelated or out-of-scope for Task 0; leave untouched in this audit:

- `frontend/src/features/coursePlanner/components/ChapterSceneStudio.tsx`
- `frontend/src/features/coursePlanner/components/CompleteSceneImagesPanel.tsx`
- `frontend/src/features/coursePlanner/components/EmptySceneImagesPanel.tsx`
- `frontend/src/features/coursePlanner/components/FinalScenePanel.tsx`
- `frontend/src/features/coursePlanner/components/LibrarySelectionPanel.tsx`
- `frontend/src/features/coursePlanner/components/PromptFactsPanel.tsx`
- `frontend/src/features/coursePlanner/components/assemblyWorkspace.css`
- `frontend/src/features/coursePlanner/components/coursePlanner.css`
- `frontend/src/features/coursePlanner/components/coursePlannerPanels.css`
- `frontend/src/features/coursePlanner/pages/SceneCategoryBoardPage.tsx`
- `frontend/src/features/coursePlanner/scenePackageMedia.ts`
- `frontend/tests/coursePlanner/chapter-workspace-library-actions.test.tsx`
- `frontend/tests/coursePlanner/scene-category-board.test.tsx`

## Stale Audit Warning

`output/verification/assembly-rebuild-patch-audit-2026-07-05.md` currently exists, but it
predates this plan and current dirty baseline. It is stale and must not be used as execution
authority for the 2026-07-06 Course Planner Assembly UX overhaul. Use this Task 0 audit,
the source issue record, ADR 0018, and the main implementation plan instead.

## Current File Existence Correction

These files currently exist and must not be reported as missing:

- `frontend/src/features/coursePlanner/assembly/assemblyAutosavePolicy.ts`
- `frontend/src/features/coursePlanner/assembly/assemblyCanvasViewModel.ts`
- `frontend/src/features/coursePlanner/components/AssemblyAuthoringCanvas.tsx`
- `frontend/src/features/coursePlanner/components/useAssemblyWorkspaceController.ts`

## Rejected Lock Disposition

| File:line | Behavior currently protected or implemented | Disposition | Owning task |
|---|---|---|---|
| `frontend/tests/coursePlanner/chapter-workspace.test.tsx:195` | Chapter route asserts `.top-app-bar` is absent. | invert | Task 1 |
| `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx:93` | Assembly route asserts `.top-app-bar` is absent. | invert | Task 1 |
| `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx:456` | `Group selected layers` is asserted absent from the visible layer tree. | invert | Task 6 |
| `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx:457` | `Ungroup selected layer` is asserted absent from the visible layer tree. | invert | Task 6 |
| `frontend/src/features/coursePlanner/components/AssemblyLayerTree.tsx:68` | Visible layer tree maps every row to `children: []`, preserving flat-only display. | rewrite | Task 6 |
| `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx:227` | Shift-click canvas interaction is exercised, but the following assertions still expect single selection. | rewrite | Task 7 |
| `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx:229` | After Shift-click, `Breakfast bowl` remains the only pressed row. | rewrite | Task 7 |
| `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx:230` | After Shift-click, `Cleanup cloth` is asserted unpressed. | rewrite | Task 7 |
| `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-canvas.test.tsx:281` | Canvas modified click starts a hit-test interaction that still routes through a single selection callback. | rewrite | Task 7 |
| `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-canvas.test.tsx:285` | The modified click uses `shiftKey: true`, but the test does not require additive selection. | rewrite | Task 7 |
| `frontend/src/features/coursePlanner/components/AssemblyAuthoringCanvas.tsx:205` | `selectedElementIds` is derived from single `selectedPlacementId`. | rewrite | Task 7 |
| `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-asset-pool.test.tsx:88` | Asset Pool requires `Used` label. | rewrite | Task 8 |
| `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-asset-pool.test.tsx:89` | Asset Pool requires `Unused` label. | rewrite | Task 8 |
| `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-asset-pool.test.tsx:95` | Asset usage legend requires `Used`. | rewrite | Task 8 |
| `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-asset-pool.test.tsx:96` | Asset usage legend requires `Unused`. | rewrite | Task 8 |
| `frontend/src/features/coursePlanner/components/AssemblyAssetPoolPanel.tsx:44` | `usedPlacementByAssetId` stores one placement id per asset id. | rewrite | Task 8 |
| `frontend/src/features/coursePlanner/components/AssemblyAssetPoolPanel.tsx:238` | Asset usage is reduced to boolean `isUsed`. | rewrite | Task 8 |
| `frontend/src/features/coursePlanner/components/AssemblyAssetPoolPanel.tsx:240` | Used assets get `Locate ...` as the primary card action instead of always allowing another placement. | rewrite | Task 8 |
| `frontend/src/features/coursePlanner/components/AssemblyAssetPoolPanel.tsx:304` | Used/Unused status dot exposes binary usage state. | rewrite | Task 8 |
| `frontend/src/features/coursePlanner/components/AssemblyAssetPoolPanel.tsx:319` | Usage legend renders `Used`. | rewrite | Task 8 |
| `frontend/src/features/coursePlanner/components/AssemblyAssetPoolPanel.tsx:323` | Usage legend renders `Unused`. | rewrite | Task 8 |
| `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-asset-pool.test.tsx:109` | Test name locks add behavior to an unused asset path. | rewrite | Task 8 |
| `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-asset-pool.test.tsx:131` | After adding, Asset Pool expects `Locate Placement` instead of a usage count plus repeat add path. | rewrite | Task 8 |
| `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-asset-pool.test.tsx:134` | Test locks clicking a used asset card to locating an existing placement. | rewrite | Task 8 |
| `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx:165` | Test name locks the asset flow to unused -> used. | rewrite | Task 8 |
| `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx:180` | Test expects `Used` after adding an asset. | rewrite | Task 8 |
| `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx:181` | Test expects `Locate Placement` after adding an asset. | rewrite | Task 8 |
| `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx:192` | Test name locks used asset click to locating an existing placement. | rewrite | Task 8 |
| `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx:197` | Test clicks `Locate Placement` as the used-asset path. | rewrite | Task 8 |
| `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx:332` | Duplicate Chapter Asset is used as workaround for a second row instead of multiple placements from one asset. | delete | Task 6 / Task 8 |
| `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx:337` | Test clicks `Duplicate Chapter Asset` to obtain another addable row. | delete | Task 6 / Task 8 |
| `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx:343` | Duplicated asset flow still expects `Locate Placement`. | delete | Task 6 / Task 8 |
| `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx:344` | Duplicated asset row expects separate `Add to Assembly`. | delete | Task 6 / Task 8 |
| `frontend/src/features/coursePlanner/types.ts:160` | Frontend lineage type accepts only `direct_upload`. | rewrite | Task 8 after Task 4 |
| `backend/art_pipeline/course_planner/scene_package_models.py:162` | Backend lineage model accepts only `Literal["direct_upload"]`. | rewrite | Task 4 |
| `backend/tests/course_planner/test_scene_package_models.py:63` | Test name locks Chapter Asset lineage to direct-upload-only. | invert | Task 4 |
| `backend/tests/course_planner/test_scene_package_models.py:68` | Test rejects pipeline/run asset lineage. | invert | Task 4 |
| `frontend/tests/coursePlanner/course-planner-scene-package-api.test.ts:92` | API test only asserts direct upload lineage in existing route coverage. | keep-and-expand | Task 8 |
| `frontend/tests/coursePlanner/course-planner-scene-package-api.test.ts:438` | API fixture still only models `direct_upload` lineage. | keep-and-expand | Task 8 |

## Keepers

- `frontend/src/features/coursePlanner/components/assemblyLayerTreeModel.ts:29` should be preserved as the
  group-aware tree projection helper and wired into the visible tree in Task 6.
- `frontend/src/features/coursePlanner/components/assemblyLayerTreeModel.ts:75` and
  `frontend/src/features/coursePlanner/components/assemblyLayerTreeModel.ts:91` should be preserved as
  group/ungroup draft helpers, then expanded with one-level group and delete semantics in Task 6.
- `frontend/src/features/coursePlanner/components/assemblyLayerTreeModel.ts:240` should remain the move-order
  protocol base, then be expanded for visible group-aware Arborist moves in Task 6.
- `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx:405` protects layer row drag
  reorder and canvas z-order sync. Keep and expand for group rows and top-row-frontmost behavior in Task 6/7.
- `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx:429` protects Ctrl-based
  list multi-selection. Keep and expand with Shift/range/canvas selection in Task 5/6/7.
- `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-properties.test.tsx:110` protects batch role
  editing direction. Keep and expand with mixed geometry, batch delete/group/alignment in Task 9.
- `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-canvas.test.tsx:98` protects undo/redo/save
  and viewport shortcut direction. Keep and expand in Task 7. Autosave/controller ownership belongs primarily
  to Task 7 and Task 9, not Task 1.
- `frontend/tests/coursePlanner/chapter-workspace.test.tsx:37` and
  `frontend/tests/coursePlanner/chapter-workspace.test.tsx:125` protect visual reference fixture integrity and
  runtime import boundaries. Keep unless Task 11 replaces them with a stronger visual QA check.

## Risks

- The dirty baseline is broad and moving. Later workers must refresh `git status --short` and targeted diff
  before editing files touched by Course Planner, shared canvas, routing, or package metadata.
- Runtime and tests both currently preserve rejected locks. Follow-up tasks must delete, invert, or rewrite
  those locks before adding new behavior; do not layer compatibility branches over them.
- Backend specified range currently has no tracked dirty diff, but existing backend models/tests still enforce
  the rejected direct-upload-only lineage contract.
- `frontend/package.json` and `frontend/package-lock.json` are dirty outside the Task 0 specified range. Any
  later dependency claim must verify Windows/macOS install behavior according to project rules.
- Untracked `frontend/tools/`, `output/`, and `scene_library/.../scene_package/` are outside this Task 0 audit
  edit scope and must be left untouched unless an owning task explicitly includes them.
