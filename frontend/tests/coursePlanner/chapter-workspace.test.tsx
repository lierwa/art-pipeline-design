import {
  App,
  describe,
  expect,
  fireEvent,
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
  toSnakeSceneDirectorPlan,
} from "./chapterWorkspaceTestHelpers";

describe("Chapter Workspace", () => {
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
      const seedContext = within(main).getByRole("region", { name: "Chapter Seed Context" });
      expect(within(seedContext).getByText("室内家庭篇")).toBeInTheDocument();
      expect(within(seedContext).getAllByText("早餐时牛奶杯打翻，孩子和家长一起处理。").length).toBeGreaterThan(0);
      expect(within(seedContext).getByText("厨房餐台、冰箱和水槽形成清晰动线。")).toBeInTheDocument();
      expect(within(seedContext).getByText("milk cup")).toBeInTheDocument();
      expect(within(seedContext).getByText("main child and parent")).toBeInTheDocument();

      expect(within(main).queryByRole("region", { name: "Scene Card" })).not.toBeInTheDocument();
      expect(within(main).queryByRole("region", { name: "Detection Keywords" })).not.toBeInTheDocument();

      await user.click(within(main).getByRole("button", { name: "基于 Chapter Seed 生成第一个 Prompt 版本" }));

      await waitFor(() => {
        expect(createCalls).toEqual(["/api/course-planner/chapters/chapter_kitchen/prompt-versions"]);
      });
      expect(await within(main).findByText("V001")).toBeInTheDocument();
      expect(within(main).getByText("早餐厨房构图")).toBeInTheDocument();
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
      expect(within(versionList).getByRole("button", { name: /V001.*正面构图.*prompt_ready.*0 次/s })).toBeInTheDocument();
      expect(within(versionList).getByRole("button", { name: /V002.*俯视构图.*adopted.*2 次/s })).toBeInTheDocument();
      const designPanel = within(main).getByRole("region", { name: "Scene Director Design" });
      expect(designPanel).toBeInTheDocument();
      expect(within(designPanel).getByRole("textbox", { name: "Story Event" })).toHaveValue("V002 story event.");
      expect(within(main).getByText("V002 full prompt.")).toBeInTheDocument();
      expect(within(main).getByText("V002 negative.")).toBeInTheDocument();
      expect(within(designPanel).getByRole("heading", { name: "Object Planning" })).toBeInTheDocument();
      expect(within(designPanel).getByRole("heading", { name: "Core Objects" })).toBeInTheDocument();
      expect(within(designPanel).getByRole("heading", { name: "Required Objects" })).toBeInTheDocument();
      expect(within(designPanel).getByRole("heading", { name: "Recommended Objects" })).toBeInTheDocument();
      expect(within(designPanel).getByRole("heading", { name: "Avoid / Move Objects" })).toBeInTheDocument();
      expect(within(designPanel).getByRole("textbox", { name: "Core Objects" })).toHaveValue("milk cup | spilled object | front counter");
      expect(within(designPanel).getByRole("textbox", { name: "Required Objects" })).toHaveValue("cloth | cleanup action | child hand");
      expect(within(designPanel).getByRole("textbox", { name: "Recommended Objects" })).toHaveValue("breakfast plate | daily context | table edge");
      expect(within(designPanel).getByRole("textbox", { name: "Avoid / Move Objects" })).toHaveValue("sharp knife | avoid danger tone");

      await userEvent.click(within(versionList).getByRole("button", { name: /V001.*正面构图/s }));

      expect(await within(main).findByDisplayValue("V001 story event.")).toBeInTheDocument();
      expect(within(main).getByRole("textbox", { name: "Scene Composition" })).toHaveValue("V001 composition.");
      expect(within(main).getByText("V001 full prompt.")).toBeInTheDocument();
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });

  it("adopts a Prompt Version through the chapter hierarchy API", async () => {
    const user = userEvent.setup();
    const adoptCalls: string[] = [];
    const v001 = promptVersion({ id: "prompt_version_001", versionLabel: "V001", title: "正面构图" });
    const v002 = promptVersion({ id: "prompt_version_002", versionLabel: "V002", title: "俯视构图", status: "adopted" });
    const restoreFetch = installChapterWorkspaceFetchMock({
      state: coursePlannerState({ promptVersions: [v001, v002], selectedPromptVersionId: "prompt_version_001" }),
      adoptPromptVersion: (input) => {
        adoptCalls.push(String(input));
        return jsonResponse({
          chapter: { ...coursePlannerState().chaptersByScenePackId.scene_pack_home[0], adopted_prompt_version_id: "prompt_version_001" },
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
      await user.click(within(main).getByRole("button", { name: "Mark Adopted" }));

      await waitFor(() => {
        expect(adoptCalls).toEqual([
          "/api/course-planner/chapters/chapter_kitchen/prompt-versions/prompt_version_001/adopt",
        ]);
      });
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
        fullPrompt: "Selected full prompt.",
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
      expect(writeText).toHaveBeenNthCalledWith(1, "Selected full prompt.");
      expect(writeText).toHaveBeenNthCalledWith(2, "Selected negative constraints.");

      await user.click(within(main).getByRole("button", { name: "查看 Prompt Package" }));
      const dialog = await screen.findByRole("dialog", { name: "Prompt Package" });
      expect(within(dialog).getByText("Selected full prompt.")).toBeInTheDocument();
      expect(within(dialog).getByText("Selected negative constraints.")).toBeInTheDocument();
      expect(within(dialog).getByText("Selected revision prompt.")).toBeInTheDocument();
      await user.click(within(dialog).getByRole("button", { name: "Close" }));

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

  it("persists Scene Director and Object Planning edits before generating the Prompt Package", async () => {
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
              storyEvent: "Edited spill event with parent handing over a towel.",
            },
            objectPlan: {
              ...v002.objectPlan,
              coreObjects: [
                {
                  name: "milk cup",
                  roleInScene: "tipped near table edge",
                  placementHint: "front counter",
                  priority: "core",
                },
              ],
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
      const designPanel = within(main).getByRole("region", { name: "Scene Director Design" });
      const storyEvent = within(designPanel).getByRole("textbox", { name: "Story Event" });
      await user.clear(storyEvent);
      await user.type(storyEvent, "Edited spill event with parent handing over a towel.");
      expect(storyEvent).toHaveValue("Edited spill event with parent handing over a towel.");

      const coreObjects = within(designPanel).getByRole("textbox", { name: "Core Objects" });
      await user.clear(coreObjects);
      await user.type(coreObjects, "milk cup | tipped near table edge | front counter");
      expect(coreObjects).toHaveValue("milk cup | tipped near table edge | front counter");
      expect(within(designPanel).getByText("未保存编辑")).toBeInTheDocument();

      await user.click(within(main).getByRole("button", { name: "生成/刷新 Prompt" }));

      await waitFor(() => {
        expect(calls).toEqual([
          {
            input: "/api/course-planner/prompt-versions/prompt_version_002",
            method: "PATCH",
            body: {
              scene_director_plan: {
                ...toSnakeSceneDirectorPlan(v002.sceneDirectorPlan),
                story_event: "Edited spill event with parent handing over a towel.",
              },
              object_plan: {
                ...toSnakeObjectPlan(v002.objectPlan),
                core_objects: [
                  {
                    name: "milk cup",
                    role_in_scene: "tipped near table edge",
                    placement_hint: "front counter",
                    priority: "core",
                  },
                ],
              },
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
      await user.click(within(main).getByRole("button", { name: "AI 修改当前版本" }));
      const feedbackPanel = within(main).getByRole("region", { name: "AI Revision Feedback" });
      const feedback = within(feedbackPanel).getByRole("textbox", { name: "Revision Feedback" });
      await user.type(feedback, "Make the action clearer and move the sharp object out of frame.");
      await user.click(within(feedbackPanel).getByRole("button", { name: "提交 AI 修改" }));

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
