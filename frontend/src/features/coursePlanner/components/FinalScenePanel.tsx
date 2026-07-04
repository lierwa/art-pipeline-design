import { useState } from "react";

import type { ChapterScenePackage } from "../types";
import { CoursePlannerStatusBadge } from "./CoursePlannerChrome";
import type { AssemblyWorkspaceLockFinalState } from "./AssemblyWorkspacePanel";

type FinalScenePanelProps = {
  assemblyState: AssemblyWorkspaceLockFinalState;
  scenePackage: ChapterScenePackage;
  onLockFinal: () => Promise<ChapterScenePackage | null>;
};

export function FinalScenePanel({
  assemblyState,
  onLockFinal,
  scenePackage,
}: FinalScenePanelProps) {
  const [isLocking, setIsLocking] = useState(false);
  const ready = assemblyState.readiness.is_ready;
  const dirtyActionHint = ready && assemblyState.hasDirtyChanges
    ? assemblyState.saveState === "saving"
      ? "Lock Final will wait for the current Assembly save."
      : "Lock Final will save current Assembly edits first."
    : null;

  async function handleLockFinal() {
    setIsLocking(true);
    try {
      await onLockFinal();
    } finally {
      setIsLocking(false);
    }
  }

  return (
    <section className="chapter-studio-panel chapter-studio-panel-stack" aria-label="Final scene">
      <div className="chapter-studio-panel-heading">
        <div>
          <h2>Final</h2>
          <p>{scenePackage.final_scene?.original_filename ?? "Not locked"}</p>
        </div>
        <CoursePlannerStatusBadge tone={scenePackage.final_scene ? "success" : ready ? "info" : "warning"}>
          {scenePackage.final_scene ? "Locked" : ready ? "Ready" : "Pending"}
        </CoursePlannerStatusBadge>
      </div>

      <div className="chapter-studio-actions">
        <button
          type="button"
          className="course-planner-primary-action"
          disabled={!ready || isLocking}
          onClick={() => void handleLockFinal()}
        >
          Lock Final
        </button>
      </div>

      {dirtyActionHint ? <p>{dirtyActionHint}</p> : null}
    </section>
  );
}
