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
  setChapterListLocked,
  updateImageAttempt,
  updatePromptVersion,
  updateScenePack,
  uploadImageAttempt,
} from "../../src/features/coursePlanner/api";
import type {
  Chapter,
  ChapterCandidate,
  ChapterSeed,
  CoursePlannerState,
  ImageAttempt,
  PromptVersion,
  ScenePack,
} from "../../src/features/coursePlanner/types";

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
    await setChapterListLocked("scene_pack_001", true, fetcher);
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
      ["/api/course-planner/scene-packs/scene_pack_001/chapter-list-lock", "PATCH"],
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
    expect(JSON.parse(String(calls[9].init?.body))).toEqual({ locked: true });
    expect(JSON.parse(String(calls[12].init?.body))).toEqual({ feedback: "more readable action" });
    expect(JSON.parse(String(calls[19].init?.body))).toEqual({ uploadedImageId: "upload_001" });
    expect(calls[20].init?.body).toBeInstanceOf(FormData);
    expect(JSON.parse(String(calls[22].init?.body))).toEqual({ status: "not_accepted", humanDecision: "delete" });
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

  it("throws useful errors from non-2xx JSON detail responses", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ detail: { message: "Scene Pack not found." } }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;

    await expect(listPromptVersions("missing_chapter", fetcher)).rejects.toThrow("Scene Pack not found.");
  });
});

function responseFor(input: string, init?: RequestInit): unknown {
  if (input.endsWith("/state")) {
    return statePayload();
  }
  if (input.endsWith("/scene-packs") && init?.method === "POST") {
    return { scenePack: snakeScenePack(scenePackPayload()) };
  }
  if (input.endsWith("/scene-packs") && (!init || init.method === "GET")) {
    return { scenePacks: [snakeScenePack(scenePackPayload())] };
  }
  if (input.endsWith("/scene_pack_001") && init?.method === "PATCH") {
    return { scenePack: snakeScenePack({ ...scenePackPayload(), title: "厨房专项" }) };
  }
  if (input.endsWith("/scene_pack_001") && init?.method === "DELETE") {
    return { scenePack: snakeScenePack({ ...scenePackPayload(), status: "archived" }) };
  }
  if (input.endsWith("/candidate-batches") || input.endsWith("/candidate-revisions")) {
    return { candidates: [snakeCandidate(candidatePayload())], candidatePersistence: "ephemeral", task: taskPayload() };
  }
  if (input.includes("/candidates/") && init?.method === "DELETE") {
    return { candidateId: "candidate_002", candidatePersistence: "ephemeral", deleted: true };
  }
  if (input.endsWith("/chapters") && init?.method === "POST") {
    return {
      chapter: snakeChapter(chapterPayload()),
    };
  }
  if (input.endsWith("/chapter-order") || input.endsWith("/chapter-list-lock")) {
    return {
      scenePack: snakeScenePack({
        ...scenePackPayload(),
        chapterIds: ["chapter_001"],
        chapterListLocked: input.endsWith("/chapter-list-lock"),
      }),
    };
  }
  if (input.endsWith("/chapters/chapter_001") && init?.method === "DELETE") {
    return { deletedChapterId: "chapter_001" };
  }
  if (input.endsWith("/prompt-versions") && (!init || init.method === "GET")) {
    return { prompt_versions: [snakePromptVersion(promptVersionPayload())] };
  }
  if (input.endsWith("/prompt-versions") && init?.method === "POST") {
    return { promptVersion: snakePromptVersion(promptVersionPayload()) };
  }
  if (input.endsWith("/duplicate")) {
    return { promptVersion: snakePromptVersion({ ...promptVersionPayload(), id: "prompt_version_002", sourceVersionId: "prompt_version_001" }) };
  }
  if (input.endsWith("/adopt")) {
    return {
      chapter: snakeChapter({ ...chapterPayload(), adoptedPromptVersionId: "prompt_version_001" }),
      promptVersions: [snakePromptVersion({ ...promptVersionPayload(), status: "adopted" })],
    };
  }
  if (input.includes("/prompt-versions/") && init?.method === "PATCH") {
    return { promptVersion: snakePromptVersion({ ...promptVersionPayload(), title: "V001 revised" }) };
  }
  if (input.includes("/prompt-versions/") && init?.method === "DELETE") {
    return { promptVersion: snakePromptVersion({ ...promptVersionPayload(), status: "archived" }) };
  }
  if (input.endsWith("/prompt-package")) {
    return {
      promptPackage: snakePromptPackage(promptPackage()),
      promptVersion: snakePromptVersion({ ...promptVersionPayload(), status: "prompt_ready" }),
    };
  }
  if (input.endsWith("/image-attempts") && (!init || init.method === "GET")) {
    return { image_attempts: [snakeImageAttempt(imageAttemptPayload())] };
  }
  if (input.endsWith("/image-attempts") && init?.method === "POST") {
    return { imageAttempt: snakeImageAttempt(imageAttemptPayload()) };
  }
  if (input.endsWith("/image-attempts/upload") && init?.method === "POST") {
    return { imageAttempt: snakeImageAttempt({ ...imageAttemptPayload(), uploadedImageId: "uploads/course_planner/prompt_version_001/upload.png" }) };
  }
  if (input.endsWith("/review")) {
    return { imageAttempt: snakeImageAttempt({ ...imageAttemptPayload(), status: "ai_reviewed" }) };
  }
  if (input.includes("/image-attempts/") && init?.method === "PATCH") {
    return { imageAttempt: snakeImageAttempt({ ...imageAttemptPayload(), status: "not_accepted", humanDecision: "delete" }) };
  }
  if (input.endsWith("/import")) {
    return {
      runId: "run_001",
      run: { id: "run_001" },
      imageAttempt: snakeImageAttempt({ ...imageAttemptPayload(), status: "imported", pipelineImportId: "run_001" }),
    };
  }
  return null;
}

function statePayload() {
  return {
    scenePacks: [snakeScenePack(scenePackPayload())],
    chapters: [snakeChapter(chapterPayload())],
    promptVersions: [snakePromptVersion(promptVersionPayload())],
    imageAttempts: [snakeImageAttempt(imageAttemptPayload())],
    tasks: [taskPayload()],
  };
}

function scenePackDraft() {
  return { title: "室内家庭篇", intent: "daily home scenes", notes: "warm tone" };
}

function scenePackPayload(): ScenePack {
  return {
    id: "scene_pack_001",
    title: "室内家庭篇",
    intent: "daily home scenes",
    notes: null,
    status: "draft",
    chapterIds: [],
    chapterListLocked: false,
  };
}

function candidatePayload(): ChapterCandidate {
  return {
    id: "candidate_001",
    scenePackId: "scene_pack_001",
    title: "厨房早餐打翻",
    summary: "厨房早餐时牛奶打翻。",
    seed: chapterSeed("candidate_001"),
  };
}

function chapterPayload(): Chapter {
  return {
    id: "chapter_001",
    scenePackId: "scene_pack_001",
    title: "厨房早餐打翻",
    summary: "厨房早餐时牛奶打翻。",
    seed: chapterSeed("chapter_001"),
    sortOrder: 1,
    status: "draft",
    adoptedPromptVersionId: null,
  };
}

function chapterSeed(chapterId: string) {
  return {
    scenePackId: "scene_pack_001",
    scenePackTitle: "室内家庭篇",
    chapterId,
    chapterTitle: "厨房早餐打翻",
    chapterIntent: "practice daily kitchen action",
    sceneDomain: "kitchen",
    dailyMoment: null,
    eventSeed: "milk spills during breakfast",
    spatialSeed: "small kitchen table near window",
    objectCoverageHint: ["milk cup", "table", "cloth"],
    characterConceptHint: {
      castMode: "main_cast_and_supporting_cast" as const,
      mainCastHint: "main child character",
      constraints: ["no text"],
    },
    styleNotes: null,
  };
}

function promptVersionPayload(): PromptVersion {
  return {
    id: "prompt_version_001",
    chapterId: "chapter_001",
    versionLabel: "V001",
    title: "V001",
    status: "prompt_ready",
    sceneDirectorPlan: sceneDirectorPlan(),
    objectPlan: objectPlan(),
    promptPackage: promptPackage(),
    sourceVersionId: null,
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
    shortPrompt: null,
    negativeConstraints: "No text.",
    revisionPrompt: null,
  };
}

function imageAttemptPayload(): ImageAttempt {
  return {
    id: "image_attempt_001",
    promptVersionId: "prompt_version_001",
    uploadedImageId: "upload_001",
    status: "uploaded",
    aiReview: {
      summary: "Composition needs revision.",
      strengths: [],
      issues: ["Missing core object"],
      recommendation: "reject",
    },
    humanDecision: null,
    pipelineImportId: null,
  };
}

function chapterSeedRequestPayload() {
  const seed = chapterSeed("candidate_001");
  return {
    chapter_title: seed.chapterTitle,
    chapter_intent: seed.chapterIntent,
    scene_domain: seed.sceneDomain,
    daily_moment: seed.dailyMoment,
    event_seed: seed.eventSeed,
    spatial_seed: seed.spatialSeed,
    object_coverage_hint: seed.objectCoverageHint,
    character_concept_hint: snakeCharacterConceptHint(seed.characterConceptHint),
    style_notes: seed.styleNotes,
  };
}

function snakeScenePack(pack: ScenePack) {
  return {
    ...pack,
    chapter_ids: pack.chapterIds,
    chapter_list_locked: pack.chapterListLocked,
    chapterIds: undefined,
    chapterListLocked: undefined,
  };
}

function snakeCandidate(candidate: ChapterCandidate) {
  return { ...candidate, scene_pack_id: candidate.scenePackId, seed: snakeSeed(candidate.seed), scenePackId: undefined };
}

function snakeChapter(chapter: Chapter) {
  return {
    ...chapter,
    scene_pack_id: chapter.scenePackId,
    sort_order: chapter.sortOrder,
    adopted_prompt_version_id: chapter.adoptedPromptVersionId,
    seed: snakeSeed(chapter.seed),
    scenePackId: undefined,
    sortOrder: undefined,
    adoptedPromptVersionId: undefined,
  };
}

function snakeSeed(seed: ChapterSeed) {
  return {
    ...seed,
    scene_pack_id: seed.scenePackId,
    scene_pack_title: seed.scenePackTitle,
    chapter_id: seed.chapterId,
    chapter_title: seed.chapterTitle,
    chapter_intent: seed.chapterIntent,
    scene_domain: seed.sceneDomain,
    daily_moment: seed.dailyMoment,
    event_seed: seed.eventSeed,
    spatial_seed: seed.spatialSeed,
    object_coverage_hint: seed.objectCoverageHint,
    character_concept_hint: snakeCharacterConceptHint(seed.characterConceptHint),
    style_notes: seed.styleNotes,
  };
}

function snakeCharacterConceptHint(hint: ChapterSeed["characterConceptHint"]) {
  return {
    cast_mode: hint.castMode,
    main_cast_hint: hint.mainCastHint,
    supporting_cast_hint: hint.supportingCastHint,
    reference_asset_ids: hint.referenceAssetIds,
    constraints: hint.constraints,
  };
}

function snakePromptVersion(version: PromptVersion) {
  return {
    ...version,
    chapter_id: version.chapterId,
    version_label: version.versionLabel,
    scene_director_plan: toSnakeObject(version.sceneDirectorPlan),
    object_plan: toSnakeObject(version.objectPlan),
    prompt_package: toSnakeObject(version.promptPackage),
    source_version_id: version.sourceVersionId,
    image_attempt_ids: version.imageAttemptIds,
  };
}

function snakePromptPackage(packagePayload: ReturnType<typeof promptPackage>) {
  return {
    full_prompt: packagePayload.fullPrompt,
    short_prompt: packagePayload.shortPrompt,
    negative_constraints: packagePayload.negativeConstraints,
    revision_prompt: packagePayload.revisionPrompt,
  };
}

function snakeImageAttempt(attempt: ImageAttempt) {
  return {
    ...attempt,
    prompt_version_id: attempt.promptVersionId,
    uploaded_image_id: attempt.uploadedImageId,
    ai_review: attempt.aiReview && toSnakeObject(attempt.aiReview),
    human_decision: attempt.humanDecision,
    pipeline_import_id: attempt.pipelineImportId,
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
