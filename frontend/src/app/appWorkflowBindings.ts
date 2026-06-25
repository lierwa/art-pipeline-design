import {
  buildAppWorkflowState,
  type AppWorkflowState,
} from "./appWorkflowActions";
import type { AppShellState } from "./useAppShellState";
import type { useAppDerivedState } from "./useAppDerivedState";
import type { useDetectionController } from "../features/detection/useDetectionController";
import type { useWorkspaceFileActions } from "./useWorkspaceFileActions";
import type { useWorkspaceTaskController } from "./useWorkspaceTaskController";
import type { useWorkflowController } from "./useWorkflowController";
import { isGenerateSelectableElement } from "../domain/workspaceDerived";

type AppDerivedState = ReturnType<typeof useAppDerivedState>;
type DetectionController = ReturnType<typeof useDetectionController>;
type WorkspaceFileActions = ReturnType<typeof useWorkspaceFileActions>;
type WorkspaceTaskController = ReturnType<typeof useWorkspaceTaskController>;
type WorkflowController = ReturnType<typeof useWorkflowController>;

type AppWorkflowBindingInput = {
  derived: AppDerivedState;
  detection: DetectionController;
  fileActions: WorkspaceFileActions;
  shell: AppShellState;
  workflowController: WorkflowController;
  workspaceTasks: WorkspaceTaskController;
};

export function buildBoundAppWorkflowState({
  derived,
  detection,
  fileActions,
  shell,
  workflowController,
  workspaceTasks,
}: AppWorkflowBindingInput): AppWorkflowState {
  const workspaceHasSource = Boolean(shell.workspace.source);
  const workflowStage = workflowController.effectiveWorkflow.stage;

  return buildAppWorkflowState({
    canDownloadPack: derived.canExportAssetPack,
    canRunDetection: derived.canRunDetection,
    error: shell.error,
    hasGenerateSelection: shell.workspace.elements
      .filter(isGenerateSelectableElement)
      .some((elementItem) => workflowController.effectiveWorkflow.generateSelection[elementItem.id] ?? true),
    hasPendingSegmentMasks: derived.hasBatchSegmentTargets,
    hasTaskProgressSurface: workspaceTasks.hasActiveTask,
    hasUnsavedGeometryChanges: derived.hasUnsavedGeometryChanges,
    // WHY: Run Detection 第一版复用后台 task + SSE；进入 detect 阶段后 task 仍在逐框写入，
    // UI 应继续表现为模型 busy，避免用户在候选框未稳定前启动 mask。
    isAnnotating:
      detection.isAnnotating
      || workflowController.isRunningStageDetect
      || (workflowStage === "detect" && workspaceTasks.hasActiveTask),
    isExporting: shell.isExporting,
    isSavingState: shell.isSavingState,
    isSavingVocabulary: detection.isSavingVocabulary,
    isSuggestingAllSegments:
      workflowController.isRunningStageMask
      || (workflowStage === "mask" && workspaceTasks.hasActiveTask),
    isStartingCodexFinalTask:
      workspaceTasks.isStartingCodexFinalTask
      || workflowController.isRunningStageGenerate
      || (workflowStage === "generate" && workspaceTasks.hasActiveTask),
    status: shell.status,
    workspaceHasSource,
    workflowStage,
    onDownloadPack: () => {
      void fileActions.handleExportAssetPack().then(() => workflowController.refreshWorkflow({ silent: true }));
    },
    onRunDetection: () => void workflowController.handleRunStageDetection(),
    onRunStageGenerate: () => void workflowController.handleRunStageGenerate(),
    onRunStageMask: () => void workflowController.handleRunStageMask(),
  });
}
