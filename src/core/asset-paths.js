const path = require("node:path");

const ALLOWED_ASSET_OUTPUT_PREFIXES = Object.freeze([
  "assets/objects/",
  "assets/background/",
  "assets/effects/"
]);

function invalidAssetOutput(output, reason) {
  return new Error(`invalid asset output: ${reason}: ${JSON.stringify(output)}`);
}

function validateAssetOutput(output) {
  if (typeof output !== "string") {
    throw invalidAssetOutput(output, "expected a string");
  }
  if (output.length === 0) {
    throw invalidAssetOutput(output, "expected a non-empty path");
  }
  if (output.includes("\\")) {
    throw invalidAssetOutput(output, "expected a POSIX-style path");
  }
  if (path.posix.isAbsolute(output) || path.win32.isAbsolute(output)) {
    throw invalidAssetOutput(output, "absolute paths are not allowed");
  }
  if (!output.endsWith(".png")) {
    throw invalidAssetOutput(output, "expected a .png output");
  }
  if (!ALLOWED_ASSET_OUTPUT_PREFIXES.some((prefix) => output.startsWith(prefix))) {
    throw invalidAssetOutput(output, `expected one of ${ALLOWED_ASSET_OUTPUT_PREFIXES.join(", ")}`);
  }

  const segments = output.split("/");
  if (segments.some((segment) => segment.length === 0)) {
    throw invalidAssetOutput(output, "empty path segments are not allowed");
  }
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw invalidAssetOutput(output, "relative path segments are not allowed");
  }

  return output;
}

function assertPathInside(parentDir, targetPath, label) {
  const parent = path.resolve(parentDir);
  const target = path.resolve(targetPath);
  const relative = path.relative(parent, target);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes expected directory: ${target}`);
  }
  return target;
}

function resolveExportDir(runDirectory) {
  const exportDir = assertPathInside(runDirectory, path.resolve(runDirectory, "export"), "export directory");
  if (path.basename(exportDir) !== "export") {
    throw new Error(`export directory must be named export: ${exportDir}`);
  }
  return exportDir;
}

function resolveManifestAssetPaths({ runDirectory, exportDir, output }) {
  const safeOutput = validateAssetOutput(output);
  const segments = safeOutput.split("/");
  return {
    output: safeOutput,
    source: assertPathInside(runDirectory, path.resolve(runDirectory, ...segments), "asset source path"),
    exportTarget: assertPathInside(exportDir, path.resolve(exportDir, ...segments), "asset export path")
  };
}

module.exports = {
  ALLOWED_ASSET_OUTPUT_PREFIXES,
  resolveExportDir,
  resolveManifestAssetPaths,
  validateAssetOutput
};
