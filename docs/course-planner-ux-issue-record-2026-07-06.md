# Course Planner UX Issue Record - 2026-07-06

This record captures verified issues from the July 6, 2026 Course Planner review before implementation. It is a problem log, not a fix plan.

## Scope

- Scene Pack / Chapter Board
- Chapter Scene Studio
- Chapter Assembly Editor

## Verified Issues

### 1. Course Planner navigation is not unified across the three layers

**Screenshot symptom**

- Scene Pack / Chapter Board has the product top bar.
- Chapter Scene Studio has no top product navigation and no local back action in the normal loaded state.
- Assembly Editor has a local back icon, but the global product top bar is also hidden.

**Code facts**

- `frontend/src/app/routes/AppRoutes.tsx:18` marks every `/course-planner/chapters/` route as immersive.
- `frontend/src/app/routes/AppRoutes.tsx:30` hides `TopAppBar` for those immersive routes.
- `frontend/src/features/coursePlanner/pages/ChapterWorkspacePage.tsx:24` renders `CoursePlannerPageHeader` only in the "Chapter not found" branch.
- `frontend/src/features/coursePlanner/pages/ChapterWorkspacePage.tsx:45` renders the normal `ChapterSceneStudio` branch without an equivalent page header or back action.
- `frontend/src/features/coursePlanner/components/AssemblyWorkspaceFeedback.tsx:83` provides a local "Back to Chapter" link only for Assembly.

**Test facts**

- `frontend/tests/coursePlanner/chapter-workspace.test.tsx:195` asserts `.top-app-bar` is absent in the Chapter route.
- `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx:93` asserts `.top-app-bar` is absent in the Assembly route.

**Problem**

The product currently has no single navigation contract for board -> chapter -> assembly. The Chapter page is especially broken because it is deep-linked and loaded as a full-page workspace without either global product navigation or local back navigation.

### 2. Scene Pack / Chapter Board wastes major interactive space

**Screenshot symptom**

- A large header band occupies the first row with little operational content.
- Left Scene Pack actions consume a large card area for three basic actions.
- Right Chapter List reserves a large drag affordance area around a tiny handle.
- Secondary destructive actions are visually oversized relative to their frequency.

**Code facts**

- `frontend/src/features/coursePlanner/components/coursePlanner.css:82` gives `CoursePlannerPageHeader` a fixed minimum height.
- `frontend/src/features/coursePlanner/components/coursePlanner.css:85` uses a three-column header grid even when the center/action areas are sparse.
- `frontend/src/features/coursePlanner/components/coursePlanner.css:273` forces inline actions into an `auto-fit` grid with at least 104px tracks.
- `frontend/src/features/coursePlanner/components/coursePlanner.css:285` fixes the board into left/main/right grid columns.
- `frontend/src/features/coursePlanner/components/SelectedChapterSequence.tsx:52` uses a full button for the drag handle, rendered as `::`.

**Problem**

The board reads as a sparse admin layout instead of a dense planning board. The visible area is dominated by low-value chrome and action containers rather than scene pack/chapter content.

### 3. Chapter library actions expand inline into the readiness list

**Screenshot symptom**

- Clicking `Bind Character IP` or `Upload Reference` opens a form inside the same readiness row area, compressing content into a cramped block.

**Code facts**

- `frontend/src/features/coursePlanner/components/LibrarySelectionPanel.tsx:65` wraps `Bind Character IP` in `InlineDisclosure`.
- `frontend/src/features/coursePlanner/components/LibrarySelectionPanel.tsx:79` wraps `Upload Reference` in `InlineDisclosure`.
- `frontend/src/features/coursePlanner/components/LibrarySelectionPanel.tsx:264` implements `InlineDisclosure`.
- `frontend/src/features/coursePlanner/components/LibrarySelectionPanel.tsx:266` uses native `<details>`.
- `frontend/src/features/coursePlanner/components/LibrarySelectionPanel.tsx:267` uses native `<summary>`.

**Problem**

These actions are task flows, not row expansion details. They need enough space for selection, validation, preview, and confirmation. Inline disclosure makes the Chapter page feel broken and prevents the user from understanding the operation boundary.

### 4. Assembly multi-selection is incomplete and inconsistent

**Screenshot symptom**

- The canvas and layer list do not support Shift-click multi-selection as expected for an editor.

**Code facts**

- `frontend/src/features/coursePlanner/components/AssemblyAuthoringCanvas.tsx:155` handles canvas placement selection.
- `frontend/src/features/coursePlanner/components/AssemblyAuthoringCanvas.tsx:156` receives `toggle` / `focus` modes but still calls `onSelectPlacement(placementId)` without multi-select state.
- `frontend/src/features/coursePlanner/components/AssemblyAuthoringCanvas.tsx:205` passes `selectedElementIds={selectedPlacementId ? [selectedPlacementId] : []}` to `CanvasStage`, so canvas selection is single-id only.
- `frontend/src/features/coursePlanner/components/AssemblyLayerTree.tsx:113` resolves layer-row selection.
- `frontend/src/features/coursePlanner/components/AssemblyLayerTree.tsx:116` supports only `metaKey || ctrlKey` as the multi-select toggle.

**Test facts**

- `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx:227` sends a Shift mouse event on canvas but the asserted behavior is still single selection.
- `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx:429` covers Ctrl-based multi-selection only.

**Problem**

Layer list multi-select is partial and canvas multi-select is effectively absent. The editor cannot support normal authoring actions such as Shift range selection, canvas multi-select, group creation, or batch layer operations.

**Root cause note**

The main art-pipeline canvas already has shared multi-selection behavior in `useCanvasInteractionController` and shared list selection plumbing in `AssetTreePanel`. Assembly reused `CanvasStage` but bypassed that interaction controller, then collapsed `toggle` / `focus` selection modes back into a single `selectedPlacementId`. This is a reuse-boundary failure, not a missing capability in the main canvas system.

### 5. Layer ordering exists, but grouping/hierarchy is not wired into the visible layer tree

**Screenshot symptom**

- The right list presents flat placements only.
- There is no group concept, no group row, and no group/ungroup action.

**Code facts**

- `frontend/src/features/coursePlanner/components/AssemblyLayerTree.tsx:56` states the old tree/group UI was discarded.
- `frontend/src/features/coursePlanner/components/AssemblyLayerTree.tsx:68` maps every row to `{ children: [] }`.
- `frontend/src/features/coursePlanner/components/AssemblyLayerTree.tsx:122` handles Arborist move events.
- `frontend/src/features/coursePlanner/components/AssemblyLayerTree.tsx:131` only reads `dragIds[0]`.
- `frontend/src/features/coursePlanner/components/AssemblyLayerTree.tsx:141` only calls `movePlacementLayer`.
- `frontend/src/features/coursePlanner/components/assemblyLayerTreeModel.ts:29` has `buildLayerTreeData`.
- `frontend/src/features/coursePlanner/components/assemblyLayerTreeModel.ts:54` has `resolveGroupActionState`.
- `frontend/src/features/coursePlanner/components/assemblyLayerTreeModel.ts:75` has `createGroupedSelectionDraft`.
- `frontend/src/features/coursePlanner/components/assemblyLayerTreeModel.ts:91` has `createUngroupedSelectionDraft`.
- `frontend/src/features/coursePlanner/assembly/assemblyManifestDraft.ts:190` has `groupPlacements`.
- `frontend/src/features/coursePlanner/assembly/assemblyManifestDraft.ts:230` has `ungroupPlacementGroup`.

**Domain/document facts**

- `CONTEXT.md:85` defines `Assembly Group`.
- `CONTEXT.md:89` defines `Assembly Layer Tree`.
- `CONTEXT.md:91` says the Assembly Layer Tree controls hierarchy, grouping, and visual order.

**Test facts**

- `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx:451` explicitly tests that grouping controls stay out of the placement list.

**Problem**

The domain model and helper layer already know about groups, but the visible editor intentionally flattened them. This creates a product mismatch: users need grouping in the primary placement editor, while tests protect its absence.

**Root cause note**

The main art-pipeline right rail already uses `AssetTreePanel` plus `assetTreeModel` for drag ordering and parent/child movement. Assembly did not reuse or extract that tree protocol; it built a simplified `AssemblyLayerTree` over the same `react-arborist` library and only moved one flat placement through `movePlacementLayer`. `assemblyLayerTreeModel` already contains a closer group/tree adapter, but the visible component does not wire it.

### 6. Assembly asset pool is chapter-owned but still depends on direct upload as the only materialization path

**Screenshot symptom**

- The left asset pool looks like a file-upload bucket, not the set of chapter resources produced by the art pipeline.

**Code facts**

- `frontend/src/features/coursePlanner/components/AssemblyAssetPoolPanel.tsx:41` reads available assets from `scenePackage.chapter_assets`.
- `frontend/src/features/coursePlanner/components/AssemblyAssetPoolPanel.tsx:126` treats direct upload as the Chapter Asset fact entry.
- `frontend/src/features/coursePlanner/components/AssemblyAssetPoolPanel.tsx:157` exposes `Upload Scene Asset`.
- `frontend/src/features/coursePlanner/types.ts:159` defines `ChapterAssetLineage`.
- `frontend/src/features/coursePlanner/types.ts:160` allows only `source_kind: "direct_upload"`.
- `backend/art_pipeline/course_planner/scene_package_models.py:159` defines backend `ChapterAssetLineage`.
- `backend/art_pipeline/course_planner/scene_package_models.py:162` allows only `Literal["direct_upload"]`.
- `frontend/src/features/coursePlanner/scenePackageApi.ts:198` imports Complete Scene Images into the pipeline.
- `backend/art_pipeline/course_planner/scene_package_routes.py:252` exposes the Complete Scene Image import route.
- `backend/art_pipeline/course_planner/scene_package_routes.py:306` exposes the direct Chapter Asset upload route.

**ADR facts**

- `docs/adr/0001-materialize-chapter-assets-from-run-assets.md:3` says Chapter Assets are direct uploads only until a verified run-asset picker exists.
- `docs/adr/0013-support-direct-scene-asset-upload.md:3` says Scene Assets can come from either pipeline-harvested Complete Scene Images or direct single-object uploads.

**Problem**

The desired product behavior is not just "upload files into the asset pool." The asset pool should surface chapter-relevant pipeline outputs and allow the author to materialize them into chapter-owned assets. Direct upload can remain a secondary path, but the current lineage/API model cannot express pipeline-derived Chapter Assets.

### 7. Existing docs and tests conflict with the desired editor behavior

**Facts**

- `CONTEXT.md` already defines Assembly Groups and a hierarchy-capable Assembly Layer Tree.
- `docs/adr/0016-reuse-art-pipeline-canvas-for-assembly-authoring.md:5` says Assembly should reuse art-pipeline resource listing, selection, drag, resize, and layer/list selection.
- `docs/adr/0016-reuse-art-pipeline-canvas-for-assembly-authoring.md:13` says the right-side placement list must provide canvas/list selection synchronization and z-order control.
- Current tests assert absence of top navigation and absence of grouping controls.

**Problem**

Before implementation, the project needs to decide whether these tests are outdated regression locks or whether the domain docs are ahead of the intended UI. Keeping both as-is will keep pushing the implementation into contradictory states.

## Grilling Queue

Ask and resolve these one at a time before code changes.

1. Navigation contract: Should every Course Planner route keep the product `TopAppBar`, with deep pages adding local breadcrumbs/back actions?
   Decision: Confirmed. Keep product navigation on Board, Chapter Studio, and Assembly Editor; add local back/breadcrumb controls inside Chapter Studio and Assembly Editor.

2. Chapter library action boundary: Should `Bind Character IP` and `Upload Reference` be modal/drawer workflows instead of inline row disclosures?
   Decision: Confirmed. Use drawer/sheet, not modal and not inline disclosure. Reuse the existing Course Planner/System drawer container instead of creating a new drawer implementation.

3. Assembly selection/tree protocol: Should Assembly reuse or extract the main art-pipeline selection controller and asset-tree move protocol instead of maintaining parallel simplified `AssemblyLayerTree` logic?
   Decision: Confirmed. Assembly may keep a domain adapter that maps Placement/Group/layer_order into generic tree and canvas objects, but selection semantics, canvas/list sync, and drag move interpretation must come from the shared art-pipeline interaction protocols.

4. Assembly grouping: Should grouping be restored as a first-class visible operation in the Layer Tree?
   Decision: Confirmed. Group is an authoring/organization/batch-operation unit. It may appear as a parent node in the Layer Tree and keep grouped placements contiguous, but runtime export remains flattened `placements + layer_order`; `groups` stays authoring metadata.

5. Asset pool source: Should the primary asset pool source be verified pipeline run assets associated with this chapter, materialized into chapter-owned assets?
   Decision: Confirmed. Complete Scene Image pipeline outputs should be browsable from the Chapter, selected through a verified run-asset picker, and materialized into chapter-owned `ChapterAsset` records. Direct upload remains as a secondary source. The system must not hand-enter run asset ids or treat workspace run directories as the Chapter Asset Pool authority.

6. Scene Pack board layout: Should the board be redesigned as a dense planning workspace instead of a sparse three-panel card layout?
   Decision: Confirmed. Collapse low-frequency actions, reduce header waste, and make candidate/chapter content the dominant screen area. Use icon buttons for tool/destructive/secondary actions where an established icon exists, with accessible labels/tooltips and existing confirmation for destructive operations.

7. Chapter Scene Studio structure: Should the current progress rail plus preparation/media columns remain, with local optimization only?
   Decision: Confirmed. Keep the overall Chapter Studio structure and keep Assembly as a separate editor route. Add navigation/back context, move library actions into drawer workflows, and tune density/proportions locally instead of redesigning the whole page.

8. Assembly Editor layout: Should the three-column editor structure remain while redefining the side-rail responsibilities?
   Decision: Confirmed. Keep left asset pool, center canvas, and right properties/layer tree. The left pool should prioritize pipeline-derived chapter assets with direct upload as secondary. The center canvas should reuse shared selection/drag/resize/pan/zoom interaction protocols. The right rail must be a full authoring tree with drag reorder, multi-select, group/ungroup, and collapsible groups, not a static flat list.

9. Test and old-patch cleanup: Should tests that protect the now-rejected behavior be removed or rewritten as part of implementation?
   Decision: Confirmed. Clear the old patches/tests instead of layering compatibility over them. Tests asserting hidden `TopAppBar`, absent group controls, Shift-click single-selection, direct-upload-only assets, or flat-only AssemblyLayerTree behavior must be deleted, inverted, or replaced with tests for the confirmed behavior.

10. ADR: Should these Course Planner Assembly protocol decisions be recorded as a new ADR?
    Decision: Confirmed. Recorded in `docs/adr/0018-use-shared-art-pipeline-authoring-protocols-for-assembly.md`.

11. Implementation priority: Should protocol cleanup come before visual layout work?
    Decision: Confirmed. First clear Assembly's parallel simplified selection/tree logic and tests that protect rejected behavior; then reuse/extract shared selection and tree move protocols; then add pipeline-derived asset source; then tune Board/Chapter/Assembly layout density and icon-button presentation.

12. Pipeline asset picker scope: Should the first version only show pipeline runs created from the current Chapter's Complete Scene Images?
    Decision: Confirmed. The picker should list only `complete_images[].pipeline_run_id` for the current Chapter, and only usable completed run assets from those runs. Do not search across Chapters, Scene Packs, or a global asset library in the first version. Direct upload remains a secondary fallback.

13. Pipeline asset materialization: Should selected pipeline run assets be copied into chapter-owned assets instead of referenced in place?
    Decision: Confirmed. Materializing a run asset copies the image into Chapter Scene Package media and creates a `ChapterAsset` with lineage back to the source run asset and source Complete Scene Image. Later run changes must not auto-sync into the Chapter Asset Pool; updates require explicit replace/rematerialize.

14. Pipeline asset dedupe: Should a source run asset materialize only once by default per Chapter?
    Decision: Confirmed. The same `run_id + run_asset_id` should have at most one active Chapter Asset in the current Chapter by default. The picker displays `Added` and locates the existing Chapter Asset. Explicit duplicate/copy actions may create another Chapter Asset, but repeated default Add should not.

15. Chapter Asset deletion: Should deleting a Chapter Asset only affect the chapter-owned asset and current Assembly references?
    Decision: Confirmed. Delete/remove keeps source pipeline run assets, Complete Scene Images, and locked Final snapshots intact. It removes the active Chapter Asset from the pool and clears placements, groups, and dependency references that point to it, with destructive confirmation.

16. Assembly editor sizing: Should Assembly keep a fixed editor shell height after top navigation returns?
    Decision: Rejected. Assembly must not use a hard fixed canvas/editor height. The editor lives below the product `TopAppBar`, fills the remaining browser viewport height, and the center canvas always consumes the available remaining height within that shell. Left and right rails must be horizontally resizable, preferably by reusing the existing `react-resizable-panels` dependency instead of hard-coded column widths.

17. Assembly panel width persistence: Should user-resized left/right rail widths be stored in the Chapter Scene Package manifest?
    Decision: Rejected. Panel widths are local editor preferences, not Chapter business facts. Persist them only in local UI state/localStorage, never in the Chapter Scene Package or Assembly manifest.

18. Assembly canvas fit behavior: Should the canvas auto-fit only before user view manipulation and after Empty Scene changes?
    Decision: Confirmed. Initial load and Empty Scene changes fit the canvas to the available center panel. Center panel resizing may continue auto-fit only until the user manually zooms or pans. After user view manipulation, preserve the current viewport until the user chooses the explicit Fit action.

19. Assembly canvas interaction baseline: Should canvas-internal operations follow mature graphics editor conventions instead of bespoke rules?
    Decision: Confirmed. Selection, additive selection, range/list selection, drag movement, resize handles, group movement, layer ordering, marquee behavior, context menu behavior, and keyboard modifiers should follow established editor conventions from products such as Figma, Photoshop, Canva, and common layer-based editors. Any deviation must be explicit and justified by the Chapter Scene Assembly domain, not by local implementation convenience.

20. Assembly Layer Tree interaction baseline: Should the Layer Tree follow mature layer-panel conventions?
    Decision: Confirmed. The Layer Tree should support group rows, collapse/expand, rename where appropriate, multi-select, group/ungroup, and drag hierarchy/order changes using mature layer-panel behavior. Canvas z-order and Layer Tree order must stay synchronized through the shared authoring protocol.

21. Assembly naming boundaries: Should Placement and Group names be editable without renaming the source Chapter Asset?
    Decision: Confirmed. Placement display names may be edited as assembly-local authoring labels and default from the Chapter Asset name. Group display names may be edited and default to simple generated names such as `Group 1`. Renaming a Placement must not rename the source Chapter Asset; Chapter Asset naming remains an Asset Pool concern.

22. Assembly autosave boundary: Should autosave persist only Chapter Scene Assembly manifest facts?
    Decision: Confirmed. Autosave should trigger only from real manifest changes such as placements, groups, layer_order, transforms, runtime_role, requires_placed, and empty_scene_image_id. UI state such as selection, focused ids, panel widths, collapsed tree rows, zoom/pan, and open drawers must not enter the manifest or trigger scene-package saves. Dirty manifest changes should still flush before leaving the editor.

23. Layer Tree collapsed state: Should group collapse/expand state stay local instead of being saved in the manifest?
    Decision: Confirmed. Collapsed tree rows are editor UI preference and may be remembered locally per Chapter, but they must not affect the Chapter Scene Assembly manifest, export, readiness, or autosave keys.

24. Assembly keyboard shortcuts: Should Assembly Editor include baseline mature-editor shortcuts?
    Decision: Confirmed. First version should include Delete/Backspace for removing selected placements/groups, Ctrl/Cmd+G for group, Ctrl/Cmd+Shift+G for ungroup, undo/redo, Ctrl/Cmd+A select all placements, Escape clear/close/exit edit state, arrow-key nudging with Shift for larger steps, Ctrl/Cmd+S save/flush, and Space-drag canvas panning.

25. Delete confirmation boundary: Should every delete operation require confirmation?
    Decision: Confirmed. Every delete action must show a confirmation dialog, including deleting placements, groups, Chapter Assets, Complete Images, Final replacements, clearing all placements, and any replace operation that deletes or clears existing authored facts. Undo may still recover confirmed editor deletes, but undo does not replace the confirmation requirement.

26. Group delete semantics: Should deleting a group delete its child placements, or merely dissolve the group?
    Decision: Confirmed. Deleting a group means deleting the group and its child placements, with confirmation. Ungroup is a separate command that dissolves the group while preserving its child placements. The UI must not use Delete as a sometimes-dissolve operation.

27. Assembly undo/redo boundary: Should undo/redo cover only current Assembly manifest edits?
    Decision: Confirmed. Undo/redo covers only the current Assembly editing session's manifest changes, such as placements, groups, layer_order, transforms, runtime_role, requires_placed, and editable placement/group names. It does not cover UI state such as selection, drawer state, panel widths, search terms, collapsed rows, zoom/pan, or route navigation. The first version does not persist undo history across page refresh. Autosave persists the current manifest snapshot after undo/redo changes.

28. Multi-selection properties: Should the right Properties rail support batch editing when multiple placements/groups are selected?
    Decision: Confirmed. Multi-selection switches the Properties rail into batch-edit mode with an `N selected` summary. Batch actions include role/required flags where valid, delete, group, and alignment/order actions. Geometry fields show a concrete value only when all selected placements share that value; otherwise they show a mixed state. Entering a new value applies it to all selected placements. Single selection keeps the detailed Placement form.

29. Layer Tree z-order mapping: Should the top of the Layer Tree represent the front/topmost canvas layer?
    Decision: Confirmed. The Assembly Layer Tree uses the mature layer-panel convention: top row is front/topmost, bottom row is back/bottommost. Dragging an item upward brings it forward; dragging downward sends it backward. Canvas hit-testing must use the same z-order, selecting from front to back. Export flattening and `layer_order` projection must preserve this mapping.

30. New placement default display size: Should new placements use a separate default display size instead of raw source image dimensions?
    Decision: Confirmed. Source image files keep their generated/uploaded dimensions, including common 1024x1024 Codex-generated outputs. Assembly placement creation must compute a reasonable initial display transform instead of placing at raw pixel size. The default longest displayed side should be about 25% of the empty-scene canvas short side, preserving the image aspect ratio. Drag-drop placement centers on the pointer release point; click-to-add places at the current viewport center. User resize writes the actual authored geometry after placement.

31. Reusing the same Chapter Asset: Should a single Chapter Asset be placeable multiple times in one Assembly?
    Decision: Confirmed. The same Chapter Asset may create multiple placements in a Chapter Assembly because a scene may reuse the same object more than once. The Asset Pool card should show usage count, not a single used/unused lock. `Add to Assembly` should create a new placement each time. Deleting one placement does not delete the Chapter Asset or other placements of the same asset.

32. Duplicate placement naming: Should repeated placements of the same Chapter Asset get distinct default names?
    Decision: Confirmed. The first placement defaults to the Chapter Asset display name. Subsequent placements of the same Chapter Asset append a numeric suffix such as `Lamp 2`, `Lamp 3`, while remaining editable as assembly-local placement names. Renaming a placement does not rename the source Chapter Asset.

33. Asset-to-canvas placement entry: Should drag-to-canvas be a first-class placement creation interaction?
    Decision: Confirmed. The first implementation must support dragging a Chapter Asset from the Asset Pool onto the canvas to create a new placement centered on the pointer release position. Click-to-add remains an auxiliary entry that places the asset at the current viewport center. A lightweight drag preview is acceptable, but the release location must determine the initial placement center.

34. Asset Pool source grouping: Should pipeline-derived assets be the primary Asset Pool grouping?
    Decision: Confirmed. The Asset Pool should prioritize current-Chapter pipeline-derived assets, grouped by their source Complete Image or pipeline run where available. Direct uploads are a secondary group such as `Uploads`, not the dominant visual entry. Search spans all asset sources. Asset cards should use compact source indicators/icons, while upload controls remain available but visually secondary.

35. Generated asset import entry: Where does the pipeline-derived asset import workflow live?
    Decision: Confirmed. The workflow is not a top-level `Pipeline` tab page. It lives under `Course Planner` -> Chapter Studio -> Assembly Editor -> left Asset Pool. The Asset Pool exposes an icon-button entry such as `Import generated assets`; clicking it opens the existing system drawer titled `Generated Chapter Assets`. The drawer lists current-Chapter pipeline outputs and materializes selected outputs into chapter-owned Chapter Assets, which then appear in the Asset Pool for drag-to-canvas placement.

36. Importable generated asset definition: What counts as an importable generated asset?
    Decision: Confirmed. Any current-Chapter art-pipeline output that has fully executed through Codex image generation and produced an image file is importable, regardless of perceived visual quality. Quality review is an authoring concern: if the output is bad, the user will revise the prompt and regenerate, replacing or superseding that generated output. The drawer should not block import based on quality scoring.

37. Generated asset import failure states: How should unavailable generated outputs appear?
    Decision: Confirmed. If a generated output is referenced but cannot be imported because the file is missing, dimensions cannot be read, the backend cannot resolve the asset, or it is already materialized, the drawer must show a disabled/unavailable state with a concise reason. The workflow must not fail silently.

38. Assembly group nesting: Should Assembly groups support nested groups in the first version?
    Decision: Rejected. The first version supports only one group level. Groups may contain placements, but not other groups. This keeps selection, layer ordering, delete confirmation, ungroup, and export flattening understandable while still covering the core authoring need.

39. Alignment and snapping scope: Should the first version include alignment/distribution and snapping?
    Decision: Confirmed for basic alignment only. The first version should include basic multi-selection alignment actions such as align left, horizontal center, right, top, vertical middle, and bottom. Complex smart snapping/guides/distribution can wait. Arrow nudging and Shift+arrow larger nudging remain part of the first version.

40. Canvas marquee selection: Should marquee selection be included in the first version?
    Decision: Confirmed. Canvas marquee selection is required for the first version so canvas multi-selection is not limited to modifier-clicking individual placements. It should follow mature graphics editor behavior and integrate with the same shared selection protocol as the Layer Tree.

41. Empty Scene replacement behavior: What happens to existing placements when the Empty Scene changes?
    Decision: Confirmed. Replacing the Empty Scene requires confirmation when existing placements are present or the scene size/background changes. Existing placements are preserved by default using their relative transform coordinates, but the UI must make clear that the author may need to re-check placement alignment after replacement.

42. Assembly readiness/final-lock criteria: What facts determine whether Assembly is ready for final lock?
    Decision: Confirmed. Readiness and final lock are determined only by manifest/domain facts: an Empty Scene exists, required target placements are satisfied, `layer_order` is complete and valid, placement asset references resolve to available Chapter Assets, and required dependency references are valid. UI state such as selection, zoom, collapsed rows, drawer state, and panel widths must not affect readiness or final lock.

## Reference Images

- `docs/assets/course-planner-assembly-generated-assets-drawer-overlay-on-current-reference.png` shows the intended `Generated Chapter Assets` drawer as a fixed-position overlay on top of the current Assembly Editor. The drawer must not become a fourth layout column and must not resize the left Asset Pool, center canvas, or right properties/layers rail.

## Implementation Plan

- `docs/superpowers/plans/2026-07-06-course-planner-ux-assembly-overhaul.md` maps all 42 issue-record decisions to implementation tasks and verification levels.

## Non-goals For This Record

- No runtime code was changed.
- No tests were changed.
- No additional ADR beyond `docs/adr/0018-use-shared-art-pipeline-authoring-protocols-for-assembly.md` was made in this record.
- This record captures decisions and reference material only; implementation has not started.
