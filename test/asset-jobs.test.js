const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { readJson, writeJson } = require("../src/core/json");
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
  assert.ok(fs.existsSync(path.join(base, "jobs", "assets", "sink.json")));
  assert.ok(fs.existsSync(path.join(base, "tasks", "assets", "cat.md")));
  assert.ok(fs.existsSync(path.join(base, "tasks", "assets", "sink.md")));
  assert.ok(fs.existsSync(path.join(base, "tasks", "subagent_batch.md")));

  const assetJobs = readJson(path.join(base, "jobs", "asset_jobs.json"));
  assert.deepEqual(assetJobs, { jobs });

  const batchTask = fs.readFileSync(path.join(base, "tasks", "subagent_batch.md"), "utf8");
  for (const asset of ["cat", "sink"]) {
    assert.match(batchTask, new RegExp(`- ${asset}:`));
    assert.match(batchTask, new RegExp(`Job: runs/demo/jobs/assets/${asset}\\.json`));
    assert.match(batchTask, new RegExp(`Task: runs/demo/tasks/assets/${asset}\\.md`));
    assert.match(batchTask, new RegExp(`Output: runs/demo/assets/objects/${asset}\\.png`));
    assert.match(batchTask, new RegExp(`Result: runs/demo/assets/results/${asset}\\.json`));
  }

  const catTask = fs.readFileSync(path.join(base, "tasks", "assets", "cat.md"), "utf8");
  assert.match(catTask, /Write PNG exactly to: runs\/demo\/assets\/objects\/cat\.png/);
  assert.match(catTask, /Output: runs\/demo\/assets\/objects\/cat\.png/);
  assert.match(catTask, /Write result JSON exactly to: runs\/demo\/assets\/results\/cat\.json/);
  assert.match(catTask, /Result JSON: runs\/demo\/assets\/results\/cat\.json/);
  assert.match(catTask, /"assetId": "cat"/);
  assert.match(catTask, /"status": "complete"/);
  assert.match(catTask, /"output": "assets\/objects\/cat\.png"/);
  assert.match(catTask, /"notes": \[\]/);
});
