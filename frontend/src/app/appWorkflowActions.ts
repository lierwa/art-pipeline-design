import type { WorkflowToastState } from "./components/WorkflowToast";
import type { WorkflowStage } from "../domain/workspace";

export type PrimaryWorkflowAction = {
  label: string;
  help: string | null;
  disabled: boolean;
  isRunning: boolean;
  onRun: () => void;
};

export type SecondaryWorkflowAction = PrimaryWorkflowAction | null;

type AppWorkflowStateInput = {
  canDownloadPack: boolean;
  canRunDetection: boolean;
  error: string | null;
  hasGenerateSelection: boolean;
  hasPendingSegmentMasks: boolean;
  hasTaskProgressSurface: boolean;
  hasUnsavedGeometryChanges: boolean;
  isAnnotating: boolean;
  isExporting: boolean;
  isSavingState: boolean;
  isSavingVocabulary: boolean;
  isStartingCodexFinalTask: boolean;
  isSuggestingAllSegments: boolean;
  status: string;
  workspaceHasSource: boolean;
  workflowStage: WorkflowStage;
  onDownloadPack: () => void;
  onRunDetection: () => void;
  onRunStageGenerate: () => void;
  onRunStageMask: () => void;
};

export type AppWorkflowState = {
  primaryWorkflowAction: PrimaryWorkflowAction;
  secondaryWorkflowAction: SecondaryWorkflowAction;
  workflowToast: WorkflowToastState | null;
};

export function buildAppWorkflowState(input: AppWorkflowStateInput): AppWorkflowState {
  return {
    primaryWorkflowAction: buildPrimaryWorkflowAction(input),
    secondaryWorkflowAction: buildSecondaryWorkflowAction(input),
    workflowToast: buildWorkflowToastState(input),
  };
}

function buildPrimaryWorkflowAction(input: AppWorkflowStateInput): PrimaryWorkflowAction {
  switch (input.workflowStage) {
    case "upload":
      return {
        label: "Run Detection",
        help: null,
        disabled:
          !input.workspaceHasSource
          || !input.canRunDetection
          || input.isAnnotating
          || input.isSavingVocabulary,
        isRunning: input.isAnnotating,
        onRun: input.onRunDetection,
      };
    case "detect":
      return {
        label: "Generate Masks",
        help: "Use the current resource boxes as mask targets and start a SAM2 batch.",
        disabled:
          input.isAnnotating
          || input.hasUnsavedGeometryChanges
          || input.isSavingState
          || input.isSuggestingAllSegments,
        isRunning: input.isAnnotating || input.isSavingState || input.isSuggestingAllSegments,
        onRun: input.onRunStageMask,
      };
    case "mask":
      if (input.hasPendingSegmentMasks) {
        return {
          label: "Generate Masks",
          help: "Generate masks for assets that returned to Segment without a saved mask.",
          disabled:
            input.isAnnotating
            || input.hasUnsavedGeometryChanges
            || input.isSavingState
            || input.isSuggestingAllSegments,
          isRunning: input.isAnnotating || input.isSavingState || input.isSuggestingAllSegments,
          onRun: input.onRunStageMask,
        };
      }
      return {
        label: "Generate",
        help: "Accept the current mask set and generate selected final assets with Codex CLI.",
        disabled:
          input.hasUnsavedGeometryChanges
          || input.isStartingCodexFinalTask
          || input.isSuggestingAllSegments
          || !input.hasGenerateSelection,
        isRunning: input.isStartingCodexFinalTask,
        onRun: input.onRunStageGenerate,
      };
    case "generate":
      return {
        label: "Generate Selected",
        help: "Run or rerun Codex CLI for the selected final assets.",
        disabled:
          input.hasUnsavedGeometryChanges
          || input.isStartingCodexFinalTask
          || !input.hasGenerateSelection,
        isRunning: input.isStartingCodexFinalTask,
        onRun: input.onRunStageGenerate,
      };
  }
}

function buildSecondaryWorkflowAction(input: AppWorkflowStateInput): SecondaryWorkflowAction {
  if (input.workflowStage !== "generate") {
    return null;
  }

  return {
    label: "Download Pack",
    help: "Download every final-ready asset and list blocked resources in the export summary.",
    disabled: !input.canDownloadPack || input.isExporting,
    isRunning: input.isExporting,
    onRun: input.onDownloadPack,
  };
}

function buildWorkflowToastState(input: AppWorkflowStateInput): WorkflowToastState | null {
  if (input.error) {
    return {
      tone: "danger",
      title: input.status || "Action failed.",
      message: input.error,
    };
  }

  const busyMessage = currentBusyMessage(input);
  if (!busyMessage) {
    return null;
  }
  if (input.hasTaskProgressSurface && isTaskBackedBusy(input)) {
    return null;
  }

  return {
    tone: "progress",
    title: input.status,
    message: busyMessage,
  };
}

function isTaskBackedBusy(input: AppWorkflowStateInput): boolean {
  return input.isAnnotating || input.isSuggestingAllSegments || input.isStartingCodexFinalTask;
}

function currentBusyMessage(input: AppWorkflowStateInput): string | null {
  if (input.isAnnotating) {
    return "Model request in progress";
  }
  if (input.isSavingVocabulary) {
    return "Updating prompt tags";
  }
  if (input.isSavingState) {
    return "Saving workspace state";
  }
  if (input.isSuggestingAllSegments) {
    return "SAM2 batch masking in progress";
  }
  if (input.isStartingCodexFinalTask) {
    return "Starting Codex final batch";
  }
  if (input.isExporting) {
    return "Writing export package";
  }
  return null;
}
