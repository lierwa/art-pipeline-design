import { ExportSummary, WorkspaceElement } from "../../domain/workspace";

type ModelStatusStripProps = {
  elements: WorkspaceElement[];
  status: string;
  isSaving: boolean;
  exportSummary: ExportSummary | null;
};

export function ModelStatusStrip({
  elements,
  status,
  isSaving,
  exportSummary,
}: ModelStatusStripProps) {
  const modelChain = resolveModelChain(elements);
  const visibleElements = elements.filter((element) => element.mergedInto === null);
  const maskReadyCount = visibleElements.filter(hasAcceptedMask).length;
  const exportReadyCount = visibleElements.filter(isExportReady).length;
  const blockedCount = exportSummary?.blockedCount ?? visibleElements.filter(isBlocked).length;
  const warningCount = exportSummary?.warnings.length ?? visibleElements.filter((element) => element.status === "qa_failed").length;
  const candidateCount = visibleElements.length;

  return (
    <footer className="model-status-strip">
      <StatusMetric label="Model Chain" value={modelChain} />
      <StatusMetric label="Candidates" value={String(candidateCount)} detail="from detector" />
      <StatusMetric label="Masks Ready" value={String(maskReadyCount)} detail="SAM2 accepted" tone="success" />
      <StatusMetric label="Export Ready" value={String(exportReadyCount)} detail="final assets" tone="success" />
      <StatusMetric label="Blocked" value={String(blockedCount)} tone={blockedCount > 0 ? "warning" : undefined} />
      <StatusMetric label="Warnings" value={String(warningCount)} tone={warningCount > 0 ? "danger" : undefined} />
      <div className="status-message" aria-live="polite">
        {isSaving ? "Saving..." : status}
      </div>
    </footer>
  );
}

function StatusMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "success" | "warning" | "danger";
}) {
  return (
    <div className={`status-metric${tone ? ` tone-${tone}` : ""}`}>
      <span className="status-metric-label">{label}</span>
      <div className="status-metric-value">
        <strong>{value}</strong>
        {detail ? <small>{detail}</small> : null}
      </div>
    </div>
  );
}

function resolveModelChain(elements: WorkspaceElement[]): string {
  const detector = elements.find((element) => element.sourceProvider)?.sourceProvider ?? "Detector";
  return `${detector} + SAM2`;
}

function hasAcceptedMask(element: WorkspaceElement): boolean {
  return element.segmentationStatus === "mask_accepted";
}

function isExportReady(element: WorkspaceElement): boolean {
  return element.exportStatus === "ready" || element.exportStatus === "exported";
}

function isBlocked(element: WorkspaceElement): boolean {
  return element.exportStatus === "blocked" || element.status === "qa_failed";
}
