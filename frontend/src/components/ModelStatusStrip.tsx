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

  return (
    <footer className="model-status-strip">
      <StatusMetric label="Model Provider" value={provider} />
      <StatusMetric label="Detections" value={String(visibleElements.length)} />
      <StatusMetric label="Reviewed" value={String(reviewedCount)} />
      <StatusMetric label="Accepted" value={String(acceptedCount)} tone="success" />
      <StatusMetric label="Needs Review" value={String(needsReviewCount)} tone="warning" />
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
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "warning" | "danger";
}) {
  return (
    <div className={`status-metric${tone ? ` tone-${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
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
