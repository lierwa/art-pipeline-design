const fs = require("node:fs");
const path = require("node:path");
const { readJson, writeJson } = require("./json");

function validateRunId(runId) {
  if (typeof runId !== "string" || !/^[A-Za-z0-9._-]+$/.test(runId) || runId === "." || runId === "..") {
    throw new Error("Invalid runId: expected a non-empty single path segment using letters, numbers, dot, underscore, or hyphen");
  }
}

function runDir(projectRoot, runId) {
  validateRunId(runId);
  return path.join(projectRoot, "runs", runId);
}

function runFile(projectRoot, runId) {
  return path.join(runDir(projectRoot, runId), "run.json");
}

function readRun({ projectRoot, runId }) {
  return readJson(runFile(projectRoot, runId));
}

function writeRun({ projectRoot, runId, run }) {
  writeJson(runFile(projectRoot, runId), run);
  return run;
}

function updateRun({ projectRoot, runId, mutate }) {
  const run = readRun({ projectRoot, runId });
  mutate(run);
  return writeRun({ projectRoot, runId, run });
}

function updateStage({ projectRoot, runId, stage, status }) {
  return updateRun({
    projectRoot,
    runId,
    mutate(run) {
      run.stages = { ...(run.stages || {}), [stage]: status };
    }
  });
}

function recordValidation({ projectRoot, runId, kind, count, lastStatus }) {
  return updateRun({
    projectRoot,
    runId,
    mutate(run) {
      run.validation = {
        ...(run.validation || {}),
        [kind]: { count, lastStatus }
      };
    }
  });
}

function createRun({ projectRoot, runId, source }) {
  const base = runDir(projectRoot, runId);
  for (const dir of ["source", "analysis", "manifests", "tasks/assets", "tasks/review", "tasks/repairs", "jobs/assets", "jobs/repairs", "assets/background", "assets/objects", "assets/effects", "assets/results", "review", "export"]) {
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

module.exports = {
  createRun,
  readRun,
  recordValidation,
  runDir,
  updateRun,
  updateStage,
  writeRun
};
