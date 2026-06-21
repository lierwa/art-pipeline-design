import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { InspectorPanel } from "../src/features/inspector/InspectorPanel";
import type { AssetRole, ElementEditorDraft, WorkspaceElement } from "../src/domain/workspace";

type RolePatch = {
  assetRole: AssetRole;
  removeFromParent?: string | null;
};

describe("role editor", () => {
  it("shows role choices and hides the parent selector outside removable children", () => {
    renderInspector();

    expect(screen.getByRole("combobox", { name: /asset role/i })).toHaveValue("sticker");
    expect(screen.queryByRole("combobox", { name: /remove from parent/i })).not.toBeInTheDocument();
  });

  it("shows parent candidates only for removable children and excludes itself plus non-parents", async () => {
    const user = userEvent.setup();
    renderInspector();

    await user.selectOptions(screen.getByRole("combobox", { name: /asset role/i }), "removable_child");

    const parentSelector = await screen.findByRole("combobox", { name: /remove from parent/i });
    expect(parentSelector).toBeInTheDocument();
    expect(within(parentSelector).getByRole("option", { name: "Cabinet" })).toHaveValue("element_001");
    expect(within(parentSelector).queryByRole("option", { name: "Sticker" })).not.toBeInTheDocument();
    expect(within(parentSelector).queryByRole("option", { name: "Loose sticker" })).not.toBeInTheDocument();
  });

  it("emits role and parent patch payloads from editor changes", async () => {
    const user = userEvent.setup();
    const patchRole = vi.fn();
    renderInspector({ onPatchElementRole: patchRole });

    await user.selectOptions(screen.getByRole("combobox", { name: /asset role/i }), "removable_child");
    expect(patchRole).toHaveBeenCalledWith("element_002", {
      assetRole: "removable_child",
      removeFromParent: null,
    });

    await user.selectOptions(await screen.findByRole("combobox", { name: /remove from parent/i }), "element_001");

    await waitFor(() => {
      expect(patchRole).toHaveBeenLastCalledWith("element_002", {
        assetRole: "removable_child",
        removeFromParent: "element_001",
      });
    });
  });
});

function renderInspector({
  onPatchElementRole = vi.fn(),
}: {
  onPatchElementRole?: (elementId: string, patch: RolePatch) => void;
} = {}) {
  function Harness() {
    const [selectedElement, setSelectedElement] = useState(stickerElement);

    return (
      <InspectorPanel
        selectedElement={selectedElement}
        elements={[parentElement, selectedElement, looseStickerElement]}
        draft={draftFromElement(selectedElement)}
        workspaceRunId={null}
        splitRequestDescription=""
        missingMaskDraft={null}
        repairQaReport={null}
        hasMissingMaskPreview={false}
        hasRepairPackage={false}
        onDraftChange={vi.fn()}
        onPatchElementRole={(elementId, patch) => {
          onPatchElementRole(elementId, patch);
          setSelectedElement((current) => ({
            ...current,
            assetRole: patch.assetRole,
            removeFromParent: patch.removeFromParent ?? null,
          }));
        }}
        onSplitRequestDescriptionChange={vi.fn()}
        onMissingMaskDraftChange={vi.fn()}
        onSaveElement={vi.fn()}
        onCreateSplitRequest={vi.fn()}
        onReplaceMaskByCurrentShape={vi.fn()}
        onClearMask={vi.fn()}
        onReExtract={vi.fn()}
        onDrawMissingMask={vi.fn()}
        onSaveMissingMaskFromDraft={vi.fn()}
        onCreateRepairTask={vi.fn()}
        onValidateRepairOutput={vi.fn()}
        canExtractSelected={false}
        hasUnsavedGeometryChanges={false}
        isExtracting={false}
        isRepairing={false}
        assetCacheKey={0}
      />
    );
  }

  return render(<Harness />);
}

const parentElement: WorkspaceElement = {
  id: "element_001",
  name: "Cabinet",
  label: "Cabinet",
  status: "accepted",
  mode: "visible_only",
  assetRole: "parent",
  removeFromParent: null,
  segmentationStatus: "not_started",
  repairStatus: "not_required",
  exportStatus: "not_ready",
  bbox: { x: 10, y: 20, w: 80, h: 60 },
  canvas: { x: 10, y: 20, w: 80, h: 60 },
  layer: 1,
  thumbnail: null,
  mask: null,
  parentId: null,
  source: "model_detection",
  sourceProvider: "test",
  sourcePrompt: "Cabinet",
  notes: "",
  visible: true,
  confidence: 0.9,
  history: [],
  mergedInto: null,
  exportParent: false,
};

const stickerElement: WorkspaceElement = {
  ...parentElement,
  id: "element_002",
  name: "Sticker",
  label: "Sticker",
  assetRole: "sticker",
  bbox: { x: 24, y: 32, w: 20, h: 18 },
  canvas: { x: 24, y: 32, w: 20, h: 18 },
};

const looseStickerElement: WorkspaceElement = {
  ...parentElement,
  id: "element_003",
  name: "Loose sticker",
  label: "Loose sticker",
  assetRole: "sticker",
  bbox: { x: 54, y: 38, w: 16, h: 14 },
  canvas: { x: 54, y: 38, w: 16, h: 14 },
};

function draftFromElement(element: WorkspaceElement): ElementEditorDraft {
  return {
    name: element.name,
    mode: element.mode,
    layer: String(element.layer),
    bbox: {
      x: String(element.bbox.x),
      y: String(element.bbox.y),
      w: String(element.bbox.w),
      h: String(element.bbox.h),
    },
    canvas: {
      x: String(element.canvas.x),
      y: String(element.canvas.y),
      w: String(element.canvas.w),
      h: String(element.canvas.h),
    },
    notes: element.notes,
    visible: element.visible,
  };
}
