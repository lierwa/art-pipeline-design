# Chapter Scene Assembly Editor Plan

> Required execution skill: `superpowers:subagent-driven-development`.
> Do not start implementation or `npm run dev` unless the user explicitly authorizes it.

## Goal

Build the real Chapter Scene Assembly editor: one selected Empty Scene Image is the locked scene background, Chapter Assets are placed on top of it, and Lock Final publishes the composed chapter scene snapshot.

## Architecture Rules

- `ChapterSceneAssemblyManifest` is the only runtime contract.
- `tldraw@5.1.0` is only the authoring canvas implementation; runtime must never depend on tldraw records.
- `react-arborist` is only the layer-tree UI; persisted order remains `layer_order`.
- `layer_order[0]` is frontmost. Canvas/export draws reverse order: back to front.
- Empty Scene Image is not "Lock as Base", not a composition backdrop, and not the final chapter asset.
- Final Chapter Scene is produced by Lock Final from the current assembly snapshot. Lock Final does not freeze the draft assembly.
- Chapter Asset Pool has one connected authoring surface. Do not leave a second disconnected asset list with different Used/Unused truth.
- Target Object Coverage is a real placement constraint: a target object is ready only when a placed Chapter Asset links to that target object id.
- Historical target-object exemption notes are inert; they may be displayed as notes but must not satisfy readiness.
- Direct Scene Asset Upload is first-class. Do not expose manual run asset ids, fake run lineage, Add-from-Run, or a fake run-asset picker.
- Old Prompt Version workflow must not remain exposed through UI buttons, events, labels, tests, API routes, or current product docs.

## Tech Choices

- React 18, TypeScript, Vitest, Testing Library.
- `tldraw@5.1.0`: chosen because 5.2.x requires Node `>=22.12.0`, while this workspace uses Node `v21.7.3`.
- Existing `react-arborist@^3.10.5` for layer tree.
- Backend Pydantic validation and existing Course Planner routes/store.
- No custom canvas engine, no custom layer-tree engine, no `node_modules` scan.

## Non-Goals

- No Image2 API integration.
- No separate reference base image or composition backdrop.
- No legacy Prompt Version authoring.
- No nested groups.
- No Duplicate Placement.
- No per-placement custom hit area, tolerance, blocked-toast text, or gameplay step order.
- No tldraw snapshot as Cocos/Flutter/runtime protocol.

## Acceptance Criteria

1. Author sees selected Empty Scene Image as locked background and coordinate reference.
2. Author can add an unused Chapter Asset, move, resize, rotate, and save the manifest.
3. Asset Pool separates Unused and Used. Used asset locates its placement instead of creating duplicates.
4. Layer Tree controls z-order, selection, grouping, and ungrouping. Higher rows render in front.
5. Property panel edits runtime role, transform fields, and dependencies on stable placement ids.
6. Removing placement requires confirmation and removes dependency references.
7. Autosave saves only manifest after editing pauses, shows Saving/Saved/Save failed/Retry, and preserves dirty edits on failure.
8. Assembly Ready requires selected Empty Scene, at least one placement, valid transforms, complete layer order, no deleted asset refs, and real target-object coverage by placed assets.
9. Lock Final flushes or blocks dirty assembly state, then exports the current manifest.
10. No user-visible old Prompt Version workflow remains in Chapter Scene Studio.
11. Connected asset pool supports Add, Locate, Duplicate Chapter Asset, direct upload, and delete confirmation.
12. Runtime role never appears on asset rows because role belongs to placements.
13. Empty Scene replacement preserves Complete Scene Images, pipeline run history, Chapter Assets, and placements by default, then flags alignment mismatch; clearing placements requires confirmation.
14. Final scene snapshot preserves lineage for selected Empty Scene, prompt, references, assembly, and placed assets.
15. Browser QA confirms desktop/narrow layouts do not overlap and canvas is nonblank.

## Patch Audit Before Work

- Audit existing dirty diff before adding feature code.
- Static SVG preview in `AssemblyWorkspacePanel` is not the placement editor and must be replaced.
- Existing `saveChapterSceneAssembly` API must be wired through page and studio.
- Unauthorized pre-approval RED test in `chapter-workspace.test.tsx` must be removed or moved into the approved assembly-editor test file.
- Deleted old Prompt Version docs/plans remain deleted unless replaced by current migration rationale.

## Gap Audit

1. Connected asset pool must be the single authoring surface.
2. Duplicate/delete Chapter Asset need explicit API, UI, and tests.
3. Target Object Coverage must be placed-asset coverage only.
4. Canvas media loading, URL building, default placement sizing, and fit-to-background need shared helpers.
5. `initial` role must cover rendering, dependency satisfaction, and non-drag-target semantics.
6. Empty Scene replacement must preserve work by default and show alignment warning.
7. Final snapshot must include placed-asset lineage so later asset deletion/duplication cannot erase published explanation.
8. Visual QA must include browser screenshot/nonblank checks.
9. Legacy run-asset controls must not leak into current editor.
10. Backend route/store validation must cover persisted behavior.

## Task 0: Patch Audit And Boundary Lock

Scope: `chapter-workspace.test.tsx`, `AssemblyWorkspacePanel`, `ChapterSceneStudio`, `ChapterWorkspacePage`, current docs.

Steps:
- Classify and remove unauthorized placement-editor RED test unless explicitly adopted.
- Move any adopted RED scenario to `chapter-workspace-assembly-editor.test.tsx`.
- Run legacy scan for `promptVersion`, `Prompt Version`, `Tune Prompt`, `Scene Intent Preview`, and `Image2 Prompt Preview`.
- Classify hits as current product language, historical rationale, or code/doc to delete.
- Do not scan `node_modules`.

Verification:
- `git diff -- frontend/tests/coursePlanner/chapter-workspace.test.tsx`
- `rg -n "promptVersion|Prompt Version|Tune Prompt|Scene Intent Preview|Image2 Prompt Preview" frontend backend docs/superpowers docs/adr`

## Task 1: Add Canvas Dependency Deliberately

Scope: `frontend/package.json`, `frontend/package-lock.json`, editor boundary.

Requirements:
- Add `tldraw@5.1.0`.
- Keep `react-arborist@^3.10.5`.
- Import tldraw CSS only from the editor boundary.
- Add a Chinese WHY comment explaining tldraw is authoring-only and manifest remains protocol.
- Verify macOS install/build. Do not claim Windows readiness without Windows or CI install/lockfile evidence.

Verification:
- `npm --prefix frontend install`
- `npm --prefix frontend run build`

## Task 2: Manifest Draft Helpers

Create `assemblyManifestDraft.ts` and tests.

Exports:
- `createAssemblyDraft`
- `addAssetPlacement`
- `updatePlacementTransform`
- `movePlacementLayer`
- `removePlacement`
- `setPlacementRuntimeRole`
- `setPlacementDependencies`
- `groupPlacements`
- `ungroupPlacementGroup`
- `validateAssemblyDraft`
- `projectManifestForSave`

Behavior:
- Copy current manifest and sync `empty_scene_image_id` with selected Empty Scene.
- Add unused asset once with normalized transform defaults, role `target`, no dependencies, and layer index `0`.
- Clamp invalid normalized values before save.
- Layer move changes only `layer_order`.
- Removing placement clears groups and all `requires_placed` references.
- Reject unknown dependency ids and cycles.
- Grouping is first-level only; nested grouping rejected.
- Projection never emits editor-only shape ids or tldraw records.
- Keep helper pure: no React, DOM, tldraw, or network calls.
- Add Chinese WHY comments for protocol isolation and layer-order reversal.

Verification:
- `npm --prefix frontend test -- --run assemblyManifestDraft`

## Task 3: Wire Assembly APIs

Scope: backend API models/routes/store, frontend page/studio/API, assembly editor tests.

Requirements:
- Wire `saveChapterSceneAssembly` from page to studio to `AssemblyWorkspacePanel`.
- Add frontend `duplicateChapterAsset` and backend `POST /api/course-planner/chapters/{chapterId}/scene-package/chapter-assets/{assetId}/duplicate`.
- Add frontend `deleteChapterAsset` and backend `DELETE /api/course-planner/chapters/{chapterId}/scene-package/chapter-assets/{assetId}`.
- Duplicate creates a new available Chapter Asset with new id, same file metadata/lineage/linked target object, and no placement/dependency/runtime role copied.
- Delete marks chapter-owned asset removed; if used, remove its placement and clear dependency references.
- Save failures must be visible in UI state, not console-only.

Verification:
- `npm --prefix frontend test -- --run chapter-workspace-assembly-editor`
- `npm --prefix frontend test -- --run course-planner-scene-package-api`
- `cd backend && uv run --python 3.12 --extra dev pytest tests/course_planner/test_scene_package_routes_assembly_media_delete.py -q`

## Task 4: Editor Shell And Connected Asset Pool

Create/modify assembly asset pool, canvas shell, placement properties shell, shared media helper, and studio wiring.

Behavior:
- No Empty Scene selected: show real empty state; no fake canvas.
- Empty Scene selected: locked background and coordinate system.
- One connected `AssemblyAssetPoolPanel` inside `AssemblyWorkspacePanel`.
- Asset rows show thumbnail, display name, source filename, linked target object, and Used/Unused state.
- Unused assets expose Add to Assembly. Used assets expose Locate Placement and cannot be added again.
- Duplicate asset creates a new unused row.
- Direct Scene Asset Upload adds an immediately placeable unused asset.
- No Add-from-Run button and no manual run asset id field.
- Selecting placement updates property panel and layer tree.
- Default placement size preserves asset aspect ratio and fits selected Empty Scene.
- `scenePackageMedia.ts` owns media URL/loading helpers shared by canvas and final export.
- Layout is compact and work-focused.

Tests:
- Missing Empty Scene disables Add.
- Add creates one placement and marks asset Used.
- Used asset locates placement.
- Save status moves through dirty/saved.
- Duplicate creates a second unused row.
- Upload Scene Asset appears in same pool.
- No Add-from-Run/manual run id control renders.

Verification:
- `npm --prefix frontend test -- --run chapter-workspace-assembly-editor`

## Task 5: tldraw Canvas Adapter

Create `tldrawAssemblyAdapter.ts` and tests; integrate through `AssemblyEditorCanvas`.

Responsibilities:
- Convert manifest placements to tldraw image shapes and shape changes back to normalized transforms.
- Keep Empty Scene Image locked and non-selectable.
- Shape ids derived from placement ids stay inside adapter.
- Never write tldraw records into manifest.
- Fit camera to Empty Scene on load and replacement.
- Expose Undo, Redo, Fit, Zoom In, and Zoom Out through tldraw.
- Preserve asset aspect ratio on initial placement and property width/height edits unless both dimensions change.

Tests:
- Pixel and normalized transform projection.
- Rotation round-trip.
- Frontmost layer order preserved.
- Unknown editor shapes ignored.
- URLs generated via `scenePackageMediaUrl`.
- Initial size preserves aspect ratio and stays in bounds.
- Fit-to-background yields a nonblank visible frame.

Verification:
- `npm --prefix frontend test -- --run tldrawAssemblyAdapter chapter-workspace-assembly-editor`

## Task 6: Assembly Layer Tree

Use `react-arborist`.

Behavior:
- Display placements and groups; higher rows render in front.
- Reorder writes `layer_order`.
- Support multi-select, grouping, and ungrouping.
- Reject nested groups.
- Runtime role indicators appear on placements only.
- Group nodes are authoring metadata; runtime consumes flattened placement transforms/order.
- Moving/resizing a grouped selection bakes absolute child transforms before save.

Tests:
- Reorder changes `layer_order` and export order.
- Group/ungroup keeps placement ids stable.
- Group nodes do not show runtime role.
- Moved group projection saves absolute child transforms and no group-level transform protocol.

Verification:
- `npm --prefix frontend test -- --run chapter-workspace-assembly-editor assemblyManifestDraft`

## Task 7: Placement Properties

Behavior:
- Show selected placement name and linked asset id as read-only metadata.
- Edit runtime role with `target`/`initial`.
- Edit normalized `cx`, `cy`, `w`, `h`, and `rotation_deg`.
- Edit dependencies by stable placement id.
- Disable dependencies that create self-dependency or cycles.
- Remove placement through existing confirmation pattern.
- Batch-set runtime role for multi-select.
- `initial` placements render at scene start, are not player drag targets, and satisfy dependencies immediately.
- Runtime ignores dependency gating for `initial` drag behavior.
- Do not store custom hit areas, blocked text, tolerance, or gameplay order.

Tests:
- Role update, dependency rejection, remove/cancel confirmation, initial-dependency readiness, and no custom gameplay fields.

Verification:
- `npm --prefix frontend test -- --run chapter-workspace-assembly-editor assemblyManifestDraft`

## Task 8: Autosave And Retry

Behavior:
- Autosave only projected `ChapterSceneAssemblyManifest`.
- Debounce after editing pauses; do not save every pointer move.
- Show Saving, Saved, Save failed, and Retry.
- Failure preserves dirty draft and editing.
- Server package data merges only when no dirty local edits exist; otherwise keep local draft and show conflict/retry state.
- Upload, duplicate, delete, Empty Scene selection, send to pipeline, placement removal, and Lock Final remain explicit operations.
- Autosave never changes uploaded-image prompt snapshots, reference snapshots, or final scene snapshots.
- Slow/older save responses must not overwrite newer dirty edits.

Tests:
- Rapid transforms cause one debounced save.
- Failure preserves transform and exposes Retry.
- Retry sends same projected manifest.
- Successful save refreshes returned package data only when still current.

Verification:
- `npm --prefix frontend test -- --run chapter-workspace-assembly-editor`

## Task 9: Assembly Readiness And Target Coverage

Create `AssemblyTargetCoveragePanel`; update backend/frontend validation.

Behavior:
- Ready requires selected Empty Scene, at least one placement, valid transforms, complete layer order, available asset refs, and placed-asset target coverage.
- UI shows missing readiness reasons without a second fact source.
- Legacy `target_object_exemptions` are read-only notes only.
- No UI/API edits exemptions; no `updateTargetObjectExemptions`; no target-object-exemptions route.
- Coverage panel lists each target object as Covered or Missing.
- Covered means at least one placed Chapter Asset has matching `linked_target_object_id`.
- Missing blocks Assembly Ready and Lock Final even with a historical note.
- Removing a target object prunes stale exemption notes and clears stale Chapter Asset target links.
- Frontend readiness projects from same manifest/package facts as backend validation.

Verification:
- `npm --prefix frontend test -- --run chapter-workspace-assembly-editor`
- `cd backend && uv run --python 3.12 --extra dev pytest tests/course_planner/test_scene_package_models.py tests/course_planner/test_scene_package_assembly_validation.py -q`

## Task 10: Lock Final Uses Current Assembly

Behavior:
- Lock Final disabled while assembly invalid.
- Lock Final flushes pending autosave or blocks with clear dirty-state action.
- Export draws Empty Scene first, then placements back-to-front.
- Published final uses visible draft/current manifest, not stale `scenePackage.assembly`.
- Assembly remains editable after Lock Final.
- `FinalChapterScene` stores placed-asset snapshot: asset id, display name, original filename, storage path, media type, lineage, linked target object id, and status at lock time.
- Final snapshot remains explanatory after asset duplication, removal, or rename.
- Lock Final refuses unknown or removed Chapter Asset refs.

Tests:
- Dirty assembly cannot silently lock stale data.
- Successful Lock Final uploads composed PNG.
- Export honors `layer_order[0]` as frontmost.
- Editing after Lock Final marks assembly dirty without deleting current final.
- Final snapshot includes placed asset lineage and survives later asset removal.

Verification:
- `npm --prefix frontend test -- --run chapter-workspace-assembly-editor chapter-workspace`
- `cd backend && uv run --python 3.12 --extra dev pytest tests/course_planner/test_scene_package_store_media.py -q`

## Task 11: Destructive Confirmation And Empty Scene Replacement

Behavior:
- Removing placement requires confirmation.
- Deleting used Chapter Asset requires confirmation and removes placement/dependency references.
- Replacing Empty Scene warns placements may need repositioning.
- Clearing placements because of Empty Scene replacement requires explicit confirmation.
- Non-destructive Empty Scene replacement preserves assets and placements unless user clears them.
- Replacement preserves Complete Scene Images, pipeline run associations, and Chapter Assets.
- Replacement updates assembly `empty_scene_image_id` and `empty_scene_size`.
- Preserved placements get visible alignment warning until moved/resaved or accepted against new Empty Scene.
- Deleting Complete Scene Image does not delete direct-upload Chapter Assets or final snapshots.
- Reuse existing confirmation component/pattern.

Verification:
- `npm --prefix frontend test -- --run chapter-workspace-assembly-editor`
- `cd backend && uv run --python 3.12 --extra dev pytest tests/course_planner/test_scene_package_store_media.py -q`

## Task 12: Remove Remaining Legacy Surface

Scope: Course Planner frontend/backend/tests, docs, ADRs.

Steps:
- Re-run legacy text search from Task 0.
- Delete or rename current product code/tests exposing old Prompt Version concepts.
- Keep historical ADR/spec text only when it clearly explains replacement decisions.
- Remove buttons/events/handlers/tests not worth maintaining.
- Run legacy run-asset scan for `runAssetId`, `run_asset_id`, `Add from Run`, `Add-from-Run`, and `manual run`.
- Keep run associations only as Complete Scene Image processing history until a verified picker exists.

Verification:
- `rg -n "promptVersion|Prompt Version|Tune Prompt|Scene Intent Preview|Image2 Prompt Preview" frontend backend docs/superpowers docs/adr`
- `rg -n "runAssetId|run_asset_id|Add from Run|Add-from-Run|manual run" frontend backend docs/superpowers docs/adr`
- Every remaining hit is historical rationale, migration note, or explicit prohibition, not current UI/API behavior.

## Final Verification Gate

Required local commands before claiming completion:

```bash
cd backend && uv run --python 3.12 --extra dev pytest tests/course_planner -q
CI=1 npm --prefix frontend test -- --run chapter-workspace-assembly-editor chapter-workspace course-planner-scene-package-api course-planner-routing --pool=forks --poolOptions.forks.singleFork=true --reporter=dot --silent
npm --prefix frontend run build
git diff --check
```

Required scans:

```bash
rg "promptVersion|prompt version|Prompt Version|prompt_versions|generate_prompt_version|PromptVersions|Prompt Versions" -g '!node_modules' -g '!frontend/dist'
rg "target-object-exemptions|updateTargetObjectExemptions|onUpdateTargetObjectExemptions|Save exemption|Exemption reason|covered or explicitly|coverage or exemption" frontend/src frontend/tests backend/art_pipeline backend/tests docs/superpowers -n -g '!node_modules' -g '!frontend/dist'
```

Browser verification, only when the user authorizes starting dev server:

```bash
npm run dev
```

Then verify at `127.0.0.1:5176`:
- Desktop: Empty Scene, Chapter Asset thumbnails, Add/Locate/Duplicate, Layer Tree selection, property edits, readiness, and Lock Final controls behave correctly.
- Narrow width: asset pool, canvas, layer tree, property panel, and final panel remain usable without incoherent overlap.
- Canvas nonblank: selected Empty Scene plus at least one placement produces nontransparent/nonempty pixels before Lock Final.
- Dirty-state: transform an asset, save/refresh returned package data, and confirm visible placement matches saved manifest.

If the full frontend suite is run and unrelated non-CoursePlanner failures appear, record them separately by test file and error summary. Do not claim all frontend tests are green unless the full command passes.

## Review Checklist

- No custom canvas engine or custom layer-tree engine.
- No `node_modules` scan.
- No tldraw snapshot in runtime manifest.
- No duplicate fact source for placement, layer order, runtime role, dependencies, target coverage, or readiness.
- No old Prompt Version button/event/test in current Chapter Scene Studio flow.
- Empty Scene Image is not named or treated as locked base asset.
- Final Chapter Scene is produced from current assembly snapshot.
- Final Chapter Scene includes placed-asset lineage.
- Asset Pool has one connected authoring surface.
- Duplicate Chapter Asset creates a new unused asset and does not copy placement/runtime/dependency state.
- Target Object Coverage is explicit placed-asset data; exemption notes are legacy read-only context.
- Empty Scene replacement preserves source history and flags alignment mismatch.
- Destructive placement/asset/base-change actions have confirmation.
- Backend and frontend agree on manifest validation.
- Browser QA confirms canvas is nonblank and responsive layout does not overlap.
