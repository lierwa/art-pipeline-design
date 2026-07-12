import { describe, expect, it, vi } from "../app/appTestHarness";

import {
  assignCharacterIpToChapter,
  characterModelSheetUrl,
  clearChapterSceneStyleReference,
  createCharacterIp,
  createSceneStyleReference,
  deleteCharacterIp,
  deleteSceneStyleReference,
  listCharacterIps,
  listSceneStyleReferences,
  sceneStyleReferenceImageUrl,
  selectChapterSceneStyleReference,
  updateCharacterIp,
  updateSceneStyleReference,
} from "../../src/features/coursePlanner/api";

describe("course planner global library API client", () => {
  it("uses minimal multipart CRUD contracts for both global libraries", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input: String(input), init });
      return responseFor(String(input), init);
    }) as typeof fetch;
    const image = new File(["png"], "reference.png", { type: "image/png" });

    await listCharacterIps(fetcher);
    await createCharacterIp({ displayName: "团团", file: image }, fetcher);
    await updateCharacterIp("character_ip_001", { displayName: "团团 v2", file: image }, fetcher);
    await deleteCharacterIp("character_ip_001", fetcher);
    await listSceneStyleReferences(fetcher);
    await createSceneStyleReference({ displayName: "暖色绘本室内", file: image }, fetcher);
    await updateSceneStyleReference("scene_style_001", { displayName: "暖色室内 v2" }, fetcher);
    await deleteSceneStyleReference("scene_style_001", fetcher);

    expect(calls.map((call) => [call.input, call.init?.method ?? "GET"])).toEqual([
      ["/api/course-planner/character-ips", "GET"],
      ["/api/course-planner/character-ips", "POST"],
      ["/api/course-planner/character-ips/character_ip_001", "PATCH"],
      ["/api/course-planner/character-ips/character_ip_001", "DELETE"],
      ["/api/course-planner/scene-style-references", "GET"],
      ["/api/course-planner/scene-style-references", "POST"],
      ["/api/course-planner/scene-style-references/scene_style_001", "PATCH"],
      ["/api/course-planner/scene-style-references/scene_style_001", "DELETE"],
    ]);
    expect(formEntries(calls[1].init?.body)).toEqual([
      ["displayName", "团团"],
      ["file", "reference.png"],
    ]);
    expect(formEntries(calls[5].init?.body)).toEqual([
      ["displayName", "暖色绘本室内"],
      ["file", "reference.png"],
    ]);
    expect(characterModelSheetUrl("character ip/001")).toBe(
      "/api/course-planner/character-ips/character%20ip%2F001/model-sheet",
    );
    expect(sceneStyleReferenceImageUrl("style/001")).toBe(
      "/api/course-planner/scene-style-references/style%2F001/image",
    );
  });

  it("binds only character IDs and one scene style ID at Chapter scope", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input: String(input), init });
      return responseFor(String(input), init);
    }) as typeof fetch;

    await assignCharacterIpToChapter("chapter_001", {
      characterIpId: "character_ip_001",
      roleLabel: "main",
      actionIntent: "sorts breakfast items",
    }, fetcher);
    await selectChapterSceneStyleReference("chapter_001", "scene_style_001", fetcher);
    await clearChapterSceneStyleReference("chapter_001", fetcher);

    expect(calls.map((call) => [call.input, call.init?.method])).toEqual([
      ["/api/course-planner/chapters/chapter_001/scene-package/cast-assignments", "POST"],
      ["/api/course-planner/chapters/chapter_001/scene-package/scene-style-reference", "PUT"],
      ["/api/course-planner/chapters/chapter_001/scene-package/scene-style-reference", "DELETE"],
    ]);
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      characterIpId: "character_ip_001",
      roleLabel: "main",
      actionIntent: "sorts breakfast items",
    });
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({
      sceneStyleReferenceId: "scene_style_001",
    });
  });
});

function responseFor(input: string, init?: RequestInit): Response {
  if (init?.method === "DELETE" && !input.includes("scene-package")) {
    return new Response(null, { status: 204 });
  }
  let payload: unknown;
  if (input.endsWith("/character-ips") && (!init || init.method === "GET")) {
    payload = { characterIps: [characterIpFixture()] };
  } else if (input.includes("/character-ips") && init?.method !== "DELETE") {
    payload = { characterIp: characterIpFixture() };
  } else if (input.endsWith("/scene-style-references") && (!init || init.method === "GET")) {
    payload = { sceneStyleReferences: [sceneStyleFixture()] };
  } else if (input.includes("/scene-style-references") && init?.method !== "DELETE") {
    payload = { sceneStyleReference: sceneStyleFixture() };
  } else {
    payload = { scenePackage: scenePackageFixture() };
  }
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function formEntries(body: BodyInit | null | undefined): string[][] {
  return [...(body as FormData).entries()].map(([key, value]) => [
    key,
    value instanceof File ? value.name : value,
  ]);
}

function characterIpFixture() {
  return {
    id: "character_ip_001",
    display_name: "团团",
    current_model_sheet_id: "character_model_sheet_001",
    created_at: "2026-07-03T12:00:00Z",
    updated_at: null,
  };
}

function sceneStyleFixture() {
  return {
    id: "scene_style_001",
    display_name: "暖色绘本室内",
    current_image_id: "scene_style_image_001",
    created_at: "2026-07-03T12:01:00Z",
    updated_at: null,
  };
}

function scenePackageFixture() {
  return {
    chapter_id: "chapter_001",
    current_empty_scene_image_id: null,
    prompt: { prompt_text: "Breakfast scene.", scene_spatial_contract: "", updated_at: null },
    prompt_confirmations: { avoid_objects_reviewed: true },
    cast_assignments: [{
      id: "cast_assignment_001",
      character_ip_id: "character_ip_001",
      role_label: "main",
      action_intent: "sorts breakfast items",
    }],
    scene_style_reference_id: "scene_style_001",
    target_objects: [],
    target_object_exemptions: [],
    avoid_objects: [],
    empty_scene_images: [],
    complete_images: [],
    chapter_assets: [],
    assembly: { schema_version: 1, empty_scene_image_id: null, empty_scene_size: null, placements: [], groups: [], layer_order: [], updated_at: null },
    final_scene: null,
  };
}
