import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";

import {
  fetchWorkspaceWorkflow,
  runWorkspaceStageBack,
  runWorkspaceStageDetect,
  runWorkspaceStageGenerate,
  runWorkspaceStageMask,
  saveWorkflowGeneratePromptHints,
  saveWorkflowGenerateSelection,
  type WorkspaceStageResponse,
} from "../domain/workspaceApi";
import {
  type ExportSummary,
  type WorkflowState,
  type WorkflowStage,
  type WorkspaceState,
} from "../domain/workspace";
import { isGenerateSelectableElement, needsElementReview } from "../domain/workspaceDerived";
import type { WorkspacePendingTask, WorkspaceTask } from "../domain/workspaceTasks";

type ReplaceWorkspace = (
  nextState: WorkspaceState,
  nextStatus: string,
  nextSelectionId?: string | null,
) => void;

type SetState<T> = Dispatch<SetStateAction<T>>;

type UseWorkflowControllerInput = {
  activeRunId: string | null;
  clearAllLocalRepairState: () => void;
  hasActiveTask: boolean;
  replaceWorkspace: ReplaceWorkspace;
  refreshTasks: (options?: { silent?: boolean; refreshWorkspace?: boolean }) => Promise<void>;
  refreshWorkspaceRuns: () => Promise<void>;
  clearPendingTask: () => void;
  setAssetCacheKey: SetState<number>;
  setError: SetState<string | null>;
  setExportSummary: SetState<ExportSummary | null>;
  setIsPromptBoardExpanded: SetState<boolean>;
  setSelectedElementIds: SetState<string[]>;
  setStatus: SetState<string>;
  startTask: (task: WorkspaceTask) => Promise<void>;
  startPendingTask: (task: WorkspacePendingTask) => void;
  workspace: WorkspaceState;
};

export function useWorkflowController({
  activeRunId,
  clearAllLocalRepairState,
  hasActiveTask,
  replaceWorkspace,
  refreshTasks,
  refreshWorkspaceRuns,
  clearPendingTask,
  setAssetCacheKey,
  setError,
  setExportSummary,
  setIsPromptBoardExpanded,
  setSelectedElementIds,
  setStatus,
  startTask,
  startPendingTask,
  workspace,
}: UseWorkflowControllerInput) {
  const [workflow, setWorkflow] = useState<WorkflowState | null>(null);
  const [isRunningStageDetect, setIsRunningStageDetect] = useState(false);
  const [isRunningStageMask, setIsRunningStageMask] = useState(false);
  const [isRunningStageGenerate, setIsRunningStageGenerate] = useState(false);
  const [isRunningStageBack, setIsRunningStageBack] = useState(false);
  const [isSavingGenerateSelection, setIsSavingGenerateSelection] = useState(false);

  const effectiveWorkflow = useMemo(
    () => workflow ?? deriveWorkflowFromWorkspace(workspace),
    [workflow, workspace],
  );

  useEffect(() => {
    if (!workspace.source) {
      setWorkflow(deriveWorkflowFromWorkspace(workspace));
      return;
    }
    void refreshWorkflow({ silent: true });
  }, [activeRunId, workspace.source?.path]);

  async function refreshWorkflow({ silent = false }: { silent?: boolean } = {}) {
    try {
      const nextWorkflow = await fetchWorkspaceWorkflow(activeRunId);
      setWorkflow(nextWorkflow);
      if (nextWorkflow.lastExportSummary) {
        setExportSummary(nextWorkflow.lastExportSummary);
      }
    } catch (workflowError) {
      if (silent) {
        // WHY: 本地兼容测试或旧后端没有 workflow 接口时，不能保留初始空 workspace 的 upload；
        // 必须从当前 state 推导阶段，避免刷新后主 CTA 退回错误阶段。
        setWorkflow(deriveWorkflowFromWorkspace(workspace));
        return;
      }
      if (!silent) {
        setStatus("Workflow state load failed.");
        setError(workflowError instanceof Error ? workflowError.message : "Could not load workflow state.");
      }
    }
  }

  async function handleRunStageDetection() {
    if (!workspace.source || isRunningStageDetect) {
      return;
    }
    setIsRunningStageDetect(true);
    startPendingTask({ type: "detection_batch", message: "Running detection provider." });
    setStatus("Running detection...");
    setError(null);
    try {
      const payload = await runWorkspaceStageDetect(activeRunId);
      await applyStagePayload(
        payload,
        payload.task ? "Detection started." : "Detection completed.",
        payload.state.elements[0]?.id ?? null,
      );
      setSelectedElementIds([]);
      setIsPromptBoardExpanded(false);
      clearAllLocalRepairState();
    } catch (stageError) {
      setStatus("Detection failed.");
      setError(stageError instanceof Error ? stageError.message : "Detection failed.");
      clearPendingTask();
    } finally {
      setIsRunningStageDetect(false);
    }
  }

  async function handleRunStageMask() {
    if (!workspace.source || isRunningStageMask || hasActiveTask) {
      return;
    }
    setIsRunningStageMask(true);
    startPendingTask({ type: "sam2_mask_batch", message: "Starting SAM2 mask batch." });
    setStatus("Starting SAM2 mask batch...");
    setError(null);
    try {
      const payload = await runWorkspaceStageMask(activeRunId);
      await applyStagePayload(payload, "SAM2 mask batch started.");
    } catch (stageError) {
      setStatus("Mask batch failed to start.");
      setError(stageError instanceof Error ? stageError.message : "Could not start SAM2 mask batch.");
      clearPendingTask();
    } finally {
      setIsRunningStageMask(false);
    }
  }

  async function handleRunStageGenerate() {
    if (!workspace.source || isRunningStageGenerate || hasActiveTask) {
      return;
    }
    const selectedIds = selectedGenerateElementIds(workspace, effectiveWorkflow.generateSelection);
    if (selectedIds.length === 0) {
      setStatus("No assets selected for generation.");
      setError("Select at least one eligible asset before generating final assets.");
      return;
    }
    setIsRunningStageGenerate(true);
    startPendingTask({ type: "codex_final_batch", message: "Starting Codex final batch." });
    setStatus("Starting Codex final batch...");
    setError(null);
    try {
      const promptHints = promptHintsForElements(effectiveWorkflow.generatePromptHints, selectedIds);
      const payload = await runWorkspaceStageGenerate(
        selectedIds,
        {
          promptHints,
          force: effectiveWorkflow.stage === "generate",
        },
        activeRunId,
      );
      await applyStagePayload(payload, "Codex final batch started.");
    } catch (stageError) {
      setStatus("Codex final batch failed to start.");
      setError(stageError instanceof Error ? stageError.message : "Could not start final generation.");
      clearPendingTask();
    } finally {
      setIsRunningStageGenerate(false);
    }
  }

  async function handleRerunGenerateElement(elementId: string, promptHint: string) {
    if (!workspace.source || isRunningStageGenerate) {
      return;
    }
    const normalizedHint = promptHint.trim();
    const nextHints = {
      ...effectiveWorkflow.generatePromptHints,
      [elementId]: normalizedHint,
    };
    if (!normalizedHint) {
      delete nextHints[elementId];
    }
    setWorkflow((current) => ({
      ...(current ?? effectiveWorkflow),
      generatePromptHints: nextHints,
    }));
    setIsRunningStageGenerate(true);
    startPendingTask({ type: "codex_final_batch", message: "Starting Codex final rerun." });
    setStatus("Starting Codex final rerun...");
    setError(null);
    try {
      const payload = await runWorkspaceStageGenerate(
        [elementId],
        {
          promptHints: promptHintsForElements(nextHints, [elementId]),
          force: true,
        },
        activeRunId,
      );
      await applyStagePayload(payload, "Codex final rerun started.", elementId);
    } catch (stageError) {
      setStatus("Codex final rerun failed to start.");
      setError(stageError instanceof Error ? stageError.message : "Could not rerun final generation.");
      clearPendingTask();
    } finally {
      setIsRunningStageGenerate(false);
    }
  }

  async function handleStageBack() {
    if (effectiveWorkflow.stage === "upload" || hasActiveTask || isRunningStageBack) {
      return;
    }
    setIsRunningStageBack(true);
    setStatus("Going back one workflow stage...");
    setError(null);
    try {
      const payload = await runWorkspaceStageBack(activeRunId);
      await applyStagePayload(payload, backStatus(payload.workflow.stage), null);
      setExportSummary(null);
      setIsPromptBoardExpanded(payload.workflow.stage === "upload" || payload.workflow.stage === "detect");
      void refreshTasks({ silent: true });
    } catch (stageError) {
      setStatus("Back step failed.");
      setError(stageError instanceof Error ? stageError.message : "Could not go back a workflow stage.");
    } finally {
      setIsRunningStageBack(false);
    }
  }

  async function handleToggleGenerateSelection(elementId: string, isSelected: boolean) {
    const nextSelection = {
      ...effectiveWorkflow.generateSelection,
      [elementId]: isSelected,
    };
    await persistGenerateSelection(nextSelection);
  }

  async function handleToggleAllGenerateSelection(elementIds: string[], isSelected: boolean) {
    const nextSelection = {
      ...effectiveWorkflow.generateSelection,
    };
    elementIds.forEach((elementId) => {
      nextSelection[elementId] = isSelected;
    });
    await persistGenerateSelection(nextSelection);
  }

  async function persistGenerateSelection(nextSelection: Record<string, boolean>) {
    // WHY: 单选和全选都必须走同一个乐观更新 + 持久化路径，
    // 否则右上角 Generate Selected 的可用状态会和右侧树勾选状态分叉。
    setWorkflow((current) => ({
      ...(current ?? effectiveWorkflow),
      generateSelection: nextSelection,
    }));
    setIsSavingGenerateSelection(true);
    setError(null);
    try {
      setWorkflow(await saveWorkflowGenerateSelection(nextSelection, activeRunId));
    } catch (selectionError) {
      setStatus("Generate selection save failed.");
      setError(selectionError instanceof Error ? selectionError.message : "Could not save generate selection.");
    } finally {
      setIsSavingGenerateSelection(false);
    }
  }

  async function handleSaveGeneratePromptHint(elementId: string, promptHint: string) {
    const normalizedHint = promptHint.trim();
    const nextHints = {
      ...effectiveWorkflow.generatePromptHints,
      [elementId]: normalizedHint,
    };
    if (!normalizedHint) {
      delete nextHints[elementId];
    }
    setWorkflow((current) => ({
      ...(current ?? effectiveWorkflow),
      generatePromptHints: nextHints,
    }));
    setError(null);
    try {
      setWorkflow(await saveWorkflowGeneratePromptHints(nextHints, activeRunId));
    } catch (promptError) {
      setStatus("Prompt hint save failed.");
      setError(promptError instanceof Error ? promptError.message : "Could not save prompt hint.");
    }
  }

  async function applyStagePayload(
    payload: WorkspaceStageResponse,
    status: string,
    selectionId?: string | null,
  ) {
    setWorkflow(payload.workflow);
    replaceWorkspace(payload.state, status, selectionId);
    setAssetCacheKey((current) => current + 1);
    if (payload.task) {
      await startTask(payload.task);
    } else {
      clearPendingTask();
    }
    void refreshWorkspaceRuns();
  }

  return {
    canGoBackStage: effectiveWorkflow.stage !== "upload" && !hasActiveTask && !isRunningStageBack,
    effectiveWorkflow,
    handleRunStageDetection,
    handleRunStageGenerate,
    handleRunStageMask,
    handleRerunGenerateElement,
    handleSaveGeneratePromptHint,
    handleStageBack,
    handleToggleAllGenerateSelection,
    handleToggleGenerateSelection,
    isRunningStageBack,
    isRunningStageDetect,
    isRunningStageGenerate,
    isRunningStageMask,
    isSavingGenerateSelection,
    refreshWorkflow,
  };
}

function promptHintsForElements(
  hints: Record<string, string>,
  elementIds: string[],
): Record<string, string> {
  const requested = new Set(elementIds);
  return Object.fromEntries(
    Object.entries(hints)
      .filter(([elementId, hint]) => requested.has(elementId) && hint.trim())
      .map(([elementId, hint]) => [elementId, hint.trim()]),
  );
}

function deriveWorkflowFromWorkspace(workspace: WorkspaceState): WorkflowState {
  const stage = deriveWorkflowStage(workspace);
  return {
    stage,
    generateSelection: defaultGenerateSelection(workspace),
    generatePromptHints: {},
    stageSnapshots: {},
    taskIds: {
      detectionBatch: null,
      sam2MaskBatch: null,
      codexFinalBatches: [],
    },
    lastExportSummary: null,
  };
}

function deriveWorkflowStage(workspace: WorkspaceState): WorkflowStage {
  if (!workspace.source) {
    return "upload";
  }
  if (workspace.elements.length === 0) {
    return "upload";
  }
  const selectableElements = workspace.elements.filter(isGenerateSelectableElement);
  if (selectableElements.length === 0) {
    // WHY: 旧记录可能只有 skip/merged/rejected 或临时框，但它已经离开上传阶段；
    // fallback 只能保守停在 Detect，让用户整理资源，而不是把右上角按钮错误切回 Run Detection。
    return "detect";
  }
  if (selectableElements.some(needsElementReview)) {
    return "detect";
  }
  if (selectableElements.some((element) => element.segmentationStatus !== "mask_accepted")) {
    return "mask";
  }
  return "generate";
}

function defaultGenerateSelection(workspace: WorkspaceState): Record<string, boolean> {
  return Object.fromEntries(
    workspace.elements
      .filter(isGenerateSelectableElement)
      .map((element) => [element.id, true]),
  );
}

function selectedGenerateElementIds(
  workspace: WorkspaceState,
  selection: Record<string, boolean>,
): string[] {
  return workspace.elements
    .filter(isGenerateSelectableElement)
    .filter((element) => selection[element.id] ?? true)
    .map((element) => element.id);
}

function backStatus(stage: WorkflowStage): string {
  switch (stage) {
    case "upload":
      return "Returned to upload.";
    case "detect":
      return "Returned to detect.";
    case "mask":
      return "Returned to mask.";
    case "generate":
      return "Returned to generate.";
  }
}
