import type { ChapterScenePackage } from "../types";
import { CoursePlannerStatusBadge } from "./CoursePlannerChrome";
import { exportAssemblyPreviewFile, isAssemblyReady } from "./AssemblyWorkspacePanel";

type FinalScenePanelProps = {
  scenePackage: ChapterScenePackage;
  onLockFinal: (file: File) => Promise<ChapterScenePackage | null>;
};

export function FinalScenePanel({ onLockFinal, scenePackage }: FinalScenePanelProps) {
  const ready = isAssemblyReady(scenePackage);

  async function handleLockFinal() {
    const file = await exportAssemblyPreviewFile(scenePackage);
    await onLockFinal(file);
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
        <button type="button" className="course-planner-primary-action" disabled={!ready} onClick={() => void handleLockFinal()}>
          Lock Final
        </button>
      </div>
    </section>
  );
}
