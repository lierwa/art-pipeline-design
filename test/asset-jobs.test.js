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
