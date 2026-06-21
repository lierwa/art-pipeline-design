import {
  AssetRole,
  ElementEditorDraft,
  ElementMode,
  MissingMaskDraft,
  RepairQaReport,
  WorkspaceElement,
} from "../../domain/workspace";
import { InspectorExtractionControls } from "./InspectorExtractionControls";
import { InspectorRepairControls } from "./InspectorRepairControls";

type InspectorPanelProps = {
  selectedElement: WorkspaceElement | null;
  elements: WorkspaceElement[];
  draft: ElementEditorDraft | null;
  workspaceRunId: string | null;
  splitRequestDescription: string;
  missingMaskDraft: MissingMaskDraft | null;
  repairQaReport: RepairQaReport | null;
  hasMissingMaskPreview: boolean;
  hasRepairPackage: boolean;
  onDraftChange: (draft: ElementEditorDraft) => void;
  onPatchElementRole: (
    elementId: string,
    patch: { assetRole: AssetRole; removeFromParent?: string | null },
  ) => void;
  onSplitRequestDescriptionChange: (value: string) => void;
  onMissingMaskDraftChange: (draft: MissingMaskDraft) => void;
  onSaveElement: () => void;
  onCreateSplitRequest: () => void;
  onReplaceMaskByCurrentShape: () => void;
  onClearMask: () => void;
  onReExtract: () => void;
  onDrawMissingMask: () => void;
  onSaveMissingMaskFromDraft: () => void;
  onCreateRepairTask: () => void;
  onValidateRepairOutput: () => void;
  canExtractSelected: boolean;
  hasUnsavedGeometryChanges: boolean;
  isExtracting: boolean;
  isRepairing: boolean;
  assetCacheKey: number;
};

const ASSET_ROLE_OPTIONS: Array<{ value: AssetRole; label: string }> = [
  { value: "sticker", label: "Sticker" },
  { value: "parent", label: "Parent" },
  { value: "removable_child", label: "Removable child" },
  { value: "embedded_keep", label: "Embedded keep" },
  { value: "skip", label: "Skip" },
];

export function InspectorPanel({
  selectedElement,
  elements,
  draft,
  workspaceRunId,
  splitRequestDescription,
  missingMaskDraft,
  repairQaReport,
  hasMissingMaskPreview,
  hasRepairPackage,
  onDraftChange,
  onPatchElementRole,
  onSplitRequestDescriptionChange,
  onMissingMaskDraftChange,
  onSaveElement,
  onCreateSplitRequest,
  onReplaceMaskByCurrentShape,
  onClearMask,
  onReExtract,
  onDrawMissingMask,
  onSaveMissingMaskFromDraft,
  onCreateRepairTask,
  onValidateRepairOutput,
  canExtractSelected,
  hasUnsavedGeometryChanges,
  isExtracting,
  isRepairing,
  assetCacheKey,
}: InspectorPanelProps) {
  const parentCandidates = selectedElement
    ? elements.filter((element) => element.id !== selectedElement.id && element.assetRole === "parent")
    : [];

  return (
    <aside className="panel inspector-panel">
      <div className="panel-header">
        <h2>Inspector</h2>
      </div>
      <div className="panel-body">
        {selectedElement && draft ? (
          <form
            className="inspector-form"
            onSubmit={(event) => {
              event.preventDefault();
              onSaveElement();
            }}
          >
            <label className="field-group">
              <span>Element name</span>
              <input
                aria-label="Element name"
                type="text"
                value={draft.name}
                onChange={(event) =>
                  onDraftChange({
                    ...draft,
                    name: event.target.value,
                  })
                }
              />
            </label>
            <label className="field-group">
              <span>Element mode</span>
              <select
                aria-label="Element mode"
                value={draft.mode}
                onChange={(event) =>
                  onDraftChange({
                    ...draft,
                    mode: event.target.value as ElementMode,
                  })
                }
              >
                <option value="visible_only">visible_only</option>
                <option value="needs_completion">needs_completion</option>
                <option value="completed_by_codex">completed_by_codex</option>
                <option value="rejected">rejected</option>
              </select>
            </label>
            <label className="field-group">
              <span>Asset role</span>
              <select
                aria-label="Asset role"
                value={selectedElement.assetRole}
                onChange={(event) => {
                  const assetRole = event.target.value as AssetRole;
                  onPatchElementRole(selectedElement.id, {
                    assetRole,
                    // WHY: 修复/导出只在 removable_child 上消费父元素引用；
                    // 切到其他角色时前端同步清空，避免 UI 与后端单一事实短暂分叉。
                    removeFromParent: assetRole === "removable_child"
                      ? selectedElement.removeFromParent
                      : null,
                  });
                }}
              >
                {ASSET_ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {selectedElement.assetRole === "removable_child" ? (
              <label className="field-group">
                <span>Remove from parent</span>
                <select
                  aria-label="Remove from parent"
                  value={selectedElement.removeFromParent ?? ""}
                  onChange={(event) =>
                    onPatchElementRole(selectedElement.id, {
                      assetRole: "removable_child",
                      removeFromParent: event.target.value || null,
                    })
                  }
                >
                  <option value="">No parent</option>
                  {parentCandidates.map((element) => (
                    <option key={element.id} value={element.id}>
                      {element.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="field-group">
              <span>Element layer</span>
              <input
                aria-label="Element layer"
                type="number"
                value={draft.layer}
                onChange={(event) =>
                  onDraftChange({
                    ...draft,
                    layer: event.target.value,
                  })
                }
              />
            </label>
            <div className="field-grid">
              <label className="field-group">
                <span>BBox X</span>
                <input
                  aria-label="BBox X"
                  type="number"
                  value={draft.bbox.x}
                  onChange={(event) =>
                    onDraftChange({
                      ...draft,
                      bbox: { ...draft.bbox, x: event.target.value },
                    })
                  }
                />
              </label>
              <label className="field-group">
                <span>BBox Y</span>
                <input
                  aria-label="BBox Y"
                  type="number"
                  value={draft.bbox.y}
                  onChange={(event) =>
                    onDraftChange({
                      ...draft,
                      bbox: { ...draft.bbox, y: event.target.value },
                    })
                  }
                />
              </label>
              <label className="field-group">
                <span>BBox width</span>
                <input
                  aria-label="BBox width"
                  type="number"
                  value={draft.bbox.w}
                  onChange={(event) =>
                    onDraftChange({
                      ...draft,
                      bbox: { ...draft.bbox, w: event.target.value },
                    })
                  }
                />
              </label>
              <label className="field-group">
                <span>BBox height</span>
                <input
                  aria-label="BBox height"
                  type="number"
                  value={draft.bbox.h}
                  onChange={(event) =>
                    onDraftChange({
                      ...draft,
                      bbox: { ...draft.bbox, h: event.target.value },
                    })
                  }
                />
              </label>
            </div>
            <div className="field-grid">
              <label className="field-group">
                <span>Canvas X</span>
                <input
                  aria-label="Canvas X"
                  type="number"
                  value={draft.canvas.x}
                  onChange={(event) =>
                    onDraftChange({
                      ...draft,
                      canvas: { ...draft.canvas, x: event.target.value },
                    })
                  }
                />
              </label>
              <label className="field-group">
                <span>Canvas Y</span>
                <input
                  aria-label="Canvas Y"
                  type="number"
                  value={draft.canvas.y}
                  onChange={(event) =>
                    onDraftChange({
                      ...draft,
                      canvas: { ...draft.canvas, y: event.target.value },
                    })
                  }
                />
              </label>
              <label className="field-group">
                <span>Canvas width</span>
                <input
                  aria-label="Canvas width"
                  type="number"
                  value={draft.canvas.w}
                  onChange={(event) =>
                    onDraftChange({
                      ...draft,
                      canvas: { ...draft.canvas, w: event.target.value },
                    })
                  }
                />
              </label>
              <label className="field-group">
                <span>Canvas height</span>
                <input
                  aria-label="Canvas height"
                  type="number"
                  value={draft.canvas.h}
                  onChange={(event) =>
                    onDraftChange({
                      ...draft,
                      canvas: { ...draft.canvas, h: event.target.value },
                    })
                  }
                />
              </label>
            </div>
            <label className="field-group">
              <span>Element notes</span>
              <textarea
                aria-label="Element notes"
                value={draft.notes}
                onChange={(event) =>
                  onDraftChange({
                    ...draft,
                    notes: event.target.value,
                  })
                }
              />
            </label>
            <label className="panel-checkbox">
              <input
                aria-label="Element visible"
                type="checkbox"
                checked={draft.visible}
                onChange={() =>
                  onDraftChange({
                    ...draft,
                    visible: !draft.visible,
                  })
                }
              />
              <span>Element visible</span>
            </label>
            <button type="submit">Save element</button>
            <InspectorExtractionControls
              assetCacheKey={assetCacheKey}
              canExtractSelected={canExtractSelected}
              hasUnsavedGeometryChanges={hasUnsavedGeometryChanges}
              isExtracting={isExtracting}
              selectedElement={selectedElement}
              workspaceRunId={workspaceRunId}
              onClearMask={onClearMask}
              onReExtract={onReExtract}
              onReplaceMaskByCurrentShape={onReplaceMaskByCurrentShape}
            />
            <InspectorRepairControls
              assetCacheKey={assetCacheKey}
              hasMissingMaskPreview={hasMissingMaskPreview}
              hasRepairPackage={hasRepairPackage}
              hasUnsavedGeometryChanges={hasUnsavedGeometryChanges}
              isRepairing={isRepairing}
              missingMaskDraft={missingMaskDraft}
              repairQaReport={repairQaReport}
              selectedElement={selectedElement}
              workspaceRunId={workspaceRunId}
              onCreateRepairTask={onCreateRepairTask}
              onDrawMissingMask={onDrawMissingMask}
              onMissingMaskDraftChange={onMissingMaskDraftChange}
              onSaveMissingMaskFromDraft={onSaveMissingMaskFromDraft}
              onValidateRepairOutput={onValidateRepairOutput}
            />
            <label className="field-group">
              <span>Split selected element into</span>
              <input
                aria-label="Split selected element into"
                type="text"
                value={splitRequestDescription}
                onChange={(event) => onSplitRequestDescriptionChange(event.target.value)}
              />
            </label>
            <button type="button" onClick={onCreateSplitRequest}>
              Create split request
            </button>
          </form>
        ) : (
          <p className="panel-copy">Select an element to inspect its settings.</p>
        )}
      </div>
    </aside>
  );
}

