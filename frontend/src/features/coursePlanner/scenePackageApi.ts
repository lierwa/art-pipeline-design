import type {
  AvoidObjectItem,
  CharacterIpProfile,
  ChapterSceneAssemblyManifest,
  ChapterScenePackage,
  ReferenceLibraryImage,
  TargetObjectItem,
  WorkspaceRunImportSummary,
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

export type ReferenceLibraryImageUploadInput = {
  tags?: string[];
  notes?: string;
};
export type ChapterReferenceSelectionInput = {
  referenceImageId: string;
  promptRole: "character" | "style" | "scene" | "other";
};
export type ChapterCastAssignmentInput = {
  characterIpId: string;
  roleLabel: string;
  actionIntent: string;
  referenceImageIds?: string[];
};
export type ChapterScenePromptTargetObjectInput = Pick<TargetObjectItem, "label" | "description" | "priority"> & {
  id?: string;
};
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
export type EmptySceneImageUploadInput = {
  referenceImageIds?: string[];
};
export type CompleteImageUploadInput = {
  referenceImageIds?: string[];
  generationNote?: string;
};
export type DirectChapterAssetUploadInput = {
  displayName: string;
  linkedTargetObjectId?: string;
};
export type CompleteImageImportResult = {
  run: WorkspaceRunImportSummary;
  scenePackage: ChapterScenePackage;
};

export async function listCharacterIps(fetcher: CoursePlannerFetcher = fetch): Promise<CharacterIpProfile[]> {
  const payload = await requestJson(fetcher, `${API_ROOT}/character-ips`, { method: "GET" }, "Could not load Character IP library.");
  const value = payloadValue<CharacterIpProfile[]>(payload, "characterIps");
  return Array.isArray(value) ? value : [];
}

export async function listReferenceLibraryImages(fetcher: CoursePlannerFetcher = fetch): Promise<ReferenceLibraryImage[]> {
  const payload = await requestJson(fetcher, `${API_ROOT}/reference-library/images`, { method: "GET" }, "Could not load Reference Library.");
  const value = payloadValue<ReferenceLibraryImage[]>(payload, "referenceImages");
  return Array.isArray(value) ? value : [];
}

export async function uploadReferenceLibraryImage(
  file: File,
  input: ReferenceLibraryImageUploadInput = {},
  fetcher: CoursePlannerFetcher = fetch,
): Promise<ReferenceLibraryImage> {
  const body = new FormData();
  body.append("file", file);
  appendStringListField(body, "tags", input.tags);
  appendOptionalStringField(body, "notes", input.notes);
  const payload = await requestJson(
    fetcher,
    `${API_ROOT}/reference-library/images`,
    { method: "POST", body },
    "Could not upload Reference Library image.",
  );
  return payloadValue<ReferenceLibraryImage>(payload, "referenceImage");
}

export async function selectChapterReferenceImage(
  chapterId: string,
  input: ChapterReferenceSelectionInput,
  fetcher: CoursePlannerFetcher = fetch,
): Promise<ChapterScenePackage> {
  return requestScenePackage(
    fetcher,
    `${scenePackagePath(chapterId)}/reference-selections`,
    jsonRequest("POST", {
      referenceImageId: input.referenceImageId,
      promptRole: input.promptRole,
    }),
    "Could not select reference image.",
  );
}

export async function assignCharacterIpToChapter(
  chapterId: string,
  input: ChapterCastAssignmentInput,
  fetcher: CoursePlannerFetcher = fetch,
): Promise<ChapterScenePackage> {
  return requestScenePackage(
    fetcher,
    `${scenePackagePath(chapterId)}/cast-assignments`,
    jsonRequest("POST", {
      characterIpId: input.characterIpId,
      roleLabel: input.roleLabel,
      actionIntent: input.actionIntent,
      referenceImageIds: input.referenceImageIds ?? [],
    }),
    "Could not bind Character IP to Chapter.",
  );
}

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

export async function uploadEmptySceneImage(
  chapterId: string,
  file: File,
  input: EmptySceneImageUploadInput = {},
  fetcher: CoursePlannerFetcher = fetch,
): Promise<ChapterScenePackage> {
  const body = new FormData();
  body.append("file", file);
  appendStringListField(body, "referenceImageIds", input.referenceImageIds);
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
  appendOptionalStringField(body, "generationNote", input.generationNote);
  return requestScenePackage(
    fetcher,
    `${scenePackagePath(chapterId)}/complete-images`,
    { method: "POST", body },
    "Could not upload complete scene image.",
  );
}

export async function importCompleteSceneImageToPipeline(
  chapterId: string,
  completeImageId: string,
  fetcher: CoursePlannerFetcher = fetch,
): Promise<CompleteImageImportResult> {
  const payload = await requestJson(
    fetcher,
    `${scenePackagePath(chapterId)}/complete-images/${encodePathPart(completeImageId)}/import`,
    { method: "POST" },
    "Could not send complete scene image to pipeline.",
  );
  const run = payloadValue<WorkspaceRunImportSummary>(payload, "run");
  const scenePackage = payloadValue<ChapterScenePackage>(payload, "scenePackage");
  return { run, scenePackage };
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

export async function duplicateChapterAsset(
  chapterId: string,
  assetId: string,
  fetcher: CoursePlannerFetcher = fetch,
): Promise<ChapterScenePackage> {
  return requestScenePackage(
    fetcher,
    `${scenePackagePath(chapterId)}/chapter-assets/${encodePathPart(assetId)}/duplicate`,
    { method: "POST" },
    "Could not duplicate Chapter Asset.",
  );
}

export async function deleteCompleteSceneImage(
  chapterId: string,
  completeImageId: string,
  fetcher: CoursePlannerFetcher = fetch,
): Promise<ChapterScenePackage> {
  return requestScenePackage(
    fetcher,
    `${scenePackagePath(chapterId)}/complete-images/${encodePathPart(completeImageId)}`,
    { method: "DELETE" },
    "Could not delete complete scene image.",
  );
}

export async function deleteChapterAsset(
  chapterId: string,
  assetId: string,
  fetcher: CoursePlannerFetcher = fetch,
): Promise<ChapterScenePackage> {
  return requestScenePackage(
    fetcher,
    `${scenePackagePath(chapterId)}/chapter-assets/${encodePathPart(assetId)}`,
    { method: "DELETE" },
    "Could not delete Chapter Asset.",
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
