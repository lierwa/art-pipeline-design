import type { Dispatch, RefObject, SetStateAction } from "react";

import type {
  SegmentDraftHistoryStatus,
  SegmentEdgeBoardHandle,
} from "../features/segment/SegmentEdgeBoard";
import {
  canRedoHistory,
  canUndoHistory,
  type OperationHistory,
  stepOperationHistory,
  type WorkspaceHistorySnapshot,
} from "../domain/operationHistory";
import type { PersistedBackStep } from "../domain/workspaceDerived";

type PersistHistorySnapshot = (
  snapshot: WorkspaceHistorySnapshot,
  nextStatus: string,
) => Promise<boolean>;

type RestoreHistorySnapshot = (
  snapshot: WorkspaceHistorySnapshot,
  nextStatus: string,
) => void;

type UseUndoRedoControllerInput = {
  canRedoBoxEdit: boolean;
  canResetDetectionStage: boolean;
  canUndoBoxEdit: boolean;
  createHistorySnapshot: () => WorkspaceHistorySnapshot;
  editingElementId: string | null;
  handlePersistedBackStep: (step: PersistedBackStep) => Promise<void>;
  handleRedoBoxDraft: () => void;
  handleResetDetectionStage: () => Promise<void>;
  handleUndoBoxDraft: () => void;
  persistedBackStep: PersistedBackStep | null;
  persistHistorySnapshot: PersistHistorySnapshot;
  restoreHistorySnapshot: RestoreHistorySnapshot;
  segmentDraftHistoryStatus: SegmentDraftHistoryStatus;
  segmentEdgeBoardRef: RefObject<SegmentEdgeBoardHandle | null>;
  setStatus: (message: string) => void;
  setWorkspaceHistory: Dispatch<SetStateAction<OperationHistory<WorkspaceHistorySnapshot>>>;
  workspaceHistory: OperationHistory<WorkspaceHistorySnapshot>;
};

export function useUndoRedoController({
  canRedoBoxEdit,
  canResetDetectionStage,
  canUndoBoxEdit,
  createHistorySnapshot,
  editingElementId,
  handlePersistedBackStep,
  handleRedoBoxDraft,
  handleResetDetectionStage,
  handleUndoBoxDraft,
  persistedBackStep,
  persistHistorySnapshot,
  restoreHistorySnapshot,
  segmentDraftHistoryStatus,
  segmentEdgeBoardRef,
  setStatus,
  setWorkspaceHistory,
  workspaceHistory,
}: UseUndoRedoControllerInput) {
  const hasPendingSegmentDraftHistory = segmentDraftHistoryStatus.hasDirtyDraft;
  const canUndoApp =
    (hasPendingSegmentDraftHistory && segmentDraftHistoryStatus.canUndo)
    || canUndoBoxEdit
    || canUndoHistory(workspaceHistory);
  const canRedoApp =
    (hasPendingSegmentDraftHistory && segmentDraftHistoryStatus.canRedo)
    || canRedoBoxEdit
    || canRedoHistory(workspaceHistory);
  const canGoBack =
    canUndoApp
    || canResetDetectionStage
    || persistedBackStep !== null;

  async function handleUndo() {
    // WHY: mask 笔刷/魔棒已经是自动保存操作；保存完成后必须交给 workspace history，
    // 否则本地 draft 栈会挡住 Ctrl+Z，导致界面状态和已持久化状态不同步。
    if (
      hasPendingSegmentDraftHistory
      && segmentDraftHistoryStatus.canUndo
      && segmentEdgeBoardRef.current?.undoDraft()
    ) {
      setStatus("Mask edit undone.");
      return;
    }

    if (editingElementId && canUndoBoxEdit) {
      handleUndoBoxDraft();
      return;
    }

    const currentSnapshot = createHistorySnapshot();
    const step = stepOperationHistory(workspaceHistory, "undo", currentSnapshot);
    if (!step.target) {
      if (canResetDetectionStage) {
        await handleResetDetectionStage();
        return;
      }
      if (persistedBackStep) {
        await handlePersistedBackStep(persistedBackStep);
      }
      return;
    }

    const previousHistory = workspaceHistory;
    setWorkspaceHistory(step.history);
    const restored = await persistHistorySnapshot(step.target, "Undone.");
    if (!restored) {
      setWorkspaceHistory(previousHistory);
      restoreHistorySnapshot(currentSnapshot, "History restore failed.");
    } else {
      segmentEdgeBoardRef.current?.clearDraftHistory();
    }
  }

  async function handleRedo() {
    // WHY: redo 同样只处理尚未落到全局历史的本地草稿，已保存操作由 workspace redo 恢复。
    if (
      hasPendingSegmentDraftHistory
      && segmentDraftHistoryStatus.canRedo
      && segmentEdgeBoardRef.current?.redoDraft()
    ) {
      setStatus("Mask edit redone.");
      return;
    }

    if (editingElementId && canRedoBoxEdit) {
      handleRedoBoxDraft();
      return;
    }

    const currentSnapshot = createHistorySnapshot();
    const step = stepOperationHistory(workspaceHistory, "redo", currentSnapshot);
    if (!step.target) {
      return;
    }

    const previousHistory = workspaceHistory;
    setWorkspaceHistory(step.history);
    const restored = await persistHistorySnapshot(step.target, "Redone.");
    if (!restored) {
      setWorkspaceHistory(previousHistory);
      restoreHistorySnapshot(currentSnapshot, "History restore failed.");
    } else {
      segmentEdgeBoardRef.current?.clearDraftHistory();
    }
  }

  return {
    canGoBack,
    canRedoApp,
    canUndoApp,
    handleRedo,
    handleUndo,
  };
}
