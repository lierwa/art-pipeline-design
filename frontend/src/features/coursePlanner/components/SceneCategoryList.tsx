import type { ScenePack } from "../types";

type SceneCategoryListProps = {
  isBusy: boolean;
  scenePacks: ScenePack[];
  selectedScenePackId: string | null;
  onArchiveScenePack: () => void;
  onCreateScenePack: () => void;
  onDeleteScenePack: () => void;
  onRenameScenePack: () => void;
  onSelectScenePack: (scenePackId: string) => void;
};

export function SceneCategoryList({
  isBusy,
  scenePacks,
  selectedScenePackId,
  onArchiveScenePack,
  onCreateScenePack,
  onDeleteScenePack,
  onRenameScenePack,
  onSelectScenePack,
}: SceneCategoryListProps) {
  const hasSelection = Boolean(selectedScenePackId);

  return (
    <aside className="scene-category-list-panel" aria-label="Scene Pack panel">
      <div className="planning-panel-header">
        <div>
          <h2>Scene Packs</h2>
          <p>{scenePacks.length > 0 ? "选择一个 Scene Pack 来生成和整理 Chapter。" : "先创建 Scene Pack。"}</p>
        </div>
        <button type="button" aria-label="Add Scene Pack" disabled={isBusy} onClick={onCreateScenePack}>
          +
        </button>
      </div>

      <nav className="scene-category-list" aria-label="Scene Pack list">
        {scenePacks.length > 0 ? (
          scenePacks.map((scenePack) => (
            <button
              type="button"
              className={scenePack.id === selectedScenePackId ? "is-active" : ""}
              key={scenePack.id}
              aria-current={scenePack.id === selectedScenePackId ? "page" : undefined}
              onClick={() => onSelectScenePack(scenePack.id)}
            >
              <strong>{scenePack.title}</strong>
              <span>{scenePack.intent}</span>
              <small>{scenePack.chapterIds.length} accepted Chapters · {scenePack.status}</small>
            </button>
          ))
        ) : (
          <p className="course-planner-empty">No Scene Packs yet.</p>
        )}
      </nav>

      <div className="scene-pack-actions" aria-label="Scene Pack actions">
        <button type="button" aria-label="Rename Scene Pack" disabled={isBusy || !hasSelection} onClick={onRenameScenePack}>
          Rename
        </button>
        <button type="button" aria-label="Archive Scene Pack" disabled={isBusy || !hasSelection} onClick={onArchiveScenePack}>
          Archive
        </button>
        <button type="button" aria-label="Delete Scene Pack" disabled={isBusy || !hasSelection} onClick={onDeleteScenePack}>
          Delete
        </button>
      </div>
    </aside>
  );
}
