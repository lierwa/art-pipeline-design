function safeId(id) {
  return id.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

const OUTPUT_DIR_BY_TYPE = Object.freeze({
  background: "assets/background",
  effect: "assets/effects",
  object: "assets/objects"
});

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function validateObject(object, index) {
  const field = `objects[${index}]`;
  if (!isObject(object)) throw new Error(`Invalid sceneGraph.${field}: expected object`);
  for (const name of ["id", "name", "grouping"]) {
    if (!isNonEmptyString(object[name])) {
      throw new Error(`Invalid sceneGraph.${field}.${name}: expected non-empty string`);
    }
  }
  if (!isObject(object.region)) throw new Error(`Invalid sceneGraph.${field}.region: expected object`);
  if (object.structureNotes !== undefined && !Array.isArray(object.structureNotes)) {
    throw new Error(`Invalid sceneGraph.${field}.structureNotes: expected array`);
  }
}

function inferAssetType(object, index) {
  if (object.type !== undefined) {
    const type = String(object.type).toLowerCase();
    if (Object.hasOwn(OUTPUT_DIR_BY_TYPE, type)) return type;
    throw new Error(`Invalid sceneGraph.objects[${index}].type: expected background, object, or effect`);
  }

  const hints = [
    object.layerHint,
    object.id,
    object.name,
    object.grouping
  ].filter(Boolean).join(" ").toLowerCase();

  if (hints.includes("background") || hints.includes("room_base") || hints.includes("room base")) {
    return "background";
  }
  if (hints.includes("static_effect") || hints.includes("static effect") || hints.includes("water_surface") || hints.includes("water surface") || hints.includes("effect")) {
    return "effect";
  }
  return "object";
}

function expectedSizeFromRegion(region) {
  if (region && region.type === "bbox" && Number.isFinite(region.w) && Number.isFinite(region.h)) {
    return { width: region.w, height: region.h };
  }
  return undefined;
}

function reviewPriorityFor(object, type) {
  const hints = [object.id, object.name, object.grouping].filter(Boolean).join(" ").toLowerCase();
  if (type === "background" || hints.includes("shower") || hints.includes("sink")) {
    return "high";
  }
  return "normal";
}

function planAssets(sceneGraph) {
  if (!isObject(sceneGraph)) throw new Error("Invalid sceneGraph: expected object");
  if (!isNonEmptyString(sceneGraph.sceneId)) {
    throw new Error("Invalid sceneGraph.sceneId: expected non-empty string");
  }
  if (!Array.isArray(sceneGraph.objects)) throw new Error("Invalid sceneGraph.objects: expected array");

  const seenIds = new Map();

  return {
    schema: "art-pipeline-v2-asset-manifest@main-flow",
    sceneId: sceneGraph.sceneId,
    assets: sceneGraph.objects.map((object, index) => {
      validateObject(object, index);
      const id = safeId(object.id);
      if (!id) throw new Error(`Invalid sceneGraph.objects[${index}].id: sanitized id is empty`);
      if (seenIds.has(id)) {
        throw new Error(`Duplicate sanitized asset id "${id}" for sceneGraph.objects[${index}].id; collides with sceneGraph.objects[${seenIds.get(id)}].id`);
      }
      seenIds.set(id, index);
      const type = inferAssetType(object, index);
      const outputDir = OUTPUT_DIR_BY_TYPE[type];

      const asset = {
        id,
        name: object.name,
        type,
        sourceObjectIds: [object.id],
        output: `${outputDir}/${id}.png`,
        sourceRegion: object.region,
        grouping: object.grouping,
        prompt: `Generate one transparent PNG of ${object.name}. Grouping: ${object.grouping}.`,
        negativePrompt: ["no UI", "no text", "no rectangular crop", ...(object.structureNotes || [])].join(", "),
        layer: 10 + index * 10,
        requiresAlpha: true,
        reviewPriority: reviewPriorityFor(object, type)
      };
      const expectedSize = expectedSizeFromRegion(object.region);
      if (expectedSize) asset.expectedSize = expectedSize;
      return asset;
    })
  };
}

module.exports = { planAssets };
