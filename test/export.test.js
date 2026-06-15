const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { writeJson } = require("../src/core/json");
const { writeSamplePng } = require("./helpers/sample-png");
const { exportRun } = require("../src/export/level");

test("exportRun writes level and copies generated PNG assets", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "export-run-"));
  const base = path.join(root, "runs", "demo");
  fs.mkdirSync(path.join(base, "assets", "objects"), { recursive: true });
  fs.mkdirSync(path.join(base, "manifests"), { recursive: true });
  writeSamplePng(path.join(base, "assets", "objects", "cat.png"));
  writeJson(path.join(base, "manifests", "asset_manifest.json"), {
    sceneId: "bathroom",
    assets: [{ id: "cat", output: "assets/objects/cat.png", layer: 10 }]
  });

  const result = exportRun({ projectRoot: root, runId: "demo" });

  assert.ok(fs.existsSync(path.join(result.exportDir, "level.json")));
  assert.ok(fs.existsSync(path.join(result.exportDir, "assets", "objects", "cat.png")));
  assert.ok(fs.existsSync(path.join(result.exportDir, "report.md")));
});
