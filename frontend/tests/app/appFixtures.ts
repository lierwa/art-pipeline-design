export const loadedState = {
  source: {
    filename: "original.png",
    path: "source/original.png",
    width: 120,
    height: 90,
  },
  elements: [
    {
      id: "element_001",
      name: "Region 1",
      status: "accepted",
      mode: "visible_only",
      bbox: { x: 12, y: 16, w: 30, h: 32 },
      canvas: { x: 4, y: 8, w: 46, h: 48 },
      layer: 1,
      thumbnail: "elements/element_001/thumb.png",
      mask: null,
      parentId: null,
      source: "model_detection",
      sourceProvider: "test_provider",
      sourcePrompt: "Region 1",
      history: [],
      notes: "",
      visible: true,
      confidence: 0.84,
      mergedInto: null,
      exportParent: false,
    },
  ],
};

export const loadedStateWithoutElements = {
  source: loadedState.source,
  elements: [],
};

export function createGestureEvent(type: string, scale: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "scale", { value: scale });
  return event;
}

export const detectedElement = {
  ...loadedState.elements[0],
  id: "element_010",
  name: "cabinet",
  label: "cabinet",
  status: "model_detected",
  source: "model_detection",
  sourceProvider: "test_provider",
  sourcePrompt: "cabinet",
  history: [
    {
      kind: "model_detected",
      at: "2026-06-17T00:00:00+00:00",
      before: {},
      after: { status: "model_detected" },
    },
  ],
  mergedInto: null,
  exportParent: false,
};

export const detectedState = {
  source: loadedState.source,
  elements: [detectedElement],
};

export const partiallyReviewedState = {
  source: loadedState.source,
  elements: [
    loadedState.elements[0],
    {
      ...detectedElement,
      id: "element_011",
      name: "plant",
      label: "plant",
      bbox: { x: 52, y: 20, w: 18, h: 24 },
      canvas: { x: 48, y: 18, w: 24, h: 28 },
    },
  ],
};

export const createdManualElement = {
  id: "element_002",
  name: "Manual Lamp",
  status: "accepted",
  mode: "visible_only",
  bbox: { x: 20, y: 18, w: 24, h: 20 },
  canvas: { x: 12, y: 10, w: 40, h: 36 },
  layer: 2,
  thumbnail: "elements/element_002/thumb.png",
  mask: null,
  parentId: null,
  source: "manual",
  notes: "",
  visible: true,
  confidence: null,
};

export const createdChildElement = {
  id: "element_002",
  name: "Shelf Handle",
  label: "Shelf Handle",
  status: "child",
  mode: "visible_only",
  bbox: { x: 16, y: 20, w: 10, h: 12 },
  canvas: { x: 16, y: 20, w: 10, h: 12 },
  layer: 2,
  thumbnail: "elements/element_002/thumb.png",
  mask: null,
  parentId: "element_001",
  source: "manual_child",
  sourceProvider: "manual",
  sourcePrompt: "Shelf Handle",
  notes: "",
  visible: true,
  confidence: null,
  history: [],
  mergedInto: null,
  exportParent: false,
};

export const splitState = {
  source: loadedState.source,
  elements: [
    {
      ...loadedState.elements[0],
      status: "split_parent",
    },
    {
      id: "element_002",
      name: "Left Shelf",
      status: "accepted",
      mode: "visible_only",
      bbox: { x: 12, y: 16, w: 14, h: 32 },
      canvas: { x: 4, y: 8, w: 30, h: 48 },
      layer: 1,
      thumbnail: "elements/element_002/thumb.png",
      mask: null,
      parentId: "element_001",
      source: "split",
      notes: "",
      visible: true,
      confidence: null,
    },
    {
      id: "element_003",
      name: "Right Shelf",
      status: "accepted",
      mode: "visible_only",
      bbox: { x: 26, y: 16, w: 16, h: 32 },
      canvas: { x: 18, y: 8, w: 24, h: 48 },
      layer: 2,
      thumbnail: "elements/element_003/thumb.png",
      mask: null,
      parentId: "element_001",
      source: "split",
      notes: "",
      visible: true,
      confidence: null,
    },
  ],
};

export const mergeSourceState = {
  source: loadedState.source,
  elements: [
    loadedState.elements[0],
    {
      ...loadedState.elements[0],
      id: "element_002",
      name: "Region 2",
      bbox: { x: 48, y: 20, w: 18, h: 22 },
      canvas: { x: 44, y: 16, w: 26, h: 30 },
      layer: 2,
      thumbnail: "elements/element_002/thumb.png",
      confidence: 0.8,
    },
  ],
};

export const duplicateMergeNameState = {
  source: loadedState.source,
  elements: [
    {
      ...loadedState.elements[0],
      id: "element_001",
      name: "bottle + plant",
      label: "bottle + plant",
      status: "merged",
      confidence: null,
    },
    {
      ...loadedState.elements[0],
      id: "element_002",
      name: "bottle",
      label: "bottle",
      bbox: { x: 48, y: 20, w: 18, h: 22 },
      canvas: { x: 44, y: 16, w: 26, h: 30 },
      layer: 2,
      thumbnail: "elements/element_002/thumb.png",
      confidence: 0.8,
    },
    {
      ...loadedState.elements[0],
      id: "element_003",
      name: "plant",
      label: "plant",
      bbox: { x: 70, y: 20, w: 16, h: 20 },
      canvas: { x: 66, y: 16, w: 24, h: 28 },
      layer: 3,
      thumbnail: "elements/element_003/thumb.png",
      confidence: 0.72,
    },
  ],
};

export const overlappingMergeState = {
  source: loadedState.source,
  elements: [
    {
      ...loadedState.elements[0],
      id: "element_001",
      name: "basket",
      label: "basket",
      status: "model_detected",
      bbox: { x: 10, y: 10, w: 80, h: 70 },
      canvas: { x: 10, y: 10, w: 80, h: 70 },
      layer: 5,
      thumbnail: "elements/element_001/thumb.png",
    },
    {
      ...loadedState.elements[0],
      id: "element_002",
      name: "towel",
      label: "towel",
      status: "model_detected",
      bbox: { x: 45, y: 38, w: 30, h: 28 },
      canvas: { x: 45, y: 38, w: 30, h: 28 },
      layer: 1,
      thumbnail: "elements/element_002/thumb.png",
      confidence: 0.8,
    },
  ],
};

export const mergedState = {
  source: loadedState.source,
  elements: [
    {
      ...mergeSourceState.elements[0],
      visible: false,
      mergedInto: "element_003",
    },
    {
      ...mergeSourceState.elements[1],
      visible: false,
      mergedInto: "element_003",
    },
    {
      id: "element_003",
      name: "Fixture group",
      label: "Fixture group",
      status: "merged",
      mode: "visible_only",
      bbox: { x: 12, y: 16, w: 54, h: 32 },
      canvas: { x: 8, y: 12, w: 62, h: 40 },
      layer: 3,
      thumbnail: "elements/element_003/thumb.png",
      mask: null,
      parentId: null,
      source: "manual_merge",
      sourceProvider: "manual",
      sourcePrompt: "Fixture group",
      notes: "",
      visible: true,
      confidence: null,
      history: [
        {
          kind: "manual_merge",
          at: "2026-06-17T00:00:00+00:00",
          before: { sourceIds: ["element_001", "element_002"] },
          after: { status: "merged" },
        },
      ],
      mergedInto: null,
      exportParent: false,
    },
  ],
};

export const treeState = {
  source: loadedState.source,
  elements: [
    {
      ...detectedElement,
      id: "element_001",
      name: "cabinet",
      label: "cabinet",
      status: "edited",
      bbox: { x: 10, y: 10, w: 80, h: 90 },
      canvas: { x: 10, y: 10, w: 80, h: 90 },
      parentId: null,
      sourceProvider: "grounding_dino",
      sourcePrompt: "cabinet",
      confidence: 0.88,
      thumbnail: "elements/element_001/thumb.png",
    },
    {
      ...detectedElement,
      id: "element_002",
      name: "plant",
      label: "plant",
      status: "child",
      bbox: { x: 20, y: 20, w: 20, h: 20 },
      canvas: { x: 20, y: 20, w: 20, h: 20 },
      parentId: "element_001",
      source: "manual_child",
      sourceProvider: "manual",
      sourcePrompt: "plant",
      confidence: 0.86,
      thumbnail: "elements/element_002/thumb.png",
    },
    {
      ...detectedElement,
      id: "element_003",
      name: "old towel",
      label: "old towel",
      status: "model_detected",
      bbox: { x: 50, y: 50, w: 14, h: 14 },
      canvas: { x: 50, y: 50, w: 14, h: 14 },
      parentId: null,
      visible: false,
      mergedInto: "element_004",
      thumbnail: "elements/element_003/thumb.png",
    },
  ],
};

export const rejectedTreeState = {
  source: loadedState.source,
  elements: [
    {
      ...detectedElement,
      id: "element_020",
      name: "Rejected Vase",
      label: "Rejected Vase",
      status: "rejected",
      mode: "rejected",
      visible: false,
      thumbnail: "elements/element_020/thumb.png",
    },
  ],
};

export const legacyStatusRejectedState = {
  source: loadedState.source,
  elements: [
    {
      ...detectedElement,
      id: "element_021",
      name: "Legacy Reject",
      label: "Legacy Reject",
      status: "rejected",
      mode: "visible_only",
      visible: true,
      thumbnail: "elements/element_021/thumb.png",
    },
  ],
};

export const extractMergedState = {
  source: loadedState.source,
  elements: [
    {
      ...mergeSourceState.elements[0],
      status: "accepted",
      visible: false,
      mergedInto: "element_003",
    },
    {
      ...mergedState.elements[2],
      status: "accepted",
      segmentationStatus: "mask_accepted",
    },
  ],
};

export const extractedState = {
  source: loadedState.source,
  elements: [
    {
      ...loadedState.elements[0],
      status: "extracted",
      mask: "elements/element_001/mask.png",
      segmentationStatus: "mask_accepted",
    },
  ],
};

export const exportReadyState = {
  source: loadedState.source,
  elements: [
    {
      ...loadedState.elements[0],
      status: "extracted",
      mask: "elements/element_001/mask.png",
      segmentationStatus: "mask_accepted",
      exportStatus: "ready",
      sourceProvider: "codex_cli",
    },
  ],
};

export const exportSummary = {
  exportableCount: 1,
  blockedCount: 1,
  warnings: [
    "element_002 needs_completion is blocked until repair QA passes.",
  ],
  outputDir: "D:/work/art-pipeline-v2-demo/workspace/export",
  paths: {
    assetsDir: "export/assets",
    masksDir: "export/masks",
    manifest: "export/manifest.json",
    level: "export/level.json",
    contactSheet: "export/contact_sheet.png",
    qaReport: "export/qa_report.json",
  },
  exportedElements: [
    {
      elementId: "element_001",
      name: "Region 1",
      assetPath: "export/assets/element_001.png",
      maskPath: "export/masks/element_001.png",
      sourceAssetPath: "elements/element_001/asset_incomplete.png",
      warnings: [],
    },
  ],
  blockedElements: [
    {
      elementId: "element_002",
      name: "Gap",
      reason: "needs_completion_without_valid_repair",
    },
  ],
};

export const completionState = {
  source: loadedState.source,
  elements: [
    {
      ...loadedState.elements[0],
      status: "extracted",
      mode: "needs_completion",
      mask: "elements/element_001/mask.png",
    },
  ],
};

export const repairPendingState = {
  source: loadedState.source,
  elements: [
    {
      ...completionState.elements[0],
      status: "repair_pending",
    },
  ],
};

export const repairCompleteState = {
  source: loadedState.source,
  elements: [
    {
      ...completionState.elements[0],
      status: "repair_complete",
      mode: "completed_by_codex",
    },
  ],
};
