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
  vi,
  waitFor,
  within,
} from "../app/appTestHarness";
import { act } from "@testing-library/react";

import type {
  Chapter,
  ChapterCandidate,
  ChapterSeed,
  CoursePlannerState,
  ScenePack,
} from "../../src/features/coursePlanner/types";

describe("Scene Category Board", () => {
  it("renders Scene Pack actions inside each pack item and removes the selected-pack action panel", async () => {
    const restoreFetch = installCoursePlannerFetchMock();

    try {
      window.history.pushState({}, "", "/course-planner");
      render(<App />);

      const pageHeading = await screen.findByRole("heading", { name: "Scene Pack / Chapter Board" });
      expect(pageHeading).toBeInTheDocument();
      const pageHeader = pageHeading.closest(".course-planner-page-header");
      expect(pageHeader).not.toBeNull();
      expect(within(pageHeader as HTMLElement).getByText("室内家庭篇")).toBeInTheDocument();
      expect(screen.getByRole("navigation", { name: "Scene Pack list" })).toHaveTextContent("室内家庭篇");
      expect(screen.queryByLabelText("Target Level")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Chapter Count")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Up" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Down" })).not.toBeInTheDocument();
      expect(screen.queryByText("Locked Chapters")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Lock Chapter List" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Unlock Chapter List" })).not.toBeInTheDocument();
      expect(screen.queryByText(/Selected pack/i)).not.toBeInTheDocument();
      expect(screen.getAllByRole("region", { name: "Chapter list" })).toHaveLength(1);
      const packItem = screen.getByRole("group", { name: /Scene Pack 室内家庭篇/s });
      expect(within(packItem).getByRole("group", { name: "Scene Pack actions for 室内家庭篇" })).toBeInTheDocument();
      expect(within(packItem).getByRole("button", { name: /Edit/i })).toBeVisible();
      expect(within(packItem).getByRole("button", { name: /Archive/i })).toBeVisible();
      expect(within(packItem).getByRole("button", { name: /Delete/i })).toBeVisible();
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });

  it("uses the shared compact dialog for editing a Scene Pack", async () => {
    const user = userEvent.setup();
    const updateCalls: unknown[] = [];
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/runs" && (!init || init.method === "GET")) {
        return jsonResponse({ runs: [] });
      }
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse({ source: null, elements: [], detectionVocabulary: [] });
      }
      if (input === "/api/course-planner/state" && (!init || init.method === "GET")) {
        return jsonResponse(coursePlannerState());
      }
      if (input === "/api/course-planner/scene-packs/packHome" && init?.method === "PATCH") {
        const body = await parseBody<{ title: string; intent: string; notes: string | null }>(init);
        updateCalls.push(body);
        return jsonResponse({
          scenePack: {
            id: "packHome",
            title: body.title,
            intent: body.intent,
            notes: body.notes,
            status: "active",
            chapter_ids: ["chapter_breakfast_kitchen"],
            chapter_list_locked: false,
          },
        });
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      window.history.pushState({}, "", "/course-planner");
      render(<App />);

      await screen.findByRole("heading", { name: "Scene Pack / Chapter Board" });
      const packItem = screen.getByRole("group", { name: /Scene Pack 室内家庭篇/s });
      await user.click(within(packItem).getByRole("button", { name: /Edit/i }));

      const dialog = await screen.findByRole("dialog", { name: "Edit Scene Pack" });
      expect(dialog).toHaveClass("course-planner-dialog");
      expect(within(dialog).getByRole("button", { name: /Close/i })).toHaveClass("course-planner-icon-button");
      expect(
        within(dialog).getByText("Set the theme and intent used for Chapter candidate generation."),
      ).toBeInTheDocument();
      expect(within(dialog).getByLabelText("Scene Pack intent")).toBeVisible();
      expect(within(dialog).getByLabelText("Scene Pack notes")).toHaveAttribute("rows", "4");
      expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: /Save Scene Pack/i })).toBeVisible();
      const titleInput = within(dialog).getByLabelText("Scene Pack title");
      await user.clear(titleInput);
      await user.type(titleInput, "室内家庭篇升级");
      await user.click(within(dialog).getByRole("button", { name: /Save Scene Pack/i }));

      await waitFor(() => {
        expect(updateCalls).toEqual([
          {
            title: "室内家庭篇升级",
            intent: "厨房、客厅、睡前整理等家庭高频视觉场景。",
            notes: "优先保留物件和行动关系。",
          },
        ]);
      });
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });

  it("opens batch candidate revision in the shared drawer shell", async () => {
    const user = userEvent.setup();
    const restoreFetch = installCoursePlannerFetchMock();

    try {
      window.history.pushState({}, "", "/course-planner");
      render(<App />);

      await screen.findByRole("heading", { name: "Scene Pack / Chapter Board" });
      await user.click(screen.getByRole("button", { name: "调整整批" }));

      const drawer = await screen.findByRole("complementary", { name: "Revise candidate batch" });
      expect(drawer).toHaveClass("course-planner-drawer");
      expect(within(drawer).queryByRole("dialog")).not.toBeInTheDocument();
      expect(within(drawer).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
      expect(within(drawer).getByRole("button", { name: "Submit revision" })).toBeDisabled();
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });

  it("does not change Scene Pack selection when clicking item actions", async () => {
    const user = userEvent.setup();
    const restoreFetch = installCoursePlannerFetchMock({ includeSecondaryPack: true });

    try {
      window.history.pushState({}, "", "/course-planner");
      render(<App />);

      await screen.findByRole("heading", { name: "Scene Pack / Chapter Board" });
      const primaryPack = screen.getByRole("group", { name: /Scene Pack 室内家庭篇/s });
      const secondaryPack = screen.getByRole("group", { name: /Scene Pack 校园晨间篇/s });

      expect(within(primaryPack).getByRole("button", { current: "page" })).toHaveTextContent("室内家庭篇");
      expect(within(secondaryPack).queryByRole("button", { current: "page" })).not.toBeInTheDocument();

      await user.click(within(secondaryPack).getByRole("button", { name: /Edit Scene Pack 校园晨间篇/i }));

      expect(await screen.findByRole("dialog", { name: "Edit Scene Pack" })).toBeInTheDocument();
      expect(within(primaryPack).getByRole("button", { current: "page" })).toHaveTextContent("室内家庭篇");
      expect(within(secondaryPack).queryByRole("button", { current: "page" })).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Scene Pack / Chapter Board" }).closest(".course-planner-page-header")).toHaveTextContent("室内家庭篇");
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
      expect(within(breakfastCard).queryByRole("button", { name: "编辑" })).not.toBeInTheDocument();
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

  it("does not expose the legacy Chapter list lock as a user action", async () => {
    const restoreFetch = installCoursePlannerFetchMock({ chapterListLocked: true });

    try {
      window.history.pushState({}, "", "/course-planner");
      render(<App />);

      await screen.findByRole("heading", { name: "Scene Pack / Chapter Board" });
      const candidateBoard = screen.getByRole("region", { name: "AI Chapter candidate pool" });
      const breakfastCard = within(candidateBoard).getByRole("article", { name: "候选 Chapter 早餐厨房" });
      const chapterList = screen.getByRole("region", { name: "Chapter list" });

      expect(candidateBoard).not.toHaveTextContent("Chapter list locked");
      expect(within(breakfastCard).getByRole("button", { name: "接受" })).toBeEnabled();
      expect(within(breakfastCard).queryByRole("button", { name: "编辑" })).not.toBeInTheDocument();
      expect(within(chapterList).getByLabelText("Drag handle for 早餐厨房")).toBeEnabled();
      expect(within(chapterList).getByRole("button", { name: "Delete Chapter 早餐厨房" })).toBeEnabled();
      expect(within(chapterList).getByRole("link", { name: "Open Designer for 早餐厨房" })).toBeInTheDocument();
      expect(within(chapterList).queryByRole("button", { name: "Lock Chapter List" })).not.toBeInTheDocument();
      expect(within(chapterList).queryByRole("button", { name: "Unlock Chapter List" })).not.toBeInTheDocument();
      expect(screen.getAllByRole("region", { name: "Chapter list" })).toHaveLength(1);
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });

  it("hides the dismissed error toast while keeping the inline error visible", async () => {
    vi.useFakeTimers();
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/runs" && (!init || init.method === "GET")) {
        return jsonResponse({ runs: [] });
      }
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse({ source: null, elements: [], detectionVocabulary: [] });
      }
      if (input === "/api/course-planner/state" && (!init || init.method === "GET")) {
        throw new Error("Course Planner state failed to load.");
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      window.history.pushState({}, "", "/course-planner");
      await act(async () => {
        render(<App />);
        await Promise.resolve();
      });

      expect(screen.getByRole("alert")).toHaveTextContent("Course Planner state failed to load.");
      expect(screen.getByText("Course Planner action failed")).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      expect(screen.queryByText("Course Planner action failed")).not.toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("Course Planner state failed to load.");
    } finally {
      vi.useRealTimers();
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });
});

type CoursePlannerFetchMockOptions = {
  asyncStatus?: CoursePlannerState["asyncStatus"];
  chapterListLocked?: boolean;
  includeSecondaryPack?: boolean;
};

function installCoursePlannerFetchMock({
  asyncStatus,
  chapterListLocked = false,
  includeSecondaryPack = false,
}: CoursePlannerFetchMockOptions = {}) {
  const state = coursePlannerState({ asyncStatus, chapterListLocked, includeSecondaryPack });

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
    throw new Error(`Unexpected fetch call: ${String(input)}`);
  });
}

async function parseBody<T>(init: RequestInit): Promise<T> {
  return JSON.parse(String(init.body)) as T;
}

function coursePlannerState({
  asyncStatus,
  chapterListLocked = false,
  includeSecondaryPack = false,
}: CoursePlannerFetchMockOptions = {}): CoursePlannerState {
  const scenePacks = includeSecondaryPack ? [scenePack({ chapterListLocked }), secondaryScenePack()] : [scenePack({ chapterListLocked })];
  return {
    scenePacks,
    activeScenePackId: "packHome",
    candidatesByScenePackId: { packHome: chapterCandidates(), ...(includeSecondaryPack ? { packStudy: [] } : {}) },
    chaptersByScenePackId: {
      packHome: [chapterFromSeed(chapterSeed("chapter_breakfast_kitchen", "早餐厨房"))],
      ...(includeSecondaryPack ? { packStudy: [] } : {}),
    },
    promptVersionsByChapterId: {},
    imageAttemptsByVersionId: {},
    selectedChapterId: null,
    selectedPromptVersionId: null,
    asyncStatus: asyncStatus ?? {},
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

function secondaryScenePack(): ScenePack {
  return {
    id: "packStudy",
    title: "校园晨间篇",
    intent: "教室、走廊、书包整理等校园晨间视觉场景。",
    notes: "用于验证未选中 Scene Pack 的行内操作。",
    status: "draft",
    chapterIds: [],
    chapterListLocked: false,
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
