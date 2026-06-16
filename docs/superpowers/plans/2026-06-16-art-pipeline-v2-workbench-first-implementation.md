# Art Pipeline V2 Workbench-First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local web workbench where a user uploads a finished scene image, gets auto annotation proposals, edits/splits elements, extracts transparent assets, sends incomplete assets to Codex repair, validates them, and exports the asset pack.

**Architecture:** The browser workbench is the primary product surface. A Python FastAPI backend owns image I/O, proposal generation, mask/extraction processing, Codex repair task contracts, QA, and export. Run management is intentionally minimal: one active workspace at a time is enough for the demo.

**Tech Stack:** Python 3.11, FastAPI, Pillow, OpenCV, numpy, pydantic, pytest; frontend with Vite, React, TypeScript, Konva or Canvas 2D.

---

## Product Flow

The demo should feel like this:

```text
Upload image
  -> image appears on canvas
  -> click Auto Annotate
  -> element thumbnails appear in side panel
  -> toggle boxes / names / masks on canvas
  -> manually add new elements
  -> split an existing element into smaller elements
  -> optionally create an AI split request from a text description
  -> run subject extraction / background removal for selected elements
  -> mark incomplete elements and draw missing region
  -> generate Codex repair task
  -> validate repaired output
  -> export transparent assets and manifest
```

The workbench is not a run database. It should not spend first-version effort on history management, permissions, accounts, multi-project search, or batch libraries.

## What To Avoid In This Phase

- No elaborate run manager.
- No account/login/cloud sync.
- No perfect all-model auto segmentation requirement.
- No ComfyUI, Diffusers, or OpenAI API key path.
- No full-asset regeneration.
- No background clean plate unless the core extraction loop is already working.
- No overbuilt backend CLI as the main UX.

## Target User Interface

```text
┌──────────────────────────────────────────────────────────────┐
│ Top Bar: Upload | Auto Annotate | Extract | Repair | Export   │
├──────────────────┬────────────────────────────┬──────────────┤
│ Element Panel    │ Main Canvas                 │ Inspector    │
│ thumbnails       │ source image                │ selected     │
│ labels/status    │ boxes / names / masks       │ element      │
│                  │ manual draw / split         │ settings     │
├──────────────────┴────────────────────────────┴──────────────┤
│ Bottom Panel: extracted preview | repair QA | export summary  │
└──────────────────────────────────────────────────────────────┘
```

## Core Data Model

The frontend and backend share this element shape:

```json
{
  "id": "element_001",
  "name": "Cat",
  "status": "proposal",
  "mode": "visible_only",
  "bbox": { "x": 120, "y": 510, "w": 170, "h": 130 },
  "canvas": { "x": 100, "y": 490, "w": 220, "h": 180 },
  "layer": 10,
  "thumbnail": "elements/element_001/thumb.png",
  "mask": null,
  "parentId": null,
  "source": "auto_cv",
  "notes": ""
}
```

Allowed statuses:

```text
proposal
accepted
split_parent
extract_ready
extracted
repair_pending
repair_complete
qa_failed
exported
```

Allowed modes:

```text
visible_only
needs_completion
completed_by_codex
rejected
```

## Task 1: Workbench Shell And Upload

**Complexity:** Medium

**Purpose:** create the web-first project skeleton and make image upload/display work.

**Files:**
- Replace old Node/demo runtime.
- Create Python backend under `backend/art_pipeline/`.
- Create React frontend under `frontend/`.
- Keep demo image under `source-demo/cat-bathroom-core-scene-v5.png`.

- [ ] Create a minimal backend with FastAPI endpoints:

```text
POST /api/workspace/source
GET  /api/workspace/source
GET  /api/workspace/state
PUT  /api/workspace/state
```

The backend stores one active workspace under:

```text
workspace/
  source/original.png
  state.json
```

- [ ] Create a frontend shell with:

```text
Top toolbar
Left element panel
Center canvas
Right inspector
Bottom preview panel
```

Use React state for the current image and elements. Do not add routing unless needed.

- [ ] Implement upload:

User selects a PNG, backend saves it, frontend displays it on the main canvas.

- [ ] Add smoke tests:

Backend:

```text
upload PNG -> source exists -> state initialized
```

Frontend:

```text
page loads -> upload control exists -> canvas area exists -> element panel exists
```

- [ ] Verify:

```powershell
python -m pytest backend/tests -q
cd frontend; npm test -- --run
```

## Task 2: Auto Annotation Proposals And Element Panel

**Complexity:** Complex

**Purpose:** make the core interaction visible: auto annotate creates element candidates, thumbnails, labels, and canvas overlays.

**Files:**
- Backend: `proposals.py`, `elements.py`, `thumbnails.py`
- Frontend: canvas overlay components, element panel, toolbar toggles

- [ ] Implement `POST /api/workspace/auto-annotate`.

Provider chain:

```text
1. cv_proposals: OpenCV contour/color-region proposal boxes, always available
2. imported_proposals: optional JSON file for deterministic demos
3. sam2_proposals: adapter interface only in this phase
```

The endpoint returns candidates with `bbox`, `canvas`, `name`, `thumbnail`, `source`, and `confidence` when available.

- [ ] Generate thumbnails.

For every proposal, crop the source image by `bbox`, save:

```text
workspace/elements/<element_id>/thumb.png
```

- [ ] Show proposals in the element panel.

Each row/card shows:

```text
thumbnail
name/id
status
source
visibility toggle
```

- [ ] Add canvas overlay toggles:

```text
show boxes
show names
show thumbnails/selection
show masks
```

At this stage, boxes and names are the required overlay. Masks may be empty until extraction.

- [ ] Add accept/reject behavior.

Accepted proposals become editable elements. Rejected proposals stay hidden unless the user toggles rejected elements.

- [ ] Test:

```text
auto annotate returns at least deterministic candidate objects for a synthetic test image
thumbnail files are written
element panel renders candidates
box/name toggles affect the canvas overlay state
```

## Task 3: Manual Annotation, Editing, And Split

**Complexity:** Complex

**Purpose:** let users correct the automatic result and control asset granularity.

**Files:**
- Backend: `annotations.py`, `masks.py`
- Frontend: drawing tools, inspector, split workflow

- [ ] Implement manual add.

User can draw a rectangle or polygon on the canvas and create a new element from it.

Element defaults:

```text
status: accepted
mode: visible_only
name: user editable
bbox: drawn region
canvas: bbox plus editable padding
layer: next layer
```

- [ ] Implement inspector editing.

For the selected element, user can edit:

```text
name
mode
layer
bbox numbers
canvas numbers
notes
visibility
```

- [ ] Implement split existing element.

User selects an element, chooses Split, then draws one or more sub-boxes/polygons inside or around it.

Result:

```text
parent element status -> split_parent
new child elements get parentId
children inherit layer neighborhood
children get their own bbox/canvas/thumbnail
```

- [ ] Add AI split request contract, not full AI execution.

The UI has a field:

```text
"Split selected element into: [text description]"
```

Backend writes:

```text
workspace/split_requests/<request_id>.json
```

with selected element id, description, source crop path, and expected output contract. This prepares the later AI-assisted split feature without blocking this phase.

- [ ] Implement save/load element state.

Elements must survive page reload through `state.json`.

- [ ] Test:

```text
manual element creation writes valid state
split creates children and marks parent split_parent
AI split request file contains selected element and description
canvas toggles still work after split
```

## Task 4: Subject Extraction And Background Removal

**Complexity:** Complex

**Purpose:** after elements are confirmed, run the image-processing path that turns them into transparent PNG assets.

**Files:**
- Backend: `segmentation.py`, `extraction.py`, `mask_refine.py`, `asset_outputs.py`
- Frontend: extraction button, asset preview, mask overlay display

- [ ] Implement extraction command from selected/all accepted elements.

Endpoint:

```text
POST /api/workspace/extract
```

Input:

```json
{ "elementIds": ["element_001"], "strategy": "bbox_alpha" }
```

Strategies:

```text
bbox_alpha: initial deterministic fallback using user polygon/box mask
sam2_subject: adapter interface for SAM2 box/point segmentation
```

- [ ] Produce masks and transparent PNGs.

Output per element:

```text
workspace/elements/<id>/mask.png
workspace/elements/<id>/asset_incomplete.png
workspace/elements/<id>/extraction.json
```

The extracted visible pixels must come from the source image.

- [ ] Show extraction preview.

Bottom panel and inspector show:

```text
source crop
mask overlay
transparent asset on checkerboard
canvas vs bbox
```

- [ ] Add mask controls needed for this phase.

Minimum:

```text
replace mask by current polygon
clear mask
re-extract
```

Brush/eraser and SAM2 point prompts can be later enhancements.

- [ ] Test:

```text
extracting an element creates mask.png and asset_incomplete.png
asset canvas size equals element canvas
transparent output preserves original source pixels
empty masks fail clearly
frontend shows extracted preview for selected element
```

## Task 5: Residual Completion With Codex Repair

**Complexity:** Medium

**Purpose:** support the residual/incomplete asset stage without letting Codex redraw full assets.

**Files:**
- Backend: `repair_tasks.py`, `qa.py`
- Frontend: missing-mask editor, repair panel, QA overlay

- [ ] Add `needs_completion` workflow.

When selected element mode is `needs_completion`, the inspector shows:

```text
draw missing mask
preview preserve mask
create Codex repair task
validate repair output
```

- [ ] Implement missing-mask drawing.

User draws missing area on the canvas or asset preview. Backend saves:

```text
workspace/elements/<id>/missing_mask.png
```

Mask dimensions must match the asset canvas, not the whole source image.

- [ ] Generate Codex repair task folder.

Output:

```text
workspace/elements/<id>/repair/
  source_crop.png
  scene_context.png
  incomplete_asset.png
  preserve_mask.png
  missing_mask.png
  guide_overlay.png
  repair_prompt.md
```

Prompt constraints:

```text
Preserve every pixel inside preserve_mask.png.
Modify only pixels inside missing_mask.png.
Do not redraw the whole object.
Output completed_asset.png with the same size as incomplete_asset.png.
Write repair_report.json.
```

- [ ] Validate repair output.

The user or Codex places:

```text
completed_asset.png
repair_report.json
```

Backend checks:

```text
preserve pixels unchanged
no edits outside missing_mask
same dimensions
valid alpha
generated area ratio
```

- [ ] Show repair comparison.

UI displays:

```text
before asset
after asset
missing mask overlay
changed pixels overlay
QA pass/warn/fail
```

- [ ] Test:

```text
repair task folder contains all required files
QA fails if preserved pixels change
QA fails if pixels appear outside missing_mask
QA passes for valid missing-mask-only edit
UI surfaces QA status
```

## Task 6: Export And Demo Pass

**Complexity:** Medium

**Purpose:** produce the final asset pack and prove the workbench can run the demo flow.

**Files:**
- Backend: `exporter.py`
- Frontend: export panel
- Docs: `README.md`

- [ ] Implement export.

Output:

```text
workspace/export/
  assets/<element_id>.png
  masks/<element_id>.png
  manifest.json
  level.json
  contact_sheet.png
  qa_report.json
```

Export rules:

```text
visible_only -> export asset_incomplete.png
needs_completion with valid repair -> export completed_asset.png
needs_completion without valid repair -> block or export only with explicit visible_only override
split_parent -> not exported by default
rejected -> not exported
```

- [ ] Add export panel.

The panel shows:

```text
exportable count
blocked count
warnings
contact sheet preview
open export folder path
```

- [ ] Run demo flow on `cat-bathroom-core-scene-v5.png`.

Required manual demo:

```text
upload source image
auto annotate
accept several proposals
toggle boxes and names
manually add one element
split one element into children
extract at least three assets
mark one as needs_completion
draw missing_mask
create repair task
validate a repaired output if available
export asset pack
```

Do not fake a real Codex repair image. If no repair image is produced during this run, leave the repair task ready and export visible-only assets.

- [ ] Add README.

README must explain:

```text
how to start backend/frontend
how to upload and auto annotate
how to add/split elements
how extraction works
how Codex repair tasks work
how to export
```

- [ ] Final verification:

```powershell
python -m pytest backend/tests -q
cd frontend; npm test -- --run
```

Also verify these files exist after demo:

```text
workspace/source/original.png
workspace/state.json
workspace/elements/*/thumb.png
workspace/elements/*/asset_incomplete.png
workspace/export/manifest.json
workspace/export/contact_sheet.png
```

## Future Iterations

These are intentionally outside the first pass:

- SAM2 point-prompt UI.
- GroundingDINO text-prompt auto detection.
- AI-assisted split execution from text description.
- Brush/eraser mask refinement.
- Background clean plate generation.
- Multi-run library and history browser.
- Batch processing many images.

## Acceptance Criteria

The plan is complete when the user can:

- upload a scene image and see it on the workbench canvas;
- click Auto Annotate and receive element candidates with thumbnails;
- toggle annotation boxes and names on the canvas;
- manually add a new element;
- split an existing element into child elements;
- save and reload element state;
- extract selected elements into transparent PNGs from source pixels;
- mark an element as incomplete and draw a missing mask;
- generate a Codex repair task for that element;
- validate a repaired output against preserve/missing masks;
- export assets, masks, manifest, contact sheet, and QA report.
