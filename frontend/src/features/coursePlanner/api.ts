import type {
  Chapter,
  ChapterCandidate,
  ChapterSeed,
  CoursePlannerState,
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
  CompleteImageUploadInput,
  CompleteImageImportResult,
  DirectChapterAssetUploadInput,
  EmptySceneImageUploadInput,
  GenerateChapterPromptPackageInput,
  GenerateChapterPromptPackageResult,
  GeneratedChapterAssetMaterializeInput,
  GeneratedChapterAssetMaterializeResult,
  GlobalLibraryCreateInput,
  GlobalLibraryUpdateInput,
} from "./scenePackageApi";
export {
  characterModelSheetUrl,
  clearChapterSceneStyleReference,
  createCharacterIp,
  createSceneStyleReference,
  deleteCharacterIp,
  deleteCompleteSceneImage,
  deleteChapterAsset,
  deleteSceneStyleReference,
  duplicateChapterAsset,
  fetchChapterScenePackage,
  generateChapterPromptPackage,
  importCompleteSceneImageToPipeline,
  listGeneratedChapterAssets,
  listCharacterIps,
  listSceneStyleReferences,
  lockFinalChapterScene,
  materializeGeneratedChapterAsset,
  saveChapterSceneAssembly,
  selectEmptySceneImage,
  sceneStyleReferenceImageUrl,
  selectChapterSceneStyleReference,
  updateChapterCastSelection,
  uploadCompleteSceneImage,
  uploadDirectChapterAsset,
  uploadEmptySceneImage,
  updateCharacterIp,
  updateSceneStyleReference,
} from "./scenePackageApi";

export type CreateScenePackRequest = Pick<ScenePack, "title" | "intent" | "notes">;
export type UpdateScenePackRequest = Partial<Pick<ScenePack, "title" | "intent" | "notes" | "status">>;
export type GenerateChapterCandidatesRequest = { feedback?: string };

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

function normalizeState(payload: unknown): CoursePlannerState {
  const state = toCamel(payload) as Partial<CoursePlannerState>;
  const scenePacks = state.scenePacks ?? [];
  const chapters = arrayFromPayload<Chapter>(state, "chapters");
  const candidatesByScenePackId = recordArrayFromPayload<ChapterCandidate>(
    payload,
    ["candidatesByScenePackId", "candidates_by_scene_pack_id"],
  );
  const chaptersByScenePackId = recordArrayFromPayload<Chapter>(
    payload,
    ["chaptersByScenePackId", "chapters_by_scene_pack_id"],
    orderedChapters,
  );
  return {
    scenePacks,
    activeScenePackId: state.activeScenePackId ?? scenePacks[0]?.id ?? null,
    candidatesByScenePackId: candidatesByScenePackId ?? {},
    chaptersByScenePackId: chaptersByScenePackId ?? groupBy(chapters, (chapter) => chapter.scenePackId, orderedChapters),
    selectedChapterId: state.selectedChapterId ?? null,
    asyncStatus: state.asyncStatus ?? {},
    tasks: state.tasks ?? [],
  };
}

function recordArrayFromPayload<T>(
  payload: unknown,
  keys: string[],
  normalize: (items: T[]) => T[] = (items) => items,
): Record<string, T[]> | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const source = keys
    .map((key) => (payload as Record<string, unknown>)[key])
    .find((value) => Boolean(value) && typeof value === "object" && !Array.isArray(value));
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return null;
  }
  // WHY: scene pack id 是动态业务 key，不能经过 toCamel；只转换每个 record value 的字段名。
  return Object.fromEntries(
    Object.entries(source as Record<string, unknown>).map(([key, value]) => [
      key,
      normalize(Array.isArray(value) ? value.map((item) => toCamel(item) as T) : []),
    ]),
  );
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
