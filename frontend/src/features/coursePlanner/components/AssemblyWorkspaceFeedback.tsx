import { ArrowLeft } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { useNavigate } from "react-router";

import { ConfirmActionDialog } from "../../../shared/ui/ConfirmActionDialog";
import type { AssemblyReadiness } from "../assembly/assemblyReadiness";
import {
  CoursePlannerIconLink,
  CoursePlannerStatusBadge,
  CoursePlannerWorkspaceHeader,
} from "./CoursePlannerChrome";
import type { AssemblyWorkspaceSaveState } from "./AssemblyWorkspacePanel";

type AssemblyWorkspaceFeedbackProps = {
  alignmentRiskPlacementCount: number;
  backTo?: string;
  chapterTitle?: string;
  placementCount: number;
  readiness: AssemblyReadiness;
  saveError: string | null;
  saveState: AssemblyWorkspaceSaveState;
  onBeforeBackNavigation?: () => Promise<boolean>;
  onClearPlacementsForCurrentEmptyScene: () => Promise<void>;
};

export function AssemblyWorkspaceFeedback({
  alignmentRiskPlacementCount,
  backTo,
  chapterTitle,
  placementCount,
  readiness,
  saveError,
  saveState,
  onBeforeBackNavigation,
  onClearPlacementsForCurrentEmptyScene,
}: AssemblyWorkspaceFeedbackProps) {
  const showAlignmentReview = alignmentRiskPlacementCount > 0;

  return (
    <div className="assembly-workspace-feedback">
      <CoursePlannerWorkspaceHeader
        actions={<span className="assembly-editor-context-count">{placementCountLabel(placementCount)}</span>}
        backAction={backTo ? <BackNavigationLink backTo={backTo} onBeforeBackNavigation={onBeforeBackNavigation} /> : null}
        eyebrow="Assembly"
        title={chapterTitle ?? "Untitled Chapter"}
        variant="compact"
      />

      {saveState !== "saved" && saveError ? (
        <div role="status" className="course-planner-inline-error">
          <CoursePlannerStatusBadge tone="danger">{saveState === "conflict" ? "Conflict" : "Error"}</CoursePlannerStatusBadge>
          <p>{saveFeedbackMessage(saveState, saveError)}</p>
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
    </div>
  );
}

function BackNavigationLink({
  backTo,
  onBeforeBackNavigation,
}: {
  backTo: string;
  onBeforeBackNavigation?: () => Promise<boolean>;
}) {
  const navigate = useNavigate();
  const [isNavigating, setIsNavigating] = useState(false);

  const handleClick = async (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    if (!onBeforeBackNavigation) {
      return;
    }
    event.preventDefault();
    if (isNavigating) {
      return;
    }
    setIsNavigating(true);
    let didNavigate = false;
    try {
      // WHY: Back 是离开高频编辑面的持久化边界；先 flush 可保存的 dirty draft，
      // 避免 unmount 清掉 debounce timer 后把作者刚改的坐标丢在本地内存里。
      const canNavigate = await onBeforeBackNavigation();
      if (canNavigate) {
        didNavigate = true;
        navigate(backTo);
      }
    } finally {
      if (!didNavigate) {
        setIsNavigating(false);
      }
    }
  };

  return (
    <CoursePlannerIconLink
      to={backTo}
      aria-disabled={isNavigating}
      ariaLabel="Back to Chapter"
      title="Back to Chapter"
      onClick={(event) => void handleClick(event)}
    >
      <ArrowLeft size={16} aria-hidden="true" />
    </CoursePlannerIconLink>
  );
}

function saveFeedbackMessage(saveState: AssemblyWorkspaceSaveState, saveError: string) {
  if (saveState === "conflict") {
    return `${saveError} Retry overwrites the newer server assembly with your local draft.`;
  }
  if (saveState === "failed") {
    return `${saveError} Retry saves the same local manifest after the failed request.`;
  }
  return saveError;
}

function placementCountLabel(placementCount: number) {
  return `${placementCount} ${placementCount === 1 ? "placement" : "placements"}`;
}
