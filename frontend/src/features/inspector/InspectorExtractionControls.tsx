import {
  assetIncompleteUrl,
  sourceCropUrl,
  type WorkspaceElement,
  workspaceAssetUrl,
} from "../../domain/workspace";

type InspectorExtractionControlsProps = {
  assetCacheKey: number;
  canExtractSelected: boolean;
  hasUnsavedGeometryChanges: boolean;
  isExtracting: boolean;
  selectedElement: WorkspaceElement;
  workspaceRunId: string | null;
  onClearMask: () => void;
  onReExtract: () => void;
  onReplaceMaskByCurrentShape: () => void;
};

export function InspectorExtractionControls({
  assetCacheKey,
  canExtractSelected,
  hasUnsavedGeometryChanges,
  isExtracting,
  selectedElement,
  workspaceRunId,
  onClearMask,
  onReExtract,
  onReplaceMaskByCurrentShape,
}: InspectorExtractionControlsProps) {
  return (
    <section className="inspector-extraction" aria-label="Extraction controls">
      <div className="inspector-details">
        <strong>Extraction</strong>
        <span>{formatCanvas(selectedElement)}</span>
        <span>{formatBBox(selectedElement)}</span>
      </div>
      <div className="mask-control-buttons">
        <button
          type="button"
          disabled={!canExtractSelected || isExtracting}
          onClick={onReplaceMaskByCurrentShape}
        >
          Replace mask by current shape
        </button>
        <button
          type="button"
          disabled={!selectedElement.mask || hasUnsavedGeometryChanges}
          onClick={onClearMask}
        >
          Clear mask
        </button>
        <button
          type="button"
          disabled={!canExtractSelected || isExtracting}
          onClick={onReExtract}
        >
          Re-extract
        </button>
      </div>
      {hasUnsavedGeometryChanges ? (
        <p className="panel-copy">Save geometry changes before mask or extraction actions.</p>
      ) : null}
      {hasAssetPreview(selectedElement) && selectedElement.mask ? (
        <div className="inspector-preview-strip">
          <img
            alt={`${selectedElement.name} inspector source crop`}
            src={sourceCropUrl(selectedElement, assetCacheKey, workspaceRunId)}
          />
          <img
            alt={`${selectedElement.name} inspector mask overlay`}
            src={workspaceAssetUrl(selectedElement.mask, assetCacheKey, workspaceRunId) ?? undefined}
          />
          <div className="checkerboard-preview">
            <img
              alt={`${selectedElement.name} inspector transparent asset`}
              src={assetIncompleteUrl(selectedElement, assetCacheKey, workspaceRunId)}
            />
          </div>
        </div>
      ) : selectedElement.mask ? (
        <div className="inspector-preview-strip">
          <img
            alt={`${selectedElement.name} inspector mask overlay`}
            src={workspaceAssetUrl(selectedElement.mask, assetCacheKey, workspaceRunId) ?? undefined}
          />
          <p className="panel-copy">Mask saved. Re-extract to refresh asset previews.</p>
        </div>
      ) : (
        <p className="panel-copy">No extraction mask saved for this element.</p>
      )}
    </section>
  );
}

function formatCanvas(element: WorkspaceElement): string {
  return `Canvas ${element.canvas.w} x ${element.canvas.h} at ${element.canvas.x}, ${element.canvas.y}`;
}

function formatBBox(element: WorkspaceElement): string {
  return `BBox ${element.bbox.w} x ${element.bbox.h} at ${element.bbox.x}, ${element.bbox.y}`;
}

function hasAssetPreview(element: WorkspaceElement): boolean {
  return ["extracted", "repair_pending", "repair_complete", "qa_failed"].includes(element.status);
}
