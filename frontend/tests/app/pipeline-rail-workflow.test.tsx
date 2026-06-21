import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PipelineRail } from "../../src/app/components/PipelineRail";
import type { WorkspaceElement } from "../../src/domain/workspace";

describe("PipelineRail workflow stages", () => {
  it("renders only upload detect mask generate from workflow stage", () => {
    render(
      <PipelineRail
        workflowStage="generate"
        source={{
          filename: "scene.png",
          path: "source/original.png",
          width: 120,
          height: 90,
        }}
        elements={[maskAcceptedElement, finalReadyElement]}
        exportSummary={null}
        canGoBack
        onGoBack={vi.fn()}
      />,
    );

    const rail = screen.getByRole("navigation", { name: /pipeline stages/i });
    expect(within(rail).getByText("Upload")).toBeInTheDocument();
    expect(within(rail).getByText("Detect")).toBeInTheDocument();
    expect(within(rail).getByText("Mask")).toBeInTheDocument();
    expect(within(rail).getByText("Generate")).toBeInTheDocument();
    expect(within(rail).queryByText("Segment")).not.toBeInTheDocument();
    expect(within(rail).queryByText("Repair")).not.toBeInTheDocument();
    expect(within(rail).queryByText("Export")).not.toBeInTheDocument();
    expect(within(rail).getAllByRole("listitem")).toHaveLength(4);
    expect(within(rail).getByText("Generate").closest("li")).toHaveClass("is-active");
  });
});

const maskAcceptedElement: WorkspaceElement = {
  id: "element_001",
  name: "cat",
  label: "cat",
  status: "accepted",
  mode: "visible_only",
  assetRole: "sticker",
  removeFromParent: null,
  segmentationStatus: "mask_accepted",
  segmentationQuality: null,
  repairStatus: "not_required",
  exportStatus: "not_ready",
  bbox: { x: 1, y: 2, w: 3, h: 4 },
  canvas: { x: 1, y: 2, w: 3, h: 4 },
  layer: 1,
  thumbnail: null,
  mask: "elements/element_001/sam2_edge/mask.png",
  parentId: null,
  source: "manual",
  sourceProvider: "grounding_dino",
  sourcePrompt: "cat",
  notes: "",
  visible: true,
  confidence: null,
  history: [],
  mergedInto: null,
  exportParent: false,
};

const finalReadyElement: WorkspaceElement = {
  ...maskAcceptedElement,
  id: "element_002",
  name: "stool",
  label: "stool",
  status: "repair_complete",
  sourceProvider: "codex_cli",
  exportStatus: "ready",
};
