# Art Pipeline V2 Demo Design

## Status

Approved direction from discussion: replace the current placeholder demo with a real art-production pipeline demo.

The existing project is not considered V2 because it only reads a hand-written manifest and exports placeholder SVGs. V2 must first prove that a source scene image can move through analysis, element planning, parallel single-asset production, Codex review, repair, and export.

## Product Goal

Given one cute isometric room scene image, the project creates a production run that can be executed by the main Codex agent using subagents for parallel asset production.

The demo must answer one question: can this pipeline turn a full scene image into a usable layered game asset pack?

## Required Demo Behavior

1. A user provides a source scene image.
2. The project creates a run directory and records the original image.
3. Codex analyzes the image and writes a structured scene graph.
4. The pipeline converts the scene graph into an asset manifest.
5. The main Codex agent dispatches subagents to batch-generate clean single-object PNG assets according to the manifest.
6. Codex reviews generated assets and creates repair jobs for failed or low-quality assets.
7. The pipeline validates, previews, and exports the asset pack.

## Runtime Model

The required validation target is a main-Codex-agent orchestration pipeline.

The user only has a Codex subscription and must not be asked to provide an OpenAI API key. The project therefore must not depend on `OPENAI_API_KEY`, `CODEX_API_KEY`, OpenAI Images API, or any other API-key-backed image backend.

The local project will not pretend it can directly control the Codex desktop app as a hidden API. Instead, the project writes explicit task contracts that the main Codex agent runs in this thread:

- the project creates stage task files;
- the main Codex agent reads the batch task file;
- the main Codex agent spawns subagents for independent asset jobs;
- subagents write results back to the run directory;
- the main Codex agent reviews results and creates repair jobs when needed;
- the project validates outputs and advances the run state.

The project must verify early whether Codex in this environment can actually create PNG image assets. If it cannot, the demo must fail with a clear capability report instead of silently falling back to placeholder SVGs or API keys.

## Non-Goals For The First Real Demo

- No game runtime.
- No WeChat mini-game integration.
- No perfect one-click segmentation guarantee.
- No fake SVG placeholders as final objects.
- No API key requirement.
- No serial one-by-one asset generation for the batch asset stage.
- No animation pipeline in the first validation pass.
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
- type: `background`, `object`, or `effect`;
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

The pipeline splits `asset_manifest.json` into one job file per asset and writes a subagent batch task for the main Codex agent.

Output:

- transparent PNGs in `assets/objects`;
- background/base layers in `assets/background`;
- effect candidates in `assets/effects`;
- one JSON result per generated asset.

The required output is not a crop with messy background. Each object must be regenerated or cleaned into a standalone asset with transparent background and consistent style.

The batch stage must support:

- configurable subagent batch size, initially 4;
- one job result file per asset;
- repair jobs for failed or low-quality assets;
- per-subagent notes and result JSON;
- no API-key requirement.

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

### 6. Codex Review And Repair Stage

Codex reviews generated single-object assets against the source scene, asset manifest, and style guide.

The review stage must check:

- asset matches the requested object;
- transparent background is clean;
- style matches the source scene;
- structural constraints are respected;
- object is not a messy crop;
- object is not clipped;
- grouping granularity follows the manifest.

Codex writes `review_report.json`. Failed assets become repair jobs under `jobs/repairs`.

### 7. Export

The export stage produces:

- `export/level.json`;
- `export/assets/**`;
- `export/contact_sheet.png`;
- `export/composite_preview.png`;
- `export/report.md`;
- optional `.zip`.

`level.json` should be usable by a later game prototype. It must contain layer order, asset paths, anchor points, and transform defaults.

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
- water surface as a normal effect asset, without animation behavior in this first pass.

This is enough to test scene analysis, grouping, structural rules, subagent batch generation, Codex review, repair, validation, and export without trying to solve every object or animation in the scene on day one.

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
        review_report.json
      assets\
        background\
        objects\
        effects\
        repairs\
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
npm run review -- --run <run_id>
npm run repair -- --run <run_id>
npm run export -- --run <run_id>
```

`analyze`, `generate-assets`, `review`, and `repair` create task files for the main Codex agent. Asset generation and repair are executed through subagents spawned by the main Codex agent.

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
      "structureNotes": ["pipe must be continuous", "no recessed shelf"]
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

### review_report.json

```json
{
  "assets": [
    {
      "assetId": "shower_column_with_tray",
      "status": "repair_required",
      "issues": ["pipe is disconnected"],
      "repairTask": "jobs/repairs/shower_column_with_tray.json"
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
- subagent batch task generation;
- review report parsing and repair job generation;
- export generation from a mocked valid run;
- no placeholder SVG assets accepted as final object output.

Mock fixtures are allowed for tests, but the demo run must use real PNG outputs.

## Acceptance Criteria

The demo is acceptable only if:

- a source scene image creates a run;
- `scene_graph.json` is produced from visual analysis, not hand-written as the only source;
- `asset_manifest.json` contains grouped asset decisions and structural constraints;
- at least five transparent PNG object assets are generated through subagents;
- batch asset generation uses parallel subagents rather than a serial loop;
- `review_report.json` is produced and failed assets can be routed to repair jobs;
- preview/contact sheet/export files are created;
- the final report clearly marks which outputs passed automatic checks and which require human art review.

## Recommended Implementation Path

1. Replace the current placeholder pipeline with run-based contracts.
2. Add schemas and tests before adding stage logic.
3. Implement ingest, manifest validation, preview, and export first.
4. Add Codex task files for analysis, subagent asset generation, review, and repair.
5. Add an image-generation smoke test before the batch path.
6. Run one bathroom-scene demo end to end with main-agent orchestration and parallel subagents.
