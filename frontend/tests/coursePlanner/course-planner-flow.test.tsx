import { act, renderHook } from "@testing-library/react";

import {
  describe,
  expect,
  installFetchMock,
  it,
  jsonResponse,
  waitFor,
} from "../app/appTestHarness";
import { useCoursePlannerState } from "../../src/features/coursePlanner/hooks/useCoursePlannerState";
import type { Chapter, ChapterCandidate, ScenePack } from "../../src/features/coursePlanner/types";

describe("Course Planner hierarchy state", () => {
  it("loads the grouped chapter hierarchy from one state payload", async () => {
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/course-planner/state" && (!init || init.method === "GET")) {
        return jsonResponse(statePayload());
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });

    try {
      const { result } = renderHook(() => useCoursePlannerState());

      await waitFor(() => {
        expect(result.current.asyncStatus["load-state"]?.status).toBe("succeeded");
      });

      expect(result.current.scenePacks).toEqual([scenePackPayload()]);
      expect(result.current.chaptersByScenePackId.scene_pack_001).toEqual([chapterPayload("chapter_001")]);
      expect(result.current.selectedChapterId).toBe("chapter_001");
    } finally {
      restoreFetch();
    }
  });

  it("accepts a candidate into the chapter list and keeps chapter order on the pack", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ input: url, init });
      if (url === "/api/course-planner/state" && (!init || init.method === "GET")) {
        return jsonResponse({
          ...statePayload(),
          chapters: [],
          selectedChapterId: null,
          candidatesByScenePackId: {
            scene_pack_001: [candidatePayload("candidate_001")],
          },
        });
      }
      if (url.endsWith("/chapters") && init?.method === "POST") {
        return jsonResponse({ chapter: chapterPayload("chapter_accepted") });
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });

    try {
      const { result } = renderHook(() => useCoursePlannerState());

      await waitFor(() => {
        expect(result.current.candidatesByScenePackId.scene_pack_001).toHaveLength(1);
      });

      await act(async () => {
        await result.current.acceptChapterCandidate("scene_pack_001", "candidate_001");
      });

      expect(result.current.scenePacks[0].chapterIds).toEqual(["chapter_accepted"]);
      expect(result.current.chaptersByScenePackId.scene_pack_001).toEqual([chapterPayload("chapter_accepted")]);
      expect(result.current.candidatesByScenePackId.scene_pack_001).toEqual([]);
      expect(result.current.selectedChapterId).toBe("chapter_accepted");
      expect(JSON.parse(String(calls.find((call) => call.input.endsWith("/chapters"))?.init?.body))).toEqual({
        chapter_title: "Accepted chapter",
        chapter_intent: "practice breakfast cleanup",
        scene_domain: "indoor-home",
        daily_moment: "morning",
        event_seed: "milk spills near the breakfast table",
        spatial_seed: "table centered with fridge on the left",
        object_coverage_hint: ["milk cup", "cloth"],
        character_concept_hint: {
          cast_mode: "main_cast_and_supporting_cast",
          main_cast_hint: "main child character",
          supporting_cast_hint: "supporting parent",
          reference_asset_ids: [],
          constraints: ["keep the family cast stable"],
        },
        style_notes: "storybook morning light",
      });
    } finally {
      restoreFetch();
    }
  });

  it("removes deleted chapter ids from the owning scene pack", async () => {
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/course-planner/state" && (!init || init.method === "GET")) {
        return jsonResponse(statePayload());
      }
      if (url.endsWith("/chapters/chapter_001") && init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });

    try {
      const { result } = renderHook(() => useCoursePlannerState());

      await waitFor(() => {
        expect(result.current.chaptersByScenePackId.scene_pack_001).toEqual([chapterPayload("chapter_001")]);
      });

      await act(async () => {
        await result.current.deleteChapter("scene_pack_001", "chapter_001");
      });

      expect(result.current.scenePacks[0].chapterIds).toEqual([]);
      expect(result.current.chaptersByScenePackId.scene_pack_001).toEqual([]);
      expect(result.current.selectedChapterId).toBeNull();
    } finally {
      restoreFetch();
    }
  });
});

function statePayload() {
  return {
    scenePacks: [scenePackPayload()],
    chapters: [chapterPayload("chapter_001")],
    selectedChapterId: "chapter_001",
    tasks: [],
  };
}

function scenePackPayload(): ScenePack {
  return {
    id: "scene_pack_001",
    title: "室内家庭篇",
    intent: "daily home scenes",
    notes: null,
    status: "active",
    chapterIds: ["chapter_001"],
    chapterListLocked: false,
  };
}

function candidatePayload(id: string): ChapterCandidate {
  return {
    id,
    scenePackId: "scene_pack_001",
    title: "Accepted chapter",
    summary: "Breakfast cleanup in a home kitchen.",
    seed: chapterSeed("chapter_accepted"),
  };
}

function chapterPayload(id: string): Chapter {
  return {
    id,
    scenePackId: "scene_pack_001",
    title: id === "chapter_001" ? "Breakfast kitchen" : "Accepted chapter",
    summary: "Breakfast cleanup in a home kitchen.",
    seed: chapterSeed(id),
    sortOrder: 1,
    status: "designing",
  };
}

function chapterSeed(chapterId: string) {
  return {
    scenePackId: "scene_pack_001",
    scenePackTitle: "室内家庭篇",
    chapterId,
    chapterTitle: "Accepted chapter",
    chapterIntent: "practice breakfast cleanup",
    sceneDomain: "indoor-home",
    dailyMoment: "morning",
    eventSeed: "milk spills near the breakfast table",
    spatialSeed: "table centered with fridge on the left",
    objectCoverageHint: ["milk cup", "cloth"],
    characterConceptHint: {
      castMode: "main_cast_and_supporting_cast" as const,
      mainCastHint: "main child character",
      supportingCastHint: "supporting parent",
      referenceAssetIds: [],
      constraints: ["keep the family cast stable"],
    },
    styleNotes: "storybook morning light",
  };
}
