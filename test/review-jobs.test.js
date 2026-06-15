const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { readJson, writeJson } = require("../src/core/json");
const { createRepairJobs } = require("../src/core/review-jobs");

test("createRepairJobs creates repair task only for failed review items", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repair-jobs-"));
  const base = path.join(root, "runs", "demo");
  fs.mkdirSync(path.join(base, "review"), { recursive: true });
  const assetJobs = [
    {
      id: "cat",
      status: "pending",
      task: "tasks/assets/cat.md",
      output: "assets/objects/cat.png",
      result: "assets/results/cat.json"
    },
    {
      id: "shower",
      status: "pending",
      task: "tasks/assets/shower.md",
      output: "assets/objects/shower.png",
      result: "assets/results/shower.json"
    }
  ];
  writeJson(path.join(base, "jobs", "asset_jobs.json"), { jobs: assetJobs });
  writeJson(path.join(base, "jobs", "assets", "shower.json"), assetJobs[1]);
  fs.mkdirSync(path.join(base, "tasks", "assets"), { recursive: true });
  fs.writeFileSync(path.join(base, "tasks", "assets", "shower.md"), "Generate shower asset.", "utf8");
  writeJson(path.join(base, "review", "review_report.json"), {
    assets: [
      { assetId: "cat", status: "pass", issues: [] },
      { assetId: "shower", status: "repair_required", issues: ["pipe disconnected"] }
    ]
  });
  writeJson(path.join(base, "run.json"), {
    runId: "demo",
    stages: { repair: "pending" }
  });

  const repairs = createRepairJobs({ projectRoot: root, runId: "demo" });

  assert.equal(repairs.length, 1);
  assert.equal(repairs[0].assetId, "shower");
  assert.ok(fs.existsSync(path.join(base, "jobs", "repairs", "shower.json")));
  assert.ok(fs.existsSync(path.join(base, "tasks", "repairs", "shower.md")));

  const repairJson = readJson(path.join(base, "jobs", "repairs", "shower.json"));
  assert.deepEqual(repairJson, {
    assetId: "shower",
    issues: ["pipe disconnected"],
    status: "pending",
    task: "tasks/repairs/shower.md",
    output: "assets/objects/shower.png",
    result: "assets/results/shower.json",
    originalJob: "jobs/assets/shower.json",
    originalTask: "tasks/assets/shower.md"
  });
  assert.deepEqual(repairs, [repairJson]);

  const repairTask = fs.readFileSync(path.join(base, "tasks", "repairs", "shower.md"), "utf8");
  assert.match(repairTask, /Regenerate the PNG at the original asset output path\./);
  assert.match(repairTask, /Write an updated result JSON when done\./);
  assert.match(repairTask, /Output: runs\/demo\/assets\/objects\/shower\.png/);
  assert.match(repairTask, /Result: runs\/demo\/assets\/results\/shower\.json/);
  assert.match(repairTask, /Original job: runs\/demo\/jobs\/assets\/shower\.json/);
  assert.match(repairTask, /Original task: runs\/demo\/tasks\/assets\/shower\.md/);

  const run = readJson(path.join(base, "run.json"));
  assert.equal(run.stages.repair, "ready");
  assert.deepEqual(run.repairJobs, { count: 1 });
});

test("createRepairJobs falls back to asset manifest when asset jobs are absent", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repair-jobs-manifest-"));
  const base = path.join(root, "runs", "demo");
  fs.mkdirSync(path.join(base, "review"), { recursive: true });
  writeJson(path.join(base, "manifests", "asset_manifest.json"), {
    assets: [
      {
        id: "sink",
        output: "assets/objects/sink.png",
        prompt: "sink prompt",
        negativePrompt: "none"
      }
    ]
  });
  writeJson(path.join(base, "review", "review_report.json"), {
    assets: [
      { assetId: "sink", status: "repair_required", issues: ["missing faucet"] }
    ]
  });
  writeJson(path.join(base, "run.json"), {
    runId: "demo",
    stages: { repair: "pending" }
  });

  const repairs = createRepairJobs({ projectRoot: root, runId: "demo" });

  assert.equal(repairs.length, 1);
  assert.equal(repairs[0].output, "assets/objects/sink.png");
  assert.equal(repairs[0].result, "assets/results/sink.json");
  assert.equal(repairs[0].originalJob, null);
  assert.equal(repairs[0].originalTask, null);
});

test("createRepairJobs marks repair complete when no repairs are needed", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repair-jobs-none-"));
  const base = path.join(root, "runs", "demo");
  fs.mkdirSync(path.join(base, "review"), { recursive: true });
  writeJson(path.join(base, "jobs", "asset_jobs.json"), {
    jobs: [
      {
        id: "cat",
        status: "pending",
        task: "tasks/assets/cat.md",
        output: "assets/objects/cat.png",
        result: "assets/results/cat.json"
      }
    ]
  });
  writeJson(path.join(base, "review", "review_report.json"), {
    assets: [
      { assetId: "cat", status: "pass", issues: [] }
    ]
  });
  writeJson(path.join(base, "run.json"), {
    schema: "art-pipeline-v2-run@main-flow",
    stages: { repair: "pending" }
  });

  const repairs = createRepairJobs({ projectRoot: root, runId: "demo" });

  assert.equal(repairs.length, 0);
  const run = readJson(path.join(base, "run.json"));
  assert.equal(run.stages.repair, "complete");
  assert.deepEqual(run.repairJobs, { count: 0 });
});

test("createRepairJobs rejects unsafe repair asset ids before writing paths", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repair-jobs-unsafe-"));
  const base = path.join(root, "runs", "demo");
  fs.mkdirSync(path.join(base, "review"), { recursive: true });
  writeJson(path.join(base, "jobs", "asset_jobs.json"), {
    jobs: [
      {
        id: "shower",
        status: "pending",
        task: "tasks/assets/shower.md",
        output: "assets/objects/shower.png",
        result: "assets/results/shower.json"
      }
    ]
  });
  writeJson(path.join(base, "review", "review_report.json"), {
    assets: [
      { assetId: "../escape", status: "repair_required", issues: ["unsafe"] }
    ]
  });

  let error = null;
  try {
    createRepairJobs({ projectRoot: root, runId: "demo" });
  } catch (caught) {
    error = caught;
  }

  assert.equal(fs.existsSync(path.join(base, "jobs", "escape.json")), false);
  assert.equal(fs.existsSync(path.join(base, "tasks", "escape.md")), false);
  assert.match(error && error.message, /Invalid repair assetId "\.\.\/escape"/);
});

test("createRepairJobs rejects unknown repair asset ids", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repair-jobs-unknown-"));
  const base = path.join(root, "runs", "demo");
  fs.mkdirSync(path.join(base, "review"), { recursive: true });
  writeJson(path.join(base, "jobs", "asset_jobs.json"), {
    jobs: [
      {
        id: "shower",
        status: "pending",
        task: "tasks/assets/shower.md",
        output: "assets/objects/shower.png",
        result: "assets/results/shower.json"
      }
    ]
  });
  writeJson(path.join(base, "review", "review_report.json"), {
    assets: [
      { assetId: "ghost", status: "repair_required", issues: ["not in contract"] }
    ]
  });

  let error = null;
  try {
    createRepairJobs({ projectRoot: root, runId: "demo" });
  } catch (caught) {
    error = caught;
  }

  assert.equal(fs.existsSync(path.join(base, "jobs", "repairs", "ghost.json")), false);
  assert.equal(fs.existsSync(path.join(base, "tasks", "repairs", "ghost.md")), false);
  assert.match(error && error.message, /Unknown repair assetId "ghost"/);
});

test("createRepairJobs rejects unsafe asset job outputs before writing repairs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repair-jobs-unsafe-output-"));
  const base = path.join(root, "runs", "demo");
  fs.mkdirSync(path.join(base, "review"), { recursive: true });
  writeJson(path.join(base, "jobs", "asset_jobs.json"), {
    jobs: [
      {
        id: "shower",
        status: "pending",
        task: "tasks/assets/shower.md",
        output: "../outside.png",
        result: "assets/results/shower.json"
      }
    ]
  });
  writeJson(path.join(base, "review", "review_report.json"), {
    assets: [
      { assetId: "shower", status: "repair_required", issues: ["unsafe output"] }
    ]
  });
  writeJson(path.join(base, "run.json"), {
    schema: "art-pipeline-v2-run@main-flow",
    stages: { repair: "pending" }
  });

  assert.throws(
    () => createRepairJobs({ projectRoot: root, runId: "demo" }),
    /invalid asset output/
  );
  assert.equal(fs.existsSync(path.join(base, "jobs", "repairs", "shower.json")), false);
  assert.equal(fs.existsSync(path.join(base, "tasks", "repairs", "shower.md")), false);
});

test("createRepairJobs rejects unsafe manifest fallback outputs before writing repairs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repair-jobs-unsafe-manifest-output-"));
  const base = path.join(root, "runs", "demo");
  fs.mkdirSync(path.join(base, "review"), { recursive: true });
  writeJson(path.join(base, "manifests", "asset_manifest.json"), {
    assets: [
      {
        id: "sink",
        output: "assets/objects/../sink.png"
      }
    ]
  });
  writeJson(path.join(base, "review", "review_report.json"), {
    assets: [
      { assetId: "sink", status: "repair_required", issues: ["unsafe output"] }
    ]
  });
  writeJson(path.join(base, "run.json"), {
    schema: "art-pipeline-v2-run@main-flow",
    stages: { repair: "pending" }
  });

  assert.throws(
    () => createRepairJobs({ projectRoot: root, runId: "demo" }),
    /invalid asset output/
  );
  assert.equal(fs.existsSync(path.join(base, "jobs", "repairs", "sink.json")), false);
  assert.equal(fs.existsSync(path.join(base, "tasks", "repairs", "sink.md")), false);
});
