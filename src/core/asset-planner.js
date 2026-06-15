function safeId(id) {
  return id.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function planAssets(sceneGraph) {
  return {
    schema: "art-pipeline-v2-asset-manifest@main-flow",
    sceneId: sceneGraph.sceneId,
    assets: sceneGraph.objects.map((object, index) => {
      const id = safeId(object.id);
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
