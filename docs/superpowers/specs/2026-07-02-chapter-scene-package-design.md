# Chapter Scene Package Design

## Summary

The selected design is a single Chapter Scene Studio for authoring one Chapter Scene Package per Chapter. The system does not call Image2 directly. It manages copy-ready prompts, references, uploaded scene images, pipeline runs, chapter assets, and an engine-agnostic assembly manifest.

The new hierarchy is:

```text
Scene Category
  -> Chapter
    -> Chapter Scene Package
```

`Scene Category` replaces the old bare `Scene` / `ScenePack` concept in UI and code naming, while persisted legacy paths can remain compatible during migration. `PromptVersion` and `ImageAttempt` are removed from the new workflow; prompt history is captured through uploaded-image snapshots instead of a separate prompt-version system.

## Domain Model

`Chapter Scene Package` is a child resource of a Chapter and is treated as naturally present, even if lazily created on first access. It contains:

- Current Chapter Scene Prompt.
- Target Object List.
- Chapter Reference List.
- Empty Base Scene Candidates and one current Empty Base Scene.
- Complete Scene Images tied to the current base.
- Pipeline run associations for complete images.
- Chapter Asset Pool.
- Chapter Scene Assembly Manifest.

`Chapter Scene Prompt` is a current editable prompt source, not a versioned workflow. It projects into two copy-ready prompt views:

- Base prompt: for creating empty base scene candidates externally in ChatGPT/Image2.
- Complete prompt: for creating complete scene images externally in ChatGPT/Image2 using the current locked base as a required reference.

`Prompt Ready` means the prompt is non-empty and the Target Object List is non-empty. Reference images are useful but not required for readiness.

Uploaded base candidates and complete images store:

- `promptSnapshot`, defaulting to the current projected prompt but editable during upload.
- `referenceSnapshot`, defaulting to the current relevant references but adjustable during upload.
- Optional `variationPrompt` for complete images.

Prompt edits do not invalidate existing uploaded images. If an uploaded image was created from older prompt/reference snapshots, the UI shows a lineage mismatch warning without blocking its use.

## Studio Flow

Chapter Scene Studio is one stable workspace, not a strict wizard or four separate pages. It has a compact progress rail:

```text
Prompt / Base / Images / Runs / Assembly
```

The rail supports not ready, ready, warning, and error states.

Progress rules:

- Prompt ready: prompt and target objects exist.
- Base ready: exactly one current Empty Base Scene is locked.
- Images ready: at least one active Complete Scene Image exists for the current base.
- Runs ready: at least one active run has completed and at least one run asset has been added to the Chapter Asset Pool.
- Assembly ready: manifest is valid, has at least one target placement, all target placements have valid transforms, dependencies reference existing placements, and dependency cycles do not exist.

### Base

Base candidates are uploaded manually after external ChatGPT/Image2 generation. They can be uploaded in batches. Candidates are compared manually with thumbnail/list and large preview; no AI score or review is used. `Lock as base` is only available from large preview/details.

The Empty Base Scene is the current authority, not a permanent lock. It can be replaced through an explicit destructive action with second confirmation. Replacing the base:

- Makes old complete images and their runs historical/inactive.
- Clears current assembly placements.
- Keeps Chapter Assets, but marks assets sourced from the old base with warning badges.
- Updates the Complete Prompt required reference to the new base.

### Complete Images

Complete Scene Images are uploaded manually after external ChatGPT/Image2 generation using the current base reference. They support batch upload. Uploads stay in the image list and do not auto-open previews.

Each Complete Scene Image can be sent to the art pipeline manually. Sending to pipeline creates one independent pipeline run for that image, stays in the Studio, and displays status plus a link to the run details. Pipeline internals remain on the run side; Studio only shows run status summary and resulting assets.

### Run Assets

Run Asset Relationship Panel manages the relationship between current chapter runs and the Chapter Asset Pool.

- Active view: runs associated with the current base.
- Historical view: runs associated with inactive bases or old complete images.
- Active run assets can be multi-selected and added without confirmation.
- Historical run assets can still be added, but require warning and confirmation because their source base differs.
- Each Pipeline Run Asset has at most one direct added relationship to the current chapter.
- Add to Chapter materializes a chapter-owned asset copy and keeps lineage back to the run asset.
- Added assets do not auto-sync if the source run asset changes. Replacement from source is explicit.

Chapter Asset deletion never touches the source run asset. If the asset is used in assembly, deleting it requires confirmation and removes the corresponding placement and dependency references.

## Asset Pool And Layer Tree

The right-side authoring area is split into two concepts:

- Chapter Asset Pool: all assets available to the current chapter.
- Assembly Layer Tree: items and groups already placed in the assembly.

Asset Pool:

- Shows `Unused` or `Used`.
- Does not show runtime role; role belongs to placements.
- Used assets cannot be dragged into the canvas again.
- Clicking a Used asset locates its placement.
- Duplicate Chapter Asset creates a new unused asset with a new asset id, reusing file metadata and lineage.
- Duplicate Chapter Asset does not copy placement, dependency, or runtime role.
- Duplicate Placement is out of first-version scope.

Layer Tree:

- Follows Photoshop-style ordering: items higher in the list render in front.
- Layer order is the z-order authority for authoring.
- Supports multi-select, drag reorder, grouping, and ungrouping.
- Groups are expandable nodes and are authoring metadata.
- First version does not support nested groups.
- Group nodes do not have runtime role; only placement nodes do.

## Assembly Canvas And Manifest

Assembly authoring should use mature open-source libraries instead of custom-building selection, transform, grouping, or layer-tree engines. The design target is:

- `tldraw` for canvas editing: image shapes, selection, move, resize, rotate, grouping, z-order, undo/redo, and persistence hooks.
- `react-arborist` for resource/layer hierarchy, following the existing art pipeline AssetTreePanel pattern.

The runtime contract is not the tldraw snapshot. The authoritative contract is `Chapter Scene Assembly Manifest`, an engine-agnostic data structure consumable by Cocos, Flutter, or another runtime. Editor snapshots are optional authoring cache only.

Manifest principles:

- Store `baseSize` with the Empty Base Scene original width and height.
- Placement transform stores normalized center coordinates and normalized size: `cx`, `cy`, `w`, `h`.
- Rotation is stored as `rotationDeg`.
- Pixel values are UI/export derivations, not the primary manifest fields.
- Asset metadata is stored separately from placements.
- Placements reference assets by stable `assetId`.
- Names and display names are labels only and may repeat.
- IDs are system-generated, hidden by default, and not user-editable.
- Runtime `layerOrder` is a separate flattened array of placement ids. `layerOrder[0]` is frontmost.
- Groups can be saved as authoring metadata, but runtime can ignore them because the manifest exposes final placement transforms and flattened placement order.
- Group transforms are baked into each child placement's absolute transform when manifest is projected.

Autosave:

- Autosave applies to Assembly Manifest only.
- Debounce saves after editing pauses; do not write on every pointer move.
- Save status shows Saving, Saved, or Save failed.
- Save failure keeps editing enabled, preserves dirty state, and exposes Retry.
- Other production actions such as upload, lock base, replace base, send to pipeline, add/remove assets remain explicit operations.

## Runtime Roles And Dependencies

Each placement has a runtime role:

- `target`: player must drag and correctly place this item.
- `initial`: item is already present when gameplay starts and is not a drag target.

Default role is `target`. The Layer Tree shows a green indicator for target and a yellow indicator for initial, with tooltip/title text. Editing the role happens in the placement property panel, not by clicking the indicator. Multi-select can batch-set runtime role.

`initial` placements:

- Render at scene start.
- Do not participate as drag targets.
- Can satisfy dependencies immediately.
- Keep dependency metadata if present, but runtime ignores dependencies on initial placements.

Dependencies:

- `requiresPlaced` belongs to placement, not asset.
- It references stable placement ids only.
- It can form chains but must not form cycles.
- A target placement's dependencies are satisfied only when required placements are correctly placed or are initial.
- During gameplay, dragging is allowed even if dependencies are not satisfied.
- Drop validation checks dependencies. If dependencies are not satisfied, the item returns to the list/slot and a generic toast appears.
- No per-placement custom blocked toast is stored in the manifest.
- Removing a placement clears other placements' references to it but does not delete those placements.

First-version hit testing uses the final placement box plus a global tolerance. Per-placement target areas, custom tolerance, and gameplay step order are out of scope.

## Storage

Chapter Scene Package is stored under the chapter in the scene library, not under workspace/runs. Runs are processing records and are referenced by lineage only.

Target storage shape:

```text
scene_packs/<category_id>/chapters/<chapter_id>/
  chapter.json
  scene_package/
    package.json
    references/
    base_candidates/
    complete_images/
    assets/
    assembly.json
```

The path can remain under legacy `scene_packs` during compatibility migration, while code and UI concepts move to `SceneCategory`.

Files use system-generated storage names. Original filenames are metadata only, avoiding unsafe paths, duplicates, spaces, and cross-platform filename issues.

References:

- Only explicitly added references enter the Chapter Scene Package.
- `docs/assets` or local paths are never auto-imported.
- Added references are copied into `scene_package/references/`.
- Deleting a current reference requires confirmation and does not mutate historical snapshots.
- Complete prompt always includes the current locked base as a required reference, without needing to duplicate it into the normal reference list.

Manifest delivery:

- The manifest data contract is required.
- Delivery form is not locked: it may be returned from an API or exported as static JSON.
- Manifest builder must read Chapter Scene Package business data, not tldraw/editor internals.

## Confirmation Actions

Any delete, remove, replace, clear, or unlink action that discards authoring work requires second confirmation using the existing confirmation component/pattern. High-risk non-destructive actions that can introduce mismatched source material also require confirmation. Examples:

- Delete base candidate.
- Replace base.
- Delete complete image.
- Remove chapter asset.
- Remove placement from assembly.
- Clear placements caused by base replacement.
- Add historical/inactive-base run asset back to current chapter.

## Out Of Scope

First version does not include:

- Image2 API integration.
- AI review or scoring for base candidates.
- PromptVersion / ImageAttempt workflow.
- Global reference library.
- Cross-chapter asset marketplace.
- Nested groups.
- Duplicate Placement.
- Per-placement custom target areas or tolerance.
- Gameplay step order.
- Backend version history for assembly edits.
- Runtime dependency on tldraw snapshots.

## Open Implementation Notes

- Existing `ScenePack` and route names can be migrated gradually toward `SceneCategory` while keeping persisted data compatible.
- Existing `AssetTreePanel` and `ConfirmActionDialog` are useful implementation references for Layer Tree and confirmations.
- Existing `workspace/runs/<run_id>` semantics should remain the processing-record boundary, not the course-authoring data owner.
