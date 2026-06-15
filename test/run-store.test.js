const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { readJson, writeJson } = require("../src/core/json");
const { createRun, recordValidation, updateStage } = require("../src/core/run-store");
const { writeSamplePng } = require("./helpers/sample-png");

test("createRun creates the main-flow folder contract", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "art-v2-"));
  const source = path.join(root, "source.png");
  fs.writeFileSync(source, Buffer.from([1, 2, 3]));

  const run = createRun({ projectRoot: root, runId: "demo", source });

  assert.equal(run.schema, "art-pipeline-v2-run@main-flow");
  assert.equal(run.stages.ingest, "complete");
  assert.deepEqual(readJson(path.join(root, "runs", "demo", "run.json")), run);
  assert.deepEqual(fs.readFileSync(path.join(root, "runs", "demo", "source", "source.png")), Buffer.from([1, 2, 3]));
  for (const dir of ["source", "analysis", "manifests", "tasks/assets", "jobs/assets", "jobs/repairs", "assets/background", "assets/objects", "assets/results", "review", "export"]) {
    assert.ok(fs.existsSync(path.join(root, "runs", "demo", dir)), dir);
  }
});

test("run-store helpers update stages and validation metadata", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "art-v2-state-"));
  const source = path.join(root, "source.png");
  fs.writeFileSync(source, Buffer.from([1, 2, 3]));
  createRun({ projectRoot: root, runId: "demo", source });

  updateStage({ projectRoot: root, runId: "demo", stage: "planAssets", status: "complete" });
  recordValidation({ projectRoot: root, runId: "demo", kind: "png", count: 3, lastStatus: "pass" });

  const run = readJson(path.join(root, "runs", "demo", "run.json"));
  assert.equal(run.stages.planAssets, "complete");
  assert.deepEqual(run.validation.png, { count: 3, lastStatus: "pass" });
});

test("plan-assets CLI marks the planning stage complete", () => {
  const projectRoot = path.resolve(__dirname, "..");
  const runsDir = path.join(projectRoot, "runs");
  const runId = `cli-plan-${process.pid}-${Date.now()}`;
  const base = path.join(runsDir, runId);
  try {
    fs.mkdirSync(path.join(base, "analysis"), { recursive: true });
    writeJson(path.join(base, "run.json"), {
      runId,
      stages: { planAssets: "pending" }
    });
    writeJson(path.join(base, "analysis", "scene_graph.json"), {
      sceneId: "bathroom",
      objects: [
        {
          id: "sink_vanity",
          name: "Sink vanity",
          grouping: "single furniture",
          region: { type: "bbox", x: 1, y: 2, w: 30, h: 40 }
        }
      ]
    });

    const result = spawnSync(process.execPath, [path.join(projectRoot, "src", "cli", "plan-assets.js"), "--run", runId], {
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    const run = readJson(path.join(base, "run.json"));
    assert.equal(run.stages.planAssets, "complete");
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("validate-assets CLI records PNG validation status and count", () => {
  const projectRoot = path.resolve(__dirname, "..");
  const runsDir = path.join(projectRoot, "runs");
  const runId = `cli-validate-${process.pid}-${Date.now()}`;
  const base = path.join(runsDir, runId);
  try {
    fs.mkdirSync(path.join(base, "manifests"), { recursive: true });
    writeSamplePng(path.join(base, "assets", "objects", "cat.png"));
    writeJson(path.join(base, "run.json"), {
      runId,
      stages: { generateAssets: "ready" }
    });
    writeJson(path.join(base, "manifests", "asset_manifest.json"), {
      sceneId: "bathroom",
      assets: [{ id: "cat", output: "assets/objects/cat.png", layer: 10 }]
    });

    const result = spawnSync(process.execPath, [path.join(projectRoot, "src", "cli", "validate-assets.js"), "--run", runId], {
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    const run = readJson(path.join(base, "run.json"));
    assert.deepEqual(run.validation.png, { count: 1, lastStatus: "pass" });
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("createRun rejects unsafe run ids without escaping runs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "art-v2-"));
  const source = path.join(root, "source.png");
  fs.writeFileSync(source, Buffer.from([1, 2, 3]));

  assert.throws(
    () => createRun({ projectRoot: root, runId: "../outside", source }),
    /runId/
  );
  assert.equal(fs.existsSync(path.join(root, "outside")), false);
});
