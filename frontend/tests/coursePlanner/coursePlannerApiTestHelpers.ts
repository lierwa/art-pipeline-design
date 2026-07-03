import type {
  Chapter,
  ChapterCandidate,
  ChapterSeed,
  ScenePack,
} from "../../src/features/coursePlanner/types";

export function responseFor(input: string, init?: RequestInit): unknown {
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
    return { chapter: snakeChapter(chapterPayload()) };
  }
  if (input.endsWith("/chapter-order")) {
    return {
      scenePack: snakeScenePack({
        ...scenePackPayload(),
        chapterIds: ["chapter_001"],
      }),
    };
  }
  if (input.endsWith("/chapters/chapter_001") && init?.method === "DELETE") {
    return { deletedChapterId: "chapter_001" };
  }
  return null;
}

export function statePayload() {
  return {
    scenePacks: [snakeScenePack(scenePackPayload())],
    chapters: [snakeChapter(chapterPayload())],
    tasks: [taskPayload()],
  };
}

export function scenePackDraft() {
  return { title: "室内家庭篇", intent: "daily home scenes", notes: "warm tone" };
}

export function scenePackPayload(): ScenePack {
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

export function candidatePayload(): ChapterCandidate {
  return {
    id: "candidate_001",
    scenePackId: "scene_pack_001",
    title: "厨房早餐打翻",
    summary: "厨房早餐时牛奶打翻。",
    seed: chapterSeed("candidate_001"),
  };
}

export function chapterPayload(): Chapter {
  return {
    id: "chapter_001",
    scenePackId: "scene_pack_001",
    title: "厨房早餐打翻",
    summary: "厨房早餐时牛奶打翻。",
    seed: chapterSeed("chapter_001"),
    sortOrder: 1,
    status: "draft",
  };
}

export function chapterSeed(chapterId: string) {
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

export function chapterSeedRequestPayload() {
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

export function snakeScenePack(pack: ScenePack) {
  return {
    ...pack,
    chapter_ids: pack.chapterIds,
    chapter_list_locked: pack.chapterListLocked,
    chapterIds: undefined,
    chapterListLocked: undefined,
  };
}

export function snakeCandidate(candidate: ChapterCandidate) {
  return { ...candidate, scene_pack_id: candidate.scenePackId, seed: snakeSeed(candidate.seed), scenePackId: undefined };
}

export function snakeChapter(chapter: Chapter) {
  return {
    ...chapter,
    scene_pack_id: chapter.scenePackId,
    sort_order: chapter.sortOrder,
    seed: snakeSeed(chapter.seed),
    scenePackId: undefined,
    sortOrder: undefined,
  };
}

export function snakeSeed(seed: ChapterSeed) {
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

export function snakeCharacterConceptHint(hint: ChapterSeed["characterConceptHint"]) {
  return {
    cast_mode: hint.castMode,
    main_cast_hint: hint.mainCastHint,
    supporting_cast_hint: hint.supportingCastHint,
    reference_asset_ids: hint.referenceAssetIds,
    constraints: hint.constraints,
  };
}

export function taskPayload() {
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
