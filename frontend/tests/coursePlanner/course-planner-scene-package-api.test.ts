import {
  describe,
  expect,
  it,
  vi,
} from "../app/appTestHarness";

import {
  deleteChapterAsset,
  duplicateChapterAsset,
  fetchChapterScenePackage,
  listGeneratedChapterAssets,
  lockFinalChapterScene,
  materializeGeneratedChapterAsset,
  saveChapterSceneAssembly,
  selectEmptySceneImage,
  updateChapterScenePrompt,
  uploadCompleteSceneImage,
  uploadDirectChapterAsset,
  uploadEmptySceneImage,
} from "../../src/features/coursePlanner/api";
import type { ChapterSceneAssemblyManifest } from "../../src/features/coursePlanner/types";
import {
  coursePlannerState,
  studioScenePackageFixture,
} from "./chapterWorkspaceTestHelpers";

describe("course planner scene package API client", () => {
  it("exposes chapter workspace fixtures through the scene-package contract only", () => {
    const state = coursePlannerState();
    const scenePackage = studioScenePackageFixture();

    expect(state.selectedChapterId).toBe("chapter_breakfast_kitchen");
    expect(Object.keys(state).sort()).toEqual([
      "activeScenePackId",
      "asyncStatus",
      "candidatesByScenePackId",
      "chaptersByScenePackId",
      "scenePacks",
      "selectedChapterId",
      "tasks",
    ]);
    expect(scenePackage.chapter_id).toBe("chapter_breakfast_kitchen");
    expect(scenePackage.prompt.prompt_text).toContain("breakfast");
  });

  it("uses scene-package routes and keeps the new package contract in snake_case", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input: String(input), init });
      return new Response(JSON.stringify(scenePackageResponseFor(String(input), init)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const packageResult = await fetchChapterScenePackage("chapter_001", fetcher);
    const promptResult = await updateChapterScenePrompt("chapter_001", promptPatchInput(), fetcher);
    const emptyFile = new File(["empty"], "empty.png", { type: "image/png" });
    const emptyResult = await uploadEmptySceneImage("chapter_001", emptyFile, emptySceneUploadInput(), fetcher);
    const selectedResult = await selectEmptySceneImage("chapter_001", "empty_scene_001", fetcher);
    const completeFile = new File(["complete"], "complete.png", { type: "image/png" });
    const completeResult = await uploadCompleteSceneImage("chapter_001", completeFile, completeImageUploadInput(), fetcher);
    const assetFile = new File(["asset"], "pillow.png", { type: "image/png" });
    const assetResult = await uploadDirectChapterAsset("chapter_001", assetFile, directAssetUploadInput(), fetcher);
    const assemblyResult = await saveChapterSceneAssembly("chapter_001", assemblyManifestFixture(), fetcher);
    const finalSceneResult = await lockFinalChapterScene(
      "chapter_001",
      new File(["final"], "final.png", { type: "image/png" }),
      fetcher,
    );

    expect(calls.map((call) => [call.input, call.init?.method ?? "GET"])).toEqual([
      ["/api/course-planner/chapters/chapter_001/scene-package", "GET"],
      ["/api/course-planner/chapters/chapter_001/scene-package/prompt", "PATCH"],
      ["/api/course-planner/chapters/chapter_001/scene-package/empty-scene-images", "POST"],
      ["/api/course-planner/chapters/chapter_001/scene-package/current-empty-scene", "POST"],
      ["/api/course-planner/chapters/chapter_001/scene-package/complete-images", "POST"],
      ["/api/course-planner/chapters/chapter_001/scene-package/chapter-assets/direct-upload", "POST"],
      ["/api/course-planner/chapters/chapter_001/scene-package/assembly", "PUT"],
      ["/api/course-planner/chapters/chapter_001/scene-package/final-scene", "POST"],
    ]);
    expect(JSON.parse(String(calls[1].init?.body))).toEqual(promptPatchRequestPayload());
    expect(JSON.parse(String(calls[3].init?.body))).toEqual({ emptySceneImageId: "empty_scene_001" });
    expect(JSON.parse(String(calls[6].init?.body))).toEqual(assemblyManifestFixture());
    expect(packageResult.chapter_id).toBe("chapter_001");
    expect(packageResult.prompt.prompt_text).toBe("Low-shadow room scene.");
    expect(packageResult.prompt_confirmations.avoid_objects_reviewed).toBe(true);
    expect(promptResult.target_objects[0].description).toBe("Yellow cover.");
    expect(emptyResult.empty_scene_images[0].reference_snapshot.reference_image_ids).toEqual(["reference_001", "reference_002"]);
    expect(selectedResult.current_empty_scene_image_id).toBe("empty_scene_001");
    expect(completeResult.complete_images[0].generation_note).toBe("brighter morning light");
    expect(assetResult.chapter_assets[0].lineage.source_kind).toBe("direct_upload");
    expect(assemblyResult.assembly.layer_order).toEqual(["placement_001"]);
    expect(finalSceneResult.final_scene?.empty_scene_image_id).toBe("empty_scene_001");
  });

  it("uploads and selects Empty Scene Images without lock endpoints", async () => {
    const fetcher = scenePackageFetcher();
    const file = new File(["png"], "empty.png", { type: "image/png" });

    await uploadEmptySceneImage("chapter_001", file, {}, fetcher);
    await selectEmptySceneImage("chapter_001", "empty_scene_001", fetcher);

    expect(fetcher.calls.map(([input, init]) => [input, init?.method])).toEqual([
      ["/api/course-planner/chapters/chapter_001/scene-package/empty-scene-images", "POST"],
      ["/api/course-planner/chapters/chapter_001/scene-package/current-empty-scene", "POST"],
    ]);
  });

  it("duplicates and deletes Chapter Assets through scene-package routes without request bodies", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input: String(input), init });
      return new Response(JSON.stringify(scenePackageResponseFor(String(input), init)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await duplicateChapterAsset("chapter_001", "chapter_asset_001", fetcher);
    await deleteChapterAsset("chapter_001", "chapter_asset_001", fetcher);

    expect(calls.map((call) => [call.input, call.init?.method, call.init?.body ?? null])).toEqual([
      ["/api/course-planner/chapters/chapter_001/scene-package/chapter-assets/chapter_asset_001/duplicate", "POST", null],
      ["/api/course-planner/chapters/chapter_001/scene-package/chapter-assets/chapter_asset_001", "DELETE", null],
    ]);
  });

  it("lists and materializes generated Chapter Assets through the scene-package contract", async () => {
    const fetcher = scenePackageFetcher();

    const generatedAssets = await listGeneratedChapterAssets("chapter_001", fetcher);
    const materialized = await materializeGeneratedChapterAsset(
      "chapter_001",
      {
        completeSceneImageId: "complete_scene_001",
        pipelineRunId: "run_current",
        runAssetId: "element_good",
      },
      fetcher,
    );

    expect(fetcher.calls.map(([input, init]) => [input, init?.method ?? "GET"])).toEqual([
      ["/api/course-planner/chapters/chapter_001/scene-package/generated-assets", "GET"],
      ["/api/course-planner/chapters/chapter_001/scene-package/generated-assets/materialize", "POST"],
    ]);
    expect(JSON.parse(String(fetcher.calls[1][1]?.body))).toEqual({
      completeSceneImageId: "complete_scene_001",
      pipelineRunId: "run_current",
      runAssetId: "element_good",
    });
    expect(generatedAssets).toEqual([
      expect.objectContaining({
        run_asset_id: "element_good",
        state: "available",
        width: 18,
        height: 14,
      }),
      expect.objectContaining({
        run_asset_id: "element_missing_file",
        state: "unavailable",
        unavailable_reason: "Generated asset image file is missing.",
      }),
      expect.objectContaining({
        run_asset_id: "element_added",
        state: "added",
        chapter_asset_id: "chapter_asset_generated_001",
      }),
    ]);
    expect(materialized.chapterAsset.lineage.source_kind).toBe("generated_asset");
    expect(materialized.scenePackage.chapter_assets[0].lineage.source_kind).toBe("generated_asset");
  });

  it("uploads direct Scene Assets without run lineage fields", async () => {
    const fetcher = scenePackageFetcher();
    const file = new File(["png"], "pillow.png", { type: "image/png" });

    await uploadDirectChapterAsset(
      "chapter_001",
      file,
      { displayName: "抱枕", linkedTargetObjectId: "target_001" },
      fetcher,
    );

    const [, init] = fetcher.calls[0];
    const body = init?.body as FormData;
    expect(body.get("displayName")).toBe("抱枕");
    expect(body.get("sourceRunId")).toBeNull();
  });

  it("builds multipart upload payloads with explicit string fields", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input: String(input), init });
      return new Response(JSON.stringify(scenePackageResponseFor(String(input), init)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const emptyFile = new File(["empty"], "empty.png", { type: "image/png" });
    const completeFile = new File(["complete"], "complete.png", { type: "image/png" });
    const assetFile = new File(["asset"], "pillow.png", { type: "image/png" });

    await uploadEmptySceneImage("chapter_001", emptyFile, emptySceneUploadInput(), fetcher);
    await uploadCompleteSceneImage("chapter_001", completeFile, completeImageUploadInput(), fetcher);
    await uploadDirectChapterAsset("chapter_001", assetFile, directAssetUploadInput(), fetcher);

    const emptyBody = calls[0].init?.body as FormData;
    const completeBody = calls[1].init?.body as FormData;
    const assetBody = calls[2].init?.body as FormData;

    expect(emptyBody.get("file")).toBe(emptyFile);
    expect(emptyBody.get("promptSnapshot")).toBeNull();
    expect(emptyBody.getAll("referenceImageIds")).toEqual([]);
    expect(completeBody.get("file")).toBe(completeFile);
    expect(completeBody.get("promptSnapshot")).toBeNull();
    expect(completeBody.get("generationNote")).toBe("brighter morning light");
    expect(completeBody.getAll("referenceImageIds")).toEqual([]);
    expect(assetBody.get("file")).toBe(assetFile);
    expect(assetBody.get("displayName")).toBe("抱枕");
    expect(assetBody.get("sourceRunId")).toBeNull();
    expect(assetBody.get("linkedTargetObjectId")).toBe("target_object_001");
  });

  it("sends only supplied optional fields when patching chapter scene prompt", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input: String(input), init });
      return new Response(JSON.stringify(scenePackageResponseFor(String(input), init)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await updateChapterScenePrompt("chapter_001", { promptText: "Brighter breakfast room." }, fetcher);

    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      promptText: "Brighter breakfast room.",
    });
  });

});

function scenePackageFetcher() {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push([String(input), init]);
    return new Response(JSON.stringify(scenePackageResponseFor(String(input), init)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch & { calls: Array<[string, RequestInit | undefined]> };
  fetcher.calls = calls;
  return fetcher;
}

function promptPatchInput() {
  return {
    promptText: "Low-shadow room scene.",
    sceneSpatialContract: "Bed against back wall, desk by window, floor kept clear.",
    targetObjects: [
      {
        label: "book",
        description: "Yellow cover.",
        priority: "required" as const,
      },
    ],
    avoidObjects: [{ label: "shattered glass", description: "unsafe prop" }],
    promptConfirmations: {
      avoidObjectsReviewed: true,
    },
  };
}

function promptPatchRequestPayload() {
  return {
    promptText: "Low-shadow room scene.",
    sceneSpatialContract: "Bed against back wall, desk by window, floor kept clear.",
    targetObjects: [
      {
        label: "book",
        description: "Yellow cover.",
        priority: "required",
      },
    ],
    avoidObjects: [{ label: "shattered glass", description: "unsafe prop" }],
    promptConfirmations: {
      avoidObjectsReviewed: true,
    },
  };
}

function emptySceneUploadInput() {
  return {};
}

function completeImageUploadInput() {
  return {
    generationNote: "brighter morning light",
  };
}

function directAssetUploadInput() {
  return {
    displayName: "抱枕",
    linkedTargetObjectId: "target_object_001",
  };
}

function scenePackageResponseFor(input: string, init?: RequestInit): unknown {
  if (input.endsWith("/scene-package") && (!init || init.method === "GET")) {
    return { scenePackage: scenePackageFixture() };
  }
  if (input.endsWith("/scene-package/prompt") && init?.method === "PATCH") {
    return { scenePackage: scenePackageFixture() };
  }
  if (input.endsWith("/scene-package/empty-scene-images") && init?.method === "POST") {
    return { scenePackage: scenePackageFixture() };
  }
  if (input.endsWith("/scene-package/current-empty-scene") && init?.method === "POST") {
    return { scenePackage: scenePackageFixture() };
  }
  if (input.endsWith("/scene-package/complete-images") && init?.method === "POST") {
    return { scenePackage: scenePackageFixture() };
  }
  if (input.endsWith("/scene-package/chapter-assets/direct-upload") && init?.method === "POST") {
    return { scenePackage: scenePackageFixture() };
  }
  if (input.endsWith("/scene-package/chapter-assets/chapter_asset_001/duplicate") && init?.method === "POST") {
    return { scenePackage: scenePackageFixture() };
  }
  if (input.endsWith("/scene-package/chapter-assets/chapter_asset_001") && init?.method === "DELETE") {
    return { scenePackage: scenePackageFixture() };
  }
  if (input.endsWith("/scene-package/generated-assets") && (!init || init.method === "GET")) {
    return { generatedAssets: generatedAssetFixtures() };
  }
  if (input.endsWith("/scene-package/generated-assets/materialize") && init?.method === "POST") {
    return {
      chapterAsset: generatedChapterAssetFixture(),
      scenePackage: {
        ...scenePackageFixture(),
        chapter_assets: [generatedChapterAssetFixture()],
      },
    };
  }
  if (input.endsWith("/scene-package/assembly") && init?.method === "PUT") {
    return { scenePackage: scenePackageFixture() };
  }
  if (input.endsWith("/scene-package/final-scene") && init?.method === "POST") {
    return { scenePackage: scenePackageFixture() };
  }
  return null;
}

function scenePackageFixture() {
  return {
    chapter_id: "chapter_001",
    current_empty_scene_image_id: "empty_scene_001",
    prompt: promptFixture(),
    prompt_confirmations: promptConfirmationsFixture(),
    cast_assignments: castAssignmentFixtures(),
    reference_selections: referenceSelectionFixtures(),
    target_objects: targetObjectFixtures(),
    target_object_exemptions: [],
    avoid_objects: avoidObjectFixtures(),
    empty_scene_images: emptySceneImageFixtures(),
    complete_images: completeImageFixtures(),
    chapter_assets: chapterAssetFixtures(),
    assembly: assemblyManifestFixture(),
    final_scene: finalSceneFixture(),
  };
}

function promptFixture() {
  return {
    prompt_text: "Low-shadow room scene.",
    scene_spatial_contract: "Bed against back wall, desk by window, floor kept clear.",
    updated_at: "2026-07-03T08:00:00Z",
  };
}

function promptConfirmationsFixture() {
  return {
    avoid_objects_reviewed: true,
    style_reference_mode: "confirmed_empty",
  };
}

function castAssignmentFixtures() {
  return [
    {
      id: "cast_assignment_001",
      character_ip_id: "character_001",
      role_label: "lead",
      action_intent: "Reaches for cloth.",
      reference_image_ids: ["reference_001"],
    },
  ];
}

function referenceSelectionFixtures() {
  return [
    {
      id: "reference_selection_001",
      reference_image_id: "reference_001",
      prompt_role: "style",
    },
  ];
}

function targetObjectFixtures() {
  return [
    {
      id: "target_object_001",
      label: "book",
      description: "Yellow cover.",
      priority: "required",
    },
  ];
}

function avoidObjectFixtures() {
  return [
    {
      id: "avoid_object_001",
      label: "shattered glass",
      description: "unsafe prop",
    },
  ];
}

function emptySceneImageFixtures() {
  return [
    {
      id: "empty_scene_001",
      original_filename: "empty.png",
      storage_path: "empty_scene_images/empty_scene_001.png",
      media_type: "image/png",
      width: 120,
      height: 80,
      status: "available",
      prompt_snapshot: "Custom empty prompt snapshot.",
      reference_snapshot: {
        reference_image_ids: ["reference_001", "reference_002"],
        current_empty_scene_image_id: null,
        notes: "",
      },
      created_at: "2026-07-03T08:10:00Z",
    },
  ];
}

function completeImageFixtures() {
  return [
    {
      id: "complete_scene_001",
      original_filename: "complete.png",
      storage_path: "complete_images/complete_scene_001.png",
      media_type: "image/png",
      width: 120,
      height: 80,
      empty_scene_image_id: "empty_scene_001",
      status: "active",
      prompt_snapshot: "Custom complete prompt snapshot.",
      reference_snapshot: {
        reference_image_ids: ["reference_001"],
        current_empty_scene_image_id: "empty_scene_001",
        notes: "",
      },
      generation_note: "brighter morning light",
      pipeline_run_id: null,
      pipeline_run_status: null,
      created_at: "2026-07-03T08:20:00Z",
    },
  ];
}

function chapterAssetFixtures() {
  return [
    {
      id: "chapter_asset_001",
      display_name: "抱枕",
      original_filename: "pillow.png",
      storage_path: "chapter_assets/chapter_asset_001.png",
      media_type: "image/png",
      lineage: {
        source_kind: "direct_upload",
      },
      linked_target_object_id: "target_object_001",
      status: "available",
      created_at: "2026-07-03T08:25:00Z",
    },
  ];
}

function generatedAssetFixtures() {
  return [
    {
      complete_scene_image_id: "complete_scene_001",
      pipeline_run_id: "run_current",
      run_asset_id: "element_good",
      display_name: "book",
      state: "available",
      width: 18,
      height: 14,
      unavailable_reason: null,
      chapter_asset_id: null,
    },
    {
      complete_scene_image_id: "complete_scene_001",
      pipeline_run_id: "run_current",
      run_asset_id: "element_missing_file",
      display_name: "lamp",
      state: "unavailable",
      width: null,
      height: null,
      unavailable_reason: "Generated asset image file is missing.",
      chapter_asset_id: null,
    },
    {
      complete_scene_image_id: "complete_scene_001",
      pipeline_run_id: "run_current",
      run_asset_id: "element_added",
      display_name: "pillow",
      state: "added",
      width: 18,
      height: 14,
      unavailable_reason: null,
      chapter_asset_id: "chapter_asset_generated_001",
    },
  ];
}

function generatedChapterAssetFixture() {
  return {
    id: "chapter_asset_generated_001",
    display_name: "book",
    original_filename: "element_good.png",
    storage_path: "chapter_assets/chapter_asset_generated_001.png",
    media_type: "image/png",
    lineage: {
      source_kind: "generated_asset",
      complete_scene_image_id: "complete_scene_001",
      pipeline_run_id: "run_current",
      run_asset_id: "element_good",
    },
    linked_target_object_id: null,
    status: "available",
    created_at: "2026-07-03T08:26:00Z",
  };
}

function finalSceneFixture() {
  return {
    id: "final_scene_001",
    original_filename: "final.png",
    storage_path: "final_scene/final_scene_001.png",
    media_type: "image/png",
    width: 120,
    height: 80,
    empty_scene_image_id: "empty_scene_001",
    assembly_snapshot: assemblyManifestFixture(),
    prompt_snapshot: "Custom final prompt snapshot.",
    reference_snapshot: {
      reference_image_ids: ["reference_001"],
      current_empty_scene_image_id: "empty_scene_001",
      notes: "",
    },
    created_at: "2026-07-03T08:40:00Z",
  };
}

function assemblyManifestFixture(): ChapterSceneAssemblyManifest {
  return {
    schema_version: 1,
    empty_scene_image_id: "empty_scene_001",
    empty_scene_size: { width: 120, height: 80 },
    placements: [
      {
        id: "placement_001",
        asset_id: "chapter_asset_001",
        display_name: "抱枕",
        runtime_role: "target",
        transform: {
          cx: 0.5,
          cy: 0.5,
          w: 0.3,
          h: 0.3,
          rotation_deg: 0,
        },
        group_id: null,
        requires_placed: [],
      },
    ],
    groups: [],
    layer_order: ["placement_001"],
    updated_at: "2026-07-03T08:30:00Z",
  };
}
