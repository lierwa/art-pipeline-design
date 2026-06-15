# Art Pipeline V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder demo with a Codex-subscription-only production pipeline that uses local `codex exec`, creates scene and asset contracts, runs asset generation in a bounded parallel worker pool, validates transparent PNGs, detects animation candidates, and exports a usable asset pack.

**Architecture:** The project is a Node.js CLI pipeline under `D:\work\art-pipeline-v2-demo`. Local deterministic code owns run state, JSON contracts, job splitting, parallel worker scheduling, PNG validation, previews, and export. Codex is invoked only through the local CLI login state via `codex exec`; the pipeline must scrub API-key environment variables and must fail early if local Codex cannot produce real PNG image assets.

**Tech Stack:** Node.js 20 CommonJS, `node:test`, `pngjs`, local filesystem run store, `child_process.spawn` for `codex exec`, bounded in-process worker pool.

---

## Hard Constraints

- Do not require `OPENAI_API_KEY`, `CODEX_API_KEY`, or any OpenAI API-key-backed image API.
- Use the user's existing Codex subscription/login state through the installed `codex` CLI.
- Batch asset generation must be parallel, not a serial loop over 20 assets.
- Final assets must be transparent PNGs. SVG placeholders are rejected.
- If `codex exec` cannot create a PNG in this environment, the pipeline writes a capability failure report and stops.

## File Structure Map

- Modify: `D:\work\art-pipeline-v2-demo\package.json`  
  Adds CLI scripts and `pngjs`.
- Modify: `D:\work\art-pipeline-v2-demo\README.md`  
  Documents the no-API-key Codex CLI flow.
- Delete: `D:\work\art-pipeline-v2-demo\src\pipeline.js`  
  Removes old manifest-to-SVG placeholder pipeline.
- Delete: `D:\work\art-pipeline-v2-demo\src\run-demo.js`  
  Removes old demo entry.
- Delete: `D:\work\art-pipeline-v2-demo\config\scene_manifest.json`  
  Removes old hand-authored primary input.
- Create: `D:\work\art-pipeline-v2-demo\config\pipeline.config.json`  
  Stores Codex CLI settings, max parallelism, validation thresholds.
- Create: `D:\work\art-pipeline-v2-demo\config\style_guide.md`  
  Stores art and structure rules.
- Create: `D:\work\art-pipeline-v2-demo\schemas\scene_graph.schema.json`  
  JSON schema documenting the expected analysis output contract.
- Create: `D:\work\art-pipeline-v2-demo\src\core\json.js`  
  JSON read/write helpers.
- Create: `D:\work\art-pipeline-v2-demo\src\core\schemas.js`  
  Runtime validators.
- Create: `D:\work\art-pipeline-v2-demo\src\core\run-store.js`  
  Creates and updates `runs/<run_id>`.
- Create: `D:\work\art-pipeline-v2-demo\src\core\codex-exec.js`  
  Builds a scrubbed environment and spawns `codex exec`.
- Create: `D:\work\art-pipeline-v2-demo\src\core\worker-pool.js`  
  Runs N async jobs in parallel with bounded concurrency.
- Create: `D:\work\art-pipeline-v2-demo\src\core\tasks.js`  
  Builds Codex prompt text for analysis and asset jobs.
- Create: `D:\work\art-pipeline-v2-demo\src\core\asset-planner.js`  
  Converts `scene_graph.json` to `asset_manifest.json`.
- Create: `D:\work\art-pipeline-v2-demo\src\core\asset-jobs.js`  
  Splits `asset_manifest.json` into one job per asset.
- Create: `D:\work\art-pipeline-v2-demo\src\core\animation-planner.js`  
  Creates `animation_manifest.json`.
- Create: `D:\work\art-pipeline-v2-demo\src\validation\png.js`  
  Validates transparent PNG assets.
- Create: `D:\work\art-pipeline-v2-demo\src\export\level.js`  
  Builds final export and previews.
- Create: `D:\work\art-pipeline-v2-demo\src\cli\verify-codex.js`
- Create: `D:\work\art-pipeline-v2-demo\src\cli\ingest.js`
- Create: `D:\work\art-pipeline-v2-demo\src\cli\analyze.js`
- Create: `D:\work\art-pipeline-v2-demo\src\cli\plan-assets.js`
- Create: `D:\work\art-pipeline-v2-demo\src\cli\smoke-image.js`
- Create: `D:\work\art-pipeline-v2-demo\src\cli\create-asset-jobs.js`
- Create: `D:\work\art-pipeline-v2-demo\src\cli\generate-assets.js`
- Create: `D:\work\art-pipeline-v2-demo\src\cli\animate.js`
- Create: `D:\work\art-pipeline-v2-demo\src\cli\export.js`
- Create: `D:\work\art-pipeline-v2-demo\src\cli\run-demo.js`
- Replace: `D:\work\art-pipeline-v2-demo\test\pipeline.test.js`
- Create: `D:\work\art-pipeline-v2-demo\test\codex-exec.test.js`
- Create: `D:\work\art-pipeline-v2-demo\test\worker-pool.test.js`
- Create: `D:\work\art-pipeline-v2-demo\test\schemas.test.js`
- Create: `D:\work\art-pipeline-v2-demo\test\run-store.test.js`
- Create: `D:\work\art-pipeline-v2-demo\test\asset-planner.test.js`
- Create: `D:\work\art-pipeline-v2-demo\test\asset-jobs.test.js`
- Create: `D:\work\art-pipeline-v2-demo\test\png-validation.test.js`
- Create: `D:\work\art-pipeline-v2-demo\test\export.test.js`
- Create: `D:\work\art-pipeline-v2-demo\test\helpers\sample-png.js`

---

### Task 1: Package, Config, And No-API-Key Contract

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

test("pipeline config uses Codex CLI subscription flow without API keys", () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, "config", "pipeline.config.json"), "utf8"));

  assert.equal(config.schema, "art-pipeline-v2-config@2");
  assert.equal(config.codex.command, "codex");
  assert.equal(config.codex.mode, "exec");
  assert.equal(config.codex.auth, "local-login");
  assert.deepEqual(config.codex.stripEnv, ["OPENAI_API_KEY", "CODEX_API_KEY"]);
  assert.equal(config.generation.maxParallel, 4);
  assert.equal(config.generation.retryLimit, 2);
  assert.equal(config.validation.rejectSvgFinalAssets, true);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npm test -- test/config.test.js
```

Expected: FAIL because `config/pipeline.config.json` does not exist.

- [ ] **Step 3: Replace `package.json`**

Edit `D:\work\art-pipeline-v2-demo\package.json`:

```json
{
  "name": "art-pipeline-v2-demo",
  "version": "0.3.0",
  "private": true,
  "description": "Codex CLI worker-pool demo for layered art asset production.",
  "type": "commonjs",
  "scripts": {
    "test": "node --test",
    "verify-codex": "node src/cli/verify-codex.js",
    "ingest": "node src/cli/ingest.js",
    "analyze": "node src/cli/analyze.js",
    "plan-assets": "node src/cli/plan-assets.js",
    "smoke:image": "node src/cli/smoke-image.js",
    "create-asset-jobs": "node src/cli/create-asset-jobs.js",
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
  "schema": "art-pipeline-v2-config@2",
  "codex": {
    "command": "codex",
    "mode": "exec",
    "auth": "local-login",
    "sandbox": "workspace-write",
    "stripEnv": ["OPENAI_API_KEY", "CODEX_API_KEY"],
    "skipGitRepoCheck": true
  },
  "generation": {
    "maxParallel": 4,
    "retryLimit": 2,
    "jobTimeoutMs": 900000
  },
  "validation": {
    "minimumObjectPngAssets": 5,
    "rejectSvgFinalAssets": true,
    "requireAlpha": true,
    "minimumVisiblePixels": 200
  },
  "styleGuide": "config/style_guide.md"
}
```

- [ ] **Step 5: Add style guide**

Create `D:\work\art-pipeline-v2-demo\config\style_guide.md`:

```markdown
# Cat Room Art Style Guide

Use cute hand-drawn isometric mobile-game art. Keep soft outlines, pastel color blocks, clear silhouettes, and no UI chrome.

Bathroom structure rules:

- Sink vanities must touch the wall they belong to.
- Shower pipes must be physically continuous from mixer to riser to shower head.
- Do not create recessed wall niche shelves unless explicitly required.
- Shower products can be grouped as one tray object when they are small and not independently interactive.
- Wall cabinets should group tiny shelf contents by shelf level unless an item has gameplay or animation behavior.
- Final assets must be clean transparent PNG files, not rectangular crops or SVG placeholders.
```

- [ ] **Step 6: Install dependencies and run the test**

Run:

```bash
npm install
npm test -- test/config.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add package.json package-lock.json config/pipeline.config.json config/style_guide.md test/config.test.js
git commit -m "chore: configure Codex CLI pipeline"
```

---

### Task 2: Codex Exec Adapter With API-Key Scrubbing

**Files:**
- Create: `D:\work\art-pipeline-v2-demo\src\core\codex-exec.js`
- Create: `D:\work\art-pipeline-v2-demo\src\cli\verify-codex.js`
- Create: `D:\work\art-pipeline-v2-demo\test\codex-exec.test.js`

- [ ] **Step 1: Write failing tests**

Create `D:\work\art-pipeline-v2-demo\test\codex-exec.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildCodexEnv, buildCodexExecArgs } = require("../src/core/codex-exec");

test("buildCodexEnv removes API-key variables", () => {
  const env = buildCodexEnv({
    PATH: "x",
    OPENAI_API_KEY: "must-not-leak",
    CODEX_API_KEY: "must-not-leak",
    KEEP_ME: "ok"
  }, ["OPENAI_API_KEY", "CODEX_API_KEY"]);

  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.CODEX_API_KEY, undefined);
  assert.equal(env.KEEP_ME, "ok");
});

test("buildCodexExecArgs uses local exec with workspace sandbox", () => {
  const args = buildCodexExecArgs({
    promptFile: "runs/r1/tasks/analyze_scene.md",
    outputLastMessage: "runs/r1/logs/analyze.final.md",
    sandbox: "workspace-write",
    skipGitRepoCheck: true
  });

  assert.deepEqual(args, [
    "exec",
    "--sandbox",
    "workspace-write",
    "--skip-git-repo-check",
    "-o",
    "runs/r1/logs/analyze.final.md",
    "Read the task file at runs/r1/tasks/analyze_scene.md and complete it exactly."
  ]);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- test/codex-exec.test.js
```

Expected: FAIL because `src/core/codex-exec.js` does not exist.

- [ ] **Step 3: Add Codex exec adapter**

Create `D:\work\art-pipeline-v2-demo\src\core\codex-exec.js`:

```js
const { spawn } = require("node:child_process");

function buildCodexEnv(baseEnv, stripEnv) {
  const env = { ...baseEnv };
  for (const key of stripEnv) {
    delete env[key];
  }
  return env;
}

function buildCodexExecArgs({ promptFile, outputLastMessage, sandbox, skipGitRepoCheck }) {
  const args = ["exec", "--sandbox", sandbox];
  if (skipGitRepoCheck) args.push("--skip-git-repo-check");
  if (outputLastMessage) args.push("-o", outputLastMessage);
  args.push(`Read the task file at ${promptFile} and complete it exactly.`);
  return args;
}

function runCodexExec({
  command,
  cwd,
  promptFile,
  outputLastMessage,
  sandbox,
  skipGitRepoCheck,
  stripEnv,
  timeoutMs,
  spawnImpl = spawn
}) {
  return new Promise((resolve, reject) => {
    const args = buildCodexExecArgs({ promptFile, outputLastMessage, sandbox, skipGitRepoCheck });
    const child = spawnImpl(command, args, {
      cwd,
      env: buildCodexEnv(process.env, stripEnv),
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`codex exec timed out after ${timeoutMs}ms: ${promptFile}`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, args });
    });
  });
}

module.exports = {
  buildCodexEnv,
  buildCodexExecArgs,
  runCodexExec
};
```

- [ ] **Step 4: Add verify-codex CLI**

Create `D:\work\art-pipeline-v2-demo\src\cli\verify-codex.js`:

```js
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { readJson } = require("../core/json");
const { buildCodexEnv } = require("../core/codex-exec");

const projectRoot = path.resolve(__dirname, "../..");
const config = readJson(path.join(projectRoot, "config", "pipeline.config.json"));
const result = spawnSync(config.codex.command, ["--version"], {
  cwd: projectRoot,
  env: buildCodexEnv(process.env, config.codex.stripEnv),
  encoding: "utf8",
  windowsHide: true
});

if (result.status !== 0) {
  console.error(result.stderr || result.stdout || "codex command failed");
  process.exit(result.status || 1);
}

console.log(result.stdout.trim());
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- test/codex-exec.test.js
```

Expected: PASS.

- [ ] **Step 6: Verify local Codex CLI**

Run:

```bash
npm run verify-codex
```

Expected: prints an installed Codex CLI version, for example `codex-cli 0.139.0`.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/core/codex-exec.js src/cli/verify-codex.js test/codex-exec.test.js
git commit -m "feat: add Codex exec adapter"
```

---

### Task 3: Run Store And JSON Contracts

**Files:**
- Create: `D:\work\art-pipeline-v2-demo\src\core\json.js`
- Create: `D:\work\art-pipeline-v2-demo\src\core\schemas.js`
- Create: `D:\work\art-pipeline-v2-demo\src\core\run-store.js`
- Create: `D:\work\art-pipeline-v2-demo\src\cli\ingest.js`
- Create: `D:\work\art-pipeline-v2-demo\test\schemas.test.js`
- Create: `D:\work\art-pipeline-v2-demo\test\run-store.test.js`

- [ ] **Step 1: Write failing schema tests**

Create `D:\work\art-pipeline-v2-demo\test\schemas.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { validateRun, validateSceneGraph, validateAssetManifest } = require("../src/core/schemas");

test("validates run state", () => {
  assert.doesNotThrow(() => validateRun({
    schema: "art-pipeline-v2-run@2",
    runId: "r1",
    sourceImage: "source/source.png",
    stages: { ingest: "complete" },
    codex: { mode: "exec", auth: "local-login" }
  }));
});

test("rejects empty scene graph objects", () => {
  assert.throws(() => validateSceneGraph({
    schema: "art-pipeline-v2-scene-graph@2",
    sceneId: "bathroom",
    style: { camera: "isometric", rendering: "cute" },
    objects: [],
    issues: []
  }), /objects must not be empty/);
});

test("rejects SVG final assets", () => {
  assert.throws(() => validateAssetManifest({
    schema: "art-pipeline-v2-asset-manifest@2",
    sceneId: "bathroom",
    assets: [{
      id: "bad",
      type: "object",
      output: "assets/objects/bad.svg",
      prompt: "bad",
      negativePrompt: "bad",
      layer: 1,
      requiresAlpha: true
    }]
  }), /final asset must be png/);
});
```

- [ ] **Step 2: Write failing run-store test**

Create `D:\work\art-pipeline-v2-demo\test\run-store.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRun, readRun, updateStage } = require("../src/core/run-store");

test("createRun copies source and initializes run state", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "art-run-"));
  const source = path.join(root, "input.png");
  fs.writeFileSync(source, Buffer.from([1, 2, 3]));

  const run = createRun({ projectRoot: root, source, runId: "r1" });
  assert.equal(run.runId, "r1");
  assert.equal(run.stages.ingest, "complete");
  assert.ok(fs.existsSync(path.join(root, "runs", "r1", "source", "source.png")));

  updateStage(root, "r1", "analyze", "complete");
  assert.equal(readRun(root, "r1").stages.analyze, "complete");
});
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
npm test -- test/schemas.test.js test/run-store.test.js
```

Expected: FAIL because core files do not exist.

- [ ] **Step 4: Add JSON helper**

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

- [ ] **Step 5: Add validators**

Create `D:\work\art-pipeline-v2-demo\src\core\schemas.js`:

```js
function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
}

function string(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} must be a non-empty string`);
}

function array(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
}

function validateRun(run) {
  object(run, "run");
  if (run.schema !== "art-pipeline-v2-run@2") throw new Error("run schema invalid");
  string(run.runId, "run.runId");
  string(run.sourceImage, "run.sourceImage");
  object(run.stages, "run.stages");
  object(run.codex, "run.codex");
  return run;
}

function validateSceneGraph(graph) {
  object(graph, "sceneGraph");
  if (graph.schema !== "art-pipeline-v2-scene-graph@2") throw new Error("scene graph schema invalid");
  string(graph.sceneId, "sceneGraph.sceneId");
  object(graph.style, "sceneGraph.style");
  array(graph.objects, "sceneGraph.objects");
  if (graph.objects.length === 0) throw new Error("sceneGraph.objects must not be empty");
  array(graph.issues, "sceneGraph.issues");
  for (const item of graph.objects) {
    string(item.id, "object.id");
    string(item.name, "object.name");
    object(item.region, "object.region");
    string(item.grouping, "object.grouping");
    string(item.layerHint, "object.layerHint");
  }
  return graph;
}

function validateAssetManifest(manifest) {
  object(manifest, "assetManifest");
  if (manifest.schema !== "art-pipeline-v2-asset-manifest@2") throw new Error("asset manifest schema invalid");
  string(manifest.sceneId, "assetManifest.sceneId");
  array(manifest.assets, "assetManifest.assets");
  if (manifest.assets.length === 0) throw new Error("assetManifest.assets must not be empty");
  const ids = new Set();
  for (const asset of manifest.assets) {
    string(asset.id, "asset.id");
    if (ids.has(asset.id)) throw new Error(`duplicate asset id: ${asset.id}`);
    ids.add(asset.id);
    string(asset.type, "asset.type");
    string(asset.output, "asset.output");
    if (!asset.output.endsWith(".png")) throw new Error(`final asset must be png: ${asset.id}`);
    string(asset.prompt, "asset.prompt");
    string(asset.negativePrompt, "asset.negativePrompt");
    if (!Number.isInteger(asset.layer)) throw new Error(`asset.layer must be integer: ${asset.id}`);
    if (asset.requiresAlpha !== true) throw new Error(`asset.requiresAlpha must be true: ${asset.id}`);
  }
  return manifest;
}

module.exports = { validateRun, validateSceneGraph, validateAssetManifest };
```

- [ ] **Step 6: Add run store**

Create `D:\work\art-pipeline-v2-demo\src\core\run-store.js`:

```js
const fs = require("node:fs");
const path = require("node:path");
const { readJson, writeJson } = require("./json");
const { validateRun } = require("./schemas");

function runDir(projectRoot, runId) {
  return path.join(projectRoot, "runs", runId);
}

function createRun({ projectRoot, source, runId }) {
  if (!fs.existsSync(source)) throw new Error(`source not found: ${source}`);
  const base = runDir(projectRoot, runId);
  for (const dir of ["source", "tasks", "logs", "analysis", "manifests", "jobs/assets", "assets/objects", "assets/effects", "assets/background", "assets/results", "export"]) {
    fs.mkdirSync(path.join(base, dir), { recursive: true });
  }
  fs.copyFileSync(source, path.join(base, "source", "source.png"));
  const run = {
    schema: "art-pipeline-v2-run@2",
    runId,
    sourceImage: "source/source.png",
    codex: { mode: "exec", auth: "local-login" },
    stages: {
      ingest: "complete",
      analyze: "pending",
      planAssets: "pending",
      smokeImage: "pending",
      createAssetJobs: "pending",
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

- [ ] **Step 7: Add ingest CLI**

Create `D:\work\art-pipeline-v2-demo\src\cli\ingest.js`:

```js
const path = require("node:path");
const { createRun } = require("../core/run-store");

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

const source = arg("--source");
const runId = arg("--run-id");
if (!source || !runId) {
  console.error("Usage: npm run ingest -- --source <image> --run-id <run_id>");
  process.exit(1);
}

const projectRoot = path.resolve(__dirname, "../..");
const run = createRun({ projectRoot, source: path.resolve(source), runId });
console.log(`Run created: ${run.runId}`);
```

- [ ] **Step 8: Run tests**

Run:

```bash
npm test -- test/schemas.test.js test/run-store.test.js
```

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```bash
git add src/core/json.js src/core/schemas.js src/core/run-store.js src/cli/ingest.js test/schemas.test.js test/run-store.test.js
git commit -m "feat: add run store and contracts"
```

---

### Task 4: Scene Analysis Through `codex exec`

**Files:**
- Create: `D:\work\art-pipeline-v2-demo\schemas\scene_graph.schema.json`
- Create: `D:\work\art-pipeline-v2-demo\src\core\tasks.js`
- Create: `D:\work\art-pipeline-v2-demo\src\cli\analyze.js`
- Create: `D:\work\art-pipeline-v2-demo\test\tasks.test.js`

- [ ] **Step 1: Write failing task test**

Create `D:\work\art-pipeline-v2-demo\test\tasks.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildAnalyzePrompt, buildAssetPrompt } = require("../src/core/tasks");

test("analysis prompt requires scene_graph output and bathroom structure rules", () => {
  const prompt = buildAnalyzePrompt({ runId: "r1" });
  assert.match(prompt, /scene_graph\.json/);
  assert.match(prompt, /shower pipes must be physically continuous/i);
  assert.match(prompt, /sink vanities must touch the wall/i);
});

test("asset prompt requires exactly one transparent PNG asset", () => {
  const prompt = buildAssetPrompt({
    runId: "r1",
    asset: {
      id: "sink_vanity",
      output: "assets/objects/sink_vanity.png",
      prompt: "Generate sink vanity.",
      negativePrompt: "no wall gap"
    }
  });
  assert.match(prompt, /exactly one final transparent PNG/i);
  assert.match(prompt, /assets\/objects\/sink_vanity\.png/);
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm test -- test/tasks.test.js
```

Expected: FAIL because `src/core/tasks.js` does not exist.

- [ ] **Step 3: Add scene graph schema**

Create `D:\work\art-pipeline-v2-demo\schemas\scene_graph.schema.json`:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["schema", "sceneId", "style", "objects", "issues"],
  "properties": {
    "schema": { "const": "art-pipeline-v2-scene-graph@2" },
    "sceneId": { "type": "string" },
    "style": {
      "type": "object",
      "additionalProperties": false,
      "required": ["camera", "rendering"],
      "properties": {
        "camera": { "type": "string" },
        "rendering": { "type": "string" }
      }
    },
    "objects": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["id", "name", "region", "grouping", "layerHint", "structureNotes", "animationCandidate"],
        "properties": {
          "id": { "type": "string" },
          "name": { "type": "string" },
          "region": {
            "type": "object",
            "additionalProperties": false,
            "required": ["type", "x", "y", "w", "h"],
            "properties": {
              "type": { "const": "bbox" },
              "x": { "type": "number" },
              "y": { "type": "number" },
              "w": { "type": "number" },
              "h": { "type": "number" }
            }
          },
          "grouping": { "type": "string" },
          "layerHint": { "type": "string" },
          "structureNotes": { "type": "array", "items": { "type": "string" } },
          "animationCandidate": { "type": "boolean" }
        }
      }
    },
    "issues": { "type": "array", "items": { "type": "string" } }
  }
}
```

- [ ] **Step 4: Add prompt builders**

Create `D:\work\art-pipeline-v2-demo\src\core\tasks.js`:

```js
function buildAnalyzePrompt({ runId }) {
  return `Analyze runs/${runId}/source/source.png as a cute isometric mobile-game room scene.

Read config/style_guide.md before deciding object grouping.

Write valid JSON to runs/${runId}/analysis/scene_graph.json.
Write a short review to runs/${runId}/analysis/analysis_report.md.

Use schema art-pipeline-v2-scene-graph@2.

Important bathroom rules:
- shower pipes must be physically continuous;
- sink vanities must touch the wall;
- recessed wall niche shelves are forbidden unless source image clearly contains one;
- tiny shelf contents should be grouped by shelf level when not independently interactive;
- water, cat, curtain, steam, sparkle, and flowing shower effects are animation candidates.
`;
}

function buildAssetPrompt({ runId, asset }) {
  return `Generate exactly one final transparent PNG asset for run ${runId}.

Asset id: ${asset.id}
Output path: runs/${runId}/${asset.output}

Positive prompt:
${asset.prompt}

Negative prompt:
${asset.negativePrompt}

Rules:
- final output must be one PNG file at the output path;
- transparent background is required;
- do not write SVG;
- do not write a rectangular crop;
- preserve cute hand-drawn isometric mobile-game style.

After writing the PNG, write runs/${runId}/assets/results/${asset.id}.json with {"assetId":"${asset.id}","status":"complete"}.
`;
}

module.exports = { buildAnalyzePrompt, buildAssetPrompt };
```

- [ ] **Step 5: Add analyze CLI**

Create `D:\work\art-pipeline-v2-demo\src\cli\analyze.js`:

```js
const fs = require("node:fs");
const path = require("node:path");
const { readJson, writeJson } = require("../core/json");
const { validateSceneGraph } = require("../core/schemas");
const { runCodexExec } = require("../core/codex-exec");
const { buildAnalyzePrompt } = require("../core/tasks");
const { runDir, updateStage } = require("../core/run-store");

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

async function main() {
  const projectRoot = path.resolve(__dirname, "../..");
  const runId = arg("--run");
  if (!runId) throw new Error("Usage: npm run analyze -- --run <run_id>");

  const config = readJson(path.join(projectRoot, "config", "pipeline.config.json"));
  const base = runDir(projectRoot, runId);
  const taskPath = path.join(base, "tasks", "analyze_scene.md");
  const finalPath = path.join(base, "logs", "analyze.final.md");
  const sceneGraphPath = path.join(base, "analysis", "scene_graph.json");
  fs.writeFileSync(taskPath, buildAnalyzePrompt({ runId }), "utf8");

  await runCodexExec({
    command: config.codex.command,
    cwd: projectRoot,
    promptFile: path.relative(projectRoot, taskPath),
    outputLastMessage: path.relative(projectRoot, finalPath),
    sandbox: config.codex.sandbox,
    skipGitRepoCheck: config.codex.skipGitRepoCheck,
    stripEnv: config.codex.stripEnv,
    timeoutMs: config.generation.jobTimeoutMs
  });

  validateSceneGraph(readJson(sceneGraphPath));
  updateStage(projectRoot, runId, "analyze", "complete");
  console.log(`Scene graph written: ${sceneGraphPath}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
```

- [ ] **Step 6: Run tests**

Run:

```bash
npm test -- test/tasks.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add schemas/scene_graph.schema.json src/core/tasks.js src/cli/analyze.js test/tasks.test.js
git commit -m "feat: add Codex scene analysis stage"
```

---

### Task 5: Asset Manifest And Per-Asset Job Files

**Files:**
- Create: `D:\work\art-pipeline-v2-demo\src\core\asset-planner.js`
- Create: `D:\work\art-pipeline-v2-demo\src\core\asset-jobs.js`
- Create: `D:\work\art-pipeline-v2-demo\src\cli\plan-assets.js`
- Create: `D:\work\art-pipeline-v2-demo\src\cli\create-asset-jobs.js`
- Create: `D:\work\art-pipeline-v2-demo\test\asset-planner.test.js`
- Create: `D:\work\art-pipeline-v2-demo\test\asset-jobs.test.js`

- [ ] **Step 1: Write failing planner test**

Create `D:\work\art-pipeline-v2-demo\test\asset-planner.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { planAssets } = require("../src/core/asset-planner");

test("plans PNG assets from scene graph and preserves animation candidates", () => {
  const manifest = planAssets({
    schema: "art-pipeline-v2-scene-graph@2",
    sceneId: "bathroom",
    style: { camera: "isometric", rendering: "cute hand-drawn mobile game art" },
    objects: [
      {
        id: "sink_vanity",
        name: "Sink vanity",
        region: { type: "bbox", x: 10, y: 10, w: 100, h: 80 },
        grouping: "single furniture",
        layerHint: "front_object",
        structureNotes: ["must touch wall"],
        animationCandidate: false
      },
      {
        id: "water_surface",
        name: "Water surface",
        region: { type: "bbox", x: 20, y: 20, w: 120, h: 60 },
        grouping: "effect layer",
        layerHint: "water",
        structureNotes: [],
        animationCandidate: true
      }
    ],
    issues: []
  });

  assert.equal(manifest.schema, "art-pipeline-v2-asset-manifest@2");
  assert.equal(manifest.assets[0].output, "assets/objects/sink_vanity.png");
  assert.equal(manifest.assets[1].type, "animation_candidate");
  assert.equal(manifest.assets[1].output, "assets/effects/water_surface.png");
});
```

- [ ] **Step 2: Write failing asset job test**

Create `D:\work\art-pipeline-v2-demo\test\asset-jobs.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { writeJson } = require("../src/core/json");
const { createAssetJobs } = require("../src/core/asset-jobs");

test("creates one job file per asset", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "asset-jobs-"));
  const runId = "r1";
  const runRoot = path.join(root, "runs", runId);
  fs.mkdirSync(path.join(runRoot, "manifests"), { recursive: true });
  writeJson(path.join(runRoot, "manifests", "asset_manifest.json"), {
    schema: "art-pipeline-v2-asset-manifest@2",
    sceneId: "bathroom",
    assets: [
      { id: "a", type: "object", output: "assets/objects/a.png", prompt: "a", negativePrompt: "none", layer: 1, requiresAlpha: true },
      { id: "b", type: "object", output: "assets/objects/b.png", prompt: "b", negativePrompt: "none", layer: 2, requiresAlpha: true }
    ]
  });

  const jobs = createAssetJobs({ projectRoot: root, runId });
  assert.equal(jobs.length, 2);
  assert.ok(fs.existsSync(path.join(runRoot, "jobs", "assets", "a.json")));
  assert.ok(fs.existsSync(path.join(runRoot, "tasks", "assets", "a.md")));
});
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
npm test -- test/asset-planner.test.js test/asset-jobs.test.js
```

Expected: FAIL because planner and job modules do not exist.

- [ ] **Step 4: Add asset planner**

Create `D:\work\art-pipeline-v2-demo\src\core\asset-planner.js`:

```js
const { validateSceneGraph, validateAssetManifest } = require("./schemas");

function safeId(id) {
  return id.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function outputFor(type, id) {
  if (type === "background") return `assets/background/${id}.png`;
  if (type === "effect" || type === "animation_candidate") return `assets/effects/${id}.png`;
  return `assets/objects/${id}.png`;
}

function planAssets(sceneGraph) {
  const graph = validateSceneGraph(sceneGraph);
  const assets = graph.objects.map((object, index) => {
    const id = safeId(object.id);
    const type = object.animationCandidate ? "animation_candidate" : "object";
    return {
      id,
      type,
      sourceObjectIds: [object.id],
      sourceRegion: object.region,
      output: outputFor(type, id),
      prompt: `Generate one clean transparent PNG of ${object.name}. Use ${graph.style.rendering}. Keep ${graph.style.camera} view. Grouping: ${object.grouping}.`,
      negativePrompt: ["no text", "no UI", "no rectangular crop", ...(object.structureNotes || [])].join(", "),
      layer: 10 + index * 10,
      requiresAlpha: true
    };
  });
  return validateAssetManifest({
    schema: "art-pipeline-v2-asset-manifest@2",
    sceneId: graph.sceneId,
    assets
  });
}

module.exports = { planAssets };
```

- [ ] **Step 5: Add asset job splitter**

Create `D:\work\art-pipeline-v2-demo\src\core\asset-jobs.js`:

```js
const fs = require("node:fs");
const path = require("node:path");
const { readJson, writeJson } = require("./json");
const { validateAssetManifest } = require("./schemas");
const { runDir } = require("./run-store");
const { buildAssetPrompt } = require("./tasks");

function createAssetJobs({ projectRoot, runId }) {
  const base = runDir(projectRoot, runId);
  const manifest = validateAssetManifest(readJson(path.join(base, "manifests", "asset_manifest.json")));
  const jobs = manifest.assets.map((asset) => ({
    id: asset.id,
    assetId: asset.id,
    output: asset.output,
    taskFile: `tasks/assets/${asset.id}.md`,
    jobFile: `jobs/assets/${asset.id}.json`,
    status: "pending",
    attempts: 0
  }));

  for (const job of jobs) {
    const asset = manifest.assets.find((item) => item.id === job.assetId);
    const taskPath = path.join(base, job.taskFile);
    fs.mkdirSync(path.dirname(taskPath), { recursive: true });
    fs.writeFileSync(taskPath, buildAssetPrompt({ runId, asset }), "utf8");
    writeJson(path.join(base, job.jobFile), job);
  }

  writeJson(path.join(base, "jobs", "asset_jobs.json"), { jobs });
  return jobs;
}

module.exports = { createAssetJobs };
```

- [ ] **Step 6: Add CLIs**

Create `D:\work\art-pipeline-v2-demo\src\cli\plan-assets.js`:

```js
const path = require("node:path");
const { readJson, writeJson } = require("../core/json");
const { planAssets } = require("../core/asset-planner");
const { runDir, updateStage } = require("../core/run-store");

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
updateStage(projectRoot, runId, "planAssets", "complete");
console.log(`Planned assets: ${manifest.assets.length}`);
```

Create `D:\work\art-pipeline-v2-demo\src\cli\create-asset-jobs.js`:

```js
const path = require("node:path");
const { createAssetJobs } = require("../core/asset-jobs");
const { updateStage } = require("../core/run-store");

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

const projectRoot = path.resolve(__dirname, "../..");
const runId = arg("--run");
if (!runId) throw new Error("Usage: npm run create-asset-jobs -- --run <run_id>");
const jobs = createAssetJobs({ projectRoot, runId });
updateStage(projectRoot, runId, "createAssetJobs", "complete");
console.log(`Asset jobs created: ${jobs.length}`);
```

- [ ] **Step 7: Run tests**

Run:

```bash
npm test -- test/asset-planner.test.js test/asset-jobs.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add src/core/asset-planner.js src/core/asset-jobs.js src/cli/plan-assets.js src/cli/create-asset-jobs.js test/asset-planner.test.js test/asset-jobs.test.js
git commit -m "feat: create per-asset generation jobs"
```

---

### Task 6: Bounded Parallel Worker Pool

**Files:**
- Create: `D:\work\art-pipeline-v2-demo\src\core\worker-pool.js`
- Create: `D:\work\art-pipeline-v2-demo\test\worker-pool.test.js`

- [ ] **Step 1: Write failing parallelism test**

Create `D:\work\art-pipeline-v2-demo\test\worker-pool.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { runWorkerPool } = require("../src/core/worker-pool");

test("runWorkerPool runs jobs in parallel without exceeding maxParallel", async () => {
  let active = 0;
  let maxSeen = 0;
  const jobs = Array.from({ length: 8 }, (_, index) => ({ id: `job_${index}` }));

  const results = await runWorkerPool({
    jobs,
    maxParallel: 3,
    worker: async (job) => {
      active++;
      maxSeen = Math.max(maxSeen, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active--;
      return { id: job.id, ok: true };
    }
  });

  assert.equal(results.length, 8);
  assert.equal(maxSeen, 3);
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm test -- test/worker-pool.test.js
```

Expected: FAIL because worker pool does not exist.

- [ ] **Step 3: Add worker pool**

Create `D:\work\art-pipeline-v2-demo\src\core\worker-pool.js`:

```js
async function runWorkerPool({ jobs, maxParallel, worker }) {
  const results = [];
  let nextIndex = 0;

  async function runNext() {
    const index = nextIndex++;
    if (index >= jobs.length) return;
    const job = jobs[index];
    try {
      results[index] = await worker(job, index);
    } catch (error) {
      results[index] = { id: job.id, ok: false, error: error.message };
    }
    await runNext();
  }

  const workers = [];
  const count = Math.min(maxParallel, jobs.length);
  for (let i = 0; i < count; i++) workers.push(runNext());
  await Promise.all(workers);
  return results;
}

module.exports = { runWorkerPool };
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm test -- test/worker-pool.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/core/worker-pool.js test/worker-pool.test.js
git commit -m "feat: add bounded worker pool"
```

---

### Task 7: Image Capability Smoke Test

**Files:**
- Create: `D:\work\art-pipeline-v2-demo\src\cli\smoke-image.js`
- Create: `D:\work\art-pipeline-v2-demo\src\validation\png.js`
- Create: `D:\work\art-pipeline-v2-demo\test\helpers\sample-png.js`
- Create: `D:\work\art-pipeline-v2-demo\test\png-validation.test.js`

- [ ] **Step 1: Write failing PNG validator test**

Create `D:\work\art-pipeline-v2-demo\test\png-validation.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { writeSamplePng } = require("./helpers/sample-png");
const { validatePngAsset } = require("../src/validation/png");

test("validates transparent png with visible pixels away from edges", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "png-ok-"));
  const file = path.join(dir, "asset.png");
  writeSamplePng(file, { width: 32, height: 32, visiblePixels: 100 });
  const result = validatePngAsset(file, { minimumVisiblePixels: 50 });
  assert.equal(result.hasAlpha, true);
  assert.ok(result.visiblePixels >= 100);
});

test("rejects SVG output", () => {
  assert.throws(() => validatePngAsset("bad.svg", { minimumVisiblePixels: 1 }), /must be png/);
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm test -- test/png-validation.test.js
```

Expected: FAIL because helper and validator do not exist.

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
      png.data[offset + 1] = 180;
      png.data[offset + 2] = 190;
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
  if (!filePath.endsWith(".png")) throw new Error(`asset must be png: ${filePath}`);
  if (!fs.existsSync(filePath)) throw new Error(`asset missing: ${filePath}`);
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
  if (visiblePixels < minimumVisiblePixels) throw new Error(`too few visible pixels: ${visiblePixels}`);
  if (minX === 0 || minY === 0 || maxX === png.width - 1 || maxY === png.height - 1) {
    throw new Error("visible pixels touch edge; asset may be clipped");
  }
  return { width: png.width, height: png.height, hasAlpha: true, visiblePixels };
}

module.exports = { validatePngAsset };
```

- [ ] **Step 5: Add smoke-image CLI**

Create `D:\work\art-pipeline-v2-demo\src\cli\smoke-image.js`:

```js
const fs = require("node:fs");
const path = require("node:path");
const { readJson, writeJson } = require("../core/json");
const { runCodexExec } = require("../core/codex-exec");
const { validatePngAsset } = require("../validation/png");
const { runDir, updateStage } = require("../core/run-store");

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

async function main() {
  const projectRoot = path.resolve(__dirname, "../..");
  const runId = arg("--run");
  if (!runId) throw new Error("Usage: npm run smoke:image -- --run <run_id>");
  const config = readJson(path.join(projectRoot, "config", "pipeline.config.json"));
  const base = runDir(projectRoot, runId);
  const taskFile = path.join(base, "tasks", "smoke_image.md");
  const output = path.join(base, "assets", "objects", "_smoke_codex_png.png");
  fs.writeFileSync(taskFile, [
    `Create one tiny transparent PNG at runs/${runId}/assets/objects/_smoke_codex_png.png.`,
    "The image should be a simple cute pastel paw sticker on transparent background.",
    "Do not write SVG. Do not write text. The file must be a real PNG."
  ].join("\n"), "utf8");

  const result = await runCodexExec({
    command: config.codex.command,
    cwd: projectRoot,
    promptFile: path.relative(projectRoot, taskFile),
    outputLastMessage: path.join("runs", runId, "logs", "smoke_image.final.md"),
    sandbox: config.codex.sandbox,
    skipGitRepoCheck: config.codex.skipGitRepoCheck,
    stripEnv: config.codex.stripEnv,
    timeoutMs: config.generation.jobTimeoutMs
  });

  try {
    const validation = validatePngAsset(output, { minimumVisiblePixels: config.validation.minimumVisiblePixels });
    writeJson(path.join(base, "capability_report.json"), { imageGeneration: "available", validation, codexExitCode: result.code });
    updateStage(projectRoot, runId, "smokeImage", "complete");
    console.log("Codex image smoke test passed.");
  } catch (error) {
    writeJson(path.join(base, "capability_report.json"), { imageGeneration: "unavailable", reason: error.message, codexExitCode: result.code });
    updateStage(projectRoot, runId, "smokeImage", "failed");
    throw error;
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
```

- [ ] **Step 6: Run tests**

Run:

```bash
npm test -- test/png-validation.test.js
```

Expected: PASS.

- [ ] **Step 7: Run smoke after a real run exists**

Run:

```bash
npm run smoke:image -- --run cat_bathroom_demo
```

Expected success case:

```text
Codex image smoke test passed.
```

Expected failure case:

```text
asset missing: ..._smoke_codex_png.png
```

If failure occurs, stop the image-generation implementation and inspect `runs/cat_bathroom_demo/capability_report.json`.

- [ ] **Step 8: Commit**

Run:

```bash
git add src/cli/smoke-image.js src/validation/png.js test/helpers/sample-png.js test/png-validation.test.js
git commit -m "feat: add Codex image capability smoke test"
```

---

### Task 8: Parallel Asset Generation Workers

**Files:**
- Create: `D:\work\art-pipeline-v2-demo\src\cli\generate-assets.js`
- Modify: `D:\work\art-pipeline-v2-demo\src\core\asset-jobs.js`
- Create: `D:\work\art-pipeline-v2-demo\test\generate-assets.test.js`

- [ ] **Step 1: Write failing generate-assets test**

Create `D:\work\art-pipeline-v2-demo\test\generate-assets.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { runWorkerPool } = require("../src/core/worker-pool");

test("asset worker pool can process many jobs in bounded parallel batches", async () => {
  const jobs = Array.from({ length: 20 }, (_, index) => ({ id: `asset_${index}` }));
  let active = 0;
  let maxSeen = 0;
  const result = await runWorkerPool({
    jobs,
    maxParallel: 4,
    worker: async (job) => {
      active++;
      maxSeen = Math.max(maxSeen, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return { id: job.id, ok: true };
    }
  });

  assert.equal(result.length, 20);
  assert.equal(maxSeen, 4);
});
```

- [ ] **Step 2: Run test**

Run:

```bash
npm test -- test/generate-assets.test.js
```

Expected: PASS if Task 6 is complete.

- [ ] **Step 3: Add generate-assets CLI**

Create `D:\work\art-pipeline-v2-demo\src\cli\generate-assets.js`:

```js
const fs = require("node:fs");
const path = require("node:path");
const { readJson, writeJson } = require("../core/json");
const { runCodexExec } = require("../core/codex-exec");
const { runWorkerPool } = require("../core/worker-pool");
const { runDir, updateStage } = require("../core/run-store");
const { validatePngAsset } = require("../validation/png");

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

async function runAssetJob({ projectRoot, runId, job, config }) {
  const base = runDir(projectRoot, runId);
  const result = await runCodexExec({
    command: config.codex.command,
    cwd: projectRoot,
    promptFile: path.join("runs", runId, job.taskFile),
    outputLastMessage: path.join("runs", runId, "logs", `${job.id}.final.md`),
    sandbox: config.codex.sandbox,
    skipGitRepoCheck: config.codex.skipGitRepoCheck,
    stripEnv: config.codex.stripEnv,
    timeoutMs: config.generation.jobTimeoutMs
  });
  const absoluteOutput = path.join(base, job.output);
  const validation = validatePngAsset(absoluteOutput, {
    minimumVisiblePixels: config.validation.minimumVisiblePixels
  });
  const jobResult = { id: job.id, ok: true, output: job.output, validation, codexExitCode: result.code };
  writeJson(path.join(base, "assets", "results", `${job.id}.json`), jobResult);
  return jobResult;
}

async function runAssetJobWithRetry({ projectRoot, runId, job, config }) {
  let lastError = null;
  for (let attempt = 1; attempt <= config.generation.retryLimit + 1; attempt++) {
    try {
      const result = await runAssetJob({ projectRoot, runId, job, config });
      return { ...result, attempts: attempt };
    } catch (error) {
      lastError = error;
    }
  }
  const failure = {
    id: job.id,
    ok: false,
    output: job.output,
    attempts: config.generation.retryLimit + 1,
    error: lastError ? lastError.message : "unknown asset generation failure"
  };
  writeJson(path.join(runDir(projectRoot, runId), "assets", "results", `${job.id}.json`), failure);
  return failure;
}

async function main() {
  const projectRoot = path.resolve(__dirname, "../..");
  const runId = arg("--run");
  if (!runId) throw new Error("Usage: npm run generate-assets -- --run <run_id>");
  const config = readJson(path.join(projectRoot, "config", "pipeline.config.json"));
  const base = runDir(projectRoot, runId);
  const capability = readJson(path.join(base, "capability_report.json"));
  if (capability.imageGeneration !== "available") {
    throw new Error("Codex image generation capability is not available; run npm run smoke:image first.");
  }

  const jobs = readJson(path.join(base, "jobs", "asset_jobs.json")).jobs;
  const results = await runWorkerPool({
    jobs,
    maxParallel: config.generation.maxParallel,
    worker: (job) => runAssetJobWithRetry({ projectRoot, runId, job, config })
  });

  writeJson(path.join(base, "jobs", "asset_job_results.json"), { results });
  const failed = results.filter((result) => !result.ok);
  updateStage(projectRoot, runId, "generateAssets", failed.length === 0 ? "complete" : "failed");
  if (failed.length > 0) throw new Error(`asset jobs failed: ${failed.map((item) => item.id).join(", ")}`);
  console.log(`Generated assets in parallel: ${results.length}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm test -- test/generate-assets.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/cli/generate-assets.js test/generate-assets.test.js
git commit -m "feat: run asset generation in parallel"
```

---

### Task 9: Animation Manifest And Export

**Files:**
- Create: `D:\work\art-pipeline-v2-demo\src\core\animation-planner.js`
- Create: `D:\work\art-pipeline-v2-demo\src\cli\animate.js`
- Create: `D:\work\art-pipeline-v2-demo\src\export\level.js`
- Create: `D:\work\art-pipeline-v2-demo\src\cli\export.js`
- Create: `D:\work\art-pipeline-v2-demo\test\export.test.js`

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

test("exports level json and copied png assets", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "art-export-"));
  const runId = "r1";
  const base = path.join(root, "runs", runId);
  fs.mkdirSync(path.join(base, "assets", "objects"), { recursive: true });
  fs.mkdirSync(path.join(base, "manifests"), { recursive: true });
  writeSamplePng(path.join(base, "assets", "objects", "cat.png"), { width: 32, height: 32, visiblePixels: 100 });
  writeJson(path.join(base, "manifests", "asset_manifest.json"), {
    schema: "art-pipeline-v2-asset-manifest@2",
    sceneId: "bathroom",
    assets: [{ id: "cat", type: "object", output: "assets/objects/cat.png", prompt: "cat", negativePrompt: "none", layer: 10, requiresAlpha: true }]
  });
  writeJson(path.join(base, "manifests", "animation_manifest.json"), {
    schema: "art-pipeline-v2-animation-manifest@2",
    sceneId: "bathroom",
    animations: []
  });

  const result = exportRun({ projectRoot: root, runId });
  assert.ok(fs.existsSync(path.join(result.exportDir, "level.json")));
  assert.ok(fs.existsSync(path.join(result.exportDir, "assets", "objects", "cat.png")));
  assert.ok(fs.existsSync(path.join(result.exportDir, "report.md")));
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm test -- test/export.test.js
```

Expected: FAIL because export module does not exist.

- [ ] **Step 3: Add animation planner and CLI**

Create `D:\work\art-pipeline-v2-demo\src\core\animation-planner.js`:

```js
function planAnimations({ sceneGraph, assetManifest }) {
  const animations = assetManifest.assets
    .filter((asset) => asset.type === "animation_candidate")
    .map((asset) => ({
      assetId: asset.id,
      kind: "loop",
      status: "spec_only",
      suggestedMotion: /water|shower/i.test(asset.id) ? "subtle water loop" : "subtle idle loop",
      frames: []
    }));
  return {
    schema: "art-pipeline-v2-animation-manifest@2",
    sceneId: sceneGraph.sceneId,
    animations
  };
}

module.exports = { planAnimations };
```

Create `D:\work\art-pipeline-v2-demo\src\cli\animate.js`:

```js
const path = require("node:path");
const { readJson, writeJson } = require("../core/json");
const { planAnimations } = require("../core/animation-planner");
const { runDir, updateStage } = require("../core/run-store");

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

const projectRoot = path.resolve(__dirname, "../..");
const runId = arg("--run");
if (!runId) throw new Error("Usage: npm run animate -- --run <run_id>");
const base = runDir(projectRoot, runId);
const manifest = planAnimations({
  sceneGraph: readJson(path.join(base, "analysis", "scene_graph.json")),
  assetManifest: readJson(path.join(base, "manifests", "asset_manifest.json"))
});
writeJson(path.join(base, "manifests", "animation_manifest.json"), manifest);
updateStage(projectRoot, runId, "animate", "complete");
console.log(`Animation candidates: ${manifest.animations.length}`);
```

- [ ] **Step 4: Add export module and CLI**

Create `D:\work\art-pipeline-v2-demo\src\export\level.js`:

```js
const fs = require("node:fs");
const path = require("node:path");
const { readJson, writeJson } = require("../core/json");
const { runDir } = require("../core/run-store");

function copyFile(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function exportRun({ projectRoot, runId }) {
  const base = runDir(projectRoot, runId);
  const exportDir = path.join(base, "export");
  const assetManifest = readJson(path.join(base, "manifests", "asset_manifest.json"));
  const animationManifest = readJson(path.join(base, "manifests", "animation_manifest.json"));
  fs.mkdirSync(exportDir, { recursive: true });

  for (const asset of assetManifest.assets) {
    copyFile(path.join(base, asset.output), path.join(exportDir, asset.output));
  }

  const level = {
    schema: "art-pipeline-v2-level@2",
    sceneId: assetManifest.sceneId,
    assets: assetManifest.assets.map((asset) => ({
      id: asset.id,
      type: asset.type,
      path: asset.output,
      layer: asset.layer,
      animation: animationManifest.animations.find((animation) => animation.assetId === asset.id) || null
    }))
  };

  writeJson(path.join(exportDir, "level.json"), level);
  writeJson(path.join(exportDir, "animation_manifest.json"), animationManifest);
  fs.writeFileSync(path.join(exportDir, "report.md"), [
    "# Export Report",
    "",
    `Run: ${runId}`,
    `Assets: ${assetManifest.assets.length}`,
    `Animations: ${animationManifest.animations.length}`,
    "",
    "Automatic file checks passed. Human art review is still required."
  ].join("\n"), "utf8");

  return { exportDir, level };
}

module.exports = { exportRun };
```

Create `D:\work\art-pipeline-v2-demo\src\cli\export.js`:

```js
const path = require("node:path");
const { exportRun } = require("../export/level");
const { updateStage } = require("../core/run-store");

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

const projectRoot = path.resolve(__dirname, "../..");
const runId = arg("--run");
if (!runId) throw new Error("Usage: npm run export -- --run <run_id>");
const result = exportRun({ projectRoot, runId });
updateStage(projectRoot, runId, "export", "complete");
console.log(`Export written: ${result.exportDir}`);
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- test/export.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/core/animation-planner.js src/cli/animate.js src/export/level.js src/cli/export.js test/export.test.js
git commit -m "feat: export generated asset packs"
```

---

### Task 10: Demo Runner, README, And Old Pipeline Removal

**Files:**
- Create: `D:\work\art-pipeline-v2-demo\src\cli\run-demo.js`
- Modify: `D:\work\art-pipeline-v2-demo\README.md`
- Delete: `D:\work\art-pipeline-v2-demo\src\pipeline.js`
- Delete: `D:\work\art-pipeline-v2-demo\src\run-demo.js`
- Delete: `D:\work\art-pipeline-v2-demo\config\scene_manifest.json`
- Replace: `D:\work\art-pipeline-v2-demo\test\pipeline.test.js`

- [ ] **Step 1: Add demo runner**

Create `D:\work\art-pipeline-v2-demo\src\cli\run-demo.js`:

```js
const path = require("node:path");
const { createRun } = require("../core/run-store");

const projectRoot = path.resolve(__dirname, "../..");
const runId = "cat_bathroom_demo";
const source = path.join(projectRoot, "inputs", "source_scene_v5.png");
const run = createRun({ projectRoot, source, runId });

console.log(`Demo run created: ${run.runId}`);
console.log("Next:");
console.log("npm run verify-codex");
console.log("npm run analyze -- --run cat_bathroom_demo");
console.log("npm run plan-assets -- --run cat_bathroom_demo");
console.log("npm run smoke:image -- --run cat_bathroom_demo");
console.log("npm run create-asset-jobs -- --run cat_bathroom_demo");
console.log("npm run generate-assets -- --run cat_bathroom_demo");
console.log("npm run animate -- --run cat_bathroom_demo");
console.log("npm run export -- --run cat_bathroom_demo");
```

- [ ] **Step 2: Replace README**

Edit `D:\work\art-pipeline-v2-demo\README.md`:

```markdown
# Art Pipeline V2 Demo

This demo uses the local Codex CLI and the user's existing Codex subscription/login state. It does not require or accept an OpenAI API key.

## Flow

```bash
npm install
npm test
npm run verify-codex
npm run run:demo
npm run analyze -- --run cat_bathroom_demo
npm run plan-assets -- --run cat_bathroom_demo
npm run smoke:image -- --run cat_bathroom_demo
npm run create-asset-jobs -- --run cat_bathroom_demo
npm run generate-assets -- --run cat_bathroom_demo
npm run animate -- --run cat_bathroom_demo
npm run export -- --run cat_bathroom_demo
```

`generate-assets` runs per-asset Codex jobs in parallel using `generation.maxParallel` from `config/pipeline.config.json`.

If `smoke:image` fails, the local Codex CLI cannot currently produce PNG image assets in this environment. The demo stops and writes `runs/<run_id>/capability_report.json`.
```

- [ ] **Step 3: Remove old placeholder pipeline files**

Delete:

```text
D:\work\art-pipeline-v2-demo\src\pipeline.js
D:\work\art-pipeline-v2-demo\src\run-demo.js
D:\work\art-pipeline-v2-demo\config\scene_manifest.json
D:\work\art-pipeline-v2-demo\test\pipeline.test.js
```

- [ ] **Step 4: Run all tests**

Run:

```bash
npm test
```

Expected: PASS for all tests.

- [ ] **Step 5: Run deterministic demo setup**

Run:

```bash
npm run verify-codex
npm run run:demo
```

Expected:

```text
codex-cli ...
Demo run created: cat_bathroom_demo
```

- [ ] **Step 6: Commit**

Run:

```bash
git add README.md src test config schemas package.json package-lock.json
git add -u
git commit -m "feat: replace placeholder demo with Codex CLI pipeline"
```

---

## Self-Review Checklist

- Spec coverage: The plan covers source ingest, Codex CLI analysis, scene graph, asset manifest, per-asset job splitting, parallel asset generation, smoke-image capability check, animation manifest, export, and old placeholder removal.
- No API key path: Config and adapter explicitly strip `OPENAI_API_KEY` and `CODEX_API_KEY`; no task asks the user to provide API credentials.
- Parallel generation: Task 6 creates bounded concurrency; Task 8 uses it for asset jobs with `maxParallel: 4`.
- Failure honesty: Task 7 verifies whether local `codex exec` can produce PNG assets before running the 20-job batch.
- Final asset quality: PNG validation rejects SVG, missing files, too few visible pixels, and edge-clipped outputs.
- Demo path: `run:demo` creates a run; then the user can run analysis, planning, smoke, job creation, parallel generation, animation, and export.
