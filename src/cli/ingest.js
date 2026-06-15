const path = require("node:path");
const { createRun } = require("../core/run-store");

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

const source = arg("--source");
const runId = arg("--run-id");
if (!source || !runId) throw new Error("Usage: npm run ingest -- --source <image> --run-id <run_id>");

const projectRoot = path.resolve(__dirname, "../..");
const run = createRun({ projectRoot, runId, source: path.resolve(source) });
console.log(`Run created: ${run.runId}`);
