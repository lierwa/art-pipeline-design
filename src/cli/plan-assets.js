const path = require("node:path");
const { readJson, writeJson } = require("../core/json");
const { planAssets } = require("../core/asset-planner");
const { runDir, updateStage } = require("../core/run-store");

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

const projectRoot = path.resolve(__dirname, "../..");
const runId = arg("--run");
if (!runId) throw new Error("Usage: npm run plan-assets -- --run <run_id>");

const base = runDir(projectRoot, runId);
const manifest = planAssets(readJson(path.join(base, "analysis", "scene_graph.json")));
writeJson(path.join(base, "manifests", "asset_manifest.json"), manifest);
updateStage({ projectRoot, runId, stage: "planAssets", status: "complete" });
console.log(`Assets planned: ${manifest.assets.length}`);
