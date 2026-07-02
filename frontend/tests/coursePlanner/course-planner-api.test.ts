import {
  describe,
  expect,
  it,
  vi,
} from "../app/appTestHarness";

import {
  acceptChapterCandidate,
  createImageAttempt,
  createPromptVersion,
  createScenePack,
  deleteChapter,
  deleteChapterCandidate,
  deletePromptVersion,
  deleteScenePack,
  duplicatePromptVersion,
  fetchCoursePlannerState,
  generateChapterCandidates,
  generatePromptPackage,
  importImageAttempt,
  listImageAttempts,
  listPromptVersions,
  listScenePacks,
  adoptPromptVersion,
  reorderChapters,
  reviewImageAttempt,
  reviseChapterCandidates,
  updateImageAttempt,
  updatePromptVersion,
  updateScenePack,
  uploadImageAttempt,
} from "../../src/features/coursePlanner/api";
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
    await listPromptVersions("chapter_001", fetcher);
    await createPromptVersion("chapter_001", { feedback: "more readable action" }, fetcher);
    await duplicatePromptVersion("prompt_version_001", fetcher);
    await adoptPromptVersion("chapter_001", "prompt_version_001", fetcher);
    await updatePromptVersion("prompt_version_001", { title: "V001 revised" }, fetcher);
    const archivedVersion = await deletePromptVersion("prompt_version_001", fetcher);
    await generatePromptPackage("prompt_version_001", fetcher);
    await listImageAttempts("prompt_version_001", fetcher);
    await createImageAttempt("prompt_version_001", "upload_001", fetcher);
    await uploadImageAttempt("prompt_version_001", new File(["image"], "upload.png", { type: "image/png" }), fetcher);
    await reviewImageAttempt("image_attempt_001", fetcher);
    await updateImageAttempt("image_attempt_001", { status: "not_accepted", humanDecision: "delete" }, fetcher);
    await importImageAttempt("image_attempt_001", fetcher);
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
      ["/api/course-planner/chapters/chapter_001/prompt-versions", "GET"],
      ["/api/course-planner/chapters/chapter_001/prompt-versions", "POST"],
      ["/api/course-planner/prompt-versions/prompt_version_001/duplicate", "POST"],
      ["/api/course-planner/chapters/chapter_001/prompt-versions/prompt_version_001/adopt", "POST"],
      ["/api/course-planner/prompt-versions/prompt_version_001", "PATCH"],
      ["/api/course-planner/prompt-versions/prompt_version_001", "DELETE"],
      ["/api/course-planner/prompt-versions/prompt_version_001/prompt-package", "POST"],
      ["/api/course-planner/prompt-versions/prompt_version_001/image-attempts", "GET"],
      ["/api/course-planner/prompt-versions/prompt_version_001/image-attempts", "POST"],
      ["/api/course-planner/prompt-versions/prompt_version_001/image-attempts/upload", "POST"],
      ["/api/course-planner/image-attempts/image_attempt_001/review", "POST"],
      ["/api/course-planner/image-attempts/image_attempt_001", "PATCH"],
      ["/api/course-planner/image-attempts/image_attempt_001/import", "POST"],
      ["/api/course-planner/scene-packs/scene_pack_001", "DELETE"],
    ]);
    expect(JSON.parse(String(calls[2].init?.body))).toEqual(scenePackDraft());
    expect(JSON.parse(String(calls[7].init?.body))).toEqual(chapterSeedRequestPayload());
    expect(JSON.parse(String(calls[8].init?.body))).toEqual({ chapterIds: ["chapter_001"] });
    expect(JSON.parse(String(calls[11].init?.body))).toEqual({ feedback: "more readable action" });
    expect(JSON.parse(String(calls[18].init?.body))).toEqual({ uploadedImageId: "upload_001" });
    expect(calls[19].init?.body).toBeInstanceOf(FormData);
    expect(JSON.parse(String(calls[21].init?.body))).toEqual({ status: "not_accepted", humanDecision: "delete" });
    expect(state.scenePacks[0]).toEqual(scenePackPayload());
    expect(state.chaptersByScenePackId.scene_pack_001).toEqual([chapterPayload()]);
    expect(state.promptVersionsByChapterId.chapter_001).toEqual([promptVersionPayload()]);
    expect(state.imageAttemptsByVersionId.prompt_version_001).toEqual([imageAttemptPayload()]);
    expect(state.scenePacks[0].notes).toBeNull();
    expect(state.chaptersByScenePackId.scene_pack_001[0].adoptedPromptVersionId).toBeNull();
    expect(state.chaptersByScenePackId.scene_pack_001[0].seed.dailyMoment).toBeNull();
    expect(state.promptVersionsByChapterId.chapter_001[0].sourceVersionId).toBeNull();
    expect(state.promptVersionsByChapterId.chapter_001[0].promptPackage.shortPrompt).toBeNull();
    expect(state.imageAttemptsByVersionId.prompt_version_001[0].humanDecision).toBeNull();
    expect(state.tasks[0].createdAt).toBe("2026-06-28T10:00:00Z");
    expect(scenePacks).toEqual([scenePackPayload()]);
    expect(createdPack).toEqual(scenePackPayload());
    expect(updatedPack.title).toBe("厨房专项");
    expect(accepted.chapter).toEqual(chapterPayload());
    expect(archivedVersion.status).toBe("archived");
    expect(archivedPack.status).toBe("archived");
  });

  it("keeps scene-first vocabulary empty when backend prompt version omits sceneVocabulary but still sends legacy objectPlan", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({
        scene_packs: [snakeScenePack(scenePackPayload())],
        chapters: [snakeChapter(chapterPayload())],
        prompt_versions: [snakePromptVersionWithoutSceneVocabulary(promptVersionPayload())],
        image_attempts: [],
        tasks: [],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;

    const state = await fetchCoursePlannerState(fetcher);

    expect(state.promptVersionsByChapterId.chapter_001[0].sceneVocabulary).toEqual({
      narrativeAnchors: [],
      optionalVocabularyCandidates: [],
      ambientFurnishingPolicy: "",
      avoidObjects: [],
    });
  });

  it("throws useful errors from non-2xx JSON detail responses", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ detail: { message: "Scene Pack not found." } }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;

    await expect(listPromptVersions("missing_chapter", fetcher)).rejects.toThrow("Scene Pack not found.");
  });
});
import {
  candidatePayload,
  chapterPayload,
  chapterSeedRequestPayload,
  imageAttemptPayload,
  promptVersionPayload,
  responseFor,
  scenePackDraft,
  scenePackPayload,
  snakeChapter,
  snakePromptVersionWithoutSceneVocabulary,
  snakeScenePack,
} from "./coursePlannerApiTestHelpers";
