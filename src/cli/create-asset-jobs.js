const path = require("node:path");
const { createAssetJobs } = require("../core/asset-jobs");

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

const projectRoot = path.resolve(__dirname, "../..");
const runId = arg("--run");
if (!runId) throw new Error("Usage: npm run create-asset-jobs -- --run <run_id>");
const jobs = createAssetJobs({ projectRoot, runId });
console.log(`Asset jobs created: ${jobs.length}`);
console.log(`Main-agent batch task: runs/${runId}/tasks/subagent_batch.md`);
