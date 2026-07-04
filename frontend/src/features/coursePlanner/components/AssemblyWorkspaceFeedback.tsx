import { Save } from "lucide-react";

import { ConfirmActionDialog } from "../../../shared/ui/ConfirmActionDialog";
import type { AssemblyReadiness } from "../assembly/assemblyReadiness";
import type { AsyncOperationState } from "../types";
import { CoursePlannerStatusBadge } from "./CoursePlannerChrome";
import type { AssemblyWorkspaceSaveState } from "./AssemblyWorkspacePanel";

type AssemblyWorkspaceFeedbackProps = {
  actionLabel: string;
  alignmentRiskPlacementCount: number;
  canTriggerSave: boolean;
  placementCount: number;
  readiness: AssemblyReadiness;
  saveError: string | null;
  saveState: AssemblyWorkspaceSaveState;
  saveStatus?: AsyncOperationState;
  onClearPlacementsForCurrentEmptyScene: () => Promise<void>;
  onSave: () => Promise<void>;
};

export function AssemblyWorkspaceFeedback({
  actionLabel,
  alignmentRiskPlacementCount,
  canTriggerSave,
  placementCount,
  readiness,
  saveError,
  saveState,
  saveStatus,
  onClearPlacementsForCurrentEmptyScene,
  onSave,
}: AssemblyWorkspaceFeedbackProps) {
  const showAlignmentReview = alignmentRiskPlacementCount > 0;

  return (
    <>
      <div className="chapter-studio-panel-heading">
        <div>
          <h2>Assembly</h2>
          <p>{placementCount} placements</p>
        </div>
        <div className="assembly-workspace-header-actions">
          <CoursePlannerStatusBadge tone={saveState === "saved" ? "success" : saveState === "saving" ? "info" : "danger"}>
            {saveStateLabel(saveState)}
          </CoursePlannerStatusBadge>
          <button
            type="button"
            className="course-planner-primary-action chapter-studio-icon-action"
            disabled={!canTriggerSave || saveStatus?.status === "pending"}
            onClick={() => void onSave()}
          >
            <Save size={16} aria-hidden="true" />
            {saveStatus?.status === "pending" ? "Saving Assembly" : actionLabel}
          </button>
        </div>
      </div>

      {saveState !== "saved" && saveError ? (
        <div role="status" className="course-planner-inline-error">
          <CoursePlannerStatusBadge tone="danger">{saveState === "conflict" ? "Save conflict" : "Save failed"}</CoursePlannerStatusBadge>
          <p>{saveError}</p>
        </div>
      ) : null}

      {showAlignmentReview ? (
        <div className="chapter-studio-subpanel assembly-alignment-review">
          <div className="assembly-alignment-review-copy">
            <CoursePlannerStatusBadge tone="warning">Alignment risk</CoursePlannerStatusBadge>
            <p>{alignmentRiskPlacementCount} placements need alignment review.</p>
            <small>Replacing the Empty Scene kept your existing placements. Review them, then save the current Assembly, or clear them for a fresh layout.</small>
          </div>
          <ConfirmActionDialog
            trigger={(
              <button type="button" className="course-planner-secondary-action">
                Clear placements
              </button>
            )}
            title="Clear placements for the new Empty Scene?"
            description="This removes the preserved placements from the current Assembly manifest while keeping Chapter Assets, Complete Scene Images, pipeline run associations, and the locked Final snapshot."
            confirmLabel="Confirm clear"
            onConfirm={onClearPlacementsForCurrentEmptyScene}
          />
        </div>
      ) : null}

      {readiness.reasons.length > 0 ? (
        <div className="chapter-studio-subpanel">
          <h3>Readiness blockers</h3>
          <div className="chapter-studio-readiness-list">
            {readiness.reasons.map((reason) => (
              <p key={reason}>{reason}</p>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

function saveStateLabel(saveState: AssemblyWorkspaceSaveState) {
  if (saveState === "conflict") {
    return "Save conflict";
  }
  if (saveState === "saving") {
    return "Saving";
  }
  return saveState === "saved" ? "Saved" : "Save failed";
}
