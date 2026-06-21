import { describe, expect, it, vi } from "vitest";

import { buildAppWorkflowState } from "../../src/app/appWorkflowActions";
describe("buildAppWorkflowState stage actions", () => {
  it("uses the mask stage Generate CTA instead of selected asset Accept Mask", () => {
    const onRunStageGenerate = vi.fn();

    const workflow = buildAppWorkflowState({
      ...baseInput(),
      workflowStage: "mask",
      onRunStageGenerate,
    });

    expect(workflow.primaryWorkflowAction.label).toBe("Generate");
    workflow.primaryWorkflowAction.onRun();
    expect(onRunStageGenerate).toHaveBeenCalledTimes(1);
  });

  it("keeps generate selected as the primary CTA and exposes Download Pack separately", () => {
    const onRunStageGenerate = vi.fn();
    const onDownloadPack = vi.fn();

    const workflow = buildAppWorkflowState({
      ...baseInput(),
      workflowStage: "generate",
      canDownloadPack: true,
      onRunStageGenerate,
      onDownloadPack,
    });

    expect(workflow.primaryWorkflowAction.label).toBe("Generate Selected");
    expect(workflow.secondaryWorkflowAction?.label).toBe("Download Pack");
    workflow.primaryWorkflowAction.onRun();
    workflow.secondaryWorkflowAction?.onRun();
    expect(onRunStageGenerate).toHaveBeenCalledTimes(1);
    expect(onDownloadPack).toHaveBeenCalledTimes(1);
  });

  it("maps upload and detect stages to stage-level actions", () => {
    const upload = buildAppWorkflowState({
      ...baseInput(),
      workflowStage: "upload",
      canRunDetection: true,
    });
    const detect = buildAppWorkflowState({
      ...baseInput(),
      workflowStage: "detect",
      workspaceHasSource: true,
    });

    expect(upload.primaryWorkflowAction.label).toBe("Run Detection");
    expect(detect.primaryWorkflowAction.label).toBe("Generate Masks");
  });
});

function baseInput() {
  return {
    canDownloadPack: false,
    canRunDetection: false,
    error: null,
    hasGenerateSelection: true,
    hasUnsavedGeometryChanges: false,
    isAnnotating: false,
    isExporting: false,
    isSavingState: false,
    isSavingVocabulary: false,
    isStartingCodexFinalTask: false,
    isSuggestingAllSegments: false,
    status: "",
    workspaceHasSource: true,
    workflowStage: "upload" as const,
    onDownloadPack: vi.fn(),
    onRunDetection: vi.fn(),
    onRunStageGenerate: vi.fn(),
    onRunStageMask: vi.fn(),
  };
}
