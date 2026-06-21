import { act, createRef } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FloatingStageDrawer } from "../src/features/segment/FloatingStageDrawer";
import { PipelineRail } from "../src/app/components/PipelineRail";
import { SegmentEdgeBoard, type SegmentEdgeBoardHandle } from "../src/features/segment/SegmentEdgeBoard";
import { resolvePaletteSnap } from "../src/shared/hooks/useDockedPalette";
import type { ExportSummary, SourceMetadata, WorkflowStage, WorkspaceElement } from "../src/domain/workspace";
import { pipelineStage } from "./segmentWorkbenchHarness";

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
  workflowStage,
}: {
  source: SourceMetadata | null;
  elements: WorkspaceElement[];
  exportSummary: ExportSummary | null;
  canGoBack?: boolean;
  onGoBack?: () => void;
  workflowStage?: WorkflowStage;
}) {
  return render(
    <PipelineRail
      source={source}
      elements={elements}
      exportSummary={exportSummary}
      workflowStage={workflowStage}
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

describe("segment workbench building blocks 02", () => {
  it("auto-submits brush edits while keeping local undo and redo for the segment canvas", async () => {
    const boardRef = createRef<SegmentEdgeBoardHandle>();
    const historyChange = vi.fn();
    const patchMask = vi.fn();

    render(
      <SegmentEdgeBoard
        ref={boardRef}
        element={segmentElement}
        assetCacheKey={7}
        workspaceRunId="run_segment_001"
        onDraftHistoryChange={historyChange}
        onPatchMask={patchMask}
      />,
    );

    const sourceFrame = screen.getByTestId("segment-source-frame");
    fireEvent.click(within(sourceFrame).getByRole("button", { name: /brush add/i }));
    mockElementRect(sourceFrame, { left: 10, top: 20, width: 460, height: 480 });
    fireEvent.pointerDown(sourceFrame, { clientX: 210, clientY: 240, pointerId: 5 });
    fireEvent.pointerMove(sourceFrame, { clientX: 230, clientY: 250, pointerId: 5 });
    fireEvent.pointerUp(sourceFrame, { clientX: 230, clientY: 250, pointerId: 5 });
    expect(within(sourceFrame).getByTestId("segment-draft-mask-overlay")).toBeInTheDocument();
    await waitFor(() => {
      expect(historyChange).toHaveBeenLastCalledWith({
        canUndo: true,
        canRedo: false,
        hasDirtyDraft: false,
      });
      expect(patchMask).toHaveBeenCalledTimes(1);
    });
    act(() => {
      expect(boardRef.current?.undoDraft()).toBe(true);
    });
    await waitFor(() => {
      expect(historyChange).toHaveBeenLastCalledWith({
        canUndo: false,
        canRedo: true,
        hasDirtyDraft: false,
      });
      expect(patchMask).toHaveBeenCalledTimes(2);
    });
    act(() => {
      expect(boardRef.current?.redoDraft()).toBe(true);
    });
    await waitFor(() => {
      expect(historyChange).toHaveBeenLastCalledWith({
        canUndo: true,
        canRedo: false,
        hasDirtyDraft: false,
      });
      expect(patchMask).toHaveBeenCalledTimes(3);
    });
  });

  it("submits one brush drag as a single mask patch", async () => {
    const patchMask = vi.fn();

    render(
      <SegmentEdgeBoard
        element={segmentElement}
        assetCacheKey={7}
        workspaceRunId="run_segment_001"
        onPatchMask={patchMask}
      />,
    );

    const sourceFrame = screen.getByTestId("segment-source-frame");
    fireEvent.click(within(sourceFrame).getByRole("button", { name: /brush add/i }));
    mockElementRect(sourceFrame, { left: 10, top: 20, width: 460, height: 480 });
    fireEvent.pointerDown(sourceFrame, { clientX: 210, clientY: 240, pointerId: 6 });
    fireEvent.pointerMove(sourceFrame, { clientX: 220, clientY: 246, pointerId: 6 });
    fireEvent.pointerMove(sourceFrame, { clientX: 230, clientY: 252, pointerId: 6 });
    expect(patchMask).not.toHaveBeenCalled();
    fireEvent.pointerUp(sourceFrame, { clientX: 230, clientY: 252, pointerId: 6 });

    await waitFor(() => expect(patchMask).toHaveBeenCalledTimes(1));
  });

  it("zooms the source crop edit canvas by wheel and fit controls without changing the right previews", () => {
    render(
      <SegmentEdgeBoard
        element={segmentElement}
        assetCacheKey={7}
        workspaceRunId="run_segment_001"
        onPatchMask={vi.fn()}
      />,
    );

    const sourceFrame = screen.getByTestId("segment-source-frame");
    expect(sourceFrame).toHaveAttribute("data-view-scale", "1");

    fireEvent.click(within(sourceFrame).getByRole("button", { name: /zoom source crop in/i }));

    expect(sourceFrame).toHaveAttribute("data-view-scale", "1.25");
    expect(screen.getByRole("img", { name: /cabinet sam2 edge mask/i })).toBeInTheDocument();

    fireEvent.wheel(sourceFrame, { deltaY: -100, deltaMode: 0 });
    expect(Number(sourceFrame.getAttribute("data-view-scale"))).toBeGreaterThan(1.25);

    fireEvent.click(within(sourceFrame).getByRole("button", { name: /fit source crop/i }));

    expect(sourceFrame).toHaveAttribute("data-view-scale", "1");
  });

  it("uses dnd-kit for the mask tool palette and resolves nearest-edge snapping", () => {
    render(
      <SegmentEdgeBoard
        element={segmentElement}
        assetCacheKey={7}
        workspaceRunId="run_segment_001"
        onPatchMask={vi.fn()}
      />,
    );

    const sourceFrame = screen.getByTestId("segment-source-frame");
    const toolbar = within(sourceFrame).getByRole("toolbar", { name: /mask edit tools/i });
    const handle = within(toolbar).getByRole("button", { name: /move mask tools/i });

    expect(handle).toHaveAttribute("aria-describedby");
    expect(toolbar).toHaveAttribute("data-dragging", "false");
    expect(toolbar).toHaveAttribute("data-edge", "right");

    const rect = DOMRect.fromRect({ x: 10, y: 20, width: 460, height: 480 });
    const palette = { width: 160, height: 96 };
    expect(resolvePaletteSnap(rect, palette, 20, 230)).toEqual({ edge: "left", offset: 222 });
    expect(resolvePaletteSnap(rect, palette, 450, 230)).toEqual({ edge: "right", offset: 222 });
    expect(resolvePaletteSnap(rect, palette, 250, 30)).toEqual({ edge: "top", offset: 140 });
    expect(resolvePaletteSnap(rect, palette, 250, 480)).toEqual({ edge: "bottom", offset: 140 });
  });

  it("renders Upload, Detect, Mask, Generate and no legacy Repair or Export stage", () => {
    renderPipelineRail({
      source,
      elements: [segmentElement],
      exportSummary: null,
    });

    const rail = screen.getByRole("navigation", { name: /pipeline stages/i });
    const stageNames = Array.from(rail.querySelectorAll(".stage-copy strong")).map((stage) => stage.textContent);

    expect(stageNames).toEqual(["Upload", "Detect", "Mask", "Generate"]);
    expect(within(rail).queryByText("Review")).not.toBeInTheDocument();
    expect(within(rail).queryByText("Repair")).not.toBeInTheDocument();
    expect(within(rail).queryByText("Export")).not.toBeInTheDocument();
  });

  it("uses a single back-step button above the pipeline stages", () => {
    const goBack = vi.fn();
    renderPipelineRail({
      source,
      elements: [segmentElement],
      exportSummary: null,
      canGoBack: true,
      onGoBack: goBack,
    });

    const rail = screen.getByRole("navigation", { name: /pipeline stages/i });
    fireEvent.click(within(rail).getByRole("button", { name: /back step/i }));

    expect(goBack).toHaveBeenCalledTimes(1);
  });

  it("keeps unreviewed model detections in Detect instead of advancing Mask or Generate", () => {
    const unreviewedElement: WorkspaceElement = {
      ...segmentElement,
      status: "model_detected",
      mask: null,
      segmentationStatus: "not_started",
    };

    renderPipelineRail({
      source,
      elements: [unreviewedElement],
      exportSummary: null,
    });

    const rail = screen.getByRole("navigation", { name: /pipeline stages/i });
    expect(pipelineStage(rail, "Detect")).toHaveClass("is-active");
    expect(pipelineStage(rail, "Mask")).toHaveClass("is-pending");
    expect(pipelineStage(rail, "Generate")).toHaveClass("is-pending");
  });

  it("keeps exactly one pipeline stage active", () => {
    const mixedProgressElements: WorkspaceElement[] = [
      {
        ...segmentElement,
        id: "element_001",
        status: "extract_ready",
        mask: "elements/element_001/mask.png",
        segmentationStatus: "mask_accepted",
      },
      {
        ...segmentElement,
        id: "element_002",
        name: "Plant",
        label: "Plant",
        status: "accepted",
        mask: null,
      },
    ];

    const { container } = renderPipelineRail({
      source,
      elements: mixedProgressElements,
      exportSummary: null,
    });

    expect(container.querySelectorAll(".pipeline-stage.is-active")).toHaveLength(1);
  });

  it("does not advance Mask when SAM2 only suggested a mask", () => {
    renderPipelineRail({
      source,
      elements: [segmentElement],
      exportSummary: null,
    });

    const rail = screen.getByRole("navigation", { name: /pipeline stages/i });
    expect(within(rail).queryByText(/mask ready/i)).not.toBeInTheDocument();
    expect(within(rail).getByText(/1 asset needs masks/i)).toBeInTheDocument();
    expect(pipelineStage(rail, "Mask")).toHaveClass("is-active");
    expect(pipelineStage(rail, "Generate")).toHaveClass("is-pending");
  });

  it("does not advance Mask for legacy extracted or masked assets without accepted segmentation", () => {
    const legacyExtractedElement: WorkspaceElement = {
      ...segmentElement,
      status: "extracted",
      mask: "elements/element_001/bbox_alpha.png",
      segmentationStatus: "not_started",
    };

    renderPipelineRail({
      source,
      elements: [legacyExtractedElement],
      exportSummary: null,
    });

    const rail = screen.getByRole("navigation", { name: /pipeline stages/i });
    expect(within(rail).queryByText(/mask ready/i)).not.toBeInTheDocument();
    expect(within(rail).getByText(/1 asset needs masks/i)).toBeInTheDocument();
    expect(pipelineStage(rail, "Mask")).toHaveClass("is-active");
    expect(pipelineStage(rail, "Generate")).toHaveClass("is-pending");
  });

  it("moves to Generate after an exportable role accepts its segmentation mask", () => {
    const acceptedMaskElement: WorkspaceElement = {
      ...segmentElement,
      segmentationStatus: "mask_accepted",
    };

    renderPipelineRail({
      source,
      elements: [acceptedMaskElement],
      exportSummary: null,
    });

    const rail = screen.getByRole("navigation", { name: /pipeline stages/i });
    expect(within(rail).getByText(/1 mask ready/i)).toBeInTheDocument();
    expect(pipelineStage(rail, "Mask")).toHaveClass("is-done");
    expect(pipelineStage(rail, "Generate")).toHaveClass("is-active");
  });

  it("advances Generate after Codex final output is ready", () => {
    const generatedElement: WorkspaceElement = {
      ...segmentElement,
      status: "repair_complete",
      segmentationStatus: "mask_accepted",
      repairStatus: "repair_complete",
      exportStatus: "ready",
      sourceProvider: "codex_cli",
    };

    renderPipelineRail({
      source,
      elements: [generatedElement],
      exportSummary: null,
    });

    const rail = screen.getByRole("navigation", { name: /pipeline stages/i });
    expect(within(rail).getByText(/1 final generated/i)).toBeInTheDocument();
    expect(pipelineStage(rail, "Generate")).toHaveClass("is-active");
  });

  it("does not require embedded keep or skip roles to complete Mask", () => {
    const nonExportRoles: WorkspaceElement[] = [
      {
        ...segmentElement,
        id: "element_embedded_keep",
        assetRole: "embedded_keep",
        mask: null,
        segmentationStatus: "not_started",
      },
      {
        ...segmentElement,
        id: "element_skip",
        assetRole: "skip",
        mask: "elements/element_skip/bbox_alpha.png",
        segmentationStatus: "mask_suggested",
      },
    ];

    renderPipelineRail({
      source,
      elements: nonExportRoles,
      exportSummary: null,
      workflowStage: "generate",
    });

    const rail = screen.getByRole("navigation", { name: /pipeline stages/i });
    expect(within(rail).getByText(/no segment masks needed/i)).toBeInTheDocument();
    expect(pipelineStage(rail, "Mask")).toHaveClass("is-done");
    expect(pipelineStage(rail, "Generate")).toHaveClass("is-active");
  });

  it("renders a bottom overlay drawer over the canvas region", () => {
    render(
      <FloatingStageDrawer title="Segment">
        <p>Mask review content</p>
      </FloatingStageDrawer>,
    );

    const drawer = screen.getByRole("dialog", { name: /segment/i });
    expect(drawer).toHaveClass("floating-stage-drawer");
    expect(drawer).toHaveTextContent("Mask review content");
    expect(screen.getByRole("button", { name: /collapse segment drawer/i })).toBeInTheDocument();

    const resizeHandle = screen.getByRole("separator", { name: /resize segment drawer height/i });
    expect(resizeHandle).toHaveClass("floating-stage-drawer-resize-handle");
    expect(resizeHandle).toHaveAttribute("aria-orientation", "horizontal");
    expect(drawer.querySelector(".floating-stage-drawer-header")).not.toBeNull();
    expect(drawer.querySelector(".floating-stage-drawer-body")).not.toBeNull();
    expect((drawer as HTMLElement).style.getPropertyValue("--stage-drawer-height")).toBe("560px");
    expect((drawer as HTMLElement).style.getPropertyValue("--stage-drawer-width")).toBe("");
  });
});
