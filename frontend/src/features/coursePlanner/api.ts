import type {
  Chapter,
  ChapterCandidate,
  ChapterSeed,
  CoursePlannerState,
  ImageAttempt,
  PromptPackage,
  PromptVersion,
  ScenePack,
} from "./types";
import {
  API_ROOT,
  arrayFromPayload,
  encodePathPart,
  jsonRequest,
  payloadValue,
  requestJson,
  requestVoid,
  toCamel,
  toSnake,
} from "./apiClient";
import type { CoursePlannerFetcher } from "./apiClient";

export type { CoursePlannerFetcher } from "./apiClient";
export type {
  BaseCandidateUploadInput,
  ChapterAssetUploadInput,
  ChapterScenePromptInput,
  ChapterScenePromptTargetObjectInput,
  CompleteImageUploadInput,
  ReferenceUploadInput,
  RunAssociationInput,
} from "./scenePackageApi";
export {
  associateCompleteImageRun,
  fetchChapterScenePackage,
  lockEmptyBaseScene,
  saveChapterSceneAssembly,
  updateChapterScenePrompt,
  uploadChapterAssetFromRunAsset,
  uploadChapterSceneReference,
  uploadCompleteSceneImage,
  uploadEmptyBaseSceneCandidate,
} from "./scenePackageApi";

export type CreateScenePackRequest = Pick<ScenePack, "title" | "intent" | "notes">;
export type UpdateScenePackRequest = Partial<Pick<ScenePack, "title" | "intent" | "notes" | "status">>;
export type GenerateChapterCandidatesRequest = { feedback?: string };
export type PromptVersionCreateRequest = { feedback?: string; sourceVersionId?: string };
export type PromptVersionAdoptResponse = { chapter: Chapter; promptVersions: PromptVersion[] };
export type ImageAttemptPatchRequest = Partial<Pick<ImageAttempt, "status" | "humanDecision">>;

export type AcceptChapterCandidateResponse = {
  chapter: Chapter;
};

export type ChapterListResponse = {
  scenePack: ScenePack;
};

export async function fetchCoursePlannerState(fetcher: CoursePlannerFetcher = fetch): Promise<CoursePlannerState> {
  return normalizeState(await requestJson(fetcher, `${API_ROOT}/state`, { method: "GET" }, "Could not load Course Planner state."));
}

export async function listScenePacks(fetcher: CoursePlannerFetcher = fetch): Promise<ScenePack[]> {
  const payload = toCamel(await requestJson(fetcher, `${API_ROOT}/scene-packs`, { method: "GET" }, "Could not list Scene Packs."));
  return arrayFromPayload<ScenePack>(payload, "scenePacks");
}

export async function createScenePack(
  request: CreateScenePackRequest,
  fetcher: CoursePlannerFetcher = fetch,
): Promise<ScenePack> {
  const payload = toCamel(await requestJson(fetcher, `${API_ROOT}/scene-packs`, jsonRequest("POST", request), "Could not create Scene Pack."));
  return payloadValue<ScenePack>(payload, "scenePack");
}

export async function updateScenePack(
  scenePackId: string,
  request: UpdateScenePackRequest,
  fetcher: CoursePlannerFetcher = fetch,
): Promise<ScenePack> {
  const payload = toCamel(await requestJson(fetcher, scenePackPath(scenePackId), jsonRequest("PATCH", request), "Could not update Scene Pack."));
  return payloadValue<ScenePack>(payload, "scenePack");
}

export async function deleteScenePack(scenePackId: string, fetcher: CoursePlannerFetcher = fetch): Promise<ScenePack> {
  const payload = toCamel(await requestJson(fetcher, scenePackPath(scenePackId), { method: "DELETE" }, "Could not delete Scene Pack."));
  return payloadValue<ScenePack>(payload, "scenePack");
}

export async function generateChapterCandidates(
  scenePackId: string,
  request: GenerateChapterCandidatesRequest = {},
  fetcher: CoursePlannerFetcher = fetch,
): Promise<ChapterCandidate[]> {
  const payload = toCamel(await requestJson(fetcher, `${scenePackPath(scenePackId)}/candidate-batches`, jsonRequest("POST", request), "Could not generate Chapter candidates."));
  return arrayFromPayload<ChapterCandidate>(payload, "candidates");
}

export async function reviseChapterCandidates(
  scenePackId: string,
  request: GenerateChapterCandidatesRequest,
  fetcher: CoursePlannerFetcher = fetch,
): Promise<ChapterCandidate[]> {
  const payload = toCamel(await requestJson(fetcher, `${scenePackPath(scenePackId)}/candidate-revisions`, jsonRequest("POST", request), "Could not revise Chapter candidates."));
  return arrayFromPayload<ChapterCandidate>(payload, "candidates");
}

export function deleteChapterCandidate(
  candidateId: string,
  fetcher: CoursePlannerFetcher = fetch,
): Promise<void> {
  return requestVoid(fetcher, `${API_ROOT}/candidates/${encodePathPart(candidateId)}`, { method: "DELETE" }, "Could not delete Chapter candidate.");
}

export async function acceptChapterCandidate(
  scenePackId: string,
  seed: ChapterSeed,
  fetcher: CoursePlannerFetcher = fetch,
): Promise<AcceptChapterCandidateResponse> {
  return toCamel(await requestJson(fetcher, `${scenePackPath(scenePackId)}/chapters`, jsonRequest("POST", chapterSeedRequest(seed)), "Could not accept Chapter candidate.")) as AcceptChapterCandidateResponse;
}

export async function reorderChapters(
  scenePackId: string,
  chapterIds: string[],
  fetcher: CoursePlannerFetcher = fetch,
): Promise<ChapterListResponse> {
  return toCamel(await requestJson(fetcher, `${scenePackPath(scenePackId)}/chapter-order`, jsonRequest("PATCH", { chapterIds }), "Could not reorder Chapters.")) as ChapterListResponse;
}

export function deleteChapter(scenePackId: string, chapterId: string, fetcher: CoursePlannerFetcher = fetch): Promise<void> {
  return requestVoid(fetcher, `${scenePackPath(scenePackId)}/chapters/${encodePathPart(chapterId)}`, { method: "DELETE" }, "Could not delete Chapter.");
}

export async function listPromptVersions(chapterId: string, fetcher: CoursePlannerFetcher = fetch): Promise<PromptVersion[]> {
  const payload = toCamel(await requestJson(fetcher, `${chapterPath(chapterId)}/prompt-versions`, { method: "GET" }, "Could not list Prompt Versions."));
  return arrayFromPayload<PromptVersion>(payload, "promptVersions");
}

export async function createPromptVersion(chapterId: string, request: PromptVersionCreateRequest = {}, fetcher: CoursePlannerFetcher = fetch): Promise<PromptVersion> {
  const payload = toCamel(await requestJson(fetcher, `${chapterPath(chapterId)}/prompt-versions`, jsonRequest("POST", request), "Could not create Prompt Version."));
  return payloadValue<PromptVersion>(payload, "promptVersion");
}

export async function duplicatePromptVersion(versionId: string, fetcher: CoursePlannerFetcher = fetch): Promise<PromptVersion> {
  const payload = toCamel(await requestJson(fetcher, `${promptVersionPath(versionId)}/duplicate`, { method: "POST" }, "Could not duplicate Prompt Version."));
  return payloadValue<PromptVersion>(payload, "promptVersion");
}

export async function adoptPromptVersion(
  chapterId: string,
  versionId: string,
  fetcher: CoursePlannerFetcher = fetch,
): Promise<PromptVersionAdoptResponse> {
  return toCamel(await requestJson(
    fetcher,
    `${chapterPath(chapterId)}/prompt-versions/${encodePathPart(versionId)}/adopt`,
    { method: "POST" },
    "Could not adopt Prompt Version.",
  )) as PromptVersionAdoptResponse;
}

export async function updatePromptVersion(versionId: string, patch: Partial<PromptVersion>, fetcher: CoursePlannerFetcher = fetch): Promise<PromptVersion> {
  const payload = toCamel(await requestJson(fetcher, promptVersionPath(versionId), jsonRequest("PATCH", toSnake(patch)), "Could not update Prompt Version."));
  return payloadValue<PromptVersion>(payload, "promptVersion");
}

export async function deletePromptVersion(versionId: string, fetcher: CoursePlannerFetcher = fetch): Promise<PromptVersion> {
  const payload = toCamel(await requestJson(fetcher, promptVersionPath(versionId), { method: "DELETE" }, "Could not delete Prompt Version."));
  return payloadValue<PromptVersion>(payload, "promptVersion");
}

export async function generatePromptPackage(versionId: string, fetcher: CoursePlannerFetcher = fetch): Promise<PromptVersion> {
  const payload = toCamel(await requestJson(fetcher, `${promptVersionPath(versionId)}/prompt-package`, { method: "POST" }, "Could not generate Prompt Package."));
  return payloadValue<PromptVersion>(payload, "promptVersion");
}

export async function createImageAttempt(versionId: string, uploadedImageId: string, fetcher: CoursePlannerFetcher = fetch): Promise<ImageAttempt> {
  const payload = toCamel(await requestJson(fetcher, `${promptVersionPath(versionId)}/image-attempts`, jsonRequest("POST", { uploadedImageId }), "Could not create Image Attempt."));
  return payloadValue<ImageAttempt>(payload, "imageAttempt");
}

export async function uploadImageAttempt(versionId: string, file: File, fetcher: CoursePlannerFetcher = fetch): Promise<ImageAttempt> {
  const body = new FormData();
  body.append("file", file);
  const payload = toCamel(await requestJson(
    fetcher,
    `${promptVersionPath(versionId)}/image-attempts/upload`,
    { method: "POST", body },
    "Could not upload Image Attempt.",
  ));
  return payloadValue<ImageAttempt>(payload, "imageAttempt");
}

export async function listImageAttempts(versionId: string, fetcher: CoursePlannerFetcher = fetch): Promise<ImageAttempt[]> {
  const payload = toCamel(await requestJson(fetcher, `${promptVersionPath(versionId)}/image-attempts`, { method: "GET" }, "Could not list Image Attempts."));
  return arrayFromPayload<ImageAttempt>(payload, "imageAttempts");
}

export async function reviewImageAttempt(attemptId: string, fetcher: CoursePlannerFetcher = fetch): Promise<ImageAttempt> {
  const payload = toCamel(await requestJson(fetcher, `${imageAttemptPath(attemptId)}/review`, { method: "POST" }, "Could not review Image Attempt."));
  return payloadValue<ImageAttempt>(payload, "imageAttempt");
}

export async function updateImageAttempt(attemptId: string, patch: ImageAttemptPatchRequest, fetcher: CoursePlannerFetcher = fetch): Promise<ImageAttempt> {
  const payload = toCamel(await requestJson(fetcher, imageAttemptPath(attemptId), jsonRequest("PATCH", patch), "Could not update Image Attempt."));
  return payloadValue<ImageAttempt>(payload, "imageAttempt");
}

export async function importImageAttempt(attemptId: string, fetcher: CoursePlannerFetcher = fetch): Promise<ImageAttempt> {
  const payload = toCamel(await requestJson(fetcher, `${imageAttemptPath(attemptId)}/import`, { method: "POST" }, "Could not import Image Attempt."));
  return payloadValue<ImageAttempt>(payload, "imageAttempt");
}

function normalizeState(payload: unknown): CoursePlannerState {
  const state = toCamel(payload) as Partial<CoursePlannerState>;
  const scenePacks = state.scenePacks ?? [];
  const chapters = arrayFromPayload<Chapter>(state, "chapters");
  const promptVersions = arrayFromPayload<PromptVersion>(state, "promptVersions").map(normalizePromptVersion);
  const imageAttempts = arrayFromPayload<ImageAttempt>(state, "imageAttempts");
  return {
    scenePacks,
    activeScenePackId: state.activeScenePackId ?? scenePacks[0]?.id ?? null,
    candidatesByScenePackId: state.candidatesByScenePackId ?? {},
    chaptersByScenePackId: state.chaptersByScenePackId ?? groupBy(chapters, (chapter) => chapter.scenePackId, orderedChapters),
    promptVersionsByChapterId: normalizePromptVersionsByChapterId(state.promptVersionsByChapterId) ?? groupBy(promptVersions, (version) => version.chapterId),
    imageAttemptsByVersionId: state.imageAttemptsByVersionId ?? groupBy(imageAttempts, (attempt) => attempt.promptVersionId),
    selectedChapterId: state.selectedChapterId ?? null,
    selectedPromptVersionId: state.selectedPromptVersionId ?? null,
    asyncStatus: state.asyncStatus ?? {},
    tasks: state.tasks ?? [],
  };
}

function normalizePromptVersionsByChapterId(value: CoursePlannerState["promptVersionsByChapterId"] | undefined): CoursePlannerState["promptVersionsByChapterId"] | undefined {
  if (!value) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(value).map(([chapterId, versions]) => [
      chapterId,
      versions.map(normalizePromptVersion),
    ]),
  );
}

function normalizePromptVersion(version: PromptVersion): PromptVersion {
  return {
    ...version,
    castBindings: version.castBindings ?? [],
    sceneVocabulary: version.sceneVocabulary ?? emptySceneVocabulary(),
    promptTuning: version.promptTuning ?? {
      styleAnchor: version.sceneDirectorPlan?.styleAndConstraints ?? "",
      styleReferenceImageIds: [],
      sceneReferenceImageIds: [],
      mustKeep: [],
      avoid: [],
    },
    objectPlan: version.objectPlan ?? {
      coreObjects: [],
      requiredObjects: [],
      recommendedObjects: [],
      avoidOrMoveObjects: [],
    },
  };
}

function emptySceneVocabulary(): PromptVersion["sceneVocabulary"] {
  // WHY: 02 中栏预览以 scene-first vocabulary 为单一事实源；缺失该字段时宁可显式留空，也不能把 legacy objectPlan 误投影成新的叙事词真相。
  return {
    narrativeAnchors: [],
    optionalVocabularyCandidates: [],
    ambientFurnishingPolicy: "",
    avoidObjects: [],
  };
}

function groupBy<T>(
  items: T[],
  keyOf: (item: T) => string,
  normalize: (items: T[]) => T[] = (grouped) => grouped,
): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((groups, item) => {
    const key = keyOf(item);
    groups[key] = [...(groups[key] ?? []), item];
    groups[key] = normalize(groups[key]);
    return groups;
  }, {});
}

function orderedChapters(chapters: Chapter[]): Chapter[] {
  return [...chapters].sort((left, right) => left.sortOrder - right.sortOrder);
}

function chapterSeedRequest(seed: ChapterSeed) {
  return {
    chapter_title: seed.chapterTitle,
    chapter_intent: seed.chapterIntent,
    scene_domain: seed.sceneDomain,
    daily_moment: seed.dailyMoment,
    event_seed: seed.eventSeed,
    spatial_seed: seed.spatialSeed,
    object_coverage_hint: seed.objectCoverageHint,
    character_concept_hint: toSnake(seed.characterConceptHint),
    style_notes: seed.styleNotes,
  };
}

function scenePackPath(scenePackId: string): string {
  return `${API_ROOT}/scene-packs/${encodePathPart(scenePackId)}`;
}

function chapterPath(chapterId: string): string {
  return `${API_ROOT}/chapters/${encodePathPart(chapterId)}`;
}

function promptVersionPath(versionId: string): string {
  return `${API_ROOT}/prompt-versions/${encodePathPart(versionId)}`;
}

function imageAttemptPath(attemptId: string): string {
  return `${API_ROOT}/image-attempts/${encodePathPart(attemptId)}`;
}

export type { PromptPackage };
