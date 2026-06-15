const fs = require("node:fs");
const path = require("node:path");
const { readJson, writeJson } = require("../core/json");
const { runDir } = require("../core/run-store");
const { resolveExportDir, resolveManifestAssetPaths } = require("../core/asset-paths");
const { validatePngAsset } = require("../validation/png");

function copyFile(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function resetExportDir(exportDir) {
  fs.rmSync(exportDir, { recursive: true, force: true });
  fs.mkdirSync(exportDir, { recursive: true });
}

function tableCell(value) {
  return String(value).replace(/\|/g, "\\|");
}

function buildReport(sceneId, assets) {
  const lines = [
    "# Export Report",
    "",
    `Scene: ${sceneId}`,
    "",
    `Assets: ${assets.length}`,
    "",
    "| Asset ID | Output | Dimensions | Visible Pixels | Transparent Pixels |",
    "| --- | --- | ---: | ---: | ---: |"
  ];
  for (const asset of assets) {
    lines.push(
      `| ${tableCell(asset.asset.id)} | ${tableCell(asset.output)} | ${asset.png.width}x${asset.png.height} | ${asset.png.visiblePixels} | ${asset.png.transparentPixels} |`
    );
  }
  return `${lines.join("\n")}\n`;
}

function exportRun({ projectRoot, runId }) {
  const base = runDir(projectRoot, runId);
  const exportDir = resolveExportDir(base);
  const manifest = readJson(path.join(base, "manifests", "asset_manifest.json"));
  const assets = manifest.assets.map((asset) => {
    const paths = resolveManifestAssetPaths({ runDirectory: base, exportDir, output: asset.output });
    return { asset, ...paths, png: validatePngAsset(paths.source) };
  });

  resetExportDir(exportDir);
  for (const asset of assets) {
    copyFile(asset.source, asset.exportTarget);
  }

  const level = {
    schema: "art-pipeline-v2-level@main-flow",
    sceneId: manifest.sceneId,
    assets: assets.map(({ asset, output }) => ({
      id: asset.id,
      path: output,
      layer: asset.layer,
      anchor: { x: 0.5, y: 0.5 }
    }))
  };

  writeJson(path.join(exportDir, "level.json"), level);
  fs.writeFileSync(path.join(exportDir, "report.md"), buildReport(manifest.sceneId, assets), "utf8");
  return { exportDir, level };
}

module.exports = { exportRun };
