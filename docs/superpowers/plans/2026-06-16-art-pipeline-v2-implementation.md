# Art Pipeline V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current hand-written-manifest demo with a run-based Codex-runner art production pipeline that ingests one scene image, produces scene and asset contracts, validates generated transparent PNG assets, detects animation candidates, and exports a usable asset pack.

**Architecture:** The project becomes a Node.js CLI pipeline with explicit run directories under `runs/<run_id>`. Deterministic local code owns file layout, JSON validation, stage state, PNG validation, previews, and export; Codex Agent owns vision analysis and image-generation result files through task documents. This keeps the first demo honest while leaving a clean path to swap Codex-runner stages for API backends.

**Tech Stack:** Node.js 20 CommonJS, `node:test`, `pngjs` for PNG decoding/encoding, local filesystem run store, Markdown task files for Codex Agent.

---

## Scope Check

This plan implements the first real V2 demo only. It does not build a web uploader, WeChat mini-game runtime, monetization flow, or fully automated image backend. It does build the contracts and stage commands required to run one bathroom scene through the full asset-production pipeline with Codex Agent filling the vision and image-generation outputs.

## File Structure Map

- Modify: `D:\work\art-pipeline-v2-demo\package.json`  
  Defines stage commands and dependency on `pngjs`.
- Modify: `D:\work\art-pipeline-v2-demo\README.md`  
  Documents the V2 run flow and removes claims that old SVG outputs are a demo.
- Delete: `D:\work\art-pipeline-v2-demo\src\pipeline.js`  
  Old hand-written manifest pipeline.
- Delete: `D:\work\art-pipeline-v2-demo\src\run-demo.js`  
  Old manifest runner.
- Delete: `D:\work\art-pipeline-v2-demo\config\scene_manifest.json`  
  Old primary manifest. The new primary input is a source image.
- Create: `D:\work\art-pipeline-v2-demo\config\pipeline.config.json`  
  Default canvas, style guide path, minimum asset count, and validation settings.
- Create: `D:\work\art-pipeline-v2-demo\config\style_guide.md`  
  Art style and structural rules used by Codex task files.
- Create: `D:\work\art-pipeline-v2-demo\src\core\json.js`  
  JSON read/write helpers.
- Create: `D:\work\art-pipeline-v2-demo\src\core\schemas.js`  
  Runtime validators for `run.json`, `scene_graph.json`, `asset_manifest.json`, and `animation_manifest.json`.
- Create: `D:\work\art-pipeline-v2-demo\src\core\run-store.js`  
  Creates and reads run directories.
- Create: `D:\work\art-pipeline-v2-demo\src\core\codex-tasks.js`  
  Builds stage task Markdown for Codex Agent.
- Create: `D:\work\art-pipeline-v2-demo\src\core\asset-planner.js`  
  Converts scene graph objects into asset manifest entries.
- Create: `D:\work\art-pipeline-v2-demo\src\core\animation-planner.js`  
  Converts scene graph and asset manifest into animation manifest.
- Create: `D:\work\art-pipeline-v2-demo\src\validation\png.js`  
  Decodes PNGs, verifies alpha, visible pixels, and clipped bounding boxes.
- Create: `D:\work\art-pipeline-v2-demo\src\preview\contact-sheet.js`  
  Creates a PNG contact sheet from generated assets.
- Create: `D:\work\art-pipeline-v2-demo\src\preview\composite.js`  
  Creates a simple PNG composite preview using level layer order.
- Create: `D:\work\art-pipeline-v2-demo\src\export\level.js`  
  Builds game-facing `level.json`.
- Create: `D:\work\art-pipeline-v2-demo\src\cli\ingest.js`  
  Ingest command.
- Create: `D:\work\art-pipeline-v2-demo\src\cli\analyze.js`  
  Creates/validates scene analysis task and result.
- Create: `D:\work\art-pipeline-v2-demo\src\cli\plan-assets.js`  
  Creates asset manifest from scene graph.
- Create: `D:\work\art-pipeline-v2-demo\src\cli\generate-assets.js`  
  Creates/validates asset generation task and results.
- Create: `D:\work\art-pipeline-v2-demo\src\cli\animate.js`  
  Creates animation manifest.
- Create: `D:\work\art-pipeline-v2-demo\src\cli\export.js`  
  Exports the asset pack.
- Create: `D:\work\art-pipeline-v2-demo\src\cli\run-demo.js`  
  Runs the deterministic parts of the bathroom demo and reports Codex gates.
- Replace: `D:\work\art-pipeline-v2-demo\test\pipeline.test.js`  
  Old SVG demo tests are removed.
- Create: `D:\work\art-pipeline-v2-demo\test\schemas.test.js`
- Create: `D:\work\art-pipeline-v2-demo\test\ingest.test.js`
- Create: `D:\work\art-pipeline-v2-demo\test\codex-tasks.test.js`
- Create: `D:\work\art-pipeline-v2-demo\test\asset-planner.test.js`
- Create: `D:\work\art-pipeline-v2-demo\test\png-validation.test.js`
- Create: `D:\work\art-pipeline-v2-demo\test\animation-planner.test.js`
- Create: `D:\work\art-pipeline-v2-demo\test\export.test.js`
- Create: `D:\work\art-pipeline-v2-demo\test\helpers\sample-png.js`

---

### Task 1: Package Scripts, Config, And Style Rules

**Files:**
- Modify: `D:\work\art-pipeline-v2-demo\package.json`
- Create: `D:\work\art-pipeline-v2-demo\config\pipeline.config.json`
- Create: `D:\work\art-pipeline-v2-demo\config\style_guide.md`
- Create: `D:\work\art-pipeline-v2-demo\test\config.test.js`

- [ ] **Step 1: Write the failing config test**

Create `D:\work\art-pipeline-v2-demo\test\config.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("pipeline config defines the real V2 run contract", () => {
  const configPath = path.join(root, "config", "pipeline.config.json");
  const styleGuidePath = path.join(root, "config", "style_guide.md");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

  assert.equal(config.schema, "art-pipeline-v2-config@1");
  assert.equal(config.backend.mode, "codex-runner");
  assert.equal(config.validation.minimumObjectPngAssets, 5);
  assert.equal(config.validation.rejectSvgFinalAssets, true);
  assert.ok(fs.existsSync(styleGuidePath));
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npm test -- test/config.test.js
```

Expected: FAIL because `config/pipeline.config.json` does not exist.

- [ ] **Step 3: Replace package scripts**

Edit `D:\work\art-pipeline-v2-demo\package.json` to:

```json
{
  "name": "art-pipeline-v2-demo",
  "version": "0.2.0",
  "private": true,
  "description": "Run-based Codex-runner demo for layered art asset production.",
  "type": "commonjs",
  "scripts": {
    "test": "node --test",
    "ingest": "node src/cli/ingest.js",
    "analyze": "node src/cli/analyze.js",
    "plan-assets": "node src/cli/plan-assets.js",
    "generate-assets": "node src/cli/generate-assets.js",
    "animate": "node src/cli/animate.js",
    "export": "node src/cli/export.js",
    "run:demo": "node src/cli/run-demo.js"
  },
  "dependencies": {
    "pngjs": "^7.0.0"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 4: Add config**

Create `D:\work\art-pipeline-v2-demo\config\pipeline.config.json`:

```json
{
  "schema": "art-pipeline-v2-config@1",
  "backend": {
    "mode": "codex-runner"
  },
  "canvas": {
    "width": 1254,
    "height": 1254
  },
  "styleGuide": "config/style_guide.md",
  "validation": {
    "minimumObjectPngAssets": 5,
    "rejectSvgFinalAssets": true,
    "requireAlpha": true,
    "minimumVisiblePixels": 200
  }
}
```

- [ ] **Step 5: Add style guide**

Create `D:\work\art-pipeline-v2-demo\config\style_guide.md`:

```markdown
# Cat Room Art Style Guide

Use cute hand-drawn isometric mobile-game art. Keep soft outlines, pastel color blocks, clear silhouettes, and no UI chrome.

Structural rules for bathroom scenes:

- Sink vanities must touch the wall they belong to.
- Shower pipes must be continuous and physically connected from mixer to riser to shower head.
- Do not create recessed wall niche shelves unless the source scene or prompt explicitly asks for one.
- Shower products can be grouped as one tray object when bottles are small and not independently interactive.
- Wall cabinets should group tiny shelf contents by shelf level unless an item has gameplay or animation behavior.
- Final object assets must be transparent PNGs, not rough rectangular crops.
```

- [ ] **Step 6: Install dependencies and run the test**

Run:

```bash
npm install
npm test -- test/config.test.js
```

Expected: PASS for `pipeline config defines the real V2 run contract`.

- [ ] **Step 7: Commit**

Run:

```bash
git add package.json package-lock.json config/pipeline.config.json config/style_guide.md test/config.test.js
git commit -m "chore: define V2 pipeline config"
```

---

### Task 2: JSON Validators And Data Contracts

**Files:**
- Create: `D:\work\art-pipeline-v2-demo\src\core\json.js`
- Create: `D:\work\art-pipeline-v2-demo\src\core\schemas.js`
- Create: `D:\work\art-pipeline-v2-demo\test\schemas.test.js`

- [ ] **Step 1: Write failing schema tests**

Create `D:\work\art-pipeline-v2-demo\test\schemas.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validateRun,
  validateSceneGraph,
  validateAssetManifest,
  validateAnimationManifest
} = require("../src/core/schemas");

test("validates run contract", () => {
  assert.doesNotThrow(() => validateRun({
    schema: "art-pipeline-v2-run@1",
    runId: "test_run",
    sourceImage: "source/source.png",
    backend: { mode: "codex-runner" },
    stages: { ingest: "complete" }
  }));
});

test("rejects a scene graph without objects", () => {
  assert.throws(() => validateSceneGraph({
    schema: "art-pipeline-v2-scene-graph@1",
    sceneId: "cat_bathroom",
    style: { camera: "isometric", rendering: "cute" },
    surfaces: [],
    objects: [],
    issues: []
  }), /objects must contain at least one object/);
});

test("validates asset manifest with PNG outputs", () => {
  assert.doesNotThrow(() => validateAssetManifest({
    schema: "art-pipeline-v2-asset-manifest@1",
    sceneId: "cat_bathroom",
    assets: [{
      id: "sink_vanity",
      type: "object",
      sourceObjectIds: ["sink_vanity"],
      output: "assets/objects/sink_vanity.png",
      prompt: "Generate one clean transparent PNG of the wall-attached sink vanity.",
      negativePrompt: "no wall gap",
      layer: 50,
      requiresAlpha: true,
      reviewPriority: "high"
    }]
  }));
});

test("rejects final SVG assets", () => {
  assert.throws(() => validateAssetManifest({
    schema: "art-pipeline-v2-asset-manifest@1",
    sceneId: "cat_bathroom",
    assets: [{
      id: "bad_asset",
      type: "object",
      sourceObjectIds: ["bad_asset"],
      output: "assets/objects/bad_asset.svg",
      prompt: "Generate asset.",
      negativePrompt: "none",
      layer: 1,
      requiresAlpha: true,
      reviewPriority: "low"
    }]
  }), /final assets must be PNG/);
});

test("validates animation manifest", () => {
  assert.doesNotThrow(() => validateAnimationManifest({
    schema: "art-pipeline-v2-animation-manifest@1",
    sceneId: "cat_bathroom",
    animations: [{
      assetId: "water_surface",
      kind: "loop",
      status: "spec_only",
      suggestedMotion: "subtle ripple loop",
      frames: []
    }]
  }));
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- test/schemas.test.js
```

Expected: FAIL because `src/core/schemas.js` does not exist.

- [ ] **Step 3: Add JSON helpers**

Create `D:\work\art-pipeline-v2-demo\src\core\json.js`:

```js
const fs = require("node:fs");
const path = require("node:path");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

module.exports = { readJson, writeJson };
```

- [ ] **Step 4: Add schema validators**

Create `D:\work\art-pipeline-v2-demo\src\core\schemas.js`:

```js
function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function assertArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
}

function assertNonEmptyArray(value, label) {
  assertArray(value, label);
  if (value.length === 0) {
    throw new Error(`${label} must contain at least one object`);
  }
}

function validateRun(run) {
  assertObject(run, "run");
  if (run.schema !== "art-pipeline-v2-run@1") throw new Error("run schema is invalid");
  assertString(run.runId, "run.runId");
  assertString(run.sourceImage, "run.sourceImage");
  assertObject(run.backend, "run.backend");
  assertString(run.backend.mode, "run.backend.mode");
  assertObject(run.stages, "run.stages");
  return run;
}

function validateSceneGraph(graph) {
  assertObject(graph, "sceneGraph");
  if (graph.schema !== "art-pipeline-v2-scene-graph@1") throw new Error("scene graph schema is invalid");
  assertString(graph.sceneId, "sceneGraph.sceneId");
  assertObject(graph.style, "sceneGraph.style");
  assertString(graph.style.camera, "sceneGraph.style.camera");
  assertString(graph.style.rendering, "sceneGraph.style.rendering");
  assertArray(graph.surfaces, "sceneGraph.surfaces");
  assertNonEmptyArray(graph.objects, "sceneGraph.objects");
  for (const object of graph.objects) {
    assertString(object.id, "sceneGraph.objects[].id");
    assertString(object.name, "sceneGraph.objects[].name");
    assertString(object.grouping, "sceneGraph.objects[].grouping");
    assertString(object.layerHint, "sceneGraph.objects[].layerHint");
    assertObject(object.region, "sceneGraph.objects[].region");
    assertArray(object.structureNotes || [], "sceneGraph.objects[].structureNotes");
  }
  assertArray(graph.issues, "sceneGraph.issues");
  return graph;
}

function validateAssetManifest(manifest) {
  assertObject(manifest, "assetManifest");
  if (manifest.schema !== "art-pipeline-v2-asset-manifest@1") throw new Error("asset manifest schema is invalid");
  assertString(manifest.sceneId, "assetManifest.sceneId");
  assertNonEmptyArray(manifest.assets, "assetManifest.assets");
  const ids = new Set();
  for (const asset of manifest.assets) {
    assertString(asset.id, "asset.id");
    if (ids.has(asset.id)) throw new Error(`duplicate asset id: ${asset.id}`);
    ids.add(asset.id);
    if (!["background", "object", "effect", "animation_candidate"].includes(asset.type)) {
      throw new Error(`asset ${asset.id} has invalid type`);
    }
    assertArray(asset.sourceObjectIds, "asset.sourceObjectIds");
    assertString(asset.output, "asset.output");
    if (!asset.output.endsWith(".png")) throw new Error(`final assets must be PNG: ${asset.id}`);
    assertString(asset.prompt, "asset.prompt");
    assertString(asset.negativePrompt, "asset.negativePrompt");
    if (!Number.isInteger(asset.layer)) throw new Error(`asset ${asset.id} layer must be an integer`);
    if (asset.requiresAlpha !== true) throw new Error(`asset ${asset.id} must require alpha`);
    assertString(asset.reviewPriority, "asset.reviewPriority");
  }
  return manifest;
}

function validateAnimationManifest(manifest) {
  assertObject(manifest, "animationManifest");
  if (manifest.schema !== "art-pipeline-v2-animation-manifest@1") throw new Error("animation manifest schema is invalid");
  assertString(manifest.sceneId, "animationManifest.sceneId");
  assertArray(manifest.animations, "animationManifest.animations");
  for (const animation of manifest.animations) {
    assertString(animation.assetId, "animation.assetId");
    assertString(animation.kind, "animation.kind");
    assertString(animation.status, "animation.status");
    assertString(animation.suggestedMotion, "animation.suggestedMotion");
    assertArray(animation.frames, "animation.frames");
  }
  return manifest;
}

module.exports = {
  validateRun,
  validateSceneGraph,
  validateAssetManifest,
  validateAnimationManifest
};
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- test/schemas.test.js
```

Expected: PASS for all schema tests.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/core/json.js src/core/schemas.js test/schemas.test.js
git commit -m "feat: add V2 data contract validators"
```

---

### Task 3: Run Store And Image Ingest

**Files:**
- Create: `D:\work\art-pipeline-v2-demo\src\core\run-store.js`
- Create: `D:\work\art-pipeline-v2-demo\src\cli\ingest.js`
- Create: `D:\work\art-pipeline-v2-demo\test\ingest.test.js`

- [ ] **Step 1: Write failing ingest test**

Create `D:\work\art-pipeline-v2-demo\test\ingest.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRun } = require("../src/core/run-store");

test("createRun copies source image and writes run state", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "art-pipeline-v2-"));
  const source = path.join(tempRoot, "source.png");
  fs.writeFileSync(source, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

  const run = createRun({
    projectRoot: tempRoot,
    source,
    runId: "test_run",
    backendMode: "codex-runner"
  });

  assert.equal(run.runId, "test_run");
  assert.ok(fs.existsSync(path.join(tempRoot, "runs", "test_run", "source", "source.png")));
  assert.ok(fs.existsSync(path.join(tempRoot, "runs", "test_run", "run.json")));
  assert.equal(run.stages.ingest, "complete");
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm test -- test/ingest.test.js
```

Expected: FAIL because `src/core/run-store.js` does not exist.

- [ ] **Step 3: Add run store**

Create `D:\work\art-pipeline-v2-demo\src\core\run-store.js`:

```js
const fs = require("node:fs");
const path = require("node:path");
const { readJson, writeJson } = require("./json");
const { validateRun } = require("./schemas");

function nowId() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
  return `run_${stamp}`;
}

function runDir(projectRoot, runId) {
  return path.join(projectRoot, "runs", runId);
}

function ensureRunDirs(baseDir) {
  for (const dir of [
    "source",
    "tasks",
    "analysis",
    "manifests",
    "assets/background",
    "assets/objects",
    "assets/effects",
    "assets/animations",
    "preview",
    "export"
  ]) {
    fs.mkdirSync(path.join(baseDir, dir), { recursive: true });
  }
}

function createRun({ projectRoot, source, runId = nowId(), backendMode = "codex-runner" }) {
  if (!fs.existsSync(source)) {
    throw new Error(`source image not found: ${source}`);
  }
  const baseDir = runDir(projectRoot, runId);
  ensureRunDirs(baseDir);
  fs.copyFileSync(source, path.join(baseDir, "source", "source.png"));
  const run = {
    schema: "art-pipeline-v2-run@1",
    runId,
    sourceImage: "source/source.png",
    backend: { mode: backendMode },
    stages: {
      ingest: "complete",
      analyze: "pending",
      planAssets: "pending",
      generateAssets: "pending",
      animate: "pending",
      export: "pending"
    }
  };
  writeRun(projectRoot, run);
  return run;
}

function readRun(projectRoot, runId) {
  return validateRun(readJson(path.join(runDir(projectRoot, runId), "run.json")));
}

function writeRun(projectRoot, run) {
  validateRun(run);
  writeJson(path.join(runDir(projectRoot, run.runId), "run.json"), run);
}

function updateStage(projectRoot, runId, stage, status) {
  const run = readRun(projectRoot, runId);
  run.stages[stage] = status;
  writeRun(projectRoot, run);
  return run;
}

module.exports = { createRun, readRun, writeRun, updateStage, runDir };
```

- [ ] **Step 4: Add ingest CLI**

Create `D:\work\art-pipeline-v2-demo\src\cli\ingest.js`:

```js
const path = require("node:path");
const { createRun } = require("../core/run-store");

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

const projectRoot = path.resolve(__dirname, "../..");
const source = argValue("--source");
const runId = argValue("--run-id") || undefined;

if (!source) {
  console.error("Usage: npm run ingest -- --source <image> [--run-id <id>]");
  process.exit(1);
}

const run = createRun({
  projectRoot,
  source: path.resolve(source),
  runId,
  backendMode: "codex-runner"
});

console.log(`Run created: ${run.runId}`);
console.log(`Source copied to: runs/${run.runId}/source/source.png`);
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- test/ingest.test.js
```

Expected: PASS for `createRun copies source image and writes run state`.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/core/run-store.js src/cli/ingest.js test/ingest.test.js
git commit -m "feat: add run store and ingest command"
```

---

### Task 4: Codex Analysis Task Generation

**Files:**
- Create: `D:\work\art-pipeline-v2-demo\src\core\codex-tasks.js`
- Create: `D:\work\art-pipeline-v2-demo\src\cli\analyze.js`
- Create: `D:\work\art-pipeline-v2-demo\test\codex-tasks.test.js`

- [ ] **Step 1: Write failing Codex task test**

Create `D:\work\art-pipeline-v2-demo\test\codex-tasks.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildAnalyzeTask, buildGenerateAssetsTask } = require("../src/core/codex-tasks");

test("analysis task names required scene graph output and structural rules", () => {
  const text = buildAnalyzeTask({
    runId: "test_run",
    sourceImage: "runs/test_run/source/source.png",
    styleGuide: "config/style_guide.md"
  });

  assert.match(text, /analysis\/scene_graph\.json/);
  assert.match(text, /sink vanity must attach to the wall/i);
  assert.match(text, /shower pipe must be continuous/i);
  assert.match(text, /wall niche shelves are forbidden/i);
});

test("asset generation task requires transparent PNG outputs", () => {
  const text = buildGenerateAssetsTask({
    runId: "test_run",
    assetManifestPath: "runs/test_run/manifests/asset_manifest.json"
  });

  assert.match(text, /transparent PNG/i);
  assert.match(text, /assets\/objects/);
  assert.match(text, /do not write SVG/i);
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm test -- test/codex-tasks.test.js
```

Expected: FAIL because `src/core/codex-tasks.js` does not exist.

- [ ] **Step 3: Add Codex task builders**

Create `D:\work\art-pipeline-v2-demo\src\core\codex-tasks.js`:

```js
function buildAnalyzeTask({ runId, sourceImage, styleGuide }) {
  return `# Codex Task: Analyze Scene

Run: ${runId}

Input image: ${sourceImage}
Style guide: ${styleGuide}

Analyze the source image as a cute isometric mobile-game room scene.

Write valid JSON to:

- runs/${runId}/analysis/scene_graph.json

Also write a short human review report to:

- runs/${runId}/analysis/analysis_report.md

Required schema:

- schema: "art-pipeline-v2-scene-graph@1"
- sceneId
- style.camera
- style.rendering
- surfaces
- objects
- issues

For each object include id, name, region, grouping, layerHint, structureNotes, and animationCandidate.

Bathroom structural rules:

- sink vanity must attach to the wall;
- shower pipe must be continuous from mixer to riser to head;
- wall niche shelves are forbidden unless the source explicitly contains one;
- shower products may be grouped as one tray object;
- wall cabinet tiny shelf contents should usually be grouped by shelf level.
`;
}

function buildGenerateAssetsTask({ runId, assetManifestPath }) {
  return `# Codex Task: Generate Single Assets

Run: ${runId}

Read:

- ${assetManifestPath}

For each asset in the manifest, generate the requested final asset file.

Rules:

- generate clean transparent PNG files;
- do not write SVG files;
- do not use rough rectangular crops as final assets;
- preserve the source scene's cute isometric hand-drawn style;
- respect each asset's negativePrompt and structural notes;
- write one result JSON per asset in runs/${runId}/assets/results.

Expected directories:

- runs/${runId}/assets/background
- runs/${runId}/assets/objects
- runs/${runId}/assets/effects
- runs/${runId}/assets/animations
`;
}

module.exports = { buildAnalyzeTask, buildGenerateAssetsTask };
```

- [ ] **Step 4: Add analyze CLI**

Create `D:\work\art-pipeline-v2-demo\src\cli\analyze.js`:

```js
const fs = require("node:fs");
const path = require("node:path");
const { readJson } = require("../core/json");
const { updateStage, runDir } = require("../core/run-store");
const { buildAnalyzeTask } = require("../core/codex-tasks");
const { validateSceneGraph } = require("../core/schemas");

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

const projectRoot = path.resolve(__dirname, "../..");
const runId = argValue("--run");

if (!runId) {
  console.error("Usage: npm run analyze -- --run <run_id>");
  process.exit(1);
}

const baseDir = runDir(projectRoot, runId);
const taskPath = path.join(baseDir, "tasks", "analyze_scene.md");
const sceneGraphPath = path.join(baseDir, "analysis", "scene_graph.json");

fs.writeFileSync(taskPath, buildAnalyzeTask({
  runId,
  sourceImage: `runs/${runId}/source/source.png`,
  styleGuide: "config/style_guide.md"
}), "utf8");

if (!fs.existsSync(sceneGraphPath)) {
  updateStage(projectRoot, runId, "analyze", "waiting_for_codex");
  console.log(`Analysis task written: ${taskPath}`);
  console.log(`Waiting for Codex result: ${sceneGraphPath}`);
  process.exit(0);
}

validateSceneGraph(readJson(sceneGraphPath));
updateStage(projectRoot, runId, "analyze", "complete");
console.log(`Scene graph validated: ${sceneGraphPath}`);
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- test/codex-tasks.test.js
```

Expected: PASS for both task-builder tests.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/core/codex-tasks.js src/cli/analyze.js test/codex-tasks.test.js
git commit -m "feat: add Codex analysis task generation"
```

---

### Task 5: Asset Manifest Planner

**Files:**
- Create: `D:\work\art-pipeline-v2-demo\src\core\asset-planner.js`
- Create: `D:\work\art-pipeline-v2-demo\src\cli\plan-assets.js`
- Create: `D:\work\art-pipeline-v2-demo\test\asset-planner.test.js`

- [ ] **Step 1: Write failing asset planner test**

Create `D:\work\art-pipeline-v2-demo\test\asset-planner.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { planAssets } = require("../src/core/asset-planner");

test("plans grouped assets from scene graph with structural constraints", () => {
  const manifest = planAssets({
    schema: "art-pipeline-v2-scene-graph@1",
    sceneId: "cat_bathroom",
    style: { camera: "isometric", rendering: "cute hand-drawn mobile game art" },
    surfaces: [],
    objects: [
      {
        id: "shower_column",
        name: "Shower column with product tray",
        region: { type: "bbox", x: 530, y: 110, w: 180, h: 340 },
        grouping: "single functional fixture with grouped tray products",
        layerHint: "wall_fixture",
        structureNotes: ["pipe must be continuous", "no recessed shelf"],
        animationCandidate: false
      },
      {
        id: "water_surface",
        name: "Bath tub water surface",
        region: { type: "bbox", x: 420, y: 500, w: 370, h: 180 },
        grouping: "effect layer",
        layerHint: "water",
        structureNotes: [],
        animationCandidate: true
      }
    ],
    issues: []
  });

  assert.equal(manifest.schema, "art-pipeline-v2-asset-manifest@1");
  assert.equal(manifest.assets.length, 2);
  assert.equal(manifest.assets[0].output, "assets/objects/shower_column.png");
  assert.match(manifest.assets[0].negativePrompt, /no recessed shelf/i);
  assert.equal(manifest.assets[1].type, "animation_candidate");
  assert.equal(manifest.assets[1].output, "assets/effects/water_surface.png");
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm test -- test/asset-planner.test.js
```

Expected: FAIL because `src/core/asset-planner.js` does not exist.

- [ ] **Step 3: Add asset planner**

Create `D:\work\art-pipeline-v2-demo\src\core\asset-planner.js`:

```js
const { validateSceneGraph, validateAssetManifest } = require("./schemas");

function sanitizeId(id) {
  return id.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function typeForObject(object) {
  if (object.animationCandidate) return "animation_candidate";
  if (/water|steam|sparkle|effect/i.test(object.layerHint)) return "effect";
  return "object";
}

function outputForAsset(assetType, id) {
  if (assetType === "background") return `assets/background/${id}.png`;
  if (assetType === "effect" || assetType === "animation_candidate") return `assets/effects/${id}.png`;
  return `assets/objects/${id}.png`;
}

function negativePromptForObject(object) {
  const notes = object.structureNotes || [];
  const base = ["no UI", "no text", "no rectangular crop", "transparent background"];
  return [...base, ...notes].join(", ");
}

function promptForObject(graph, object) {
  return [
    `Generate one clean transparent PNG of ${object.name}.`,
    `Use ${graph.style.rendering}.`,
    `Keep the original ${graph.style.camera} camera angle.`,
    `Grouping rule: ${object.grouping}.`
  ].join(" ");
}

function planAssets(sceneGraph) {
  const graph = validateSceneGraph(sceneGraph);
  const assets = graph.objects.map((object, index) => {
    const id = sanitizeId(object.id);
    const type = typeForObject(object);
    return {
      id,
      type,
      sourceObjectIds: [object.id],
      sourceRegion: object.region,
      output: outputForAsset(type, id),
      prompt: promptForObject(graph, object),
      negativePrompt: negativePromptForObject(object),
      layer: 10 + index * 10,
      requiresAlpha: true,
      reviewPriority: object.structureNotes && object.structureNotes.length > 0 ? "high" : "normal"
    };
  });
  return validateAssetManifest({
    schema: "art-pipeline-v2-asset-manifest@1",
    sceneId: graph.sceneId,
    assets
  });
}

module.exports = { planAssets };
```

- [ ] **Step 4: Add plan-assets CLI**

Create `D:\work\art-pipeline-v2-demo\src\cli\plan-assets.js`:

```js
const path = require("node:path");
const { readJson, writeJson } = require("../core/json");
const { planAssets } = require("../core/asset-planner");
const { updateStage, runDir } = require("../core/run-store");

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

const projectRoot = path.resolve(__dirname, "../..");
const runId = argValue("--run");

if (!runId) {
  console.error("Usage: npm run plan-assets -- --run <run_id>");
  process.exit(1);
}

const baseDir = runDir(projectRoot, runId);
const sceneGraphPath = path.join(baseDir, "analysis", "scene_graph.json");
const manifestPath = path.join(baseDir, "manifests", "asset_manifest.json");
const manifest = planAssets(readJson(sceneGraphPath));

writeJson(manifestPath, manifest);
updateStage(projectRoot, runId, "planAssets", "complete");
console.log(`Asset manifest written: ${manifestPath}`);
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- test/asset-planner.test.js
```

Expected: PASS for `plans grouped assets from scene graph with structural constraints`.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/core/asset-planner.js src/cli/plan-assets.js test/asset-planner.test.js
git commit -m "feat: plan assets from scene graph"
```

---

### Task 6: Asset Generation Gate And PNG Validation

**Files:**
- Create: `D:\work\art-pipeline-v2-demo\src\validation\png.js`
- Create: `D:\work\art-pipeline-v2-demo\src\cli\generate-assets.js`
- Create: `D:\work\art-pipeline-v2-demo\test\helpers\sample-png.js`
- Create: `D:\work\art-pipeline-v2-demo\test\png-validation.test.js`

- [ ] **Step 1: Write failing PNG validation test**

Create `D:\work\art-pipeline-v2-demo\test\png-validation.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { writeSamplePng } = require("./helpers/sample-png");
const { validatePngAsset } = require("../src/validation/png");

test("validates transparent PNG with visible pixels", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "png-valid-"));
  const file = path.join(dir, "asset.png");
  writeSamplePng(file, { width: 16, height: 16, visiblePixels: 64 });

  const result = validatePngAsset(file, { minimumVisiblePixels: 10 });
  assert.equal(result.width, 16);
  assert.equal(result.height, 16);
  assert.ok(result.visiblePixels >= 64);
  assert.equal(result.hasAlpha, true);
});

test("rejects SVG final assets", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "png-invalid-"));
  const file = path.join(dir, "asset.svg");
  fs.writeFileSync(file, "<svg></svg>", "utf8");

  assert.throws(() => validatePngAsset(file, { minimumVisiblePixels: 10 }), /must be a PNG/);
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm test -- test/png-validation.test.js
```

Expected: FAIL because helper and validator files do not exist.

- [ ] **Step 3: Add sample PNG helper**

Create `D:\work\art-pipeline-v2-demo\test\helpers\sample-png.js`:

```js
const fs = require("node:fs");
const path = require("node:path");
const { PNG } = require("pngjs");

function writeSamplePng(filePath, { width, height, visiblePixels }) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const png = new PNG({ width, height });
  const side = Math.min(width - 4, height - 4, Math.ceil(Math.sqrt(visiblePixels)));
  const startX = Math.floor((width - side) / 2);
  const startY = Math.floor((height - side) / 2);
  let painted = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (width * y + x) * 4;
      const inside = x >= startX && x < startX + side && y >= startY && y < startY + side;
      png.data[offset] = 255;
      png.data[offset + 1] = 160;
      png.data[offset + 2] = 180;
      png.data[offset + 3] = inside && painted < visiblePixels ? 255 : 0;
      if (inside && painted < visiblePixels) painted++;
    }
  }
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

module.exports = { writeSamplePng };
```

- [ ] **Step 4: Add PNG validator**

Create `D:\work\art-pipeline-v2-demo\src\validation\png.js`:

```js
const fs = require("node:fs");
const { PNG } = require("pngjs");

function validatePngAsset(filePath, { minimumVisiblePixels }) {
  if (!filePath.endsWith(".png")) {
    throw new Error(`asset must be a PNG: ${filePath}`);
  }
  if (!fs.existsSync(filePath)) {
    throw new Error(`asset file missing: ${filePath}`);
  }
  const png = PNG.sync.read(fs.readFileSync(filePath));
  let visiblePixels = 0;
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const alpha = png.data[(png.width * y + x) * 4 + 3];
      if (alpha > 0) {
        visiblePixels++;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (visiblePixels < minimumVisiblePixels) {
    throw new Error(`asset has too few visible pixels: ${visiblePixels}`);
  }
  if (minX === 0 || minY === 0 || maxX === png.width - 1 || maxY === png.height - 1) {
    throw new Error("asset visible pixels touch canvas edge and may be clipped");
  }

  return {
    width: png.width,
    height: png.height,
    hasAlpha: true,
    visiblePixels,
    visibleBounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
  };
}

module.exports = { validatePngAsset };
```

- [ ] **Step 5: Add generate-assets CLI**

Create `D:\work\art-pipeline-v2-demo\src\cli\generate-assets.js`:

```js
const fs = require("node:fs");
const path = require("node:path");
const { readJson, writeJson } = require("../core/json");
const { buildGenerateAssetsTask } = require("../core/codex-tasks");
const { validateAssetManifest } = require("../core/schemas");
const { validatePngAsset } = require("../validation/png");
const { updateStage, runDir } = require("../core/run-store");

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

const projectRoot = path.resolve(__dirname, "../..");
const runId = argValue("--run");

if (!runId) {
  console.error("Usage: npm run generate-assets -- --run <run_id>");
  process.exit(1);
}

const baseDir = runDir(projectRoot, runId);
const manifestPath = path.join(baseDir, "manifests", "asset_manifest.json");
const taskPath = path.join(baseDir, "tasks", "generate_assets.md");
const manifest = validateAssetManifest(readJson(manifestPath));

fs.mkdirSync(path.join(baseDir, "assets", "results"), { recursive: true });
fs.writeFileSync(taskPath, buildGenerateAssetsTask({
  runId,
  assetManifestPath: `runs/${runId}/manifests/asset_manifest.json`
}), "utf8");

const config = readJson(path.join(projectRoot, "config", "pipeline.config.json"));
const results = [];
const missing = [];

for (const asset of manifest.assets) {
  const assetPath = path.join(baseDir, asset.output);
  if (!fs.existsSync(assetPath)) {
    missing.push(asset.output);
    continue;
  }
  const validation = validatePngAsset(assetPath, {
    minimumVisiblePixels: config.validation.minimumVisiblePixels
  });
  const result = { assetId: asset.id, output: asset.output, validation };
  writeJson(path.join(baseDir, "assets", "results", `${asset.id}.json`), result);
  results.push(result);
}

if (missing.length > 0) {
  updateStage(projectRoot, runId, "generateAssets", "waiting_for_codex");
  console.log(`Asset generation task written: ${taskPath}`);
  console.log(`Missing assets: ${missing.join(", ")}`);
  process.exit(0);
}

updateStage(projectRoot, runId, "generateAssets", "complete");
console.log(`Validated PNG assets: ${results.length}`);
```

- [ ] **Step 6: Run tests**

Run:

```bash
npm test -- test/png-validation.test.js
```

Expected: PASS for both PNG validation tests.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/validation/png.js src/cli/generate-assets.js test/helpers/sample-png.js test/png-validation.test.js
git commit -m "feat: validate generated PNG assets"
```

---

### Task 7: Animation Candidate Manifest

**Files:**
- Create: `D:\work\art-pipeline-v2-demo\src\core\animation-planner.js`
- Create: `D:\work\art-pipeline-v2-demo\src\cli\animate.js`
- Create: `D:\work\art-pipeline-v2-demo\test\animation-planner.test.js`

- [ ] **Step 1: Write failing animation planner test**

Create `D:\work\art-pipeline-v2-demo\test\animation-planner.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { planAnimations } = require("../src/core/animation-planner");

test("plans spec-only animation entries from animation candidate assets", () => {
  const animationManifest = planAnimations({
    sceneGraph: {
      schema: "art-pipeline-v2-scene-graph@1",
      sceneId: "cat_bathroom",
      style: { camera: "isometric", rendering: "cute" },
      surfaces: [],
      objects: [{
        id: "water_surface",
        name: "Bath tub water surface",
        region: { type: "bbox", x: 0, y: 0, w: 100, h: 60 },
        grouping: "effect layer",
        layerHint: "water",
        structureNotes: [],
        animationCandidate: true
      }],
      issues: []
    },
    assetManifest: {
      schema: "art-pipeline-v2-asset-manifest@1",
      sceneId: "cat_bathroom",
      assets: [{
        id: "water_surface",
        type: "animation_candidate",
        sourceObjectIds: ["water_surface"],
        output: "assets/effects/water_surface.png",
        prompt: "Generate water surface.",
        negativePrompt: "transparent background",
        layer: 40,
        requiresAlpha: true,
        reviewPriority: "normal"
      }]
    }
  });

  assert.equal(animationManifest.schema, "art-pipeline-v2-animation-manifest@1");
  assert.equal(animationManifest.animations.length, 1);
  assert.equal(animationManifest.animations[0].assetId, "water_surface");
  assert.equal(animationManifest.animations[0].status, "spec_only");
  assert.match(animationManifest.animations[0].suggestedMotion, /ripple/i);
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm test -- test/animation-planner.test.js
```

Expected: FAIL because `src/core/animation-planner.js` does not exist.

- [ ] **Step 3: Add animation planner**

Create `D:\work\art-pipeline-v2-demo\src\core\animation-planner.js`:

```js
const {
  validateSceneGraph,
  validateAssetManifest,
  validateAnimationManifest
} = require("./schemas");

function motionFor(assetId, sourceObject) {
  const text = `${assetId} ${sourceObject.name} ${sourceObject.layerHint}`.toLowerCase();
  if (text.includes("water") || text.includes("shower")) return "subtle ripple or flowing water loop";
  if (text.includes("cat")) return "gentle blink and breathing idle loop";
  if (text.includes("curtain")) return "small cloth sway loop";
  return "subtle idle loop";
}

function planAnimations({ sceneGraph, assetManifest }) {
  const graph = validateSceneGraph(sceneGraph);
  const manifest = validateAssetManifest(assetManifest);
  const objectsById = new Map(graph.objects.map((object) => [object.id, object]));
  const animations = manifest.assets
    .filter((asset) => asset.type === "animation_candidate")
    .map((asset) => {
      const sourceObject = objectsById.get(asset.sourceObjectIds[0]);
      return {
        assetId: asset.id,
        kind: "loop",
        status: "spec_only",
        suggestedMotion: motionFor(asset.id, sourceObject),
        frames: []
      };
    });
  return validateAnimationManifest({
    schema: "art-pipeline-v2-animation-manifest@1",
    sceneId: graph.sceneId,
    animations
  });
}

module.exports = { planAnimations };
```

- [ ] **Step 4: Add animate CLI**

Create `D:\work\art-pipeline-v2-demo\src\cli\animate.js`:

```js
const path = require("node:path");
const { readJson, writeJson } = require("../core/json");
const { planAnimations } = require("../core/animation-planner");
const { updateStage, runDir } = require("../core/run-store");

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

const projectRoot = path.resolve(__dirname, "../..");
const runId = argValue("--run");

if (!runId) {
  console.error("Usage: npm run animate -- --run <run_id>");
  process.exit(1);
}

const baseDir = runDir(projectRoot, runId);
const animationManifest = planAnimations({
  sceneGraph: readJson(path.join(baseDir, "analysis", "scene_graph.json")),
  assetManifest: readJson(path.join(baseDir, "manifests", "asset_manifest.json"))
});

writeJson(path.join(baseDir, "manifests", "animation_manifest.json"), animationManifest);
updateStage(projectRoot, runId, "animate", "complete");
console.log(`Animation manifest written for ${animationManifest.animations.length} candidate(s).`);
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- test/animation-planner.test.js
```

Expected: PASS for `plans spec-only animation entries from animation candidate assets`.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/core/animation-planner.js src/cli/animate.js test/animation-planner.test.js
git commit -m "feat: plan animation candidates"
```

---

### Task 8: Export, Previews, And Demo Runner

**Files:**
- Create: `D:\work\art-pipeline-v2-demo\src\preview\contact-sheet.js`
- Create: `D:\work\art-pipeline-v2-demo\src\preview\composite.js`
- Create: `D:\work\art-pipeline-v2-demo\src\export\level.js`
- Create: `D:\work\art-pipeline-v2-demo\src\cli\export.js`
- Create: `D:\work\art-pipeline-v2-demo\src\cli\run-demo.js`
- Create: `D:\work\art-pipeline-v2-demo\test\export.test.js`
- Modify: `D:\work\art-pipeline-v2-demo\README.md`
- Delete: `D:\work\art-pipeline-v2-demo\src\pipeline.js`
- Delete: `D:\work\art-pipeline-v2-demo\src\run-demo.js`
- Delete: `D:\work\art-pipeline-v2-demo\config\scene_manifest.json`
- Replace: `D:\work\art-pipeline-v2-demo\test\pipeline.test.js`

- [ ] **Step 1: Write failing export test**

Create `D:\work\art-pipeline-v2-demo\test\export.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { writeJson } = require("../src/core/json");
const { writeSamplePng } = require("./helpers/sample-png");
const { exportRun } = require("../src/export/level");

test("exports level, copied assets, report, and PNG previews", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "art-export-"));
  const runId = "test_run";
  const runRoot = path.join(projectRoot, "runs", runId);
  fs.mkdirSync(path.join(runRoot, "assets", "objects"), { recursive: true });
  fs.mkdirSync(path.join(runRoot, "assets", "effects"), { recursive: true });
  fs.mkdirSync(path.join(runRoot, "manifests"), { recursive: true });

  writeSamplePng(path.join(runRoot, "assets", "objects", "sink_vanity.png"), {
    width: 24,
    height: 24,
    visiblePixels: 100
  });
  writeSamplePng(path.join(runRoot, "assets", "effects", "water_surface.png"), {
    width: 24,
    height: 24,
    visiblePixels: 100
  });

  writeJson(path.join(runRoot, "manifests", "asset_manifest.json"), {
    schema: "art-pipeline-v2-asset-manifest@1",
    sceneId: "cat_bathroom",
    assets: [
      {
        id: "sink_vanity",
        type: "object",
        sourceObjectIds: ["sink_vanity"],
        output: "assets/objects/sink_vanity.png",
        prompt: "Generate sink vanity.",
        negativePrompt: "transparent background",
        layer: 20,
        requiresAlpha: true,
        reviewPriority: "high"
      },
      {
        id: "water_surface",
        type: "animation_candidate",
        sourceObjectIds: ["water_surface"],
        output: "assets/effects/water_surface.png",
        prompt: "Generate water surface.",
        negativePrompt: "transparent background",
        layer: 30,
        requiresAlpha: true,
        reviewPriority: "normal"
      }
    ]
  });
  writeJson(path.join(runRoot, "manifests", "animation_manifest.json"), {
    schema: "art-pipeline-v2-animation-manifest@1",
    sceneId: "cat_bathroom",
    animations: [{
      assetId: "water_surface",
      kind: "loop",
      status: "spec_only",
      suggestedMotion: "subtle ripple loop",
      frames: []
    }]
  });

  const result = exportRun({ projectRoot, runId });

  assert.ok(fs.existsSync(path.join(result.exportDir, "level.json")));
  assert.ok(fs.existsSync(path.join(result.exportDir, "assets", "objects", "sink_vanity.png")));
  assert.ok(fs.existsSync(path.join(result.exportDir, "contact_sheet.png")));
  assert.ok(fs.existsSync(path.join(result.exportDir, "composite_preview.png")));
  assert.ok(fs.existsSync(path.join(result.exportDir, "report.md")));
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm test -- test/export.test.js
```

Expected: FAIL because `src/export/level.js` does not exist.

- [ ] **Step 3: Add contact sheet renderer**

Create `D:\work\art-pipeline-v2-demo\src\preview\contact-sheet.js`:

```js
const fs = require("node:fs");
const path = require("node:path");
const { PNG } = require("pngjs");

function paste(target, source, x0, y0) {
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      const src = (source.width * y + x) * 4;
      const dstX = x0 + x;
      const dstY = y0 + y;
      if (dstX >= target.width || dstY >= target.height) continue;
      const dst = (target.width * dstY + dstX) * 4;
      const alpha = source.data[src + 3] / 255;
      target.data[dst] = Math.round(source.data[src] * alpha + target.data[dst] * (1 - alpha));
      target.data[dst + 1] = Math.round(source.data[src + 1] * alpha + target.data[dst + 1] * (1 - alpha));
      target.data[dst + 2] = Math.round(source.data[src + 2] * alpha + target.data[dst + 2] * (1 - alpha));
      target.data[dst + 3] = 255;
    }
  }
}

function makeContactSheet({ runRoot, assets, outputPath }) {
  const cell = 160;
  const columns = 3;
  const rows = Math.max(1, Math.ceil(assets.length / columns));
  const sheet = new PNG({ width: cell * columns, height: cell * rows });
  sheet.data.fill(242);

  assets.forEach((asset, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const png = PNG.sync.read(fs.readFileSync(path.join(runRoot, asset.output)));
    paste(sheet, png, col * cell + 20, row * cell + 20);
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, PNG.sync.write(sheet));
}

module.exports = { makeContactSheet };
```

- [ ] **Step 4: Add composite renderer**

Create `D:\work\art-pipeline-v2-demo\src\preview\composite.js`:

```js
const fs = require("node:fs");
const path = require("node:path");
const { PNG } = require("pngjs");

function paste(target, source, x0, y0) {
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      const src = (source.width * y + x) * 4;
      const dstX = x0 + x;
      const dstY = y0 + y;
      if (dstX >= target.width || dstY >= target.height) continue;
      const dst = (target.width * dstY + dstX) * 4;
      const alpha = source.data[src + 3] / 255;
      target.data[dst] = Math.round(source.data[src] * alpha + target.data[dst] * (1 - alpha));
      target.data[dst + 1] = Math.round(source.data[src + 1] * alpha + target.data[dst + 1] * (1 - alpha));
      target.data[dst + 2] = Math.round(source.data[src + 2] * alpha + target.data[dst + 2] * (1 - alpha));
      target.data[dst + 3] = 255;
    }
  }
}

function makeComposite({ runRoot, assets, outputPath, width = 1254, height = 1254 }) {
  const canvas = new PNG({ width, height });
  for (let i = 0; i < canvas.data.length; i += 4) {
    canvas.data[i] = 245;
    canvas.data[i + 1] = 250;
    canvas.data[i + 2] = 248;
    canvas.data[i + 3] = 255;
  }

  [...assets].sort((a, b) => a.layer - b.layer).forEach((asset, index) => {
    const png = PNG.sync.read(fs.readFileSync(path.join(runRoot, asset.output)));
    paste(canvas, png, 40 + index * 48, 40 + index * 48);
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, PNG.sync.write(canvas));
}

module.exports = { makeComposite };
```

- [ ] **Step 5: Add export builder**

Create `D:\work\art-pipeline-v2-demo\src\export\level.js`:

```js
const fs = require("node:fs");
const path = require("node:path");
const { readJson, writeJson } = require("../core/json");
const { validateAssetManifest, validateAnimationManifest } = require("../core/schemas");
const { runDir } = require("../core/run-store");
const { makeContactSheet } = require("../preview/contact-sheet");
const { makeComposite } = require("../preview/composite");

function copyAsset(runRoot, exportDir, asset) {
  const source = path.join(runRoot, asset.output);
  const target = path.join(exportDir, asset.output);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function exportRun({ projectRoot, runId }) {
  const runRoot = runDir(projectRoot, runId);
  const exportDir = path.join(runRoot, "export");
  const assetManifest = validateAssetManifest(readJson(path.join(runRoot, "manifests", "asset_manifest.json")));
  const animationManifest = validateAnimationManifest(readJson(path.join(runRoot, "manifests", "animation_manifest.json")));

  fs.mkdirSync(exportDir, { recursive: true });
  assetManifest.assets.forEach((asset) => copyAsset(runRoot, exportDir, asset));

  const level = {
    schema: "art-pipeline-v2-level@1",
    sceneId: assetManifest.sceneId,
    assets: assetManifest.assets.map((asset) => ({
      id: asset.id,
      type: asset.type,
      path: asset.output,
      layer: asset.layer,
      anchor: { x: 0.5, y: 0.5 },
      animation: animationManifest.animations.find((animation) => animation.assetId === asset.id) || null
    }))
  };

  writeJson(path.join(exportDir, "level.json"), level);
  writeJson(path.join(exportDir, "animation_manifest.json"), animationManifest);
  makeContactSheet({
    runRoot,
    assets: assetManifest.assets,
    outputPath: path.join(exportDir, "contact_sheet.png")
  });
  makeComposite({
    runRoot,
    assets: assetManifest.assets,
    outputPath: path.join(exportDir, "composite_preview.png")
  });
  fs.writeFileSync(path.join(exportDir, "report.md"), [
    "# Export Report",
    "",
    `Run: ${runId}`,
    `Scene: ${assetManifest.sceneId}`,
    `Assets: ${assetManifest.assets.length}`,
    `Animations: ${animationManifest.animations.length}`,
    "",
    "Automatic checks passed. Human art review is still required for visual correctness.",
    ""
  ].join("\n"), "utf8");

  return { exportDir, level };
}

module.exports = { exportRun };
```

- [ ] **Step 6: Add export CLI**

Create `D:\work\art-pipeline-v2-demo\src\cli\export.js`:

```js
const path = require("node:path");
const { exportRun } = require("../export/level");
const { updateStage } = require("../core/run-store");

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

const projectRoot = path.resolve(__dirname, "../..");
const runId = argValue("--run");

if (!runId) {
  console.error("Usage: npm run export -- --run <run_id>");
  process.exit(1);
}

const result = exportRun({ projectRoot, runId });
updateStage(projectRoot, runId, "export", "complete");
console.log(`Export written: ${result.exportDir}`);
```

- [ ] **Step 7: Add demo runner**

Create `D:\work\art-pipeline-v2-demo\src\cli\run-demo.js`:

```js
const path = require("node:path");
const { createRun } = require("../core/run-store");

const projectRoot = path.resolve(__dirname, "../..");
const source = path.join(projectRoot, "inputs", "source_scene_v5.png");
const run = createRun({
  projectRoot,
  source,
  runId: "cat_bathroom_demo",
  backendMode: "codex-runner"
});

console.log(`Demo run created: ${run.runId}`);
console.log("Next command: npm run analyze -- --run cat_bathroom_demo");
```

- [ ] **Step 8: Replace README**

Edit `D:\work\art-pipeline-v2-demo\README.md`:

```markdown
# Art Pipeline V2 Demo

This project validates a run-based Codex-runner art production pipeline.

It accepts a source scene image, creates a run directory, writes Codex task files, validates Codex-produced JSON and transparent PNG assets, detects animation candidates, and exports a layered asset pack.

## Commands

```bash
npm install
npm test
npm run ingest -- --source inputs/source_scene_v5.png --run-id cat_bathroom_demo
npm run analyze -- --run cat_bathroom_demo
npm run plan-assets -- --run cat_bathroom_demo
npm run generate-assets -- --run cat_bathroom_demo
npm run animate -- --run cat_bathroom_demo
npm run export -- --run cat_bathroom_demo
```

`analyze` and `generate-assets` are Codex-runner gates. They write task files under `runs/<run_id>/tasks` and wait until Codex Agent writes the expected result files.

## Required Outputs

- `runs/<run_id>/analysis/scene_graph.json`
- `runs/<run_id>/manifests/asset_manifest.json`
- `runs/<run_id>/assets/**/*.png`
- `runs/<run_id>/manifests/animation_manifest.json`
- `runs/<run_id>/export/level.json`
- `runs/<run_id>/export/contact_sheet.png`
- `runs/<run_id>/export/composite_preview.png`
- `runs/<run_id>/export/report.md`
```

- [ ] **Step 9: Remove old files and old test**

Delete:

```text
D:\work\art-pipeline-v2-demo\src\pipeline.js
D:\work\art-pipeline-v2-demo\src\run-demo.js
D:\work\art-pipeline-v2-demo\config\scene_manifest.json
D:\work\art-pipeline-v2-demo\test\pipeline.test.js
```

- [ ] **Step 10: Run tests**

Run:

```bash
npm test
```

Expected: PASS for all tests in:

```text
test/config.test.js
test/schemas.test.js
test/ingest.test.js
test/codex-tasks.test.js
test/asset-planner.test.js
test/png-validation.test.js
test/animation-planner.test.js
test/export.test.js
```

- [ ] **Step 11: Run the deterministic demo gate**

Run:

```bash
npm run run:demo
npm run analyze -- --run cat_bathroom_demo
```

Expected:

```text
Demo run created: cat_bathroom_demo
Next command: npm run analyze -- --run cat_bathroom_demo
Analysis task written: D:\work\art-pipeline-v2-demo\runs\cat_bathroom_demo\tasks\analyze_scene.md
Waiting for Codex result: D:\work\art-pipeline-v2-demo\runs\cat_bathroom_demo\analysis\scene_graph.json
```

- [ ] **Step 12: Commit**

Run:

```bash
git add README.md src test config package.json package-lock.json
git add -u
git commit -m "feat: export V2 run-based asset packs"
```

---

## Self-Review Checklist

- Spec coverage: Tasks cover ingest, analysis task, scene graph validation, asset manifest planning, asset generation task, PNG validation, animation manifest, preview, export, and old demo removal.
- Contract clarity: Codex-runner gates are explicit. Local code does not claim hidden control over the Codex desktop app.
- Test path: Every production module has at least one focused `node:test` test.
- Demo path: `npm run run:demo` creates a real run and `npm run analyze` creates the first Codex task file.
- Final asset rule: SVG final assets are rejected by validators and old SVG demo files are removed from the source path.
