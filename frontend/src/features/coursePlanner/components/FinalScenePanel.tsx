import { useState } from "react";
import { ImageIcon } from "lucide-react";

import { ConfirmActionDialog } from "../../../shared/ui/ConfirmActionDialog";
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
  const actionLabel = isLocked ? "Replace Final" : "Lock Final";
  const actionButton = (
    <button
      type="button"
      className="course-planner-secondary-action"
      disabled={!ready || isLocking}
      onClick={isLocked ? undefined : () => void handleLockFinal()}
    >
      {isLocking ? "Locking..." : actionLabel}
    </button>
  );

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
        {isLocked ? (
          <ConfirmActionDialog
            trigger={actionButton}
            title="Replace Final Scene"
            description="This will overwrite the locked Final Scene snapshot with the current Assembly, prompt, reference, and placed asset facts. Existing exported history is replaced for this Chapter."
            confirmLabel="Replace Final"
            onConfirm={() => {
              // WHY: backend 的 Lock Final 是唯一冻结边界；已有终稿时必须让作者确认覆盖，
              // 避免把已审过的 prompt/reference/asset snapshot 静默替换掉。
              void handleLockFinal();
            }}
          />
        ) : actionButton}
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
