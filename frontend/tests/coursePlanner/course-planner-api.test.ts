import {
  describe,
  expect,
  it,
  vi,
} from "../app/appTestHarness";

import {
  acceptChapterCandidate,
  createScenePack,
  deleteChapter,
  deleteChapterCandidate,
  deleteScenePack,
  fetchCoursePlannerState,
  generateChapterCandidates,
  listScenePacks,
  reorderChapters,
  reviseChapterCandidates,
  updateScenePack,
} from "../../src/features/coursePlanner/api";
import {
  candidatePayload,
  chapterPayload,
  chapterSeedRequestPayload,
  responseFor,
  scenePackDraft,
  scenePackPayload,
} from "./coursePlannerApiTestHelpers";

describe("course planner hierarchy API client", () => {
  it("uses hierarchy route paths and keeps frontend contracts camelCase", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input: String(input), init });
      return new Response(JSON.stringify(responseFor(String(input), init)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const state = await fetchCoursePlannerState(fetcher);
    const scenePacks = await listScenePacks(fetcher);
    const createdPack = await createScenePack(scenePackDraft(), fetcher);
    const updatedPack = await updateScenePack("scene_pack_001", { title: "厨房专项" }, fetcher);
    await generateChapterCandidates("scene_pack_001", { feedback: "more breakfast scenes" }, fetcher);
    await reviseChapterCandidates("scene_pack_001", { feedback: "less clutter" }, fetcher);
    await deleteChapterCandidate("candidate_002", fetcher);
    const accepted = await acceptChapterCandidate("scene_pack_001", candidatePayload().seed, fetcher);
    await reorderChapters("scene_pack_001", ["chapter_001"], fetcher);
    await deleteChapter("scene_pack_001", "chapter_001", fetcher);
    const archivedPack = await deleteScenePack("scene_pack_001", fetcher);

    expect(calls.map((call) => [call.input, call.init?.method ?? "GET"])).toEqual([
      ["/api/course-planner/state", "GET"],
      ["/api/course-planner/scene-packs", "GET"],
      ["/api/course-planner/scene-packs", "POST"],
      ["/api/course-planner/scene-packs/scene_pack_001", "PATCH"],
      ["/api/course-planner/scene-packs/scene_pack_001/candidate-batches", "POST"],
      ["/api/course-planner/scene-packs/scene_pack_001/candidate-revisions", "POST"],
      ["/api/course-planner/candidates/candidate_002", "DELETE"],
      ["/api/course-planner/scene-packs/scene_pack_001/chapters", "POST"],
      ["/api/course-planner/scene-packs/scene_pack_001/chapter-order", "PATCH"],
      ["/api/course-planner/scene-packs/scene_pack_001/chapters/chapter_001", "DELETE"],
      ["/api/course-planner/scene-packs/scene_pack_001", "DELETE"],
    ]);
    expect(JSON.parse(String(calls[2].init?.body))).toEqual(scenePackDraft());
    expect(JSON.parse(String(calls[7].init?.body))).toEqual(chapterSeedRequestPayload());
    expect(JSON.parse(String(calls[8].init?.body))).toEqual({ chapterIds: ["chapter_001"] });
    expect(state.scenePacks[0]).toEqual(scenePackPayload());
    expect(state.chaptersByScenePackId.scene_pack_001).toEqual([chapterPayload()]);
    expect(state.scenePacks[0].notes).toBeNull();
    expect(state.chaptersByScenePackId.scene_pack_001[0].seed.dailyMoment).toBeNull();
    expect(state.tasks[0].createdAt).toBe("2026-06-28T10:00:00Z");
    expect(scenePacks).toEqual([scenePackPayload()]);
    expect(createdPack).toEqual(scenePackPayload());
    expect(updatedPack.title).toBe("厨房专项");
    expect(accepted.chapter).toEqual(chapterPayload());
    expect(archivedPack.status).toBe("archived");
  });

  it("throws useful errors from non-2xx JSON detail responses", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ detail: { message: "Scene Pack not found." } }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;

    await expect(listScenePacks(fetcher)).rejects.toThrow("Scene Pack not found.");
  });
});
