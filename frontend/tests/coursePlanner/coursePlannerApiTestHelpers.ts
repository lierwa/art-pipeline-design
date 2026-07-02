import type {
  Chapter,
  ChapterCandidate,
  ChapterSeed,
  CoursePlannerState,
  ImageAttempt,
  PromptVersion,
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
    return {
      chapter: snakeChapter(chapterPayload()),
    };
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

export function statePayload() {
  return {
    scenePacks: [snakeScenePack(scenePackPayload())],
    chapters: [snakeChapter(chapterPayload())],
    promptVersions: [snakePromptVersion(promptVersionPayload())],
    imageAttempts: [snakeImageAttempt(imageAttemptPayload())],
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
    adoptedPromptVersionId: null,
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

export function promptVersionPayload(): PromptVersion {
  return {
    id: "prompt_version_001",
    chapterId: "chapter_001",
    versionLabel: "V001",
    title: "V001",
    status: "prompt_ready",
    sceneDirectorPlan: sceneDirectorPlan(),
    castBindings: castBindings(),
    sceneVocabulary: sceneVocabulary(),
    promptTuning: promptTuning(),
    objectPlan: objectPlan(),
    promptPackage: promptPackage(),
    sourceVersionId: null,
    imageAttemptIds: [],
  };
}

export function sceneDirectorPlan() {
  return {
    storyEvent: "Milk spills during breakfast.",
    sceneComposition: "Wide kitchen table shot.",
    spatialStructure: "Window on left, sink behind.",
    characterArrangement: "Tuantuan reaches for cloth while Abu watches the cup.",
    actionDesign: "Wiping spilled milk.",
    styleAndConstraints: "No text, warm storybook style.",
  };
}

export function castBindings() {
  return [
    {
      characterId: "tuantuan",
      displayName: "团团",
      roleInScene: "main" as const,
      actionIntent: "Reaches for cloth near the spilled milk.",
      referenceImageIds: ["docs/image-reference/01_主方向_生活化猫咪主角团.png"],
      invariants: ["white fluffy cat", "yellow bag"],
    },
  ];
}

export function sceneVocabulary() {
  return {
    narrativeAnchors: ["milk cup"],
    optionalVocabularyCandidates: ["cloth", "table", "window"],
    ambientFurnishingPolicy: "Add natural kitchen details only when they support the story moment.",
    avoidObjects: ["knife"],
  };
}

export function promptTuning() {
  return {
    styleAnchor: "No text, warm storybook style.",
    styleReferenceImageIds: ["docs/image-reference/01_主方向_生活化猫咪主角团.png"],
    sceneReferenceImageIds: [],
    mustKeep: ["cat IP cast"],
    avoid: ["object catalog layout"],
  };
}

export function objectPlan() {
  return {
    coreObjects: [{ name: "milk cup", roleInScene: "spilled object", priority: "core" as const }],
    requiredObjects: [],
    recommendedObjects: [],
    avoidOrMoveObjects: [],
  };
}

export function promptPackage() {
  return {
    fullPrompt: "Draw a breakfast kitchen scene.",
    shortPrompt: null,
    negativeConstraints: "No text.",
    revisionPrompt: null,
  };
}

export function imageAttemptPayload(): ImageAttempt {
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
    adopted_prompt_version_id: chapter.adoptedPromptVersionId,
    seed: snakeSeed(chapter.seed),
    scenePackId: undefined,
    sortOrder: undefined,
    adoptedPromptVersionId: undefined,
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

export function snakePromptVersion(version: PromptVersion) {
  return {
    ...version,
    chapter_id: version.chapterId,
    version_label: version.versionLabel,
    scene_director_plan: toSnakeObject(version.sceneDirectorPlan),
    cast_bindings: version.castBindings.map(toSnakeObject),
    scene_vocabulary: toSnakeObject(version.sceneVocabulary),
    prompt_tuning: toSnakeObject(version.promptTuning),
    object_plan: toSnakeObject(version.objectPlan),
    prompt_package: toSnakeObject(version.promptPackage),
    source_version_id: version.sourceVersionId,
    image_attempt_ids: version.imageAttemptIds,
  };
}

export function snakePromptVersionWithoutSceneVocabulary(version: PromptVersion) {
  const payload = { ...snakePromptVersion(version) } as Record<string, unknown>;
  delete payload.sceneVocabulary;
  delete payload.scene_vocabulary;
  return payload;
}

export function snakePromptPackage(packagePayload: ReturnType<typeof promptPackage>) {
  return {
    full_prompt: packagePayload.fullPrompt,
    short_prompt: packagePayload.shortPrompt,
    negative_constraints: packagePayload.negativeConstraints,
    revision_prompt: packagePayload.revisionPrompt,
  };
}

export function snakeImageAttempt(attempt: ImageAttempt) {
  return {
    ...attempt,
    prompt_version_id: attempt.promptVersionId,
    uploaded_image_id: attempt.uploadedImageId,
    ai_review: attempt.aiReview && toSnakeObject(attempt.aiReview),
    human_decision: attempt.humanDecision,
    pipeline_import_id: attempt.pipelineImportId,
  };
}

export function toSnakeObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`), item]));
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
