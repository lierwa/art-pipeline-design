import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { CanvasStage } from "../src/components/CanvasStage";
import { CanvasToolbar } from "../src/components/CanvasToolbar";
import { DetectionVocabularyPanel } from "../src/components/DetectionVocabularyPanel";
import {
  DEFAULT_OVERLAYS,
  SourceMetadata,
  WorkspaceState,
  normalizeWorkspaceState,
} from "../src/workspace";

describe("detection workflow building blocks", () => {
  it("defaults sticker workflow fields while normalizing legacy workspace elements", () => {
    const normalized = normalizeWorkspaceState({
      source: null,
      elements: [
        {
          id: "element_001",
          name: "cat",
          label: "cat",
          status: "model_detected",
          mode: "visible_only",
          bbox: { x: 10, y: 12, w: 30, h: 32 },
          canvas: { x: 8, y: 10, w: 34, h: 36 },
          layer: 1,
          thumbnail: null,
          mask: null,
          parentId: null,
          source: "model_detection",
          sourceProvider: "grounding_dino",
          sourcePrompt: "cat",
          notes: "",
          visible: true,
          history: [],
          mergedInto: null,
          exportParent: false,
        },
      ],
    } as WorkspaceState);

    expect(normalized.elements[0]).toMatchObject({
      assetRole: "sticker",
      segmentationStatus: "not_started",
      repairStatus: "not_required",
      exportStatus: "not_ready",
    });
  });

  it("adds a vocabulary chip and saves the normalized labels", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <DetectionVocabularyPanel
        labels={["cat"]}
        disabled={false}
        onSave={onSave}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: /detection label/i }), "bucket");
    await user.click(screen.getByRole("button", { name: /add label/i }));

    expect(onSave).toHaveBeenCalledWith(["cat", "bucket"]);
  });

  it("removes a vocabulary chip and saves the remaining normalized labels", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <DetectionVocabularyPanel
        labels={[" Cat ", "bucket", "cat"]}
        disabled={false}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole("button", { name: /remove cat/i }));

    expect(onSave).toHaveBeenCalledWith(["bucket"]);
  });

  it("renders an enabled click detect toolbar button when a source exists", () => {
    renderToolbar({ canClickDetect: true });

    expect(screen.getByRole("button", { name: /click detect/i })).toBeEnabled();
  });

  it("keeps click detect disabled until the parent wires a consumer", () => {
    renderToolbar();

    expect(screen.getByRole("button", { name: /click detect/i })).toBeDisabled();
  });

  it("emits source coordinates when click detect is active", () => {
    const onClickDetectPoint = vi.fn();
    const source: SourceMetadata = {
      filename: "source.png",
      path: "source/source.png",
      width: 200,
      height: 100,
    };

    render(
      <CanvasStage
        sourceUrl="/source.png"
        source={source}
        overlays={DEFAULT_OVERLAYS}
        overlayElements={[]}
        selectedElementId={null}
        selectedElementIds={[]}
        editingElementId={null}
        mergePreview={null}
        sourceDetails="source.png - 200 x 100"
        tool="click-detect"
        draftRegion={null}
        splitRegions={[]}
        missingMaskRegion={null}
        assetCacheKey={0}
        workspaceRunId={null}
        canDrawMissingMask={false}
        hasUnsavedBoxEdit={false}
        zoomPercent={80}
        isPanMode={false}
        panOffset={{ x: 0, y: 0 }}
        focusRequest={null}
        manualElementName="Manual Element"
        renamingElementId={null}
        canCreateChildFromDraft={false}
        onSelectElement={vi.fn()}
        onClearSelection={vi.fn()}
        onOpenElementContextMenu={vi.fn()}
        onStartRenameElement={vi.fn()}
        onCommitRenameElement={vi.fn()}
        onCancelRenameElement={vi.fn()}
        onBoxDraftChange={vi.fn()}
        onZoomByWheel={vi.fn()}
        onZoomByGesture={vi.fn()}
        onPanChange={vi.fn()}
        onDraftRegionChange={vi.fn()}
        onAddSplitRegion={vi.fn()}
        onMissingMaskRegionChange={vi.fn()}
        onCompleteMissingMaskRegion={vi.fn()}
        onManualElementNameChange={vi.fn()}
        onCreateElement={vi.fn()}
        onCreateChildElement={vi.fn()}
        onConfirmBoxEdit={vi.fn()}
        onCancelBoxEdit={vi.fn()}
        onClearDrafts={vi.fn()}
        onApplySplit={vi.fn()}
        onClickDetectPoint={onClickDetectPoint}
      />,
    );

    const surface = screen.getByTestId("canvas-drawing-surface");
    mockRect(surface, { left: 10, top: 20, width: 400, height: 200 });
    fireEvent.mouseDown(surface, { clientX: 210, clientY: 120, button: 0 });

    expect(onClickDetectPoint).toHaveBeenCalledWith({ x: 100, y: 50 });
  });
});

type ToolbarProps = ComponentProps<typeof CanvasToolbar> & {
  canClickDetect?: boolean;
};

function renderToolbar(overrides: Partial<ToolbarProps> = {}) {
  const defaultProps: ToolbarProps = {
    tool: "select",
    overlays: DEFAULT_OVERLAYS,
    hasSource: true,
    hasSelection: false,
    canSplit: false,
    canMerge: false,
    canUndo: false,
    canRedo: false,
    zoomPercent: 100,
    isPanMode: false,
    onSelectTool: vi.fn(),
    onToggleOverlay: vi.fn(),
    onEditBox: vi.fn(),
    onMerge: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onFitCanvas: vi.fn(),
    onTogglePanMode: vi.fn(),
  };

  return render(<CanvasToolbar {...defaultProps} {...overrides} />);
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
