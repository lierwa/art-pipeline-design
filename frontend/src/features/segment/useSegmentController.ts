import { useState } from "react";

import type { WorkspaceHistorySnapshot } from "../../domain/operationHistory";
import type { WorkspaceState } from "../../domain/workspace";
import {
  acceptElementSegment,
  generateElementCodexFinal,
  patchElementSegmentMask,
  suggestElementSegment,
  type SegmentMaskPatchRequest,
} from "../../domain/workspaceApi";

type ApplyWorkspaceMutation = (
  nextState: WorkspaceState,
  nextStatus: string,
  nextSelectionId?: string | null,
) => void;

type ReplaceWorkspace = (
  nextState: WorkspaceState,
  nextStatus: string,
  nextSelectionId?: string | null,
) => void;

type UseSegmentControllerInput = {
  activeRunId: string | null;
  workspace: WorkspaceState;
  applyWorkspaceMutation: ApplyWorkspaceMutation;
  clearLocalRepairMetadata: (elementIds: string[]) => void;
  pushUndoSnapshot: (snapshot: WorkspaceHistorySnapshot) => void;
  refreshWorkspaceRuns: () => void;
  replaceWorkspace: ReplaceWorkspace;
  setAssetCacheKey: (updater: (current: number) => number) => void;
  setError: (message: string | null) => void;
  setStatus: (message: string) => void;
  startCodexFinalTask: () => Promise<void>;
  startSam2MaskTask: () => Promise<void>;
};

export function useSegmentController({
  activeRunId,
  workspace,
  applyWorkspaceMutation,
  clearLocalRepairMetadata,
  pushUndoSnapshot,
  refreshWorkspaceRuns,
  replaceWorkspace,
  setAssetCacheKey,
  setError,
  setStatus,
  startCodexFinalTask,
  startSam2MaskTask,
}: UseSegmentControllerInput) {
  const [suggestingSegmentElementId, setSuggestingSegmentElementId] = useState<string | null>(null);
  const [isSuggestingAllSegments, setIsSuggestingAllSegments] = useState(false);
  const [acceptingSegmentElementId, setAcceptingSegmentElementId] = useState<string | null>(null);
  const [generatingCodexElementId, setGeneratingCodexElementId] = useState<string | null>(null);

  async function handleSuggestSegmentMask(elementId: string) {
    if (suggestingSegmentElementId || !workspace.elements.some((element) => element.id === elementId)) {
      return;
    }

    setSuggestingSegmentElementId(elementId);
    setStatus("Suggesting segment mask...");
    setError(null);

    try {
      const payload = await suggestElementSegment(elementId, activeRunId);
      clearLocalRepairMetadata([elementId]);
      applyWorkspaceMutation(payload.state, "Mask suggestion ready.", payload.element.id);
      refreshWorkspaceRuns();
    } catch (segmentError) {
      setStatus("Segment suggestion failed.");
      setError(segmentError instanceof Error ? segmentError.message : "Could not suggest segment mask.");
    } finally {
      setSuggestingSegmentElementId(null);
    }
  }

  async function handleAcceptSegmentMask(elementId: string) {
    if (acceptingSegmentElementId || !workspace.elements.some((element) => element.id === elementId)) {
      return;
    }

    setAcceptingSegmentElementId(elementId);
    setStatus("Accepting segment mask...");
    setError(null);

    try {
      const payload = await acceptElementSegment(elementId, activeRunId);
      clearLocalRepairMetadata([elementId]);
      applyWorkspaceMutation(payload.state, "Mask accepted.", payload.element.id);
      refreshWorkspaceRuns();
    } catch (segmentError) {
      setStatus("Segment accept failed.");
      setError(segmentError instanceof Error ? segmentError.message : "Could not accept segment mask.");
    } finally {
      setAcceptingSegmentElementId(null);
    }
  }

  async function handlePatchSegmentMask(elementId: string, patch: SegmentMaskPatchRequest) {
    if (suggestingSegmentElementId || !workspace.elements.some((element) => element.id === elementId)) {
      return false;
    }

    setSuggestingSegmentElementId(elementId);
    setStatus("Updating segment mask...");
    setError(null);

    try {
      const payload = await patchElementSegmentMask(elementId, patch, activeRunId);
      clearLocalRepairMetadata([elementId]);
      applyWorkspaceMutation(payload.state, "Mask edit applied.", payload.element.id);
      setAssetCacheKey((current) => current + 1);
      refreshWorkspaceRuns();
      return true;
    } catch (segmentError) {
      setStatus("Mask edit failed.");
      setError(segmentError instanceof Error ? segmentError.message : "Could not update segment mask.");
      return false;
    } finally {
      setSuggestingSegmentElementId(null);
    }
  }

  async function handleSuggestAllSegmentMasks(
    nextSelectionId?: string | null,
    undoSnapshot?: WorkspaceHistorySnapshot,
  ) {
    if (isSuggestingAllSegments) {
      return;
    }

    setIsSuggestingAllSegments(true);
    setStatus("Running SAM2 masks for all assets...");
    setError(null);

    try {
      if (undoSnapshot) {
        pushUndoSnapshot(undoSnapshot);
        replaceWorkspace(undoSnapshot.state, "Review complete. SAM2 mask task created.", nextSelectionId);
      } else {
        setStatus("Starting SAM2 mask batch...");
      }
      await startSam2MaskTask();
      refreshWorkspaceRuns();
    } catch (segmentError) {
      setStatus("Batch SAM2 masking failed.");
      setError(segmentError instanceof Error ? segmentError.message : "Could not suggest segment masks.");
    } finally {
      setIsSuggestingAllSegments(false);
    }
  }

  async function handleGenerateCodexFinal(elementId: string) {
    if (generatingCodexElementId || !workspace.elements.some((element) => element.id === elementId)) {
      return;
    }

    setGeneratingCodexElementId(elementId);
    setStatus("Generating final asset with Codex CLI...");
    setError(null);

    try {
      const payload = await generateElementCodexFinal(elementId, activeRunId);
      clearLocalRepairMetadata([elementId]);
      applyWorkspaceMutation(payload.state, "Codex final asset ready.", payload.element.id);
      setAssetCacheKey((current) => current + 1);
      refreshWorkspaceRuns();
    } catch (codexError) {
      setStatus("Codex final generation failed.");
      setError(codexError instanceof Error ? codexError.message : "Could not generate Codex final asset.");
    } finally {
      setGeneratingCodexElementId(null);
    }
  }

  async function handleGenerateAllCodexFinals() {
    if (isSuggestingAllSegments || generatingCodexElementId) {
      return;
    }
    setStatus("Starting Codex final batch...");
    setError(null);
    await startCodexFinalTask();
  }

  return {
    acceptingSegmentElementId,
    generatingCodexElementId,
    handleAcceptSegmentMask,
    handleGenerateAllCodexFinals,
    handleGenerateCodexFinal,
    handlePatchSegmentMask,
    handleSuggestAllSegmentMasks,
    handleSuggestSegmentMask,
    isSuggestingAllSegments,
    suggestingSegmentElementId,
  };
}
