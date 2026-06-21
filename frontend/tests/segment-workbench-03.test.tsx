import { act, createRef } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FloatingStageDrawer } from "../src/features/segment/FloatingStageDrawer";
import { PipelineRail } from "../src/app/components/PipelineRail";
import { SegmentEdgeBoard, type SegmentEdgeBoardHandle } from "../src/features/segment/SegmentEdgeBoard";
import type { ExportSummary, SourceMetadata, WorkspaceElement } from "../src/domain/workspace";
import { dispatchDrawerPointerEvent } from "./segmentWorkbenchHarness";

const segmentElement: WorkspaceElement = {
  id: "element_001",
  name: "Cabinet",
  label: "Cabinet",
  status: "accepted",
  mode: "visible_only",
  bbox: { x: 12, y: 16, w: 30, h: 32 },
  canvas: { x: 4, y: 8, w: 46, h: 48 },
  layer: 1,
  thumbnail: "elements/element_001/thumb.png",
  mask: "elements/element_001/mask.png",
  parentId: null,
  source: "model_detection",
  sourceProvider: "sam2",
  sourcePrompt: "Cabinet",
  assetRole: "sticker",
  removeFromParent: null,
  segmentationStatus: "mask_suggested",
  segmentationQuality: {
    selectedProfile: "base",
    candidateCount: 2,
    foregroundArea: 26045,
    detachedArea: 680,
    supportedDetachedArea: 40,
    unsupportedDetachedArea: 640,
    bboxOutsideArea: 0,
    bboxLateralGrowthArea: 0,
    bboxTopGrowthArea: 0,
    bboxBottomGrowthArea: 0,
    filledHoleCount: 1,
    filledHoleArea: 41,
    removedDetachedCount: 1,
    removedDetachedArea: 2,
    supportPointCount: 5,
    missedSupportPointCount: 1,
    qualityStatus: "warn",
    qualityReasons: ["detached_components_present"],
  },
  repairStatus: "not_required",
  exportStatus: "not_ready",
  notes: "",
  visible: true,
  confidence: 0.84,
  history: [],
  mergedInto: null,
  exportParent: false,
};

const source = {
  filename: "scene.png",
  path: "source/scene.png",
  width: 320,
  height: 180,
};

function renderPipelineRail({
  source,
  elements,
  exportSummary,
  canGoBack = false,
  onGoBack = vi.fn(),
}: {
  source: SourceMetadata | null;
  elements: WorkspaceElement[];
  exportSummary: ExportSummary | null;
  canGoBack?: boolean;
  onGoBack?: () => void;
}) {
  return render(
    <PipelineRail
      source={source}
      elements={elements}
      exportSummary={exportSummary}
      canGoBack={canGoBack}
      onGoBack={onGoBack}
    />,
  );
}

function mockElementRect(element: Element, rect: { left: number; top: number; width: number; height: number }) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    x: rect.left,
    y: rect.top,
    top: rect.top,
    left: rect.left,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    width: rect.width,
    height: rect.height,
    toJSON() {
      return {};
    },
  });
}

describe("segment workbench building blocks 03", () => {
  it("collapses the floating drawer into a bottom bar without closing the stage", () => {
    render(
      <FloatingStageDrawer title="Segment">
        <p>Mask review content</p>
      </FloatingStageDrawer>,
    );

    const drawer = screen.getByRole("dialog", { name: /segment/i });
    fireEvent.click(screen.getByRole("button", { name: /collapse segment drawer/i }));

    expect(drawer).toHaveClass("is-collapsed");
    expect(screen.queryByText("Mask review content")).not.toBeInTheDocument();
    expect(screen.queryByRole("separator", { name: /resize segment drawer height/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /expand segment drawer/i }));

    expect(drawer).not.toHaveClass("is-collapsed");
    expect(screen.getByText("Mask review content")).toBeInTheDocument();
  });

  it("resizes the floating drawer height by dragging its top handle", () => {
    render(
      <FloatingStageDrawer title="Segment" defaultHeight={360} minHeight={300} maxHeight={460}>
        <p>Mask review content</p>
      </FloatingStageDrawer>,
    );

    const drawer = screen.getByRole("dialog", { name: /segment/i }) as HTMLElement;
    const resizeHandle = screen.getByRole("separator", { name: /resize segment drawer height/i });

    dispatchDrawerPointerEvent(resizeHandle, "pointerdown", 500, 1);
    dispatchDrawerPointerEvent(resizeHandle, "pointermove", 460, 1);
    dispatchDrawerPointerEvent(resizeHandle, "pointerup", 460, 1);

    expect(drawer.style.getPropertyValue("--stage-drawer-height")).toBe("400px");
    expect(resizeHandle).toHaveAttribute("aria-valuenow", "400");
  });

  it("clamps floating drawer resize between its minimum and maximum height", () => {
    render(
      <FloatingStageDrawer title="Segment" defaultHeight={360} minHeight={320} maxHeight={420}>
        <p>Mask review content</p>
      </FloatingStageDrawer>,
    );

    const drawer = screen.getByRole("dialog", { name: /segment/i }) as HTMLElement;
    const resizeHandle = screen.getByRole("separator", { name: /resize segment drawer height/i });

    dispatchDrawerPointerEvent(resizeHandle, "pointerdown", 500, 1);
    dispatchDrawerPointerEvent(resizeHandle, "pointermove", 0, 1);
    dispatchDrawerPointerEvent(resizeHandle, "pointerup", 0, 1);

    expect(drawer.style.getPropertyValue("--stage-drawer-height")).toBe("420px");
    expect(resizeHandle).toHaveAttribute("aria-valuenow", "420");

    dispatchDrawerPointerEvent(resizeHandle, "pointerdown", 500, 2);
    dispatchDrawerPointerEvent(resizeHandle, "pointermove", 900, 2);
    dispatchDrawerPointerEvent(resizeHandle, "pointerup", 900, 2);

    expect(drawer.style.getPropertyValue("--stage-drawer-height")).toBe("320px");
    expect(resizeHandle).toHaveAttribute("aria-valuenow", "320");
  });
});
