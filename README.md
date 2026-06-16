# Art Pipeline V2 Workbench Demo

This repository contains a local web workbench for turning one scene PNG into a structured asset pack. The backend stores all workspace files under `workspace/`; the frontend drives upload, annotation, element edits, extraction, repair task packaging, QA validation, and export.

## Start The Backend

Install the backend package and development dependencies:

```powershell
cd D:\work\art-pipeline-v2-demo\backend
python -m pip install -e .[dev]
```

Run the FastAPI server from the repository root:

```powershell
cd D:\work\art-pipeline-v2-demo
uvicorn art_pipeline.api:app --reload --app-dir backend
```

The API uses `workspace/` as its default workspace root.

## Start The Frontend

Install frontend dependencies:

```powershell
cd D:\work\art-pipeline-v2-demo\frontend
npm install
```

Run the Vite dev server:

```powershell
npm run dev
```

Open the URL Vite prints, usually `http://localhost:5173`. Keep the backend running in a separate terminal.

## Upload And Auto Annotate

Use **Upload PNG** to select a source image. The app accepts PNG files only and writes the active source to:

```text
workspace/source/original.png
workspace/state.json
```

For the demo image, upload:

```text
source-demo/cat-bathroom-core-scene-v5.png
```

After upload, use **Auto Annotate**. The backend proposes deterministic regions from the source image and writes thumbnails under `workspace/elements/<element_id>/thumb.png`. Proposals appear in the element list and can be accepted or rejected.

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

Use **Export Asset Pack** after extraction and any available repair validation. The backend writes:

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
visible_only -> export asset_incomplete.png
needs_completion with valid repair -> export completed_asset.png
needs_completion without valid repair -> blocked
split_parent -> skipped
rejected -> skipped
```

Every exported asset has a matching `export/masks/<element_id>.png`. If the source mask is missing but the exported PNG has an alpha channel, export derives the mask from alpha and records a warning in `manifest.json` and `qa_report.json`. If neither a mask nor asset alpha is available, the element is blocked.

The API also supports an explicit override:

```json
{ "allowIncompleteVisibleOnly": true }
```

With that override, unrepaired `needs_completion` elements can export `asset_incomplete.png` with a warning. The frontend uses the safer default and leaves blocked elements listed in the export panel.

The export panel shows the exportable count, blocked count, warnings, contact sheet preview, and the export folder path.

## Verification

Run backend tests:

```powershell
cd D:\work\art-pipeline-v2-demo
python -m pytest backend/tests -q
```

Run frontend tests and build:

```powershell
cd D:\work\art-pipeline-v2-demo\frontend
npm test -- --run
npm run build
```
