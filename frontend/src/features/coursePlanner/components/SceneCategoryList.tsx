import { Archive, Pencil, Plus, Trash2 } from "lucide-react";
import { ConfirmActionDialog } from "../../../shared/ui/ConfirmActionDialog";
import { InlineItemActions } from "./CoursePlannerChrome";
import type { ScenePack } from "../types";

type SceneCategoryListProps = {
  isBusy: boolean;
  scenePacks: ScenePack[];
  selectedScenePackId: string | null;
  onArchiveScenePack: (scenePack: ScenePack) => void;
  onCreateScenePack: () => void;
  onDeleteScenePack: (scenePack: ScenePack) => void;
  onEditScenePack: (scenePack: ScenePack) => void;
  onSelectScenePack: (scenePackId: string) => void;
};

export function SceneCategoryList({
  isBusy,
  scenePacks,
  selectedScenePackId,
  onArchiveScenePack,
  onCreateScenePack,
  onDeleteScenePack,
  onEditScenePack,
  onSelectScenePack,
}: SceneCategoryListProps) {
  return (
    <aside className="scene-category-list-panel" aria-label="Scene Pack panel">
      <div className="planning-panel-header">
        <div>
          <h2>Scene Packs</h2>
          <p>{scenePacks.length > 0 ? "选择一个 Scene Pack 来生成和整理 Chapter。" : "先创建 Scene Pack。"}</p>
        </div>
        <button type="button" aria-label="Add Scene Pack" disabled={isBusy} onClick={onCreateScenePack}>
          <Plus size={16} aria-hidden="true" />
        </button>
      </div>

      <nav className="scene-category-list" aria-label="Scene Pack list">
        {scenePacks.length > 0 ? (
          scenePacks.map((scenePack) => {
            const isActive = scenePack.id === selectedScenePackId;
            const canMutate = !isBusy;
            const chapterCount = scenePack.chapterIds.length;
            const metaText = `${chapterCount} accepted Chapters · ${scenePack.status}`;
            const archiveDisabled = !canMutate || scenePack.status === "archived";

            return (
              <article
                key={scenePack.id}
                role="group"
                aria-label={`Scene Pack ${scenePack.title}`}
                className={`scene-pack-card${isActive ? " is-active" : ""}`}
              >
                <button
                  type="button"
                  className="scene-pack-card__body"
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => onSelectScenePack(scenePack.id)}
                >
                  <span className="scene-pack-card__title">{scenePack.title}</span>
                  <span className="scene-pack-card__intent">{scenePack.intent}</span>
                  <span className="scene-pack-card__meta">{metaText}</span>
                </button>
                <InlineItemActions
                  ariaLabel={`Scene Pack actions for ${scenePack.title}`}
                >
                  <button
                    type="button"
                    aria-label={`Edit Scene Pack ${scenePack.title}`}
                    disabled={!canMutate}
                    onClick={() => onEditScenePack(scenePack)}
                  >
                    <Pencil size={14} aria-hidden="true" />
                    Edit
                  </button>
                  <ConfirmActionDialog
                    trigger={(
                      <button
                        type="button"
                        aria-label={`Archive Scene Pack ${scenePack.title}`}
                        disabled={archiveDisabled}
                      >
                        <Archive size={14} aria-hidden="true" />
                        Archive
                      </button>
                    )}
                    title="Archive Scene Pack"
                    description="Archive this Scene Pack and keep its files available for later review."
                    confirmLabel="Archive Scene Pack"
                    onConfirm={() => onArchiveScenePack(scenePack)}
                  />
                  <ConfirmActionDialog
                    trigger={(
                      <button
                        type="button"
                        aria-label={`Delete Scene Pack ${scenePack.title}`}
                        className="course-planner-inline-action is-destructive"
                        disabled={!canMutate}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                        Delete
                      </button>
                    )}
                    title="Delete Scene Pack"
                    description="Remove this Scene Pack from the active list. Existing files stay in the scene library."
                    confirmLabel="Delete Scene Pack"
                    onConfirm={() => onDeleteScenePack(scenePack)}
                  />
                </InlineItemActions>
              </article>
            );
          })
        ) : (
          <p className="course-planner-empty">No Scene Packs yet.</p>
        )}
      </nav>
    </aside>
  );
}
