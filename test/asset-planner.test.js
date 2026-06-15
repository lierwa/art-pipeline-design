const test = require("node:test");
const assert = require("node:assert/strict");
const { planAssets } = require("../src/core/asset-planner");

function object(overrides = {}) {
  return {
    id: "sink_vanity",
    name: "Wall attached sink vanity",
    grouping: "single furniture",
    structureNotes: ["must touch wall"],
    region: { type: "bbox", x: 760, y: 610, w: 320, h: 260 },
    ...overrides
  };
}

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

test("planAssets rejects duplicate sanitized asset ids", () => {
  assert.throws(
    () => planAssets({
      sceneId: "bathroom",
      objects: [
        object({ id: "sink vanity" }),
        object({ id: "sink-vanity", name: "Alternate sink vanity" })
      ]
    }),
    /duplicate.*id.*sink_vanity/i
  );
});

test("planAssets rejects invalid scene graph shape with field errors", () => {
  for (const [description, sceneGraph, expected] of [
    ["sceneGraph", null, /sceneGraph/],
    ["sceneId", { sceneId: "", objects: [object()] }, /sceneId/],
    ["objects", { sceneId: "bathroom" }, /objects/],
    ["object id", { sceneId: "bathroom", objects: [object({ id: "" })] }, /objects\[0\]\.id/],
    ["object name", { sceneId: "bathroom", objects: [object({ name: "" })] }, /objects\[0\]\.name/],
    ["object grouping", { sceneId: "bathroom", objects: [object({ grouping: "" })] }, /objects\[0\]\.grouping/],
    ["object region", { sceneId: "bathroom", objects: [object({ region: null })] }, /objects\[0\]\.region/],
    ["structureNotes", { sceneId: "bathroom", objects: [object({ structureNotes: "must touch wall" })] }, /objects\[0\]\.structureNotes/]
  ]) {
    assert.throws(
      () => planAssets(sceneGraph),
      expected,
      description
    );
  }
});

test("planAssets rejects ids with empty sanitized asset ids", () => {
  assert.throws(
    () => planAssets({
      sceneId: "bathroom",
      objects: [object({ id: "!!!" })]
    }),
    /objects\[0\]\.id/
  );
});
