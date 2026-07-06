# Assembly Rebuild Patch Audit - 2026-07-05

## Baseline Diff

- Ran `git diff --stat` before implementation edits. The dirty tree contains 32 tracked files with 4096 insertions and 2212 deletions, concentrated in Course Planner UI and tests.
- Ran `git diff --name-only` before implementation edits. The tracked dirty files include Assembly workspace/runtime files, Course Planner shell/media panels, and Course Planner tests.
- `git status --short` also shows many untracked files from prior work, including new ADRs, plan files, Assembly helper modules, controller hooks, visual tooling, and generated output. These are treated as existing dirty work and are not staged by Task 0.
- No runtime source code changes were made for this audit task.

## Keep

- `frontend/src/features/coursePlanner/assembly/assemblyWorkspaceState.ts`: keep `manifestKeyOf` excluding `updated_at`. The diff removes server persistence metadata from the material manifest key and includes a Chinese WHY comment; this protects a real dirty/conflict invariant.
- `frontend/src/features/coursePlanner/components/AssemblyWorkspaceFeedback.tsx`: keep compact banner behavior, restyle after shell rebuild. Current dirty changes make save/conflict feedback less workspace-blocking, but they do not fix the autosave conflict root cause.

## Rewrite

- `frontend/src/features/coursePlanner/components/AssemblyEditorCanvas.tsx`: replace tldraw path with art-pipeline canvas adapter. Current dirty changes add toolbar/control wiring around the tldraw editor path; this preserves the rejected primary interaction model.
- `frontend/src/features/coursePlanner/components/AssemblyAssetPoolPanel.tsx`: keep resource list concept, remove rejected controls/tags. The current patch extracts browser controls and grid/list state, but still imports `AssetFilter`, exposes filter/list mode state, and surfaces target linkage as card text.
- `frontend/src/features/coursePlanner/components/assemblyAssetPoolBrowser.tsx`: rewrite or remove. It is untracked prior work that implements `All` / `Target` / `Prop` / `Scene` chips, a fake filter icon, and grid/list toggles that the rebuild explicitly rejects.
- `frontend/src/features/coursePlanner/components/AssemblyWorkspacePanel.tsx`: replace right rail and toolbar composition. The current patch extracts controller hooks and columns, but still renders a fake `Layers` / `Properties` tab strip and disabled preview/export commands.
- `frontend/src/features/coursePlanner/components/AssemblyPlacementProperties.tsx`: rewrite for compact 35% top inspector. Current dirty changes expand property UI and selection behavior, but the accepted design needs a smaller high-frequency inspector above the placement list.
- `frontend/src/features/coursePlanner/components/useAssemblyWorkspaceController.ts`: rewrite as part of Task 1 autosave policy work. It is untracked prior work and still imports `createInitialPlacementTransform` from `tldrawAssemblyAdapter`, so it cannot be treated as the final Assembly controller.
- `frontend/src/features/coursePlanner/components/useAssemblyWorkspaceSaveController.ts`: audit/rewrite as part of Task 1. It contains useful separation of save side effects, but there is no standalone autosave policy helper yet and Task 0 must not claim the drag/autosave conflict is fixed.
- `frontend/src/features/coursePlanner/components/assemblyWorkspace.css`: rewrite with the new shell after runtime replacement. The current CSS supports the failed tldraw/right-rail shell and rejected asset browser controls.
- `frontend/src/features/coursePlanner/components/assemblyEditorShell.css`: untracked prior styling; keep only if Task 7 proves it supports the rebuilt art-pipeline canvas shell.
- `frontend/tools/course-planner-visual-harness.tsx` and `frontend/tests/coursePlanner/coursePlannerVisualReferenceFixtures.ts`: untracked visual harness/fixture work. Revisit in Task 8 after the real rebuilt Assembly surface exists.
- `frontend/tools/capture-course-planner-screenshots.mjs`: use-only verification script from the plan's Visual Harness And Fixtures File Map. Do not rewrite for Task 0; run it in Task 8 after the Assembly runtime and visual fixture are rebuilt.

## Remove After Replacement

- `frontend/src/features/coursePlanner/assembly/tldrawAssemblyAdapter.ts`: remove once the art-pipeline canvas adapter is wired. It is still the source of `createInitialPlacementTransform` in untracked controller work.
- `frontend/src/features/coursePlanner/components/assemblyCanvasControls.ts`: remove after replacement. It is untracked prior work containing only tldraw-style editor control callbacks.
- `frontend/src/features/coursePlanner/components/AssemblyLayerTree.tsx`: discard rather than polish. Current dirty changes retain fake layer toolbar/grouping behavior and do not implement the accepted placement/layer list.
- `frontend/src/features/coursePlanner/components/assemblyLayerTreeModel.ts`: remove with `AssemblyLayerTree.tsx`. It is untracked prior work for an Arborist-style grouped layer tree, not the required front-to-back placement list over `layer_order`.

## Tests To Rewrite

- Tests that assert `All` / `Target` / `Prop` / `Scene` chips.
- Tests that assert fake layer toolbar buttons.
- Tests that rely on tldraw DOM or tldraw controls.
- `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-autosave.test.tsx`: rewrite around the explicit autosave state-machine invariants; current dirty tests are baseline only and do not prove the accepted policy.
- `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-canvas.test.tsx`: rewrite away from tldraw DOM/control assumptions and toward shared canvas selection, pan, zoom, fit, drag, resize, and blank-click behavior.
- `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx`: rewrite away from fake layer toolbar/group/tree assertions and toward bidirectional canvas/list selection plus `layer_order[0]` frontmost behavior.
- `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-properties.test.tsx`: rewrite for the compact top inspector with name, role, position, size, and rotation only.
- `frontend/tests/coursePlanner/chapter-workspace-assembly-editor.test.tsx`: rewrite asset pool assertions to require grid/search/upload/used-unused and reject filter icon, chips, grid/list toggle, and Linked/Unlinked card tags.
- `frontend/tests/coursePlanner/assemblyEditorHarness.tsx` and `frontend/tests/coursePlanner/assemblyEditorDependencyMocks.tsx`: audit when rewriting tests; current dirty changes support the failed shell.

## File Map Inspection Notes

- Assembly state/save files: `assemblyWorkspaceState.ts` has the correct `updated_at` exclusion. `assemblyManifestDraft.ts` is present but not dirty. `assemblyAutosavePolicy.ts` is missing and belongs to Task 1. `useAssemblyWorkspaceController.ts` and `useAssemblyWorkspaceSaveController.ts` already exist as untracked prior work and must be reconciled, not blindly accepted.
- Shared canvas reuse files: `useCanvasViewport.ts`, `CanvasStage.tsx`, `CanvasArtboard.tsx`, `CanvasOverlayLayer.tsx`, `CanvasBoxEditLayer.tsx`, `canvasStageGeometry.ts`, and `CanvasToolbar.tsx` are present and not dirty. `canvasObjectModel.ts` is missing and belongs to Task 2.
- Assembly canvas adapter files: `assemblyCanvasViewModel.ts` and `AssemblyAuthoringCanvas.tsx` are missing. `AssemblyEditorCanvas.tsx` is dirty and still represents the tldraw path. `tldrawAssemblyAdapter.ts` exists. `assemblyCanvasControls.ts` exists as untracked prior work and should be removed after replacement.
- Left asset pool files: `AssemblyAssetPoolPanel.tsx` is dirty. `assemblyAssetPoolBrowser.tsx` exists as untracked prior work and contains rejected controls. `assemblyWorkspace.css` is dirty.
- Right rail files: `AssemblyWorkspacePanel.tsx`, `AssemblyPlacementProperties.tsx`, and `AssemblyLayerTree.tsx` are dirty. `AssemblyPlacementList.tsx` and `AssemblyPlacementContextMenu.tsx` are missing. `assemblyLayerTreeModel.ts` exists as untracked prior work for the rejected old tree.
- Visual harness files: `coursePlannerVisualReferenceFixtures.ts` and `course-planner-visual-harness.tsx` exist as untracked prior work and belong to Task 8 verification after runtime rebuild. `frontend/tools/capture-course-planner-screenshots.mjs` is explicitly classified as the Task 8 screenshot capture script to use, not a Task 0 implementation target.

## Current Dirty Files Outside Task 0 Scope

- `CONTEXT.md`, `docs/adr/0005-use-canvas-and-tree-libraries-for-assembly-authoring.md`, `docs/adr/0016-reuse-art-pipeline-canvas-for-assembly-authoring.md`, `docs/adr/0017-remove-asset-type-chips-from-assembly-pool.md`, and both `docs/superpowers/plans/2026-07-05-*` files are context/planning documentation. Task 0 did not modify them.
- `frontend/src/app/routes/AppRoutes.tsx`, `frontend/src/features/coursePlanner/pages/ChapterWorkspacePage.tsx`, `frontend/src/features/coursePlanner/pages/ChapterAssemblyEditorPage.tsx`, and `frontend/src/features/coursePlanner/hooks/useChapterScenePackageWorkspace.ts` are Course Planner routing/workspace integration work from the prior dirty tree. They are out of scope for Task 0.
- `frontend/src/features/coursePlanner/components/ChapterSceneStudio.tsx`, `CompleteSceneImagesPanel.tsx`, `EmptySceneImagesPanel.tsx`, `FinalScenePanel.tsx`, `LibrarySelectionPanel.tsx`, `PromptFactsPanel.tsx`, `AssemblyTargetCoveragePanel.tsx`, `coursePlanner.css`, `coursePlannerPanels.css`, `chapterMediaPanels.css`, `chapterStudioLayout.css`, `assemblyDisplayNames.ts`, `mediaDisplayNames.ts`, and `scenePackageMedia.ts` are broader Course Planner UI/media changes. They are out of scope unless later Assembly tasks prove a dependency.
- `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-final.test.tsx`, `chapter-workspace-library-actions.test.tsx`, `chapter-workspace.test.tsx`, `chapter-scene-package-workspace-stale-load.test.tsx`, `course-planner-visual-screenshot-tool.test.ts`, and `assemblyEditorHarnessComponent.tsx` are dirty/untracked broader test or harness files. Task 0 did not edit them.
- `frontend/tools/` and `output/` contain untracked prior visual tooling/output. Task 0 only adds this audit markdown under `output/verification/`.
- `scene_library/scene_packs/scene_pack_3cff5bc75d25/chapters/chapter_96eb047029b6/scene_package/` is untracked generated data and out of scope for Task 0.

## Focused Test Baseline

- Command run from `D:\work\art-pipeline-v2-demo\frontend`:

```powershell
npm test -- --run tests/coursePlanner/chapter-workspace-assembly-editor-autosave.test.tsx tests/coursePlanner/chapter-workspace-assembly-editor-canvas.test.tsx tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx tests/coursePlanner/chapter-workspace-assembly-editor-properties.test.tsx tests/coursePlanner/chapter-workspace-assembly-editor.test.tsx
```

- Result: passed, exit code 0.
- Summary: 5 test files passed, 53 tests passed.
- Baseline concern: passing tests do not mean the Assembly rebuild is acceptable. The current suite still includes tests that protect rejected old-patch behavior, including asset category chips/view controls and fake grouped layer-tree behavior. These tests must be rewritten in later tasks before implementation success can be claimed.
