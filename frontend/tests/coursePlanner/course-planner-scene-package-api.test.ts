import {
  describe,
  expect,
  it,
  vi,
} from "../app/appTestHarness";

import {
  associateCompleteImageRun,
  fetchChapterScenePackage,
  lockEmptyBaseScene,
  saveChapterSceneAssembly,
  updateChapterScenePrompt,
  uploadChapterAssetFromRunAsset,
  uploadChapterSceneReference,
  uploadCompleteSceneImage,
  uploadEmptyBaseSceneCandidate,
} from "../../src/features/coursePlanner/api";
import type {
  ChapterSceneAssemblyManifest,
  ChapterScenePackage,
} from "../../src/features/coursePlanner/types";

describe("course planner scene package API client", () => {
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
    const referenceFile = new File(["reference"], "style-board.png", { type: "image/png" });
    const referenceResult = await uploadChapterSceneReference("chapter_001", referenceFile, referenceUploadInput(), fetcher);
    const baseFile = new File(["base"], "base-board.png", { type: "image/png" });
    const baseResult = await uploadEmptyBaseSceneCandidate("chapter_001", baseFile, baseCandidateUploadInput(), fetcher);
    const lockedResult = await lockEmptyBaseScene("chapter_001", "base_candidate_001", fetcher);
    const completeFile = new File(["complete"], "complete-board.png", { type: "image/png" });
    const completeResult = await uploadCompleteSceneImage("chapter_001", completeFile, completeImageUploadInput(), fetcher);
    const runResult = await associateCompleteImageRun("chapter_001", "complete_scene_001", runAssociationInput(), fetcher);
    const assetFile = new File(["asset"], "book.png", { type: "image/png" });
    const assetResult = await uploadChapterAssetFromRunAsset("chapter_001", assetFile, chapterAssetUploadInput(), fetcher);
    const assemblyResult = await saveChapterSceneAssembly("chapter_001", assemblyManifestFixture(), fetcher);

    expect(calls.map((call) => [call.input, call.init?.method ?? "GET"])).toEqual([
      ["/api/course-planner/chapters/chapter_001/scene-package", "GET"],
      ["/api/course-planner/chapters/chapter_001/scene-package/prompt", "PATCH"],
      ["/api/course-planner/chapters/chapter_001/scene-package/references", "POST"],
      ["/api/course-planner/chapters/chapter_001/scene-package/base-candidates", "POST"],
      ["/api/course-planner/chapters/chapter_001/scene-package/base-candidates/base_candidate_001/lock", "POST"],
      ["/api/course-planner/chapters/chapter_001/scene-package/complete-images", "POST"],
      ["/api/course-planner/chapters/chapter_001/scene-package/complete-images/complete_scene_001/run", "PATCH"],
      ["/api/course-planner/chapters/chapter_001/scene-package/chapter-assets", "POST"],
      ["/api/course-planner/chapters/chapter_001/scene-package/assembly", "PUT"],
    ]);
    expect(JSON.parse(String(calls[1].init?.body))).toEqual(promptPatchRequestPayload());
    expect(JSON.parse(String(calls[6].init?.body))).toEqual({ runId: "run_123", runStatus: "completed" });
    expect(JSON.parse(String(calls[8].init?.body))).toEqual(assemblyManifestFixture());
    expect(packageResult.chapter_id).toBe("chapter_001");
    expect(packageResult.prompt.prompt_text).toBe("Calm breakfast room.");
    expect(packageResult.references[0].prompt_role).toBe("style");
    expect(promptResult.target_objects[0].description).toBe("Yellow cover.");
    expect(referenceResult.references[0].notes).toBe("warm palette");
    expect(baseResult.base_candidates[0].reference_snapshot.reference_ids).toEqual(["reference_001", "reference_002"]);
    expect(lockedResult.locked_base_candidate_id).toBe("base_candidate_001");
    expect(completeResult.complete_images[0].variation_prompt).toBe("brighter morning light");
    expect(runResult.complete_images[0].pipeline_run_id).toBe("run_123");
    expect(assetResult.chapter_assets[0].lineage.source_run_id).toBe("run_123");
    expect(assemblyResult.assembly.layer_order).toEqual(["placement_001"]);
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

    const referenceFile = new File(["reference"], "style-board.png", { type: "image/png" });
    const baseFile = new File(["base"], "base-board.png", { type: "image/png" });
    const completeFile = new File(["complete"], "complete-board.png", { type: "image/png" });
    const assetFile = new File(["asset"], "book.png", { type: "image/png" });

    await uploadChapterSceneReference("chapter_001", referenceFile, referenceUploadInput(), fetcher);
    await uploadEmptyBaseSceneCandidate("chapter_001", baseFile, baseCandidateUploadInput(), fetcher);
    await uploadCompleteSceneImage("chapter_001", completeFile, completeImageUploadInput(), fetcher);
    await uploadChapterAssetFromRunAsset("chapter_001", assetFile, chapterAssetUploadInput(), fetcher);

    const referenceBody = calls[0].init?.body;
    const baseBody = calls[1].init?.body;
    const completeBody = calls[2].init?.body;
    const assetBody = calls[3].init?.body;

    expect(referenceBody).toBeInstanceOf(FormData);
    expect((referenceBody as FormData).get("file")).toBe(referenceFile);
    expect((referenceBody as FormData).get("promptRole")).toBe("style");
    expect((referenceBody as FormData).get("notes")).toBe("warm palette");

    expect(baseBody).toBeInstanceOf(FormData);
    expect((baseBody as FormData).get("file")).toBe(baseFile);
    expect((baseBody as FormData).get("promptSnapshot")).toBe("Custom base prompt snapshot.");
    expect((baseBody as FormData).getAll("referenceIds")).toEqual(["reference_001", "reference_002"]);

    expect(completeBody).toBeInstanceOf(FormData);
    expect((completeBody as FormData).get("file")).toBe(completeFile);
    expect((completeBody as FormData).get("promptSnapshot")).toBe("Custom complete prompt snapshot.");
    expect((completeBody as FormData).get("variationPrompt")).toBe("brighter morning light");
    expect((completeBody as FormData).getAll("referenceIds")).toEqual(["reference_001"]);

    expect(assetBody).toBeInstanceOf(FormData);
    expect((assetBody as FormData).get("file")).toBe(assetFile);
    expect((assetBody as FormData).get("sourceRunId")).toBe("run_123");
    expect((assetBody as FormData).get("sourceRunAssetId")).toBe("asset_source_001");
    expect((assetBody as FormData).get("displayName")).toBe("book");
    expect((assetBody as FormData).get("sourceCompleteImageId")).toBe("complete_scene_001");
    expect((assetBody as FormData).get("linkedTargetObjectId")).toBe("target_object_001");
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

function promptPatchInput() {
  return {
    promptText: "Calm breakfast room.",
    negativeConstraints: "No harsh shadows.",
    styleNotes: "Soft watercolor edges.",
    targetObjects: [
      {
        label: "book",
        description: "Yellow cover.",
        priority: "required" as const,
      },
    ],
  };
}

function promptPatchRequestPayload() {
  return {
    promptText: "Calm breakfast room.",
    negativeConstraints: "No harsh shadows.",
    styleNotes: "Soft watercolor edges.",
    targetObjects: [
      {
        label: "book",
        description: "Yellow cover.",
        priority: "required",
      },
    ],
  };
}

function referenceUploadInput() {
  return {
    promptRole: "style" as const,
    notes: "warm palette",
  };
}

function baseCandidateUploadInput() {
  return {
    referenceIds: ["reference_001", "reference_002"],
    promptSnapshot: "Custom base prompt snapshot.",
  };
}

function completeImageUploadInput() {
  return {
    variationPrompt: "brighter morning light",
    referenceIds: ["reference_001"],
    promptSnapshot: "Custom complete prompt snapshot.",
  };
}

function runAssociationInput() {
  return {
    runId: "run_123",
    runStatus: "completed",
  };
}

function chapterAssetUploadInput() {
  return {
    sourceRunId: "run_123",
    sourceRunAssetId: "asset_source_001",
    displayName: "book",
    sourceCompleteImageId: "complete_scene_001",
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
  if (input.endsWith("/scene-package/references") && init?.method === "POST") {
    return { scenePackage: scenePackageFixture() };
  }
  if (input.endsWith("/scene-package/base-candidates") && init?.method === "POST") {
    return { scenePackage: scenePackageFixture() };
  }
  if (input.endsWith("/base-candidates/base_candidate_001/lock") && init?.method === "POST") {
    return { scenePackage: { ...scenePackageFixture(), locked_base_candidate_id: "base_candidate_001" } };
  }
  if (input.endsWith("/scene-package/complete-images") && init?.method === "POST") {
    return { scenePackage: scenePackageFixture() };
  }
  if (input.endsWith("/complete-images/complete_scene_001/run") && init?.method === "PATCH") {
    return { scenePackage: scenePackageFixtureWithRunAssociation() };
  }
  if (input.endsWith("/scene-package/chapter-assets") && init?.method === "POST") {
    return { scenePackage: scenePackageFixture() };
  }
  if (input.endsWith("/scene-package/assembly") && init?.method === "PUT") {
    return { scenePackage: scenePackageFixture() };
  }
  return null;
}

function scenePackageFixture(): ChapterScenePackage {
  return {
    chapter_id: "chapter_001",
    locked_base_candidate_id: "base_candidate_001",
    prompt: {
      prompt_text: "Calm breakfast room.",
      negative_constraints: "No harsh shadows.",
      style_notes: "Soft watercolor edges.",
      updated_at: "2026-07-03T08:00:00Z",
    },
    target_objects: [
      {
        id: "target_object_001",
        label: "book",
        description: "Yellow cover.",
        priority: "required",
      },
    ],
    references: [
      {
        id: "reference_001",
        original_filename: "style-board.png",
        storage_path: "references/reference_001/style-board.png",
        media_type: "image/png",
        created_at: "2026-07-03T08:10:00Z",
        prompt_role: "style",
        notes: "warm palette",
      },
    ],
    base_candidates: [
      {
        id: "base_candidate_001",
        original_filename: "base-board.png",
        storage_path: "base-candidates/base_candidate_001/base-board.png",
        media_type: "image/png",
        width: 120,
        height: 80,
        status: "locked",
        prompt_snapshot: "Calm breakfast room.\nTarget objects: book\nStyle notes: Soft watercolor edges.\nNegative constraints: No harsh shadows.",
        reference_snapshot: {
          reference_ids: ["reference_001", "reference_002"],
          locked_base_candidate_id: null,
          notes: "",
        },
        created_at: "2026-07-03T08:15:00Z",
        locked_at: "2026-07-03T08:16:00Z",
      },
    ],
    complete_images: [
      {
        id: "complete_scene_001",
        original_filename: "complete-board.png",
        storage_path: "complete-images/complete_scene_001/complete-board.png",
        media_type: "image/png",
        width: 96,
        height: 64,
        base_candidate_id: "base_candidate_001",
        status: "active",
        prompt_snapshot: "Calm breakfast room.\nTarget objects: book\nStyle notes: Soft watercolor edges.\nNegative constraints: No harsh shadows.\nLocked empty base scene reference: base_candidate_001",
        reference_snapshot: {
          reference_ids: ["reference_001"],
          locked_base_candidate_id: "base_candidate_001",
          notes: "",
        },
        variation_prompt: "brighter morning light",
        pipeline_run_id: null,
        pipeline_run_status: null,
        created_at: "2026-07-03T08:20:00Z",
      },
    ],
    chapter_assets: [
      {
        id: "asset_001",
        display_name: "book",
        original_filename: "book.png",
        storage_path: "chapter-assets/asset_001/book.png",
        media_type: "image/png",
        lineage: {
          source_run_id: "run_123",
          source_run_asset_id: "asset_source_001",
          source_complete_image_id: "complete_scene_001",
        },
        linked_target_object_id: "target_object_001",
        status: "available",
        created_at: "2026-07-03T08:30:00Z",
      },
    ],
    assembly: assemblyManifestFixture(),
  };
}

function scenePackageFixtureWithRunAssociation(): ChapterScenePackage {
  return {
    ...scenePackageFixture(),
    complete_images: scenePackageFixture().complete_images.map((item) => ({
      ...item,
      pipeline_run_id: "run_123",
      pipeline_run_status: "completed",
    })),
  };
}

function assemblyManifestFixture(): ChapterSceneAssemblyManifest {
  return {
    schema_version: 1,
    base_candidate_id: "base_candidate_001",
    base_size: {
      width: 120,
      height: 80,
    },
    placements: [
      {
        id: "placement_001",
        asset_id: "asset_001",
        display_name: "book",
        runtime_role: "target",
        transform: {
          cx: 0.5,
          cy: 0.45,
          w: 0.2,
          h: 0.24,
          rotation_deg: 0,
        },
        group_id: "group_001",
        requires_placed: [],
      },
    ],
    groups: [
      {
        id: "group_001",
        display_name: "foreground books",
        placement_ids: ["placement_001"],
      },
    ],
    layer_order: ["placement_001"],
    updated_at: "2026-07-03T08:40:00Z",
  };
}
