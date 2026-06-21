import {
  assetIncompleteUrl,
  ExportSummary,
  missingMaskUrl,
  repairAssetUrl,
  RepairMetadata,
  RepairQaReport,
  sam2EdgeArtifactUrls,
  sourceCropUrl,
  WorkspaceElement,
  workspaceAssetUrl,
} from "../../domain/workspace";
import { hasExtractedAssetPreview, hasRepairPackage } from "../../domain/workspaceDerived";

export function ExtractionPreview({
  selectedElement,
  assetCacheKey,
  workspaceRunId,
}: {
  selectedElement: WorkspaceElement | null;
  assetCacheKey: number;
  workspaceRunId: string | null;
}) {
  if (!selectedElement) {
    return (
      <div className="extraction-preview extraction-preview-empty">
        <span className="preview-label">Extraction Preview</span>
        <strong>Select an element</strong>
      </div>
    );
  }

  const hasExtractedAsset = hasExtractedAssetPreview(selectedElement) && selectedElement.mask;
  const hasSam2EdgePreview = selectedElement.segmentationStatus === "mask_suggested"
    || selectedElement.segmentationStatus === "mask_accepted";
  const sam2Urls = hasSam2EdgePreview
    ? sam2EdgeArtifactUrls(selectedElement, assetCacheKey, workspaceRunId)
    : null;

  return (
    <div className="extraction-preview">
      <div className="extraction-preview-summary">
        <span className="preview-label">Extraction Preview</span>
        <strong>{selectedElement.name}</strong>
        <span>{formatCanvas(selectedElement)}</span>
        <span>{formatBBox(selectedElement)}</span>
      </div>
      {hasExtractedAsset ? (
        <div className="extraction-preview-grid">
          <figure>
            <img
              alt={`${selectedElement.name} source crop`}
              src={sourceCropUrl(selectedElement, assetCacheKey, workspaceRunId)}
            />
            <figcaption>Source crop</figcaption>
          </figure>
          <figure>
            <img
              alt={`${selectedElement.name} mask overlay`}
              src={workspaceAssetUrl(selectedElement.mask, assetCacheKey, workspaceRunId) ?? undefined}
            />
            <figcaption>Mask overlay</figcaption>
          </figure>
          <figure>
            <div className="checkerboard-preview">
              <img
                alt={`${selectedElement.name} transparent asset`}
                src={assetIncompleteUrl(selectedElement, assetCacheKey, workspaceRunId)}
              />
            </div>
            <figcaption>Transparent asset</figcaption>
          </figure>
        </div>
      ) : sam2Urls ? (
        <div className="extraction-preview-grid">
          <figure>
            <img
              alt={`${selectedElement.name} source crop`}
              src={sam2Urls.sourceCropUrl ?? undefined}
            />
            <figcaption>Source crop</figcaption>
          </figure>
          <figure>
            <img
              alt={`${selectedElement.name} SAM2 edge mask`}
              src={sam2Urls.maskUrl ?? undefined}
            />
            <figcaption>SAM2 edge mask</figcaption>
          </figure>
          <figure>
            <div className="checkerboard-preview">
              <img
                alt={`${selectedElement.name} transparent sticker`}
                src={sam2Urls.transparentAssetUrl ?? undefined}
              />
            </div>
            <figcaption>Transparent sticker</figcaption>
          </figure>
        </div>
      ) : selectedElement.mask ? (
        <div className="extraction-preview-grid">
          <figure>
            <img
              alt={`${selectedElement.name} mask overlay`}
              src={workspaceAssetUrl(selectedElement.mask, assetCacheKey, workspaceRunId) ?? undefined}
            />
            <figcaption>Mask overlay</figcaption>
          </figure>
          <p className="panel-copy">Mask saved. Re-extract to refresh asset previews.</p>
        </div>
      ) : (
        <p className="panel-copy">Run extraction to create mask and transparent asset previews.</p>
      )}
    </div>
  );
}

export function RepairComparison({
  selectedElement,
  qaReport,
  repairMetadata,
  assetCacheKey,
  workspaceRunId,
  hasMissingMaskPreview,
}: {
  selectedElement: WorkspaceElement | null;
  qaReport: RepairQaReport | null;
  repairMetadata: RepairMetadata | null;
  assetCacheKey: number;
  workspaceRunId: string | null;
  hasMissingMaskPreview: boolean;
}) {
  if (!selectedElement || !isRepairVisible(selectedElement, qaReport, repairMetadata)) {
    return null;
  }

  const changedOverlayUrl = repairMetadata?.files.changedPixelsOverlay && qaReport?.changedPixelsOverlayPath
    ? workspaceAssetUrl(qaReport.changedPixelsOverlayPath, assetCacheKey, workspaceRunId)
    : null;
  const hasCompletedAsset = repairMetadata?.files.completedAsset ?? false;

  return (
    <div className="repair-comparison">
      <div className="repair-comparison-summary">
        <span className="preview-label">Repair Comparison</span>
        <strong>{selectedElement.name}</strong>
        {qaReport ? (
          <>
            <span className={`qa-badge qa-${qaReport.status}`}>QA {qaReport.status}</span>
            <span>Inside missing changed pixels: {qaReport.metrics.insideMissingChangedPixels}</span>
            <span>Outside missing changed pixels: {qaReport.metrics.outsideMissingChangedPixels}</span>
            <span>Generated area ratio: {formatRatio(qaReport.metrics.changedAreaRatio)}</span>
          </>
        ) : (
          <span>QA pending</span>
        )}
      </div>
      <div className="repair-comparison-grid">
        <figure>
          <div className="checkerboard-preview">
            <img
              alt={`${selectedElement.name} before asset`}
              src={assetIncompleteUrl(selectedElement, assetCacheKey, workspaceRunId)}
            />
          </div>
          <figcaption>Before asset</figcaption>
        </figure>
        {hasCompletedAsset ? (
          <figure>
            <div className="checkerboard-preview">
              <img
                alt={`${selectedElement.name} after asset`}
                src={repairAssetUrl(selectedElement, "completed_asset.png", assetCacheKey, workspaceRunId)}
              />
            </div>
            <figcaption>After asset</figcaption>
          </figure>
        ) : null}
        {hasMissingMaskPreview ? (
          <figure>
            <img
              alt={`${selectedElement.name} missing mask overlay`}
              src={missingMaskUrl(selectedElement, assetCacheKey, workspaceRunId)}
            />
            <figcaption>Missing mask overlay</figcaption>
          </figure>
        ) : null}
        {changedOverlayUrl ? (
          <figure>
            <img
              alt={`${selectedElement.name} changed pixels overlay`}
              src={changedOverlayUrl}
            />
            <figcaption>Changed pixels overlay</figcaption>
          </figure>
        ) : null}
      </div>
    </div>
  );
}

export function ExportPanel({
  summary,
  assetCacheKey,
  workspaceRunId,
}: {
  summary: ExportSummary | null;
  assetCacheKey: number;
  workspaceRunId: string | null;
}) {
  return (
    <div className="export-panel">
      <div className="export-panel-summary">
        <h3>Export Pack</h3>
        <strong>{summary ? "Asset pack ready" : "No export yet"}</strong>
        {summary ? (
          <>
            <span>Manifest: {summary.paths.manifest}</span>
            <span>Level: {summary.paths.level}</span>
          </>
        ) : (
          <span>Run export after mask acceptance and repair validation.</span>
        )}
      </div>
      <div className="export-panel-details">
        {summary ? (
          <>
            <div className="export-metrics">
              <div className="preview-card">
                <span className="preview-label">Exportable count</span>
                <strong>{summary.exportableCount} exportable</strong>
              </div>
              <div className="preview-card">
                <span className="preview-label">Blocked count</span>
                <strong>{summary.blockedCount} blocked</strong>
              </div>
              <div className="preview-card export-path-card">
                <span className="preview-label">Open export folder path</span>
                <strong>{summary.outputDir}</strong>
              </div>
            </div>
            {summary.warnings.length > 0 ? (
              <div className="export-warnings">
                <span className="preview-label">Warnings</span>
                <ul>
                  {summary.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="panel-copy">No export warnings.</p>
            )}
            {summary.blockedElements.length > 0 ? (
              <div className="export-blocked">
                <span className="preview-label">Blocked elements</span>
                <ul>
                  {summary.blockedElements.map((blocked) => (
                    <li key={blocked.elementId}>
                      <strong>{blocked.elementId}</strong>
                      <span>{blocked.name}</span>
                      <span>{blocked.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <figure className="export-contact-sheet">
              <img
                alt="Export contact sheet preview"
                src={workspaceAssetUrl(summary.paths.contactSheet, assetCacheKey, workspaceRunId) ?? undefined}
              />
              <figcaption>Contact sheet preview</figcaption>
            </figure>
          </>
        ) : (
          <p className="panel-copy">The contact sheet preview appears here after export.</p>
        )}
      </div>
    </div>
  );
}

export function formatExportStatus(summary: ExportSummary): string {
  const assetLabel = summary.exportableCount === 1 ? "asset" : "assets";
  return `Exported ${summary.exportableCount} ${assetLabel}. ${summary.blockedCount} blocked.`;
}

function isRepairVisible(
  selectedElement: WorkspaceElement,
  qaReport: RepairQaReport | null,
  repairMetadata: RepairMetadata | null,
): boolean {
  return (
    selectedElement.mode === "needs_completion"
    || selectedElement.mode === "completed_by_codex"
    || hasRepairPackage(selectedElement)
    || qaReport?.elementId === selectedElement.id
    || repairMetadata?.elementId === selectedElement.id
  );
}

function formatRatio(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

function formatCanvas(element: WorkspaceElement): string {
  return `Canvas ${element.canvas.w} x ${element.canvas.h} at ${element.canvas.x}, ${element.canvas.y}`;
}

function formatBBox(element: WorkspaceElement): string {
  return `BBox ${element.bbox.w} x ${element.bbox.h} at ${element.bbox.x}, ${element.bbox.y}`;
}
