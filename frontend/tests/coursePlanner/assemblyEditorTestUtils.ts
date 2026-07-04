import { vi } from "vitest";

import type { AssemblyEditorShapeLike } from "../../src/features/coursePlanner/components/AssemblyEditorCanvas";

export function layerLabels(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>(".assembly-layer-row"))
    .map((button) => {
      const label = button.querySelector<HTMLSpanElement>(".assembly-layer-row-label > span:last-child");
      return normalizeLayerRowLabel(label?.textContent ?? button.textContent ?? "");
    })
    .filter((label) => (
      label.startsWith("Breakfast bowl") ||
      label.startsWith("Cleanup cloth") ||
      label.startsWith("Breakfast props") ||
      label.startsWith("Group 1")
    ));
}

export function createMockAssemblyEditor(input?: {
  selectedShapes?: AssemblyEditorShapeLike[];
}) {
  const selectedShapes = input?.selectedShapes ?? [];
  const selectedShapeIds = new Set(selectedShapes.map((shape) => shape.id));

  return {
    createAssets: vi.fn(),
    createShapes: vi.fn(),
    deleteAssets: vi.fn(),
    deleteShapes: vi.fn(),
    getAssets: vi.fn(() => []),
    getCurrentPageShapes: vi.fn(() => []),
    getSelectedShapeIds: vi.fn(() => selectedShapeIds),
    getSelectedShapes: vi.fn(() => selectedShapes),
    run: vi.fn((callback: () => void) => callback()),
    select: vi.fn((shapeId: string) => {
      selectedShapeIds.clear();
      selectedShapeIds.add(shapeId);
    }),
    selectNone: vi.fn(() => {
      selectedShapeIds.clear();
    }),
    zoomToBounds: vi.fn(),
  };
}

function normalizeLayerRowLabel(label: string) {
  return label
    .replace(/[▾▸·]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
