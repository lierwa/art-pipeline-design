const test = require("node:test");
const assert = require("node:assert/strict");
const { planAssets } = require("../src/core/asset-planner");

test("planAssets preserves grouping and structure constraints", () => {
  const manifest = planAssets({
    sceneId: "bathroom",
    objects: [
      {
        id: "shower_column_with_tray",
        name: "Shower column with grouped product tray",
        grouping: "single fixture group",
        structureNotes: ["pipe must be continuous", "no recessed shelf"],
        region: { type: "bbox", x: 500, y: 100, w: 220, h: 380 }
      },
      {
        id: "sink_vanity",
        name: "Wall attached sink vanity",
        grouping: "single furniture",
        structureNotes: ["must touch wall"],
        region: { type: "bbox", x: 760, y: 610, w: 320, h: 260 }
      }
    ]
  });

  assert.equal(manifest.schema, "art-pipeline-v2-asset-manifest@main-flow");
  assert.equal(manifest.assets.length, 2);
  assert.equal(manifest.assets[0].output, "assets/objects/shower_column_with_tray.png");
  assert.match(manifest.assets[0].negativePrompt, /no recessed shelf/);
});
