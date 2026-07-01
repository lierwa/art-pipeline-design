import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { WorkflowToast } from "../../../app/components/WorkflowToast";
import { CandidateChapterBoard } from "../components/CandidateChapterBoard";
import {
  CoursePlannerDialog,
  CoursePlannerDrawer,
  CoursePlannerPageHeader,
  CoursePlannerStatusBadge,
} from "../components/CoursePlannerChrome";
import "../components/coursePlanner.css";
import { PlanningBriefPanel } from "../components/PlanningBriefPanel";
import { SceneCategoryList } from "../components/SceneCategoryList";
import { SelectedChapterSequence } from "../components/SelectedChapterSequence";
import { useCoursePlannerState } from "../hooks/useCoursePlannerState";
import type { AsyncStatusMap, ScenePack } from "../types";

type ScenePackEditorState = {
  mode: "create" | "edit";
  scenePackId: string | null;
  title: string;
  intent: string;
  notes: string;
};

type FailedOperationToast = {
  key: string;
  error: string;
};

export function SceneCategoryBoardPage() {
  const planner = useCoursePlannerState();
  const [isBatchRevisionOpen, setIsBatchRevisionOpen] = useState(false);
  const [batchFeedback, setBatchFeedback] = useState("");
  const [dismissedToastKey, setDismissedToastKey] = useState<string | null>(null);
  const [scenePackEditor, setScenePackEditor] = useState<ScenePackEditorState | null>(null);
  const activeScenePack = planner.activeScenePack;
  const activeScenePackId = activeScenePack?.id ?? null;
  const candidates = planner.candidatesForActiveScenePack;
  const chapters = planner.chaptersForActiveScenePack;
  const failedOperation = firstFailedOperation(planner.asyncStatus);
  const inlineError = failedOperation?.error ?? null;
  const failedToastKey = failedOperation ? `${failedOperation.key}:${failedOperation.error}` : null;
  const visibleToast = failedOperation && failedToastKey !== dismissedToastKey
    ? {
        tone: "danger" as const,
        title: "Course Planner action failed",
        message: failedOperation.error,
      }
    : null;
  const feedbackToast = (
    <WorkflowToast
      errorDurationMs={5000}
      toast={visibleToast}
      onDismiss={() => {
        if (failedToastKey) {
          setDismissedToastKey(failedToastKey);
        }
      }}
    />
  );

  useEffect(() => {
    if (!failedToastKey) {
      setDismissedToastKey(null);
    }
  }, [failedToastKey]);

  function openCreateScenePack() {
    setScenePackEditor({
      mode: "create",
      scenePackId: null,
      title: "",
      intent: "",
      notes: "",
    });
  }

  function openEditScenePack(scenePack: ScenePack) {
    setScenePackEditor({
      mode: "edit",
      scenePackId: scenePack.id,
      title: scenePack.title,
      intent: scenePack.intent,
      notes: scenePack.notes ?? "",
    });
  }

  function closeScenePackEditor() {
    setScenePackEditor(null);
  }

  async function submitScenePackEditor() {
    if (!scenePackEditor) {
      return;
    }
    const title = scenePackEditor.title.trim();
    const intent = scenePackEditor.intent.trim();
    if (!title || !intent) {
      return;
    }
    const notes = scenePackEditor.notes.trim() || null;
    const result = scenePackEditor.mode === "create"
      ? await planner.createScenePack({ title, intent, notes })
      : scenePackEditor.scenePackId
        ? await planner.updateScenePack(scenePackEditor.scenePackId, { title, intent, notes })
        : null;
    if (result) {
      setScenePackEditor(null);
    }
  }

  async function archiveScenePack(scenePack: ScenePack) {
    await planner.updateScenePack(scenePack.id, { status: "archived" });
  }

  async function deleteScenePack(scenePack: ScenePack) {
    await planner.deleteScenePack(scenePack.id);
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
    <>
      {createPortal(feedbackToast, document.body)}

      <main className="scene-category-board-page">
        <CoursePlannerPageHeader
          title="Scene Pack / Chapter Board"
          description={activeScenePack?.title ?? "Select a Scene Pack to start Chapter planning."}
          status={<CoursePlannerStatusBadge label={operationLabel(planner.asyncStatus)} tone={operationTone(planner.asyncStatus)} />}
        />
        {inlineError ? <p className="course-planner-error" role="alert">{inlineError}</p> : null}

        <div className="scene-category-board-layout">
          <SceneCategoryList
            isBusy={isAnyPending(planner.asyncStatus)}
            scenePacks={planner.scenePacks}
            selectedScenePackId={activeScenePackId}
            onArchiveScenePack={(scenePack) => void archiveScenePack(scenePack)}
            onCreateScenePack={openCreateScenePack}
            onDeleteScenePack={(scenePack) => void deleteScenePack(scenePack)}
            onEditScenePack={openEditScenePack}
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
                if (activeScenePackId && candidates.length > 0) {
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
                if (activeScenePackId) {
                  void planner.acceptChapterCandidate(activeScenePackId, candidateId);
                }
              }}
              onDelete={(candidateId) => {
                if (activeScenePackId) {
                  void planner.deleteChapterCandidate(activeScenePackId, candidateId);
                }
              }}
            />
          </div>
          <SelectedChapterSequence
            chapters={chapters}
            deletingChapterId={pendingId(planner.asyncStatus, "deleteChapter")}
            isReordering={isPending(planner.asyncStatus, `reorderChapters:${activeScenePackId}`)}
            onDeleteChapter={(chapterId) => {
              if (activeScenePackId) {
                void planner.deleteChapter(activeScenePackId, chapterId);
              }
            }}
            onReorderChapters={(chapterIds) => {
              if (activeScenePackId) {
                void planner.reorderChapters(activeScenePackId, chapterIds);
              }
            }}
          />
        </div>

        {scenePackEditor ? (
          <CoursePlannerDialog
            title={scenePackEditor.mode === "create" ? "Create Scene Pack" : "Edit Scene Pack"}
            description="Set the theme and intent used for Chapter candidate generation."
            isOpen={scenePackEditor !== null}
            onClose={closeScenePackEditor}
            footer={(
              <>
                <button type="button" onClick={closeScenePackEditor}>
                  Cancel
                </button>
                <button
                  type="submit"
                  form="scene-pack-editor-form"
                  className="course-planner-primary-action"
                  disabled={!scenePackEditor.title.trim() || !scenePackEditor.intent.trim()}
                >
                  Save Scene Pack
                </button>
              </>
            )}
          >
            <form
              id="scene-pack-editor-form"
              className="course-planner-dialog-form"
              onSubmit={(event) => {
                event.preventDefault();
                void submitScenePackEditor();
              }}
            >
              <label className="course-planner-field">
                <span>Scene Pack title</span>
                <input
                  autoFocus
                  value={scenePackEditor.title}
                  onChange={(event) => setScenePackEditor((current) => current ? { ...current, title: event.target.value } : current)}
                />
              </label>
              <label className="course-planner-field">
                <span>Scene Pack intent</span>
                <textarea
                  rows={3}
                  value={scenePackEditor.intent}
                  onChange={(event) => setScenePackEditor((current) => current ? { ...current, intent: event.target.value } : current)}
                />
              </label>
              <label className="course-planner-field">
                <span>Scene Pack notes</span>
                <textarea
                  rows={4}
                  value={scenePackEditor.notes}
                  onChange={(event) => setScenePackEditor((current) => current ? { ...current, notes: event.target.value } : current)}
                />
              </label>
            </form>
          </CoursePlannerDialog>
        ) : null}
      {isBatchRevisionOpen ? (
        <CoursePlannerDrawer
          ariaLabel="Revise candidate batch"
          title="调整整批"
          description="把反馈发送给 AI，替换当前候选池；已接受的 Chapter 不会被覆盖。"
          onClose={() => setIsBatchRevisionOpen(false)}
          footer={(
            <>
              <button type="button" onClick={() => setIsBatchRevisionOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="course-planner-primary-action"
                disabled={!batchFeedback.trim() || isPending(planner.asyncStatus, `reviseCandidates:${activeScenePackId}`)}
                onClick={() => void submitBatchRevision()}
              >
                {isPending(planner.asyncStatus, `reviseCandidates:${activeScenePackId}`) ? "调整中..." : "Submit revision"}
              </button>
            </>
          )}
        >
          <label className="planning-field">
            <span>Revision feedback</span>
            <textarea
              rows={3}
              value={batchFeedback}
              onChange={(event) => setBatchFeedback(event.target.value)}
              placeholder="例如：减少学校场景，增加厨房和客厅物件互动。"
            />
          </label>
        </CoursePlannerDrawer>
      ) : null}
      </main>
    </>
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

function firstFailedOperation(asyncStatus: AsyncStatusMap): FailedOperationToast | null {
  const failedEntry = Object.entries(asyncStatus).find(([, operation]) => operation?.status === "failed");
  if (!failedEntry) {
    return null;
  }
  const [key, operation] = failedEntry;
  return {
    key,
    error: operation?.error ?? "Course Planner action failed.",
  };
}

function operationLabel(asyncStatus: AsyncStatusMap): string {
  const hasFailed = Object.values(asyncStatus).some((operation) => operation?.status === "failed");
  if (hasFailed) {
    return "Error";
  }
  const pendingKey = Object.entries(asyncStatus).find(([, operation]) => operation?.status === "pending")?.[0];
  return pendingKey ? "Working" : "Ready";
}

function operationTone(asyncStatus: AsyncStatusMap): "neutral" | "success" | "warning" | "danger" | "muted" {
  if (Object.values(asyncStatus).some((operation) => operation?.status === "failed")) {
    return "danger";
  }
  if (Object.values(asyncStatus).some((operation) => operation?.status === "pending")) {
    return "warning";
  }
  return "success";
}
