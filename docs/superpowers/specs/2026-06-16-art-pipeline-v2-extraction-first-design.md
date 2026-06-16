# Art Pipeline V2 Extraction-First Design

## Status

This design supersedes the previous generation-first V2 direction.

The old approach asked Codex or subagents to generate standalone assets from the source scene. That is not acceptable for this project because it changes shape, style, proportions, line work, and object identity. The new pipeline treats the finished scene image as the visual source of truth.

All current project code and generated artifacts may be discarded during implementation, except the demo image used for validation.

## Product Goal

Given a finished scene image, the system helps the user split it into reusable transparent asset files.

The pipeline must be general enough for future similar scene images. Asset granularity is not hard-coded by the project. The system proposes candidate objects, the user confirms or edits the split, and the pipeline exports the resulting units.

The default output is extracted from original pixels. Codex is used only as a constrained repair worker for assets that are incomplete because of occlusion or missing visible structure.

## Core Principle

Original pixels are authoritative.

The pipeline must not redraw whole assets. It should:

1. identify candidate objects;
2. let the user confirm the asset units and masks;
3. extract RGBA assets from the source image;
4. optionally ask Codex to complete only explicitly marked missing regions;
5. verify that existing source pixels were preserved;
6. export transparent PNGs, masks, metadata, previews, and QA reports.

## Non-Goals

- No ComfyUI dependency in the first implementation.
- No Stable Diffusion or Diffusers dependency in the first implementation.
- No OpenAI API key requirement.
- No hidden Codex desktop API assumption.
- No full-scene regeneration.
- No full-object regeneration after extraction.
- No hard-coded rule that only "large" assets can be split.
- No promise of perfect one-click segmentation.
- No automatic acceptance of Codex-completed assets without QA and user review.

## Recommended Technical Stack

### Python Runtime

Use Python 3.11 as the main runtime because the segmentation, image processing, and inpainting ecosystem is stronger in Python than Node.

### Local API And Orchestration

Use FastAPI for the local pipeline service. The service owns run state, file contracts, model calls, image processing, and UI endpoints.

### Image Processing

Use Pillow, OpenCV, and numpy.

Pillow owns PNG/RGBA loading, cropping, compositing, and export.

OpenCV owns mask morphology, connected components, contours, bounding boxes, edge cleanup, and QA calculations.

### Segmentation

Use SAM2 as the primary segmentation engine. SAM2 receives user boxes, positive points, negative points, and existing masks, then returns object masks.

Use GroundingDINO or Grounded-SAM as an optional proposal generator. It suggests candidate boxes and labels, but it does not decide final asset units.

### Annotation UI

Build a lightweight local web annotation UI. The UI is the source of truth for final asset selection.

The user must be able to:

- accept or reject proposals;
- draw a new bounding box;
- add positive and negative points for SAM2;
- edit or replace a mask;
- merge and split candidates;
- name an asset;
- set layer order;
- adjust the asset canvas region;
- mark an asset as `visible_only` or `needs_completion`;
- draw or edit the `missing_mask` for Codex repair.

CVAT can remain a future integration option, but the first demo should not require deploying CVAT.

### Background Cleanup

Do not make background clean-plate generation a blocker for the first implementation.

LaMa or IOPaint may be introduced later to remove exported objects from the source scene and create a clean background layer. This is separate from object extraction and Codex repair.

### Codex Repair

Codex is a constrained completion worker.

The project writes explicit repair task folders. The main Codex agent reads them, creates a completed asset image, and writes a repair report. The project then validates the output.

Codex must only modify the `missing_mask` region. Existing extracted pixels must be preserved.

## Pipeline Stages

### 1. Ingest

Input:

- one finished scene image;
- optional run id;
- optional user note.

Output:

```text
runs/<run_id>/
  source/original.png
  run.json
```

`run.json` records the image hash, dimensions, stage statuses, model versions, and project configuration.

### 2. Proposal Generation

The system generates candidate regions. Proposal generation may use:

- GroundingDINO text prompts for semantic candidates;
- SAM2 automatic mask generation for visual regions;
- simple contour or connected-component heuristics for fallback proposals.

Output:

```text
runs/<run_id>/
  proposals/proposals.json
  proposals/overlay.png
```

Each proposal includes:

```json
{
  "id": "proposal_001",
  "label": "cat",
  "bbox": { "x": 120, "y": 520, "w": 180, "h": 130 },
  "maskPath": "proposals/masks/proposal_001.png",
  "confidence": 0.82,
  "source": "grounding_dino"
}
```

Proposals are suggestions only.

### 3. Human Annotation

The user confirms the final asset units in the local UI.

Output:

```text
runs/<run_id>/
  annotations/assets.json
  annotations/masks/<asset_id>.png
```

`assets.json` is the source of truth for the split:

```json
{
  "schema": "art-pipeline-v2-annotations@extraction-first",
  "assets": [
    {
      "id": "cat",
      "name": "Cat",
      "mode": "needs_completion",
      "bbox": { "x": 110, "y": 500, "w": 220, "h": 170 },
      "canvas": { "x": 90, "y": 480, "w": 260, "h": 220 },
      "mask": "annotations/masks/cat.png",
      "layer": 80,
      "notes": "Complete occluded lower body only if needed."
    }
  ]
}
```

### 4. Mask Refinement

For every confirmed asset, the pipeline refines the mask.

Operations:

- remove small isolated regions;
- fill tiny holes;
- smooth jagged edges where useful;
- optionally feather alpha edges;
- calculate visible bbox and recommended padding;
- preserve the user-approved asset canvas region;
- preserve hard pixel-art-like boundaries when the source style requires it.

The asset canvas is not always the same as the visible mask bbox. For `needs_completion` assets, the canvas must include enough transparent space for the missing region. The pipeline must not over-trim completion candidates to visible pixels only.

Output:

```text
runs/<run_id>/
  masks/refined/<asset_id>.png
  masks/debug/<asset_id>_overlay.png
```

### 5. Source-Pixel Extraction

The pipeline combines the original RGB image with the refined mask to produce transparent RGBA assets.

Output:

```text
runs/<run_id>/
  assets/incomplete/<asset_id>.png
```

This stage must not generate new art. All visible pixels in the extracted asset come from the original image.

Extraction uses the asset `canvas`, not just the tight visible-pixel bbox. This keeps coordinate space stable for later `preserve_mask`, `missing_mask`, and Codex repair output.

Each asset receives a provenance record:

```json
{
  "assetId": "cat",
  "mode": "needs_completion",
  "sourcePixelsOnly": true,
  "output": "assets/incomplete/cat.png",
  "preserveMask": "repairs/cat/preserve_mask.png"
}
```

### 6. Completion Planning

Only assets marked `needs_completion` enter this stage.

The UI asks the user to draw or approve a `missing_mask`. This mask represents the only area Codex may fill.

Output:

```text
runs/<run_id>/
  repairs/<asset_id>/
    preserve_mask.png
    missing_mask.png
    guide_overlay.png
```

Definitions:

- `preserve_mask`: existing extracted source pixels. Codex must not alter these.
- `missing_mask`: transparent or incomplete area that Codex is allowed to fill.
- `guide_overlay`: a visual instruction image showing source context, existing cutout, preserve area, and missing area.

### 7. Codex Repair Task

The project generates a task folder for each incomplete asset:

```text
runs/<run_id>/
  repairs/<asset_id>/
    source_crop.png
    scene_context.png
    incomplete_asset.png
    preserve_mask.png
    missing_mask.png
    guide_overlay.png
    repair_prompt.md
```

The prompt must require:

- output an RGBA PNG with the same canvas size as `incomplete_asset.png`;
- preserve pixels inside `preserve_mask`;
- modify only pixels inside `missing_mask`;
- match the line style, colors, proportions, and object structure from `source_crop.png`;
- do not redesign the object;
- do not change facial expression, visible silhouette, visible colors, or visible details;
- write `repair_report.json`.

Expected Codex output:

```text
runs/<run_id>/
  repairs/<asset_id>/
    completed_asset.png
    repair_report.json
```

`repair_report.json`:

```json
{
  "schema": "art-pipeline-v2-codex-repair-report@extraction-first",
  "assetId": "cat",
  "status": "complete",
  "output": "repairs/cat/completed_asset.png",
  "notes": [
    "Filled only the lower missing region."
  ]
}
```

### 8. QA

The QA stage validates extracted and repaired assets.

Checks:

- PNG can be decoded;
- alpha channel exists;
- visible pixels are non-empty;
- output dimensions are stable;
- asset is not clipped at the canvas edge unless annotated;
- `preserve_mask` pixels are unchanged within a small tolerance;
- generated pixels stay inside `missing_mask`;
- generated area ratio is recorded;
- missing-mask edits above threshold require user approval;
- contact sheet and overlay previews are generated.

Recommended thresholds:

- `generatedAreaRatio <= 0.15`: eligible for normal review;
- `0.15 < generatedAreaRatio <= 0.30`: force human approval;
- `generatedAreaRatio > 0.30`: fail by default unless explicitly overridden.

Output:

```text
runs/<run_id>/
  qa/assets/<asset_id>.json
  qa/contact_sheet.png
  qa/recompose_preview.png
```

### 9. Export

The export stage writes final assets and metadata.

Output:

```text
runs/<run_id>/
  export/
    assets/<asset_id>.png
    masks/<asset_id>.png
    manifest.json
    level.json
    contact_sheet.png
    qa_report.json
```

`manifest.json` records provenance:

```json
{
  "schema": "art-pipeline-v2-export-manifest@extraction-first",
  "assets": [
    {
      "id": "cat",
      "mode": "completed_by_codex",
      "sourceAsset": "assets/incomplete/cat.png",
      "finalAsset": "export/assets/cat.png",
      "sourcePixelsPreserved": true,
      "generatedAreaRatio": 0.08,
      "requiresHumanApproval": true
    }
  ]
}
```

## Asset Modes

### visible_only

The asset is exported exactly as visible in the source image. It may be incomplete because of occlusion, but no generated pixels are added.

### needs_completion

The asset is incomplete and should be sent to Codex repair after the user provides a `missing_mask`.

### completed_by_codex

The asset was extracted from source pixels and then completed by Codex within the approved `missing_mask`.

### rejected

The asset failed QA or user review and is not exported as final.

## Codex Repair Rules

Codex repair is opt-in per asset.

The pipeline must never silently send every asset to Codex.

Codex repair must be constrained by files, not prose alone. The `missing_mask` and `preserve_mask` are part of the contract.

The repaired output must be rejected if:

- preserved source pixels changed beyond tolerance;
- pixels were generated outside the allowed region;
- output dimensions changed;
- alpha became invalid;
- the repair report is missing;
- the generated area is too large and no override exists.

## Folder Structure

```text
D:\work\art-pipeline-v2-demo
  source-demo/
    cat-bathroom-core-scene-v5.png
  src/
    art_pipeline/
      api/
      models/
      segmentation/
      annotation/
      extraction/
      repair/
      qa/
      export/
  web/
    annotation-ui/
  runs/
    <run_id>/
      source/
      proposals/
      annotations/
      masks/
      assets/
        incomplete/
      repairs/
      qa/
      export/
  tests/
```

## Commands

Initial command shape:

```bash
python -m art_pipeline ingest --source cat-bathroom-core-scene-v5.png --run cat_bathroom
python -m art_pipeline propose --run cat_bathroom
python -m art_pipeline serve --run cat_bathroom
python -m art_pipeline refine-masks --run cat_bathroom
python -m art_pipeline extract --run cat_bathroom
python -m art_pipeline create-repair-tasks --run cat_bathroom
python -m art_pipeline validate --run cat_bathroom
python -m art_pipeline export --run cat_bathroom
```

The Codex repair stage is manual-orchestrated:

1. the project writes repair task folders;
2. the main Codex agent reads the repair task list;
3. Codex completes only selected incomplete assets;
4. the project validates the results.

## Error Handling

Every stage writes status into `run.json`.

Hard failures:

- missing source image;
- invalid image format;
- missing annotation source of truth;
- invalid mask dimensions;
- extraction produced an empty asset;
- repair output changed preserved pixels;
- repair output wrote pixels outside `missing_mask`;
- export requested a failed asset without override.

Recoverable failures:

- proposal model unavailable;
- GroundingDINO not installed;
- SAM2 proposal failure;
- user chooses manual annotation;
- asset marked `visible_only` instead of completion.

## Testing Strategy

Unit tests:

- run creation and file contracts;
- annotation schema validation;
- mask dimension validation;
- mask refinement on synthetic masks;
- RGBA extraction from image and mask;
- QA detects changed preserve pixels;
- QA detects edits outside `missing_mask`;
- export manifest provenance.

Integration tests:

- run the pipeline on a small fixture image with mocked masks;
- extract at least one transparent asset from source pixels;
- generate a fake Codex repair output and verify QA behavior;
- verify failed repair outputs are not exported.

Manual visual validation:

- run against the bathroom demo image;
- confirm multiple asset masks in the UI;
- export visible-only assets;
- complete at least one deliberately incomplete asset through Codex repair;
- compare contact sheet, repair overlay, and recompose preview.

## Acceptance Criteria

The first implementation is acceptable when:

- the old generation-first path is not used;
- a finished source image creates a run;
- the UI can define final asset units and masks;
- transparent PNG assets are extracted from original pixels;
- at least one incomplete asset can produce a Codex repair task;
- Codex repair output is validated against `preserve_mask` and `missing_mask`;
- QA reports generated area ratio and preservation status;
- export includes assets, masks, manifest, contact sheet, and QA report;
- no ComfyUI, Diffusers, or OpenAI API key is required.

## Implementation Notes

The first build should prioritize a reliable local loop:

1. ingest one image;
2. manually define masks in the UI;
3. refine masks;
4. extract transparent assets;
5. create Codex repair task folders;
6. validate a repaired asset;
7. export.

Automatic proposal models can be added after the manual loop is stable. This avoids blocking the whole pipeline on model setup and keeps the core workflow testable.
