import type {
  ChapterSceneAssemblyManifest,
  ChapterScenePackage,
  TargetObjectItem,
} from "./types";
import {
  API_ROOT,
  appendOptionalStringField,
  appendStringListField,
  encodePathPart,
  jsonRequest,
  payloadValue,
  requestJson,
} from "./apiClient";
import type { CoursePlannerFetcher } from "./apiClient";

export type ChapterScenePromptTargetObjectInput = Pick<TargetObjectItem, "label" | "description" | "priority">;
export type ChapterScenePromptInput = {
  promptText: string;
  negativeConstraints?: string;
  styleNotes?: string;
  targetObjects?: ChapterScenePromptTargetObjectInput[];
};
export type ReferenceUploadInput = {
  promptRole?: "style" | "scene" | "character" | "other";
  notes?: string;
};
export type BaseCandidateUploadInput = {
  referenceIds?: string[];
  promptSnapshot?: string;
};
export type CompleteImageUploadInput = {
  referenceIds?: string[];
  promptSnapshot?: string;
  variationPrompt?: string;
};
export type RunAssociationInput = {
  runId: string;
  runStatus?: string | null;
};
export type ChapterAssetUploadInput = {
  sourceRunId: string;
  sourceRunAssetId: string;
  displayName: string;
  sourceCompleteImageId?: string;
  linkedTargetObjectId?: string;
};

export async function fetchChapterScenePackage(
  chapterId: string,
  fetcher: CoursePlannerFetcher = fetch,
): Promise<ChapterScenePackage> {
  return requestScenePackage(fetcher, scenePackagePath(chapterId), { method: "GET" }, "Could not load Chapter Scene Package.");
}

export async function updateChapterScenePrompt(
  chapterId: string,
  input: ChapterScenePromptInput,
  fetcher: CoursePlannerFetcher = fetch,
): Promise<ChapterScenePackage> {
  return requestScenePackage(
    fetcher,
    `${scenePackagePath(chapterId)}/prompt`,
    jsonRequest("PATCH", chapterScenePromptPatchBody(input)),
    "Could not update Chapter Scene prompt.",
  );
}

export async function uploadChapterSceneReference(
  chapterId: string,
  file: File,
  input: ReferenceUploadInput = {},
  fetcher: CoursePlannerFetcher = fetch,
): Promise<ChapterScenePackage> {
  const body = new FormData();
  body.append("file", file);
  appendOptionalStringField(body, "promptRole", input.promptRole);
  appendOptionalStringField(body, "notes", input.notes);
  return requestScenePackage(
    fetcher,
    `${scenePackagePath(chapterId)}/references`,
    { method: "POST", body },
    "Could not upload Chapter Scene reference.",
  );
}

export async function uploadEmptyBaseSceneCandidate(
  chapterId: string,
  file: File,
  input: BaseCandidateUploadInput = {},
  fetcher: CoursePlannerFetcher = fetch,
): Promise<ChapterScenePackage> {
  const body = new FormData();
  body.append("file", file);
  appendStringListField(body, "referenceIds", input.referenceIds);
  appendOptionalStringField(body, "promptSnapshot", input.promptSnapshot);
  return requestScenePackage(
    fetcher,
    `${scenePackagePath(chapterId)}/base-candidates`,
    { method: "POST", body },
    "Could not upload empty base scene candidate.",
  );
}

export async function lockEmptyBaseScene(
  chapterId: string,
  candidateId: string,
  fetcher: CoursePlannerFetcher = fetch,
): Promise<ChapterScenePackage> {
  return requestScenePackage(
    fetcher,
    `${scenePackagePath(chapterId)}/base-candidates/${encodePathPart(candidateId)}/lock`,
    { method: "POST" },
    "Could not lock empty base scene.",
  );
}

export async function uploadCompleteSceneImage(
  chapterId: string,
  file: File,
  input: CompleteImageUploadInput = {},
  fetcher: CoursePlannerFetcher = fetch,
): Promise<ChapterScenePackage> {
  const body = new FormData();
  body.append("file", file);
  appendStringListField(body, "referenceIds", input.referenceIds);
  appendOptionalStringField(body, "promptSnapshot", input.promptSnapshot);
  appendOptionalStringField(body, "variationPrompt", input.variationPrompt);
  return requestScenePackage(
    fetcher,
    `${scenePackagePath(chapterId)}/complete-images`,
    { method: "POST", body },
    "Could not upload complete scene image.",
  );
}

export async function associateCompleteImageRun(
  chapterId: string,
  completeImageId: string,
  input: RunAssociationInput,
  fetcher: CoursePlannerFetcher = fetch,
): Promise<ChapterScenePackage> {
  return requestScenePackage(
    fetcher,
    `${scenePackagePath(chapterId)}/complete-images/${encodePathPart(completeImageId)}/run`,
    jsonRequest("PATCH", {
      runId: input.runId,
      runStatus: input.runStatus ?? null,
    }),
    "Could not associate complete scene image run.",
  );
}

export async function uploadChapterAssetFromRunAsset(
  chapterId: string,
  file: File,
  input: ChapterAssetUploadInput,
  fetcher: CoursePlannerFetcher = fetch,
): Promise<ChapterScenePackage> {
  const body = new FormData();
  body.append("file", file);
  body.append("sourceRunId", input.sourceRunId);
  body.append("sourceRunAssetId", input.sourceRunAssetId);
  body.append("displayName", input.displayName);
  appendOptionalStringField(body, "sourceCompleteImageId", input.sourceCompleteImageId);
  appendOptionalStringField(body, "linkedTargetObjectId", input.linkedTargetObjectId);
  return requestScenePackage(
    fetcher,
    `${scenePackagePath(chapterId)}/chapter-assets`,
    { method: "POST", body },
    "Could not add Chapter asset from run asset.",
  );
}

export async function saveChapterSceneAssembly(
  chapterId: string,
  manifest: ChapterSceneAssemblyManifest,
  fetcher: CoursePlannerFetcher = fetch,
): Promise<ChapterScenePackage> {
  return requestScenePackage(
    fetcher,
    `${scenePackagePath(chapterId)}/assembly`,
    jsonRequest("PUT", manifest),
    "Could not save Chapter Scene assembly.",
  );
}

function chapterScenePromptPatchBody(
  input: ChapterScenePromptInput,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    promptText: input.promptText,
  };
  // WHY: PATCH 省略字段表示“保持现状”；只有调用方显式给空串/空数组时，
  // 才应该把 scene package 里的 metadata 或 targetObjects 清空。
  if (input.negativeConstraints !== undefined) {
    body.negativeConstraints = input.negativeConstraints;
  }
  if (input.styleNotes !== undefined) {
    body.styleNotes = input.styleNotes;
  }
  if (input.targetObjects !== undefined) {
    body.targetObjects = input.targetObjects;
  }
  return body;
}

function scenePackagePath(chapterId: string): string {
  return `${API_ROOT}/chapters/${encodePathPart(chapterId)}/scene-package`;
}

async function requestScenePackage(
  fetcher: CoursePlannerFetcher,
  input: RequestInfo | URL,
  init: RequestInit,
  fallbackError: string,
): Promise<ChapterScenePackage> {
  // WHY: scene-package foundation 直接复用后端 snake_case 作为前后端共享合同，
  // 避免在 Chapter Workspace 迁移期间一边写新组装数据，一边再制造一套 camelCase 镜像真相。
  const payload = await requestJson(fetcher, input, init, fallbackError);
  return payloadValue<ChapterScenePackage>(payload, "scenePackage");
}
