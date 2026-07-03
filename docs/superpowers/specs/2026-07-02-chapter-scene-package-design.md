# Chapter Scene Package Design

## Summary

The selected design is a single Chapter Scene Studio for authoring one Chapter Scene Package per Chapter. The system does not call Image2 directly. It manages copy-ready prompts, shared Character IP / Reference Library selections, uploaded scene images, pipeline runs, chapter assets, and an engine-agnostic assembly manifest.

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
- Chapter Reference Selection, which points to reusable Reference Library images.
- Empty Scene Image Candidates and one current Empty Scene Image for the assembly background.
- Complete Scene Images used as source material for asset harvesting and visual ideas.
- Pipeline run associations for complete images.
- Direct Scene Asset Uploads.
- Chapter Asset Pool.
- Chapter Scene Assembly Manifest.
- Final Chapter Scene.

`Chapter Scene Prompt` is a current editable prompt source, not a versioned workflow. It projects into two copy-ready prompt views:

- Empty scene prompt: for creating Empty Scene Image candidates externally in ChatGPT/Image2.
- Complete prompt: for creating complete scene images externally in ChatGPT/Image2 as source material for object harvesting and assembly.

`Prompt Ready` means the chapter has enough confirmed facts to project a copy-ready external prompt: Character IP selection, cast action intent, character references, Target Object List, Avoid Object List confirmation, Scene Spatial Contract, and either style references or an explicit no-extra-style-reference decision.

Uploaded Empty Scene Image candidates and Complete Scene Images store:

- `promptSnapshot`, defaulting to the current projected prompt but editable during upload.
- `referenceSnapshot`, defaulting to the current selected library references but adjustable during upload.
- Optional `variationPrompt` for complete images.

Prompt edits do not invalidate existing uploaded images. If an uploaded image was created from older prompt/reference snapshots, the UI shows a lineage mismatch warning without blocking its use.

## Studio Flow

Chapter Scene Studio is one stable workspace, not a strict wizard or four separate pages. It has a compact progress rail:

```text
Prompt / Empty Scene / Images / Runs / Assembly / Final
```

The rail supports not ready, ready, warning, and error states.

Progress rules:

- Prompt ready: all explicit Prompt Ready gates are satisfied.
- Empty Scene ready: one current Empty Scene Image is selected for the assembly background.
- Images ready: at least one active Complete Scene Image exists as source material.
- Runs ready: at least one active run has completed and at least one run asset has been added to the Chapter Asset Pool.
- Assembly ready: one Empty Scene Image is selected, at least one Scene Asset is placed, target objects are either covered or explicitly exempted, all placements have valid transforms and layer order, no placement references a deleted asset, and the Final Chapter Scene can be previewed from the assembly.

### Empty Scene

Empty Scene Image candidates are uploaded manually after external ChatGPT/Image2 generation or local preparation. They can be uploaded in batches. Candidates are compared manually with thumbnail/list and large preview; no AI score or review is used. Selecting the current Empty Scene Image establishes the assembly background; it does not lock the chapter's final asset.

The Empty Scene Image is the background layer for Chapter Scene Assembly, not the final chapter authority. Replacing the Empty Scene Image:

- May require repositioning current assembly placements if the perspective or canvas changes.
- Keeps Complete Scene Images and pipeline runs as source history unless the author explicitly removes them.
- Keeps Chapter Assets, but marks assets that no longer align with the current Empty Scene Image or spatial contract with warning badges.
- Updates the Empty Scene Prompt context, not the identity of the final chapter asset.

### Complete Images

Complete Scene Images are uploaded manually after external ChatGPT/Image2 generation. They support batch upload. Uploads stay in the image list and do not auto-open previews.

Each Complete Scene Image can be sent to the art pipeline manually. Sending to pipeline creates one independent pipeline run for that image, stays in the Studio, and displays status plus a link to the run details. Pipeline internals remain on the run side; Studio only shows run status summary and resulting assets.

### Direct Scene Asset Uploads

Authors can upload clean single-object images directly into the Chapter Asset Pool when they already have usable object art. Direct uploads are first-class Scene Asset sources and should not be forced through a Complete Scene Image just to satisfy pipeline lineage.

### Run Assets

Run Asset Relationship Panel manages the relationship between current chapter runs and the Chapter Asset Pool.

- Active view: runs associated with current Complete Scene Images.
- Historical view: runs associated with removed or archived Complete Scene Images.
- Active run assets can be multi-selected and added without confirmation.
- Historical run assets can still be added, but require warning and confirmation because their source image may no longer match the current spatial contract.
- Each Pipeline Run Asset has at most one direct added relationship to the current chapter.
- Add to Chapter materializes a chapter-owned asset copy and keeps lineage back to the run asset.
- Added assets do not auto-sync if the source run asset changes. Replacement from source is explicit.

Directly uploaded Scene Assets enter the Chapter Asset Pool immediately with upload lineage instead of run lineage.

Chapter Asset deletion never touches the source run asset. If the asset is used in assembly, deleting it requires confirmation and removes the corresponding placement and dependency references.

### Final

Lock Final publishes the current Chapter Scene Assembly as the current Final Chapter Scene snapshot. The snapshot records the selected Empty Scene Image, placement data, layer order, asset lineage, prompt snapshot, reference snapshot, and assembly snapshot needed to explain what was published. After locking, authors may keep editing the assembly draft; the published Final Chapter Scene changes only when Lock Final is run again.

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

- Store Empty Scene Image size as the assembly canvas size.
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
- Other production actions such as upload, select Empty Scene Image, send to pipeline, add/remove assets, and Lock Final remain explicit operations.

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
reference_library/
  images/
character_ip_library/
  characters/
scene_packs/<category_id>/chapters/<chapter_id>/
  chapter.json
  scene_package/
    package.json
    empty_scene_images/
    complete_images/
    assets/
    assembly.json
```

The path can remain under legacy `scene_packs` during compatibility migration, while code and UI concepts move to `SceneCategory`.

Files use system-generated storage names. Original filenames are metadata only, avoiding unsafe paths, duplicates, spaces, and cross-platform filename issues.

Reference Library and Chapter Reference Selection:

- Reference Images are reusable library assets, not prompt text and not chapter-private facts.
- Uploading a reference image from the Studio creates a Reference Library Image first, then selects that image into the current Chapter Reference Selection.
- Chapter Reference Selection records library image ids plus the chapter-local role: character, style, scene, or other.
- `docs/assets` or local paths are never auto-imported.
- Removing a reference from the current chapter only removes that chapter selection. It does not delete the library image and does not mutate historical upload snapshots.
- Deleting a Reference Library Image requires confirmation and is blocked while any active chapter selection still references it.
- Complete prompt uses the current Scene Spatial Contract, selected Reference Library images, and current Empty Scene Image as context; the Empty Scene Image is still not the final asset.

Manifest delivery:

- The manifest data contract is required.
- Delivery form is not locked: it may be returned from an API or exported as static JSON.
- Manifest builder must read Chapter Scene Package business data, not tldraw/editor internals.

## Confirmation Actions

Any delete, remove, replace, clear, or unlink action that discards authoring work requires second confirmation using the existing confirmation component/pattern. High-risk non-destructive actions that can introduce mismatched source material also require confirmation. Examples:

- Delete Empty Scene Image candidate.
- Replace Empty Scene Image.
- Delete complete image.
- Remove chapter asset.
- Remove placement from assembly.
- Clear placements caused by base replacement.
- Add historical run asset back to current chapter.

## Out Of Scope

First version does not include:

- Image2 API integration.
- AI review or scoring for Empty Scene Image candidates.
- PromptVersion / ImageAttempt workflow.
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
