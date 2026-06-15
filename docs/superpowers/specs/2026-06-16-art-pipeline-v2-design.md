# Art Pipeline V2 Demo Design

## Status

Approved direction from discussion: replace the current placeholder demo with a real art-production pipeline demo.

The existing project is not considered V2 because it only reads a hand-written manifest and exports placeholder SVGs. V2 must prove that a source scene image can move through analysis, element planning, batch single-asset production, animation candidate handling, and export.

## Product Goal

Given one cute isometric room scene image, the project creates a production run that can be executed through the local Codex CLI using the user's existing Codex subscription/login state.

The demo must answer one question: can this pipeline turn a full scene image into a usable layered game asset pack?

## Required Demo Behavior

1. A user provides a source scene image.
2. The project creates a run directory and records the original image.
3. Codex analyzes the image and writes a structured scene graph.
4. The pipeline converts the scene graph into an asset manifest.
5. Codex batch-generates clean single-object PNG assets according to the manifest.
6. Animation-suitable assets are tagged and routed into an animation stage.
7. The pipeline validates, previews, and exports the asset pack.

## Runtime Model

The required validation target is a Codex CLI worker-pool pipeline.

The user only has a Codex subscription and must not be asked to provide an OpenAI API key. The project therefore must not depend on `OPENAI_API_KEY`, `CODEX_API_KEY`, OpenAI Images API, or any other API-key-backed image backend.

The local project will not pretend it can directly control the Codex desktop app as a hidden API. Instead, it will invoke `codex exec` workers through the local CLI login state:

- the project creates stage task files;
- the project launches bounded parallel `codex exec` workers;
- Codex reads the task files and performs analysis or image-generation work;
- Codex writes results back to the run directory;
- the project validates outputs and advances the run state.

The project must verify early whether the available Codex CLI environment can actually create PNG image assets. If it cannot, the demo must fail with a clear capability report instead of silently falling back to placeholder SVGs or API keys.

## Non-Goals For The First Real Demo

- No game runtime.
- No WeChat mini-game integration.
- No perfect one-click segmentation guarantee.
- No fake SVG placeholders as final objects.
- No API key requirement.
- No serial one-by-one asset generation for the batch asset stage.
- No tiny-detail over-splitting, such as treating every small bottle as a separate gameplay object unless the manifest says it matters.
- No physically implausible generated structure accepted silently.

## Pipeline Stages

### 1. Ingest

Input:

- source scene image;
- optional text note such as theme, room type, and known constraints.

Output:

- `runs/<run_id>/source/source.png`;
- `runs/<run_id>/run.json`.

`run.json` records stage status, timestamps, source image path, selected backend, and validation state.

### 2. Scene Analysis

Codex analyzes the image and writes `scene_graph.json`.

The scene graph must include:

- scene type and camera style;
- major surfaces such as floor, left wall, right wall, back corner, and wall trim;
- object candidates;
- grouping recommendation;
- rough bbox or polygon region;
- occlusion and layer notes;
- structural plausibility notes;
- animation suitability notes.

For the bathroom reference, the analysis should be able to flag important structure rules:

- the sink vanity must attach to the wall;
- the shower pipe must be continuous and physically coherent;
- shower products may be one grouped tray object;
- wall niche shelves are forbidden unless explicitly requested;
- wall cabinet shelves should use shelf-level grouping when tiny items do not need independent interaction.

### 3. Asset Manifest

The pipeline converts `scene_graph.json` into `asset_manifest.json`.

Each asset entry includes:

- stable id;
- display name;
- type: `background`, `object`, `effect`, or `animation_candidate`;
- source region;
- layer order;
- grouping reason;
- generation prompt;
- negative prompt;
- expected output canvas size;
- alpha requirement;
- review priority.

The manifest is the source of truth for batch production.

### 4. Asset Generation

The pipeline splits `asset_manifest.json` into one job file per asset and starts a bounded pool of parallel `codex exec` workers.

Output:

- transparent PNGs in `assets/objects`;
- background/base layers in `assets/background`;
- effect candidates in `assets/effects`;
- one JSON result per generated asset.

The required output is not a crop with messy background. Each object must be regenerated or cleaned into a standalone asset with transparent background and consistent style.

The batch stage must support:

- configurable `maxParallel`, initially 4;
- one job result file per asset;
- retry for failed jobs;
- per-worker stdout/stderr logs;
- no API-key environment variables passed to workers.

### 5. Asset Validation

The pipeline checks generated assets before export.

Validation includes:

- file exists;
- PNG can be decoded;
- image has alpha channel;
- non-empty visible pixels;
- bounding box is not clipped;
- object size is within expected range;
- object id matches manifest;
- review image/contact sheet can be created.

Visual correctness still needs human review, but the pipeline must catch obvious broken outputs.

### 6. Animation Candidate Stage

Codex analyzes generated single-object assets and the scene graph to produce `animation_manifest.json`.

Candidate examples:

- water surface loop;
- shower water stream;
- cat blink/breath/tail idle;
- curtain sway;
- steam/sparkle effects.

For the first real demo, animation output can be either:

- an animation spec only, if image generation frames are not enabled;
- or actual frame PNGs in `assets/animations/<asset_id>/frames`.

The manifest must still be present either way.

### 7. Export

The export stage produces:

- `export/level.json`;
- `export/assets/**`;
- `export/animation_manifest.json`;
- `export/contact_sheet.png`;
- `export/composite_preview.png`;
- `export/report.md`;
- optional `.zip`.

`level.json` should be usable by a later game prototype. It must contain layer order, asset paths, anchor points, transform defaults, and animation references.

## Proposed First Demo Scope

Use one bathroom scene image and prove the full loop with a small but meaningful asset set:

- room base/background;
- bath tub;
- shower column with integrated tray or clearly separate wall-mounted tray;
- shower curtain;
- sink vanity attached to wall;
- wall cabinet grouped by shelf level;
- toilet;
- cat;
- bath mat;
- bucket or basket;
- water surface as animation candidate.

This is enough to test scene analysis, grouping, structural rules, batch generation, validation, and animation routing without trying to solve every object in the scene on day one.

## Folder Structure

```text
D:\work\art-pipeline-v2-demo
  config\
    pipeline.config.json
    style_guide.md
  inputs\
  runs\
    <run_id>\
      source\
      tasks\
      analysis\
        scene_graph.json
        analysis_report.md
      manifests\
        asset_manifest.json
        animation_manifest.json
      assets\
        background\
        objects\
        effects\
        animations\
      preview\
      export\
      run.json
  src\
    cli\
    core\
    validation\
    preview\
  test\
```

## Commands

Initial command set:

```bash
npm run ingest -- --source <image>
npm run analyze -- --run <run_id>
npm run plan-assets -- --run <run_id>
npm run generate-assets -- --run <run_id>
npm run validate -- --run <run_id>
npm run animate -- --run <run_id>
npm run export -- --run <run_id>
```

`analyze`, `generate-assets`, and `animate` create Codex task files and run them through local `codex exec`. The implementation must scrub API-key environment variables before spawning workers.

## Data Contracts

### scene_graph.json

```json
{
  "sceneId": "cat_bathroom",
  "style": {
    "camera": "isometric",
    "rendering": "cute hand-drawn mobile game art"
  },
  "objects": [
    {
      "id": "shower_column",
      "name": "Shower column with product tray",
      "region": { "type": "bbox", "x": 0, "y": 0, "w": 0, "h": 0 },
      "grouping": "single functional fixture",
      "layerHint": "wall_fixture",
      "structureNotes": ["pipe must be continuous", "no recessed shelf"],
      "animationCandidate": false
    }
  ],
  "issues": []
}
```

### asset_manifest.json

```json
{
  "assets": [
    {
      "id": "shower_column_with_tray",
      "type": "object",
      "sourceObjectIds": ["shower_column"],
      "output": "assets/objects/shower_column_with_tray.png",
      "prompt": "Generate one clean transparent PNG of a cute hand-drawn isometric golden shower column with a physically continuous pipe and a small attached product tray holding grouped bath bottles.",
      "negativePrompt": "no wall niche, no broken pipe, no embedded shelf",
      "layer": 30,
      "requiresAlpha": true,
      "reviewPriority": "high"
    }
  ]
}
```

### animation_manifest.json

```json
{
  "animations": [
    {
      "assetId": "water_surface",
      "kind": "loop",
      "status": "spec_only",
      "suggestedMotion": "subtle ripple loop",
      "frames": []
    }
  ]
}
```

## Error Handling

Every stage writes clear status into `run.json`.

Failure types:

- missing input;
- invalid JSON from Codex;
- missing generated asset;
- PNG validation failure;
- alpha/empty-image failure;
- high-priority human review issue.

The pipeline should stop on hard failures and write a repair task in `tasks/fix_<stage>.md`.

## Testing Strategy

Tests should cover:

- run creation from a source image;
- schema validation for `scene_graph.json`;
- conversion from scene graph to asset manifest;
- validation failure for missing or non-alpha assets;
- export generation from a mocked valid run;
- no placeholder SVG assets accepted as final object output.

Mock fixtures are allowed for tests, but the demo run must use real PNG outputs.

## Acceptance Criteria

The demo is acceptable only if:

- a source scene image creates a run;
- `scene_graph.json` is produced from visual analysis, not hand-written as the only source;
- `asset_manifest.json` contains grouped asset decisions and structural constraints;
- at least five transparent PNG object assets are generated through local Codex CLI workers;
- batch asset generation uses bounded parallel workers rather than a serial loop;
- at least one animation candidate is detected and written to `animation_manifest.json`;
- preview/contact sheet/export files are created;
- the final report clearly marks which outputs passed automatic checks and which require human art review.

## Recommended Implementation Path

1. Replace the current placeholder pipeline with run-based contracts.
2. Add schemas and tests before adding stage logic.
3. Implement ingest, manifest validation, preview, and export first.
4. Add Codex CLI task execution for analysis and asset generation.
5. Add an image-generation smoke test before the 20-asset batch path.
6. Run one bathroom-scene demo end to end with bounded parallel Codex workers.
