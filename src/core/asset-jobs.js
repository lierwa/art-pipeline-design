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
