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
