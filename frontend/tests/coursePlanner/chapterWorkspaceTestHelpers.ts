import { installFetchMock, jsonResponse } from "../app/appTestHarness";

import type { CoursePlannerState, ImageAttempt, PromptVersion } from "../../src/features/coursePlanner/types";

export type FetchMockOptions = {
  state: CoursePlannerState;
  createPromptVersion?: (input: RequestInfo | URL, init: RequestInit | undefined) => Promise<Response> | Response;
  createImageAttempt?: (input: RequestInfo | URL, init: RequestInit | undefined) => Promise<Response> | Response;
  uploadImageAttempt?: (input: RequestInfo | URL, init: RequestInit | undefined) => Promise<Response> | Response;
  updatePromptVersion?: (input: RequestInfo | URL, init: RequestInit | undefined) => Promise<Response> | Response;
  generatePromptPackage?: (input: RequestInfo | URL, init: RequestInit | undefined) => Promise<Response> | Response;
  adoptPromptVersion?: (input: RequestInfo | URL, init: RequestInit | undefined) => Promise<Response> | Response;
};

export function installChapterWorkspaceFetchMock(options: FetchMockOptions) {
  return installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (input === "/api/workspace/runs" && (!init || init.method === "GET")) {
      return jsonResponse({ runs: [] });
    }
    if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
      return jsonResponse({ source: null, elements: [], detectionVocabulary: [] });
    }
    if (input === "/api/course-planner/state" && (!init || init.method === "GET")) {
      return jsonResponse(options.state);
    }
    if (String(input).endsWith("/prompt-versions") && init?.method === "POST") {
      return options.createPromptVersion?.(input, init) ?? jsonResponse({ promptVersion: promptVersion() });
    }
    if (String(input).endsWith("/image-attempts") && init?.method === "POST") {
      return options.createImageAttempt?.(input, init) ?? jsonResponse({ imageAttempt: imageAttempt() });
    }
    if (String(input).endsWith("/image-attempts/upload") && init?.method === "POST") {
      return options.uploadImageAttempt?.(input, init) ?? jsonResponse({ imageAttempt: imageAttempt() });
    }
    if (String(input).includes("/prompt-versions/") && init?.method === "PATCH") {
      return options.updatePromptVersion?.(input, init) ?? jsonResponse({ promptVersion: promptVersion() });
    }
    if (String(input).endsWith("/adopt") && init?.method === "POST") {
      return options.adoptPromptVersion?.(input, init) ?? jsonResponse({
        chapter: coursePlannerState().chaptersByScenePackId.scene_pack_home[0],
        promptVersions: [promptVersion()],
      });
    }
    if (String(input).endsWith("/prompt-package") && init?.method === "POST") {
      return options.generatePromptPackage?.(input, init) ?? jsonResponse({ promptVersion: promptVersion() });
    }
    throw new Error(`Unexpected fetch call: ${String(input)}`);
  });
}

export function coursePlannerState({
  promptVersions = [],
  selectedPromptVersionId = null,
}: {
  promptVersions?: PromptVersion[];
  selectedPromptVersionId?: string | null;
} = {}): CoursePlannerState {
  return {
    scenePacks: [
      {
        id: "scene_pack_home",
        title: "室内家庭篇",
        intent: "围绕家庭室内高频行动组织 Chapter。",
        notes: null,
        status: "active",
        chapterIds: ["chapter_kitchen"],
        chapterListLocked: false,
      },
    ],
    activeScenePackId: "scene_pack_home",
    candidatesByScenePackId: {},
    chaptersByScenePackId: {
      scene_pack_home: [
        {
          id: "chapter_kitchen",
          scenePackId: "scene_pack_home",
          title: "厨房早餐打翻",
          summary: "早餐时牛奶杯打翻，孩子和家长一起处理。",
          seed: chapterSeed(),
          sortOrder: 1,
          status: promptVersions.length > 0 ? "prompt_ready" : "designing",
          adoptedPromptVersionId: promptVersions.find((version) => version.status === "adopted")?.id ?? null,
        },
      ],
    },
    promptVersionsByChapterId: { chapter_kitchen: promptVersions },
    imageAttemptsByVersionId: {},
    selectedChapterId: "chapter_kitchen",
    selectedPromptVersionId,
    asyncStatus: {},
    tasks: [],
  };
}

function chapterSeed() {
  return {
    scenePackId: "scene_pack_home",
    scenePackTitle: "室内家庭篇",
    chapterId: "chapter_kitchen",
    chapterTitle: "厨房早餐打翻",
    chapterIntent: "让画面表现打翻后一起收拾的家庭互动。",
    sceneDomain: "home kitchen",
    dailyMoment: "breakfast",
    eventSeed: "早餐时牛奶杯打翻，孩子和家长一起处理。",
    spatialSeed: "厨房餐台、冰箱和水槽形成清晰动线。",
    objectCoverageHint: ["milk cup", "cloth", "breakfast plate"],
    characterConceptHint: {
      castMode: "main_cast_and_supporting_cast" as const,
      mainCastHint: "main child and parent",
      supportingCastHint: "younger sibling watches from chair",
      referenceAssetIds: [],
      constraints: ["consistent family cast", "no text on image"],
    },
    styleNotes: "warm storybook style",
  };
}

export function promptVersion(overrides: Partial<PromptVersion> = {}): PromptVersion {
  return {
    id: "prompt_version_001",
    chapterId: "chapter_kitchen",
    versionLabel: "V001",
    title: "早餐厨房构图",
    status: "prompt_ready",
    sceneDirectorPlan: {
      storyEvent: "Milk spills during breakfast and the family cleans together.",
      sceneComposition: "Three-quarter kitchen counter view with the cup in the foreground.",
      spatialStructure: "Counter, fridge, and sink form a readable triangle.",
      characterArrangement: "Child in foreground, parent beside sink, sibling seated nearby.",
      actionDesign: "Child reaches for cloth while parent steadies the cup.",
      styleAndConstraints: "Warm storybook image, no text, no extra limbs.",
    },
    objectPlan: {
      coreObjects: [{ name: "milk cup", roleInScene: "spilled object", placementHint: "front counter", priority: "core" }],
      requiredObjects: [{ name: "cloth", roleInScene: "cleanup action", placementHint: "child hand", priority: "required" }],
      recommendedObjects: [{ name: "breakfast plate", roleInScene: "daily context", placementHint: "table edge", priority: "recommended" }],
      avoidOrMoveObjects: [{ name: "sharp knife", roleInScene: "avoid danger tone", priority: "avoid" }],
    },
    promptPackage: {
      fullPrompt: "Draw a warm breakfast kitchen cleanup scene.",
      shortPrompt: null,
      negativeConstraints: "No text, no duplicate hands.",
      revisionPrompt: null,
    },
    sourceVersionId: null,
    imageAttemptIds: [],
    ...overrides,
  };
}

export function imageAttempt(overrides: Partial<ImageAttempt> = {}): ImageAttempt {
  return {
    id: "attempt_001",
    promptVersionId: "prompt_version_001",
    uploadedImageId: "kitchen.png",
    status: "uploaded",
    aiReview: null,
    humanDecision: null,
    pipelineImportId: null,
    ...overrides,
  };
}

export function toSnakeSceneDirectorPlan(plan: PromptVersion["sceneDirectorPlan"]) {
  return {
    story_event: plan.storyEvent,
    scene_composition: plan.sceneComposition,
    spatial_structure: plan.spatialStructure,
    character_arrangement: plan.characterArrangement,
    action_design: plan.actionDesign,
    style_and_constraints: plan.styleAndConstraints,
  };
}

export function toSnakeObjectPlan(plan: PromptVersion["objectPlan"]) {
  return {
    core_objects: plan.coreObjects.map(toSnakePlannedObject),
    required_objects: plan.requiredObjects.map(toSnakePlannedObject),
    recommended_objects: plan.recommendedObjects.map(toSnakePlannedObject),
    avoid_or_move_objects: plan.avoidOrMoveObjects.map(toSnakePlannedObject),
  };
}

function toSnakePlannedObject(object: PromptVersion["objectPlan"]["coreObjects"][number]) {
  return {
    name: object.name,
    role_in_scene: object.roleInScene,
    placement_hint: object.placementHint ?? null,
    priority: object.priority,
  };
}
