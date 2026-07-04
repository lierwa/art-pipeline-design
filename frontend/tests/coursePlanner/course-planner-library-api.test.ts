import {
  describe,
  expect,
  it,
  vi,
} from "../app/appTestHarness";

import {
  assignCharacterIpToChapter,
  importCompleteSceneImageToPipeline,
  listCharacterIps,
  listReferenceLibraryImages,
  selectChapterReferenceImage,
  uploadReferenceLibraryImage,
} from "../../src/features/coursePlanner/api";

describe("course planner library API client", () => {
  it("uses library and chapter selection routes as the only writable fact sources", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input: String(input), init });
      return new Response(JSON.stringify(responseFor(String(input), init)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const characterIps = await listCharacterIps(fetcher);
    const referenceImages = await listReferenceLibraryImages(fetcher);
    const referenceFile = new File(["png"], "style.png", { type: "image/png" });
    const referenceImage = await uploadReferenceLibraryImage(referenceFile, {
      tags: ["style", "团团"],
      notes: "soft storybook style",
    }, fetcher);
    const referenceSelection = await selectChapterReferenceImage("chapter_001", {
      referenceImageId: "reference_style_001",
      promptRole: "style",
    }, fetcher);
    const castAssignment = await assignCharacterIpToChapter("chapter_001", {
      characterIpId: "character_ip_001",
      roleLabel: "main",
      actionIntent: "sorts breakfast items",
      referenceImageIds: ["reference_style_001"],
    }, fetcher);

    expect(calls.map((call) => [call.input, call.init?.method ?? "GET"])).toEqual([
      ["/api/course-planner/character-ips", "GET"],
      ["/api/course-planner/reference-library/images", "GET"],
      ["/api/course-planner/reference-library/images", "POST"],
      ["/api/course-planner/chapters/chapter_001/scene-package/reference-selections", "POST"],
      ["/api/course-planner/chapters/chapter_001/scene-package/cast-assignments", "POST"],
    ]);
    expect(characterIps[0]?.display_name).toBe("团团");
    expect(referenceImages[0]?.original_filename).toBe("style.png");
    expect(referenceImage.id).toBe("reference_style_001");
    expect((calls[2].init?.body as FormData).getAll("tags")).toEqual(["style", "团团"]);
    expect(referenceSelection.reference_selections[0]?.prompt_role).toBe("style");
    expect(castAssignment.cast_assignments[0]?.character_ip_id).toBe("character_ip_001");
  });

  it("imports complete images through the scene-package import route", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input: String(input), init });
      return new Response(JSON.stringify(responseFor(String(input), init)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const importResult = await importCompleteSceneImageToPipeline("chapter_001", "complete_scene_001", fetcher);

    expect(calls.map((call) => [call.input, call.init?.method ?? "GET"])).toEqual([
      ["/api/course-planner/chapters/chapter_001/scene-package/complete-images/complete_scene_001/import", "POST"],
    ]);
    expect(importResult.run.id).toBe("run_complete_001");
    expect(importResult.scenePackage.complete_images[0]?.pipeline_run_id).toBe("run_complete_001");
  });
});

function responseFor(input: string, init?: RequestInit): unknown {
  if (input.endsWith("/character-ips") && (!init || init.method === "GET")) {
    return { characterIps: [characterIpFixture()] };
  }
  if (input.endsWith("/reference-library/images") && (!init || init.method === "GET")) {
    return { referenceImages: [referenceImageFixture()] };
  }
  if (input.endsWith("/reference-library/images") && init?.method === "POST") {
    return { referenceImage: referenceImageFixture() };
  }
  if (input.endsWith("/reference-selections") && init?.method === "POST") {
    return { scenePackage: scenePackageFixture() };
  }
  if (input.endsWith("/cast-assignments") && init?.method === "POST") {
    return { scenePackage: scenePackageFixture() };
  }
  if (input.endsWith("/complete-images/complete_scene_001/import") && init?.method === "POST") {
    return { run: workspaceRunFixture(), scenePackage: scenePackageWithRun() };
  }
  return null;
}

function characterIpFixture(overrides = {}) {
  return {
    id: "child_ip_001",
    display_name: "团团",
    visual_invariants: "yellow pajama top",
    personality_cues: "curious",
    reference_image_ids: ["reference_style_001"],
    status: "available",
    created_at: "2026-07-03T12:00:00Z",
    updated_at: null,
    ...overrides,
  };
}

function referenceImageFixture() {
  return {
    id: "reference_style_001",
    original_filename: "style.png",
    storage_path: "reference_library/style.png",
    media_type: "image/png",
    width: 512,
    height: 512,
    tags: ["style"],
    notes: "storybook style",
    created_at: "2026-07-03T12:01:00Z",
    status: "available",
  };
}

function scenePackageFixture() {
  return {
    chapter_id: "chapter_001",
    current_empty_scene_image_id: "empty_scene_001",
    prompt: { prompt_text: "Breakfast scene.", scene_spatial_contract: "", updated_at: null },
    prompt_confirmations: { avoid_objects_reviewed: true, style_reference_mode: "selected" },
    cast_assignments: [{
      id: "cast_assignment_001",
      character_ip_id: "character_ip_001",
      role_label: "main",
      action_intent: "sorts breakfast items",
      reference_image_ids: ["reference_style_001"],
    }],
    reference_selections: [{ id: "reference_selection_001", reference_image_id: "reference_style_001", prompt_role: "style" }],
    target_objects: [{ id: "target_object_001", label: "bowl", description: "", priority: "required" }],
    avoid_objects: [],
    empty_scene_images: [],
    complete_images: [],
    chapter_assets: [],
    assembly: { schema_version: 1, empty_scene_image_id: null, empty_scene_size: null, placements: [], groups: [], layer_order: [], updated_at: null },
    final_scene: null,
  };
}

function scenePackageWithRun() {
  return {
    ...scenePackageFixture(),
    complete_images: [{
      id: "complete_scene_001",
      original_filename: "complete.png",
      storage_path: "complete_images/complete_scene_001.png",
      media_type: "image/png",
      width: 512,
      height: 512,
      empty_scene_image_id: "empty_scene_001",
      status: "active",
      prompt_snapshot: "Breakfast scene.",
      reference_snapshot: { reference_image_ids: [], current_empty_scene_image_id: "empty_scene_001", notes: "" },
      generation_note: "",
      pipeline_run_id: "run_complete_001",
      pipeline_run_status: "ready",
      created_at: "2026-07-03T12:02:00Z",
    }],
  };
}

function workspaceRunFixture() {
  return {
    id: "run_complete_001",
    title: "chapter_001 complete_scene_001",
    sourceFilename: "chapter_001_complete_scene_001.png",
    createdAt: "2026-07-03T12:04:00Z",
    updatedAt: "2026-07-03T12:04:00Z",
    status: "ready",
    elementCount: 0,
  };
}
