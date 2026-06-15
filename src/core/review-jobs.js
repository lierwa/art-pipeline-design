const fs = require("node:fs");
const path = require("node:path");
const { readJson, writeJson } = require("./json");
const { updateRun, runDir } = require("./run-store");
const { validateAssetId } = require("./asset-paths");

function readAssetContracts(base) {
  const jobsPath = path.join(base, "jobs", "asset_jobs.json");
  if (fs.existsSync(jobsPath)) {
    const assetJobs = readJson(jobsPath);
    return new Map(assetJobs.jobs.map((job) => [
      job.id,
      {
        output: job.output,
        result: job.result,
        originalJob: `jobs/assets/${job.id}.json`,
        originalTask: job.task || null
      }
    ]));
  }

  const manifest = readJson(path.join(base, "manifests", "asset_manifest.json"));
  return new Map(manifest.assets.map((asset) => [
    asset.id,
    {
      output: asset.output,
      result: `assets/results/${asset.id}.json`,
      originalJob: null,
      originalTask: null
    }
  ]));
}

function buildRepairTask({ repair, runId }) {
  const lines = [
    `Repair asset ${repair.assetId} for run ${runId}.`,
    `Issues: ${repair.issues.join("; ")}`,
    `Output: runs/${runId}/${repair.output}`,
    `Result: runs/${runId}/${repair.result}`
  ];
  if (repair.originalJob) {
    lines.push(`Original job: runs/${runId}/${repair.originalJob}`);
  }
  if (repair.originalTask) {
    lines.push(`Original task: runs/${runId}/${repair.originalTask}`);
  }
  lines.push(
    "Regenerate the PNG at the original asset output path.",
    "Write an updated result JSON when done."
  );
  return lines.join("\n");
}

function createRepairJobs({ projectRoot, runId }) {
  const base = runDir(projectRoot, runId);
  const report = readJson(path.join(base, "review", "review_report.json"));
  const assetContracts = readAssetContracts(base);
  const repairs = report.assets
    .filter((item) => item.status === "repair_required")
    .map((item) => {
      validateAssetId(item.assetId, "repair assetId");
      const contract = assetContracts.get(item.assetId);
      if (!contract) {
        throw new Error(`Unknown repair assetId "${item.assetId}"`);
      }
      return {
        assetId: item.assetId,
        issues: item.issues,
        status: "pending",
        task: `tasks/repairs/${item.assetId}.md`,
        output: contract.output,
        result: contract.result,
        originalJob: contract.originalJob,
        originalTask: contract.originalTask
      };
    });

  for (const repair of repairs) {
    writeJson(path.join(base, "jobs", "repairs", `${repair.assetId}.json`), repair);
    fs.mkdirSync(path.join(base, "tasks", "repairs"), { recursive: true });
    fs.writeFileSync(path.join(base, repair.task), buildRepairTask({ repair, runId }), "utf8");
  }

  updateRun({
    projectRoot,
    runId,
    mutate(run) {
      run.stages = { ...(run.stages || {}), repair: "ready" };
      run.repairJobs = { count: repairs.length };
    }
  });
  return repairs;
}

module.exports = { createRepairJobs };
