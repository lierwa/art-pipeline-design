import { Dispatch, SetStateAction, useState } from "react";

import type { BoxEditHistorySnapshot } from "../../app/appStateTypes";
import {
  boxesEqual,
  boxToDraft,
  clampBoxToSource,
  draftFromElement,
  parseBox,
} from "../../domain/elementDraft";
import {
  canRedoHistory,
  canUndoHistory,
  clearOperationHistory,
  createOperationHistory,
  recordOperation,
  stepOperationHistory,
} from "../../domain/operationHistory";
import type {
  Box,
  ElementEditorDraft,
  SourceMetadata,
  WorkspaceElement,
} from "../../domain/workspace";

type UseBoxEditControllerInput = {
  elementDraft: ElementEditorDraft | null;
  selectedElement: WorkspaceElement | null;
  source: SourceMetadata | null;
  onEnterSelectTool: () => void;
  setElementDraft: Dispatch<SetStateAction<ElementEditorDraft | null>>;
  setError: (message: string | null) => void;
  setStatus: (message: string) => void;
};

export function useBoxEditController({
  elementDraft,
  selectedElement,
  source,
  onEnterSelectTool,
  setElementDraft,
  setError,
  setStatus,
}: UseBoxEditControllerInput) {
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [boxEditHistory, setBoxEditHistory] = useState(() =>
    createOperationHistory<BoxEditHistorySnapshot>(),
  );

  function clearBoxEditHistory() {
    setBoxEditHistory((current) => clearOperationHistory(current));
  }

  function handleStartBoxEdit() {
    if (!selectedElement) {
      return;
    }
    onEnterSelectTool();
    setEditingElementId(selectedElement.id);
    clearBoxEditHistory();
    setStatus("Editing selected box.");
    setError(null);
  }

  function handleBoxDraftChange(elementId: string, bbox: Box) {
    if (!selectedElement || selectedElement.id !== elementId || !source) {
      return;
    }

    const nextBbox = clampBoxToSource(bbox, source);
    const currentBbox = elementDraft ? parseBox(elementDraft.bbox) : selectedElement.bbox;
    if (currentBbox && !boxesEqual(currentBbox, nextBbox)) {
      setBoxEditHistory((current) =>
        recordOperation(current, { elementId: selectedElement.id, bbox: currentBbox }),
      );
    }
    setElementDraft((current) => {
      const nextDraft = current ?? draftFromElement(selectedElement);
      return {
        ...nextDraft,
        bbox: boxToDraft(nextBbox),
      };
    });
    setError(null);
  }

  function handleCancelBoxEdit() {
    if (selectedElement) {
      setElementDraft(draftFromElement(selectedElement));
    }
    setEditingElementId(null);
    clearBoxEditHistory();
    setError(null);
    setStatus("Box edit cancelled.");
  }

  function currentBoxEditSnapshot(): BoxEditHistorySnapshot | null {
    if (!selectedElement || editingElementId !== selectedElement.id) {
      return null;
    }

    const bbox = elementDraft ? parseBox(elementDraft.bbox) : selectedElement.bbox;
    if (!bbox) {
      return null;
    }

    return {
      elementId: selectedElement.id,
      bbox,
    };
  }

  function applyBoxEditSnapshot(snapshot: BoxEditHistorySnapshot) {
    if (!selectedElement || snapshot.elementId !== selectedElement.id) {
      return;
    }

    setElementDraft((current) => ({
      ...(current ?? draftFromElement(selectedElement)),
      bbox: boxToDraft(snapshot.bbox),
    }));
    setError(null);
  }

  function handleUndoBoxDraft() {
    const currentSnapshot = currentBoxEditSnapshot();
    if (!currentSnapshot) {
      return;
    }

    const step = stepOperationHistory(boxEditHistory, "undo", currentSnapshot);
    if (!step.target) {
      return;
    }

    setBoxEditHistory(step.history);
    applyBoxEditSnapshot(step.target);
    setStatus("Box edit undone.");
  }

  function handleRedoBoxDraft() {
    const currentSnapshot = currentBoxEditSnapshot();
    if (!currentSnapshot) {
      return;
    }

    const step = stepOperationHistory(boxEditHistory, "redo", currentSnapshot);
    if (!step.target) {
      return;
    }

    setBoxEditHistory(step.history);
    applyBoxEditSnapshot(step.target);
    setStatus("Box edit redone.");
  }

  // WHY: box draft 有独立的撤销栈；从 App 拆出后，App 只决定何时进入/退出编辑，
  // hook 负责坐标夹取、draft 写入和撤销粒度，避免这些规则散在全局键盘与保存流程里。
  return {
    boxEditHistory,
    clearBoxEditHistory,
    editingElementId,
    handleBoxDraftChange,
    handleCancelBoxEdit,
    handleRedoBoxDraft,
    handleStartBoxEdit,
    handleUndoBoxDraft,
    setEditingElementId,
    canRedoBoxEdit: canRedoHistory(boxEditHistory),
    canUndoBoxEdit: canUndoHistory(boxEditHistory),
  };
}
