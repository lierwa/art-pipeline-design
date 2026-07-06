import { useState } from "react";
import { ImageIcon } from "lucide-react";

import type { ChapterScenePackage } from "../types";
import type { AssemblyReadiness } from "../assembly/assemblyReadiness";
import { scenePackageMediaUrl } from "../scenePackageMedia";

type FinalScenePanelProps = {
  assemblyReadiness: AssemblyReadiness;
  scenePackage: ChapterScenePackage;
  onLockFinal: () => Promise<ChapterScenePackage | null>;
};

export function FinalScenePanel({
  assemblyReadiness,
  onLockFinal,
  scenePackage,
}: FinalScenePanelProps) {
  const [isLocking, setIsLocking] = useState(false);
  const ready = assemblyReadiness.is_ready;
  const isLocked = Boolean(scenePackage.final_scene);

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
          <p>{scenePackage.final_scene ? "Locked" : "Not locked"}</p>
        </div>
        <button
          type="button"
          className="course-planner-secondary-action"
          disabled={isLocked || !ready || isLocking}
          onClick={() => void handleLockFinal()}
        >
          {isLocked ? "Locked" : "Lock Final"}
        </button>
      </div>

      <div className="chapter-final-body">
        <div className="chapter-final-preview">
          {isLocked && scenePackage.final_scene ? (
            <img
              alt=""
              src={scenePackageMediaUrl(scenePackage.chapter_id, "final_scene", scenePackage.final_scene.id)}
            />
          ) : (
            <ImageIcon size={42} aria-hidden="true" />
          )}
        </div>
        <div className="chapter-final-copy">
          <p>{scenePackage.final_scene ? `${scenePackage.final_scene.original_filename} is locked for export.` : "Lock final to generate and export final images."}</p>
        </div>
      </div>
    </section>
  );
}
