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
  | "proposal"
  | "accepted"
  | "split_parent"
  | "extract_ready"
  | "extracted"
  | "repair_pending"
  | "repair_complete"
  | "qa_failed"
  | "exported";

export type ElementMode =
  | "visible_only"
  | "needs_completion"
  | "completed_by_codex"
  | "rejected";

export type WorkspaceElement = {
  id: string;
  name: string;
  status: ElementStatus;
  mode: ElementMode;
  bbox: Box;
  canvas: Box;
  layer: number;
  thumbnail: string | null;
  mask: string | null;
  parentId: string | null;
  source: string;
  notes: string;
  visible: boolean;
  confidence?: number | null;
};

export type WorkspaceState = {
  source: SourceMetadata | null;
  elements: WorkspaceElement[];
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

export type CanvasTool = "select" | "draw" | "split" | "missing-mask";

export type DraftRegion = {
  bbox: Box;
};

export const EMPTY_STATE: WorkspaceState = {
  source: null,
  elements: [],
};

export const DEFAULT_OVERLAYS: OverlayState = {
  showBoxes: true,
  showNames: true,
  showThumbs: true,
  showMasks: false,
  showRejected: false,
};

export function thumbnailUrl(path: string | null): string | null {
  return workspaceAssetUrl(path);
}

export function workspaceAssetUrl(path: string | null, cacheKey?: number): string | null {
  if (!path) {
    return null;
  }
  const url = `/api/workspace/assets/${path}`;
  return cacheKey === undefined ? url : `${url}?cache=${cacheKey}`;
}

export function sourceCropUrl(element: WorkspaceElement, cacheKey?: number): string {
  const url = `/api/workspace/assets/elements/${element.id}/source_crop.png`;
  return cacheKey === undefined ? url : `${url}?cache=${cacheKey}`;
}

export function assetIncompleteUrl(element: WorkspaceElement, cacheKey?: number): string {
  const url = `/api/workspace/assets/elements/${element.id}/asset_incomplete.png`;
  return cacheKey === undefined ? url : `${url}?cache=${cacheKey}`;
}

export function missingMaskUrl(element: WorkspaceElement, cacheKey?: number): string {
  const url = `/api/workspace/assets/elements/${element.id}/missing_mask.png`;
  return cacheKey === undefined ? url : `${url}?cache=${cacheKey}`;
}

export function repairAssetUrl(
  element: WorkspaceElement,
  filename: string,
  cacheKey?: number,
): string {
  const url = `/api/workspace/assets/elements/${element.id}/repair/${filename}`;
  return cacheKey === undefined ? url : `${url}?cache=${cacheKey}`;
}

export function normalizeWorkspaceState(payload: WorkspaceState): WorkspaceState {
  return {
    source: payload.source,
    elements: payload.elements.map((element) => ({
      ...element,
      visible: element.visible ?? true,
      notes: element.notes ?? "",
      mode: element.mode ?? "visible_only",
      status: element.status ?? "proposal",
      thumbnail: element.thumbnail ?? null,
      mask: element.mask ?? null,
      parentId: element.parentId ?? null,
      confidence: element.confidence ?? null,
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

export function buildSourceUrl(cacheKey: number): string {
  return `/api/workspace/source?cache=${cacheKey}`;
}
