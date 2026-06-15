function safeId(id) {
  return id.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

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

      return {
        id,
        name: object.name,
        output: `assets/objects/${id}.png`,
        sourceRegion: object.region,
        grouping: object.grouping,
        prompt: `Generate one transparent PNG of ${object.name}. Grouping: ${object.grouping}.`,
        negativePrompt: ["no UI", "no text", "no rectangular crop", ...(object.structureNotes || [])].join(", "),
        layer: 10 + index * 10,
        requiresAlpha: true
      };
    })
  };
}

module.exports = { planAssets };
