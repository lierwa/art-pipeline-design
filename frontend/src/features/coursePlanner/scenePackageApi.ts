import type {
  AvoidObjectItem,
  CharacterIpProfile,
  ChapterSceneAssemblyManifest,
  ChapterScenePackage,
  GeneratedChapterAsset,
  SceneStyleReference,
  TargetObjectItem,
  WorkspaceRunImportSummary,
} from "./types";
import {
  API_ROOT,
  appendOptionalStringField,
  encodePathPart,
  jsonRequest,
  payloadValue,
  requestJson,
  requestVoid,
} from "./apiClient";
import type { CoursePlannerFetcher } from "./apiClient";

export type GlobalLibraryCreateInput = { displayName: string; file: File };
export type GlobalLibraryUpdateInput = { displayName?: string; file?: File };
export type ChapterCastAssignmentInput = {
  characterIpId: string;
  roleLabel: string;
  actionIntent: string;
};
export type ChapterScenePromptTargetObjectInput = Pick<TargetObjectItem, "label" | "description" | "priority"> & {
  id?: string;
};
export type ChapterScenePromptAvoidObjectInput = Pick<AvoidObjectItem, "label" | "description">;
export type PromptReadinessConfirmationInput = {
  avoidObjectsReviewed: boolean;
};
export type ChapterScenePromptInput = {
  promptText: string;
  sceneSpatialContract?: string;
  targetObjects?: ChapterScenePromptTargetObjectInput[];
  avoidObjects?: ChapterScenePromptAvoidObjectInput[];
  promptConfirmations?: PromptReadinessConfirmationInput;
};
export type EmptySceneImageUploadInput = Record<string, never>;
export type CompleteImageUploadInput = {
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
export type GeneratedChapterAssetMaterializeInput = {
  completeSceneImageId: string;
  pipelineRunId: string;
  runAssetId: string;
};
export type GeneratedChapterAssetMaterializeResult = {
  chapterAsset: ChapterScenePackage["chapter_assets"][number];
  scenePackage: ChapterScenePackage;
};

export async function listCharacterIps(fetcher: CoursePlannerFetcher = fetch): Promise<CharacterIpProfile[]> {
  const payload = await requestJson(fetcher, `${API_ROOT}/character-ips`, { method: "GET" }, "Could not load Character IP library.");
  const value = payloadValue<CharacterIpProfile[]>(payload, "characterIps");
  return Array.isArray(value) ? value : [];
}

export async function createCharacterIp(
  input: GlobalLibraryCreateInput,
  fetcher: CoursePlannerFetcher = fetch,
): Promise<CharacterIpProfile> {
  return writeLibraryRecord(fetcher, `${API_ROOT}/character-ips`, "POST", input, "characterIp");
}

export async function updateCharacterIp(
  characterIpId: string,
  input: GlobalLibraryUpdateInput,
  fetcher: CoursePlannerFetcher = fetch,
): Promise<CharacterIpProfile> {
  return writeLibraryRecord(fetcher, `${API_ROOT}/character-ips/${encodePathPart(characterIpId)}`, "PATCH", input, "characterIp");
}

export async function deleteCharacterIp(characterIpId: string, fetcher: CoursePlannerFetcher = fetch): Promise<void> {
  return requestVoid(fetcher, `${API_ROOT}/character-ips/${encodePathPart(characterIpId)}`, { method: "DELETE" }, "Could not delete Character IP.");
}

export function characterModelSheetUrl(characterIpId: string): string {
  return `${API_ROOT}/character-ips/${encodePathPart(characterIpId)}/model-sheet`;
}

export async function listSceneStyleReferences(fetcher: CoursePlannerFetcher = fetch): Promise<SceneStyleReference[]> {
  const payload = await requestJson(fetcher, `${API_ROOT}/scene-style-references`, { method: "GET" }, "Could not load Scene Style References.");
  const value = payloadValue<SceneStyleReference[]>(payload, "sceneStyleReferences");
  return Array.isArray(value) ? value : [];
}

export async function createSceneStyleReference(
  input: GlobalLibraryCreateInput,
  fetcher: CoursePlannerFetcher = fetch,
): Promise<SceneStyleReference> {
  return writeLibraryRecord(fetcher, `${API_ROOT}/scene-style-references`, "POST", input, "sceneStyleReference");
}

export async function updateSceneStyleReference(
  styleId: string,
  input: GlobalLibraryUpdateInput,
  fetcher: CoursePlannerFetcher = fetch,
): Promise<SceneStyleReference> {
  return writeLibraryRecord(fetcher, `${API_ROOT}/scene-style-references/${encodePathPart(styleId)}`, "PATCH", input, "sceneStyleReference");
}

export async function deleteSceneStyleReference(styleId: string, fetcher: CoursePlannerFetcher = fetch): Promise<void> {
  return requestVoid(fetcher, `${API_ROOT}/scene-style-references/${encodePathPart(styleId)}`, { method: "DELETE" }, "Could not delete Scene Style Reference.");
}

export function sceneStyleReferenceImageUrl(styleId: string): string {
  return `${API_ROOT}/scene-style-references/${encodePathPart(styleId)}/image`;
}

export async function selectChapterSceneStyleReference(
  chapterId: string,
  sceneStyleReferenceId: string,
  fetcher: CoursePlannerFetcher = fetch,
): Promise<ChapterScenePackage> {
  return requestScenePackage(fetcher, `${scenePackagePath(chapterId)}/scene-style-reference`, jsonRequest("PUT", { sceneStyleReferenceId }), "Could not select Scene Style Reference.");
}

export async function clearChapterSceneStyleReference(
  chapterId: string,
  fetcher: CoursePlannerFetcher = fetch,
): Promise<ChapterScenePackage> {
  return requestScenePackage(fetcher, `${scenePackagePath(chapterId)}/scene-style-reference`, { method: "DELETE" }, "Could not clear Scene Style Reference.");
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
    }),
    "Could not bind Character IP to Chapter.",
  );
}

export async function removeCharacterIpFromChapter(
  chapterId: string,
  characterIpId: string,
  fetcher: CoursePlannerFetcher = fetch,
): Promise<ChapterScenePackage> {
  return requestScenePackage(
    fetcher,
    `${scenePackagePath(chapterId)}/cast-assignments/${encodePathPart(characterIpId)}`,
    { method: "DELETE" },
    "Could not unbind Character IP from Chapter.",
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

export async function listGeneratedChapterAssets(
  chapterId: string,
  fetcher: CoursePlannerFetcher = fetch,
): Promise<GeneratedChapterAsset[]> {
  const payload = await requestJson(
    fetcher,
    `${scenePackagePath(chapterId)}/generated-assets`,
    { method: "GET" },
    "Could not load generated Chapter Assets.",
  );
  const value = payloadValue<GeneratedChapterAsset[]>(payload, "generatedAssets");
  return Array.isArray(value) ? value : [];
}

export async function materializeGeneratedChapterAsset(
  chapterId: string,
  input: GeneratedChapterAssetMaterializeInput,
  fetcher: CoursePlannerFetcher = fetch,
): Promise<GeneratedChapterAssetMaterializeResult> {
  const payload = await requestJson(
    fetcher,
    `${scenePackagePath(chapterId)}/generated-assets/materialize`,
    jsonRequest("POST", {
      completeSceneImageId: input.completeSceneImageId,
      pipelineRunId: input.pipelineRunId,
      runAssetId: input.runAssetId,
    }),
    "Could not import generated Chapter Asset.",
  );
  return {
    chapterAsset: payloadValue<ChapterScenePackage["chapter_assets"][number]>(payload, "chapterAsset"),
    scenePackage: payloadValue<ChapterScenePackage>(payload, "scenePackage"),
  };
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

async function writeLibraryRecord<T>(
  fetcher: CoursePlannerFetcher,
  path: string,
  method: "POST" | "PATCH",
  input: GlobalLibraryCreateInput | GlobalLibraryUpdateInput,
  payloadKey: string,
): Promise<T> {
  const body = new FormData();
  if (input.displayName !== undefined) {
    body.append("displayName", input.displayName);
  }
  if (input.file !== undefined) {
    body.append("file", input.file);
  }
  // WHY: 角色与风格共用完全相同的 multipart 媒体边界；这里集中协议拼装，
  // 避免两个资料库各自演化出额外字段或不同的重试行为。
  const payload = await requestJson(fetcher, path, { method, body }, "Could not save global library item.");
  return payloadValue<T>(payload, payloadKey);
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
