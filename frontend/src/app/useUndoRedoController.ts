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
  const canUndoSegmentDraft = segmentDraftHistoryStatus.canUndo;
  const canRedoSegmentDraft = segmentDraftHistoryStatus.canRedo;
  const canUndoApp = canUndoSegmentDraft || canUndoBoxEdit || canUndoHistory(workspaceHistory);
  const canRedoApp = canRedoSegmentDraft || canRedoBoxEdit || canRedoHistory(workspaceHistory);
  const canGoBack =
    canUndoApp
    || canResetDetectionStage
    || persistedBackStep !== null;

  async function handleUndo() {
    // WHY: Segment mask 的权威结果是后端写出的 PNG artifact。workspace history 只能回滚
    // JSON 状态，不能恢复 sam2_edge/mask.png，所以只要本地 mask 栈还在就必须优先写回 mask。
    if (
      canUndoSegmentDraft
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
    // WHY: redo 和 undo 一样要恢复 PNG artifact；不能用 workspace redo 替代 mask patch。
    if (
      canRedoSegmentDraft
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
