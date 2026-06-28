import {
  App,
  describe,
  expect,
  installFetchMock,
  it,
  jsonResponse,
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from "../app/appTestHarness";

import type {
  Chapter,
  ChapterCandidate,
  ChapterSeed,
  CoursePlannerState,
  ScenePack,
} from "../../src/features/coursePlanner/types";

describe("Scene Category Board", () => {
  it("shows the Scene Pack list and removes old manual planning controls", async () => {
    const restoreFetch = installCoursePlannerFetchMock();

    try {
      window.history.pushState({}, "", "/course-planner");
      render(<App />);

      expect(await screen.findByRole("heading", { name: "Scene Pack / Chapter Board" })).toBeInTheDocument();
      expect(screen.getByRole("navigation", { name: "Scene Pack list" })).toHaveTextContent("室内家庭篇");
      expect(screen.queryByLabelText("Target Level")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Chapter Count")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Up" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Down" })).not.toBeInTheDocument();
      expect(screen.queryByText("Locked Chapters")).not.toBeInTheDocument();
      expect(screen.getAllByRole("region", { name: "Chapter list" })).toHaveLength(1);
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });

  it("accepts and deletes AI candidates into one Chapter list without a Reject action", async () => {
    const user = userEvent.setup();
    const restoreFetch = installCoursePlannerFetchMock();

    try {
      window.history.pushState({}, "", "/course-planner");
      render(<App />);

      await screen.findByRole("heading", { name: "Scene Pack / Chapter Board" });
      const candidateBoard = screen.getByRole("region", { name: "AI Chapter candidate pool" });
      const breakfastCard = within(candidateBoard).getByRole("article", { name: "候选 Chapter 早餐厨房" });

      expect(within(breakfastCard).getByRole("button", { name: "接受" })).toBeEnabled();
      expect(within(breakfastCard).getByRole("button", { name: "编辑" })).toBeEnabled();
      expect(within(breakfastCard).getByRole("button", { name: "删除" })).toBeEnabled();
      expect(within(breakfastCard).queryByRole("button", { name: "拒绝" })).not.toBeInTheDocument();

      await user.click(within(breakfastCard).getByRole("button", { name: "接受" }));

      const chapterList = await screen.findByRole("region", { name: "Chapter list" });
      expect(within(chapterList).getByText("早餐厨房")).toBeInTheDocument();
      expect(within(chapterList).getByLabelText("Drag handle for 早餐厨房")).toBeInTheDocument();
      expect(within(chapterList).getByRole("link", { name: "Open Designer for 早餐厨房" })).toHaveAttribute(
        "href",
        "/course-planner/chapters/chapter_breakfast_kitchen",
      );
      expect(screen.getAllByRole("region", { name: "Chapter list" })).toHaveLength(1);

      const homeworkCard = within(candidateBoard).getByRole("article", { name: "候选 Chapter 客厅作业" });
      await user.click(within(homeworkCard).getByRole("button", { name: "删除" }));
      await waitFor(() => {
        expect(within(candidateBoard).queryByRole("article", { name: "候选 Chapter 客厅作业" })).not.toBeInTheDocument();
      });
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });

  it("locks the Chapter list state without creating a duplicate locked list", async () => {
    const user = userEvent.setup();
    const restoreFetch = installCoursePlannerFetchMock();

    try {
      window.history.pushState({}, "", "/course-planner");
      render(<App />);

      const chapterList = await screen.findByRole("region", { name: "Chapter list" });
      await user.click(within(chapterList).getByRole("button", { name: "Lock Chapter List" }));

      expect(await within(chapterList).findByText("locked")).toBeInTheDocument();
      expect(within(chapterList).getByRole("button", { name: "Unlock Chapter List" })).toBeInTheDocument();
      expect(screen.getAllByRole("region", { name: "Chapter list" })).toHaveLength(1);
      expect(screen.queryByText("Locked Chapters")).not.toBeInTheDocument();
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });

  it("disables Chapter list mutations while the selected Scene Pack is locked", async () => {
    const restoreFetch = installCoursePlannerFetchMock({ chapterListLocked: true });

    try {
      window.history.pushState({}, "", "/course-planner");
      render(<App />);

      await screen.findByRole("heading", { name: "Scene Pack / Chapter Board" });
      const candidateBoard = screen.getByRole("region", { name: "AI Chapter candidate pool" });
      const breakfastCard = within(candidateBoard).getByRole("article", { name: "候选 Chapter 早餐厨房" });
      const chapterList = screen.getByRole("region", { name: "Chapter list" });

      expect(candidateBoard).toHaveTextContent("Chapter list locked");
      expect(within(breakfastCard).getByRole("button", { name: "接受" })).toBeDisabled();
      expect(within(breakfastCard).getByRole("button", { name: "编辑" })).toBeEnabled();
      expect(within(chapterList).getByLabelText("Drag handle for 早餐厨房")).toBeDisabled();
      expect(within(chapterList).getByRole("button", { name: "Delete Chapter 早餐厨房" })).toBeDisabled();
      expect(within(chapterList).getByRole("link", { name: "Open Designer for 早餐厨房" })).toBeInTheDocument();
      expect(within(chapterList).getByRole("button", { name: "Unlock Chapter List" })).toBeInTheDocument();
      expect(screen.getAllByRole("region", { name: "Chapter list" })).toHaveLength(1);
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });
});

type CoursePlannerFetchMockOptions = {
  chapterListLocked?: boolean;
};

function installCoursePlannerFetchMock({ chapterListLocked = false }: CoursePlannerFetchMockOptions = {}) {
  const state = coursePlannerState({ chapterListLocked });

  return installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (input === "/api/workspace/runs" && (!init || init.method === "GET")) {
      return jsonResponse({ runs: [] });
    }
    if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
      return jsonResponse({ source: null, elements: [], detectionVocabulary: [] });
    }
    if (input === "/api/course-planner/state" && (!init || init.method === "GET")) {
      return jsonResponse(state);
    }
    if (input === "/api/course-planner/scene-packs/packHome/chapters" && init?.method === "POST") {
      const chapter = chapterFromSeed((await parseBody<{ chapter_seed?: ChapterSeed; chapterSeed?: ChapterSeed }>(init)).chapterSeed);
      state.chaptersByScenePackId.packHome = [chapter];
      state.scenePacks = [{ ...state.scenePacks[0], chapterIds: [chapter.id] }];
      state.candidatesByScenePackId.packHome = state.candidatesByScenePackId.packHome.filter(
        (candidate) => candidate.id !== "candidate_breakfast_kitchen",
      );
      return jsonResponse({ chapter });
    }
    if (input === "/api/course-planner/candidates/candidate_living_homework" && init?.method === "DELETE") {
      state.candidatesByScenePackId.packHome = state.candidatesByScenePackId.packHome.filter(
        (candidate) => candidate.id !== "candidate_living_homework",
      );
      return new Response(null, { status: 204 });
    }
    if (input === "/api/course-planner/scene-packs/packHome/chapter-list-lock" && init?.method === "PATCH") {
      const body = await parseBody<{ locked: boolean }>(init);
      state.scenePacks = [{ ...state.scenePacks[0], chapterListLocked: body.locked }];
      return jsonResponse({ scenePack: state.scenePacks[0] });
    }
    throw new Error(`Unexpected fetch call: ${String(input)}`);
  });
}

async function parseBody<T>(init: RequestInit): Promise<T> {
  return JSON.parse(String(init.body)) as T;
}

function coursePlannerState({ chapterListLocked = false }: CoursePlannerFetchMockOptions = {}): CoursePlannerState {
  return {
    scenePacks: [scenePack({ chapterListLocked })],
    activeScenePackId: "packHome",
    candidatesByScenePackId: { packHome: chapterCandidates() },
    chaptersByScenePackId: { packHome: [chapterFromSeed(chapterSeed("chapter_breakfast_kitchen", "早餐厨房"))] },
    promptVersionsByChapterId: {},
    imageAttemptsByVersionId: {},
    selectedChapterId: null,
    selectedPromptVersionId: null,
    asyncStatus: {},
    tasks: [],
  };
}

function scenePack({ chapterListLocked = false }: CoursePlannerFetchMockOptions = {}): ScenePack {
  return {
    id: "packHome",
    title: "室内家庭篇",
    intent: "厨房、客厅、睡前整理等家庭高频视觉场景。",
    notes: "优先保留物件和行动关系。",
    status: "active",
    chapterIds: ["chapter_breakfast_kitchen"],
    chapterListLocked,
  };
}

function chapterCandidates(): ChapterCandidate[] {
  return [
    {
      id: "candidate_breakfast_kitchen",
      scenePackId: "packHome",
      title: "早餐厨房",
      summary: "厨房餐台和冰箱前的早晨动线",
      seed: chapterSeed("chapter_breakfast_kitchen", "早餐厨房"),
    },
    {
      id: "candidate_living_homework",
      scenePackId: "packHome",
      title: "客厅作业",
      summary: "沙发旁的小桌和书包",
      seed: chapterSeed("chapter_living_homework", "客厅作业"),
    },
  ];
}

function chapterFromSeed(seed: ChapterSeed = chapterSeed("chapter_breakfast_kitchen", "早餐厨房")): Chapter {
  return {
    id: seed.chapterId,
    scenePackId: seed.scenePackId,
    title: seed.chapterTitle,
    summary: seed.chapterIntent,
    seed,
    sortOrder: 1,
    status: "draft",
    adoptedPromptVersionId: null,
  };
}

function chapterSeed(chapterId: string, title: string): ChapterSeed {
  return {
    scenePackId: "packHome",
    scenePackTitle: "室内家庭篇",
    chapterId,
    chapterTitle: title,
    chapterIntent: title === "早餐厨房" ? "厨房餐台和冰箱前的早晨动线" : "沙发旁的小桌和书包",
    sceneDomain: "indoor-home",
    dailyMoment: title === "早餐厨房" ? "morning" : "afternoon",
    eventSeed: title === "早餐厨房" ? "找牛奶、拿杯子、准备早餐" : "找铅笔、翻开作业本",
    spatialSeed: title === "早餐厨房" ? "冰箱、杯子、麦片盒" : "书包、铅笔、作业本",
    objectCoverageHint: title === "早餐厨房" ? ["冰箱", "杯子", "麦片盒"] : ["书包", "铅笔", "作业本"],
    characterConceptHint: {
      castMode: "main_cast_and_supporting_cast",
      mainCastHint: "孩子",
      supportingCastHint: "家长",
      referenceAssetIds: [],
      constraints: ["保持家庭主角一致"],
    },
    styleNotes: "Pipeline blue-black visual density",
  };
}
