# Art Pipeline V2 Workbench Demo

This repository contains a local web workbench for turning one scene PNG into a sticker-ready game asset pack. The backend stores all workspace files under `workspace/`; the frontend drives the main pipeline:

```text
Upload -> Detection Vocabulary -> Detect / Click Detect -> Segment Edge QA -> Repair -> Export
```

The intended output is a set of transparent sticker assets that have passed edge QA, plus their masks and metadata. The older `bbox_alpha` crop path is kept as a debug fallback only; it is not a passing sticker output.

## Quick Start

From the repository root, install both backend and frontend dependencies:

```bash
npm run install:all
```

Start the backend and frontend together:

```bash
npm run dev
```

Open the URL Vite prints, usually `http://127.0.0.1:5176`. The dev script runs the FastAPI backend on `http://127.0.0.1:8000` and the Vite frontend with `/api` proxied to that backend. By default it uses the real GroundingDINO provider.

Install and cache the real GroundingDINO model before first use:

```bash
npm run install:all:model
npm run download:model
```

For a no-model local demo run:

```bash
npm run dev:demo
```

## Start The Backend

Install the backend package and development dependencies:

```powershell
python -m pip install -e "backend[dev]"
```

For local GroundingDINO-style detection, also install the optional model dependencies:

```powershell
python -m pip install -e "backend[dev,model]"
```

Run the FastAPI server from the repository root:

```powershell
uvicorn art_pipeline.api:app --reload --app-dir backend
```

The API uses `workspace/` as its default workspace root. Detection is disabled unless a provider is configured. For real GroundingDINO-style detection:

```powershell
$env:ART_PIPELINE_DETECTION_PROVIDER = "grounding_dino"
uvicorn art_pipeline.api:app --reload --app-dir backend
```

For a lightweight local demo provider:

```powershell
$env:ART_PIPELINE_DETECTION_PROVIDER = "demo"
uvicorn art_pipeline.api:app --reload --app-dir backend
```

`ART_PIPELINE_GROUNDING_DINO_MODEL` can optionally point at a local or hosted model id supported by the provider.

## Start The Frontend

Install frontend dependencies:

```powershell
cd frontend
npm install
```

Run the Vite dev server:

```powershell
npm run dev
```

Open the URL Vite prints, usually `http://127.0.0.1:5176`. Keep the backend running in a separate terminal.

## Sticker Asset Workflow

Use **Upload PNG** to select a source image. The app accepts PNG files only and writes the active source to:

```text
workspace/source/original.png
workspace/state.json
```

For the demo image, upload:

```text
source-demo/cat-bathroom-core-scene-v5.png
```

After upload, define the **Detection Vocabulary** for the sticker objects that should become assets. Use **Detect** for vocabulary-driven detection, or **Click Detect** when the object needs a point-guided prompt. Detection results become reviewable candidates with labels, confidence, bounding boxes, provider metadata, and history.

The model responsibilities are intentionally split:

- Grounding DINO detects vocabulary-matched boxes; it does not produce final sticker cutouts.
- SAM2 turns selected boxes or click prompts into edge masks used for sticker matting and edge QA.
- Codex or another redraw provider is only orchestrated during **Repair**, where it completes missing or occluded pixels after segmentation has identified the asset boundary.

Run **Segment Edge QA** before export. Assets that fail edge QA should be corrected through **Repair** and validated again. **Export** consumes only assets that have passed QA, so debug crops, rejected candidates, and incomplete repair outputs stay out of the final pack.

The legacy auto-CV route is retired; `/api/workspace/auto-annotate` returns `410 Gone`.

The standalone API does not fall back automatically. If `ART_PIPELINE_DETECTION_PROVIDER` is not set, `/api/workspace/detect` returns a clear configuration error instead of fabricating candidates. `npm run dev` sets `grounding_dino` by default, while `npm run dev:demo` opts into the lightweight demo provider. If the provider fails, the error is surfaced and existing review state is preserved. If the provider returns no usable results after filtering, the workspace remains empty for review.

The approved UI reference for this model-backed workflow is:

```text
docs/assets/model-backed-pipeline-ui-v1.png
```

## Add And Split Elements

Use **Draw element** on the canvas, drag a rectangle, name it, and choose **Create element**. Manual elements are saved as accepted `visible_only` elements with a thumbnail.

Select an element and use **Split selected** to draw child rectangles. **Apply split** marks the parent as `split_parent` and creates child elements. Split parents stay in the workspace for traceability, but are not exported by default.

Element names, modes, layers, bounding boxes, canvas boxes, notes, and visibility can be edited in the inspector. Save inspector changes before extraction, mask, or repair actions.

## Debug Extraction

Use **Extract** for the selected element or **Extract All** for accepted/extract-ready elements when you need the debug fallback. The `bbox_alpha` strategy crops the source to the element canvas, creates a rectangular alpha mask, and writes:

```text
workspace/elements/<element_id>/mask.png
workspace/elements/<element_id>/asset_incomplete.png
workspace/elements/<element_id>/source_crop.png
workspace/elements/<element_id>/extraction.json
```

The incomplete asset contains only source pixels. This is useful for inspecting candidate state, but it is not a qualified sticker asset. A final sticker export should come from SAM2 edge masks, QA validation, and repair where needed.

## Repair

Use repair only for elements whose mode is `needs_completion`. Draw or enter a canvas-space missing-mask rectangle, then save it. The app writes:

```text
workspace/elements/<element_id>/missing_mask.png
```

Choose **Create Codex repair task** to package local repair inputs:

```text
workspace/elements/<element_id>/repair/source_crop.png
workspace/elements/<element_id>/repair/scene_context.png
workspace/elements/<element_id>/repair/incomplete_asset.png
workspace/elements/<element_id>/repair/preserve_mask.png
workspace/elements/<element_id>/repair/missing_mask.png
workspace/elements/<element_id>/repair/guide_overlay.png
workspace/elements/<element_id>/repair/repair_prompt.md
```

The workbench does not fake repaired images. Codex or the configured redraw provider prepares and validates the repair workflow, but the completed pixels must come from a real repair output:

```text
workspace/elements/<element_id>/repair/completed_asset.png
workspace/elements/<element_id>/repair/repair_report.json
```

Then choose **Validate repair output**. QA passes only when the completed asset is a PNG with alpha, matches the incomplete asset dimensions, has a valid repair report, preserves protected pixels, and changes only pixels inside the missing mask. Passing QA marks the element `repairStatus="repair_complete"` / `exportStatus="ready"` and switches its legacy status/mode to `repair_complete` / `completed_by_codex`. Failed QA marks `repairStatus="qa_failed"` / `exportStatus="blocked"`.

## Export

Use **Export Asset Pack** after accepted assets have passed edge QA and any required repair validation. The backend writes:

```text
workspace/export/
  assets/<element_id>.png
  masks/<element_id>.png
  manifest.json
  level.json
  contact_sheet.png
  qa_report.json
```

The final asset pack contains transparent sticker PNGs with a deterministic white sticker outline, the corresponding accepted masks, `manifest.json`, `level.json`, and `qa_report.json`. The export path is deliberately conservative: it consumes only QA-passing assets and records blocked items in the QA report instead of silently exporting fallback crops.

Default export rules are conservative:

```text
sticker/removable_child with segmentationStatus=mask_accepted -> exported from sam2_edge/transparent_asset.png
parent with segmentationStatus=mask_accepted and no removed children -> exported from sam2_edge/transparent_asset.png
parent with accepted removable_child masks -> blocked until a fresh parent repair validates
needs_completion/completed_by_codex with valid repair QA -> exported from repair/completed_asset.png
needs_completion without valid repair QA -> blocked
embedded_keep / skip / rejected -> blocked and reported, not silently exported
bbox_alpha outputs -> debug-only, never a passing sticker export by themselves
```

Every exported asset has a matching `export/masks/<element_id>.png`. The mask keeps the accepted SAM2 or repair alpha semantics; the white outline is applied only to the exported asset PNG so game tooling can render sticker cutouts without treating the outline as source mask data. Missing `mask_accepted` state blocks export for sticker, parent, and removable-child roles; bbox-only, maskless, or unrepaired `asset_incomplete.png` outputs are not final asset-pack inputs. Legacy requests that send `{ "allowIncompleteVisibleOnly": true }` are still blocked for unrepaired completion assets and report `needs_completion_without_valid_repair`.

The export panel shows the exportable count, blocked count, warnings, contact sheet preview, and the export folder path.

## Verification

Run backend tests:

```powershell
python -m pytest backend/tests -q
```

Run frontend tests and build:

```powershell
cd frontend
npm test -- --run
npm run build
```
