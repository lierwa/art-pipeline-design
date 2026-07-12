import type {
  Chapter,
  ChapterSceneAssemblyManifest,
  ChapterScenePackage,
  CharacterIpProfile,
  SceneStyleReference,
  ScenePack,
} from "../../src/features/coursePlanner/types";

export const STUDIO_SCENE_PACK_ID = "scene_pack_home";
export const STUDIO_CHAPTER_ID = "chapter_breakfast_kitchen";

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
      scenePackId: STUDIO_SCENE_PACK_ID,
      scenePackTitle: "室内家庭篇",
      chapterId: STUDIO_CHAPTER_ID,
      chapterTitle: "早餐厨房",
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
    },
    cast_assignments: [{
      id: "cast_main_child",
      character_ip_id: "child_ip_001",
      role_label: "main",
      action_intent: "Reach for the breakfast bowl while looking toward spilled milk.",
    }],
    scene_style_reference_id: "scene_style_001",
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
    target_object_exemptions: [],
    avoid_objects: [{ id: "avoid_object_knife", label: "knife", description: "Avoid sharp props on the table." }],
    empty_scene_images: [{
      id: "empty_scene_001",
      original_filename: "empty-scene.png",
      storage_path: "scene_package/empty_scene_001.png",
      media_type: "image/png",
      width: 1024,
      height: 1024,
      status: "available",
      prompt_snapshot: "Warm breakfast kitchen without character cutouts.",
      reference_snapshot: snapshot(["character_model_sheet_001", "scene_style_image_001"], null),
      created_at: "2026-07-03T11:01:00Z",
    }],
    complete_images: [{
      id: "complete_scene_001",
      original_filename: "complete-scene.png",
      storage_path: "scene_package/complete_scene_001.png",
      media_type: "image/png",
      width: 1024,
      height: 1024,
      empty_scene_image_id: "empty_scene_001",
      status: "active",
      prompt_snapshot: "Warm breakfast kitchen with family action beats.",
      reference_snapshot: snapshot(["character_model_sheet_001", "scene_style_image_001"], "empty_scene_001"),
      generation_note: "brighter morning light",
      pipeline_run_id: null,
      pipeline_run_status: null,
      created_at: "2026-07-03T11:02:00Z",
    }],
    chapter_assets: [sceneAsset("chapter_asset_bowl", "Breakfast bowl", "bowl.png", { linkedTargetObjectId: "target_object_bowl" })],
    assembly: studioAssemblyFixture(),
    final_scene: null,
    ...overrides,
  };
}

export function characterIpFixture(overrides: Partial<CharacterIpProfile> = {}): CharacterIpProfile {
  return {
    id: "child_ip_001",
    display_name: "团团",
    current_model_sheet_id: "character_model_sheet_001",
    created_at: "2026-07-03T10:58:00Z",
    updated_at: null,
    ...overrides,
  };
}

export function sceneStyleFixture(overrides: Partial<SceneStyleReference> = {}): SceneStyleReference {
  return {
    id: "scene_style_001",
    display_name: "暖色绘本室内",
    current_image_id: "scene_style_image_001",
    created_at: "2026-07-03T10:59:00Z",
    updated_at: null,
    ...overrides,
  };
}

export const referenceImageFixture = sceneStyleFixture;

export function snapshot(referenceImageIds: string[], currentEmptySceneImageId: string | null, notes = "style board") {
  return { reference_image_ids: referenceImageIds, current_empty_scene_image_id: currentEmptySceneImageId, notes };
}

export function sceneAsset(
  id: string,
  displayName: string,
  originalFilename: string,
  options: {
    linkedTargetObjectId?: string | null;
  } = {},
) {
  return {
    id,
    display_name: displayName,
    original_filename: originalFilename,
    storage_path: `scene_package/${id}.png`,
    media_type: "image/png" as const,
    width: 1024,
    height: 1024,
    lineage: {
      source_kind: "direct_upload" as const,
    },
    linked_target_object_id: options.linkedTargetObjectId ?? null,
    status: "available" as const,
    created_at: "2026-07-03T11:08:00Z",
  };
}

function studioAssemblyFixture(overrides: Partial<ChapterSceneAssemblyManifest> = {}): ChapterSceneAssemblyManifest {
  return {
    schema_version: 1,
    empty_scene_image_id: "empty_scene_001",
    empty_scene_size: { width: 1024, height: 1024 },
    placements: [{
      id: "placement_bowl",
      asset_id: "chapter_asset_bowl",
      display_name: "Breakfast bowl",
      runtime_role: "target",
      transform: { cx: 0.42, cy: 0.58, w: 0.18, h: 0.18, rotation_deg: 0 },
      group_id: null,
      requires_placed: [],
    }],
    groups: [],
    layer_order: ["placement_bowl"],
    updated_at: "2026-07-03T11:04:00Z",
    ...overrides,
  };
}
