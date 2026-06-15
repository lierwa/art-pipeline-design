const path = require("node:path");
const { createRepairJobs } = require("../core/review-jobs");

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

const projectRoot = path.resolve(__dirname, "../..");
const runId = arg("--run");
if (!runId) throw new Error("Usage: node src/cli/create-repair-jobs.js --run <run_id>");
const repairs = createRepairJobs({ projectRoot, runId });
console.log(`Repair jobs created: ${repairs.length}`);
