const path = require("node:path");
const { readJson } = require("../core/json");
const { runDir } = require("../core/run-store");
const { validatePngAsset } = require("../validation/png");

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

const projectRoot = path.resolve(__dirname, "../..");
const runId = arg("--run");
if (!runId) throw new Error("Usage: npm run validate-assets -- --run <run_id>");

const base = runDir(projectRoot, runId);
const manifest = readJson(path.join(base, "manifests", "asset_manifest.json"));
for (const asset of manifest.assets) {
  validatePngAsset(path.join(base, asset.output));
}
console.log(`PNG assets valid: ${manifest.assets.length}`);
