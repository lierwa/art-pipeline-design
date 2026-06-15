# Art Pipeline V2 Main-Flow Validation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate the main art-production flow: source scene image -> scene analysis -> asset manifest -> parallel subagent asset generation -> Codex review -> repair jobs -> export.

**Architecture:** Node scripts own deterministic state, schemas, job files, PNG validation, and export. The main Codex agent owns orchestration and spawns subagents for parallel visual asset generation. No OpenAI API key path is allowed, and animation is explicitly out of scope for this validation pass.

**Tech Stack:** Node.js 20 CommonJS, `node:test`, `pngjs`, local filesystem run store, Codex main-agent/subagent workflow.

---

## Scope

This plan validates the production spine. It does not build a web app, WeChat runtime, animation system, API-key integration, or autonomous Codex service.

The project should produce enough structure for Codex to run the workflow repeatably:

```text
inputs/source.png
  -> runs/<run_id>/source/source.png
  -> analysis/scene_graph.json
  -> manifests/asset_manifest.json
  -> jobs/assets/*.json + tasks/assets/*.md
  -> main Codex spawns subagents in parallel
  -> assets/**/*.png + assets/results/*.json
  -> review/review_report.json
  -> jobs/repairs/*.json
  -> export/level.json + report + previews
```

## Task 1: Run Contract And Stage Files

**Purpose:** prove the project can ingest one scene image and create a run folder with explicit contracts.

**Files:**
- Modify: `D:\work\art-pipeline-v2-demo\package.json`
- Create: `D:\work\art-pipeline-v2-demo\config\pipeline.config.json`
- Create: `D:\work\art-pipeline-v2-demo\config\style_guide.md`
- Create: `D:\work\art-pipeline-v2-demo\src\core\json.js`
- Create: `D:\work\art-pipeline-v2-demo\src\core\run-store.js`
- Create: `D:\work\art-pipeline-v2-demo\src\cli\ingest.js`
- Test: `D:\work\art-pipeline-v2-demo\test\run-store.test.js`

- [ ] **Step 1: Write the failing test**

Create `D:\work\art-pipeline-v2-demo\test\run-store.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRun } = require("../src/core/run-store");

test("createRun creates the main-flow folder contract", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "art-v2-"));
  const source = path.join(root, "source.png");
  fs.writeFileSync(source, Buffer.from([1, 2, 3]));

  const run = createRun({ projectRoot: root, runId: "demo", source });

  assert.equal(run.schema, "art-pipeline-v2-run@main-flow");
  assert.equal(run.stages.ingest, "complete");
  for (const dir of ["source", "analysis", "manifests", "tasks/assets", "jobs/assets", "jobs/repairs", "assets/objects", "assets/results", "review", "export"]) {
    assert.ok(fs.existsSync(path.join(root, "runs", "demo", dir)), dir);
  }
});
```

- [ ] **Step 2: Run the test**

Run:

```bash
npm test -- test/run-store.test.js
```

Expected: FAIL because `src/core/run-store.js` does not exist.

- [ ] **Step 3: Implement the minimal run contract**

Create `src/core/json.js`:

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

Create `src/core/run-store.js`:

```js
const fs = require("node:fs");
const path = require("node:path");
const { writeJson } = require("./json");

function runDir(projectRoot, runId) {
  return path.join(projectRoot, "runs", runId);
}

function createRun({ projectRoot, runId, source }) {
  const base = runDir(projectRoot, runId);
  for (const dir of ["source", "analysis", "manifests", "tasks/assets", "tasks/review", "tasks/repairs", "jobs/assets", "jobs/repairs", "assets/objects", "assets/effects", "assets/results", "review", "export"]) {
    fs.mkdirSync(path.join(base, dir), { recursive: true });
  }
  fs.copyFileSync(source, path.join(base, "source", "source.png"));
  const run = {
    schema: "art-pipeline-v2-run@main-flow",
    runId,
    sourceImage: "source/source.png",
    orchestration: "main_codex_agent_with_subagents",
    stages: {
      ingest: "complete",
      analyze: "pending",
      planAssets: "pending",
      generateAssets: "pending",
      review: "pending",
      repair: "pending",
      export: "pending"
    }
  };
  writeJson(path.join(base, "run.json"), run);
  return run;
}

module.exports = { createRun, runDir };
```

Update `package.json` scripts:

```json
{
  "scripts": {
    "test": "node --test",
    "ingest": "node src/cli/ingest.js",
    "plan-assets": "node src/cli/plan-assets.js",
    "create-asset-jobs": "node src/cli/create-asset-jobs.js",
    "validate-assets": "node src/cli/validate-assets.js",
    "export": "node src/cli/export.js"
  },
  "dependencies": {
    "pngjs": "^7.0.0"
  }
}
```

Create `config/pipeline.config.json`:

```json
{
  "schema": "art-pipeline-v2-config@main-flow",
  "orchestration": "main_codex_agent_with_subagents",
  "subagentBatchSize": 4,
  "validation": {
    "minimumObjectPngAssets": 5,
    "minimumVisiblePixels": 200,
    "rejectSvgFinalAssets": true
  }
}
```

Create `config/style_guide.md`:

```markdown
# Style Guide

Use cute hand-drawn isometric mobile-game art. Final assets must be clean transparent PNGs.

Bathroom rules:
- Sink vanity must attach to the wall.
- Shower plumbing must be physically continuous.
- Do not create recessed wall niches unless the source clearly has one.
- Group tiny shelf items by shelf level unless independently interactive.
```

Create `src/cli/ingest.js`:

```js
const path = require("node:path");
const { createRun } = require("../core/run-store");

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

const source = arg("--source");
const runId = arg("--run-id");
if (!source || !runId) throw new Error("Usage: npm run ingest -- --source <image> --run-id <run_id>");

const projectRoot = path.resolve(__dirname, "../..");
const run = createRun({ projectRoot, runId, source: path.resolve(source) });
console.log(`Run created: ${run.runId}`);
```

- [ ] **Step 4: Verify**

Run:

```bash
npm install
npm test -- test/run-store.test.js
```

Expected: PASS.

---

## Task 2: Scene Graph And Asset Manifest

**Purpose:** prove Codex can analyze a source scene and the project can turn that analysis into a reviewed asset list.

**Files:**
- Create: `D:\work\art-pipeline-v2-demo\src\core\tasks.js`
- Create: `D:\work\art-pipeline-v2-demo\src\core\asset-planner.js`
- Create: `D:\work\art-pipeline-v2-demo\src\cli\plan-assets.js`
- Test: `D:\work\art-pipeline-v2-demo\test\asset-planner.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/asset-planner.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { planAssets } = require("../src/core/asset-planner");

test("planAssets preserves grouping and structure constraints", () => {
  const manifest = planAssets({
    sceneId: "bathroom",
    objects: [
      {
        id: "shower_column_with_tray",
        name: "Shower column with grouped product tray",
        grouping: "single fixture group",
        structureNotes: ["pipe must be continuous", "no recessed shelf"],
        region: { type: "bbox", x: 500, y: 100, w: 220, h: 380 }
      },
      {
        id: "sink_vanity",
        name: "Wall attached sink vanity",
        grouping: "single furniture",
        structureNotes: ["must touch wall"],
        region: { type: "bbox", x: 760, y: 610, w: 320, h: 260 }
      }
    ]
  });

  assert.equal(manifest.schema, "art-pipeline-v2-asset-manifest@main-flow");
  assert.equal(manifest.assets.length, 2);
  assert.equal(manifest.assets[0].output, "assets/objects/shower_column_with_tray.png");
  assert.match(manifest.assets[0].negativePrompt, /no recessed shelf/);
});
```

- [ ] **Step 2: Run the test**

Run:

```bash
npm test -- test/asset-planner.test.js
```

Expected: FAIL because `asset-planner.js` does not exist.

- [ ] **Step 3: Add analysis task prompt and planner**

Create `src/core/tasks.js`:

```js
function buildSceneAnalysisTask({ runId }) {
  return `Analyze runs/${runId}/source/source.png.

Write runs/${runId}/analysis/scene_graph.json.

Return objects with id, name, bbox region, grouping, structureNotes.
Respect config/style_guide.md.
Do not over-split tiny decoration items.
Flag bad structures such as disconnected shower plumbing or sink vanities not attached to a wall.
`;
}

function buildAssetTask({ runId, asset }) {
  return `Generate one clean transparent PNG for asset ${asset.id}.

Output: runs/${runId}/${asset.output}
Prompt: ${asset.prompt}
Negative prompt: ${asset.negativePrompt}

Also write runs/${runId}/assets/results/${asset.id}.json with status and notes.
`;
}

module.exports = { buildSceneAnalysisTask, buildAssetTask };
```

Create `src/core/asset-planner.js`:

```js
function safeId(id) {
  return id.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function planAssets(sceneGraph) {
  return {
    schema: "art-pipeline-v2-asset-manifest@main-flow",
    sceneId: sceneGraph.sceneId,
    assets: sceneGraph.objects.map((object, index) => {
      const id = safeId(object.id);
      return {
        id,
        name: object.name,
        output: `assets/objects/${id}.png`,
        sourceRegion: object.region,
        grouping: object.grouping,
        prompt: `Generate one transparent PNG of ${object.name}. Grouping: ${object.grouping}.`,
        negativePrompt: ["no UI", "no text", "no rectangular crop", ...(object.structureNotes || [])].join(", "),
        layer: 10 + index * 10,
        requiresAlpha: true
      };
    })
  };
}

module.exports = { planAssets };
```

Create `src/cli/plan-assets.js`:

```js
const path = require("node:path");
const { readJson, writeJson } = require("../core/json");
const { planAssets } = require("../core/asset-planner");
const { runDir } = require("../core/run-store");

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

const projectRoot = path.resolve(__dirname, "../..");
const runId = arg("--run");
if (!runId) throw new Error("Usage: npm run plan-assets -- --run <run_id>");

const base = runDir(projectRoot, runId);
const manifest = planAssets(readJson(path.join(base, "analysis", "scene_graph.json")));
writeJson(path.join(base, "manifests", "asset_manifest.json"), manifest);
console.log(`Assets planned: ${manifest.assets.length}`);
```

- [ ] **Step 4: Verify**

Run:

```bash
npm test -- test/asset-planner.test.js
```

Expected: PASS.

---

## Task 3: Subagent Batch Generation Protocol

**Purpose:** prove the project can split assets into independent jobs that the main Codex agent can dispatch to subagents in parallel.

**Files:**
- Create: `D:\work\art-pipeline-v2-demo\src\core\asset-jobs.js`
- Create: `D:\work\art-pipeline-v2-demo\src\cli\create-asset-jobs.js`
- Test: `D:\work\art-pipeline-v2-demo\test\asset-jobs.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/asset-jobs.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { writeJson } = require("../src/core/json");
const { createAssetJobs } = require("../src/core/asset-jobs");

test("createAssetJobs writes one job and one subagent task per asset", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "asset-jobs-"));
  const base = path.join(root, "runs", "demo");
  fs.mkdirSync(path.join(base, "manifests"), { recursive: true });
  writeJson(path.join(base, "manifests", "asset_manifest.json"), {
    assets: [
      { id: "cat", output: "assets/objects/cat.png", prompt: "cat", negativePrompt: "none" },
      { id: "sink", output: "assets/objects/sink.png", prompt: "sink", negativePrompt: "none" }
    ]
  });

  const jobs = createAssetJobs({ projectRoot: root, runId: "demo" });

  assert.equal(jobs.length, 2);
  assert.ok(fs.existsSync(path.join(base, "jobs", "assets", "cat.json")));
  assert.ok(fs.existsSync(path.join(base, "tasks", "assets", "cat.md")));
  assert.ok(fs.existsSync(path.join(base, "tasks", "subagent_batch.md")));
});
```

- [ ] **Step 2: Run the test**

Run:

```bash
npm test -- test/asset-jobs.test.js
```

Expected: FAIL because `asset-jobs.js` does not exist.

- [ ] **Step 3: Implement job generation**

Create `src/core/asset-jobs.js`:

```js
const fs = require("node:fs");
const path = require("node:path");
const { readJson, writeJson } = require("./json");
const { runDir } = require("./run-store");
const { buildAssetTask } = require("./tasks");

function createAssetJobs({ projectRoot, runId }) {
  const base = runDir(projectRoot, runId);
  const manifest = readJson(path.join(base, "manifests", "asset_manifest.json"));
  const jobs = manifest.assets.map((asset) => ({
    id: asset.id,
    status: "pending",
    task: `tasks/assets/${asset.id}.md`,
    output: asset.output,
    result: `assets/results/${asset.id}.json`
  }));

  for (const job of jobs) {
    const asset = manifest.assets.find((item) => item.id === job.id);
    fs.mkdirSync(path.join(base, "tasks", "assets"), { recursive: true });
    writeJson(path.join(base, "jobs", "assets", `${job.id}.json`), job);
    fs.writeFileSync(path.join(base, job.task), buildAssetTask({ runId, asset }), "utf8");
  }

  fs.writeFileSync(path.join(base, "tasks", "subagent_batch.md"), [
    `Spawn subagents in parallel for run ${runId}.`,
    "Use one subagent per asset job, up to 4 at a time.",
    "Each subagent must read its task file, generate the PNG, and write the result JSON.",
    "",
    ...jobs.map((job) => `- ${job.id}: runs/${runId}/${job.task}`)
  ].join("\n"), "utf8");

  writeJson(path.join(base, "jobs", "asset_jobs.json"), { jobs });
  return jobs;
}

module.exports = { createAssetJobs };
```

Create `src/cli/create-asset-jobs.js`:

```js
const path = require("node:path");
const { createAssetJobs } = require("../core/asset-jobs");

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

const projectRoot = path.resolve(__dirname, "../..");
const runId = arg("--run");
if (!runId) throw new Error("Usage: npm run create-asset-jobs -- --run <run_id>");
const jobs = createAssetJobs({ projectRoot, runId });
console.log(`Asset jobs created: ${jobs.length}`);
console.log(`Main-agent batch task: runs/${runId}/tasks/subagent_batch.md`);
```

- [ ] **Step 4: Verify**

Run:

```bash
npm test -- test/asset-jobs.test.js
```

Expected: PASS.

---

## Task 4: Codex Review And Repair Jobs

**Purpose:** prove the flow supports review and targeted repair instead of accepting bad generated assets.

**Files:**
- Create: `D:\work\art-pipeline-v2-demo\src\core\review-jobs.js`
- Create: `D:\work\art-pipeline-v2-demo\src\cli\create-repair-jobs.js`
- Test: `D:\work\art-pipeline-v2-demo\test\review-jobs.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/review-jobs.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { writeJson } = require("../src/core/json");
const { createRepairJobs } = require("../src/core/review-jobs");

test("createRepairJobs creates repair task only for failed review items", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repair-jobs-"));
  const base = path.join(root, "runs", "demo");
  fs.mkdirSync(path.join(base, "review"), { recursive: true });
  writeJson(path.join(base, "review", "review_report.json"), {
    assets: [
      { assetId: "cat", status: "pass", issues: [] },
      { assetId: "shower", status: "repair_required", issues: ["pipe disconnected"] }
    ]
  });

  const repairs = createRepairJobs({ projectRoot: root, runId: "demo" });

  assert.equal(repairs.length, 1);
  assert.equal(repairs[0].assetId, "shower");
  assert.ok(fs.existsSync(path.join(base, "jobs", "repairs", "shower.json")));
  assert.ok(fs.existsSync(path.join(base, "tasks", "repairs", "shower.md")));
});
```

- [ ] **Step 2: Run the test**

Run:

```bash
npm test -- test/review-jobs.test.js
```

Expected: FAIL because `review-jobs.js` does not exist.

- [ ] **Step 3: Implement repair job generation**

Create `src/core/review-jobs.js`:

```js
const fs = require("node:fs");
const path = require("node:path");
const { readJson, writeJson } = require("./json");
const { runDir } = require("./run-store");

function createRepairJobs({ projectRoot, runId }) {
  const base = runDir(projectRoot, runId);
  const report = readJson(path.join(base, "review", "review_report.json"));
  const repairs = report.assets
    .filter((item) => item.status === "repair_required")
    .map((item) => ({
      assetId: item.assetId,
      issues: item.issues,
      status: "pending",
      task: `tasks/repairs/${item.assetId}.md`
    }));

  for (const repair of repairs) {
    writeJson(path.join(base, "jobs", "repairs", `${repair.assetId}.json`), repair);
    fs.mkdirSync(path.join(base, "tasks", "repairs"), { recursive: true });
    fs.writeFileSync(path.join(base, repair.task), [
      `Repair asset ${repair.assetId} for run ${runId}.`,
      `Issues: ${repair.issues.join("; ")}`,
      "Regenerate the PNG at the original asset output path.",
      "Write an updated result JSON when done."
    ].join("\n"), "utf8");
  }

  return repairs;
}

module.exports = { createRepairJobs };
```

Create `src/cli/create-repair-jobs.js`:

```js
const path = require("node:path");
const { createRepairJobs } = require("../core/review-jobs");

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

const projectRoot = path.resolve(__dirname, "../..");
const runId = arg("--run");
if (!runId) throw new Error("Usage: node src/cli/create-repair-jobs.js --run <run_id>");
const repairs = createRepairJobs({ projectRoot, runId });
console.log(`Repair jobs created: ${repairs.length}`);
```

- [ ] **Step 4: Verify**

Run:

```bash
npm test -- test/review-jobs.test.js
```

Expected: PASS.

---

## Task 5: PNG Validation And Export

**Purpose:** prove the run can reject fake/missing assets and export a usable pack after subagents finish.

**Files:**
- Create: `D:\work\art-pipeline-v2-demo\src\validation\png.js`
- Create: `D:\work\art-pipeline-v2-demo\src\export\level.js`
- Create: `D:\work\art-pipeline-v2-demo\src\cli\validate-assets.js`
- Create: `D:\work\art-pipeline-v2-demo\src\cli\export.js`
- Create: `D:\work\art-pipeline-v2-demo\test\helpers\sample-png.js`
- Test: `D:\work\art-pipeline-v2-demo\test\export.test.js`

- [ ] **Step 1: Write the failing export test**

Create `test/export.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { writeJson } = require("../src/core/json");
const { writeSamplePng } = require("./helpers/sample-png");
const { exportRun } = require("../src/export/level");

test("exportRun writes level and copies generated PNG assets", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "export-run-"));
  const base = path.join(root, "runs", "demo");
  fs.mkdirSync(path.join(base, "assets", "objects"), { recursive: true });
  fs.mkdirSync(path.join(base, "manifests"), { recursive: true });
  writeSamplePng(path.join(base, "assets", "objects", "cat.png"));
  writeJson(path.join(base, "manifests", "asset_manifest.json"), {
    sceneId: "bathroom",
    assets: [{ id: "cat", output: "assets/objects/cat.png", layer: 10 }]
  });

  const result = exportRun({ projectRoot: root, runId: "demo" });

  assert.ok(fs.existsSync(path.join(result.exportDir, "level.json")));
  assert.ok(fs.existsSync(path.join(result.exportDir, "assets", "objects", "cat.png")));
  assert.ok(fs.existsSync(path.join(result.exportDir, "report.md")));
});
```

- [ ] **Step 2: Run the test**

Run:

```bash
npm test -- test/export.test.js
```

Expected: FAIL because export module and sample PNG helper do not exist.

- [ ] **Step 3: Add PNG helper and export**

Create `test/helpers/sample-png.js`:

```js
const fs = require("node:fs");
const path = require("node:path");
const { PNG } = require("pngjs");

function writeSamplePng(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const png = new PNG({ width: 32, height: 32 });
  for (let y = 8; y < 24; y++) {
    for (let x = 8; x < 24; x++) {
      const offset = (png.width * y + x) * 4;
      png.data[offset] = 255;
      png.data[offset + 1] = 180;
      png.data[offset + 2] = 200;
      png.data[offset + 3] = 255;
    }
  }
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

module.exports = { writeSamplePng };
```

Create `src/validation/png.js`:

```js
const fs = require("node:fs");
const { PNG } = require("pngjs");

function validatePngAsset(filePath) {
  if (!filePath.endsWith(".png")) throw new Error(`not a png: ${filePath}`);
  const png = PNG.sync.read(fs.readFileSync(filePath));
  let visible = 0;
  for (let i = 3; i < png.data.length; i += 4) {
    if (png.data[i] > 0) visible++;
  }
  if (visible < 200) throw new Error(`too few visible pixels: ${filePath}`);
  return { width: png.width, height: png.height, visiblePixels: visible };
}

module.exports = { validatePngAsset };
```

Create `src/export/level.js`:

```js
const fs = require("node:fs");
const path = require("node:path");
const { readJson, writeJson } = require("../core/json");
const { runDir } = require("../core/run-store");
const { validatePngAsset } = require("../validation/png");

function copyFile(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function exportRun({ projectRoot, runId }) {
  const base = runDir(projectRoot, runId);
  const exportDir = path.join(base, "export");
  const manifest = readJson(path.join(base, "manifests", "asset_manifest.json"));
  fs.mkdirSync(exportDir, { recursive: true });

  for (const asset of manifest.assets) {
    const source = path.join(base, asset.output);
    validatePngAsset(source);
    copyFile(source, path.join(exportDir, asset.output));
  }

  const level = {
    schema: "art-pipeline-v2-level@main-flow",
    sceneId: manifest.sceneId,
    assets: manifest.assets.map((asset) => ({
      id: asset.id,
      path: asset.output,
      layer: asset.layer,
      anchor: { x: 0.5, y: 0.5 }
    }))
  };

  writeJson(path.join(exportDir, "level.json"), level);
  fs.writeFileSync(path.join(exportDir, "report.md"), `# Export Report\n\nAssets: ${manifest.assets.length}\n`, "utf8");
  return { exportDir, level };
}

module.exports = { exportRun };
```

Create `src/cli/export.js`:

```js
const path = require("node:path");
const { exportRun } = require("../export/level");

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

const projectRoot = path.resolve(__dirname, "../..");
const runId = arg("--run");
if (!runId) throw new Error("Usage: npm run export -- --run <run_id>");
const result = exportRun({ projectRoot, runId });
console.log(`Export written: ${result.exportDir}`);
```

- [ ] **Step 4: Verify**

Run:

```bash
npm install
npm test
```

Expected: PASS.

---

## Manual Main-Agent/Subagent Execution Gate

After the deterministic project tests pass, the actual visual validation run is:

```bash
npm run ingest -- --source inputs/source_scene_v5.png --run-id cat_bathroom_demo
```

Then the main Codex agent performs:

1. Read `runs/cat_bathroom_demo/source/source.png`.
2. Write `runs/cat_bathroom_demo/analysis/scene_graph.json`.
3. Run `npm run plan-assets -- --run cat_bathroom_demo`.
4. Run `npm run create-asset-jobs -- --run cat_bathroom_demo`.
5. Read `runs/cat_bathroom_demo/tasks/subagent_batch.md`.
6. Spawn up to 4 subagents in parallel for asset jobs.
7. Wait for all subagents and inspect `assets/results/*.json`.
8. Write `review/review_report.json`.
9. Run repair job creation if needed.
10. Re-dispatch repair subagents.
11. Run `npm run export -- --run cat_bathroom_demo`.

## Acceptance

- No animation files or animation manifest are required.
- At least 5 generated transparent PNG assets exist.
- Asset generation is performed by parallel subagents, not a serial main-agent loop.
- Codex review produces `review/review_report.json`.
- Failed assets produce repair jobs under `jobs/repairs`.
- Export contains `level.json`, copied PNG assets, and `report.md`.

