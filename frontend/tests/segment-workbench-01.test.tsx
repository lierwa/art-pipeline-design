import { act, createRef } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FloatingStageDrawer } from "../src/features/segment/FloatingStageDrawer";
import { PipelineRail } from "../src/app/components/PipelineRail";
import { SegmentEdgeBoard, type SegmentEdgeBoardHandle } from "../src/features/segment/SegmentEdgeBoard";
import type { ExportSummary, SourceMetadata, WorkspaceElement } from "../src/domain/workspace";

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

describe("segment workbench building blocks 01", () => {
  it("renders source crop, SAM2 edge mask, transparent sticker, and final generation controls", () => {
    const acceptMask = vi.fn();
    const generateFinal = vi.fn();

    render(
      <SegmentEdgeBoard
        element={segmentElement}
        assetCacheKey={7}
        workspaceRunId="run_segment_001"
        onAcceptMask={acceptMask}
        onGenerateFinal={generateFinal}
      />,
    );

    expect(screen.getByRole("img", { name: /cabinet source crop/i })).toHaveAttribute(
      "src",
      "/api/workspace/assets/elements/element_001/sam2_edge/source_crop.png?cache=7&runId=run_segment_001",
    );
    expect(screen.getByRole("img", { name: /cabinet sam2 edge mask/i })).toHaveAttribute(
      "src",
      "/api/workspace/assets/elements/element_001/sam2_edge/mask.png?cache=7&runId=run_segment_001",
    );
    expect(screen.getByRole("img", { name: /cabinet transparent sticker/i })).toHaveAttribute(
      "src",
      "/api/workspace/assets/elements/element_001/sam2_edge/transparent_asset.png?cache=7&runId=run_segment_001",
    );

    expect(screen.getByRole("button", { name: /^accept mask$/i })).toHaveClass("primary-action");
    expect(screen.queryByRole("button", { name: /1 suggest mask/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /2 accept mask/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /3 generate final/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/mask edit x/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /advanced mask edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /sam2 quality diagnostics/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^accept mask$/i }));

    expect(acceptMask).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /^generate final$/i })).not.toBeInTheDocument();
    expect(generateFinal).not.toHaveBeenCalled();
  });

  it("renders the current mask as a pink background overlay on the source crop", () => {
    render(
      <SegmentEdgeBoard
        element={segmentElement}
        assetCacheKey={7}
        workspaceRunId="run_segment_001"
      />,
    );

    fireEvent.load(screen.getByRole("img", { name: /cabinet sam2 edge mask/i }));

    const sourceFrame = screen.getByTestId("segment-source-frame");
    expect(within(sourceFrame).getByTestId("segment-background-mask-overlay")).toHaveAttribute(
      "data-mask-display",
      "background",
    );
    expect(within(sourceFrame).getByTestId("segment-background-mask-overlay")).toHaveAttribute(
      "data-color",
      "quick-mask-pink",
    );
  });

  it("keeps not-started mask review from rendering missing SAM2 artifacts", () => {
    render(
      <SegmentEdgeBoard
        element={{
          ...segmentElement,
          mask: null,
          segmentationStatus: "not_started",
          segmentationQuality: null,
        }}
        assetCacheKey={7}
        workspaceRunId="run_segment_001"
      />,
    );

    const reviewStages = screen.getByRole("list", { name: /mask review stages/i });
    const previewSources = within(reviewStages)
      .queryAllByRole("img")
      .map((image) => image.getAttribute("src") ?? "");

    expect(within(reviewStages).getByText("Ready for mask")).toBeInTheDocument();
    expect(previewSources.some((source) => source.includes("/sam2_edge/"))).toBe(false);
    expect(within(reviewStages).getByText("Mask proposal")).toBeInTheDocument();
    expect(within(reviewStages).getByText("Sticker preview")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^accept mask$/i })).not.toBeInTheDocument();
  });

  it("renders a Codex final preview after generation completes", () => {
    render(
      <SegmentEdgeBoard
        element={{
          ...segmentElement,
          sourceProvider: "codex_cli",
          status: "repair_complete",
          repairStatus: "repair_complete",
          exportStatus: "ready",
        }}
        assetCacheKey={7}
        workspaceRunId="run_segment_001"
      />,
    );

    expect(screen.getByRole("img", { name: /cabinet codex final/i })).toHaveAttribute(
      "src",
      "/api/workspace/assets/elements/element_001/codex_final/transparent_asset.png?cache=7&runId=run_segment_001",
    );
  });

  it("does not expose legacy numeric rectangle mask controls in the review panel", () => {
    const patchMask = vi.fn();

    render(
      <SegmentEdgeBoard
        element={segmentElement}
        assetCacheKey={7}
        workspaceRunId="run_segment_001"
        onPatchMask={patchMask}
      />,
    );

    expect(screen.queryByRole("group", { name: /advanced mask edit/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/mask edit x/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add rectangle to mask/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /erase rectangle from mask/i })).not.toBeInTheDocument();
    expect(patchMask).not.toHaveBeenCalled();
  });

  it("auto-submits magic-wand additions as one mask delta", async () => {
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
    fireEvent.click(within(sourceFrame).getByRole("button", { name: /magic wand add/i }));
    mockElementRect(sourceFrame, { left: 10, top: 20, width: 460, height: 480 });
    fireEvent.click(sourceFrame, { clientX: 210, clientY: 240 });

    expect(within(sourceFrame).getByTestId("segment-draft-mask-overlay")).toHaveAttribute("data-mask-display", "background");
    expect(within(sourceFrame).getByTestId("segment-draft-mask-overlay")).toHaveAttribute("data-color", "quick-mask-pink");
    expect(within(sourceFrame).getByTestId("segment-selection-overlay")).toHaveAttribute("data-operation", "add");
    expect(within(sourceFrame).getByTestId("segment-selection-overlay")).toHaveAttribute("data-color", "quick-mask-pink");
    await waitFor(() => {
      expect(patchMask).toHaveBeenCalledWith("element_001", {
        operation: "replace",
        shape: expect.objectContaining({
          type: "mask_delta",
          coordinateSpace: "canvas",
          maskData: expect.stringMatching(/^data:image\/png;base64,/),
        }),
      });
    });
  });

  it("auto-submits magic-wand erases as one mask delta", async () => {
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
    fireEvent.click(within(sourceFrame).getByRole("button", { name: /magic wand subtract/i }));
    mockElementRect(sourceFrame, { left: 10, top: 20, width: 460, height: 480 });
    fireEvent.click(sourceFrame, { clientX: 110, clientY: 140 });

    expect(within(sourceFrame).getByTestId("segment-selection-overlay")).toHaveAttribute("data-operation", "subtract");
    await waitFor(() => {
      expect(patchMask).toHaveBeenCalledWith("element_001", {
        operation: "replace",
        shape: expect.objectContaining({
          type: "mask_delta",
          coordinateSpace: "canvas",
          maskData: expect.stringMatching(/^data:image\/png;base64,/),
        }),
      });
    });
  });

  it("previews brush edits while dragging and auto-submits once on release", async () => {
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
    fireEvent.change(within(sourceFrame).getByRole("slider", { name: /brush size/i }), {
      target: { value: "32" },
    });
    mockElementRect(sourceFrame, { left: 10, top: 20, width: 460, height: 480 });
    fireEvent.pointerDown(sourceFrame, { clientX: 210, clientY: 240, pointerId: 3 });
    fireEvent.pointerMove(sourceFrame, { clientX: 230, clientY: 250, pointerId: 3 });

    expect(patchMask).not.toHaveBeenCalled();
    expect(within(sourceFrame).getByTestId("segment-draft-mask-overlay")).toHaveAttribute("data-mask-display", "background");

    fireEvent.pointerUp(sourceFrame, { clientX: 230, clientY: 250, pointerId: 3 });

    expect(within(sourceFrame).getByText("32px")).toBeInTheDocument();
    expect(within(sourceFrame).getByTestId("segment-brush-cursor")).toHaveAttribute("data-size", "32");
    expect(within(sourceFrame).getByTestId("segment-brush-cursor")).toHaveAttribute("data-operation", "add");
    expect(within(sourceFrame).getByTestId("segment-draft-mask-overlay")).toHaveAttribute("data-mask-display", "background");
    expect(within(sourceFrame).getByTestId("segment-draft-mask-overlay")).toHaveAttribute("data-color", "quick-mask-pink");
    expect(within(sourceFrame).getByTestId("segment-selection-overlay")).toHaveAttribute("data-operation", "add");
    expect(within(sourceFrame).getByTestId("segment-selection-overlay")).toHaveAttribute("data-color", "quick-mask-pink");
    expect(screen.getByRole("img", { name: /cabinet draft sticker preview/i })).toHaveAttribute(
      "src",
      expect.stringMatching(/^data:image\/png;base64,/),
    );
    await waitFor(() => {
      expect(patchMask).toHaveBeenCalledTimes(1);
      expect(patchMask).toHaveBeenCalledWith("element_001", {
        operation: "replace",
        shape: expect.objectContaining({
          type: "mask_delta",
          coordinateSpace: "canvas",
          maskData: expect.stringMatching(/^data:image\/png;base64,/),
        }),
      });
    });
  });

  it("does not render apply or cancel buttons in the mask tool palette", () => {
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
    const toolbar = within(sourceFrame).getByRole("toolbar", { name: /mask edit tools/i });
    expect(within(toolbar).queryByRole("button", { name: /apply mask edits/i })).not.toBeInTheDocument();
    expect(within(toolbar).queryByRole("button", { name: /cancel mask edits/i })).not.toBeInTheDocument();
    expect(within(toolbar).queryByText(/brush size/i)).not.toBeInTheDocument();
    expect(patchMask).not.toHaveBeenCalled();
  });

  it("keeps SAM2 quality diagnostics out of the primary mask review", () => {
    render(
      <SegmentEdgeBoard
        element={segmentElement}
        assetCacheKey={7}
        workspaceRunId="run_segment_001"
      />,
    );

    expect(screen.queryByRole("group", { name: /sam2 quality diagnostics/i })).not.toBeInTheDocument();
    expect(screen.queryByText("detached_components_present")).not.toBeInTheDocument();
  });

  it("renders distinct compact mask tool buttons with a shared tool-value slider", () => {
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
    expect(within(toolbar).getByRole("button", { name: /magic wand add/i })).toHaveAttribute("data-tool", "wand-add");
    expect(within(toolbar).getByRole("button", { name: /magic wand subtract/i })).toHaveAttribute("data-tool", "wand-subtract");
    expect(within(toolbar).getByRole("button", { name: /brush add/i })).toHaveAttribute("data-tool", "brush-add");
    expect(within(toolbar).getByRole("button", { name: /brush erase/i })).toHaveAttribute("data-tool", "brush-subtract");
    expect(within(toolbar).getByRole("button", { name: /clean tiny mask fragments/i })).toHaveAttribute(
      "data-tool",
      "clean-fragments",
    );
    expect(within(toolbar).getByRole("slider", { name: /brush size/i })).toHaveValue("18");
    expect(within(toolbar).getByText("18px")).toBeInTheDocument();
    expect(within(toolbar).queryByText("Brush size")).not.toBeInTheDocument();
    expect(toolbar.querySelector(".segment-tool-badge")).not.toBeInTheDocument();

    fireEvent.click(within(toolbar).getByRole("button", { name: /magic wand add/i }));

    expect(within(toolbar).getByRole("slider", { name: /magic wand tolerance/i })).toHaveValue("28");
    expect(within(toolbar).getByText("T 28")).toBeInTheDocument();
    expect(within(toolbar).queryByText("Tolerance")).not.toBeInTheDocument();
  });

  it("uses bracket shortcuts to adjust the active mask tool value", () => {
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
    fireEvent.click(within(toolbar).getByRole("button", { name: /brush add/i }));

    fireEvent.keyDown(window, { code: "BracketRight", key: "]" });
    expect(within(toolbar).getByRole("slider", { name: /brush size/i })).toHaveValue("20");
    expect(within(toolbar).getByText("20px")).toBeInTheDocument();

    fireEvent.keyDown(window, { code: "BracketLeft", key: "[" });
    expect(within(toolbar).getByRole("slider", { name: /brush size/i })).toHaveValue("18");

    fireEvent.click(within(toolbar).getByRole("button", { name: /magic wand subtract/i }));
    fireEvent.keyDown(window, { code: "BracketRight", key: "]" });

    expect(within(toolbar).getByRole("slider", { name: /magic wand tolerance/i })).toHaveValue("30");
    expect(within(toolbar).getByText("T 30")).toBeInTheDocument();
  });

  it("shows a PS-style brush cursor before painting and outline-only selection feedback after painting", () => {
    render(
      <SegmentEdgeBoard
        element={segmentElement}
        assetCacheKey={7}
        workspaceRunId="run_segment_001"
        onPatchMask={vi.fn()}
      />,
    );

    const sourceFrame = screen.getByTestId("segment-source-frame");
    fireEvent.click(within(sourceFrame).getByRole("button", { name: /brush erase/i }));
    mockElementRect(sourceFrame, { left: 10, top: 20, width: 460, height: 480 });
    fireEvent.pointerMove(sourceFrame, { clientX: 210, clientY: 240, pointerId: 30 });

    expect(within(sourceFrame).getByTestId("segment-brush-cursor")).toHaveAttribute("data-cursor-style", "ps-ring");
    expect(within(sourceFrame).getByTestId("segment-brush-cursor")).toHaveAttribute("data-operation", "subtract");

    fireEvent.pointerDown(sourceFrame, { clientX: 210, clientY: 240, pointerId: 31 });

    expect(within(sourceFrame).getByTestId("segment-brush-cursor")).toHaveAttribute("data-cursor-style", "ps-ring");
    expect(within(sourceFrame).getByTestId("segment-brush-cursor")).toHaveAttribute("data-operation", "subtract");
    expect(within(sourceFrame).getByTestId("segment-selection-overlay")).toHaveAttribute("data-render", "outline");
  });
});
