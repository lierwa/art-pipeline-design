import type { ChapterCandidate, ScenePack } from "../types";

type CandidateChapterBoardProps = {
  candidates: ChapterCandidate[];
  deletingCandidateId: string | null;
  acceptingCandidateId: string | null;
  activeScenePack: ScenePack | null;
  onAccept: (candidateId: string) => void;
  onDelete: (candidateId: string) => void;
  onEdit: (candidate: ChapterCandidate) => void;
};

export function CandidateChapterBoard({
  acceptingCandidateId,
  activeScenePack,
  candidates,
  deletingCandidateId,
  onAccept,
  onDelete,
  onEdit,
}: CandidateChapterBoardProps) {
  const isChapterListLocked = Boolean(activeScenePack?.chapterListLocked);

  return (
    <section className="candidate-chapter-board" aria-label="AI Chapter candidate pool">
      <div className="planning-panel-header">
        <div>
          <h2>AI Chapter Candidates</h2>
          <p>{candidateStatus(activeScenePack, candidates.length, isChapterListLocked)}</p>
        </div>
      </div>

      <div className="candidate-card-list">
        {candidates.length > 0 ? (
          candidates.map((candidate) => (
            <CandidateChapterCard
              key={candidate.id}
              candidate={candidate}
              isAccepting={acceptingCandidateId === candidate.id}
              isChapterListLocked={isChapterListLocked}
              isDeleting={deletingCandidateId === candidate.id}
              onAccept={onAccept}
              onDelete={onDelete}
              onEdit={onEdit}
            />
          ))
        ) : (
          <p className="course-planner-empty">
            {activeScenePack ? "No AI Chapter candidates yet." : "Select a Scene Pack to load candidates."}
          </p>
        )}
      </div>
    </section>
  );
}

function candidateStatus(activeScenePack: ScenePack | null, candidateCount: number, isChapterListLocked: boolean): string {
  if (!activeScenePack) {
    return "等待选择 Scene Pack。";
  }
  if (isChapterListLocked) {
    return "Chapter list locked. Unlock to accept more candidates.";
  }
  return candidateCount > 0 ? `${candidateCount} candidates available.` : "生成候选后会显示场景、事件、空间和角色概念。";
}

type CandidateChapterCardProps = {
  candidate: ChapterCandidate;
  isAccepting: boolean;
  isChapterListLocked: boolean;
  isDeleting: boolean;
  onAccept: (candidateId: string) => void;
  onDelete: (candidateId: string) => void;
  onEdit: (candidate: ChapterCandidate) => void;
};

function CandidateChapterCard({
  candidate,
  isAccepting,
  isChapterListLocked,
  isDeleting,
  onAccept,
  onDelete,
  onEdit,
}: CandidateChapterCardProps) {
  const isBusy = isAccepting || isDeleting;

  return (
    <article className="candidate-chapter-card" aria-label={`候选 Chapter ${candidate.title}`}>
      <div className="candidate-card-header">
        <div>
          <h3>{candidate.title}</h3>
          <p>{candidate.summary}</p>
        </div>
        <span>候选</span>
      </div>

      <dl className="candidate-detail-grid">
        <CandidateDetail label="Scene brief" value={candidate.seed.chapterIntent} />
        <CandidateDetail label="Event seed" value={candidate.seed.eventSeed} />
        <CandidateDetail label="Spatial seed" value={candidate.seed.spatialSeed} />
        <CandidateDetail label="Objects" value={candidate.seed.objectCoverageHint.join("、") || "未指定"} />
        <CandidateDetail label="Character concept" value={characterConcept(candidate)} />
      </dl>

      <div className="candidate-card-actions">
        <button type="button" disabled={isBusy || isChapterListLocked} onClick={() => onAccept(candidate.id)}>
          {isAccepting ? "接受中..." : "接受"}
        </button>
        <button type="button" disabled={isBusy} onClick={() => onEdit(candidate)}>
          编辑
        </button>
        <button type="button" disabled={isBusy} onClick={() => onDelete(candidate.id)}>
          {isDeleting ? "删除中..." : "删除"}
        </button>
      </div>
    </article>
  );
}

function characterConcept(candidate: ChapterCandidate): string {
  const { mainCastHint, supportingCastHint, constraints } = candidate.seed.characterConceptHint;
  return [mainCastHint, supportingCastHint, constraints.join("、")].filter(Boolean).join(" / ");
}

function CandidateDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
