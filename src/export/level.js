const fs = require("node:fs");
const path = require("node:path");
const { readJson, writeJson } = require("../core/json");
const { runDir } = require("../core/run-store");
const { validatePngAsset } = require("../validation/png");

function copyFile(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function exportRun({ projectRoot, runId }) {
  const base = runDir(projectRoot, runId);
  const exportDir = path.join(base, "export");
  const manifest = readJson(path.join(base, "manifests", "asset_manifest.json"));
  fs.mkdirSync(exportDir, { recursive: true });

  for (const asset of manifest.assets) {
    const source = path.join(base, asset.output);
    validatePngAsset(source);
    copyFile(source, path.join(exportDir, asset.output));
  }

  const level = {
    schema: "art-pipeline-v2-level@main-flow",
    sceneId: manifest.sceneId,
    assets: manifest.assets.map((asset) => ({
      id: asset.id,
      path: asset.output,
      layer: asset.layer,
      anchor: { x: 0.5, y: 0.5 }
    }))
  };

  writeJson(path.join(exportDir, "level.json"), level);
  fs.writeFileSync(path.join(exportDir, "report.md"), `# Export Report\n\nAssets: ${manifest.assets.length}\n`, "utf8");
  return { exportDir, level };
}

module.exports = { exportRun };
