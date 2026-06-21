import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { FloatingStageDrawer } from "../src/features/segment/FloatingStageDrawer";
import { GenerateReviewPanel } from "../src/features/generate/GenerateReviewPanel";
import { WorkspaceTaskPanel } from "../src/features/tasks/WorkspaceTaskPanel";
import { normalizeWorkspaceState, type WorkspaceElement } from "../src/domain/workspace";
import type { WorkspaceTask } from "../src/domain/workspaceTasks";

function elementFixture(overrides: Partial<WorkspaceElement> = {}): WorkspaceElement {
  return normalizeWorkspaceState({
    source: null,
    detectionVocabulary: [],
    elements: [
      {
        id: "element_001",
        name: "cat",
        label: "cat",
        status: "accepted",
        mode: "visible_only",
        assetRole: "sticker",
        removeFromParent: null,
        segmentationStatus: "mask_accepted",
        repairStatus: "not_required",
        exportStatus: "ready",
        bbox: { x: 12, y: 16, w: 30, h: 32 },
        canvas: { x: 4, y: 8, w: 46, h: 48 },
        layer: 1,
        thumbnail: "elements/element_001/thumb.png",
        mask: "elements/element_001/sam2_edge/mask.png",
        parentId: null,
        source: "model_detection",
        sourceProvider: "codex_cli",
        sourcePrompt: "Draw a cat sticker.",
        sourcePromptHint: null,
        notes: "",
        visible: true,
        confidence: 0.84,
        history: [],
        mergedInto: null,
        exportParent: false,
        ...overrides,
      },
    ],
  }).elements[0];
}

function taskFixture(overrides: Partial<WorkspaceTask> = {}): WorkspaceTask {
  return {
    taskId: "task_202606220930000000_codex-final-batch",
    type: "codex_final_batch",
    status: "running",
    createdAt: "2026-06-22T09:30:00+00:00",
    updatedAt: "2026-06-22T09:31:00+00:00",
    total: 2,
    done: 1,
    failed: 0,
    skipped: 0,
    items: [
      {
        elementId: "element_001",
        name: "cat",
        status: "succeeded",
        message: "Codex final asset ready.",
        startedAt: "2026-06-22T09:30:01+00:00",
        finishedAt: "2026-06-22T09:30:03+00:00",
        artifactPaths: {},
      },
      {
        elementId: "element_002",
        name: "stool",
        status: "running",
        message: "Generating Codex final asset.",
        startedAt: "2026-06-22T09:30:04+00:00",
        finishedAt: null,
        artifactPaths: {},
      },
    ],
    ...overrides,
  };
}

describe("generate stage UI", () => {
  it("shows only the selected asset comparison in the Generate panel", () => {
    const selected = elementFixture({ id: "element_001", name: "cat" });
    const other = elementFixture({ id: "element_002", name: "stool" });

    render(
      <GenerateReviewPanel
        assetCacheKey={1}
        elements={[selected, other]}
        generatePromptHints={{}}
        selectedElement={selected}
        taskItemsByElementId={{}}
        workspaceRunId="run_demo"
        onRerunElement={vi.fn()}
        onSavePromptHint={vi.fn()}
        onSelectElement={vi.fn()}
      />,
    );

    const panel = screen.getByRole("region", { name: /generate final review/i });
    expect(panel.querySelector(".generate-review-list")).not.toBeInTheDocument();
    expect(within(panel).queryByText(/generation profile/i)).not.toBeInTheDocument();
    expect(within(panel).queryByText(/generate selection/i)).not.toBeInTheDocument();
    expect(within(panel).getByRole("img", { name: /cat source crop/i })).toBeInTheDocument();
    expect(within(panel).getByRole("img", { name: /cat codex final/i })).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: /stool/i })).not.toBeInTheDocument();
  });

  it("lays out prompt hint and the previous prompt as side-by-side review tools", () => {
    const selected = elementFixture({
      id: "element_001",
      name: "cat",
      sourcePrompt: "Prompt used last time body.",
    });

    render(
      <GenerateReviewPanel
        assetCacheKey={1}
        elements={[selected]}
        generatePromptHints={{}}
        selectedElement={selected}
        taskItemsByElementId={{}}
        workspaceRunId="run_demo"
        onRerunElement={vi.fn()}
        onSavePromptHint={vi.fn()}
      />,
    );

    const promptTools = screen.getByRole("group", { name: /generate prompt tools/i });
    expect(within(promptTools).getByRole("textbox", { name: /prompt hint/i })).toBeInTheDocument();
    expect(within(promptTools).getByText("Prompt used last time")).toBeInTheDocument();
    expect(promptTools.querySelector("details")).not.toBeInTheDocument();
    expect(within(promptTools).getByText("Prompt used last time body.")).toBeInTheDocument();
  });

  it("reruns the selected asset from the prompt hint send button, not Enter", async () => {
    const user = userEvent.setup();
    const onRerunElement = vi.fn();
    const onSavePromptHint = vi.fn();
    const selected = elementFixture({ id: "element_001", name: "cat" });

    render(
      <GenerateReviewPanel
        assetCacheKey={1}
        elements={[selected]}
        generatePromptHints={{}}
        selectedElement={selected}
        taskItemsByElementId={{}}
        workspaceRunId="run_demo"
        onRerunElement={onRerunElement}
        onSavePromptHint={onSavePromptHint}
        onSelectElement={vi.fn()}
      />,
    );

    const promptBox = screen.getByRole("textbox", { name: /prompt hint/i });
    await user.type(promptBox, "keep the original angle{Enter}");
    expect(onRerunElement).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /rerun cat with prompt hint/i }));
    expect(onSavePromptHint).toHaveBeenCalledWith("element_001", "keep the original angle");
    expect(onRerunElement).toHaveBeenCalledWith("element_001", "keep the original angle");
  });

  it("keeps the stage drawer collapse-only without a resize separator", async () => {
    const user = userEvent.setup();

    render(
      <FloatingStageDrawer title="Generate">
        <p>Workbench content</p>
      </FloatingStageDrawer>,
    );

    expect(screen.queryByRole("separator", { name: /resize generate drawer height/i })).not.toBeInTheDocument();
    expect(screen.getByText("Workbench content")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /collapse generate drawer/i }));
    expect(screen.queryByText("Workbench content")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /expand generate drawer/i }));
    expect(screen.getByText("Workbench content")).toBeInTheDocument();
  });

  it("collapses task progress to a compact progress summary without dismissing it", async () => {
    const user = userEvent.setup();

    render(<WorkspaceTaskPanel tasks={[taskFixture()]} onRetryFailedTask={vi.fn()} />);

    const panel = screen.getByRole("region", { name: /workspace tasks/i });
    expect(within(panel).getByText("cat")).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: /collapse task progress/i }));
    expect(screen.getByRole("region", { name: /workspace tasks/i })).toBeInTheDocument();
    expect(within(panel).queryByText("cat")).not.toBeInTheDocument();
    expect(within(panel).getByText(/Codex final batch/i)).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: /expand task progress/i }));
    expect(within(panel).getByText("cat")).toBeInTheDocument();
  });

  it("keeps generate selection, disclosure, content, badges, and visibility on fixed asset-list columns", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

    expect(css).toContain("grid-template-columns: 22px 18px minmax(0, 1fr) 28px");
    expect(css).toContain("padding-left: calc(var(--asset-depth, 0) * 0.82rem)");
    expect(css).toContain("minmax(120px, auto)");
  });

  it("lets the stage drawer fill the canvas work area instead of capping the panel height", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

    expect(css).toContain("height: calc(100% - 1rem)");
    expect(css).not.toContain("height: min(620px, calc(100vh - 112px))");
    expect(css).toContain("grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr)");
  });
});
