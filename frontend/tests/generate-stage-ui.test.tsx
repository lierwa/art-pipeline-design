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
import { installFetchMock, jsonResponse } from "./app/appTestHarness";

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

  it("uses separate cache tokens for SAM2 sticker and Codex final previews", () => {
    const selected = elementFixture({ id: "element_001", name: "cat" });

    render(
      <GenerateReviewPanel
        assetCacheKey={7}
        elements={[selected]}
        generatePromptHints={{}}
        selectedElement={selected}
        taskItemsByElementId={{
          element_001: {
            elementId: "element_001",
            name: "cat",
            status: "failed",
            message: "Codex final output is identical to the SAM2 mask sticker.",
            startedAt: "2026-06-22T09:30:01+00:00",
            finishedAt: "2026-06-22T09:30:03+00:00",
            artifactPaths: {},
          },
        }}
        workspaceRunId="run_demo"
        onRerunElement={vi.fn()}
        onSavePromptHint={vi.fn()}
      />,
    );

    const sam2Src = screen.getByRole("img", { name: /cat sam2 sticker/i }).getAttribute("src") ?? "";
    const finalSrc = screen.getByRole("img", { name: /cat codex final/i }).getAttribute("src") ?? "";
    const sam2Cache = new URL(sam2Src, "http://localhost").searchParams.get("cache");
    const finalCache = new URL(finalSrc, "http://localhost").searchParams.get("cache");

    expect(sam2Src).toContain("/sam2_edge/transparent_asset.png");
    expect(finalSrc).toContain("/codex_final/transparent_asset.png");
    expect(sam2Cache).toBe("7");
    expect(finalCache).toContain("codex-final:element_001:7:failed");
    expect(finalCache).not.toBe(sam2Cache);
    expect(screen.getByText("Codex final output is identical to the SAM2 mask sticker.")).toBeInTheDocument();
  });

  it("shows QA failure state without replacing the accepted final preview", () => {
    const selected = elementFixture({
      id: "element_001",
      name: "cat",
      sourceProvider: "codex_cli",
      exportStatus: "ready",
    });

    render(
      <GenerateReviewPanel
        assetCacheKey={7}
        elements={[selected]}
        generatePromptHints={{}}
        selectedElement={selected}
        taskItemsByElementId={{
          element_001: {
            elementId: "element_001",
            name: "cat",
            status: "succeeded",
            message: "Codex final candidate needs repair.",
            startedAt: "2026-06-25T09:30:01+00:00",
            finishedAt: "2026-06-25T09:30:03+00:00",
            artifactPaths: {
              qualityStatus: "failed",
              repairNote: "Candidate appears clipped at the output edge.",
              finalOutputPath: "elements/element_001/codex_final/job/job_failed/final_asset.png",
              qualityReportPath: "elements/element_001/codex_final/job/job_failed/quality_report.json",
            },
          },
        }}
        workspaceRunId="run_demo"
        onRerunElement={vi.fn()}
        onSavePromptHint={vi.fn()}
      />,
    );

    const panel = screen.getByRole("region", { name: /generate final review/i });
    const actions = panel.querySelector(".generate-review-actions");
    expect(actions).not.toBeNull();
    expect(within(actions as HTMLElement).getByText("QA failed")).toBeInTheDocument();
    expect(within(actions as HTMLElement).queryByText("Done")).not.toBeInTheDocument();
    expect(within(panel).getByRole("region", { name: /qa repair note/i })).toHaveTextContent(
      "Candidate appears clipped at the output edge.",
    );

    const acceptedFinalSrc = within(panel).getByRole("img", { name: /cat codex final/i }).getAttribute("src") ?? "";
    const failedCandidateSrc = within(panel).getByRole("img", { name: /cat failed candidate/i }).getAttribute("src") ?? "";

    expect(acceptedFinalSrc).toContain("/elements/element_001/codex_final/transparent_asset.png");
    expect(failedCandidateSrc).toContain("/elements/element_001/codex_final/job/job_failed/final_asset.png");
    expect(panel).not.toHaveTextContent("elements/element_001/codex_final/job/job_failed/final_asset.png");
    expect(panel).not.toHaveTextContent("elements/element_001/codex_final/job/job_failed/quality_report.json");
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
    expect(within(promptTools).getByText("Full request used last time")).toBeInTheDocument();
    expect(promptTools.querySelector("details")).not.toBeInTheDocument();
    expect(within(promptTools).getByText(/No previous Codex request metadata recorded for this asset/i)).toBeInTheDocument();
  });

  it("shows the full Codex image request with attached image order and prompt text", async () => {
    const restoreFetch = installFetchMock(async () => jsonResponse({
      provider: "codex_cli",
      createdAt: "2026-06-22T09:30:00+00:00",
      generationProfile: "child_standalone",
      assetPath: "elements/element_001/codex_final/transparent_asset.png",
      rawOutputPath: "elements/element_001/codex_final/job/job_202606220930000000_abcd1234/codex_raw.png",
      outputPath: "elements/element_001/codex_final/job/job_202606220930000000_abcd1234/final_asset.png",
      workDirPath: "elements/element_001/codex_final/job/job_202606220930000000_abcd1234",
      promptPath: "elements/element_001/codex_final/job/job_202606220930000000_abcd1234/prompt.md",
      briefImagePath: "elements/element_001/codex_final/job/job_202606220930000000_abcd1234/generation_brief.png",
      briefJsonPath: "elements/element_001/codex_final/job/job_202606220930000000_abcd1234/generation_brief.json",
      jobId: "job_202606220930000000_abcd1234",
      codexThreadId: "thread_123",
      referenceSha256: "reference-hash",
      rawOutputSha256: "raw-output-hash",
      outputSha256: "output-hash",
      isOutputIdenticalToReference: false,
      chromaKey: [0, 255, 0],
      timing: { rawOutputSeconds: 12.3456 },
      inputImagePaths: [
        "elements/element_001/sam2_edge/source_crop.png",
        "elements/element_001/sam2_edge/transparent_asset.png",
        "elements/element_001/sam2_edge/mask.png",
      ],
      removedChildren: [],
      promptHint: "keep original color",
      prompt: "$imagegen\nTEXT PROMPT BODY",
    }));
    const selected = elementFixture({ id: "element_001", name: "cat" });

    try {
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
          onSelectElement={vi.fn()}
        />,
      );

      const fullRequest = await screen.findByLabelText(/full request used last time/i);
      expect(fullRequest).toHaveTextContent(/REQUEST/);
      expect(fullRequest).toHaveTextContent(/Provider:\s+codex_cli/);
      expect(fullRequest).toHaveTextContent(/Generation profile:\s+child_standalone/);
      expect(fullRequest).toHaveTextContent(/Output path:\s+elements\/element_001\/codex_final\/transparent_asset\.png/);
      expect(fullRequest).toHaveTextContent(/Raw Codex output path:\s+elements\/element_001\/codex_final\/job\/job_202606220930000000_abcd1234\/codex_raw\.png/);
      expect(fullRequest).toHaveTextContent(/Job id:\s+job_202606220930000000_abcd1234/);
      expect(fullRequest).toHaveTextContent(/Codex thread:\s+thread_123/);
      expect(fullRequest).toHaveTextContent(/Job output path:\s+elements\/element_001\/codex_final\/job\/job_202606220930000000_abcd1234\/final_asset\.png/);
      expect(fullRequest).toHaveTextContent(/Prompt path:\s+elements\/element_001\/codex_final\/job\/job_202606220930000000_abcd1234\/prompt\.md/);
      expect(fullRequest).toHaveTextContent(/Brief image:\s+elements\/element_001\/codex_final\/job\/job_202606220930000000_abcd1234\/generation_brief\.png/);
      expect(fullRequest).toHaveTextContent(/Brief JSON:\s+elements\/element_001\/codex_final\/job\/job_202606220930000000_abcd1234\/generation_brief\.json/);
      expect(fullRequest).toHaveTextContent(/Chroma key:\s+rgb\(0, 255, 0\)/);
      expect(fullRequest).toHaveTextContent(/Raw output seconds:\s+12\.35s/);
      expect(fullRequest).toHaveTextContent(/Reference sha256:\s+reference-hash/);
      expect(fullRequest).toHaveTextContent(/Raw output sha256:\s+raw-output-hash/);
      expect(fullRequest).toHaveTextContent(/Output sha256:\s+output-hash/);
      expect(fullRequest).toHaveTextContent(/Identical to mask sticker:\s+false/);
      expect(fullRequest).toHaveTextContent(/ATTACHED IMAGES, EXACT ORDER/);
      expect(fullRequest).toHaveTextContent(/1\s+source_crop\s+elements\/element_001\/sam2_edge\/source_crop\.png\s+source authority/);
      expect(fullRequest).toHaveTextContent(/2\s+transparent_cutout\s+elements\/element_001\/sam2_edge\/transparent_asset\.png\s+mask output reference/);
      expect(fullRequest).toHaveTextContent(/3\s+mask\s+elements\/element_001\/sam2_edge\/mask\.png\s+diagnostic mask/);
      expect(fullRequest).toHaveTextContent(/TEXT PROMPT SENT TO CODEX/);
      expect(fullRequest).toHaveTextContent(/\$imagegen\s+TEXT PROMPT BODY/);
    } finally {
      restoreFetch();
    }
  });

  it("uses Codex input image roles instead of fixed request image indexes", async () => {
    const restoreFetch = installFetchMock(async () => jsonResponse({
      provider: "codex_cli",
      createdAt: "2026-06-25T09:30:00+00:00",
      generationProfile: "parent_inpaint",
      assetPath: "elements/parent_001/codex_final/transparent_asset.png",
      rawOutputPath: "elements/parent_001/codex_final/job/job_a/codex_raw.png",
      outputPath: "elements/parent_001/codex_final/job/job_a/final_asset.png",
      workDirPath: "elements/parent_001/codex_final/job/job_a",
      promptPath: "elements/parent_001/codex_final/job/job_a/prompt.md",
      briefImagePath: "elements/parent_001/codex_final/job/job_a/generation_brief.png",
      briefJsonPath: "elements/parent_001/codex_final/job/job_a/generation_brief.json",
      jobId: "job_a",
      codexThreadId: "thread_parent",
      referenceSha256: null,
      rawOutputSha256: null,
      outputSha256: null,
      isOutputIdenticalToReference: false,
      chromaKey: [0, 255, 0],
      timing: {},
      inputImagePaths: [
        "elements/parent_001/sam2_edge/source_crop.png",
        "elements/parent_001/codex_final/job/job_a/generation_brief.png",
        "elements/parent_001/sam2_edge/transparent_asset.png",
        "elements/parent_001/sam2_edge/mask.png",
        "elements/parent_001/codex_final/job/job_a/layout_guide.png",
        "elements/parent_001/codex_final/transparent_asset.png",
        "elements/parent_001/codex_final/job/job_previous/final_asset.png",
        "elements/child_001/sam2_edge/mask.png",
      ],
      inputImages: [
        { role: "source_crop", path: "elements/parent_001/sam2_edge/source_crop.png" },
        { role: "visual_generation_brief", path: "elements/parent_001/codex_final/job/job_a/generation_brief.png" },
        { role: "transparent_cutout", path: "elements/parent_001/sam2_edge/transparent_asset.png" },
        { role: "mask", path: "elements/parent_001/sam2_edge/mask.png" },
        { role: "layout_guide", path: "elements/parent_001/codex_final/job/job_a/layout_guide.png" },
        { role: "previous_final", path: "elements/parent_001/codex_final/transparent_asset.png" },
        { role: "failed_candidate", path: "elements/parent_001/codex_final/job/job_previous/final_asset.png" },
        { role: "removed_child_mask", path: "elements/child_001/sam2_edge/mask.png" },
      ],
      removedChildren: [
        { name: "stool", maskPath: "elements/child_001/sam2_edge/mask.png" },
      ],
      promptHint: "repair clipping",
      prompt: "$imagegen\nPARENT PROMPT BODY",
    }));
    const selected = elementFixture({
      id: "parent_001",
      name: "parent",
      assetRole: "parent",
      sourceProvider: "codex_cli",
      exportStatus: "ready",
    });

    try {
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

      const fullRequest = await screen.findByLabelText(/full request used last time/i);
      expect(fullRequest).toHaveTextContent(/2\s+visual_generation_brief\s+elements\/parent_001\/codex_final\/job\/job_a\/generation_brief\.png\s+task map/);
      expect(fullRequest).toHaveTextContent(/5\s+layout_guide\s+elements\/parent_001\/codex_final\/job\/job_a\/layout_guide\.png\s+layout guide/);
      expect(fullRequest).toHaveTextContent(/6\s+previous_final\s+elements\/parent_001\/codex_final\/transparent_asset\.png\s+accepted final reference/);
      expect(fullRequest).toHaveTextContent(/7\s+failed_candidate\s+elements\/parent_001\/codex_final\/job\/job_previous\/final_asset\.png\s+failed candidate/);
      expect(fullRequest).toHaveTextContent(/8\s+removed_child_mask:stool\s+elements\/child_001\/sam2_edge\/mask\.png\s+removed child mask/);
      expect(fullRequest).not.toHaveTextContent(/removed_child_mask:stool\s+elements\/parent_001\/codex_final\/job\/job_a\/layout_guide\.png/);
    } finally {
      restoreFetch();
    }
  });

  it("falls back clearly when Codex request metadata is missing", async () => {
    const restoreFetch = installFetchMock(async () => jsonResponse(
      { detail: "Codex request metadata not found." },
      404,
    ));
    const selected = elementFixture({ id: "element_001", name: "cat" });

    try {
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
          onSelectElement={vi.fn()}
        />,
      );

      expect(await screen.findByText(/No previous Codex request metadata recorded for this asset/i)).toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("shows Codex agent handoff artifacts and final-ready state", () => {
    const selected = elementFixture({
      id: "element_001",
      name: "cat",
      sourceProvider: "codex_agent",
      exportStatus: "ready",
    });

    render(
      <GenerateReviewPanel
        assetCacheKey={1}
        elements={[selected]}
        generatePromptHints={{}}
        selectedElement={selected}
        taskItemsByElementId={{
          element_001: {
            elementId: "element_001",
            name: "cat",
            status: "running",
            message: "Waiting for Codex agent raw image.",
            startedAt: "2026-06-22T09:30:01+00:00",
            finishedAt: null,
            artifactPaths: {
              manifestPath: "tasks/task_codex/codex-final-jobs.json",
              handoffPath: "tasks/task_codex/codex-final-agent-handoff.md",
              briefImagePath: "elements/element_001/codex_final/job/job_a/generation_brief.png",
              promptPath: "elements/element_001/codex_final/job/job_a/prompt.md",
              rawOutputPath: "elements/element_001/codex_final/job/job_a/codex_raw.png",
            },
          },
        }}
        workspaceRunId="run_demo"
        onRerunElement={vi.fn()}
        onSavePromptHint={vi.fn()}
      />,
    );

    expect(screen.getByText("Final ready")).toBeInTheDocument();
    const artifacts = screen.getByLabelText(/codex agent handoff artifacts/i);
    expect(artifacts).toHaveTextContent("Manifest");
    expect(artifacts).toHaveTextContent("tasks/task_codex/codex-final-jobs.json");
    expect(artifacts).toHaveTextContent("Agent handoff");
    expect(artifacts).toHaveTextContent("tasks/task_codex/codex-final-agent-handoff.md");
    expect(artifacts).toHaveTextContent("Brief image");
    expect(artifacts).toHaveTextContent("elements/element_001/codex_final/job/job_a/generation_brief.png");
    expect(artifacts).toHaveTextContent("Prompt");
    expect(artifacts).toHaveTextContent("elements/element_001/codex_final/job/job_a/prompt.md");
    expect(artifacts).toHaveTextContent("Raw output");
    expect(artifacts).toHaveTextContent("elements/element_001/codex_final/job/job_a/codex_raw.png");
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
    const waitingTask = taskFixture({
      items: [
        {
          elementId: "element_001",
          name: "cat",
          status: "running",
          message: "Waiting for Codex agent raw image.",
          startedAt: "2026-06-22T09:30:01+00:00",
          finishedAt: null,
          artifactPaths: {
            manifestPath: "tasks/task_codex/codex-final-jobs.json",
            handoffPath: "tasks/task_codex/codex-final-agent-handoff.md",
            briefImagePath: "elements/element_001/codex_final/job/job_a/generation_brief.png",
            promptPath: "elements/element_001/codex_final/job/job_a/prompt.md",
            rawOutputPath: "elements/element_001/codex_final/job/job_a/codex_raw.png",
          },
        },
      ],
    });

    render(<WorkspaceTaskPanel tasks={[waitingTask]} onRetryFailedTask={vi.fn()} />);

    const panel = screen.getByRole("region", { name: /workspace tasks/i });
    expect(within(panel).queryByText("cat")).not.toBeInTheDocument();
    expect(within(panel).getByText(/Codex final batch/i)).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: /expand task progress/i }));
    expect(within(panel).getByText("cat")).toBeInTheDocument();
    // WHY: 浮动任务面板只负责批处理概览；详细交接路径留在 Generate Review，
    // 避免全量重跑时面板被 manifest/prompt/raw path 淹没。
    expect(within(panel).queryByLabelText(/cat task artifacts/i)).not.toBeInTheDocument();
    expect(panel).not.toHaveTextContent("tasks/task_codex/codex-final-jobs.json");
    expect(panel).not.toHaveTextContent("elements/element_001/codex_final/job/job_a/codex_raw.png");
    await user.click(within(panel).getByRole("button", { name: /collapse task progress/i }));
    expect(screen.getByRole("region", { name: /workspace tasks/i })).toBeInTheDocument();
    expect(within(panel).queryByText("cat")).not.toBeInTheDocument();
  });

  it("keeps generate selection, disclosure, content, badges, and visibility on fixed asset-list columns", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

    expect(css).toContain("grid-template-columns: minmax(0, 1fr) 58px");
    expect(css).toContain(".asset-tree-actions");
    expect(css).toContain("flex-wrap: wrap");
    expect(css).not.toContain("minmax(112px, auto)");
    expect(css).toContain(".asset-tree-bulk-toggle");
  });

  it("lets the stage drawer fill the canvas work area instead of capping the panel height", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

    expect(css).toContain("height: calc(100% - 1rem)");
    expect(css).not.toContain("height: min(620px, calc(100vh - 112px))");
    expect(css).toContain("grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr)");
    expect(css).toContain(".generate-comparison-grid .segment-edge-preview-frame");
    expect(css).toContain("height: 100%");
    expect(css).toContain("object-position: center center");
  });
});
