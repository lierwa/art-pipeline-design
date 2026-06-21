import { describe, expect, it } from "vitest";

import { normalizeWorkspaceState, type WorkspaceElement } from "../../src/domain/workspace";
import {
  buildTaskItemIndex,
  displayWorkspaceTaskItems,
  summarizeWorkspaceTaskForDisplay,
  type WorkspaceTask,
} from "../../src/domain/workspaceTasks";

function makeElement(id: string, name: string): WorkspaceElement {
  return normalizeWorkspaceState({
    source: null,
    detectionVocabulary: [],
    elements: [
      {
        id,
        name,
        label: name,
        status: "accepted",
        mode: "visible_only",
        assetRole: "sticker",
        removeFromParent: null,
        segmentationStatus: "mask_suggested",
        segmentationQuality: null,
        repairStatus: "not_required",
        exportStatus: "not_ready",
        bbox: { x: 0, y: 0, w: 10, h: 10 },
        canvas: { x: 0, y: 0, w: 10, h: 10 },
        layer: 1,
        thumbnail: null,
        mask: `elements/${id}/sam2_edge/mask.png`,
        parentId: null,
        source: "model",
        sourceProvider: "grounding_dino",
        sourcePrompt: name,
        notes: "",
        visible: true,
        confidence: 0.8,
        history: [],
        mergedInto: null,
        exportParent: false,
      },
    ],
  }).elements[0];
}

describe("workspace task display projection", () => {
  it("treats informational SAM2 skips as unchanged instead of asset-row task status", () => {
    const task: WorkspaceTask = {
      taskId: "task_001",
      type: "sam2_mask_batch",
      status: "succeeded",
      createdAt: "2026-06-21T00:00:00Z",
      updatedAt: "2026-06-21T00:00:01Z",
      total: 3,
      done: 1,
      failed: 1,
      skipped: 1,
      items: [
        {
          elementId: "element_001",
          name: "cat",
          status: "succeeded",
          message: "SAM2 mask ready.",
          startedAt: null,
          finishedAt: null,
          artifactPaths: {},
        },
        {
          elementId: "element_002",
          name: "tower",
          status: "skipped",
          message: "Skipped because this mask is already ready for review.",
          startedAt: null,
          finishedAt: null,
          artifactPaths: {},
        },
        {
          elementId: "element_003",
          name: "sink",
          status: "failed",
          message: "Provider failed.",
          startedAt: null,
          finishedAt: null,
          artifactPaths: {},
        },
      ],
    };

    const summary = summarizeWorkspaceTaskForDisplay(task);
    expect(summary).toMatchObject({
      total: 2,
      done: 1,
      failed: 1,
      skipped: 0,
      unchanged: 1,
    });

    // WHY: 右侧资产列表只应标出本轮真正执行/失败的元素；“已有 mask”不是失败也不是跳过工作。
    expect(Object.keys(buildTaskItemIndex([task], [
      makeElement("element_001", "cat"),
      makeElement("element_002", "tower"),
      makeElement("element_003", "sink"),
    ]))).toEqual(["element_001", "element_003"]);
    expect(displayWorkspaceTaskItems(task).map((item) => item.elementId)).toEqual(["element_003", "element_001"]);
  });
});
