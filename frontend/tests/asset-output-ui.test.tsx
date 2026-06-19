import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AssetTreePanel } from "../src/components/AssetTreePanel";
import { ModelStatusStrip } from "../src/components/ModelStatusStrip";
import type { WorkspaceElement } from "../src/workspace";

const element: WorkspaceElement = {
  id: "element_001",
  name: "Cat",
  label: "Cat",
  status: "accepted",
  mode: "visible_only",
  bbox: { x: 10, y: 12, w: 80, h: 72 },
  canvas: { x: 10, y: 12, w: 80, h: 72 },
  layer: 1,
  thumbnail: "elements/element_001/thumb.png",
  mask: "elements/element_001/sam2_edge/mask.png",
  parentId: null,
  source: "model_detection",
  sourceProvider: "grounding_dino",
  sourcePrompt: "cat",
  assetRole: "sticker",
  removeFromParent: null,
  segmentationStatus: "mask_accepted",
  repairStatus: "not_required",
  exportStatus: "ready",
  notes: "",
  visible: true,
  confidence: 0.91,
  history: [],
  mergedInto: null,
  exportParent: false,
};

describe("asset output UI", () => {
  it("renders the asset list without review counter fields", () => {
    render(
      <AssetTreePanel
        elements={[element]}
        selectedElementId={element.id}
        selectedElementIds={[element.id]}
        workspaceRunId="run_real_models"
        assetCacheKey={1}
        showRejected={false}
        reviewableCount={0}
        onSelectElement={vi.fn()}
        onToggleShowRejected={vi.fn()}
        onToggleVisibility={vi.fn()}
        onCompleteReview={vi.fn()}
      />,
    );

    const panel = screen.getByRole("complementary");
    expect(within(panel).queryByText("Review queue")).not.toBeInTheDocument();
    expect(within(panel).queryByText("Reviewed")).not.toBeInTheDocument();
    expect(within(panel).queryByText("Accepted")).not.toBeInTheDocument();
    expect(within(panel).queryByText("Needs Review")).not.toBeInTheDocument();
    expect(within(panel).getByText("Export ready")).toBeInTheDocument();
  });

  it("renders the status strip as model/output telemetry instead of review metrics", () => {
    render(
      <ModelStatusStrip
        elements={[element]}
        status="Ready"
        isSaving={false}
        exportSummary={null}
      />,
    );

    const strip = screen.getByRole("contentinfo");
    expect(within(strip).queryByText("Model Provider")).not.toBeInTheDocument();
    expect(within(strip).queryByText("Reviewed")).not.toBeInTheDocument();
    expect(within(strip).queryByText("Accepted")).not.toBeInTheDocument();
    expect(within(strip).queryByText("Needs Review")).not.toBeInTheDocument();
    expect(within(strip).getByText("Model Chain")).toBeInTheDocument();
    expect(within(strip).getByText("Masks Ready")).toBeInTheDocument();
    expect(within(strip).getByText("Export Ready")).toBeInTheDocument();
  });
});
