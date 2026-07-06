# Assembly Authoring Surface Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Assembly editor so it reuses the art-pipeline canvas interaction path, fixes the drag/autosave conflict root cause, removes fake controls and bogus asset tags, and restores a useful right-side properties + layer-order workflow.

**Architecture:** The Chapter Scene Assembly Manifest remains the single domain contract. Assembly adapts Scene Asset Placements into the existing art-pipeline canvas viewport/selection/box-edit primitives instead of running a second tldraw editor model. Autosave becomes an explicit state machine around material manifest keys, in-flight saves, server echoes, and true remote divergence.

**Tech Stack:** React 18, TypeScript, existing art-pipeline canvas primitives (`CanvasStage`, `CanvasArtboard`, `useCanvasViewport`, overlay/box-edit layers), lucide-react, Vitest, Testing Library, existing browser screenshot tooling, Vite.

---

## Inputs

- Handoff: `C:/Users/30553/AppData/Local/Temp/placement-editor-redesign-handoff-2026-07-05.md`
- Domain glossary: `CONTEXT.md`
- ADR: `docs/adr/0016-reuse-art-pipeline-canvas-for-assembly-authoring.md`
- ADR: `docs/adr/0017-remove-asset-type-chips-from-assembly-pool.md`
- Superseded ADR: `docs/adr/0005-use-canvas-and-tree-libraries-for-assembly-authoring.md`
- Current failed implementation files listed in the File Map below.
- Existing visual harness: `frontend/tools/capture-course-planner-screenshots.mjs`
- Existing visual fixture: `frontend/tests/coursePlanner/coursePlannerVisualReferenceFixtures.ts`

## Non-Negotiable Requirements

- Do not treat this as a style-only pass. The drag-triggered conflict is a state-machine bug and must be fixed with tests.
- Do not build on top of the failed Assembly tldraw shell. tldraw is removed from the Assembly main interaction path.
- Do not keep the tldraw container, watermark, zoom controls, selection chrome, snapshot bridge, or shape projection as Assembly's primary canvas.
- Reuse the art-pipeline main canvas interaction model: selection, blank-click clearing, pan, space-pan, wheel zoom, fit, focus/locate, drag placement, resize box, selected outlines, and handles.
- Keep right-click as a base interaction. Replace the menu contents with Assembly-only actions.
- Do not expose pipeline-only actions in Assembly: create child, split, click detect, accept/reject, repair, missing mask, mask generation, or pipeline overlay toggles.
- Do not show fake controls. If an action is not wired as real behavior in this pass, it is not rendered.
- The left asset pool remains a grid resource list. Remove filter icon, `All` / `Target` / `Prop` / `Scene` chips, grid/list toggle, and `Linked` / `Unlinked` tag text from cards.
- Keep asset search, upload, used/unused status, and explicit secondary asset operations that are actually wired.
- Asset card primary action: unused asset adds a placement; used asset selects and locates its existing placement.
- `linked_target_object_id` is target coverage metadata, not a browsing category and not a card tag.
- The right-side old Layers panel is discarded, not cleaned up. Replace it with a new placement/layer list linked to the canvas.
- Right rail layout is always visible as two regions, not hidden behind `Layers` / `Properties` tabs: selected placement properties on top, placement/layer list below.
- Properties take roughly 35% of the right rail and show only high-frequency fields: name, role, position, size, rotation.
- The placement/layer list takes roughly 65% of the right rail and owns z-order work.
- `layer_order[0]` is frontmost. The list displays front-to-back. Canvas rendering reverses that order for back-to-front painting.
- Right list selection and canvas selection are bidirectional. Selecting a used asset also locates/selects the placement.
- Toolbar reuse is a lightweight capability configuration, not a full plugin framework. Shared actions are select, pan, zoom, fit, save/retry when real; scene-specific actions are opt-in per surface.
- Tests stay under `frontend/tests/coursePlanner/`. Do not add test files under runtime `src/`.
- Do not scan `node_modules`.
- New code comments are Chinese only when they explain WHY or trade-off, not surface behavior.

## Canvas Capability Split

Assembly must reuse these art-pipeline canvas capabilities:

- Select tool and selected outline.
- Blank artboard click clears selection.
- Object hit testing respects visible z-order.
- Pan mode, temporary space-pan, and pointer pan.
- Wheel zoom, gesture zoom if already supported, zoom in/out, and fit.
- Focus request from list/asset pool to bring a placement into view.
- Drag selected placement.
- Resize selected placement with handles.
- Box geometry conversion between screen/pixel space and domain transform.
- Right-click on object and blank canvas.
- Keyboard nudge if it already belongs to the extracted box-edit primitive.

Assembly must exclude these art-pipeline-only capabilities:

- Draw new detection box.
- Split region creation.
- Click-detect point picking.
- Missing mask drawing.
- Create child element.
- Accept/reject element.
- Repair/generate/mask actions.
- Pipeline overlay switches for masks, thumbnails, rejected/merged states.

Assembly-specific capabilities to add or retain:

- Add Scene Asset Placement from unused asset card.
- Select/locate placement from used asset card.
- Rename placement.
- Edit transform through canvas and properties.
- Set runtime role: `target` or `initial`.
- Duplicate placement.
- Remove placement.
- Move placement front/back/forward/backward by updating `layer_order`.
- Autosave draft changes without false server-conflict banners.

## Current Failure Analysis

The visible `Conflict` banner after dragging is not caused by the user dragging incorrectly. It is caused by the Assembly save pipeline treating normal canvas edits plus autosave/server refresh as a remote conflict.

Current evidence:

- `frontend/src/features/coursePlanner/assembly/assemblyWorkspaceState.ts` already excludes `updated_at` from `manifestKeyOf`. Keep that invariant; it is correct but insufficient.
- `frontend/src/features/coursePlanner/components/useAssemblyWorkspaceController.ts` still classifies a changed incoming scene manifest as conflict when local dirty or in-flight state exists.
- `frontend/src/features/coursePlanner/components/useAssemblyWorkspaceSaveController.ts` updates the saved baseline on successful save, but the integration path can still see a scene-package refresh at the wrong time.
- The tldraw bridge in `AssemblyEditorCanvas.tsx` can amplify draft churn because it projects editor shapes back into manifest state during canvas operations.

Correct behavior:

- Dragging a placement updates local draft immediately.
- Autosave runs after debounce.
- While a save is in flight, a server echo of the same material manifest must update the integrated baseline and must not become `conflict`.
- If the user continues editing while an older save response returns, the older save updates only the saved baseline and must not overwrite the newer local draft.
- A conflict is shown only when the incoming server manifest materially differs from both the integrated baseline and the author's current/pending local manifest.
- Save failure remains `failed` with a real Retry path; it is not the same state as server conflict.

## Requirement Coverage Matrix

| Confirmed requirement | Plan coverage |
| --- | --- |
| Fix the reason dragging a canvas image raises `Conflict`, not just the banner style. | Task 1, Current Failure Analysis, Acceptance Checklist |
| Reuse the art-pipeline main canvas interaction path. | Canvas Capability Split, Task 2, Task 3 |
| Remove tldraw from the Assembly main path. | Non-Negotiable Requirements, Task 3 |
| Confirm which art-pipeline canvas capabilities Assembly should use and which are pipeline-only. | Canvas Capability Split, Task 2 |
| Keep right-click, but use Assembly-specific menu actions. | Non-Negotiable Requirements, Task 6 |
| Right-side list must link with canvas selection. | Task 5 |
| Right-side list must control layer/z-order like Photoshop. | Task 5, Acceptance Checklist |
| Old Layers panel and its fake buttons are discarded. | Old Patch Disposition, Task 5, Task 6 |
| Properties must be visible above the layer list. | Non-Negotiable Requirements, Task 5 |
| Properties should take about 35% and layer list about 65%. | Non-Negotiable Requirements, Task 5 |
| Align styling with the art-pipeline main canvas. | Task 7 |
| Toolbar should be lightweight capability configuration, not a large plugin framework. | Non-Negotiable Requirements, Task 6 |
| Toolbar must not show fake actions. | Non-Negotiable Requirements, Task 6 |
| Left asset pool stays a grid resource list. | Non-Negotiable Requirements, Task 4 |
| Remove `All`, `Target`, `Prop`, `Scene` category chips. | Non-Negotiable Requirements, Task 4 |
| Remove grid/list toggle because only grid mode is required. | Non-Negotiable Requirements, Task 4 |
| Remove fake filter icon. | Non-Negotiable Requirements, Task 4 |
| Treat `linked_target_object_id` as coverage metadata, not a browsing category. | Non-Negotiable Requirements, Task 4 |
| Remove `Linked` / `Unlinked` card tag text. | Non-Negotiable Requirements, Task 4 |
| Unused asset click adds placement; used asset click selects/locates placement. | Non-Negotiable Requirements, Task 4 |
| Do not expose pipeline-only commands in Assembly. | Canvas Capability Split, Task 6 |
| Do not stack new fixes on failed old patches. | Old Patch Disposition, Task 0 |
| Keep tests under `frontend/tests/coursePlanner`. | Non-Negotiable Requirements, File Map |
| Do not scan `node_modules`. | Non-Negotiable Requirements |

## Old Patch Disposition

Before implementation, classify the current dirty diff using this table and record the result in `output/verification/assembly-rebuild-patch-audit-2026-07-05.md`.

| Area | Disposition | Reason |
| --- | --- | --- |
| `manifestKeyOf` excluding `updated_at` | Keep | Protects a real business invariant: server persistence metadata is not author content. |
| Compact `AssemblyWorkspaceFeedback` banner | Keep, then restyle with final shell | Prevents error UI from covering the whole workspace, but it is not the root-cause fix. |
| Current `AssemblyEditorCanvas.tsx` tldraw path | Rewrite | Wrong primary interaction model and second fact source. |
| `assemblyCanvasControls.ts` | Remove after replacement | It only controls the tldraw editor path. |
| `tldrawAssemblyAdapter.ts` | Remove after replacement | tldraw document/shape projection is not the Assembly authoring model. |
| `editor_shape_id`, `tldraw_record`, `tldraw_document` draft fields | Remove | They are implementation leakage from the failed canvas path. |
| Current asset chips/filter/list toggle | Remove | They are fake or misleading and were explicitly rejected. |
| `Linked` / `Unlinked` card tag text | Remove | Target linkage is coverage metadata, not browsing taxonomy. |
| Current `AssemblyLayerTree.tsx` panel | Replace | It contains fake controls and does not solve the canvas/list/z-order workflow. |
| Current `AssemblyPlacementProperties.tsx` density | Rewrite | It wastes rail space and hides useful properties. |
| Current Assembly toolbar fake buttons | Remove or wire as real behavior | Unsupported actions must not be visible. |
| Existing tests that assert rejected UI | Rewrite | Tests must protect the new domain behavior, not the failed shell. |

## File Map

### Assembly State And Save

- Modify: `frontend/src/features/coursePlanner/assembly/assemblyWorkspaceState.ts`
- Modify: `frontend/src/features/coursePlanner/assembly/assemblyManifestDraft.ts`
- Create: `frontend/src/features/coursePlanner/assembly/assemblyAutosavePolicy.ts`
- Modify: `frontend/src/features/coursePlanner/components/useAssemblyWorkspaceController.ts`
- Modify: `frontend/src/features/coursePlanner/components/useAssemblyWorkspaceSaveController.ts`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-autosave.test.tsx`

### Shared Canvas Reuse

- Modify: `frontend/src/features/canvas/useCanvasViewport.ts`
- Modify: `frontend/src/features/canvas/CanvasStage.tsx`
- Modify: `frontend/src/features/canvas/CanvasArtboard.tsx`
- Modify: `frontend/src/features/canvas/CanvasOverlayLayer.tsx`
- Modify: `frontend/src/features/canvas/CanvasBoxEditLayer.tsx`
- Modify: `frontend/src/features/canvas/canvasStageGeometry.ts`
- Modify: `frontend/src/features/canvas/CanvasToolbar.tsx`
- Create: `frontend/src/features/canvas/canvasObjectModel.ts`
- Test: existing app/canvas tests plus Course Planner canvas tests.

### Assembly Canvas Adapter

- Create: `frontend/src/features/coursePlanner/assembly/assemblyCanvasViewModel.ts`
- Create: `frontend/src/features/coursePlanner/components/AssemblyAuthoringCanvas.tsx`
- Modify: `frontend/src/features/coursePlanner/components/AssemblyEditorCanvas.tsx`
- Remove after caller replacement: `frontend/src/features/coursePlanner/assembly/tldrawAssemblyAdapter.ts`
- Remove after caller replacement: `frontend/src/features/coursePlanner/components/assemblyCanvasControls.ts`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-canvas.test.tsx`

### Left Asset Pool

- Modify: `frontend/src/features/coursePlanner/components/AssemblyAssetPoolPanel.tsx`
- Modify: `frontend/src/features/coursePlanner/components/assemblyAssetPoolBrowser.tsx`
- Modify: `frontend/src/features/coursePlanner/components/assemblyWorkspace.css`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor.test.tsx`

### Right Rail, Properties, And Placement List

- Modify: `frontend/src/features/coursePlanner/components/AssemblyWorkspacePanel.tsx`
- Modify: `frontend/src/features/coursePlanner/components/AssemblyPlacementProperties.tsx`
- Create: `frontend/src/features/coursePlanner/components/AssemblyPlacementList.tsx`
- Create: `frontend/src/features/coursePlanner/components/AssemblyPlacementContextMenu.tsx`
- Remove or stop importing: `frontend/src/features/coursePlanner/components/AssemblyLayerTree.tsx`
- Remove or stop importing: `frontend/src/features/coursePlanner/components/assemblyLayerTreeModel.ts`
- Modify: `frontend/src/features/coursePlanner/components/assemblyWorkspace.css`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-properties.test.tsx`

### Visual Harness And Fixtures

- Modify: `frontend/tests/coursePlanner/coursePlannerVisualReferenceFixtures.ts`
- Modify: `frontend/tools/course-planner-visual-harness.tsx`
- Use: `frontend/tools/capture-course-planner-screenshots.mjs`

## Task 0: Patch Hygiene And Baseline

**Files:**
- Create: `output/verification/assembly-rebuild-patch-audit-2026-07-05.md`
- Read/inspect: all files in File Map.

- [ ] **Step 0.1: Inspect dirty diff**

Run:

```powershell
git diff --stat
git diff --name-only
```

Expected: large Course Planner UI/test changes are present. Do not revert user changes. Do not add implementation edits before the classification file is written.

- [ ] **Step 0.2: Write patch audit**

Create `output/verification/assembly-rebuild-patch-audit-2026-07-05.md` with this structure:

```markdown
# Assembly Rebuild Patch Audit - 2026-07-05

## Keep

- `frontend/src/features/coursePlanner/assembly/assemblyWorkspaceState.ts`: keep `manifestKeyOf` excluding `updated_at`.
- `frontend/src/features/coursePlanner/components/AssemblyWorkspaceFeedback.tsx`: keep compact banner behavior, restyle after shell rebuild.

## Rewrite

- `frontend/src/features/coursePlanner/components/AssemblyEditorCanvas.tsx`: replace tldraw path with art-pipeline canvas adapter.
- `frontend/src/features/coursePlanner/components/AssemblyAssetPoolPanel.tsx`: keep resource list concept, remove rejected controls/tags.
- `frontend/src/features/coursePlanner/components/AssemblyWorkspacePanel.tsx`: replace right rail and toolbar composition.
- `frontend/src/features/coursePlanner/components/AssemblyPlacementProperties.tsx`: rewrite for compact 35% top inspector.

## Remove After Replacement

- `frontend/src/features/coursePlanner/assembly/tldrawAssemblyAdapter.ts`
- `frontend/src/features/coursePlanner/components/assemblyCanvasControls.ts`
- `frontend/src/features/coursePlanner/components/AssemblyLayerTree.tsx`
- `frontend/src/features/coursePlanner/components/assemblyLayerTreeModel.ts`

## Tests To Rewrite

- Tests that assert `All` / `Target` / `Prop` / `Scene` chips.
- Tests that assert fake layer toolbar buttons.
- Tests that rely on tldraw DOM or tldraw controls.
```

- [ ] **Step 0.3: Run current focused tests once**

Run:

```powershell
cd D:\work\art-pipeline-v2-demo\frontend
npm test -- --run tests/coursePlanner/chapter-workspace-assembly-editor-autosave.test.tsx tests/coursePlanner/chapter-workspace-assembly-editor-canvas.test.tsx tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx tests/coursePlanner/chapter-workspace-assembly-editor-properties.test.tsx tests/coursePlanner/chapter-workspace-assembly-editor.test.tsx
```

Expected: this may fail. Record the failures in the audit file. Do not fix yet.

## Task 1: Fix Autosave Conflict Root Cause

**Files:**
- Create: `frontend/src/features/coursePlanner/assembly/assemblyAutosavePolicy.ts`
- Modify: `frontend/src/features/coursePlanner/assembly/assemblyWorkspaceState.ts`
- Modify: `frontend/src/features/coursePlanner/components/useAssemblyWorkspaceController.ts`
- Modify: `frontend/src/features/coursePlanner/components/useAssemblyWorkspaceSaveController.ts`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-autosave.test.tsx`

- [ ] **Step 1.1: Write failing tests for drag autosave echo**

Add tests that prove these invariants:

```tsx
it("does not enter conflict when a placement drag autosaves and the server echoes the same material manifest", async () => {
  // Arrange: render Assembly with two placements and a save handler that returns the saved manifest with a newer updated_at.
  // Act: move the selected placement through the canvas/property draft path, advance autosave debounce, and resolve save.
  // Assert: Conflict text is absent, saved status is visible, and the placement transform is preserved.
});

it("does not overwrite a newer local drag when an older save response resolves", async () => {
  // Arrange: start save A, then change the placement again before save A resolves.
  // Act: resolve save A.
  // Assert: current draft keeps the newer transform, baseline records save A, and another autosave remains possible.
});

it("enters conflict only when remote assembly content diverges from the local pending manifest", async () => {
  // Arrange: dirty local placement transform and then rerender with a server package containing a different transform.
  // Assert: Conflict text appears and Retry saves the local manifest.
});
```

Run:

```powershell
cd D:\work\art-pipeline-v2-demo\frontend
npm test -- --run tests/coursePlanner/chapter-workspace-assembly-editor-autosave.test.tsx
```

Expected: the new tests fail before implementation.

- [ ] **Step 1.2: Add an explicit autosave policy helper**

Create `assemblyAutosavePolicy.ts` with pure functions for classifying incoming server manifests. The helper must distinguish:

- `integrate-clean-server`: no dirty local work, no in-flight save.
- `integrate-own-save-echo`: incoming key equals in-flight or last saved local key.
- `keep-local-after-older-save`: save response is valid but local draft has moved on.
- `server-conflict`: incoming material manifest differs from baseline and local pending manifest.
- `catalog-only-refresh`: asset catalog or empty-scene metadata refresh without material assembly change.

Add Chinese WHY comments explaining that this file isolates the save/refresh lifecycle boundary so canvas, asset pool, and properties do not each infer conflicts.

- [ ] **Step 1.3: Refactor controller integration through the policy**

Update `useSceneManifestIntegration` so it calls the policy before mutating refs/state.

Rules:

- Do not set `saveState` to `conflict` for own save echo.
- Do not overwrite `draft` when the author has newer local edits than the resolved save response.
- Do update `integratedSceneManifestKey` when a save response confirms a material manifest.
- Do keep `retryManifestRef` only for real save failure or real server conflict.
- Do keep `requiresExplicitSelectionSave` behavior for empty-scene changes.

- [ ] **Step 1.4: Verify autosave tests**

Run:

```powershell
cd D:\work\art-pipeline-v2-demo\frontend
npm test -- --run tests/coursePlanner/chapter-workspace-assembly-editor-autosave.test.tsx
```

Expected: all autosave tests pass.

## Task 2: Extract The Shared Canvas Object Boundary

**Files:**
- Create: `frontend/src/features/canvas/canvasObjectModel.ts`
- Modify: `frontend/src/features/canvas/CanvasStage.tsx`
- Modify: `frontend/src/features/canvas/CanvasArtboard.tsx`
- Modify: `frontend/src/features/canvas/CanvasOverlayLayer.tsx`
- Modify: `frontend/src/features/canvas/CanvasBoxEditLayer.tsx`
- Modify: `frontend/src/features/canvas/canvasStageGeometry.ts`
- Test: existing canvas/app tests and `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-canvas.test.tsx`

- [ ] **Step 2.1: Introduce a canvas-view object type**

Create a small shared type for canvas-renderable objects. It must represent only interaction geometry and display metadata:

```ts
export type CanvasObjectBox = {
  x: number;
  y: number;
  w: number;
  h: number;
  rotationDeg: number;
};

export type CanvasObjectView = {
  id: string;
  displayName: string;
  box: CanvasObjectBox;
  thumbnailUrl: string | null;
  isVisible: boolean;
  isLocked: boolean;
};
```

Do not add manager/coordinator layers. This type is the boundary between domain data and the shared canvas primitives.

- [ ] **Step 2.2: Make canvas primitives consume `CanvasObjectView`**

Refactor overlay, hit-test, box-edit, and selection code so art-pipeline `WorkspaceElement` is adapted into `CanvasObjectView` before reaching generic canvas primitives.

Rules:

- Existing art-pipeline behavior must remain unchanged.
- Pipeline-only tools stay in pipeline-specific props/capabilities.
- Assembly must not receive pipeline-only callbacks.

- [ ] **Step 2.3: Add capability flags without a plugin framework**

Add a lightweight canvas capability object such as:

```ts
export type CanvasSurfaceCapabilities = {
  canDraw: boolean;
  canSplit: boolean;
  canClickDetect: boolean;
  canCreateChild: boolean;
  canRenameObjects: boolean;
  canUseMissingMask: boolean;
};
```

Default the existing art-pipeline surface to its current enabled behavior. Assembly passes disabled values for pipeline-only capabilities.

- [ ] **Step 2.4: Verify pipeline did not regress**

Run the focused app/canvas and Course Planner tests that cover existing canvas behavior:

```powershell
cd D:\work\art-pipeline-v2-demo\frontend
npm test -- --run tests/coursePlanner tests/app
```

Expected: no existing pipeline canvas behavior regresses from the extraction.

## Task 3: Replace Assembly tldraw Canvas With The Shared Canvas

**Files:**
- Create: `frontend/src/features/coursePlanner/assembly/assemblyCanvasViewModel.ts`
- Create: `frontend/src/features/coursePlanner/components/AssemblyAuthoringCanvas.tsx`
- Modify: `frontend/src/features/coursePlanner/components/AssemblyEditorCanvas.tsx`
- Modify: `frontend/src/features/coursePlanner/assembly/assemblyManifestDraft.ts`
- Remove after caller replacement: `frontend/src/features/coursePlanner/assembly/tldrawAssemblyAdapter.ts`
- Remove after caller replacement: `frontend/src/features/coursePlanner/components/assemblyCanvasControls.ts`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-canvas.test.tsx`

- [ ] **Step 3.1: Write failing tests for shared canvas behavior**

Add tests that assert:

```tsx
expect(screen.queryByText(/Get a license for production/i)).not.toBeInTheDocument();
expect(screen.queryByTestId("tldraw-editor")).not.toBeInTheDocument();
expect(screen.getByRole("region", { name: "Assembly canvas" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "Fit canvas" })).toBeEnabled();
```

Add a transform test:

```tsx
it("updates placement transform through shared canvas box editing", async () => {
  // Select placement, drag or resize through the canvas harness, and assert Position/Size fields update.
});
```

Run:

```powershell
cd D:\work\art-pipeline-v2-demo\frontend
npm test -- --run tests/coursePlanner/chapter-workspace-assembly-editor-canvas.test.tsx
```

Expected: tests fail while tldraw remains active.

- [ ] **Step 3.2: Implement Assembly placement to canvas mapping**

In `assemblyCanvasViewModel.ts`, map between normalized manifest transforms and pixel boxes:

```ts
export function placementToCanvasBox(transform, sceneSize) {
  return {
    x: (transform.cx - transform.w / 2) * sceneSize.width,
    y: (transform.cy - transform.h / 2) * sceneSize.height,
    w: transform.w * sceneSize.width,
    h: transform.h * sceneSize.height,
    rotationDeg: transform.rotation_deg,
  };
}

export function canvasBoxToPlacementTransform(box, sceneSize) {
  return {
    cx: (box.x + box.w / 2) / sceneSize.width,
    cy: (box.y + box.h / 2) / sceneSize.height,
    w: box.w / sceneSize.width,
    h: box.h / sceneSize.height,
    rotation_deg: box.rotationDeg,
  };
}
```

Clamp through the existing manifest save path, not by creating a second clamping rule here.

- [ ] **Step 3.3: Render placements using `layer_order`**

Assembly render order:

- Normalize `layer_order` through `createAssemblyDraft` / `projectManifestForSave`.
- List order is front-to-back.
- Canvas paint order is `layer_order` reversed so backmost draws first and frontmost draws last.
- Hit testing uses front-to-back order so top visual object receives selection first.

- [ ] **Step 3.4: Wire draft updates through existing manifest helpers**

Use `updatePlacementTransform` for drag/resize updates. Do not let the canvas own the domain state.

Remove tldraw-specific fields from `AssemblyManifestDraft` after the canvas no longer reads them:

- `editor_shape_id`
- `tldraw_record`
- `tldraw_document`

- [ ] **Step 3.5: Delete tldraw Assembly path**

After all imports are removed, delete:

- `frontend/src/features/coursePlanner/assembly/tldrawAssemblyAdapter.ts`
- `frontend/src/features/coursePlanner/components/assemblyCanvasControls.ts`

Run:

```powershell
cd D:\work\art-pipeline-v2-demo
git grep -n "tldrawAssemblyAdapter\|assemblyCanvasControls\|Tldraw" -- frontend/src frontend/tests
```

Expected: no Assembly runtime import remains. A package dependency can stay only if another non-Assembly surface still imports it.

- [ ] **Step 3.6: Verify canvas tests**

Run:

```powershell
cd D:\work\art-pipeline-v2-demo\frontend
npm test -- --run tests/coursePlanner/chapter-workspace-assembly-editor-canvas.test.tsx tests/coursePlanner/chapter-workspace-assembly-editor-autosave.test.tsx
```

Expected: canvas tests and autosave tests pass together.

## Task 4: Simplify The Left Asset Pool

**Files:**
- Modify: `frontend/src/features/coursePlanner/components/AssemblyAssetPoolPanel.tsx`
- Modify: `frontend/src/features/coursePlanner/components/assemblyAssetPoolBrowser.tsx`
- Modify: `frontend/src/features/coursePlanner/components/assemblyWorkspace.css`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor.test.tsx`

- [ ] **Step 4.1: Write failing tests for removed controls**

Add assertions:

```tsx
expect(screen.getByRole("heading", { name: "Assets" })).toBeInTheDocument();
expect(screen.getByRole("searchbox", { name: "Search assets" })).toBeInTheDocument();
expect(screen.queryByRole("button", { name: /Filter/i })).not.toBeInTheDocument();
expect(screen.queryByRole("button", { name: "All" })).not.toBeInTheDocument();
expect(screen.queryByRole("button", { name: "Target" })).not.toBeInTheDocument();
expect(screen.queryByRole("button", { name: "Prop" })).not.toBeInTheDocument();
expect(screen.queryByRole("button", { name: "Scene" })).not.toBeInTheDocument();
expect(screen.queryByRole("button", { name: /List view/i })).not.toBeInTheDocument();
expect(screen.queryByText("Linked")).not.toBeInTheDocument();
expect(screen.queryByText("Unlinked")).not.toBeInTheDocument();
expect(screen.getByText("Used")).toBeInTheDocument();
expect(screen.getByText("Unused")).toBeInTheDocument();
```

Run:

```powershell
cd D:\work\art-pipeline-v2-demo\frontend
npm test -- --run tests/coursePlanner/chapter-workspace-assembly-editor.test.tsx
```

Expected: tests fail until rejected controls/tags are removed.

- [ ] **Step 4.2: Remove bogus asset filters and tags**

Remove `AssetFilter = "all" | "target" | "prop" | "scene"` and all related chip UI. Keep search filtering and used/unused derivation.

Card copy:

- Primary line: user-facing asset name.
- Secondary status: used/unused dot, not a type/category tag.
- No `Linked` / `Unlinked` label.
- No UUID or implementation id unless explicitly needed for debugging in tests.

- [ ] **Step 4.3: Wire card primary actions**

Rules:

- Unused available asset card click calls `onAddAsset(asset.id)`.
- Used asset card click calls `onLocatePlacement(existingPlacement.id)`.
- Removed/unavailable asset is not added.
- Upload remains a real explicit button.
- Duplicate/delete remain only if they call existing real handlers.

- [ ] **Step 4.4: Verify asset pool tests**

Run:

```powershell
cd D:\work\art-pipeline-v2-demo\frontend
npm test -- --run tests/coursePlanner/chapter-workspace-assembly-editor.test.tsx
```

Expected: asset pool tests pass and no rejected controls remain.

## Task 5: Rebuild Right Rail As Properties + Placement List

**Files:**
- Modify: `frontend/src/features/coursePlanner/components/AssemblyWorkspacePanel.tsx`
- Modify: `frontend/src/features/coursePlanner/components/AssemblyPlacementProperties.tsx`
- Create: `frontend/src/features/coursePlanner/components/AssemblyPlacementList.tsx`
- Modify: `frontend/src/features/coursePlanner/components/assemblyWorkspace.css`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-properties.test.tsx`

- [ ] **Step 5.1: Write failing tests for rail layout**

Add tests:

```tsx
expect(screen.queryByRole("tab", { name: "Layers" })).not.toBeInTheDocument();
expect(screen.queryByRole("tab", { name: "Properties" })).not.toBeInTheDocument();
expect(screen.getByRole("region", { name: "Placement properties" })).toBeInTheDocument();
expect(screen.getByRole("region", { name: "Placement layers" })).toBeInTheDocument();
```

Add property tests:

```tsx
expect(screen.getByLabelText("Name")).toHaveDisplayValue("Chapter asset 001");
expect(screen.getByRole("button", { name: "Target role" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "Initial role" })).toBeInTheDocument();
expect(screen.getByLabelText("Position X")).toBeInTheDocument();
expect(screen.getByLabelText("Position Y")).toBeInTheDocument();
expect(screen.getByLabelText("Width")).toBeInTheDocument();
expect(screen.getByLabelText("Height")).toBeInTheDocument();
expect(screen.getByLabelText("Rotation")).toBeInTheDocument();
expect(screen.queryByText("Dependencies")).not.toBeInTheDocument();
```

Run:

```powershell
cd D:\work\art-pipeline-v2-demo\frontend
npm test -- --run tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx tests/coursePlanner/chapter-workspace-assembly-editor-properties.test.tsx
```

Expected: tests fail with the old tabbed/fake-panel layout.

- [ ] **Step 5.2: Implement rail proportions**

CSS rules:

- Right rail is a vertical stack.
- Top properties block uses about 35% of available rail height with sane min/max constraints.
- Bottom placement list consumes remaining space and scrolls independently.
- No nested cards inside cards.
- Text must not overflow buttons/rows.

- [ ] **Step 5.3: Implement compact properties**

Properties show:

- Name.
- Runtime role segmented control: Target / Initial.
- Position X, Position Y in px.
- Width, Height in px.
- Rotation in degrees.

Properties hide from primary view:

- Dependencies.
- Target coverage internals.
- Raw `cx`, `cy`, `w`, `h`, `rotation_deg`.

- [ ] **Step 5.4: Implement placement list**

`AssemblyPlacementList` rules:

- Uses `projectManifestForSave(draft).layer_order` as the order source.
- Displays front-to-back.
- Each row shows thumbnail, display name, role, and real action affordances only.
- Clicking a row selects that placement and requests canvas focus.
- Canvas selection updates the selected row.
- Row order controls call `movePlacementLayer`.

- [ ] **Step 5.5: Verify z-order behavior**

Add tests:

```tsx
it("moves a placement layer and keeps layer_order as the single z-order source", async () => {
  // Select a lower row, invoke Move forward or Bring to front, save, and assert the saved manifest layer_order[0] is that placement.
});

it("selects the same placement from canvas and placement list", async () => {
  // Click list row, assert canvas selected box/status fields update.
  // Click canvas object, assert list row selected state updates.
});
```

Run:

```powershell
cd D:\work\art-pipeline-v2-demo\frontend
npm test -- --run tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx tests/coursePlanner/chapter-workspace-assembly-editor-properties.test.tsx
```

Expected: right rail tests pass.

## Task 6: Assembly Context Menu And Toolbar Capabilities

**Files:**
- Create: `frontend/src/features/coursePlanner/components/AssemblyPlacementContextMenu.tsx`
- Modify: `frontend/src/features/coursePlanner/components/AssemblyWorkspacePanel.tsx`
- Modify: `frontend/src/features/canvas/CanvasToolbar.tsx`
- Modify: `frontend/src/features/coursePlanner/assembly/assemblyManifestDraft.ts`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-canvas.test.tsx`
- Test: `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx`

- [ ] **Step 6.1: Write failing context menu tests**

Add tests:

```tsx
expect(await screen.findByRole("menu")).toBeInTheDocument();
expect(screen.getByRole("menuitem", { name: "Edit placement" })).toBeInTheDocument();
expect(screen.getByRole("menuitem", { name: "Rename placement" })).toBeInTheDocument();
expect(screen.getByRole("menuitem", { name: "Bring to front" })).toBeInTheDocument();
expect(screen.getByRole("menuitem", { name: "Send to back" })).toBeInTheDocument();
expect(screen.getByRole("menuitem", { name: "Duplicate placement" })).toBeInTheDocument();
expect(screen.getByRole("menuitem", { name: "Remove placement" })).toBeInTheDocument();
expect(screen.queryByRole("menuitem", { name: /Create child/i })).not.toBeInTheDocument();
expect(screen.queryByRole("menuitem", { name: /Split/i })).not.toBeInTheDocument();
expect(screen.queryByRole("menuitem", { name: /Accept/i })).not.toBeInTheDocument();
expect(screen.queryByRole("menuitem", { name: /Reject/i })).not.toBeInTheDocument();
```

- [ ] **Step 6.2: Add real Assembly placement actions**

Add or reuse pure draft helpers for:

- Rename placement.
- Duplicate placement with a new id and a small position offset.
- Remove placement.
- Bring to front: `movePlacementLayer(draft, id, 0)`.
- Send to back: `movePlacementLayer(draft, id, layerOrder.length - 1)`.
- Move forward/backward by one row.

All helpers update the draft only; autosave handles persistence.

- [ ] **Step 6.3: Wire right-click**

Right-click behavior:

- Right-click placement selects it and opens the Assembly context menu.
- Right-click blank canvas opens no object menu or opens only canvas-level real actions.
- Escape and outside click close the menu.
- Menu actions update draft and preserve selection predictably.

- [ ] **Step 6.4: Render toolbar actions only when real**

Toolbar rules:

- Render Select, Pan, Zoom out, Zoom in, Fit, Save/Retry.
- Render Undo/Redo only if Assembly has a real draft-history implementation in this task.
- Do not render Move, Lock, More, Preview, Export, grid/list, or filter buttons unless the action is wired.
- Shared toolbar code accepts capability config, not a full plugin registry.

- [ ] **Step 6.5: Verify toolbar/context menu tests**

Run:

```powershell
cd D:\work\art-pipeline-v2-demo\frontend
npm test -- --run tests/coursePlanner/chapter-workspace-assembly-editor-canvas.test.tsx tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx tests/coursePlanner/chapter-workspace-assembly-editor.test.tsx
```

Expected: no fake buttons remain in Assembly, and right-click has real Assembly actions only.

## Task 7: Style Alignment With The Art-Pipeline Main Canvas

**Files:**
- Modify: `frontend/src/features/coursePlanner/components/assemblyWorkspace.css`
- Modify: `frontend/src/features/coursePlanner/components/assemblyEditorShell.css`
- Modify: `frontend/src/features/coursePlanner/components/AssemblyWorkspaceFeedback.tsx`
- Modify: `frontend/tools/course-planner-visual-harness.tsx`

- [ ] **Step 7.1: Align canvas shell**

Use the art-pipeline visual structure:

- `canvas-panel`
- `canvas-stage`
- `canvas-artboard`
- viewport pan/zoom shell
- overlay boxes and handles
- floating zoom/fit controls

The Assembly canvas must not look like a tldraw embed.

- [ ] **Step 7.2: Align left and right rail density**

Rules:

- Left asset pool remains compact and useful for many assets.
- Right properties block does not dominate the rail.
- Placement list has enough vertical room to behave like a layer list.
- Text in rows/buttons does not overflow.
- No decorative gradients/orbs and no one-note palette drift.

- [ ] **Step 7.3: Keep conflict feedback visible but non-blocking**

Conflict/failed save feedback appears as a compact banner in the workspace, not a full-screen blocker.

The banner text must distinguish:

- Save failure: Retry saves the same local manifest after a failed request.
- Server conflict: Retry means overwrite newer server assembly with the local draft.

## Task 8: Visual Harness And Regression Verification

**Files:**
- Modify: `frontend/tests/coursePlanner/coursePlannerVisualReferenceFixtures.ts`
- Modify: `frontend/tools/course-planner-visual-harness.tsx`
- Use: `frontend/tools/capture-course-planner-screenshots.mjs`
- Output: `output/verification/*.png`

- [ ] **Step 8.1: Update visual fixture**

Fixture requirements:

- At least two placed assets.
- At least one used asset and one unused asset in the left pool.
- Multiple layer rows so the placement list is visibly meaningful.
- One selected placement.
- The selected placement is partially overlapping another placement so z-order is visually inspectable.
- Autosave handler returns the saved manifest with a changed `updated_at` to exercise the fixed save echo path.

- [ ] **Step 8.2: Run focused Course Planner tests**

Run:

```powershell
cd D:\work\art-pipeline-v2-demo\frontend
npm test -- --run tests/coursePlanner
```

Expected: all Course Planner tests pass.

- [ ] **Step 8.3: Run build**

Run:

```powershell
cd D:\work\art-pipeline-v2-demo\frontend
npm run build
```

Expected: build passes. Existing chunk-size warnings are acceptable only if already present.

- [ ] **Step 8.4: Capture visual screenshots**

Run:

```powershell
cd D:\work\art-pipeline-v2-demo\frontend
node tools/capture-course-planner-screenshots.mjs
```

Expected outputs:

- `output/verification/chapter-route-1920x1080.png`
- `output/verification/assembly-route-1920x1080.png`
- `output/verification/assembly-assets.png`
- `output/verification/assembly-canvas.png`
- `output/verification/assembly-inspector.png`
- `output/verification/assembly-footer.png`
- `output/verification/assembly-reference-vs-current.png`

- [ ] **Step 8.5: Inspect screenshots before claiming completion**

Required visual pass points:

- No tldraw watermark or tldraw UI.
- Drag/select handles look like the art-pipeline canvas, not raw image boxes.
- Left asset pool has no type chips, no filter button, no grid/list toggle, no Linked/Unlinked tag text.
- Used/unused state remains visible.
- Right rail shows properties on top and placement/layer list below at the intended proportions.
- Placement list has multiple rows and selected row matches selected canvas object.
- Conflict banner does not cover the workspace.
- Toolbar contains only real actions.

## Task 9: Final Full Verification

**Files:**
- All files touched by Tasks 1-8.

- [ ] **Step 9.1: Run full focused test suite**

Run:

```powershell
cd D:\work\art-pipeline-v2-demo\frontend
npm test -- --run tests/coursePlanner
```

Expected: pass.

- [ ] **Step 9.2: Run build**

Run:

```powershell
cd D:\work\art-pipeline-v2-demo\frontend
npm run build
```

Expected: pass.

- [ ] **Step 9.3: Check patch hygiene**

Run:

```powershell
cd D:\work\art-pipeline-v2-demo
git diff --check
git diff --stat
git grep -n "All assets\|Target assets\|Prop assets\|Scene assets\|Linked\|Unlinked\|tldrawAssemblyAdapter\|assemblyCanvasControls" -- frontend/src frontend/tests
```

Expected:

- `git diff --check` has no whitespace errors.
- Rejected UI labels are absent from Assembly source/tests unless they appear in historical docs.
- tldraw Assembly adapter/control imports are absent.

## Acceptance Checklist

- [ ] Dragging a placement no longer triggers a false `Conflict`.
- [ ] Save echo with changed `updated_at` does not trigger conflict.
- [ ] True remote assembly divergence still triggers conflict.
- [ ] Failed save still produces failed state with Retry.
- [ ] Assembly main canvas no longer uses tldraw.
- [ ] Assembly reuses art-pipeline viewport, selection, pan, zoom, fit, box-edit, and focus behavior.
- [ ] Pipeline-only canvas actions do not appear in Assembly.
- [ ] Left asset pool is grid-only.
- [ ] Left asset pool has no fake filter icon, no chips, no grid/list toggle, and no Linked/Unlinked card tag text.
- [ ] Unused asset click adds a placement.
- [ ] Used asset click selects and locates existing placement.
- [ ] Right rail has properties on top and placement/layer list below.
- [ ] Properties panel is compact and shows only high-frequency fields.
- [ ] Placement list is canvas-linked and controls `layer_order`.
- [ ] `layer_order[0]` remains frontmost.
- [ ] Right-click exists and shows Assembly-only real actions.
- [ ] Toolbar contains only real wired actions.
- [ ] No fake buttons remain.
- [ ] `npm test -- --run tests/coursePlanner` passes.
- [ ] `npm run build` passes.
- [ ] Browser screenshots are captured and inspected.

## Commit Boundaries For Subagent Execution

Use one commit per finished task group:

1. `test: cover assembly autosave conflict policy`
2. `fix: classify assembly autosave server echoes`
3. `refactor: expose shared canvas object primitives`
4. `feat: reuse shared canvas for assembly authoring`
5. `feat: simplify assembly asset pool`
6. `feat: rebuild assembly properties and layer list`
7. `feat: add assembly context menu and toolbar capabilities`
8. `test: verify assembly visual harness`

Do not commit if focused tests for that task fail.
