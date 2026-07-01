import {
  App,
  describe,
  expect,
  fireEvent,
  installFetchMock,
  it,
  jsonResponse,
  render,
  screen,
  userEvent,
  vi,
  waitFor,
  within,
} from "../app/appTestHarness";

import {
  coursePlannerState,
  imageAttempt,
  installChapterWorkspaceFetchMock,
  promptVersion,
  toSnakeObjectPlan,
  toSnakeCastBindings,
  toSnakePromptTuning,
  toSnakeSceneVocabulary,
  toSnakeSceneDirectorPlan,
} from "./chapterWorkspaceTestHelpers";
import { derivePromptVersionUiState } from "../../src/features/coursePlanner/domain/promptVersionUiState";

describe("Chapter Workspace", () => {
  it("derives Prompt Version readiness from a single UI-state helper", () => {
    expect(derivePromptVersionUiState(null)).toMatchObject({
      key: "empty",
      canGeneratePrompt: false,
      canCopyPrompt: false,
      canUploadImage: false,
    });

    expect(
      derivePromptVersionUiState(
        promptVersion({
          castBindings: [],
        }),
      ),
    ).toMatchObject({
      key: "needs_tuning",
      canGeneratePrompt: false,
      canCopyPrompt: false,
      canUploadImage: false,
      reason: "Add role IP and reference images before generating the final Image2 prompt.",
    });

    expect(
      derivePromptVersionUiState(
        promptVersion({
          promptPackage: {
            fullPrompt: "Scene Director Plan:\n- legacy schema",
            negativeConstraints: "legacy negative",
            shortPrompt: null,
            revisionPrompt: null,
          },
        }),
      ),
    ).toMatchObject({
      key: "prompt_ready",
      canGeneratePrompt: true,
      canCopyPrompt: false,
      canUploadImage: false,
    });

    expect(
      derivePromptVersionUiState(
        promptVersion({
          status: "archived",
        }),
      ),
    ).toMatchObject({
      key: "archived",
      canGeneratePrompt: false,
      canCopyPrompt: false,
      canUploadImage: false,
      reason: "Archived versions cannot generate or upload images.",
    });
  });

  it("opens with Chapter Seed context and generates the first Prompt Version instead of an empty manual designer", async () => {
    const user = userEvent.setup();
    const createCalls: string[] = [];
    const firstVersion = promptVersion({ id: "prompt_version_001", versionLabel: "V001" });
    const restoreFetch = installChapterWorkspaceFetchMock({
      state: coursePlannerState({ promptVersions: [] }),
      createPromptVersion: (input) => {
        createCalls.push(String(input));
        return jsonResponse({ promptVersion: firstVersion });
      },
    });

    try {
      window.history.pushState({}, "", "/course-planner/chapters/chapter_kitchen");
      render(<App />);

      expect(await screen.findByRole("heading", { name: "厨房早餐打翻" })).toBeInTheDocument();
      const main = screen.getByRole("main");
      const seedContext = within(main).getByRole("region", { name: "Chapter Seed Summary" });
      expect(within(seedContext).getByText("室内家庭篇")).toBeInTheDocument();
      expect(within(seedContext).getAllByText("早餐时牛奶杯打翻，孩子和家长一起处理。").length).toBeGreaterThan(0);
      expect(within(seedContext).getByText("厨房餐台、冰箱和水槽形成清晰动线。")).toBeInTheDocument();
      expect(within(seedContext).getByText("milk cup")).toBeInTheDocument();
      expect(within(seedContext).getByText("tuantuan and abu from the cat IP cast")).toBeInTheDocument();

      expect(within(main).queryByRole("region", { name: "Scene Card" })).not.toBeInTheDocument();
      expect(within(main).queryByRole("region", { name: "Detection Keywords" })).not.toBeInTheDocument();
      expect(within(main).queryByRole("region", { name: "Scene Director Design" })).not.toBeInTheDocument();

      await user.click(within(main).getByRole("button", { name: "基于 Chapter Seed 生成第一个 Prompt 版本" }));

      await waitFor(() => {
        expect(createCalls).toEqual(["/api/course-planner/chapters/chapter_kitchen/prompt-versions"]);
      });
      expect(await within(main).findByText("V001")).toBeInTheDocument();
      expect(within(main).getAllByText("早餐厨房构图").length).toBeGreaterThan(0);
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });

  it("shows multiple Prompt Versions and switches the Scene Director design by selected version", async () => {
    const v001 = promptVersion({
      id: "prompt_version_001",
      versionLabel: "V001",
      title: "正面构图",
      status: "prompt_ready",
      promptPackage: {
        fullPrompt: "V001 full prompt.",
        negativeConstraints: "V001 negative.",
        shortPrompt: null,
        revisionPrompt: null,
      },
      sceneDirectorPlan: {
        storyEvent: "V001 story event.",
        sceneComposition: "V001 composition.",
        spatialStructure: "V001 spatial structure.",
        characterArrangement: "V001 character arrangement.",
        actionDesign: "V001 action design.",
        styleAndConstraints: "V001 style constraints.",
      },
    });
    const v002 = promptVersion({
      id: "prompt_version_002",
      versionLabel: "V002",
      title: "俯视构图",
      status: "adopted",
      imageAttemptIds: ["attempt_001", "attempt_002"],
      promptPackage: {
        fullPrompt: "V002 full prompt.",
        negativeConstraints: "V002 negative.",
        shortPrompt: "V002 short.",
        revisionPrompt: null,
      },
      sceneDirectorPlan: {
        storyEvent: "V002 story event.",
        sceneComposition: "V002 composition.",
        spatialStructure: "V002 spatial structure.",
        characterArrangement: "V002 character arrangement.",
        actionDesign: "V002 action design.",
        styleAndConstraints: "V002 style constraints.",
      },
    });
    const restoreFetch = installChapterWorkspaceFetchMock({
      state: coursePlannerState({ promptVersions: [v001, v002] }),
    });

    try {
      window.history.pushState({}, "", "/course-planner/chapters/chapter_kitchen");
      render(<App />);

      const main = await screen.findByRole("main");
      const versionList = within(main).getByRole("region", { name: "Prompt Versions" });
      const v001Item = within(versionList).getByRole("group", { name: /V001.*正面构图/s });
      const v002Item = within(versionList).getByRole("group", { name: /V002.*俯视构图/s });
      expect(within(v001Item).getByRole("radio", { name: "Adopt V001" })).not.toBeChecked();
      expect(within(v002Item).getByRole("radio", { name: "Adopt V002" })).toBeChecked();
      expect(within(v001Item).getByRole("button", { name: "View V001 / 正面构图" })).toBeInTheDocument();
      expect(within(v001Item).getByRole("button", { name: "Duplicate V001" })).toBeInTheDocument();
      expect(within(v001Item).getByRole("button", { name: "Revise V001 with AI" })).toBeInTheDocument();
      expect(within(v001Item).getByRole("button", { name: "Delete V001" })).toBeInTheDocument();
      expect(within(v002Item).getByText("Adopted")).toBeInTheDocument();
      expect(within(v002Item).getByText("2 attempts")).toBeInTheDocument();
      expect(within(versionList).queryByText("Current version")).not.toBeInTheDocument();
      expect(within(versionList).queryByText("Version actions")).not.toBeInTheDocument();
      const designPanel = within(main).getByRole("region", { name: "Scene Intent Preview" });
      expect(designPanel).toBeInTheDocument();
      expect(within(designPanel).getByRole("region", { name: "Prompt Version Preview" })).toBeInTheDocument();
      expect(within(designPanel).getByRole("heading", { name: "核心画面" })).toBeInTheDocument();
      expect(within(designPanel).getByRole("heading", { name: "角色 IP" })).toBeInTheDocument();
      expect(within(designPanel).getByRole("heading", { name: "镜头与空间" })).toBeInTheDocument();
      expect(within(designPanel).getByRole("heading", { name: "可选词与约束" })).toBeInTheDocument();
      expect(within(designPanel).getByRole("button", { name: "Tune Prompt" })).toBeInTheDocument();
      expect(within(designPanel).getByRole("button", { name: "Edit Design" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Scene Vocabulary" })).not.toBeInTheDocument();
      expect(within(designPanel).getByText("V002 story event.")).toBeInTheDocument();
      expect(within(designPanel).queryByRole("textbox", { name: "Story Event" })).not.toBeInTheDocument();
      expect(within(main).queryByRole("region", { name: "Chapter Seed Context" })).not.toBeInTheDocument();
      expect(within(designPanel).queryByText("Seed brief")).not.toBeInTheDocument();
      expect(within(designPanel).queryByText("Required Objects")).not.toBeInTheDocument();
      expect(within(designPanel).queryByText("Core Objects")).not.toBeInTheDocument();
      expect(screen.queryByText("None")).not.toBeInTheDocument();
      const promptPreview = within(main).getByRole("region", { name: "Image2 Prompt Preview" });
      expect(within(promptPreview).getByText("Full Prompt Preview")).toBeInTheDocument();
      expect(within(promptPreview).getByText("Negative Constraints Preview")).toBeInTheDocument();
      expect(within(designPanel).getByText("可选词池")).toBeInTheDocument();
      expect(within(designPanel).getByText("叙事锚点")).toBeInTheDocument();
      expect(within(designPanel).getByText("环境补足策略")).toBeInTheDocument();
      expect(within(designPanel).getByText("禁止项")).toBeInTheDocument();

      await userEvent.click(within(designPanel).getByRole("button", { name: "Tune Prompt" }));
      const editorDrawer = await screen.findByRole("complementary", { name: "Edit Prompt Version" });
      expect(within(editorDrawer).getByText("Tune V002 / 俯视构图")).toBeInTheDocument();
      expect((within(editorDrawer).getByRole("textbox", { name: "Character IP Bindings" }) as HTMLTextAreaElement).value)
        .toContain("tuantuan | 团团 | main");
      expect(within(editorDrawer).queryByRole("textbox", { name: "Story Event" })).not.toBeInTheDocument();
      expect(within(editorDrawer).getByRole("heading", { name: "Role IP bindings" })).toBeInTheDocument();
      expect(within(editorDrawer).getByRole("heading", { name: "Reference images" })).toBeInTheDocument();
      expect(within(editorDrawer).getByRole("heading", { name: "Style anchor" })).toBeInTheDocument();
      expect(within(editorDrawer).getByRole("heading", { name: "Prompt constraints" })).toBeInTheDocument();
      expect(within(designPanel).queryByRole("textbox", { name: "Vocabulary Candidates" })).not.toBeInTheDocument();
      await userEvent.click(within(editorDrawer).getByRole("button", { name: "Close editor" }));

      await userEvent.click(within(v001Item).getByRole("button", { name: "View V001 / 正面构图" }));

      expect(await within(main).findByText("V001 story event.")).toBeInTheDocument();
      expect(within(main).queryByRole("textbox", { name: "Scene Composition" })).not.toBeInTheDocument();
      expect(within(main).getByRole("region", { name: "Image2 Prompt Preview" })).toHaveTextContent("V001 full prompt.");
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });

  it("shows a scene-first read-only preview and opens editing only in a drawer", async () => {
    const user = userEvent.setup();
    const untunedVersion = promptVersion({
      id: "prompt_version_002",
      versionLabel: "V002",
      title: "俯视构图",
      status: "adopted",
    });
    const restoreFetch = installChapterWorkspaceFetchMock({
      state: coursePlannerState({
        promptVersions: [untunedVersion],
        selectedPromptVersionId: "prompt_version_002",
      }),
    });

    try {
      window.history.pushState({}, "", "/course-planner/chapters/chapter_kitchen");
      render(<App />);

      const main = await screen.findByRole("main");
      const preview = within(main).getByRole("region", { name: "Scene Intent Preview" });
      expect(within(preview).queryByRole("textbox")).not.toBeInTheDocument();
      expect(within(preview).getByText(/核心画面/)).toBeVisible();
      expect(within(preview).getByText(/角色 IP/)).toBeVisible();
      expect(within(preview).getByText(/镜头与空间/)).toBeVisible();
      expect(within(preview).getByText(/可选词与约束/)).toBeVisible();
      expect(within(preview).getByRole("button", { name: "Tune Prompt" })).toBeVisible();
      expect(within(preview).getByRole("button", { name: "Edit Design" })).toBeVisible();
      expect(screen.queryByText(/Scene Vocabulary/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/^None$/i)).not.toBeInTheDocument();

      await user.click(within(preview).getByRole("button", { name: "Edit Design" }));
      const editor = await screen.findByRole("complementary", { name: /Edit Prompt Version/i });
      expect(editor).toBeVisible();
      expect(within(editor).getByRole("textbox", { name: "Story Event" })).toBeVisible();
      expect(within(editor).getByRole("textbox", { name: "Vocabulary Candidates" })).toBeVisible();
      expect(within(editor).queryByRole("textbox", { name: "Character IP Bindings" })).not.toBeInTheDocument();
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });

  it("adopts a Prompt Version through the chapter hierarchy API", async () => {
    const user = userEvent.setup();
    const adoptCalls: string[] = [];
    const v001 = promptVersion({ id: "prompt_version_001", versionLabel: "V001", title: "正面构图", status: "prompt_ready" });
    const v002 = promptVersion({ id: "prompt_version_002", versionLabel: "V002", title: "俯视构图", status: "adopted" });
    const restoreFetch = installChapterWorkspaceFetchMock({
      state: coursePlannerState({ promptVersions: [v001, v002], selectedPromptVersionId: "prompt_version_001" }),
      adoptPromptVersion: (input) => {
        adoptCalls.push(String(input));
        return jsonResponse({
          chapter: { ...coursePlannerState().chaptersByScenePackId.scene_pack_home[0], adoptedPromptVersionId: "prompt_version_001" },
          promptVersions: [
            { ...v001, status: "adopted" },
            { ...v002, status: "prompt_ready" },
          ],
        });
      },
    });

    try {
      window.history.pushState({}, "", "/course-planner/chapters/chapter_kitchen");
      render(<App />);

      const main = await screen.findByRole("main");
      const versionList = within(main).getByRole("region", { name: "Prompt Versions" });
      const v001Item = within(versionList).getByRole("group", { name: /V001.*正面构图/s });
      const v002Item = within(versionList).getByRole("group", { name: /V002.*俯视构图/s });
      expect(within(v001Item).getByRole("radio", { name: "Adopt V001" })).not.toBeChecked();
      expect(within(v002Item).getByRole("radio", { name: "Adopt V002" })).toBeChecked();
      await user.click(within(v001Item).getByRole("radio", { name: "Adopt V001" }));

      await waitFor(() => {
        expect(adoptCalls).toEqual([
          "/api/course-planner/chapters/chapter_kitchen/prompt-versions/prompt_version_001/adopt",
        ]);
      });
      await waitFor(() => {
        const refreshedV001Item = within(versionList).getByRole("group", { name: /V001.*正面构图/s });
        const refreshedV002Item = within(versionList).getByRole("group", { name: /V002.*俯视构图/s });
        expect(within(refreshedV001Item).getByRole("radio", { name: "Adopt V001" })).toBeChecked();
        expect(within(refreshedV002Item).getByRole("radio", { name: "Adopt V002" })).not.toBeChecked();
      });
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });

  it("keeps adopted radio as a single-choice state during optimistic adoption", async () => {
    const user = userEvent.setup();
    const adoptCalls: string[] = [];
    const v001 = promptVersion({ id: "prompt_version_001", versionLabel: "V001", title: "正面构图", status: "prompt_ready" });
    const v002 = promptVersion({ id: "prompt_version_002", versionLabel: "V002", title: "俯视构图", status: "adopted" });
    let resolveAdoption: ((value: Response) => void) | null = null;
    const adoptResponse = new Promise<Response>((resolve) => {
      resolveAdoption = resolve;
    });
    const restoreFetch = installChapterWorkspaceFetchMock({
      state: coursePlannerState({ promptVersions: [v001, v002], selectedPromptVersionId: "prompt_version_001" }),
      adoptPromptVersion: (input) => {
        adoptCalls.push(String(input));
        return adoptResponse;
      },
    });

    try {
      window.history.pushState({}, "", "/course-planner/chapters/chapter_kitchen");
      render(<App />);

      const main = await screen.findByRole("main");
      const versionList = within(main).getByRole("region", { name: "Prompt Versions" });
      const v001Item = within(versionList).getByRole("group", { name: /V001.*正面构图/s });
      const v002Item = within(versionList).getByRole("group", { name: /V002.*俯视构图/s });

      await user.click(within(v001Item).getByRole("radio", { name: "Adopt V001" }));

      await waitFor(() => {
        expect(adoptCalls).toEqual([
          "/api/course-planner/chapters/chapter_kitchen/prompt-versions/prompt_version_001/adopt",
        ]);
      });
      await waitFor(() => {
        expect(within(v001Item).getByRole("radio", { name: "Adopt V001" })).toBeChecked();
        expect(within(v002Item).getByRole("radio", { name: "Adopt V002" })).not.toBeChecked();
      });
      expect(within(versionList).getAllByText("Adopted")).toHaveLength(1);

      resolveAdoption?.(
        jsonResponse({
          chapter: { ...coursePlannerState().chaptersByScenePackId.scene_pack_home[0], adoptedPromptVersionId: "prompt_version_001" },
          promptVersions: [
            { ...v001, status: "adopted" },
            { ...v002, status: "prompt_ready" },
          ],
        }),
      );

      await waitFor(() => {
        expect(within(v001Item).getByRole("radio", { name: "Adopt V001" })).toBeChecked();
        expect(within(v002Item).getByRole("radio", { name: "Adopt V002" })).not.toBeChecked();
      });
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });

  it("keeps selected-version readiness labels aligned during optimistic adoption of another version", async () => {
    const user = userEvent.setup();
    const adoptCalls: string[] = [];
    const v001 = promptVersion({
      id: "prompt_version_001",
      versionLabel: "V001",
      title: "正面构图",
      status: "adopted",
      promptPackage: {
        fullPrompt: "V001 full prompt.",
        negativeConstraints: "V001 negative.",
        shortPrompt: null,
        revisionPrompt: null,
      },
    });
    const v002 = promptVersion({
      id: "prompt_version_002",
      versionLabel: "V002",
      title: "俯视构图",
      status: "prompt_ready",
      promptPackage: {
        fullPrompt: "V002 full prompt.",
        negativeConstraints: "V002 negative.",
        shortPrompt: null,
        revisionPrompt: null,
      },
    });
    let resolveAdoption: ((value: Response) => void) | null = null;
    const adoptResponse = new Promise<Response>((resolve) => {
      resolveAdoption = resolve;
    });
    const restoreFetch = installChapterWorkspaceFetchMock({
      state: coursePlannerState({
        promptVersions: [v001, v002],
        selectedPromptVersionId: "prompt_version_001",
      }),
      adoptPromptVersion: (input) => {
        adoptCalls.push(String(input));
        return adoptResponse;
      },
    });

    try {
      window.history.pushState({}, "", "/course-planner/chapters/chapter_kitchen");
      render(<App />);

      const main = await screen.findByRole("main");
      const versionList = within(main).getByRole("region", { name: "Prompt Versions" });
      const v001Item = within(versionList).getByRole("group", { name: /V001.*正面构图/s });
      const v002Item = within(versionList).getByRole("group", { name: /V002.*俯视构图/s });

      await user.click(within(v002Item).getByRole("radio", { name: "Adopt V002" }));

      await waitFor(() => {
        expect(adoptCalls).toEqual([
          "/api/course-planner/chapters/chapter_kitchen/prompt-versions/prompt_version_002/adopt",
        ]);
      });
      await waitFor(() => {
        expect(within(v001Item).getByRole("radio", { name: "Adopt V001" })).not.toBeChecked();
        expect(within(v002Item).getByRole("radio", { name: "Adopt V002" })).toBeChecked();
      });

      expect(within(v001Item).getByRole("button", { name: "View V001 / 正面构图" })).toHaveAttribute("aria-pressed", "true");
      expect(within(v001Item).getByText("Prompt ready")).toBeInTheDocument();
      expect(within(main).getByRole("heading", { name: "厨房早餐打翻" })).toBeInTheDocument();
      expect(within(main).getAllByText("Prompt ready")).toHaveLength(4);
      expect(within(main).queryByText("Adopted")).toBeInTheDocument();
      expect(within(main).getByRole("region", { name: "Scene Intent Preview" })).toHaveTextContent("Prompt ready");
      expect(within(main).getByRole("region", { name: "Image2 Prompt Preview" })).toHaveTextContent("Prompt ready");

      resolveAdoption?.(
        jsonResponse({
          chapter: { ...coursePlannerState().chaptersByScenePackId.scene_pack_home[0], adoptedPromptVersionId: "prompt_version_002" },
          promptVersions: [
            { ...v001, status: "prompt_ready" },
            { ...v002, status: "adopted" },
          ],
        }),
      );

      await waitFor(() => {
        expect(within(v001Item).getByRole("radio", { name: "Adopt V001" })).not.toBeChecked();
        expect(within(v002Item).getByRole("radio", { name: "Adopt V002" })).toBeChecked();
      });
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });

  it("gates legacy internal-schema Prompt Packages without blocking modal inspection", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const legacyVersion = promptVersion({
      promptPackage: {
        fullPrompt: "Scene Director Plan:\n- Story event: old internal package\nObject Plan:\n- [core] cup",
        negativeConstraints: "old negative constraints",
        shortPrompt: null,
        revisionPrompt: null,
      },
    });
    const restoreFetch = installChapterWorkspaceFetchMock({
      state: coursePlannerState({ promptVersions: [legacyVersion] }),
    });

    try {
      window.history.pushState({}, "", "/course-planner/chapters/chapter_kitchen");
      render(<App />);

      const main = await screen.findByRole("main");
      const promptPreview = within(main).getByRole("region", { name: "Image2 Prompt Preview" });
      expect(within(promptPreview).getByText("旧版 Prompt Package 使用内部 schema 标签，请重新生成。")).toBeInTheDocument();
      expect(within(promptPreview).queryByText(/Scene Director Plan:/)).not.toBeInTheDocument();
      expect(within(main).getByRole("button", { name: "复制完整 Prompt" })).toBeDisabled();
      expect(within(main).getByRole("button", { name: "复制负面约束" })).toBeDisabled();
      expect(within(main).getByRole("button", { name: "查看 Prompt Package" })).toBeEnabled();
      expect(within(main).getByRole("button", { name: "生成/刷新 Prompt" })).toBeEnabled();
      expect(within(main).getByLabelText("选择生成图文件")).toBeDisabled();

      await userEvent.click(within(main).getByRole("button", { name: "查看 Prompt Package" }));
      const dialog = await screen.findByRole("dialog", { name: "Prompt Package" });
      expect(within(dialog).getByText(/Scene Director Plan:/)).toBeInTheDocument();
      expect(within(dialog).getByText("old negative constraints")).toBeInTheDocument();
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });

  it("blocks final prompt generation until character IP bindings are recorded", async () => {
    const user = userEvent.setup();
    const generateCalls: string[] = [];
    const untunedVersion = promptVersion({
      castBindings: [],
      promptPackage: {
        fullPrompt: "Tune Prompt required before final Image2 prompt.",
        negativeConstraints: "",
        shortPrompt: null,
        revisionPrompt: null,
      },
    });
    const state = coursePlannerState({ promptVersions: [untunedVersion] });
    if (state.chaptersByScenePackId.scene_pack_home?.[0]) {
      state.chaptersByScenePackId.scene_pack_home[0].summary = "孩子和家长一起整理厨房。";
    }
    const restoreFetch = installChapterWorkspaceFetchMock({
      state,
      generatePromptPackage: (input) => {
        generateCalls.push(String(input));
        return jsonResponse({ promptVersion: untunedVersion });
      },
    });

    try {
      window.history.pushState({}, "", "/course-planner/chapters/chapter_kitchen");
      render(<App />);

      const main = await screen.findByRole("main");
      expect(within(main).getAllByText("Needs tuning")).toHaveLength(4);
      const versionList = within(main).getByRole("region", { name: "Prompt Versions" });
      expect(within(versionList).getByText("Needs tuning")).toBeInTheDocument();
      const designPanel = within(main).getByRole("region", { name: "Scene Intent Preview" });
      expect(within(designPanel).getByText("待 Tune Prompt 录入角色 IP 与参考图。")).toBeVisible();
      expect(screen.getByRole("status", { name: /Prompt tuning required/i })).toBeVisible();
      expect(within(designPanel).getByRole("status", { name: "Prompt tuning required" })).toHaveTextContent(
        "先录入角色 IP 和参考图，再生成最终 Image2 prompt。",
      );
      expect(screen.queryByText(/小学生|孩子|家长|student|child|parent/i)).not.toBeInTheDocument();
      const promptPreview = within(main).getByRole("region", { name: "Image2 Prompt Preview" });
      expect(within(promptPreview).getByText("Needs tuning")).toBeInTheDocument();
      expect(within(promptPreview).getByText("先录入角色 IP 和参考图，再生成最终 Image2 prompt。")).toBeInTheDocument();
      const tunePromptButton = within(promptPreview).getByRole("button", { name: "Tune Prompt" });
      expect(tunePromptButton).toBeEnabled();
      expect(within(promptPreview).queryByText("Full Prompt Preview")).not.toBeInTheDocument();
      expect(within(promptPreview).queryByRole("button", { name: /Generate|生成\/刷新 Prompt/i })).not.toBeInTheDocument();
      expect(within(promptPreview).queryByRole("button", { name: /Copy full prompt|复制完整 Prompt/i })).not.toBeInTheDocument();
      expect(within(promptPreview).queryByLabelText("选择生成图文件")).not.toBeInTheDocument();
      await user.click(tunePromptButton);
      expect(await screen.findByRole("complementary", { name: "Edit Prompt Version" })).toHaveTextContent("Tune");
      expect(generateCalls).toEqual([]);
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });

  it("keeps readiness labels aligned across header, list, preview, and prompt panel", async () => {
    const readyVersion = promptVersion({
      id: "prompt_version_002",
      versionLabel: "V002",
      title: "俯视构图",
      status: "prompt_ready",
      promptPackage: {
        fullPrompt: "Ready full prompt.",
        negativeConstraints: "Ready negative constraints.",
        shortPrompt: null,
        revisionPrompt: null,
      },
    });
    const restoreFetch = installChapterWorkspaceFetchMock({
      state: coursePlannerState({
        promptVersions: [readyVersion],
        selectedPromptVersionId: "prompt_version_002",
      }),
    });

    try {
      window.history.pushState({}, "", "/course-planner/chapters/chapter_kitchen");
      render(<App />);

      const main = await screen.findByRole("main");
      expect(within(main).getAllByText("Prompt ready")).toHaveLength(4);
      expect(within(main).getByRole("heading", { name: "厨房早餐打翻" })).toBeInTheDocument();
      expect(within(main).getByRole("region", { name: "Prompt Versions" })).toHaveTextContent("Prompt ready");
      expect(within(main).getByRole("region", { name: "Scene Intent Preview" })).toHaveTextContent("Prompt ready");
      expect(within(main).getByRole("region", { name: "Image2 Prompt Preview" })).toHaveTextContent("Prompt ready");
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });

  it("copies and uploads against the currently selected Prompt Version", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const openPage = vi.spyOn(window, "open").mockImplementation(() => null);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const uploadCalls: Array<{ input: string; fileName: string | undefined }> = [];
    const v001 = promptVersion({ id: "prompt_version_001", versionLabel: "V001", title: "正面构图" });
    const v002 = promptVersion({
      id: "prompt_version_002",
      versionLabel: "V002",
      title: "俯视构图",
      promptPackage: {
        fullPrompt: `${"Selected full prompt. ".repeat(24)}FULL_PACKAGE_ONLY_MARKER`,
        negativeConstraints: "Selected negative constraints.",
        shortPrompt: "Selected short prompt.",
        revisionPrompt: "Selected revision prompt.",
      },
    });
    const restoreFetch = installChapterWorkspaceFetchMock({
      state: coursePlannerState({
        promptVersions: [v001, v002],
        selectedPromptVersionId: "prompt_version_002",
      }),
      uploadImageAttempt: async (input, init) => {
        const body = init?.body as FormData;
        const file = body.get("file") as File | null;
        uploadCalls.push({ input: String(input), fileName: file?.name });
        return jsonResponse({
          imageAttempt: imageAttempt({
            id: "attempt_uploaded",
            promptVersionId: "prompt_version_002",
            uploadedImageId: "uploads/course_planner/prompt_version_002/kitchen-v002.png",
          }),
        });
      },
    });

    try {
      window.history.pushState({}, "", "/course-planner/chapters/chapter_kitchen");
      render(<App />);

      const main = await screen.findByRole("main");
      await user.click(within(main).getByRole("button", { name: "复制完整 Prompt" }));
      await user.click(within(main).getByRole("button", { name: "复制负面约束" }));
      expect(writeText).toHaveBeenNthCalledWith(1, `${"Selected full prompt. ".repeat(24)}FULL_PACKAGE_ONLY_MARKER`);
      expect(writeText).toHaveBeenNthCalledWith(2, "Selected negative constraints.");
      expect(within(main).getByText(new RegExp(`FULL_PACKAGE_ONLY_MARKER$`))).toBeInTheDocument();

      await user.click(within(main).getByRole("button", { name: "查看 Prompt Package" }));
      const dialog = await screen.findByRole("dialog", { name: "Prompt Package" });
      expect(within(dialog).getByText(/FULL_PACKAGE_ONLY_MARKER/)).toBeInTheDocument();
      expect(within(dialog).getByText("Selected negative constraints.")).toBeInTheDocument();
      expect(within(dialog).getByText("Selected revision prompt.")).toBeInTheDocument();
      await user.click(within(dialog).getByRole("button", { name: "Close Prompt Package" }));

      const imageFile = new File(["fake"], "kitchen-v002.png", { type: "image/png" });
      fireEvent.change(within(main).getByLabelText("选择生成图文件"), { target: { files: [imageFile] } });

      await waitFor(() => {
        expect(uploadCalls).toEqual([
          {
            input: "/api/course-planner/prompt-versions/prompt_version_002/image-attempts/upload",
            fileName: "kitchen-v002.png",
          },
        ]);
      });
      expect(openPage).toHaveBeenCalledWith(
        "/course-planner/chapters/chapter_kitchen/versions/prompt_version_002/attempts/attempt_uploaded",
        "_self",
      );
    } finally {
      openPage.mockRestore();
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });

  it("keeps Duplicate, AI revise, and Delete scoped to the clicked Prompt Version item", async () => {
    const user = userEvent.setup();
    const duplicateCalls: string[] = [];
    const reviseCalls: Array<{ input: string; method?: string; body: unknown }> = [];
    const deleteCalls: string[] = [];
    const v001 = promptVersion({ id: "prompt_version_001", versionLabel: "V001", title: "正面构图", status: "adopted" });
    const v002 = promptVersion({ id: "prompt_version_002", versionLabel: "V002", title: "俯视构图", status: "prompt_ready" });
    const restoreFetch = installChapterWorkspaceFetchMock({
      state: coursePlannerState({
        promptVersions: [v001, v002],
        selectedPromptVersionId: "prompt_version_001",
      }),
      duplicatePromptVersion: (input) => {
        duplicateCalls.push(String(input));
        return jsonResponse({
          promptVersion: promptVersion({
            id: "prompt_version_003",
            versionLabel: "V003",
            sourceVersionId: "prompt_version_002",
          }),
        });
      },
      createPromptVersion: (input, init) => {
        reviseCalls.push({
          input: String(input),
          method: init?.method,
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        return jsonResponse({
          promptVersion: promptVersion({ id: "prompt_version_004", versionLabel: "V004", sourceVersionId: "prompt_version_002" }),
        });
      },
      deletePromptVersion: (input) => {
        deleteCalls.push(String(input));
        return jsonResponse({ promptVersion: { ...v002, status: "archived" } });
      },
    });

    try {
      window.history.pushState({}, "", "/course-planner/chapters/chapter_kitchen");
      render(<App />);

      const main = await screen.findByRole("main");
      const versionList = within(main).getByRole("region", { name: "Prompt Versions" });
      const v002Item = within(versionList).getByRole("group", { name: /V002.*俯视构图/s });

      await user.click(within(v002Item).getByRole("button", { name: "Duplicate V002" }));
      await waitFor(() => {
        expect(duplicateCalls).toEqual(["/api/course-planner/prompt-versions/prompt_version_002/duplicate"]);
      });

      await user.click(within(v002Item).getByRole("button", { name: /Revise V002|AI 修改/ }));
      const reviseDrawer = await screen.findByRole("complementary", { name: "Edit Prompt Version" });
      expect(within(reviseDrawer).getByText("Revise V002 / 俯视构图")).toBeInTheDocument();
      await user.type(within(reviseDrawer).getByRole("textbox", { name: "Revision Feedback" }), "强调手部动作");
      await user.click(within(reviseDrawer).getByRole("button", { name: "Submit AI revise" }));

      await waitFor(() => {
        expect(reviseCalls).toHaveLength(1);
        expect(reviseCalls[0].input).toBe("/api/course-planner/chapters/chapter_kitchen/prompt-versions");
        expect(reviseCalls[0].method).toBe("POST");
        expect(reviseCalls[0].body).toEqual(
          expect.objectContaining({
            sourceVersionId: "prompt_version_002",
            feedback: "强调手部动作",
          }),
        );
      });

      await user.click(within(v002Item).getByRole("button", { name: "Delete V002" }));

      await waitFor(() => {
        expect(deleteCalls).toEqual(["/api/course-planner/prompt-versions/prompt_version_002"]);
      });
      await waitFor(() => {
        expect(within(versionList).queryByRole("group", { name: /V002.*俯视构图/s })).not.toBeInTheDocument();
      });
      expect(within(versionList).getByRole("group", { name: /V001.*正面构图/s })).toBeInTheDocument();
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });

  it("falls back to an available version after deleting the selected Prompt Version", async () => {
    const user = userEvent.setup();
    const v001 = promptVersion({
      id: "prompt_version_001",
      versionLabel: "V001",
      title: "正面构图",
      status: "adopted",
      promptPackage: {
        fullPrompt: "V001 full prompt.",
        negativeConstraints: "V001 negative.",
        shortPrompt: null,
        revisionPrompt: null,
      },
    });
    const v002 = promptVersion({
      id: "prompt_version_002",
      versionLabel: "V002",
      title: "俯视构图",
      status: "prompt_ready",
      promptPackage: {
        fullPrompt: "V002 full prompt.",
        negativeConstraints: "V002 negative.",
        shortPrompt: null,
        revisionPrompt: null,
      },
    });
    const restoreFetch = installChapterWorkspaceFetchMock({
      state: coursePlannerState({
        promptVersions: [v001, v002],
        selectedPromptVersionId: "prompt_version_002",
      }),
      deletePromptVersion: () => jsonResponse({ promptVersion: { ...v002, status: "archived" } }),
    });

    try {
      window.history.pushState({}, "", "/course-planner/chapters/chapter_kitchen");
      render(<App />);

      const main = await screen.findByRole("main");
      const versionList = within(main).getByRole("region", { name: "Prompt Versions" });
      const v002Item = within(versionList).getByRole("group", { name: /V002.*俯视构图/s });
      await user.click(within(v002Item).getByRole("button", { name: "Delete V002" }));

      await waitFor(() => {
        expect(within(versionList).queryByRole("group", { name: /V002.*俯视构图/s })).not.toBeInTheDocument();
      });
      expect(within(main).getByRole("region", { name: "Scene Intent Preview" })).toHaveTextContent("V001");
      expect(within(main).getByRole("region", { name: "Image2 Prompt Preview" })).toHaveTextContent("V001");
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });

  it("confirms before deleting the adopted Prompt Version and falls back to the nearest remaining version", async () => {
    const user = userEvent.setup();
    const deleteCalls: string[] = [];
    const v001 = promptVersion({
      id: "prompt_version_001",
      versionLabel: "V001",
      title: "正面构图",
      status: "adopted",
      promptPackage: {
        fullPrompt: "V001 full prompt.",
        negativeConstraints: "V001 negative.",
        shortPrompt: null,
        revisionPrompt: null,
      },
    });
    const v002 = promptVersion({
      id: "prompt_version_002",
      versionLabel: "V002",
      title: "俯视构图",
      status: "prompt_ready",
      promptPackage: {
        fullPrompt: "V002 full prompt.",
        negativeConstraints: "V002 negative.",
        shortPrompt: null,
        revisionPrompt: null,
      },
    });
    const restoreFetch = installChapterWorkspaceFetchMock({
      state: coursePlannerState({
        promptVersions: [v001, v002],
        selectedPromptVersionId: "prompt_version_001",
      }),
      deletePromptVersion: (input) => {
        deleteCalls.push(String(input));
        return jsonResponse({ promptVersion: { ...v001, status: "archived" } });
      },
    });

    try {
      window.history.pushState({}, "", "/course-planner/chapters/chapter_kitchen");
      render(<App />);

      const main = await screen.findByRole("main");
      const versionList = within(main).getByRole("region", { name: "Prompt Versions" });
      const v001Item = within(versionList).getByRole("group", { name: /V001.*正面构图/s });
      await user.click(within(v001Item).getByRole("button", { name: "Delete V001" }));

      const dialog = await screen.findByRole("alertdialog", { name: "Delete adopted Prompt Version" });
      expect(within(dialog).getByText("Deleting this version leaves the Chapter without an adopted Prompt Version.")).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
      await user.click(within(dialog).getByRole("button", { name: "Delete version" }));

      await waitFor(() => {
        expect(deleteCalls).toEqual(["/api/course-planner/prompt-versions/prompt_version_001"]);
      });
      await waitFor(() => {
        expect(within(versionList).queryByRole("group", { name: /V001.*正面构图/s })).not.toBeInTheDocument();
      });
      expect(within(main).getByRole("region", { name: "Scene Intent Preview" })).toHaveTextContent("V002");
      expect(within(main).getByRole("region", { name: "Image2 Prompt Preview" })).toHaveTextContent("V002");
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });

  it("persists scene-first design edits before generating the Prompt Package", async () => {
    const user = userEvent.setup();
    const calls: Array<{ input: string; method: string | undefined; body: unknown }> = [];
    const v002 = promptVersion({ id: "prompt_version_002", versionLabel: "V002", title: "俯视构图", status: "adopted" });
    const restoreFetch = installChapterWorkspaceFetchMock({
      state: coursePlannerState({ promptVersions: [v002] }),
      updatePromptVersion: (input, init) => {
        calls.push({ input: String(input), method: init?.method, body: JSON.parse(String(init?.body)) });
        return jsonResponse({
          promptVersion: promptVersion({
            ...v002,
            sceneDirectorPlan: {
              ...v002.sceneDirectorPlan,
              storyEvent: "Edited spill event with Abu handing over a towel.",
            },
            sceneVocabulary: {
              ...v002.sceneVocabulary,
              optionalVocabularyCandidates: ["cup", "table", "window"],
            },
          }),
        });
      },
      generatePromptPackage: (input, init) => {
        calls.push({ input: String(input), method: init?.method, body: null });
        return jsonResponse({ promptVersion: v002 });
      },
    });

    try {
      window.history.pushState({}, "", "/course-planner/chapters/chapter_kitchen");
      render(<App />);

      const main = await screen.findByRole("main");
      const designPanel = within(main).getByRole("region", { name: "Scene Intent Preview" });
      await user.click(within(designPanel).getByRole("button", { name: "Edit Design" }));
      const editorDrawer = await screen.findByRole("complementary", { name: "Edit Prompt Version" });
      expect(within(editorDrawer).getByText("Edit V002 / 俯视构图")).toBeInTheDocument();
      const storyEvent = within(editorDrawer).getByRole("textbox", { name: "Story Event" });
      await user.clear(storyEvent);
      await user.type(storyEvent, "Edited spill event with Abu handing over a towel.");
      expect(storyEvent).toHaveValue("Edited spill event with Abu handing over a towel.");

      const vocabularyCandidates = within(editorDrawer).getByRole("textbox", { name: "Vocabulary Candidates" });
      await user.clear(vocabularyCandidates);
      await user.type(vocabularyCandidates, "cup\ntable\nwindow");
      expect(vocabularyCandidates).toHaveValue("cup\ntable\nwindow");
      expect(within(editorDrawer).queryByRole("textbox", { name: "Character IP Bindings" })).not.toBeInTheDocument();
      expect(within(editorDrawer).getByText("Unsaved edits")).toBeInTheDocument();
      expect(within(designPanel).queryByRole("textbox", { name: "Story Event" })).not.toBeInTheDocument();

      await user.click(within(main).getByRole("button", { name: "生成/刷新 Prompt" }));

      await waitFor(() => {
        expect(calls).toEqual([
          {
            input: "/api/course-planner/prompt-versions/prompt_version_002",
            method: "PATCH",
            body: {
              scene_director_plan: {
                ...toSnakeSceneDirectorPlan(v002.sceneDirectorPlan),
                story_event: "Edited spill event with Abu handing over a towel.",
              },
              cast_bindings: toSnakeCastBindings(v002.castBindings),
              scene_vocabulary: {
                ...toSnakeSceneVocabulary(v002.sceneVocabulary),
                optional_vocabulary_candidates: ["cup", "table", "window"],
              },
              prompt_tuning: toSnakePromptTuning(v002.promptTuning),
            },
          },
          {
            input: "/api/course-planner/prompt-versions/prompt_version_002/prompt-package",
            method: "POST",
            body: null,
          },
        ]);
      });
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });

  it("confirms before closing the edit drawer with unsaved Prompt Version changes", async () => {
    const user = userEvent.setup();
    const v002 = promptVersion({ id: "prompt_version_002", versionLabel: "V002", title: "俯视构图", status: "adopted" });
    const restoreFetch = installChapterWorkspaceFetchMock({
      state: coursePlannerState({ promptVersions: [v002] }),
    });

    try {
      window.history.pushState({}, "", "/course-planner/chapters/chapter_kitchen");
      render(<App />);

      const main = await screen.findByRole("main");
      const designPanel = within(main).getByRole("region", { name: "Scene Intent Preview" });
      await user.click(within(designPanel).getByRole("button", { name: "Edit Design" }));
      const editorDrawer = await screen.findByRole("complementary", { name: "Edit Prompt Version" });
      expect(within(editorDrawer).getByText("Edit V002 / 俯视构图")).toBeInTheDocument();
      const storyEvent = within(editorDrawer).getByRole("textbox", { name: "Story Event" });
      await user.clear(storyEvent);
      await user.type(storyEvent, "Unsaved story event.");

      await user.click(within(editorDrawer).getByRole("button", { name: "Close editor" }));
      const dialog = await screen.findByRole("alertdialog", { name: "Discard unsaved changes?" });
      expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Discard changes" })).toBeInTheDocument();
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(screen.getByRole("complementary", { name: "Edit Prompt Version" })).toBeInTheDocument();

      await user.click(within(editorDrawer).getByRole("button", { name: "Close editor" }));
      const discardDialog = await screen.findByRole("alertdialog", { name: "Discard unsaved changes?" });
      await user.click(within(discardDialog).getByRole("button", { name: "Discard changes" }));
      expect(screen.queryByRole("complementary", { name: "Edit Prompt Version" })).not.toBeInTheDocument();
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });

  it("routes footer Cancel through the same unsaved-change confirmation path", async () => {
    const user = userEvent.setup();
    const v001 = promptVersion({ id: "prompt_version_001", versionLabel: "V001", title: "正面构图", status: "adopted" });
    const restoreFetch = installChapterWorkspaceFetchMock({
      state: coursePlannerState({ promptVersions: [v001] }),
    });

    try {
      window.history.pushState({}, "", "/course-planner/chapters/chapter_kitchen");
      render(<App />);

      const main = await screen.findByRole("main");
      const preview = within(main).getByRole("region", { name: "Scene Intent Preview" });
      await user.click(within(preview).getByRole("button", { name: "Edit Design" }));

      const designDrawer = await screen.findByRole("complementary", { name: "Edit Prompt Version" });
      await user.clear(within(designDrawer).getByRole("textbox", { name: "Story Event" }));
      await user.type(within(designDrawer).getByRole("textbox", { name: "Story Event" }), "Unsaved design edit.");

      await user.click(within(designDrawer).getByRole("button", { name: "Cancel" }));
      const designDialog = await screen.findByRole("alertdialog", { name: "Discard unsaved changes?" });
      await user.click(within(designDialog).getByRole("button", { name: "Cancel" }));
      expect(screen.getByRole("complementary", { name: "Edit Prompt Version" })).toBeInTheDocument();

      await user.click(within(designDrawer).getByRole("button", { name: "Cancel" }));
      const discardDesignDialog = await screen.findByRole("alertdialog", { name: "Discard unsaved changes?" });
      await user.click(within(discardDesignDialog).getByRole("button", { name: "Discard changes" }));
      expect(screen.queryByRole("complementary", { name: "Edit Prompt Version" })).not.toBeInTheDocument();

      const versionList = within(main).getByRole("region", { name: "Prompt Versions" });
      const v001Item = within(versionList).getByRole("group", { name: /V001.*正面构图/s });
      await user.click(within(v001Item).getByRole("button", { name: "Revise V001 with AI" }));

      const reviseDrawer = await screen.findByRole("complementary", { name: "Edit Prompt Version" });
      const feedback = within(reviseDrawer).getByRole("textbox", { name: "Revision Feedback" });
      await user.type(feedback, "Unsaved revise feedback.");

      await user.click(within(reviseDrawer).getByRole("button", { name: "Cancel" }));
      const reviseDialog = await screen.findByRole("alertdialog", { name: "Discard unsaved changes?" });
      await user.click(within(reviseDialog).getByRole("button", { name: "Cancel" }));
      expect(screen.getByRole("complementary", { name: "Edit Prompt Version" })).toBeInTheDocument();
      expect(within(screen.getByRole("complementary", { name: "Edit Prompt Version" })).getByRole("textbox", { name: "Revision Feedback" }))
        .toHaveValue("Unsaved revise feedback.");

      await user.click(within(screen.getByRole("complementary", { name: "Edit Prompt Version" })).getByRole("button", { name: "Cancel" }));
      const discardReviseDialog = await screen.findByRole("alertdialog", { name: "Discard unsaved changes?" });
      await user.click(within(discardReviseDialog).getByRole("button", { name: "Discard changes" }));
      expect(screen.queryByRole("complementary", { name: "Edit Prompt Version" })).not.toBeInTheDocument();
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });

  it("submits user-entered feedback when revising the current Prompt Version", async () => {
    const user = userEvent.setup();
    const createCalls: Array<{ input: string; body: unknown }> = [];
    const v001 = promptVersion({ id: "prompt_version_001", versionLabel: "V001", title: "正面构图" });
    const restoreFetch = installChapterWorkspaceFetchMock({
      state: coursePlannerState({ promptVersions: [v001] }),
      createPromptVersion: (input, init) => {
        createCalls.push({ input: String(input), body: JSON.parse(String(init?.body)) });
        return jsonResponse({
          promptVersion: promptVersion({
            id: "prompt_version_002",
            versionLabel: "V002",
            sourceVersionId: "prompt_version_001",
          }),
        });
      },
    });

    try {
      window.history.pushState({}, "", "/course-planner/chapters/chapter_kitchen");
      render(<App />);

      const main = await screen.findByRole("main");
      const versionList = within(main).getByRole("region", { name: "Prompt Versions" });
      const v001Item = within(versionList).getByRole("group", { name: /V001.*正面构图/s });
      await user.click(within(v001Item).getByRole("button", { name: "Revise V001 with AI" }));
      const feedbackPanel = await screen.findByRole("complementary", { name: "Edit Prompt Version" });
      expect(within(feedbackPanel).getByText("Revise V001 / 正面构图")).toBeInTheDocument();
      const feedback = within(feedbackPanel).getByRole("textbox", { name: "Revision Feedback" });
      await user.type(feedback, "Make the action clearer and move the sharp object out of frame.");
      await user.click(within(feedbackPanel).getByRole("button", { name: "Submit AI revise" }));

      await waitFor(() => {
        expect(createCalls).toEqual([
          {
            input: "/api/course-planner/chapters/chapter_kitchen/prompt-versions",
            body: {
              feedback: "Make the action clearer and move the sharp object out of frame.",
              sourceVersionId: "prompt_version_001",
            },
          },
        ]);
      });
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });
});
  it("does not project backend legacy objectPlan entries into the main preview vocabulary when sceneVocabulary is missing", async () => {
    const legacyOnlyVersion = promptVersion({
      objectPlan: {
        coreObjects: [{ name: "legacy kettle", roleInScene: "old anchor", placementHint: "counter", priority: "core" }],
        requiredObjects: [{ name: "legacy towel", roleInScene: "old prop", placementHint: "hand", priority: "required" }],
        recommendedObjects: [{ name: "legacy stool", roleInScene: "old extra", placementHint: "corner", priority: "recommended" }],
        avoidOrMoveObjects: [{ name: "legacy knife", roleInScene: "old avoid", priority: "avoid" }],
      },
    });
    const baseState = coursePlannerState({ promptVersions: [] });
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/runs" && (!init || init.method === "GET")) {
        return jsonResponse({ runs: [] });
      }
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse({ source: null, elements: [], detectionVocabulary: [] });
      }
      if (input === "/api/course-planner/state" && (!init || init.method === "GET")) {
        return jsonResponse({
          scene_packs: baseState.scenePacks.map((scenePack) => ({
            id: scenePack.id,
            title: scenePack.title,
            intent: scenePack.intent,
            notes: scenePack.notes,
            status: scenePack.status,
            chapter_ids: scenePack.chapterIds,
            chapter_list_locked: scenePack.chapterListLocked,
          })),
          active_scene_pack_id: baseState.activeScenePackId,
          candidates_by_scene_pack_id: {},
          chapters_by_scene_pack_id: {
            scene_pack_home: baseState.chaptersByScenePackId.scene_pack_home.map((chapter) => ({
              id: chapter.id,
              scene_pack_id: chapter.scenePackId,
              title: chapter.title,
              summary: chapter.summary,
              seed: {
                scene_pack_id: chapter.seed.scenePackId,
                scene_pack_title: chapter.seed.scenePackTitle,
                chapter_id: chapter.seed.chapterId,
                chapter_title: chapter.seed.chapterTitle,
                chapter_intent: chapter.seed.chapterIntent,
                scene_domain: chapter.seed.sceneDomain,
                daily_moment: chapter.seed.dailyMoment,
                event_seed: chapter.seed.eventSeed,
                spatial_seed: chapter.seed.spatialSeed,
                object_coverage_hint: chapter.seed.objectCoverageHint,
                character_concept_hint: {
                  cast_mode: chapter.seed.characterConceptHint.castMode,
                  main_cast_hint: chapter.seed.characterConceptHint.mainCastHint,
                  supporting_cast_hint: chapter.seed.characterConceptHint.supportingCastHint,
                  reference_asset_ids: chapter.seed.characterConceptHint.referenceAssetIds,
                  constraints: chapter.seed.characterConceptHint.constraints,
                },
                style_notes: chapter.seed.styleNotes,
              },
              sort_order: chapter.sortOrder,
              status: chapter.status,
              adopted_prompt_version_id: chapter.adoptedPromptVersionId,
            })),
          },
          prompt_versions_by_chapter_id: {
            chapter_kitchen: [{
              id: legacyOnlyVersion.id,
              chapter_id: legacyOnlyVersion.chapterId,
              version_label: legacyOnlyVersion.versionLabel,
              title: legacyOnlyVersion.title,
              status: legacyOnlyVersion.status,
              scene_director_plan: toSnakeSceneDirectorPlan(legacyOnlyVersion.sceneDirectorPlan),
              cast_bindings: toSnakeCastBindings(legacyOnlyVersion.castBindings),
              prompt_tuning: toSnakePromptTuning(legacyOnlyVersion.promptTuning),
              object_plan: toSnakeObjectPlan(legacyOnlyVersion.objectPlan),
              prompt_package: legacyOnlyVersion.promptPackage,
              source_version_id: legacyOnlyVersion.sourceVersionId,
              image_attempt_ids: legacyOnlyVersion.imageAttemptIds,
            }],
          },
          image_attempts_by_version_id: {},
          selected_chapter_id: baseState.selectedChapterId,
          selected_prompt_version_id: legacyOnlyVersion.id,
          async_status: {},
          tasks: [],
        });
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      window.history.pushState({}, "", "/course-planner/chapters/chapter_kitchen");
      render(<App />);

      const main = await screen.findByRole("main");
      const preview = within(main).getByRole("region", { name: "Scene Intent Preview" });
      expect(within(preview).queryByText("legacy kettle")).not.toBeInTheDocument();
      expect(within(preview).queryByText("legacy towel")).not.toBeInTheDocument();
      expect(within(preview).queryByText("legacy stool")).not.toBeInTheDocument();
      expect(within(preview).queryByText("legacy knife")).not.toBeInTheDocument();
      expect(within(preview).queryByText("叙事锚点")).not.toBeInTheDocument();
      expect(within(preview).queryByText("可选词池")).not.toBeInTheDocument();
      expect(within(preview).queryByText("环境补足策略")).not.toBeInTheDocument();
      expect(within(preview).queryByText("禁止项")).not.toBeInTheDocument();
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });
