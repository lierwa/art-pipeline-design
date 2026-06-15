const path = require("node:path");
const { readJson } = require("../core/json");
const { recordValidation, runDir } = require("../core/run-store");
const { resolveExportDir, resolveManifestAssetPaths } = require("../core/asset-paths");
const { validatePngAsset } = require("../validation/png");

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

const projectRoot = path.resolve(__dirname, "../..");
const runId = arg("--run");
if (!runId) throw new Error("Usage: npm run validate-assets -- --run <run_id>");

const base = runDir(projectRoot, runId);
const exportDir = resolveExportDir(base);
const manifest = readJson(path.join(base, "manifests", "asset_manifest.json"));
for (const asset of manifest.assets) {
  const paths = resolveManifestAssetPaths({ runDirectory: base, exportDir, output: asset.output });
  validatePngAsset(paths.source);
}
recordValidation({ projectRoot, runId, kind: "png", count: manifest.assets.length, lastStatus: "pass" });
console.log(`PNG assets valid: ${manifest.assets.length}`);
