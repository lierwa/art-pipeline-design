export type CanvasObjectBox = {
  x: number;
  y: number;
  w: number;
  h: number;
  rotationDeg: number;
};

export type CanvasObjectView = {
  id: string;
  displayName: string;
  editableName: string;
  box: CanvasObjectBox;
  contentImageUrl?: string | null;
  thumbnailUrl: string | null;
  maskUrl: string | null;
  maskBox: CanvasObjectBox | null;
  isVisible: boolean;
  isLocked: boolean;
};

export type CanvasSurfaceCapabilities = {
  canDraw: boolean;
  canSplit: boolean;
  canClickDetect: boolean;
  canCreateChild: boolean;
  canRenameObjects: boolean;
  canUseMissingMask: boolean;
  canRotateObjects: boolean;
};

export const ART_PIPELINE_CANVAS_SURFACE_CAPABILITIES: CanvasSurfaceCapabilities = {
  canDraw: true,
  canSplit: true,
  canClickDetect: true,
  canCreateChild: true,
  canRenameObjects: true,
  canUseMissingMask: true,
  canRotateObjects: false,
};
