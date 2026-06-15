const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PNG } = require("pngjs");
const { writeJson } = require("../src/core/json");
const { validatePngAsset } = require("../src/validation/png");
const {
  writeFullyOpaquePng,
  writeFullyTransparentPng,
  writeRgbPng,
  writeSamplePng
} = require("./helpers/sample-png");
const { exportRun } = require("../src/export/level");

function readPngStats(filePath) {
  const png = PNG.sync.read(fs.readFileSync(filePath));
  let visiblePixels = 0;
  let coloredPixels = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] > 0) visiblePixels++;
    if (png.data[i] || png.data[i + 1] || png.data[i + 2]) coloredPixels++;
  }
  return { width: png.width, height: png.height, visiblePixels, coloredPixels };
}

function createRun(root, { runId = "demo", output = "assets/objects/cat.png", writeAsset = writeSamplePng } = {}) {
  const base = path.join(root, "runs", runId);
  fs.mkdirSync(path.join(base, "manifests"), { recursive: true });
  if (writeAsset) {
    writeAsset(path.resolve(base, output));
  }
  writeJson(path.join(base, "manifests", "asset_manifest.json"), {
    sceneId: "bathroom",
    assets: [{ id: "cat", output, layer: 10 }]
  });
  writeJson(path.join(base, "run.json"), {
    runId,
    stages: {
      export: "pending"
    }
  });
  return { base, runId };
}

test("exportRun writes level and copies generated PNG assets", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "export-run-"));
  createRun(root);

  const result = exportRun({ projectRoot: root, runId: "demo" });

  assert.ok(fs.existsSync(path.join(result.exportDir, "level.json")));
  assert.ok(fs.existsSync(path.join(result.exportDir, "assets", "objects", "cat.png")));
  assert.ok(fs.existsSync(path.join(result.exportDir, "contact_sheet.png")));
  assert.ok(fs.existsSync(path.join(result.exportDir, "composite_preview.png")));
  assert.ok(fs.existsSync(path.join(result.exportDir, "report.md")));
  for (const previewName of ["contact_sheet.png", "composite_preview.png"]) {
    const stats = readPngStats(path.join(result.exportDir, previewName));
    assert.ok(stats.width > 0, `${previewName} width`);
    assert.ok(stats.height > 0, `${previewName} height`);
    assert.ok(stats.visiblePixels > 0, `${previewName} visible pixels`);
    assert.ok(stats.coloredPixels > 0, `${previewName} colored pixels`);
  }
  const report = fs.readFileSync(path.join(result.exportDir, "report.md"), "utf8");
  assert.match(report, /Scene: bathroom/);
  assert.match(report, /Automatic validation: complete/);
  assert.match(report, /Human art review: pending/);
  assert.match(report, /\| cat \| assets\/objects\/cat\.png \| 32x32 \| 256 \| 768 \|/);

  const run = JSON.parse(fs.readFileSync(path.join(path.dirname(result.exportDir), "run.json"), "utf8"));
  assert.equal(run.stages.export, "complete");
});

test("exportRun recreates export directory before writing a fresh pack", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "export-clean-"));
  const { base } = createRun(root);
  const staleFile = path.join(base, "export", "stale.txt");
  fs.mkdirSync(path.dirname(staleFile), { recursive: true });
  fs.writeFileSync(staleFile, "old", "utf8");

  exportRun({ projectRoot: root, runId: "demo" });

  assert.equal(fs.existsSync(staleFile), false);
});

test("exportRun rejects traversal outputs before writing outside export", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "export-traversal-"));
  const output = "../outside.png";
  const { base } = createRun(root, { output });
  const outsideExportPath = path.join(base, "outside.png");

  let error = null;
  try {
    exportRun({ projectRoot: root, runId: "demo" });
  } catch (caught) {
    error = caught;
  }

  assert.equal(fs.existsSync(outsideExportPath), false);
  assert.ok(error);
  assert.match(error.message, /invalid asset output/);
});

test("exportRun rejects traversal hidden inside an allowed prefix", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "export-inner-traversal-"));
  const { base } = createRun(root, { output: "assets/objects/../outside.png" });
  const normalizedExportPath = path.join(base, "export", "assets", "outside.png");

  let error = null;
  try {
    exportRun({ projectRoot: root, runId: "demo" });
  } catch (caught) {
    error = caught;
  }

  assert.equal(fs.existsSync(normalizedExportPath), false);
  assert.ok(error);
  assert.match(error.message, /invalid asset output/);
});

test("exportRun rejects invalid manifest output values", () => {
  const invalidOutputs = [
    "assets\\objects\\cat.png",
    "assets/objects//cat.png",
    "assets/results/cat.png",
    "assets/objects/cat.jpg",
    "/assets/objects/cat.png",
    42
  ];

  for (const output of invalidOutputs) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "export-invalid-output-"));
    createRun(root, { output, writeAsset: null });
    assert.throws(
      () => exportRun({ projectRoot: root, runId: "demo" }),
      /invalid asset output/,
      `expected ${JSON.stringify(output)} to be rejected`
    );
  }
});

test("validate-assets CLI rejects unsafe manifest output paths", () => {
  const projectRoot = path.resolve(__dirname, "..");
  const runsDir = path.join(projectRoot, "runs");
  const hadRunsDir = fs.existsSync(runsDir);
  const runId = `cli-invalid-${process.pid}-${Date.now()}`;
  const base = path.join(runsDir, runId);
  const outsidePath = path.join(runsDir, `${runId}-outside.png`);
  try {
    fs.mkdirSync(path.join(base, "manifests"), { recursive: true });
    writeJson(path.join(base, "manifests", "asset_manifest.json"), {
      sceneId: "bathroom",
      assets: [{ id: "cat", output: `../${runId}-outside.png`, layer: 10 }]
    });

    const result = spawnSync(process.execPath, [path.join(projectRoot, "src", "cli", "validate-assets.js"), "--run", runId], {
      encoding: "utf8"
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /invalid asset output/);
    assert.equal(fs.existsSync(outsidePath), false);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
    fs.rmSync(outsidePath, { force: true });
    if (!hadRunsDir && fs.existsSync(runsDir) && fs.readdirSync(runsDir).length === 0) {
      fs.rmSync(runsDir, { recursive: true, force: true });
    }
  }
});

test("exportRun rejects fake or missing PNG assets", () => {
  const fakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "export-fake-png-"));
  createRun(fakeRoot, {
    writeAsset(filePath) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, "not a png", "utf8");
    }
  });

  assert.throws(() => exportRun({ projectRoot: fakeRoot, runId: "demo" }));

  const missingRoot = fs.mkdtempSync(path.join(os.tmpdir(), "export-missing-png-"));
  createRun(missingRoot, { writeAsset: null });

  assert.throws(() => exportRun({ projectRoot: missingRoot, runId: "demo" }), /ENOENT/);
});

test("validatePngAsset returns alpha and transparency metadata", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "validate-png-"));
  const filePath = path.join(root, "cat.png");
  writeSamplePng(filePath);

  assert.deepEqual(validatePngAsset(filePath), {
    width: 32,
    height: 32,
    visiblePixels: 256,
    transparentPixels: 768,
    hasAlpha: true
  });
});

test("validatePngAsset rejects transparent, RGB, and fully opaque PNGs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "validate-invalid-png-"));
  const transparent = path.join(root, "transparent.png");
  const rgb = path.join(root, "rgb.png");
  const opaque = path.join(root, "opaque.png");
  writeFullyTransparentPng(transparent);
  writeRgbPng(rgb);
  writeFullyOpaquePng(opaque);

  assert.throws(() => validatePngAsset(transparent), /too few visible pixels/);
  assert.throws(() => validatePngAsset(rgb), /alpha channel/);
  assert.throws(() => validatePngAsset(opaque), /transparent pixel/);
});
