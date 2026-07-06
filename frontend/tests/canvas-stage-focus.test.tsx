import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CanvasStage } from "../src/features/canvas/CanvasStage";
import type { SourceMetadata, WorkspaceElement } from "../src/domain/workspace";
import { loadedState } from "./app/appFixtures";

describe("CanvasStage focus panning", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not replay an old focus request when the focused element bbox changes", async () => {
    const frameCallbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    const onPanChange = vi.fn();
    const focusRequest = { elementId: "element_001", sequence: 1 };
    const element = loadedState.elements[0] as unknown as WorkspaceElement;
    const { rerender } = renderCanvasStage({
      focusRequest,
      onPanChange,
      overlayElements: [element],
    });
    mockRect(screen.getByTestId("canvas-artboard"), { left: 500, top: 400, width: 600, height: 450 });
    const stage = screen.getByTestId("canvas-area").querySelector(".canvas-stage");
    if (!stage) {
      throw new Error("Canvas stage was not rendered.");
    }
    mockRect(stage, { left: 0, top: 0, width: 300, height: 300 });

    await flushAnimationFrames(frameCallbacks);

    expect(onPanChange).toHaveBeenCalledTimes(1);

    rerender(renderCanvasStageElement({
      focusRequest,
      onPanChange,
      overlayElements: [{
        ...element,
        bbox: { ...element.bbox, w: element.bbox.w + 8 },
      }],
    }));
    mockRect(screen.getByTestId("canvas-artboard"), { left: 500, top: 400, width: 600, height: 450 });
    const rerenderedStage = screen.getByTestId("canvas-area").querySelector(".canvas-stage");
    if (!rerenderedStage) {
      throw new Error("Canvas stage was not rendered after rerender.");
    }
    mockRect(rerenderedStage, { left: 0, top: 0, width: 300, height: 300 });

    await flushAnimationFrames(frameCallbacks);

    expect(onPanChange).toHaveBeenCalledTimes(1);
  });

  it("does not create draw drafts when drawing capability is disabled", () => {
    const onDraftRegionChange = vi.fn();

    renderCanvasStage({
      focusRequest: null,
      onPanChange: vi.fn(),
      overlayElements: [loadedState.elements[0] as unknown as WorkspaceElement],
      stageProps: {
        capabilities: {
          canDraw: false,
          canSplit: true,
          canClickDetect: true,
          canCreateChild: true,
          canRenameObjects: true,
          canUseMissingMask: true,
        },
        onDraftRegionChange,
        tool: "draw",
      },
    });

    const surface = screen.getByTestId("canvas-drawing-surface");
    mockRect(surface, { left: 0, top: 0, width: 600, height: 450 });

    fireEvent.pointerDown(surface, { clientX: 10, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 100, clientY: 120, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 100, clientY: 120, pointerId: 1 });

    expect(onDraftRegionChange).not.toHaveBeenCalled();
  });

  it("hides stale draft and overlay regions when their capabilities are disabled", () => {
    const onCreateElement = vi.fn();
    const { container } = renderCanvasStage({
      focusRequest: null,
      onPanChange: vi.fn(),
      overlayElements: [loadedState.elements[0] as unknown as WorkspaceElement],
      stageProps: {
        capabilities: {
          canDraw: false,
          canSplit: false,
          canClickDetect: true,
          canCreateChild: true,
          canRenameObjects: true,
          canUseMissingMask: false,
        },
        canDrawMissingMask: true,
        draftRegion: { bbox: { x: 5, y: 6, w: 30, h: 40 } },
        missingMaskRegion: { bbox: { x: 7, y: 8, w: 20, h: 30 } },
        onCreateElement,
        splitRegions: [{ bbox: { x: 9, y: 10, w: 25, h: 35 } }],
      },
    });

    expect(screen.queryByRole("button", { name: /create element/i })).not.toBeInTheDocument();
    expect(container.querySelector(".draft-inline-editor")).toBeNull();
    expect(container.querySelector(".overlay-item-draft")).toBeNull();
    expect(container.querySelector(".overlay-item-split")).toBeNull();
    expect(container.querySelector(".overlay-item-missing")).toBeNull();
    expect(onCreateElement).not.toHaveBeenCalled();
  });
});

async function flushAnimationFrames(callbacks: FrameRequestCallback[]) {
  await act(async () => {
    while (callbacks.length > 0) {
      callbacks.shift()?.(performance.now());
    }
  });
}

function renderCanvasStage(props: {
  focusRequest: { elementId: string; sequence: number } | null;
  onPanChange: (deltaX: number, deltaY: number) => void;
  overlayElements: WorkspaceElement[];
  stageProps?: Partial<ComponentProps<typeof CanvasStage>>;
}) {
  return render(renderCanvasStageElement(props));
}

function renderCanvasStageElement({
  focusRequest,
  onPanChange,
  overlayElements,
  stageProps,
}: {
  focusRequest: { elementId: string; sequence: number } | null;
  onPanChange: (deltaX: number, deltaY: number) => void;
  overlayElements: WorkspaceElement[];
  stageProps?: Partial<ComponentProps<typeof CanvasStage>>;
}) {
  const source = loadedState.source as SourceMetadata;
  return (
    <CanvasStage
      assetCacheKey={0}
      canCreateChildFromDraft={false}
      canDrawMissingMask={false}
      draftRegion={null}
      editingElementId={null}
      focusRequest={focusRequest}
      hasUnsavedBoxEdit={false}
      isPanMode={false}
      manualElementName="Manual Element"
      mergePreview={null}
      missingMaskRegion={null}
      overlayElements={overlayElements}
      overlays={{ showBoxes: true, showMasks: false, showNames: true, showRejected: false, showThumbs: true }}
      panOffset={{ x: 0, y: 0 }}
      renamingElementId={null}
      selectedElementId="element_001"
      selectedElementIds={["element_001"]}
      source={source}
      sourceDetails="original.png - 120 x 90"
      sourceUrl="/source/original.png"
      splitRegions={[]}
      tool="select"
      workspaceRunId={null}
      zoomPercent={80}
      onAddSplitRegion={vi.fn()}
      onApplySplit={vi.fn()}
      onBoxDraftChange={vi.fn()}
      onCancelBoxEdit={vi.fn()}
      onCancelRenameElement={vi.fn()}
      onClearDrafts={vi.fn()}
      onClearSelection={vi.fn()}
      onCommitRenameElement={vi.fn()}
      onCompleteMissingMaskRegion={vi.fn()}
      onConfirmBoxEdit={vi.fn()}
      onCreateChildElement={vi.fn()}
      onCreateElement={vi.fn()}
      onDraftRegionChange={vi.fn()}
      onManualElementNameChange={vi.fn()}
      onMissingMaskRegionChange={vi.fn()}
      onOpenElementContextMenu={vi.fn()}
      onPanChange={onPanChange}
      onSelectElement={vi.fn()}
      onStartRenameElement={vi.fn()}
      onZoomByGesture={vi.fn()}
      onZoomByWheel={vi.fn()}
      {...stageProps}
    />
  );
}

function mockRect(element: Element, rect: { left: number; top: number; width: number; height: number }) {
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
