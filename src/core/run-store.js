const fs = require("node:fs");
const path = require("node:path");
const { writeJson } = require("./json");

function runDir(projectRoot, runId) {
  return path.join(projectRoot, "runs", runId);
}

function createRun({ projectRoot, runId, source }) {
  const base = runDir(projectRoot, runId);
  for (const dir of ["source", "analysis", "manifests", "tasks/assets", "tasks/review", "tasks/repairs", "jobs/assets", "jobs/repairs", "assets/objects", "assets/effects", "assets/results", "review", "export"]) {
    fs.mkdirSync(path.join(base, dir), { recursive: true });
  }
  fs.copyFileSync(source, path.join(base, "source", "source.png"));
  const run = {
    schema: "art-pipeline-v2-run@main-flow",
    runId,
    sourceImage: "source/source.png",
    orchestration: "main_codex_agent_with_subagents",
    stages: {
      ingest: "complete",
      analyze: "pending",
      planAssets: "pending",
      generateAssets: "pending",
      review: "pending",
      repair: "pending",
      export: "pending"
    }
  };
  writeJson(path.join(base, "run.json"), run);
  return run;
}

module.exports = { createRun, runDir };
