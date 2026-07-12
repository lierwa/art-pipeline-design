import { App, installFetchMock, jsonResponse, render } from "../app/appTestHarness";
import type {
  AsyncStatusMap,
  Chapter,
  ChapterSceneAssemblyManifest,
  ChapterScenePackage,
  CharacterIpProfile,
  CoursePlannerState,
  SceneStyleReference,
  ScenePack,
} from "../../src/features/coursePlanner/types";
import {
  characterIpFixture,
  referenceImageFixture,
  sceneAsset,
  snapshot,
  STUDIO_CHAPTER_ID,
  STUDIO_SCENE_PACK_ID,
  studioChapterFixture,
  studioScenePackageFixture,
  studioScenePackFixture,
} from "./chapterWorkspaceFixtures";

export { characterIpFixture, referenceImageFixture, STUDIO_CHAPTER_ID, STUDIO_SCENE_PACK_ID, studioChapterFixture, studioScenePackageFixture, studioScenePackFixture } from "./chapterWorkspaceFixtures";

export type ChapterWorkspaceFetchMockOptions = {
  state?: CoursePlannerState;
  scenePackage?: ChapterScenePackage;
  characterIps?: CharacterIpProfile[];
  sceneStyles?: SceneStyleReference[];
  fetchScenePackage?: (input: RequestInfo | URL, init: RequestInit | undefined) => Promise<Response> | Response;
  selectSceneStyle?: (input: RequestInfo | URL, init: RequestInit | undefined) => Promise<Response> | Response;
  removeCharacterIp?: (input: RequestInfo | URL, init: RequestInit | undefined) => Promise<Response> | Response;
  assignCharacterIp?: (input: RequestInfo | URL, init: RequestInit | undefined) => Promise<Response> | Response;
  updateScenePrompt?: (input: RequestInfo | URL, init: RequestInit | undefined) => Promise<Response> | Response;
  uploadEmptySceneImage?: (input: RequestInfo | URL, init: RequestInit | undefined) => Promise<Response> | Response;
  selectEmptySceneImage?: (input: RequestInfo | URL, init: RequestInit | undefined) => Promise<Response> | Response;
  uploadCompleteSceneImage?: (input: RequestInfo | URL, init: RequestInit | undefined) => Promise<Response> | Response;
  deleteCompleteSceneImage?: (input: RequestInfo | URL, init: RequestInit | undefined) => Promise<Response> | Response;
  importCompleteImage?: (input: RequestInfo | URL, init: RequestInit | undefined) => Promise<Response> | Response;
  uploadDirectChapterAsset?: (input: RequestInfo | URL, init: RequestInit | undefined) => Promise<Response> | Response;
  deleteChapterAsset?: (input: RequestInfo | URL, init: RequestInit | undefined) => Promise<Response> | Response;
  saveAssembly?: (input: RequestInfo | URL, init: RequestInit | undefined) => Promise<Response> | Response;
  lockFinalScene?: (input: RequestInfo | URL, init: RequestInit | undefined) => Promise<Response> | Response;
};

export type RenderChapterWorkspaceOptions = ChapterWorkspaceFetchMockOptions & { route?: string };
type ChapterWorkspaceMockContext = {
  options: ChapterWorkspaceFetchMockOptions;
  state: CoursePlannerState;
  scenePackage: ChapterScenePackage;
  characterIps: CharacterIpProfile[];
  sceneStyles: SceneStyleReference[];
};

export function installChapterWorkspaceFetchMock(options: ChapterWorkspaceFetchMockOptions = {}) {
  const context = createChapterWorkspaceMockContext(options);

  return installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const response = handleWorkspaceMockRoutes(context, path, init)
      ?? await handleLibraryMockRoutes(context, input, path, init)
      ?? await handleScenePackageMockRoutes(context, input, path, init);
    if (response) {
      return response;
    }
    throw new Error(`Unexpected fetch call: ${path}`);
  });
}

function createChapterWorkspaceMockContext(options: ChapterWorkspaceFetchMockOptions): ChapterWorkspaceMockContext {
  return {
    options,
    state: options.state ?? coursePlannerState(),
    scenePackage: options.scenePackage ?? studioScenePackageFixture(),
    characterIps: options.characterIps ?? [characterIpFixture()],
    sceneStyles: options.sceneStyles ?? [referenceImageFixture()],
  };
}

function handleWorkspaceMockRoutes(
  context: ChapterWorkspaceMockContext,
  path: string,
  init: RequestInit | undefined,
): Response | null {
  if (path === "/api/workspace/runs" && (!init || init.method === "GET")) {
    return jsonResponse({ runs: [] });
  }
  if (path === "/api/workspace/state" && (!init || init.method === "GET")) {
    return jsonResponse({ source: null, elements: [], detectionVocabulary: [] });
  }
  if (path === "/api/course-planner/state" && (!init || init.method === "GET")) {
    return jsonResponse(context.state);
  }
  return null;
}

async function handleLibraryMockRoutes(
  context: ChapterWorkspaceMockContext,
  input: RequestInfo | URL,
  path: string,
  init: RequestInit | undefined,
): Promise<Response | null> {
  const { options } = context;
  if (path === "/api/course-planner/character-ips" && (!init || init.method === "GET")) {
    return jsonResponse({ characterIps: context.characterIps });
  }
  if (path === "/api/course-planner/scene-style-references" && (!init || init.method === "GET")) {
    return jsonResponse({ sceneStyleReferences: context.sceneStyles });
  }
  return null;
}

async function handleScenePackageMockRoutes(
  context: ChapterWorkspaceMockContext,
  input: RequestInfo | URL,
  path: string,
  init: RequestInit | undefined,
): Promise<Response | null> {
  const { options, scenePackage } = context;
  if (path.endsWith(`/chapters/${scenePackage.chapter_id}/scene-package`) && (!init || init.method === "GET")) {
    return options.fetchScenePackage?.(input, init) ?? jsonResponse({ scenePackage });
  }
  if (path.endsWith(`/chapters/${scenePackage.chapter_id}/scene-package/scene-style-reference`) && init?.method === "PUT") {
    return options.selectSceneStyle?.(input, init) ?? jsonResponse({ scenePackage: recordNextPackage(context, await selectSceneStyle(scenePackage, init)) });
  }
  if (path.endsWith(`/chapters/${scenePackage.chapter_id}/scene-package/scene-style-reference`) && init?.method === "DELETE") {
    return jsonResponse({ scenePackage: recordNextPackage(context, { ...scenePackage, scene_style_reference_id: null }) });
  }
  if (path.endsWith(`/chapters/${scenePackage.chapter_id}/scene-package/cast-assignments`) && init?.method === "POST") {
    return options.assignCharacterIp?.(input, init) ?? jsonResponse({ scenePackage: recordNextPackage(context, await appendCastAssignment(scenePackage, init)) });
  }
  if (path.includes(`/chapters/${scenePackage.chapter_id}/scene-package/cast-assignments/`) && init?.method === "DELETE") {
    const characterIpId = decodeURIComponent(path.split("/cast-assignments/")[1] ?? "");
    const next = { ...scenePackage, cast_assignments: scenePackage.cast_assignments.filter((item) => item.character_ip_id !== characterIpId) };
    return options.removeCharacterIp?.(input, init) ?? jsonResponse({ scenePackage: recordNextPackage(context, next) });
  }
  return handleScenePackageMediaMockRoutes(context, input, path, init);
}

async function handleScenePackageMediaMockRoutes(
  context: ChapterWorkspaceMockContext,
  input: RequestInfo | URL,
  path: string,
  init: RequestInit | undefined,
): Promise<Response | null> {
  const { options, scenePackage } = context;
  if (path.endsWith(`/chapters/${scenePackage.chapter_id}/scene-package/prompt`) && init?.method === "PATCH") {
    return options.updateScenePrompt?.(input, init) ?? jsonResponse({ scenePackage: await patchScenePrompt(context, scenePackage, init) });
  }
  if (path.endsWith(`/chapters/${scenePackage.chapter_id}/scene-package/empty-scene-images`) && init?.method === "POST") {
    return options.uploadEmptySceneImage?.(input, init) ?? jsonResponse({ scenePackage: recordNextPackage(context, appendEmptySceneImage(scenePackage, init)) });
  }
  if (path.endsWith(`/chapters/${scenePackage.chapter_id}/scene-package/current-empty-scene`) && init?.method === "POST") {
    return options.selectEmptySceneImage?.(input, init) ?? jsonResponse({ scenePackage: recordNextPackage(context, await selectCurrentEmptyScene(scenePackage, init)) });
  }
  if (path.endsWith(`/chapters/${scenePackage.chapter_id}/scene-package/complete-images`) && init?.method === "POST") {
    return options.uploadCompleteSceneImage?.(input, init) ?? jsonResponse({ scenePackage: recordNextPackage(context, appendCompleteSceneImage(scenePackage, init)) });
  }
  if (path.includes(`/chapters/${scenePackage.chapter_id}/scene-package/complete-images/`) && init?.method === "DELETE") {
    return options.deleteCompleteSceneImage?.(input, init) ?? jsonResponse({ scenePackage: recordNextPackage(context, deleteCompleteSceneImage(scenePackage, path)) });
  }
  return handleScenePackageAssetMockRoutes(context, input, path, init);
}

async function handleScenePackageAssetMockRoutes(
  context: ChapterWorkspaceMockContext,
  input: RequestInfo | URL,
  path: string,
  init: RequestInit | undefined,
): Promise<Response | null> {
  const { options, scenePackage } = context;
  if (path.includes(`/chapters/${scenePackage.chapter_id}/scene-package/complete-images/`) && path.endsWith("/import") && init?.method === "POST") {
    return options.importCompleteImage?.(input, init) ?? jsonResponse({ run: workspaceRunFixture(), scenePackage: recordNextPackage(context, importCompleteImage(scenePackage, path)) });
  }
  if (path.endsWith(`/chapters/${scenePackage.chapter_id}/scene-package/chapter-assets/direct-upload`) && init?.method === "POST") {
    return options.uploadDirectChapterAsset?.(input, init) ?? jsonResponse({ scenePackage: recordNextPackage(context, appendDirectAsset(scenePackage, init)) });
  }
  if (path.includes(`/chapters/${scenePackage.chapter_id}/scene-package/chapter-assets/`) && init?.method === "DELETE") {
    return options.deleteChapterAsset?.(input, init) ?? jsonResponse({ scenePackage: recordNextPackage(context, deleteChapterAsset(scenePackage, path)) });
  }
  if (path.endsWith(`/chapters/${scenePackage.chapter_id}/scene-package/assembly`) && init?.method === "PUT") {
    return options.saveAssembly?.(input, init) ?? jsonResponse({ scenePackage: recordNextPackage(context, await replaceAssembly(scenePackage, init)) });
  }
  if (path.endsWith(`/chapters/${scenePackage.chapter_id}/scene-package/final-scene`) && init?.method === "POST") {
    return options.lockFinalScene?.(input, init) ?? jsonResponse({ scenePackage: recordNextPackage(context, lockFinalScene(scenePackage)) });
  }
  return null;
}

async function patchScenePrompt(context: ChapterWorkspaceMockContext, current: ChapterScenePackage, init: RequestInit | undefined) {
  const body = await parseJsonBody<{
    promptText: string;
    sceneSpatialContract?: string;
    targetObjects?: ChapterScenePackage["target_objects"];
    avoidObjects?: ChapterScenePackage["avoid_objects"];
    promptConfirmations?: ChapterScenePackage["prompt_confirmations"];
  }>(init);
  context.scenePackage = {
    ...current,
    prompt: {
      prompt_text: body.promptText,
      scene_spatial_contract: body.sceneSpatialContract ?? current.prompt.scene_spatial_contract,
      updated_at: "2026-07-03T11:05:00Z",
    },
    target_objects: body.targetObjects ?? current.target_objects,
    avoid_objects: body.avoidObjects ?? current.avoid_objects,
    prompt_confirmations: body.promptConfirmations ?? current.prompt_confirmations,
  };
  return context.scenePackage;
}

function recordNextPackage(context: ChapterWorkspaceMockContext, next: ChapterScenePackage): ChapterScenePackage {
  context.scenePackage = next;
  return next;
}

export function renderChapterWorkspace(options: RenderChapterWorkspaceOptions = {}) {
  const route = options.route ?? `/course-planner/chapters/${STUDIO_CHAPTER_ID}`;
  const restoreFetch = installChapterWorkspaceFetchMock(options);
  window.history.pushState({}, "", route);
  const rendered = render(App());
  return {
    ...rendered,
    restore: () => {
      rendered.unmount();
      restoreFetch();
      window.history.pushState({}, "", "/");
    },
  };
}

export function coursePlannerState({
  asyncStatus,
  selectedChapterId = STUDIO_CHAPTER_ID,
  selectedScenePackId = STUDIO_SCENE_PACK_ID,
  scenePack = studioScenePackFixture(),
  chapter = studioChapterFixture(),
}: {
  asyncStatus?: AsyncStatusMap;
  selectedChapterId?: string | null;
  selectedScenePackId?: string | null;
  scenePack?: ScenePack;
  chapter?: Chapter;
} = {}): CoursePlannerState {
  return {
    scenePacks: [scenePack],
    activeScenePackId: selectedScenePackId,
    candidatesByScenePackId: { [scenePack.id]: [] },
    chaptersByScenePackId: { [scenePack.id]: [chapter] },
    selectedChapterId,
    asyncStatus: asyncStatus ?? {},
    tasks: [],
  };
}

async function selectSceneStyle(current: ChapterScenePackage, init: RequestInit | undefined): Promise<ChapterScenePackage> {
  const body = await parseJsonBody<{ sceneStyleReferenceId: string }>(init);
  return {
    ...current,
    scene_style_reference_id: body.sceneStyleReferenceId,
  };
}

async function appendCastAssignment(current: ChapterScenePackage, init: RequestInit | undefined): Promise<ChapterScenePackage> {
  const body = await parseJsonBody<{ characterIpId: string; roleLabel: string; actionIntent: string }>(init);
  return {
    ...current,
    cast_assignments: [
      ...current.cast_assignments,
      {
        id: `cast_assignment_${String(current.cast_assignments.length + 1).padStart(3, "0")}`,
        character_ip_id: body.characterIpId,
        role_label: body.roleLabel,
        action_intent: body.actionIntent,
      },
    ],
  };
}

function importCompleteImage(current: ChapterScenePackage, path: string): ChapterScenePackage {
  const completeImageId = path.split("/complete-images/")[1]?.split("/import")[0] ?? "";
  return {
    ...current,
    complete_images: current.complete_images.map((image) =>
      image.id === completeImageId
        ? {
            ...image,
            pipeline_run_id: "run_complete_scene_001",
            pipeline_run_status: "ready",
          }
        : image,
    ),
  };
}

function workspaceRunFixture() {
  return {
    id: "run_complete_scene_001",
    title: "Complete scene import",
    sourceFilename: "complete-scene.png",
    createdAt: "2026-07-03T11:12:00Z",
    updatedAt: "2026-07-03T11:12:00Z",
    status: "ready",
    elementCount: 0,
  };
}

async function parseJsonBody<T>(init: RequestInit | undefined): Promise<T> {
  return JSON.parse(String(init?.body ?? "{}")) as T;
}

function appendEmptySceneImage(current: ChapterScenePackage, init: RequestInit | undefined): ChapterScenePackage {
  const body = init?.body as FormData;
  const imageId = `empty_scene_${String(current.empty_scene_images.length + 1).padStart(3, "0")}`;
  return {
    ...current,
    empty_scene_images: [
      ...current.empty_scene_images,
      {
        id: imageId,
        original_filename: fileNameFromFormData(body, "file", "empty-scene.png"),
        storage_path: `scene_package/${imageId}.png`,
        media_type: "image/png",
        width: 1024,
        height: 1024,
        status: "available",
        prompt_snapshot: "Backend projected empty scene prompt.",
        reference_snapshot: snapshot(body.getAll("referenceImageIds").map(String), current.current_empty_scene_image_id, ""),
        created_at: "2026-07-03T11:06:00Z",
      },
    ],
  };
}

async function selectCurrentEmptyScene(current: ChapterScenePackage, init: RequestInit | undefined): Promise<ChapterScenePackage> {
  const body = await parseJsonBody<{ emptySceneImageId: string }>(init);
  return {
    ...current,
    current_empty_scene_image_id: body.emptySceneImageId,
  };
}

function appendCompleteSceneImage(current: ChapterScenePackage, init: RequestInit | undefined): ChapterScenePackage {
  const body = init?.body as FormData;
  const imageId = `complete_scene_${String(current.complete_images.length + 1).padStart(3, "0")}`;
  return {
    ...current,
    complete_images: [
      ...current.complete_images,
      {
        id: imageId,
        original_filename: fileNameFromFormData(body, "file", "complete-scene.png"),
        storage_path: `scene_package/${imageId}.png`,
        media_type: "image/png",
        width: 1024,
        height: 1024,
        empty_scene_image_id: current.current_empty_scene_image_id,
        status: "active",
        prompt_snapshot: "Backend projected complete scene prompt.",
        reference_snapshot: snapshot(body.getAll("referenceImageIds").map(String), current.current_empty_scene_image_id, ""),
        generation_note: String(body.get("generationNote") ?? ""),
        pipeline_run_id: null,
        pipeline_run_status: null,
        created_at: "2026-07-03T11:07:00Z",
      },
    ],
  };
}

function appendDirectAsset(current: ChapterScenePackage, init: RequestInit | undefined): ChapterScenePackage {
  return appendAsset(current, init);
}

function appendAsset(current: ChapterScenePackage, init: RequestInit | undefined): ChapterScenePackage {
  const body = init?.body as FormData;
  const assetId = `chapter_asset_${String(current.chapter_assets.length + 1).padStart(3, "0")}`;
  return {
    ...current,
    chapter_assets: [
      ...current.chapter_assets,
      sceneAsset(assetId, String(body.get("displayName") ?? "Scene asset"), fileNameFromFormData(body, "file", "scene-asset.png"), {
        linkedTargetObjectId: nullableFormValue(body.get("linkedTargetObjectId")),
      }),
    ],
  };
}

async function replaceAssembly(current: ChapterScenePackage, init: RequestInit | undefined): Promise<ChapterScenePackage> {
  const body = await parseJsonBody<ChapterSceneAssemblyManifest>(init);
  return {
    ...current,
    assembly: body,
  };
}

function deleteCompleteSceneImage(current: ChapterScenePackage, path: string): ChapterScenePackage {
  const completeImageId = path.split("/complete-images/")[1] ?? "";
  return {
    ...current,
    complete_images: current.complete_images.map((image) => (
      image.id === completeImageId
        ? { ...image, status: "deleted" as const }
        : image
    )),
  };
}

function deleteChapterAsset(current: ChapterScenePackage, path: string): ChapterScenePackage {
  const assetId = path.split("/chapter-assets/")[1] ?? "";
  const removedPlacementIds = new Set(
    current.assembly.placements
      .filter((placement) => placement.asset_id === assetId)
      .map((placement) => placement.id),
  );
  const remainingPlacements = current.assembly.placements
    .filter((placement) => placement.asset_id !== assetId)
    .map((placement) => ({
      ...placement,
      requires_placed: placement.requires_placed.filter((requiredId) => !removedPlacementIds.has(requiredId)),
    }));
  const remainingGroups = current.assembly.groups
    .map((group) => ({
      ...group,
      placement_ids: group.placement_ids.filter((placementId) => !removedPlacementIds.has(placementId)),
    }))
    .filter((group) => group.placement_ids.length >= 2);
  const validGroupIds = new Set(remainingGroups.map((group) => group.id));

  return {
    ...current,
    chapter_assets: current.chapter_assets.map((asset) => (
      asset.id === assetId ? { ...asset, status: "removed" as const } : asset
    )),
    assembly: {
      ...current.assembly,
      placements: remainingPlacements.map((placement) => ({
        ...placement,
        group_id: placement.group_id && validGroupIds.has(placement.group_id) ? placement.group_id : null,
      })),
      groups: remainingGroups,
      layer_order: current.assembly.layer_order.filter((placementId) => !removedPlacementIds.has(placementId)),
    },
  };
}

function lockFinalScene(current: ChapterScenePackage): ChapterScenePackage {
  return {
    ...current,
    final_scene: {
      id: "final_scene_001",
      original_filename: "final-scene.png",
      storage_path: "scene_package/final_scene_001.png",
      media_type: "image/png",
      width: 1024,
      height: 1024,
      empty_scene_image_id: current.current_empty_scene_image_id ?? "empty_scene_001",
      // WHY: smoke test helper 要模拟“锁定终稿后冻结快照”的边界；
      // 这里直接沿用当前 package 事实，避免 helper 自己发明第二套投影规则。
      assembly_snapshot: current.assembly,
      prompt_snapshot: current.prompt.prompt_text,
      reference_snapshot: snapshot(current.complete_images.at(-1)?.reference_snapshot.reference_image_ids ?? [], current.current_empty_scene_image_id, ""),
      created_at: "2026-07-03T11:09:00Z",
    },
  };
}

function fileNameFromFormData(body: FormData, field: string, fallback: string): string {
  const file = body.get(field);
  return file instanceof File ? file.name : fallback;
}

function nullableFormValue(value: FormDataEntryValue | null): string | null {
  if (value === null) {
    return null;
  }
  const text = String(value);
  return text.length > 0 ? text : null;
}
