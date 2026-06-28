import type { ScenePack } from "../types";

type PlanningBriefPanelProps = {
  activeScenePack: ScenePack | null;
  candidateCount: number;
  chapterCount: number;
  isGenerating: boolean;
  isRevising: boolean;
  onGenerate: () => void;
  onGenerateMore: () => void;
  onOpenBatchRevision: () => void;
};

export function PlanningBriefPanel({
  activeScenePack,
  candidateCount,
  chapterCount,
  isGenerating,
  isRevising,
  onGenerate,
  onGenerateMore,
  onOpenBatchRevision,
}: PlanningBriefPanelProps) {
  const hasScenePack = Boolean(activeScenePack);
  const hasCandidates = candidateCount > 0;

  return (
    <section className="planning-brief-panel" aria-label="Scene Pack brief">
      <div className="planning-panel-header">
        <div>
          <h2>{activeScenePack?.title ?? "No Scene Pack Selected"}</h2>
          <p>{activeScenePack?.intent ?? "创建或选择 Scene Pack 后生成 Chapter 候选。"}</p>
        </div>
        <span>{activeScenePack?.status ?? "empty"}</span>
      </div>

      {activeScenePack?.notes ? <p className="planning-summary">{activeScenePack.notes}</p> : null}

      <dl className="planning-progress" aria-label="Scene Pack planning status">
        <div>
          <dt>Candidate pool</dt>
          <dd>{candidateCount} AI candidates</dd>
        </div>
        <div>
          <dt>Chapter list</dt>
          <dd>{chapterCount} accepted Chapters</dd>
        </div>
      </dl>

      <div className="planning-brief-actions">
        <button
          type="button"
          className="course-planner-primary-action"
          disabled={!hasScenePack || isGenerating}
          onClick={onGenerate}
        >
          {isGenerating ? "生成中..." : hasCandidates ? "重新生成候选" : "生成候选"}
        </button>
        <button type="button" disabled={!hasScenePack || isGenerating} onClick={onGenerateMore}>
          {isGenerating ? "追加中..." : "生成更多"}
        </button>
        <button type="button" disabled={!hasScenePack || isRevising} onClick={onOpenBatchRevision}>
          {isRevising ? "调整中..." : "调整整批"}
        </button>
      </div>
    </section>
  );
}
