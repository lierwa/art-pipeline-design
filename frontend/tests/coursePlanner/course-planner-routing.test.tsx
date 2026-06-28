import type { CoursePlannerState, ImageAttempt, PromptVersion } from "../../src/features/coursePlanner/types";
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

describe("Course Planner route navigation", () => {
  it("shows product navigation beside the logo and routes between product areas", async () => {
    const user = userEvent.setup();
    const restoreFetch = installCoursePlannerRoutingFetchMock(coursePlannerState());

    try {
      window.history.pushState({}, "", "/pipeline");
      render(<App />);

      const banner = await screen.findByRole("banner");
      const productNav = within(banner).getByRole("navigation", { name: /product areas/i });
      expect(within(productNav).getByRole("link", { name: /pipeline/i })).toHaveAttribute("href", "/pipeline");
      expect(within(productNav).getByRole("link", { name: /course planner/i })).toHaveAttribute("href", "/course-planner");
      expect(within(productNav).getByRole("link", { name: /lesson plan/i })).toHaveAttribute("href", "/lesson-plan");

      await user.click(within(productNav).getByRole("link", { name: /course planner/i }));
      expect(await screen.findByRole("heading", { name: "Scene Pack / Chapter Board" })).toBeInTheDocument();
      expect(within(await screen.findByRole("banner")).queryByRole("button", { name: /refresh/i })).not.toBeInTheDocument();

      await user.click(within(productNav).getByRole("link", { name: /lesson plan/i }));
      expect(await screen.findByRole("heading", { name: /lesson plan/i })).toBeInTheDocument();
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });

  it("routes 01 to 02 to uploaded 03 and back to the same Prompt Version", async () => {
    const user = userEvent.setup();
    const state = coursePlannerState({ selectedPromptVersionId: "version_breakfast_002" });
    const restoreFetch = installCoursePlannerRoutingFetchMock(state);
    const openPage = vi.spyOn(window, "open").mockImplementation((url) => {
      window.history.pushState({}, "", String(url));
      window.dispatchEvent(new PopStateEvent("popstate"));
      return null;
    });

    try {
      window.history.pushState({}, "", "/course-planner");
      render(<App />);

      // WHY: 保护 01 -> 02 的路由契约，避免 Chapter 列表只更新局部状态而没有可分享 URL。
      expect(await screen.findByRole("heading", { name: "Scene Pack / Chapter Board" })).toBeInTheDocument();
      await user.click(screen.getByRole("link", { name: "Open Designer for 早餐厨房" }));

      const workspace = await screen.findByRole("main");
      expect(within(workspace).getByRole("heading", { name: "早餐厨房" })).toBeInTheDocument();
      expect(within(workspace).getByText("V002 full prompt.")).toBeInTheDocument();

      const imageFile = new File(["fake"], "breakfast-v002.png", { type: "image/png" });
      fireEvent.change(within(workspace).getByLabelText("选择生成图文件"), { target: { files: [imageFile] } });

      const attemptUrl = "/course-planner/chapters/chapter_breakfast_kitchen/versions/version_breakfast_002/attempts/attempt_uploaded";
      await waitFor(() => {
        expect(window.location.pathname).toBe(attemptUrl);
      });
      expect(await screen.findByRole("heading", { name: "Image Attempt Review" })).toBeInTheDocument();

      state.selectedPromptVersionId = null;
      state.chaptersByScenePackId.pack_home[0].adoptedPromptVersionId = "version_breakfast_001";
      await user.click(screen.getByRole("link", { name: "Back to Version" }));

      await waitFor(() => {
        expect(window.location.pathname).toBe("/course-planner/chapters/chapter_breakfast_kitchen");
        expect(window.location.search).toBe("?versionId=version_breakfast_002");
      });
      // WHY: 03 返回时后端状态可能已重载；URL 上的 versionId 是恢复同一 PromptVersion 的协议边界。
      expect(await screen.findByText("V002 full prompt.")).toBeInTheDocument();
      expect(screen.queryByText("V001 full prompt.")).not.toBeInTheDocument();
    } finally {
      openPage.mockRestore();
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });
});

function installCoursePlannerRoutingFetchMock(state: CoursePlannerState) {
  return installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (input === "/api/workspace/runs" && (!init || init.method === "GET")) {
      return jsonResponse({ runs: [] });
    }
    if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
      return jsonResponse({ source: null, elements: [], detectionVocabulary: [] });
    }
    if (input === "/api/course-planner/state" && (!init || init.method === "GET")) {
      return jsonResponse(coursePlannerStateResponse(state));
    }
    if (input === "/api/course-planner/prompt-versions/version_breakfast_002/image-attempts/upload" && init?.method === "POST") {
      const uploadName = uploadedImageName(init);
      const attempt = imageAttempt({
        id: "attempt_uploaded",
        uploadedImageId: `uploads/course_planner/version_breakfast_002/${uploadName}`,
      });
      state.imageAttemptsByVersionId.version_breakfast_002 = [
        ...(state.imageAttemptsByVersionId.version_breakfast_002 ?? []),
        attempt,
      ];
      state.promptVersionsByChapterId.chapter_breakfast_kitchen = state.promptVersionsByChapterId.chapter_breakfast_kitchen.map(
        (version) => version.id === "version_breakfast_002"
          ? { ...version, imageAttemptIds: [...version.imageAttemptIds, attempt.id], status: "has_attempts" }
          : version,
      );
      return jsonResponse({ imageAttempt: attempt });
    }
    throw new Error(`Unexpected fetch call: ${String(input)}`);
  });
}

function coursePlannerStateResponse(state: CoursePlannerState) {
  return {
    scenePacks: state.scenePacks,
    activeScenePackId: state.activeScenePackId,
    candidatesByScenePackId: {},
    chapters: Object.values(state.chaptersByScenePackId).flat(),
    promptVersions: Object.values(state.promptVersionsByChapterId).flat(),
    imageAttempts: Object.values(state.imageAttemptsByVersionId).flat(),
    selectedChapterId: state.selectedChapterId,
    selectedPromptVersionId: state.selectedPromptVersionId,
    tasks: state.tasks,
  };
}

function uploadedImageName(init: RequestInit) {
  const body = init.body as FormData;
  const file = body.get("file") as File | null;
  return file?.name ?? "uploaded.png";
}

function coursePlannerState({
  selectedPromptVersionId = null,
}: {
  selectedPromptVersionId?: string | null;
} = {}): CoursePlannerState {
  const versions = [
    promptVersion({
      id: "version_breakfast_001",
      versionLabel: "V001",
      title: "first kitchen angle",
      promptPackage: { fullPrompt: "V001 full prompt.", negativeConstraints: "V001 negative.", shortPrompt: null, revisionPrompt: null },
    }),
    promptVersion({
      id: "version_breakfast_002",
      versionLabel: "V002",
      title: "morning counter",
      promptPackage: { fullPrompt: "V002 full prompt.", negativeConstraints: "V002 negative.", shortPrompt: null, revisionPrompt: null },
    }),
  ];

  return {
    scenePacks: [
      {
        id: "pack_home",
        title: "室内家庭篇",
        intent: "家庭高频视觉场景。",
        notes: null,
        status: "active",
        chapterIds: ["chapter_breakfast_kitchen"],
        chapterListLocked: false,
      },
    ],
    activeScenePackId: "pack_home",
    candidatesByScenePackId: {},
    chaptersByScenePackId: {
      pack_home: [
        {
          id: "chapter_breakfast_kitchen",
          scenePackId: "pack_home",
          title: "早餐厨房",
          summary: "厨房餐台和冰箱前的早晨动线。",
          seed: {
            scenePackId: "pack_home",
            scenePackTitle: "室内家庭篇",
            chapterId: "chapter_breakfast_kitchen",
            chapterTitle: "早餐厨房",
            chapterIntent: "组织早餐准备的家庭互动。",
            sceneDomain: "indoor-home",
            dailyMoment: "morning",
            eventSeed: "找牛奶、拿杯子、准备早餐。",
            spatialSeed: "冰箱、杯子、麦片盒。",
            objectCoverageHint: ["冰箱", "杯子", "麦片盒"],
            characterConceptHint: {
              castMode: "main_cast_and_supporting_cast",
              mainCastHint: "孩子",
              supportingCastHint: "家长",
              referenceAssetIds: [],
              constraints: ["保持家庭主角一致"],
            },
            styleNotes: "clean storybook image",
          },
          sortOrder: 1,
          status: "prompt_ready",
          adoptedPromptVersionId: "version_breakfast_002",
        },
      ],
    },
    promptVersionsByChapterId: { chapter_breakfast_kitchen: versions },
    imageAttemptsByVersionId: { version_breakfast_002: [] },
    selectedChapterId: "chapter_breakfast_kitchen",
    selectedPromptVersionId,
    asyncStatus: {},
    tasks: [],
  };
}

function promptVersion(overrides: Partial<PromptVersion> = {}): PromptVersion {
  return {
    id: "version_breakfast_001",
    chapterId: "chapter_breakfast_kitchen",
    versionLabel: "V001",
    title: "first kitchen angle",
    status: "prompt_ready",
    sceneDirectorPlan: {
      storyEvent: "孩子拿杯子准备早餐。",
      sceneComposition: "中景厨房餐台。",
      spatialStructure: "冰箱在左，餐台在右。",
      characterArrangement: "孩子靠近餐台，家长在背景。",
      actionDesign: "拿杯子并看向麦片盒。",
      styleAndConstraints: "clean storybook image",
    },
    objectPlan: {
      coreObjects: [{ name: "杯子", roleInScene: "早餐动作核心", priority: "core" }],
      requiredObjects: [{ name: "冰箱", roleInScene: "空间锚点", priority: "required" }],
      recommendedObjects: [{ name: "麦片盒", roleInScene: "早餐语境", priority: "recommended" }],
      avoidOrMoveObjects: [],
    },
    promptPackage: {
      fullPrompt: "V001 full prompt.",
      shortPrompt: null,
      negativeConstraints: "V001 negative.",
      revisionPrompt: null,
    },
    sourceVersionId: null,
    imageAttemptIds: [],
    ...overrides,
  };
}

function imageAttempt(overrides: Partial<ImageAttempt> = {}): ImageAttempt {
  return {
    id: "attempt_uploaded",
    promptVersionId: "version_breakfast_002",
    uploadedImageId: "breakfast-v002.png",
    status: "uploaded",
    aiReview: null,
    humanDecision: null,
    pipelineImportId: null,
    ...overrides,
  };
}
