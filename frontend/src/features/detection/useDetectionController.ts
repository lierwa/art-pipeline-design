import { useState } from "react";

import type { CanvasTool, WorkspaceElement, WorkspaceState } from "../../domain/workspace";
import { normalizeWorkspaceState } from "../../domain/workspace";
import {
  clickDetectWorkspace,
  runWorkspaceDetection,
  saveDetectionVocabulary,
} from "../../domain/workspaceApi";
import { buildClickDetectLabel } from "../../domain/workspaceDerived";

type ApplyWorkspaceMutation = (
  nextState: WorkspaceState,
  nextStatus: string,
  nextSelectionId?: string | null,
) => void;

type UseDetectionControllerInput = {
  activeRunId: string | null;
  applyWorkspaceMutation: ApplyWorkspaceMutation;
  clearAllLocalRepairState: () => void;
  refreshWorkspaceRuns: () => void;
  selectedElement: WorkspaceElement | null;
  selectedElementId: string | null;
  setCanvasTool: (tool: CanvasTool) => void;
  setError: (message: string | null) => void;
  setIsPromptBoardExpanded: (isExpanded: boolean) => void;
  setSelectedElementIds: (elementIds: string[]) => void;
  setStatus: (message: string) => void;
  workspace: WorkspaceState;
};

export function useDetectionController({
  activeRunId,
  applyWorkspaceMutation,
  clearAllLocalRepairState,
  refreshWorkspaceRuns,
  selectedElement,
  selectedElementId,
  setCanvasTool,
  setError,
  setIsPromptBoardExpanded,
  setSelectedElementIds,
  setStatus,
  workspace,
}: UseDetectionControllerInput) {
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [isSavingVocabulary, setIsSavingVocabulary] = useState(false);

  async function handleRunDetection() {
    if (!workspace.source || isAnnotating) {
      return;
    }

    setIsAnnotating(true);
    setStatus("Running model detection...");
    setError(null);

    try {
      const nextState = normalizeWorkspaceState(await runWorkspaceDetection(activeRunId));
      clearAllLocalRepairState();
      setSelectedElementIds([]);
      applyWorkspaceMutation(
        nextState,
        `Detected ${nextState.elements.length} model candidate${nextState.elements.length === 1 ? "" : "s"}.`,
        nextState.elements[0]?.id ?? null,
      );
      setIsPromptBoardExpanded(false);
      refreshWorkspaceRuns();
    } catch (annotateError) {
      setStatus("Detection failed.");
      setError(
        annotateError instanceof Error ? annotateError.message : "Detection failed.",
      );
    } finally {
      setIsAnnotating(false);
    }
  }

  async function handleSaveDetectionVocabulary(labels: string[]) {
    if (!workspace.source || isSavingVocabulary) {
      return;
    }

    setIsSavingVocabulary(true);
    setStatus("Saving detection vocabulary...");
    setError(null);

    try {
      const nextState = normalizeWorkspaceState(await saveDetectionVocabulary(labels, activeRunId));
      // WHY: 检测词表与 workspace state 同源保存，避免 prompt chips 与后端检测过滤规则出现两个权威来源。
      applyWorkspaceMutation(nextState, "Detection vocabulary saved.", selectedElementId);
      refreshWorkspaceRuns();
    } catch (saveError) {
      setStatus("Detection vocabulary save failed.");
      setError(
        saveError instanceof Error ? saveError.message : "Could not save detection vocabulary.",
      );
    } finally {
      setIsSavingVocabulary(false);
    }
  }

  async function handleClickDetectPoint(point: { x: number; y: number }) {
    if (!workspace.source || isAnnotating) {
      return;
    }

    const label = buildClickDetectLabel(selectedElement, workspace.detectionVocabulary);
    setIsAnnotating(true);
    setStatus("Running click detection...");
    setError(null);

    try {
      const payload = await clickDetectWorkspace(point, label, activeRunId);
      applyWorkspaceMutation(payload.state, "Click-detected asset added.", payload.element.id);
      setCanvasTool("select");
      refreshWorkspaceRuns();
    } catch (detectError) {
      setStatus("Click detection failed.");
      setError(detectError instanceof Error ? detectError.message : "Click detection failed.");
    } finally {
      setIsAnnotating(false);
    }
  }

  return {
    handleClickDetectPoint,
    handleRunDetection,
    handleSaveDetectionVocabulary,
    isAnnotating,
    isSavingVocabulary,
  };
}
