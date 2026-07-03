import { App, installFetchMock, jsonResponse, render } from "../app/appTestHarness";

import type {
  AsyncStatusMap,
  Chapter,
  ChapterSceneAssemblyManifest,
  ChapterScenePackage,
  CoursePlannerState,
  ScenePack,
} from "../../src/features/coursePlanner/types";

export type ChapterWorkspaceFetchMockOptions = {
  state?: CoursePlannerState;
  scenePackage?: ChapterScenePackage;
  fetchScenePackage?: (input: RequestInfo | URL, init: RequestInit | undefined) => Promise<Response> | Response;
  updateScenePrompt?: (input: RequestInfo | URL, init: RequestInit | undefined) => Promise<Response> | Response;
  uploadReference?: (input: RequestInfo | URL, init: RequestInit | undefined) => Promise<Response> | Response;
  uploadEmptySceneImage?: (input: RequestInfo | URL, init: RequestInit | undefined) => Promise<Response> | Response;
  selectEmptySceneImage?: (input: RequestInfo | URL, init: RequestInit | undefined) => Promise<Response> | Response;
  uploadCompleteSceneImage?: (input: RequestInfo | URL, init: RequestInit | undefined) => Promise<Response> | Response;
  associateCompleteImageRun?: (input: RequestInfo | URL, init: RequestInit | undefined) => Promise<Response> | Response;
  uploadChapterAssetFromRunAsset?: (input: RequestInfo | URL, init: RequestInit | undefined) => Promise<Response> | Response;
  uploadDirectChapterAsset?: (input: RequestInfo | URL, init: RequestInit | undefined) => Promise<Response> | Response;
  saveAssembly?: (input: RequestInfo | URL, init: RequestInit | undefined) => Promise<Response> | Response;
  lockFinalScene?: (input: RequestInfo | URL, init: RequestInit | undefined) => Promise<Response> | Response;
};

export type RenderChapterWorkspaceOptions = ChapterWorkspaceFetchMockOptions & { route?: string };

export function installChapterWorkspaceFetchMock(options: ChapterWorkspaceFetchMockOptions = {}) {
  const state = options.state ?? coursePlannerState();
  let scenePackage = options.scenePackage ?? studioScenePackageFixture();

  return installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path === "/api/workspace/runs" && (!init || init.method === "GET")) {
      return jsonResponse({ runs: [] });
    }
    if (path === "/api/workspace/state" && (!init || init.method === "GET")) {
      return jsonResponse({ source: null, elements: [], detectionVocabulary: [] });
    }
    if (path === "/api/course-planner/state" && (!init || init.method === "GET")) {
      return jsonResponse(state);
    }
    if (path.endsWith(`/chapters/${scenePackage.chapter_id}/scene-package`) && (!init || init.method === "GET")) {
      return options.fetchScenePackage?.(input, init) ?? jsonResponse({ scenePackage });
    }
    if (path.endsWith(`/chapters/${scenePackage.chapter_id}/scene-package/prompt`) && init?.method === "PATCH") {
      return options.updateScenePrompt?.(input, init) ?? jsonResponse({ scenePackage: await patchScenePrompt(scenePackage, init) });
    }
    if (path.endsWith(`/chapters/${scenePackage.chapter_id}/scene-package/references`) && init?.method === "POST") {
      return options.uploadReference?.(input, init) ?? jsonResponse({ scenePackage: recordNextPackage(appendReference(scenePackage, init)) });
    }
    if (path.endsWith(`/chapters/${scenePackage.chapter_id}/scene-package/empty-scene-images`) && init?.method === "POST") {
      return options.uploadEmptySceneImage?.(input, init) ?? jsonResponse({ scenePackage: recordNextPackage(appendEmptySceneImage(scenePackage, init)) });
    }
    if (path.endsWith(`/chapters/${scenePackage.chapter_id}/scene-package/current-empty-scene`) && init?.method === "POST") {
      return options.selectEmptySceneImage?.(input, init) ?? jsonResponse({ scenePackage: recordNextPackage(await selectCurrentEmptyScene(scenePackage, init)) });
    }
    if (path.endsWith(`/chapters/${scenePackage.chapter_id}/scene-package/complete-images`) && init?.method === "POST") {
      return options.uploadCompleteSceneImage?.(input, init) ?? jsonResponse({ scenePackage: recordNextPackage(appendCompleteSceneImage(scenePackage, init)) });
    }
    if (path.includes(`/chapters/${scenePackage.chapter_id}/scene-package/complete-images/`) && path.endsWith("/run") && init?.method === "PATCH") {
      return options.associateCompleteImageRun?.(input, init) ?? jsonResponse({ scenePackage: recordNextPackage(await patchCompleteImageRun(scenePackage, path, init)) });
    }
    if (path.endsWith(`/chapters/${scenePackage.chapter_id}/scene-package/chapter-assets`) && init?.method === "POST") {
      return options.uploadChapterAssetFromRunAsset?.(input, init) ?? jsonResponse({ scenePackage: recordNextPackage(appendRunAsset(scenePackage, init)) });
    }
    if (path.endsWith(`/chapters/${scenePackage.chapter_id}/scene-package/chapter-assets/direct-upload`) && init?.method === "POST") {
      return options.uploadDirectChapterAsset?.(input, init) ?? jsonResponse({ scenePackage: recordNextPackage(appendDirectAsset(scenePackage, init)) });
    }
    if (path.endsWith(`/chapters/${scenePackage.chapter_id}/scene-package/assembly`) && init?.method === "PUT") {
      return options.saveAssembly?.(input, init) ?? jsonResponse({ scenePackage: recordNextPackage(await replaceAssembly(scenePackage, init)) });
    }
    if (path.endsWith(`/chapters/${scenePackage.chapter_id}/scene-package/final-scene`) && init?.method === "POST") {
      return options.lockFinalScene?.(input, init) ?? jsonResponse({ scenePackage: recordNextPackage(lockFinalScene(scenePackage)) });
    }
    throw new Error(`Unexpected fetch call: ${path}`);
  });

  async function patchScenePrompt(current: ChapterScenePackage, init: RequestInit | undefined) {
    const body = await parseJsonBody<{
      promptText: string;
      sceneSpatialContract?: string;
      targetObjects?: ChapterScenePackage["target_objects"];
      avoidObjects?: ChapterScenePackage["avoid_objects"];
      promptConfirmations?: ChapterScenePackage["prompt_confirmations"];
    }>(init);
    scenePackage = {
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
    return scenePackage;
  }

  function recordNextPackage(next: ChapterScenePackage): ChapterScenePackage {
    scenePackage = next;
    return next;
  }
}

export function renderChapterWorkspace(options: RenderChapterWorkspaceOptions = {}) {
  const route = options.route ?? `/course-planner/chapters/${STUDIO_CHAPTER_ID}`;
  const restoreFetch = installChapterWorkspaceFetchMock(options);
  window.history.pushState({}, "", route);
  const rendered = render(App());
  return {
    ...rendered,
    restore: () => {
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

export function studioScenePackFixture(overrides: Partial<ScenePack> = {}): ScenePack {
  return {
    id: STUDIO_SCENE_PACK_ID,
    title: "室内家庭篇",
    intent: "围绕家庭室内高频行动组织 Chapter。",
    notes: "优先保留角色行动与物件关系。",
    status: "active",
    chapterIds: [STUDIO_CHAPTER_ID],
    chapterListLocked: false,
    ...overrides,
  };
}

export function studioChapterFixture(overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: STUDIO_CHAPTER_ID,
    scenePackId: STUDIO_SCENE_PACK_ID,
    title: "早餐厨房",
    summary: "厨房餐台和冰箱前的早晨动线。",
    seed: {
      scenePackId: STUDIO_SCENE_PACK_ID, scenePackTitle: "室内家庭篇", chapterId: STUDIO_CHAPTER_ID, chapterTitle: "早餐厨房",
      chapterIntent: "组织早餐准备与收拾的家庭互动。",
      sceneDomain: "indoor-home",
      dailyMoment: "morning",
      eventSeed: "孩子找牛奶、拿杯子、准备早餐。",
      spatialSeed: "餐台、冰箱和水槽形成清晰动线。",
      objectCoverageHint: ["milk cup", "breakfast bowl", "cloth"],
      characterConceptHint: {
        castMode: "main_cast_and_supporting_cast",
        mainCastHint: "主角孩子负责准备早餐。",
        supportingCastHint: "家长在旁边协助收拾。",
        referenceAssetIds: [],
        constraints: ["保持家庭主角一致", "不要出现画面文字"],
      },
      styleNotes: "温暖晨光、生活化绘本感。",
    },
    sortOrder: 1,
    status: "designing",
    ...overrides,
  };
}

export function studioScenePackageFixture(overrides: Partial<ChapterScenePackage> = {}): ChapterScenePackage {
  return {
    chapter_id: STUDIO_CHAPTER_ID,
    current_empty_scene_image_id: "empty_scene_001",
    prompt: {
      prompt_text: "Warm breakfast kitchen with a child reaching for cereal near the table.",
      scene_spatial_contract: "Table centered, fridge left, sink right, floor kept clear.",
      updated_at: "2026-07-03T11:00:00Z",
    },
    prompt_confirmations: {
      avoid_objects_reviewed: true,
      style_reference_mode: "selected",
    },
    cast_assignments: [{ id: "cast_main_child", character_ip_id: "child_ip_001", role_label: "main", action_intent: "Reach for the breakfast bowl while looking toward spilled milk.", reference_image_ids: ["reference_style_001"] }],
    reference_selections: [{ id: "reference_selection_001", reference_image_id: "reference_style_001", prompt_role: "style" }],
    target_objects: [
      {
        id: "target_object_bowl",
        label: "breakfast bowl",
        description: "Ceramic bowl placed near the child.",
        priority: "core",
      },
      {
        id: "target_object_cloth",
        label: "cloth",
        description: "Cleanup cloth ready beside the cup.",
        priority: "required",
      },
    ],
    avoid_objects: [{ id: "avoid_object_knife", label: "knife", description: "Avoid sharp props on the table." }],
    empty_scene_images: [
      {
        id: "empty_scene_001",
        original_filename: "empty-scene.png",
        storage_path: "scene_package/empty_scene_001.png",
        media_type: "image/png",
        width: 1024,
        height: 1024,
        status: "available",
        prompt_snapshot: "Warm breakfast kitchen without character cutouts.",
        reference_snapshot: snapshot(["reference_style_001"], null),
        created_at: "2026-07-03T11:01:00Z",
      },
    ],
    complete_images: [
      {
        id: "complete_scene_001",
        original_filename: "complete-scene.png",
        storage_path: "scene_package/complete_scene_001.png",
        media_type: "image/png",
        width: 1024,
        height: 1024,
        empty_scene_image_id: "empty_scene_001",
        status: "active",
        prompt_snapshot: "Warm breakfast kitchen with family action beats.",
        reference_snapshot: snapshot(["reference_style_001"], "empty_scene_001"),
        generation_note: "brighter morning light",
        pipeline_run_id: null,
        pipeline_run_status: null,
        created_at: "2026-07-03T11:02:00Z",
      },
    ],
    chapter_assets: [sceneAsset("chapter_asset_bowl", "Breakfast bowl", "bowl.png", "direct_upload", { linkedTargetObjectId: "target_object_bowl" })],
    assembly: studioAssemblyFixture(),
    final_scene: null,
    ...overrides,
  };
}

function studioAssemblyFixture(overrides: Partial<ChapterSceneAssemblyManifest> = {}): ChapterSceneAssemblyManifest {
  return {
    schema_version: 1,
    empty_scene_image_id: "empty_scene_001",
    empty_scene_size: { width: 1024, height: 1024 },
    placements: [{ id: "placement_bowl", asset_id: "chapter_asset_bowl", display_name: "Breakfast bowl", runtime_role: "target", transform: { cx: 0.42, cy: 0.58, w: 0.18, h: 0.18, rotation_deg: 0 }, group_id: null, requires_placed: [] }],
    groups: [],
    layer_order: ["placement_bowl"],
    updated_at: "2026-07-03T11:04:00Z",
    ...overrides,
  };
}

async function parseJsonBody<T>(init: RequestInit | undefined): Promise<T> {
  return JSON.parse(String(init?.body ?? "{}")) as T;
}

function appendReference(current: ChapterScenePackage, init: RequestInit | undefined): ChapterScenePackage {
  const body = init?.body as FormData;
  const selectionId = `reference_selection_${current.reference_selections.length + 1}`;
  const referenceId = `${selectionId}_image`;
  return {
    ...current,
    reference_selections: [
      ...current.reference_selections,
      {
        id: selectionId,
        reference_image_id: referenceId,
        prompt_role: (String(body.get("promptRole") ?? "other") as ChapterScenePackage["reference_selections"][number]["prompt_role"]),
      },
    ],
  };
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
        prompt_snapshot: String(body.get("promptSnapshot") ?? current.prompt.prompt_text),
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
    assembly: {
      ...current.assembly,
      empty_scene_image_id: body.emptySceneImageId,
    },
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
        prompt_snapshot: String(body.get("promptSnapshot") ?? current.prompt.prompt_text),
        reference_snapshot: snapshot(body.getAll("referenceImageIds").map(String), current.current_empty_scene_image_id, ""),
        generation_note: String(body.get("generationNote") ?? ""),
        pipeline_run_id: null,
        pipeline_run_status: null,
        created_at: "2026-07-03T11:07:00Z",
      },
    ],
  };
}

async function patchCompleteImageRun(
  current: ChapterScenePackage,
  path: string,
  init: RequestInit | undefined,
): Promise<ChapterScenePackage> {
  const body = await parseJsonBody<{ runId: string; runStatus?: string | null }>(init);
  const completeImageId = path.split("/complete-images/")[1]?.split("/run")[0] ?? "";
  return {
    ...current,
    complete_images: current.complete_images.map((image) =>
      image.id === completeImageId
        ? {
            ...image,
            pipeline_run_id: body.runId,
            pipeline_run_status: body.runStatus ?? null,
          }
        : image,
    ),
  };
}

function appendRunAsset(current: ChapterScenePackage, init: RequestInit | undefined): ChapterScenePackage {
  return appendAsset(current, init, "pipeline_run_asset");
}

function appendDirectAsset(current: ChapterScenePackage, init: RequestInit | undefined): ChapterScenePackage {
  return appendAsset(current, init, "direct_upload");
}

function appendAsset(current: ChapterScenePackage, init: RequestInit | undefined, sourceKind: "pipeline_run_asset" | "direct_upload"): ChapterScenePackage {
  const body = init?.body as FormData;
  const assetId = `chapter_asset_${String(current.chapter_assets.length + 1).padStart(3, "0")}`;
  return {
    ...current,
    chapter_assets: [
      ...current.chapter_assets,
      sceneAsset(assetId, String(body.get("displayName") ?? "Scene asset"), fileNameFromFormData(body, "file", "scene-asset.png"), sourceKind, {
        linkedTargetObjectId: nullableFormValue(body.get("linkedTargetObjectId")),
        sourceRunId: sourceKind === "pipeline_run_asset" ? String(body.get("sourceRunId") ?? "") : null,
        sourceRunAssetId: sourceKind === "pipeline_run_asset" ? String(body.get("sourceRunAssetId") ?? "") : null,
        sourceCompleteImageId: sourceKind === "pipeline_run_asset" ? nullableFormValue(body.get("sourceCompleteImageId")) : null,
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
      reference_snapshot: snapshot(current.reference_selections.map((selection) => selection.reference_image_id), current.current_empty_scene_image_id, ""),
      created_at: "2026-07-03T11:09:00Z",
    },
  };
}

function snapshot(referenceImageIds: string[], currentEmptySceneImageId: string | null, notes = "style board") {
  return { reference_image_ids: referenceImageIds, current_empty_scene_image_id: currentEmptySceneImageId, notes };
}

function sceneAsset(
  id: string,
  displayName: string,
  originalFilename: string,
  sourceKind: "pipeline_run_asset" | "direct_upload",
  options: {
    linkedTargetObjectId?: string | null;
    sourceRunId?: string | null;
    sourceRunAssetId?: string | null;
    sourceCompleteImageId?: string | null;
  } = {},
) {
  return {
    id,
    display_name: displayName,
    original_filename: originalFilename,
    storage_path: `scene_package/${id}.png`,
    media_type: "image/png" as const,
    lineage: {
      source_kind: sourceKind,
      source_run_id: options.sourceRunId ?? null,
      source_run_asset_id: options.sourceRunAssetId ?? null,
      source_complete_image_id: options.sourceCompleteImageId ?? null,
    },
    linked_target_object_id: options.linkedTargetObjectId ?? null,
    status: "available" as const,
    created_at: "2026-07-03T11:08:00Z",
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

const STUDIO_SCENE_PACK_ID = "scene_pack_home";
const STUDIO_CHAPTER_ID = "chapter_breakfast_kitchen";
