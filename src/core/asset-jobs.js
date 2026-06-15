const fs = require("node:fs");
const path = require("node:path");
const { readJson, writeJson } = require("./json");
const { updateRun, runDir } = require("./run-store");
const { validateAssetId, validateAssetOutput } = require("./asset-paths");
const { buildAssetTask } = require("./tasks");

function createAssetJobs({ projectRoot, runId }) {
  const base = runDir(projectRoot, runId);
  const manifest = readJson(path.join(base, "manifests", "asset_manifest.json"));
  const assetJobs = manifest.assets.map((asset) => {
    validateAssetId(asset.id);
    validateAssetOutput(asset.output);
    const job = {
      id: asset.id,
      status: "pending",
      task: `tasks/assets/${asset.id}.md`,
      output: asset.output,
      result: `assets/results/${asset.id}.json`
    };
    return { asset, job };
  });
  const jobs = assetJobs.map(({ job }) => job);

  for (const { asset, job } of assetJobs) {
    fs.mkdirSync(path.join(base, "tasks", "assets"), { recursive: true });
    writeJson(path.join(base, "jobs", "assets", `${job.id}.json`), job);
    fs.writeFileSync(path.join(base, job.task), buildAssetTask({ runId, asset }), "utf8");
  }

  fs.writeFileSync(path.join(base, "tasks", "subagent_batch.md"), [
    `Spawn subagents in parallel for run ${runId}.`,
    "Use one subagent per asset job, up to 4 at a time.",
    "Each subagent must read its job JSON and task file, generate the PNG, and write the result JSON.",
    "",
    ...jobs.flatMap((job) => [
      `- ${job.id}:`,
      `  Job: runs/${runId}/jobs/assets/${job.id}.json`,
      `  Task: runs/${runId}/${job.task}`,
      `  Output: runs/${runId}/${job.output}`,
      `  Result: runs/${runId}/${job.result}`
    ])
  ].join("\n"), "utf8");

  writeJson(path.join(base, "jobs", "asset_jobs.json"), { jobs });
  updateRun({
    projectRoot,
    runId,
    mutate(run) {
      run.stages = { ...(run.stages || {}), generateAssets: "ready" };
      run.assetJobs = { count: jobs.length };
    }
  });
  return jobs;
}

module.exports = { createAssetJobs };
