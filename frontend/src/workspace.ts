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
  bbox: Box;
  canvas: Box;
  layer: number;
  thumbnail: string | null;
  mask: string | null;
  parentId: string | null;
  source: string;
  sourceProvider: string | null;
  sourcePrompt: string | null;
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

export type CanvasTool = "select" | "draw" | "split" | "missing-mask";

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
    elements: payload.elements.map((element) => ({
      ...element,
      label: element.label ?? null,
      visible: element.visible ?? true,
      notes: element.notes ?? "",
      mode: element.mode ?? "visible_only",
      status: element.status ?? "proposal",
      thumbnail: element.thumbnail ?? null,
      mask: element.mask ?? null,
      parentId: element.parentId ?? null,
      confidence: element.confidence ?? null,
      sourceProvider: element.sourceProvider ?? null,
      sourcePrompt: element.sourcePrompt ?? null,
      history: element.history ?? [],
      mergedInto: element.mergedInto ?? null,
      exportParent: element.exportParent ?? false,
    })),
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
