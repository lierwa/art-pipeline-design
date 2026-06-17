import { ExportSummary, WorkspaceElement } from "../workspace";

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
  const provider = resolveProvider(elements);
  const visibleElements = elements.filter((element) => element.mergedInto === null);
  const needsReviewCount = visibleElements.filter(needsReview).length;
  const acceptedCount = visibleElements.filter(isAccepted).length;
  const reviewedCount = Math.max(visibleElements.length - needsReviewCount, 0);
  const warningCount = exportSummary?.warnings.length ?? visibleElements.filter((element) => element.status === "qa_failed").length;
  const detectionCount = visibleElements.length;

  return (
    <footer className="model-status-strip">
      <StatusMetric label="Model Provider" value={provider} />
      <StatusMetric label="Detections" value={String(detectionCount)} detail="Total" />
      <StatusMetric label="Reviewed" value={String(reviewedCount)} detail={`${percent(reviewedCount, detectionCount)}%`} />
      <StatusMetric
        label="Accepted"
        value={String(acceptedCount)}
        detail={`${percent(acceptedCount, reviewedCount)}% of reviewed`}
        tone="success"
      />
      <StatusMetric
        label="Needs Review"
        value={String(needsReviewCount)}
        detail={`${percent(needsReviewCount, detectionCount)}% of total`}
        tone="warning"
      />
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

function percent(value: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.round((value / total) * 100);
}

function resolveProvider(elements: WorkspaceElement[]): string {
  return elements.find((element) => element.sourceProvider)?.sourceProvider ?? "Local workspace";
}

function needsReview(element: WorkspaceElement): boolean {
  if (element.mode === "rejected") {
    return false;
  }
  return ["model_detected", "proposal", "edited", "qa_failed"].includes(element.status);
}

function isAccepted(element: WorkspaceElement): boolean {
  if (element.mode === "rejected") {
    return false;
  }
  return ["accepted", "extract_ready", "extracted", "repair_complete", "exported"].includes(element.status);
}
