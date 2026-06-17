# Art Pipeline V2 Workbench Demo

This repository contains a local web workbench for turning one scene PNG into a structured asset pack. The backend stores all workspace files under `workspace/`; the frontend drives upload, model-backed detection, candidate review, element edits, extraction, repair task packaging, QA validation, and export.

## Quick Start

From the repository root, install both backend and frontend dependencies:

```bash
npm run install:all
```

Start the backend and frontend together:

```bash
npm run dev
```

Open the URL Vite prints, usually `http://localhost:5173`. The dev script runs the FastAPI backend on `http://127.0.0.1:8000` and the Vite frontend with `/api` proxied to that backend. By default it uses the real GroundingDINO provider.

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

Open the URL Vite prints, usually `http://localhost:5173`. Keep the backend running in a separate terminal.

## Upload And Run Detection

Use **Upload PNG** to select a source image. The app accepts PNG files only and writes the active source to:

```text
workspace/source/original.png
workspace/state.json
```

For the demo image, upload:

```text
source-demo/cat-bathroom-core-scene-v5.png
```

After upload, use **Run Detection**. The backend calls the configured detection provider and normalizes model results into reviewable candidates with labels, confidence, bounding boxes, provider metadata, and history. The legacy auto-CV route is retired; `/api/workspace/auto-annotate` returns `410 Gone`.

The standalone API does not fall back automatically. If `ART_PIPELINE_DETECTION_PROVIDER` is not set, `/api/workspace/detect` returns a clear configuration error instead of fabricating candidates. `npm run dev` sets `grounding_dino` by default, while `npm run dev:demo` opts into the lightweight demo provider. If the provider fails, the error is surfaced and existing review state is preserved. If the provider returns no usable results after filtering, the workspace remains empty for review.

The approved UI reference for this model-backed workflow is:

```text
docs/assets/model-backed-pipeline-ui-v1.png
```

## Add And Split Elements

Use **Draw element** on the canvas, drag a rectangle, name it, and choose **Create element**. Manual elements are saved as accepted `visible_only` elements with a thumbnail.

Select an element and use **Split selected** to draw child rectangles. **Apply split** marks the parent as `split_parent` and creates child elements. Split parents stay in the workspace for traceability, but are not exported by default.

Element names, modes, layers, bounding boxes, canvas boxes, notes, and visibility can be edited in the inspector. Save inspector changes before extraction, mask, or repair actions.

## Extraction

Use **Extract** for the selected element or **Extract All** for accepted/extract-ready elements. The current extraction strategy is `bbox_alpha`: it crops the source to the element canvas, creates a mask, and writes:

```text
workspace/elements/<element_id>/mask.png
workspace/elements/<element_id>/asset_incomplete.png
workspace/elements/<element_id>/source_crop.png
workspace/elements/<element_id>/extraction.json
```

The incomplete asset contains only source pixels. For `visible_only` elements, this is the exported asset source.

## Codex Repair Tasks

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

The workbench does not fake repaired images. A real repair output must provide:

```text
workspace/elements/<element_id>/repair/completed_asset.png
workspace/elements/<element_id>/repair/repair_report.json
```

Then choose **Validate repair output**. QA passes only when the completed asset is a PNG with alpha, matches the incomplete asset dimensions, has a valid repair report, preserves protected pixels, and changes only pixels inside the missing mask. Passing QA marks the element `repair_complete` and switches its mode to `completed_by_codex`.

## Export

Use **Export Asset Pack** after accepted assets have masks and any available repair validation. The backend writes:

```text
workspace/export/
  assets/<element_id>.png
  masks/<element_id>.png
  manifest.json
  level.json
  contact_sheet.png
  qa_report.json
```

Default export rules are conservative:

```text
accepted standalone/child/merged with mask -> exported
accepted parent with exportParent and mask -> exported
accepted asset without mask -> blocked
needs_completion with valid repair and mask -> exported
needs_completion without valid repair or mask -> blocked
rejected -> skipped
```

Every exported asset has a matching `export/masks/<element_id>.png`. Missing masks block default export for accepted assets; bbox-only or maskless export is not treated as the normal asset-pack path.

The API also supports an explicit override:

```json
{ "allowIncompleteVisibleOnly": true }
```

With that override, unrepaired `needs_completion` elements can export `asset_incomplete.png` with a warning. The frontend uses the safer default and leaves blocked elements listed in the export panel.

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
