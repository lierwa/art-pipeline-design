import {
  cleanup,
  describe,
  expect,
  it,
  render,
  screen,
  userEvent,
  vi,
  within,
} from "../app/appTestHarness";
import { afterEach } from "vitest";

import { ChapterPromptGenerationPanel } from "../../src/features/coursePlanner/components/ChapterPromptGenerationPanel";
import type { ChapterScenePackage } from "../../src/features/coursePlanner/types";
import {
  characterIpFixture,
  sceneStyleFixture,
  studioScenePackageFixture,
} from "./chapterWorkspaceFixtures";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Chapter Prompt Generation panel", () => {
  it("replaces legacy Prompt Facts and Library Selection with one panel", () => {
    renderPanel();

    expect(screen.getByRole("region", { name: "Prompt Generation" })).toBeInTheDocument();
    expect(screen.queryByText("Prompt Facts")).not.toBeInTheDocument();
    expect(screen.queryByText("Library Selection")).not.toBeInTheDocument();
    expect(screen.queryByText("Save Prompt Facts")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Role")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Action")).not.toBeInTheDocument();
  });

  it("saves character selection atomically without role or action inputs", async () => {
    const user = userEvent.setup();
    const onSelectCharacters = vi.fn().mockResolvedValue(studioScenePackageFixture());
    renderPanel({
      characterIps: [characterIpFixture(), characterIpFixture({ id: "abu_ip", display_name: "阿布" })],
      onSelectCharacters,
    });

    await user.click(screen.getByRole("checkbox", { name: "阿布" }));

    expect(onSelectCharacters).toHaveBeenCalledWith(["child_ip_001", "abu_ip"]);
  });

  it("enforces the two-character maximum in the selector", () => {
    renderPanel({
      characterIps: [
        characterIpFixture(),
        characterIpFixture({ id: "abu_ip", display_name: "阿布" }),
        characterIpFixture({ id: "mimi_ip", display_name: "咪咪" }),
      ],
      scenePackage: studioScenePackageFixture({
        selected_character_ip_ids: ["child_ip_001", "abu_ip"],
      }),
    });

    expect(screen.getByRole("checkbox", { name: "咪咪" })).toBeDisabled();
    expect(screen.getByText("2 of 2 selected")).toBeInTheDocument();
  });

  it("reuses the Scene Style selector contract", async () => {
    const user = userEvent.setup();
    const onSelectSceneStyle = vi.fn().mockResolvedValue(studioScenePackageFixture());
    renderPanel({
      sceneStyles: [sceneStyleFixture(), sceneStyleFixture({ id: "style_ink", display_name: "水墨" })],
      onSelectSceneStyle,
    });

    await user.selectOptions(screen.getByRole("combobox", { name: "Scene style" }), "style_ink");

    expect(onSelectSceneStyle).toHaveBeenCalledWith("style_ink");
  });

  it("keeps Generate disabled until both cast and style are selected", () => {
    const { rerender } = renderPanel({
      scenePackage: studioScenePackageFixture({
        current_prompt_package: null,
        selected_character_ip_ids: [],
      }),
    });
    expect(screen.getByRole("button", { name: "Generate Prompt" })).toBeDisabled();

    rerender(panelElement({
      scenePackage: studioScenePackageFixture({
        current_prompt_package: null,
        scene_style_reference_id: null,
      }),
    }));
    expect(screen.getByRole("button", { name: "Generate Prompt" })).toBeDisabled();
  });

  it("generates both prompts from the ready setup", async () => {
    const user = userEvent.setup();
    const onGeneratePrompt = vi.fn().mockResolvedValue(studioScenePackageFixture());
    renderPanel({
      onGeneratePrompt,
      scenePackage: studioScenePackageFixture({ current_prompt_package: null }),
    });

    await user.click(screen.getByRole("button", { name: "Generate Prompt" }));

    expect(onGeneratePrompt).toHaveBeenCalledWith("");
  });

  it("exposes the shared Generating status and blocks another click", () => {
    renderPanel({ isGeneratingPrompt: true });

    expect(screen.getByRole("status", { name: "Generating" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generating…" })).toBeDisabled();
  });

  it("shows the generated Empty Scene Prompt by default", () => {
    renderPanel();

    expect(screen.getByRole("tab", { name: "Empty Scene Prompt" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/without characters or detachable objects/i)).toBeInTheDocument();
  });

  it("switches to the generated Complete Scene Prompt", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("tab", { name: "Complete Scene Prompt" }));

    expect(screen.getByText(/团团 reaching for the breakfast bowl/i)).toBeInTheDocument();
  });

  it("copies the active prompt through the browser clipboard API", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Copy Empty Scene Prompt" }));

    expect(writeText).toHaveBeenCalledWith(
      studioScenePackageFixture().current_prompt_package?.empty_scene_prompt,
    );
  });

  it("shows AI directions and generated object constraints as read-only output", () => {
    renderPanel();
    const panel = screen.getByRole("region", { name: "Prompt Generation" });

    expect(within(panel).getByText(/Reach for the breakfast bowl/i)).toBeInTheDocument();
    expect(within(panel).getByText("breakfast bowl")).toBeInTheDocument();
    expect(within(panel).getByText("knife")).toBeInTheDocument();
  });

  it("submits feedback only through Regenerate Prompt", async () => {
    const user = userEvent.setup();
    const onGeneratePrompt = vi.fn().mockResolvedValue(studioScenePackageFixture());
    renderPanel({ onGeneratePrompt });

    await user.type(screen.getByRole("textbox", { name: "Generation feedback" }), "Move the bowl left.");
    await user.click(screen.getByRole("button", { name: "Regenerate Prompt" }));

    expect(onGeneratePrompt).toHaveBeenCalledWith("Move the bowl left.");
  });

  it("marks a generated package stale when its frozen references no longer match", () => {
    const current = studioScenePackageFixture();
    renderPanel({
      scenePackage: studioScenePackageFixture({
        current_prompt_package: {
          ...current.current_prompt_package!,
          reference_snapshot: {
            ...current.current_prompt_package!.reference_snapshot,
            scene_style_image_id: "old_style_image",
          },
        },
      }),
    });

    expect(screen.getByRole("status", { name: "Needs regeneration" })).toBeInTheDocument();
  });
});

type PanelProps = Parameters<typeof ChapterPromptGenerationPanel>[0];

function panelElement(overrides: Partial<PanelProps> = {}) {
  return (
    <ChapterPromptGenerationPanel
      characterIps={[characterIpFixture()]}
      isGeneratingPrompt={false}
      onClearSceneStyle={vi.fn().mockResolvedValue(studioScenePackageFixture())}
      onGeneratePrompt={vi.fn().mockResolvedValue(studioScenePackageFixture())}
      onSelectCharacters={vi.fn().mockResolvedValue(studioScenePackageFixture())}
      onSelectSceneStyle={vi.fn().mockResolvedValue(studioScenePackageFixture())}
      scenePackage={studioScenePackageFixture()}
      sceneStyles={[sceneStyleFixture()]}
      {...overrides}
    />
  );
}

function renderPanel(overrides: Partial<PanelProps> = {}) {
  return render(panelElement(overrides));
}
