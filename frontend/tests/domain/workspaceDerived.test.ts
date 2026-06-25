import { describe, expect, it } from "vitest";

import { normalizeWorkspaceState, type WorkspaceElement } from "../../src/domain/workspace";
import {
  isPendingSegmentMaskElement,
  isSegmentableWorkbenchElement,
} from "../../src/domain/workspaceDerived";

const baseElement: WorkspaceElement = normalizeWorkspaceState({
  source: null,
  detectionVocabulary: [],
  elements: [
    {
      id: "element_001",
      name: "tower",
      label: "tower",
      status: "accepted",
      mode: "visible_only",
      assetRole: "sticker",
      removeFromParent: null,
      segmentationStatus: "mask_suggested",
      segmentationQuality: null,
      repairStatus: "not_required",
      exportStatus: "not_ready",
      bbox: { x: 10, y: 12, w: 20, h: 18 },
      canvas: { x: 10, y: 12, w: 20, h: 18 },
      layer: 1,
      thumbnail: "elements/element_001/thumb.png",
      mask: "elements/element_001/sam2_edge/mask.png",
      parentId: null,
      source: "manual",
      sourceProvider: "manual",
      sourcePrompt: "tower",
      notes: "",
      visible: true,
      confidence: null,
      history: [],
      mergedInto: null,
      exportParent: false,
    },
  ],
}).elements[0];

describe("workspaceDerived segment eligibility", () => {
  it("opens segment review for accepted manual and merged elements that already have masks", () => {
    const acceptedManual = {
      ...baseElement,
      id: "element_022",
      name: "tower",
      source: "manual",
      sourceProvider: "manual",
    } satisfies WorkspaceElement;
    const acceptedManualMerge = {
      ...baseElement,
      id: "element_023",
      name: "towel + basket",
      label: "towel + basket",
      source: "manual_merge",
      sourceProvider: "manual",
    } satisfies WorkspaceElement;

    expect(isSegmentableWorkbenchElement(acceptedManual)).toBe(true);
    expect(isSegmentableWorkbenchElement(acceptedManualMerge)).toBe(true);
  });

  it("keeps newly drawn manual boxes out of segment review until a mask exists", () => {
    const draftManual = {
      ...baseElement,
      segmentationStatus: "not_started",
      mask: null,
    } satisfies WorkspaceElement;

    expect(isSegmentableWorkbenchElement(draftManual)).toBe(false);
  });

  it("still includes accepted manual boxes without masks in the batch mask target list", () => {
    const acceptedManualWithoutMask = {
      ...baseElement,
      status: "accepted",
      segmentationStatus: "not_started",
      mask: null,
      source: "manual",
      sourceProvider: "manual",
    } satisfies WorkspaceElement;

    expect(isSegmentableWorkbenchElement(acceptedManualWithoutMask)).toBe(false);
    expect(isPendingSegmentMaskElement(acceptedManualWithoutMask)).toBe(true);
  });

  it("opens manual parent boxes without masks so users can override broken child-dependent masks", () => {
    const acceptedManualParentWithoutMask = {
      ...baseElement,
      id: "element_parent",
      name: "bathroom cabinet",
      status: "accepted",
      assetRole: "parent",
      segmentationStatus: "not_started",
      mask: null,
      source: "manual",
      sourceProvider: "manual",
    } satisfies WorkspaceElement;

    expect(isSegmentableWorkbenchElement(acceptedManualParentWithoutMask)).toBe(true);
    expect(isPendingSegmentMaskElement(acceptedManualParentWithoutMask)).toBe(true);
  });

  it("keeps repair-pending parent masks reviewable from the asset tree", () => {
    const repairPendingParent = {
      ...baseElement,
      id: "element_028",
      name: "shower",
      status: "repair_pending",
      assetRole: "parent",
      segmentationStatus: "mask_accepted",
      source: "manual",
      sourceProvider: "manual",
    } satisfies WorkspaceElement;

    expect(isSegmentableWorkbenchElement(repairPendingParent)).toBe(true);
  });
});
