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
import type {
  Chapter,
  ChapterCandidate,
  ChapterSeed,
  ImageAttempt,
  PromptVersion,
  ScenePack,
} from "../../src/features/coursePlanner/types";

describe("Course Planner hierarchy state", () => {
  it("resets prompt version selection when switching Chapters", async () => {
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/course-planner/state" && (!init || init.method === "GET")) {
        return jsonResponse({
          ...emptyStatePayload(),
          scenePacks: [snakeScenePack({ ...scenePackPayload(), chapterIds: ["chapter_001", "chapter_002"] })],
          chapters: [snakeChapter(chapterPayload("chapter_001")), snakeChapter(chapterPayload("chapter_002"))],
          promptVersions: [
            snakePromptVersion(promptVersionPayload("prompt_version_initial", "chapter_001")),
            snakePromptVersion(promptVersionPayload("prompt_version_chapter_002_latest", "chapter_002")),
            snakePromptVersion({ ...promptVersionPayload("prompt_version_chapter_002_adopted", "chapter_002"), status: "adopted" }),
          ],
        });
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });

    try {
      const { result } = renderHook(() => useCoursePlannerState());

      await waitFor(() => {
        expect(result.current.promptVersionsByChapterId.chapter_002).toHaveLength(2);
      });

      act(() => {
        result.current.setSelectedChapterId("chapter_001");
      });
      expect(result.current.selectedPromptVersionId).toBe("prompt_version_initial");

      act(() => {
        result.current.setSelectedChapterId("chapter_002");
      });
      expect(result.current.selectedPromptVersionId).toBe("prompt_version_chapter_002_adopted");
      expect(result.current.selectedPromptVersion?.chapterId).toBe("chapter_002");

      act(() => {
        result.current.setSelectedChapterId("chapter_without_versions");
      });
      expect(result.current.selectedPromptVersionId).toBeNull();
    } finally {
      restoreFetch();
    }
  });

  it("removes deleted chapter ids from the owning Scene Pack", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input: String(input), init });
      const url = String(input);
      if (url === "/api/course-planner/state" && (!init || init.method === "GET")) {
        return jsonResponse({
          ...emptyStatePayload(),
          scenePacks: [snakeScenePack({ ...scenePackPayload(), chapterIds: ["chapter_001"] })],
        });
      }
      if (url.endsWith("/chapters/chapter_001") && init?.method === "DELETE") {
        return jsonResponse({ deletedChapterId: "chapter_001" });
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });

    try {
      const { result } = renderHook(() => useCoursePlannerState());

      await waitFor(() => {
        expect(result.current.scenePacks[0].chapterIds).toEqual(["chapter_001"]);
        expect(result.current.chaptersByScenePackId.scene_pack_001).toEqual([chapterPayload()]);
      });

      await act(async () => {
        await result.current.deleteChapter("scene_pack_001", "chapter_001");
      });

      expect(result.current.chaptersByScenePackId.scene_pack_001).toEqual([]);
      expect(result.current.scenePacks[0].chapterIds).toEqual([]);
      expect(calls.map((call) => [call.input, call.init?.method ?? "GET"])).toContainEqual([
        "/api/course-planner/scene-packs/scene_pack_001/chapters/chapter_001",
        "DELETE",
      ]);
    } finally {
      restoreFetch();
    }
  });

  it("keeps one chapter source of truth and scopes attempts to the selected prompt version", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    let candidateBatchIndex = 0;
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input: String(input), init });
      const url = String(input);
      if (url === "/api/course-planner/state" && (!init || init.method === "GET")) {
        return jsonResponse(emptyStatePayload());
      }
      if (url === "/api/course-planner/scene-packs" && init?.method === "POST") {
        return jsonResponse({ scenePack: snakeScenePack(scenePackPayload()) });
      }
      if (url.endsWith("/candidate-batches") && init?.method === "POST") {
        candidateBatchIndex += 1;
        return jsonResponse({
          candidates: [snakeCandidate(candidatePayload(candidateBatchIndex === 1 ? "candidate_001" : "candidate_002"))],
          candidatePersistence: "ephemeral",
          task: taskPayload(),
        });
      }
      if (url.endsWith("/chapters") && init?.method === "POST") {
        return jsonResponse({
          chapter: snakeChapter(chapterPayload()),
        });
      }
      if (url.endsWith("/chapter-order") && init?.method === "PATCH") {
        return jsonResponse({
          scenePack: snakeScenePack({ ...scenePackPayload(), chapterIds: ["chapter_001"] }),
        });
      }
      if (url.endsWith("/chapter-list-lock") && init?.method === "PATCH") {
        return jsonResponse({
          scenePack: snakeScenePack({ ...scenePackPayload(), chapterIds: ["chapter_001"], chapterListLocked: true }),
        });
      }
      if (url.endsWith("/prompt-versions") && (!init || init.method === "GET")) {
        return jsonResponse({
          prompt_versions: [
            snakePromptVersion(promptVersionPayload("prompt_version_001")),
            snakePromptVersion({ ...promptVersionPayload("prompt_version_adopted"), status: "adopted" }),
          ],
        });
      }
      if (url.endsWith("/prompt-versions") && init?.method === "POST") {
        return jsonResponse({ promptVersion: snakePromptVersion(promptVersionPayload("prompt_version_002")) });
      }
      if (url.endsWith("/duplicate") && init?.method === "POST") {
        return jsonResponse({
          promptVersion: snakePromptVersion({
            ...promptVersionPayload("prompt_version_003"),
            sourceVersionId: "prompt_version_002",
          }),
        });
      }
      if (url.endsWith("/image-attempts") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { uploadedImageId: string };
        return jsonResponse({ imageAttempt: snakeImageAttempt(imageAttemptPayload("prompt_version_003", body.uploadedImageId)) });
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });

    try {
      const { result } = renderHook(() => useCoursePlannerState());

      await waitFor(() => {
      expect(result.current.scenePacks).toEqual([scenePackPayload()]);
      expect(result.current.chaptersByScenePackId.scene_pack_001).toEqual([chapterPayload()]);
      expect(result.current.promptVersionsByChapterId.chapter_001).toEqual([promptVersionPayload("prompt_version_initial")]);
      expect(result.current.imageAttemptsByVersionId.prompt_version_initial).toEqual([imageAttemptPayload("prompt_version_initial")]);
      expect(result.current.asyncStatus["load-state"]?.status).toBe("succeeded");
      });
      expect("courses" in result.current.state).toBe(false);
      expect("spaces" in result.current.state).toBe(false);
      expect("versions" in result.current.state).toBe(false);

      await act(async () => {
        await result.current.createScenePack({ title: "室内家庭篇", intent: "daily home scenes" });
      });
      expect(result.current.activeScenePackId).toBe("scene_pack_001");

      await act(async () => {
        await result.current.generateChapterCandidates("scene_pack_001");
      });
      await act(async () => {
        await result.current.generateChapterCandidates("scene_pack_001");
      });
      expect(result.current.candidatesByScenePackId.scene_pack_001).toEqual([
        candidatePayload("candidate_001"),
        candidatePayload("candidate_002"),
      ]);

      await act(async () => {
        await result.current.acceptChapterCandidate("scene_pack_001", "candidate_001");
      });
      expect(result.current.chaptersByScenePackId.scene_pack_001).toEqual([chapterPayload()]);
      expect(result.current.scenePacks[0].chapterIds).toEqual(["chapter_001"]);
      expect(result.current.candidatesByScenePackId.scene_pack_001).toEqual([candidatePayload("candidate_002")]);
      expect(Object.keys(result.current.chaptersByScenePackId)).toEqual(["scene_pack_001"]);

      await act(async () => {
        await result.current.reorderChapters("scene_pack_001", ["chapter_001"]);
      });
      await act(async () => {
        await result.current.setChapterListLocked("scene_pack_001", true);
      });
      expect(result.current.chaptersByScenePackId.scene_pack_001).toEqual([chapterPayload()]);
      expect(result.current.scenePacks[0].chapterListLocked).toBe(true);

      act(() => {
        result.current.setSelectedPromptVersionId("prompt_version_from_other_chapter");
      });
      await act(async () => {
        await result.current.listPromptVersions("chapter_001");
      });
      expect(result.current.selectedPromptVersionId).toBe("prompt_version_adopted");
      await act(async () => {
        await result.current.createPromptVersion("chapter_001", { feedback: "more readable action" });
      });
      await act(async () => {
        await result.current.duplicatePromptVersion("prompt_version_002");
      });
      expect(result.current.promptVersionsByChapterId.chapter_001.map((version) => version.id)).toEqual([
        "prompt_version_001",
        "prompt_version_adopted",
        "prompt_version_002",
        "prompt_version_003",
      ]);
      expect(result.current.selectedPromptVersionId).toBe("prompt_version_003");
      expect(result.current.promptVersionsByChapterId.chapter_001.find((version) => version.id === "prompt_version_003")?.sourceVersionId).toBe("prompt_version_002");

      await act(async () => {
        await result.current.createImageAttempt("prompt_version_003", "upload_003");
      });
      expect(result.current.imageAttemptsByVersionId.prompt_version_003).toEqual([imageAttemptPayload("prompt_version_003", "upload_003")]);
      expect(result.current.imageAttemptsByVersionId.prompt_version_001).toBeUndefined();
      expect(result.current.asyncStatus["uploadAttempt:prompt_version_003"]?.status).toBe("succeeded");

      expect(calls.map((call) => [call.input, call.init?.method ?? "GET"])).toContainEqual([
        "/api/course-planner/scene-packs/scene_pack_001/chapter-list-lock",
        "PATCH",
      ]);
      expect(JSON.parse(String(calls.find((call) => call.input.endsWith("/chapter-order"))?.init?.body))).toEqual({
        chapterIds: ["chapter_001"],
      });
      expect(JSON.parse(String(calls.find((call) => call.input.endsWith("/chapters") && call.init?.method === "POST")?.init?.body))).toEqual(chapterSeedRequestPayload());
      expect(JSON.parse(String(calls.find((call) => call.input.endsWith("/prompt-versions") && call.init?.method === "POST")?.init?.body))).toEqual({
        feedback: "more readable action",
      });
      expect(JSON.parse(String(calls.find((call) => call.input.endsWith("/image-attempts"))?.init?.body))).toEqual({
        uploadedImageId: "upload_003",
      });
    } finally {
      restoreFetch();
    }
  });
});

function emptyStatePayload() {
  return {
    scenePacks: [snakeScenePack(scenePackPayload())],
    chapters: [snakeChapter(chapterPayload())],
    promptVersions: [snakePromptVersion(promptVersionPayload("prompt_version_initial"))],
    imageAttempts: [snakeImageAttempt(imageAttemptPayload("prompt_version_initial"))],
    tasks: [],
  };
}

function scenePackPayload(): ScenePack {
  return {
    id: "scene_pack_001",
    title: "室内家庭篇",
    intent: "daily home scenes",
    status: "draft",
    chapterIds: [],
    chapterListLocked: false,
  };
}

function candidatePayload(id = "candidate_001"): ChapterCandidate {
  return {
    id,
    scenePackId: "scene_pack_001",
    title: id === "candidate_001" ? "厨房早餐打翻" : "客厅收拾玩具",
    summary: id === "candidate_001" ? "厨房早餐时牛奶打翻。" : "客厅里把玩具放回收纳盒。",
    seed: chapterSeed(id),
  };
}

function chapterPayload(id = "chapter_001"): Chapter {
  const isSecondChapter = id === "chapter_002";
  return {
    id,
    scenePackId: "scene_pack_001",
    title: isSecondChapter ? "客厅收拾玩具" : "厨房早餐打翻",
    summary: isSecondChapter ? "客厅里把玩具放回收纳盒。" : "厨房早餐时牛奶打翻。",
    seed: chapterSeed(id),
    sortOrder: isSecondChapter ? 2 : 1,
    status: "draft",
    adoptedPromptVersionId: isSecondChapter ? "prompt_version_chapter_002_adopted" : null,
  };
}

function chapterSeed(chapterId: string) {
  return {
    scenePackId: "scene_pack_001",
    scenePackTitle: "室内家庭篇",
    chapterId,
    chapterTitle: "厨房早餐打翻",
    chapterIntent: "practice kitchen action",
    sceneDomain: "kitchen",
    eventSeed: "milk spills during breakfast",
    spatialSeed: "small kitchen table near window",
    objectCoverageHint: ["milk cup", "cloth"],
    characterConceptHint: {
      castMode: "main_cast_and_supporting_cast" as const,
      mainCastHint: "main child character",
      constraints: ["no text"],
    },
  };
}

function promptVersionPayload(id: string, chapterId = "chapter_001"): PromptVersion {
  return {
    id,
    chapterId,
    versionLabel: id === "prompt_version_initial" ? "V000" : id === "prompt_version_001" ? "V001" : id === "prompt_version_adopted" ? "V002" : id === "prompt_version_002" ? "V003" : "V004",
    title: "Generated prompt",
    status: "prompt_ready",
    sceneDirectorPlan: sceneDirectorPlan(),
    objectPlan: objectPlan(),
    promptPackage: promptPackage(),
    imageAttemptIds: [],
  };
}

function sceneDirectorPlan() {
  return {
    storyEvent: "Milk spills during breakfast.",
    sceneComposition: "Wide kitchen table shot.",
    spatialStructure: "Window on left, sink behind.",
    characterArrangement: "Main child reaches for cloth.",
    actionDesign: "Wiping spilled milk.",
    styleAndConstraints: "No text, warm storybook style.",
  };
}

function objectPlan() {
  return {
    coreObjects: [{ name: "milk cup", roleInScene: "spilled object", priority: "core" as const }],
    requiredObjects: [],
    recommendedObjects: [],
    avoidOrMoveObjects: [],
  };
}

function promptPackage() {
  return {
    fullPrompt: "Draw a breakfast kitchen scene.",
    negativeConstraints: "No text.",
  };
}

function imageAttemptPayload(promptVersionId = "prompt_version_001", uploadedImageId = "upload_001"): ImageAttempt {
  return {
    id: "image_attempt_001",
    promptVersionId,
    uploadedImageId,
    status: "uploaded",
  };
}

function chapterSeedRequestPayload() {
  const seed = chapterSeed("candidate_001");
  return {
    chapter_title: seed.chapterTitle,
    chapter_intent: seed.chapterIntent,
    scene_domain: seed.sceneDomain,
    event_seed: seed.eventSeed,
    spatial_seed: seed.spatialSeed,
    object_coverage_hint: seed.objectCoverageHint,
    character_concept_hint: snakeCharacterConceptHint(seed.characterConceptHint),
  };
}

function snakeScenePack(pack: ScenePack) {
  return {
    id: pack.id,
    title: pack.title,
    intent: pack.intent,
    notes: pack.notes,
    status: pack.status,
    chapter_ids: pack.chapterIds,
    chapter_list_locked: pack.chapterListLocked,
  };
}

function snakeCandidate(candidate: ChapterCandidate) {
  return {
    id: candidate.id,
    scene_pack_id: candidate.scenePackId,
    title: candidate.title,
    summary: candidate.summary,
    seed: snakeSeed(candidate.seed),
  };
}

function snakeChapter(chapter: Chapter) {
  return {
    id: chapter.id,
    scene_pack_id: chapter.scenePackId,
    title: chapter.title,
    summary: chapter.summary,
    seed: snakeSeed(chapter.seed),
    sort_order: chapter.sortOrder,
    status: chapter.status,
    adopted_prompt_version_id: chapter.adoptedPromptVersionId,
  };
}

function snakeSeed(seed: ChapterSeed) {
  return {
    scene_pack_id: seed.scenePackId,
    scene_pack_title: seed.scenePackTitle,
    chapter_id: seed.chapterId,
    chapter_title: seed.chapterTitle,
    chapter_intent: seed.chapterIntent,
    scene_domain: seed.sceneDomain,
    event_seed: seed.eventSeed,
    spatial_seed: seed.spatialSeed,
    object_coverage_hint: seed.objectCoverageHint,
    character_concept_hint: snakeCharacterConceptHint(seed.characterConceptHint),
  };
}

function snakeCharacterConceptHint(hint: ChapterSeed["characterConceptHint"]) {
  return {
    cast_mode: hint.castMode,
    main_cast_hint: hint.mainCastHint,
    constraints: hint.constraints,
  };
}

function snakePromptVersion(version: PromptVersion) {
  return {
    id: version.id,
    chapter_id: version.chapterId,
    version_label: version.versionLabel,
    title: version.title,
    status: version.status,
    scene_director_plan: toSnakeObject(version.sceneDirectorPlan),
    object_plan: toSnakeObject(version.objectPlan),
    prompt_package: toSnakeObject(version.promptPackage),
    source_version_id: version.sourceVersionId,
    image_attempt_ids: version.imageAttemptIds,
  };
}

function snakeImageAttempt(attempt: ImageAttempt) {
  return {
    id: attempt.id,
    prompt_version_id: attempt.promptVersionId,
    uploaded_image_id: attempt.uploadedImageId,
    status: attempt.status,
  };
}

function toSnakeObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`), item]));
}

function taskPayload() {
  return {
    id: "task_001",
    kind: "generate_chapter_candidates",
    status: "succeeded",
    target: { scene_pack_id: "scene_pack_001" },
    created_at: "2026-06-28T10:00:00Z",
    updated_at: "2026-06-28T10:00:00Z",
    error: null,
  };
}
