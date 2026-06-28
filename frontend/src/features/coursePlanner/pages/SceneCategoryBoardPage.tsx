import { useState } from "react";

import { CandidateChapterBoard } from "../components/CandidateChapterBoard";
import "../components/coursePlanner.css";
import { PlanningBriefPanel } from "../components/PlanningBriefPanel";
import { SceneCategoryList } from "../components/SceneCategoryList";
import { SelectedChapterSequence } from "../components/SelectedChapterSequence";
import { useCoursePlannerState } from "../hooks/useCoursePlannerState";
import type { AsyncStatusMap, ChapterCandidate } from "../types";

export function SceneCategoryBoardPage() {
  const planner = useCoursePlannerState();
  const [candidateForEdit, setCandidateForEdit] = useState<ChapterCandidate | null>(null);
  const [isBatchRevisionOpen, setIsBatchRevisionOpen] = useState(false);
  const [batchFeedback, setBatchFeedback] = useState("");
  const activeScenePack = planner.activeScenePack;
  const activeScenePackId = activeScenePack?.id ?? null;
  const candidates = planner.candidatesForActiveScenePack;
  const chapters = planner.chaptersForActiveScenePack;

  const loadError = statusError(planner.asyncStatus, "load-state");
  const pageError = loadError ?? firstFailedOperationError(planner.asyncStatus);

  async function createScenePack() {
    const title = window.prompt("Scene Pack title");
    if (!title?.trim()) {
      return;
    }
    const intent = window.prompt("Scene Pack intent", title.trim()) ?? title.trim();
    await planner.createScenePack({ title: title.trim(), intent: intent.trim(), notes: null });
  }

  async function renameScenePack() {
    if (!activeScenePackId || !activeScenePack) {
      return;
    }
    const title = window.prompt("Rename Scene Pack", activeScenePack.title);
    if (title?.trim()) {
      await planner.updateScenePack(activeScenePackId, { title: title.trim() });
    }
  }

  async function archiveScenePack() {
    if (activeScenePackId) {
      await planner.updateScenePack(activeScenePackId, { status: "archived" });
    }
  }

  async function deleteScenePack() {
    if (activeScenePackId) {
      await planner.deleteScenePack(activeScenePackId);
    }
  }

  async function submitBatchRevision() {
    if (!activeScenePackId || !batchFeedback.trim()) {
      return;
    }
    await planner.reviseChapterCandidates(activeScenePackId, { feedback: batchFeedback.trim() });
    setBatchFeedback("");
    setIsBatchRevisionOpen(false);
  }

  return (
    <main className="scene-category-board-page">
      <div className="scene-category-board-header">
        <div>
          <h1>Scene Pack / Chapter Board</h1>
          <p>{activeScenePack?.intent ?? "Manage Scene Packs, AI candidates, and the accepted Chapter list."}</p>
        </div>
        <span>{operationLabel(planner.asyncStatus)}</span>
      </div>

      {pageError ? <p className="course-planner-error">{pageError}</p> : null}

      <div className="scene-category-board-layout">
        <SceneCategoryList
          isBusy={isAnyPending(planner.asyncStatus)}
          scenePacks={planner.scenePacks}
          selectedScenePackId={activeScenePackId}
          onArchiveScenePack={() => void archiveScenePack()}
          onCreateScenePack={() => void createScenePack()}
          onDeleteScenePack={() => void deleteScenePack()}
          onRenameScenePack={() => void renameScenePack()}
          onSelectScenePack={planner.setActiveScenePackId}
        />
        <div className="scene-category-board-main">
          <PlanningBriefPanel
            activeScenePack={activeScenePack}
            candidateCount={candidates.length}
            chapterCount={chapters.length}
            isGenerating={isPending(planner.asyncStatus, `generateCandidates:${activeScenePackId}`)}
            isRevising={isPending(planner.asyncStatus, `reviseCandidates:${activeScenePackId}`)}
            onGenerate={() => {
              if (activeScenePackId) {
                void planner.generateChapterCandidates(activeScenePackId, {}, { mode: "replace" });
              }
            }}
            onGenerateMore={() => {
              if (activeScenePackId) {
                void planner.generateChapterCandidates(activeScenePackId);
              }
            }}
            onOpenBatchRevision={() => setIsBatchRevisionOpen(true)}
          />
          <CandidateChapterBoard
            acceptingCandidateId={pendingId(planner.asyncStatus, "acceptCandidate")}
            activeScenePack={activeScenePack}
            candidates={candidates}
            deletingCandidateId={pendingId(planner.asyncStatus, "deleteCandidate")}
            onAccept={(candidateId) => {
              if (activeScenePackId && !activeScenePack?.chapterListLocked) {
                void planner.acceptChapterCandidate(activeScenePackId, candidateId);
              }
            }}
            onDelete={(candidateId) => {
              if (activeScenePackId) {
                void planner.deleteChapterCandidate(activeScenePackId, candidateId);
              }
            }}
            onEdit={setCandidateForEdit}
          />
        </div>
        <SelectedChapterSequence
          chapters={chapters}
          deletingChapterId={pendingId(planner.asyncStatus, "deleteChapter")}
          isLocking={isPending(planner.asyncStatus, `setChapterListLocked:${activeScenePackId}`)}
          isReordering={isPending(planner.asyncStatus, `reorderChapters:${activeScenePackId}`)}
          scenePack={activeScenePack}
          onDeleteChapter={(chapterId) => {
            if (activeScenePackId && !activeScenePack?.chapterListLocked && confirmDeleteChapter()) {
              void planner.deleteChapter(activeScenePackId, chapterId);
            }
          }}
          onReorderChapters={(chapterIds) => {
            if (activeScenePackId && !activeScenePack?.chapterListLocked) {
              void planner.reorderChapters(activeScenePackId, chapterIds);
            }
          }}
          onToggleLock={() => {
            if (activeScenePackId) {
              void planner.setChapterListLocked(activeScenePackId, !activeScenePack?.chapterListLocked);
            }
          }}
        />
      </div>

      {candidateForEdit ? (
        <section className="candidate-edit-drawer" role="dialog" aria-label={`Edit candidate ${candidateForEdit.title}`}>
          <div className="planning-panel-header">
            <div>
              <h2>{candidateForEdit.title}</h2>
              <p>单卡编辑入口已保留；当前后端只支持整批反馈重生成。</p>
            </div>
            <button type="button" onClick={() => setCandidateForEdit(null)}>
              Close
            </button>
          </div>
          <p>{candidateForEdit.summary}</p>
          <button type="button" onClick={() => {
            setCandidateForEdit(null);
            setIsBatchRevisionOpen(true);
          }}>
            Open batch revision
          </button>
        </section>
      ) : null}

      {isBatchRevisionOpen ? (
        <section className="candidate-edit-drawer" role="dialog" aria-label="Revise candidate batch">
          <div className="planning-panel-header">
            <div>
              <h2>调整整批</h2>
              <p>把反馈发送给 AI，替换当前候选池；已接受的 Chapter 不会被覆盖。</p>
            </div>
            <button type="button" onClick={() => setIsBatchRevisionOpen(false)}>
              Close
            </button>
          </div>
          <label className="planning-field">
            <span>Revision feedback</span>
            <textarea
              rows={3}
              value={batchFeedback}
              onChange={(event) => setBatchFeedback(event.target.value)}
              placeholder="例如：减少学校场景，增加厨房和客厅物件互动。"
            />
          </label>
          <button
            type="button"
            className="course-planner-primary-action"
            disabled={!batchFeedback.trim() || isPending(planner.asyncStatus, `reviseCandidates:${activeScenePackId}`)}
            onClick={() => void submitBatchRevision()}
          >
            {isPending(planner.asyncStatus, `reviseCandidates:${activeScenePackId}`) ? "调整中..." : "Submit revision"}
          </button>
        </section>
      ) : null}
    </main>
  );
}

function isPending(asyncStatus: AsyncStatusMap, key: string): boolean {
  return Boolean(key && asyncStatus[key]?.status === "pending");
}

function isAnyPending(asyncStatus: AsyncStatusMap): boolean {
  return Object.values(asyncStatus).some((operation) => operation?.status === "pending");
}

function pendingId(asyncStatus: AsyncStatusMap, prefix: string): string | null {
  const pendingEntry = Object.entries(asyncStatus).find(([key, operation]) => (
    key.startsWith(`${prefix}:`) && operation?.status === "pending"
  ));
  return pendingEntry ? pendingEntry[0].slice(prefix.length + 1) : null;
}

function statusError(asyncStatus: AsyncStatusMap, key: string): string | null {
  return asyncStatus[key]?.status === "failed" ? asyncStatus[key]?.error ?? "Course Planner action failed." : null;
}

function firstFailedOperationError(asyncStatus: AsyncStatusMap): string | null {
  return Object.values(asyncStatus).find((operation) => operation?.status === "failed")?.error ?? null;
}

function operationLabel(asyncStatus: AsyncStatusMap): string {
  const pendingKey = Object.entries(asyncStatus).find(([, operation]) => operation?.status === "pending")?.[0];
  return pendingKey ? "working" : "ready";
}

function confirmDeleteChapter(): boolean {
  // WHY: Chapter 删除可能带着 Prompt Version / Image Attempt 历史；统一确认比在 UI 层猜测 lineage 状态更稳。
  return window.confirm("Delete this Chapter from the Scene Pack?");
}
