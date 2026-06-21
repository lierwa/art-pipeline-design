export type SourceMetadata = {
  filename: string;
  path: string;
  width: number;
  height: number;
};

export type Box = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ElementStatus =
  | "model_detected"
  | "click_detected"
  | "edited"
  | "child"
  | "merged"
  | "accepted"
  | "rejected"
  | "exported"
  | "proposal"
  | "split_parent"
  | "extract_ready"
  | "extracted"
  | "repair_pending"
  | "repair_complete"
  | "qa_failed";

export type ElementMode =
  | "visible_only"
  | "needs_completion"
  | "completed_by_codex"
  | "rejected";

export type AssetRole = "sticker" | "parent" | "removable_child" | "embedded_keep" | "skip";

export type SegmentationStatus =
  | "not_started"
  | "mask_suggested"
  | "mask_editing"
  | "mask_accepted"
  | "mask_rejected";

export type SegmentationQualityStatus = "pass" | "warn" | "fail";

export type SegmentationQuality = {
  selectedProfile: string;
  candidateCount: number;
  foregroundArea: number;
  detachedArea: number;
  supportedDetachedArea: number;
  unsupportedDetachedArea: number;
  bboxOutsideArea: number;
  bboxLateralGrowthArea: number;
  bboxTopGrowthArea: number;
  bboxBottomGrowthArea: number;
  filledHoleCount: number;
  filledHoleArea: number;
  removedDetachedCount: number;
  removedDetachedArea: number;
  supportPointCount: number;
  missedSupportPointCount: number;
  qualityStatus: SegmentationQualityStatus;
  qualityReasons: string[];
};

export type RepairStatus =
  | "not_required"
  | "required"
  | "task_created"
  | "redraw_pending"
  | "repair_complete"
  | "qa_failed";

export type ExportStatus = "not_ready" | "ready" | "exported" | "blocked";
export type GenerationProfile =
  | "sticker_completion"
  | "child_standalone"
  | "parent_inpaint_without_children";

export type CandidateHistoryEntry = {
  kind: string;
  at: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
};

export type WorkspaceElement = {
  id: string;
  name: string;
  label: string | null;
  status: ElementStatus;
  mode: ElementMode;
  assetRole: AssetRole;
  removeFromParent: string | null;
  segmentationStatus: SegmentationStatus;
  segmentationQuality: SegmentationQuality | null;
  repairStatus: RepairStatus;
  exportStatus: ExportStatus;
  bbox: Box;
  canvas: Box;
  layer: number;
  thumbnail: string | null;
  mask: string | null;
  parentId: string | null;
  source: string;
  sourceProvider: string | null;
  sourcePrompt: string | null;
  sourcePromptHint: string | null;
  generationProfile: GenerationProfile | null;
  notes: string;
  visible: boolean;
  confidence?: number | null;
  history: CandidateHistoryEntry[];
  mergedInto: string | null;
  exportParent: boolean;
};

export type WorkspaceState = {
  source: SourceMetadata | null;
  elements: WorkspaceElement[];
  detectionVocabulary: string[];
};

export type WorkflowStage = "upload" | "detect" | "mask" | "generate";

export type WorkflowTaskIds = {
  sam2MaskBatch?: string | null;
  codexFinalBatches: string[];
};

export type WorkflowStageSnapshots = {
  upload?: WorkspaceState | null;
  detect?: WorkspaceState | null;
  mask?: WorkspaceState | null;
};

export type WorkflowState = {
  stage: WorkflowStage;
  generateSelection: Record<string, boolean>;
  generatePromptHints: Record<string, string>;
  stageSnapshots: WorkflowStageSnapshots;
  taskIds: WorkflowTaskIds;
  lastExportSummary?: ExportSummary | null;
};

export type WorkspaceRunSummary = {
  id: string;
  title: string;
  sourceFilename: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  elementCount: number;
};

export type WorkspaceRunsResponse = {
  runs: WorkspaceRunSummary[];
};

export type CreateWorkspaceRunResponse = {
  run: WorkspaceRunSummary;
  state: WorkspaceState;
};

export type OverlayState = {
  showBoxes: boolean;
  showNames: boolean;
  showThumbs: boolean;
  showMasks: boolean;
  showRejected: boolean;
};

export type ElementEditorDraft = {
  name: string;
  mode: ElementMode;
  layer: string;
  bbox: {
    x: string;
    y: string;
    w: string;
    h: string;
  };
  canvas: {
    x: string;
    y: string;
    w: string;
    h: string;
  };
  notes: string;
  visible: boolean;
};

export type MissingMaskDraft = {
  x: string;
  y: string;
  w: string;
  h: string;
};

export type RepairQaStatus = "pass" | "warn" | "fail";

export type RepairQaReport = {
  elementId: string;
  status: RepairQaStatus;
  reasons: string[];
  warnings: string[];
  metrics: {
    totalPixels: number;
    missingMaskPixels: number;
    changedPixels: number;
    insideMissingChangedPixels: number;
    outsideMissingChangedPixels: number;
    preserveChangedPixels: number;
    missingAreaRatio: number;
    changedAreaRatio: number;
  };
  reportPath: string;
  changedPixelsOverlayPath: string | null;
};

export type RepairMetadata = {
  elementId: string;
  files: {
    missingMask: boolean;
    repairPackage: boolean;
    completedAsset: boolean;
    repairReport: boolean;
    qaReport: boolean;
    changedPixelsOverlay: boolean;
    [key: string]: boolean;
  };
  paths: {
    missingMaskPath: string | null;
    completedAssetPath: string | null;
    repairReportPath: string | null;
    qaReportPath: string | null;
    changedPixelsOverlayPath: string | null;
  };
  qaReport: RepairQaReport | null;
};

export type ExportedElementSummary = {
  elementId: string;
  name: string;
  assetPath: string;
  maskPath: string;
  sourceAssetPath: string;
  warnings: string[];
};

export type BlockedExportElement = {
  elementId: string;
  name: string;
  reason: string;
};

export type ExportSummary = {
  exportableCount: number;
  blockedCount: number;
  warnings: string[];
  outputDir: string;
  paths: {
    assetsDir: string;
    masksDir: string;
    manifest: string;
    level: string;
    contactSheet: string;
    qaReport: string;
  };
  exportedElements: ExportedElementSummary[];
  blockedElements: BlockedExportElement[];
};

export type CanvasTool = "select" | "draw" | "split" | "missing-mask" | "click-detect";

export type DraftRegion = {
  bbox: Box;
};

export type ElementSelectionMode = "replace" | "toggle" | "focus";

export type ElementSelectionOptions = {
  focusCanvas?: boolean;
};

export type SelectedElementIds = string[];

export const EMPTY_STATE: WorkspaceState = {
  source: null,
  elements: [],
  detectionVocabulary: [],
};

export const DEFAULT_OVERLAYS: OverlayState = {
  showBoxes: true,
  showNames: true,
  showThumbs: false,
  showMasks: false,
  showRejected: false,
};

export function thumbnailUrl(
  path: string | null,
  cacheKey?: number,
  runId?: string | null,
): string | null {
  return workspaceAssetUrl(path, cacheKey, runId);
}

export function workspaceAssetUrl(
  path: string | null,
  cacheKey?: number,
  runId?: string | null,
): string | null {
  if (!path) {
    return null;
  }
  const url = `/api/workspace/assets/${path}`;
  return appendWorkspaceQuery(url, { cacheKey, runId });
}

export function sourceCropUrl(
  element: WorkspaceElement,
  cacheKey?: number,
  runId?: string | null,
): string {
  const url = `/api/workspace/assets/elements/${element.id}/source_crop.png`;
  return appendWorkspaceQuery(url, { cacheKey, runId });
}

export function assetIncompleteUrl(
  element: WorkspaceElement,
  cacheKey?: number,
  runId?: string | null,
): string {
  const url = `/api/workspace/assets/elements/${element.id}/asset_incomplete.png`;
  return appendWorkspaceQuery(url, { cacheKey, runId });
}

export function sam2EdgeArtifactUrls(
  element: WorkspaceElement,
  cacheKey?: number,
  runId?: string | null,
): { sourceCropUrl: string | null; maskUrl: string | null; transparentAssetUrl: string | null } {
  // WHY: backend SAM2 输出集中在 sam2_edge stage；UI 只从这里投影 URL，避免组件继续拼 legacy 文件名。
  const base = `elements/${element.id}/sam2_edge`;
  return {
    sourceCropUrl: workspaceAssetUrl(`${base}/source_crop.png`, cacheKey, runId),
    maskUrl: workspaceAssetUrl(`${base}/mask.png`, cacheKey, runId),
    transparentAssetUrl: workspaceAssetUrl(`${base}/transparent_asset.png`, cacheKey, runId),
  };
}

export function missingMaskUrl(
  element: WorkspaceElement,
  cacheKey?: number,
  runId?: string | null,
): string {
  const url = `/api/workspace/assets/elements/${element.id}/missing_mask.png`;
  return appendWorkspaceQuery(url, { cacheKey, runId });
}

export function repairAssetUrl(
  element: WorkspaceElement,
  filename: string,
  cacheKey?: number,
  runId?: string | null,
): string {
  const url = `/api/workspace/assets/elements/${element.id}/repair/${filename}`;
  return appendWorkspaceQuery(url, { cacheKey, runId });
}

export function normalizeWorkspaceState(payload: WorkspaceState): WorkspaceState {
  return {
    source: payload.source,
    detectionVocabulary: payload.detectionVocabulary ?? [],
    elements: payload.elements.map((element) => ({
      ...element,
      label: element.label ?? null,
      visible: element.visible ?? true,
      notes: element.notes ?? "",
      mode: element.mode ?? "visible_only",
      status: element.status ?? "proposal",
      assetRole: element.assetRole ?? "sticker",
      removeFromParent: element.removeFromParent ?? null,
      segmentationStatus: element.segmentationStatus ?? "not_started",
      segmentationQuality: normalizeSegmentationQuality(element.segmentationQuality),
      repairStatus: element.repairStatus ?? "not_required",
      exportStatus: element.exportStatus ?? "not_ready",
      thumbnail: element.thumbnail ?? null,
      mask: element.mask ?? null,
      parentId: element.parentId ?? null,
      confidence: element.confidence ?? null,
      sourceProvider: element.sourceProvider ?? null,
      sourcePrompt: element.sourcePrompt ?? null,
      sourcePromptHint: element.sourcePromptHint ?? null,
      generationProfile: element.generationProfile ?? null,
      history: element.history ?? [],
      mergedInto: element.mergedInto ?? null,
      exportParent: element.exportParent ?? false,
    })),
  };
}

function normalizeSegmentationQuality(
  quality: WorkspaceElement["segmentationQuality"],
): SegmentationQuality | null {
  if (!quality) {
    return null;
  }
  return {
    ...quality,
    supportedDetachedArea: quality.supportedDetachedArea ?? 0,
    unsupportedDetachedArea: quality.unsupportedDetachedArea ?? quality.detachedArea ?? 0,
    bboxOutsideArea: quality.bboxOutsideArea ?? 0,
    bboxLateralGrowthArea: quality.bboxLateralGrowthArea ?? 0,
    bboxTopGrowthArea: quality.bboxTopGrowthArea ?? 0,
    bboxBottomGrowthArea: quality.bboxBottomGrowthArea ?? 0,
    supportPointCount: quality.supportPointCount ?? 0,
    missedSupportPointCount: quality.missedSupportPointCount ?? 0,
    qualityStatus: quality.qualityStatus ?? "pass",
    qualityReasons: quality.qualityReasons ?? [],
  };
}

export function codexFinalArtifactUrls(
  element: WorkspaceElement,
  cacheKey?: number,
  runId?: string | null,
): { sourceCropUrl: string | null; transparentAssetUrl: string | null } {
  // WHY: Codex final 是后续导出的正式贴图；统一从这里投影 URL，避免 UI 多处硬编码 stage 路径。
  const base = `elements/${element.id}/codex_final`;
  return {
    sourceCropUrl: workspaceAssetUrl(`${base}/source_crop.png`, cacheKey, runId),
    transparentAssetUrl: workspaceAssetUrl(`${base}/transparent_asset.png`, cacheKey, runId),
  };
}

export function updateElement(
  elements: WorkspaceElement[],
  elementId: string,
  updater: (element: WorkspaceElement) => WorkspaceElement,
): WorkspaceElement[] {
  return elements.map((element) => (element.id === elementId ? updater(element) : element));
}

export function workspaceApiUrl(path: string, runId?: string | null): string {
  return appendWorkspaceQuery(path, { runId });
}

export function buildSourceUrl(cacheKey: number, runId?: string | null): string {
  return appendWorkspaceQuery("/api/workspace/source", { cacheKey, runId });
}

function appendWorkspaceQuery(
  url: string,
  {
    cacheKey,
    runId,
  }: {
    cacheKey?: number;
    runId?: string | null;
  },
): string {
  const params = new URLSearchParams();
  if (cacheKey !== undefined) {
    params.set("cache", String(cacheKey));
  }
  if (runId) {
    params.set("runId", runId);
  }
  const query = params.toString();
  if (!query) {
    return url;
  }
  return `${url}${url.includes("?") ? "&" : "?"}${query}`;
}
