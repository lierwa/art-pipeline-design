import type { Box } from "../domain/workspace";

export type BoxEditHistorySnapshot = {
  elementId: string;
  bbox: Box;
};

export type AssetContextMenuState = {
  elementId: string;
  x: number;
  y: number;
};

export type CanvasFocusRequest = {
  elementId: string;
  sequence: number;
};

export type MergeDraft = {
  elementIds: string[];
  label: string;
};
