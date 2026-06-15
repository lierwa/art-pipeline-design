const path = require("node:path");
const { exportRun } = require("../export/level");

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

const projectRoot = path.resolve(__dirname, "../..");
const runId = arg("--run");
if (!runId) throw new Error("Usage: npm run export -- --run <run_id>");
const result = exportRun({ projectRoot, runId });
console.log(`Export written: ${result.exportDir}`);
