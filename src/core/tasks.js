function buildSceneAnalysisTask({ runId }) {
  return `Analyze runs/${runId}/source/source.png.

Write runs/${runId}/analysis/scene_graph.json.

Return objects with id, name, bbox region, grouping, structureNotes.
Respect config/style_guide.md.
Do not over-split tiny decoration items.
Flag bad structures such as disconnected shower plumbing or sink vanities not attached to a wall.
`;
}

function buildAssetTask({ runId, asset }) {
  return `Generate one clean transparent PNG for asset ${asset.id}.

Output: runs/${runId}/${asset.output}
Prompt: ${asset.prompt}
Negative prompt: ${asset.negativePrompt}

Also write runs/${runId}/assets/results/${asset.id}.json with status and notes.
`;
}

module.exports = { buildSceneAnalysisTask, buildAssetTask };
