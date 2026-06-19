import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FloatingStageDrawer } from "../src/components/FloatingStageDrawer";
import { PipelineRail } from "../src/components/PipelineRail";
import { SegmentEdgeBoard } from "../src/components/SegmentEdgeBoard";
import type { WorkspaceElement } from "../src/workspace";

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

describe("segment workbench building blocks", () => {
  it("renders source crop, SAM2 edge mask, transparent sticker, and accept mask controls", () => {
    const suggestMask = vi.fn();
    const acceptMask = vi.fn();

    render(
      <SegmentEdgeBoard
        element={segmentElement}
        assetCacheKey={7}
        workspaceRunId="run_segment_001"
        onSuggestMask={suggestMask}
        onAcceptMask={acceptMask}
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

    fireEvent.click(screen.getByRole("button", { name: /suggest mask/i }));
    fireEvent.click(screen.getByRole("button", { name: /accept mask/i }));

    expect(suggestMask).toHaveBeenCalledTimes(1);
    expect(acceptMask).toHaveBeenCalledTimes(1);
  });

  it("renders manual rectangle mask controls and emits patch payloads", () => {
    const patchMask = vi.fn();

    render(
      <SegmentEdgeBoard
        element={segmentElement}
        assetCacheKey={7}
        workspaceRunId="run_segment_001"
        onPatchMask={patchMask}
      />,
    );

    expect(screen.getByRole("group", { name: /manual mask edit/i })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/mask edit x/i), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText(/mask edit y/i), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText(/mask edit width/i), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText(/mask edit height/i), { target: { value: "9" } });

    fireEvent.click(screen.getByRole("button", { name: /apply include rectangle/i }));

    expect(patchMask).toHaveBeenCalledWith("element_001", {
      shape: {
        type: "rectangle",
        coordinateSpace: "canvas",
        bbox: { x: 2, y: 3, w: 12, h: 9 },
      },
    });
  });

  it("renders Upload, Detect, Segment, Repair, Export and no Review stage", () => {
    render(
      <PipelineRail
        source={source}
        elements={[segmentElement]}
        exportSummary={null}
      />,
    );

    const rail = screen.getByRole("navigation", { name: /pipeline stages/i });
    const stageNames = Array.from(rail.querySelectorAll(".stage-copy strong")).map((stage) => stage.textContent);

    expect(stageNames).toEqual(["Upload", "Detect", "Segment", "Repair", "Export"]);
    expect(within(rail).queryByText("Review")).not.toBeInTheDocument();
  });

  it("keeps unreviewed model detections in Detect instead of advancing Segment or Export", () => {
    const unreviewedElement: WorkspaceElement = {
      ...segmentElement,
      status: "model_detected",
      mask: null,
      segmentationStatus: "not_started",
    };

    render(
      <PipelineRail
        source={source}
        elements={[unreviewedElement]}
        exportSummary={null}
      />,
    );

    const rail = screen.getByRole("navigation", { name: /pipeline stages/i });
    expect(within(rail).queryByText(/no segment masks needed/i)).not.toBeInTheDocument();
    expect(pipelineStage(rail, "Detect")).toHaveClass("is-active");
    expect(pipelineStage(rail, "Segment")).toHaveClass("is-pending");
    expect(pipelineStage(rail, "Repair")).toHaveClass("is-pending");
    expect(pipelineStage(rail, "Export")).toHaveClass("is-pending");
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

    const { container } = render(
      <PipelineRail
        source={source}
        elements={mixedProgressElements}
        exportSummary={null}
      />,
    );

    expect(container.querySelectorAll(".pipeline-stage.is-active")).toHaveLength(1);
  });

  it("does not advance Segment when SAM2 only suggested a mask", () => {
    render(
      <PipelineRail
        source={source}
        elements={[segmentElement]}
        exportSummary={null}
      />,
    );

    const rail = screen.getByRole("navigation", { name: /pipeline stages/i });
    expect(within(rail).queryByText(/mask ready/i)).not.toBeInTheDocument();
    expect(within(rail).getByText(/1 accepted asset needs masks/i)).toBeInTheDocument();
    expect(within(rail).getByText(/await masks/i)).toBeInTheDocument();
    expect(pipelineStage(rail, "Segment")).toHaveClass("is-active");
    expect(pipelineStage(rail, "Repair")).toHaveClass("is-pending");
  });

  it("does not advance Segment for legacy extracted or masked assets without accepted segmentation", () => {
    const legacyExtractedElement: WorkspaceElement = {
      ...segmentElement,
      status: "extracted",
      mask: "elements/element_001/bbox_alpha.png",
      segmentationStatus: "not_started",
    };

    render(
      <PipelineRail
        source={source}
        elements={[legacyExtractedElement]}
        exportSummary={null}
      />,
    );

    const rail = screen.getByRole("navigation", { name: /pipeline stages/i });
    expect(within(rail).queryByText(/mask ready/i)).not.toBeInTheDocument();
    expect(within(rail).getByText(/1 accepted asset needs masks/i)).toBeInTheDocument();
    expect(pipelineStage(rail, "Segment")).toHaveClass("is-active");
    expect(pipelineStage(rail, "Repair")).toHaveClass("is-pending");
  });

  it("advances Segment only after an exportable role accepts its segmentation mask", () => {
    const acceptedMaskElement: WorkspaceElement = {
      ...segmentElement,
      segmentationStatus: "mask_accepted",
    };

    render(
      <PipelineRail
        source={source}
        elements={[acceptedMaskElement]}
        exportSummary={null}
      />,
    );

    const rail = screen.getByRole("navigation", { name: /pipeline stages/i });
    expect(within(rail).getByText(/1 mask ready/i)).toBeInTheDocument();
    expect(pipelineStage(rail, "Segment")).toHaveClass("is-done");
    expect(pipelineStage(rail, "Repair")).toHaveClass("is-done");
    expect(pipelineStage(rail, "Export")).toHaveClass("is-active");
  });

  it("does not require embedded keep or skip roles to complete Segment", () => {
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

    render(
      <PipelineRail
        source={source}
        elements={nonExportRoles}
        exportSummary={null}
      />,
    );

    const rail = screen.getByRole("navigation", { name: /pipeline stages/i });
    expect(within(rail).getByText(/no segment masks needed/i)).toBeInTheDocument();
    expect(pipelineStage(rail, "Segment")).toHaveClass("is-done");
    expect(pipelineStage(rail, "Repair")).toHaveClass("is-done");
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

    const resizeHandle = screen.getByRole("separator", { name: /resize segment drawer height/i });
    expect(resizeHandle).toHaveClass("floating-stage-drawer-resize-handle");
    expect(resizeHandle).toHaveAttribute("aria-orientation", "horizontal");
    expect(drawer.querySelector(".floating-stage-drawer-header")).not.toBeNull();
    expect(drawer.querySelector(".floating-stage-drawer-body")).not.toBeNull();
    expect((drawer as HTMLElement).style.getPropertyValue("--stage-drawer-height")).toBe("360px");
    expect((drawer as HTMLElement).style.getPropertyValue("--stage-drawer-width")).toBe("");
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

function dispatchDrawerPointerEvent(element: HTMLElement, type: string, clientY: number, pointerId: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clientY", { value: clientY });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  fireEvent(element, event);
}

function pipelineStage(rail: HTMLElement, name: string): HTMLElement {
  const label = within(rail).getByText(name);
  const stage = label.closest("li");
  if (!stage) {
    throw new Error(`Pipeline stage ${name} was not rendered.`);
  }
  return stage;
}
