import { useRef, useState } from "react";

import type { WorkspaceHistorySnapshot } from "../../domain/operationHistory";
import type { WorkspaceState } from "../../domain/workspace";
import {
  acceptElementSegment,
  generateElementCodexFinal,
  patchElementSegmentMask,
  suggestElementSegment,
  type SegmentMaskPatchRequest,
} from "../../domain/workspaceApi";
import type { Sam2MaskTaskRequest } from "../../domain/workspaceTasks";
import type { SegmentMaskPatchMeta } from "./useSegmentMaskDraftEditor";

type ApplyWorkspaceMutation = (
  nextState: WorkspaceState,
  nextStatus: string,
  nextSelectionId?: string | null,
  options?: { bumpAssetCache?: boolean },
) => void;

type ReplaceWorkspace = (
  nextState: WorkspaceState,
  nextStatus: string,
  nextSelectionId?: string | null,
  options?: { bumpAssetCache?: boolean },
) => void;

type UseSegmentControllerInput = {
  activeRunId: string | null;
  workspace: WorkspaceState;
  applyWorkspaceMutation: ApplyWorkspaceMutation;
  bumpElementAssetCacheKey: (elementId: string) => void;
  clearLocalRepairMetadata: (elementIds: string[]) => void;
  pushUndoSnapshot: (snapshot: WorkspaceHistorySnapshot) => void;
  refreshWorkspaceRuns: () => void;
  replaceWorkspace: ReplaceWorkspace;
  setAssetCacheKey: (updater: (current: number) => number) => void;
  setError: (message: string | null) => void;
  setStatus: (message: string) => void;
  startCodexFinalTask: () => Promise<void>;
  startSam2MaskTask: (request?: Sam2MaskTaskRequest) => Promise<void>;
};

export function useSegmentController({
  activeRunId,
  workspace,
  applyWorkspaceMutation,
  bumpElementAssetCacheKey,
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
  const isPatchingSegmentMaskRef = useRef(false);

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

  async function handlePatchSegmentMask(
    elementId: string,
    patch: SegmentMaskPatchRequest,
    meta?: SegmentMaskPatchMeta,
  ) {
    if (isPatchingSegmentMaskRef.current || !workspace.elements.some((element) => element.id === elementId)) {
      return false;
    }

    const historyAction = meta?.historyAction ?? "edit";
    const pendingStatus = historyAction === "undo"
      ? "Undoing mask edit..."
      : historyAction === "redo"
        ? "Redoing mask edit..."
        : "Updating segment mask...";
    const successStatus = historyAction === "undo"
      ? "Mask edit undone."
      : historyAction === "redo"
        ? "Mask edit redone."
        : "Mask edit applied.";

    // WHY: Segment 画笔会把自动保存请求串行排队；不能用 render 闭包里的
    // suggestingSegmentElementId 判 busy，否则 pending 请求结束后的下一笔会被旧闭包误拦。
    isPatchingSegmentMaskRef.current = true;
    setSuggestingSegmentElementId(elementId);
    setStatus(pendingStatus);
    setError(null);

    try {
      const payload = await patchElementSegmentMask(elementId, patch, activeRunId);
      clearLocalRepairMetadata([elementId]);
      // WHY: 单个 mask 草稿保存会覆盖当前元素的 PNG artifact；全局 workspace history
      // 只能保存 JSON，不能恢复 mask 文件。这里只替换本地状态，undo/redo 由 Segment 草稿栈继续 PATCH mask。
      replaceWorkspace({
        ...payload.state,
        elements: workspace.elements.map((element) =>
          element.id === payload.element.id ? payload.element : element,
        ),
      }, successStatus, payload.element.id, { bumpAssetCache: false });
      bumpElementAssetCacheKey(elementId);
      return true;
    } catch (segmentError) {
      setStatus("Mask edit failed.");
      setError(segmentError instanceof Error ? segmentError.message : "Could not update segment mask.");
      return false;
    } finally {
      isPatchingSegmentMaskRef.current = false;
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

  async function handleRerunSegmentMasks(elementIds: string[]) {
    if (isSuggestingAllSegments) {
      return;
    }
    const workspaceElementIds = new Set(workspace.elements.map((element) => element.id));
    const targetIds = [...new Set(elementIds)].filter((elementId) => workspaceElementIds.has(elementId));
    if (targetIds.length === 0) {
      setStatus("No masks selected for rerun.");
      setError("Select at least one current asset before rerunning SAM2 masks.");
      return;
    }

    setIsSuggestingAllSegments(true);
    setStatus(targetIds.length === 1 ? "Rerunning SAM2 mask..." : `Rerunning ${targetIds.length} SAM2 masks...`);
    setError(null);
    try {
      // WHY: Segment 评审阶段的“重跑”是返工坏 mask，不是 legacy 的“补缺失”；
      // force 明确要求后端覆盖已有 draft/accepted SAM2 结果。
      await startSam2MaskTask({ elementIds: targetIds, force: true });
      clearLocalRepairMetadata(targetIds);
      refreshWorkspaceRuns();
    } catch (segmentError) {
      setStatus("SAM2 mask rerun failed.");
      setError(segmentError instanceof Error ? segmentError.message : "Could not rerun SAM2 masks.");
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
    handleRerunSegmentMasks,
    handlePatchSegmentMask,
    handleSuggestAllSegmentMasks,
    handleSuggestSegmentMask,
    isSuggestingAllSegments,
    suggestingSegmentElementId,
  };
}
