const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { readJson } = require("../src/core/json");
const { createRun } = require("../src/core/run-store");

test("createRun creates the main-flow folder contract", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "art-v2-"));
  const source = path.join(root, "source.png");
  fs.writeFileSync(source, Buffer.from([1, 2, 3]));

  const run = createRun({ projectRoot: root, runId: "demo", source });

  assert.equal(run.schema, "art-pipeline-v2-run@main-flow");
  assert.equal(run.stages.ingest, "complete");
  assert.deepEqual(readJson(path.join(root, "runs", "demo", "run.json")), run);
  assert.deepEqual(fs.readFileSync(path.join(root, "runs", "demo", "source", "source.png")), Buffer.from([1, 2, 3]));
  for (const dir of ["source", "analysis", "manifests", "tasks/assets", "jobs/assets", "jobs/repairs", "assets/objects", "assets/results", "review", "export"]) {
    assert.ok(fs.existsSync(path.join(root, "runs", "demo", dir)), dir);
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
