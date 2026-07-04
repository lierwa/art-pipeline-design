# Task 2 Report: Build Manifest Draft Helpers Test-First

## Scope

- `frontend/src/features/coursePlanner/assembly/assemblyManifestDraft.ts`
- `frontend/tests/coursePlanner/assembly/assemblyManifestDraft.test.ts`
- No commit created

## TDD RED Evidence

I wrote the focused Vitest suite first, before adding any production module, then ran the required command:

```bash
npm --prefix frontend test -- --run assemblyManifestDraft
```

Expected RED failure:

```text
FAIL  tests/coursePlanner/assembly/assemblyManifestDraft.test.ts [ tests/coursePlanner/assembly/assemblyManifestDraft.test.ts ]
Error: Failed to resolve import "../../../src/features/coursePlanner/assembly/assemblyManifestDraft" from "tests/coursePlanner/assembly/assemblyManifestDraft.test.ts". Does the file exist?
```

This confirmed the test was exercising a missing Task 2 implementation instead of passing accidentally.

## Implementation

Added a pure manifest-draft helper module that:

- clones assembly manifest state into an editor draft while syncing `empty_scene_image_id`
- embeds chapter-asset lookup metadata inside the draft so add/remove/update helpers stay pure and protocol-focused
- adds single-placement authoring with deterministic placement ids and normalized default transforms
- updates transforms, runtime roles, dependencies, grouping, ungrouping, removal cleanup, and layer-order moves
- validates unknown dependency ids and dependency cycles
- projects a clean `ChapterSceneAssemblyManifest` for save, stripping editor-only fields

Chinese WHY comments were added for:

- manifest protocol isolation from editor implementation details
- preserving protocol `layer_order` semantics while renderers reverse for paint order

## Test Coverage Added

The new suite covers all required Task 2 cases:

1. draft creation syncs `empty_scene_image_id`
2. adding an unused asset creates one default placement at front
3. re-adding a used asset is ignored
4. invalid normalized transforms clamp on save projection
5. layer move mutates `layer_order` only
6. removal cleans placements, groups, layer order, and dependencies
7. validation rejects unknown dependencies and cycles
8. grouping is first-level only; nested grouping is rejected
9. manifest projection strips editor-only shape/tldraw data

## TDD GREEN Evidence

Re-ran the same focused command after implementation:

```bash
npm --prefix frontend test -- --run assemblyManifestDraft
```

Passing result:

```text
✓ tests/coursePlanner/assembly/assemblyManifestDraft.test.ts (9 tests) 13ms

Test Files  1 passed (1)
Tests       9 passed (9)
```

## Concerns

- `AssemblyManifestDraft` currently carries an internal `asset_catalog` for purity and deterministic helper behavior. `projectManifestForSave(...)` strips it, but later editor tasks must keep treating that field as draft-only metadata, never as persisted protocol.

## Reviewer Fix Notes (2026-07-03)

- Critical fix: `projectManifestForSave(...)` now clamps `transform.w/h` with a strict positive normalized floor (`0.001`) instead of allowing `0`, while still preserving the existing `[0,1]` clamp for `cx/cy`.
- Important fix: `validateAssemblyDraft(...)` now rejects malformed group/reference integrity, including dangling placement `group_id`, groups that reference unknown placements, group membership mismatches between `group.id` and child `placement.group_id`, and degenerate groups with fewer than two members.
- Focused regression coverage was added in `frontend/tests/coursePlanner/assembly/assemblyManifestDraft.test.ts` for both the positive size floor and the new group-integrity validation errors.
- Verification rerun: `npm --prefix frontend test -- --run assemblyManifestDraft` -> `1 passed`, `10 passed`.

## Second Review Fix Notes (2026-07-03)

- `validateAssemblyDraft(...)` now treats `layer_order` as a real save-time protocol contract and emits explicit errors for duplicate placement ids, unknown placement ids, and placements missing from the order.
- `normalizeLayerOrder(...)` now dedupes surviving raw order entries before appending missing placements, so draft creation and move/helper flows still self-heal malformed in-memory order without preserving duplicate ids.
- `projectManifestForSave(...)` still normalizes `layer_order`, but the code now documents that callers must run `validateAssemblyDraft(...)` before save instead of treating projection as validation.
- Focused Vitest coverage now locks the three `layer_order` validation errors plus the dedupe-on-create/project behavior.
- Verification rerun: `npm --prefix frontend test -- --run assemblyManifestDraft` -> `1 passed`, `13 passed`.
