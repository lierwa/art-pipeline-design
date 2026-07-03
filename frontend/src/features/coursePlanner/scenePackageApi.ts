import type {
  AvoidObjectItem,
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
export type ChapterScenePromptAvoidObjectInput = Pick<AvoidObjectItem, "label" | "description">;
export type PromptReadinessConfirmationInput = {
  avoidObjectsReviewed: boolean;
  styleReferenceMode: "unreviewed" | "selected" | "confirmed_empty";
};
export type ChapterScenePromptInput = {
  promptText: string;
  sceneSpatialContract?: string;
  targetObjects?: ChapterScenePromptTargetObjectInput[];
  avoidObjects?: ChapterScenePromptAvoidObjectInput[];
  promptConfirmations?: PromptReadinessConfirmationInput;
};
export type ReferenceUploadInput = {
  promptRole?: "style" | "scene" | "character" | "other";
  notes?: string;
};
export type EmptySceneImageUploadInput = {
  referenceImageIds?: string[];
  promptSnapshot?: string;
};
export type CompleteImageUploadInput = {
  referenceImageIds?: string[];
  promptSnapshot?: string;
  generationNote?: string;
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
export type DirectChapterAssetUploadInput = {
  displayName: string;
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

export async function uploadEmptySceneImage(
  chapterId: string,
  file: File,
  input: EmptySceneImageUploadInput = {},
  fetcher: CoursePlannerFetcher = fetch,
): Promise<ChapterScenePackage> {
  const body = new FormData();
  body.append("file", file);
  appendStringListField(body, "referenceImageIds", input.referenceImageIds);
  appendOptionalStringField(body, "promptSnapshot", input.promptSnapshot);
  return requestScenePackage(
    fetcher,
    `${scenePackagePath(chapterId)}/empty-scene-images`,
    { method: "POST", body },
    "Could not upload Empty Scene Image.",
  );
}

export async function selectEmptySceneImage(
  chapterId: string,
  emptySceneImageId: string,
  fetcher: CoursePlannerFetcher = fetch,
): Promise<ChapterScenePackage> {
  return requestScenePackage(
    fetcher,
    `${scenePackagePath(chapterId)}/current-empty-scene`,
    jsonRequest("POST", { emptySceneImageId }),
    "Could not select Empty Scene Image.",
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
  appendStringListField(body, "referenceImageIds", input.referenceImageIds);
  appendOptionalStringField(body, "promptSnapshot", input.promptSnapshot);
  appendOptionalStringField(body, "generationNote", input.generationNote);
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

export async function uploadDirectChapterAsset(
  chapterId: string,
  file: File,
  input: DirectChapterAssetUploadInput,
  fetcher: CoursePlannerFetcher = fetch,
): Promise<ChapterScenePackage> {
  const body = new FormData();
  body.append("file", file);
  body.append("displayName", input.displayName);
  appendOptionalStringField(body, "linkedTargetObjectId", input.linkedTargetObjectId);
  return requestScenePackage(
    fetcher,
    `${scenePackagePath(chapterId)}/chapter-assets/direct-upload`,
    { method: "POST", body },
    "Could not upload direct Scene Asset.",
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

export async function lockFinalChapterScene(
  chapterId: string,
  file: File,
  fetcher: CoursePlannerFetcher = fetch,
): Promise<ChapterScenePackage> {
  const body = new FormData();
  body.append("file", file);
  return requestScenePackage(
    fetcher,
    `${scenePackagePath(chapterId)}/final-scene`,
    { method: "POST", body },
    "Could not lock Final Chapter Scene.",
  );
}

function chapterScenePromptPatchBody(input: ChapterScenePromptInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    promptText: input.promptText,
  };
  // WHY: PATCH 省略字段表示“沿用当前 chapter scene package 事实”，
  // 只有显式传入空串或空数组时才应该清空对应内容，避免前端投影误删用户已确认的数据。
  if (input.sceneSpatialContract !== undefined) {
    body.sceneSpatialContract = input.sceneSpatialContract;
  }
  if (input.targetObjects !== undefined) {
    body.targetObjects = input.targetObjects;
  }
  if (input.avoidObjects !== undefined) {
    body.avoidObjects = input.avoidObjects;
  }
  if (input.promptConfirmations !== undefined) {
    body.promptConfirmations = input.promptConfirmations;
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
  // WHY: scene-package 当前以 backend snake_case 作为唯一合同源，
  // 前端这里不再做 camelCase 镜像，避免 Task 5 页面迁移期间再次分叉事实源。
  const payload = await requestJson(fetcher, input, init, fallbackError);
  return payloadValue<ChapterScenePackage>(payload, "scenePackage");
}
