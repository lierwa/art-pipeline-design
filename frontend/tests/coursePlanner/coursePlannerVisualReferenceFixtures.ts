import type {
  Chapter,
  ChapterSceneAssemblyManifest,
  ChapterScenePackage,
  CharacterIpProfile,
  ReferenceLibraryImage,
  ScenePack,
} from "../../src/features/coursePlanner/types";
import {
  sceneAsset,
  snapshot,
} from "./chapterWorkspaceFixtures";

export const VISUAL_REFERENCE_SCENE_PACK_ID = "visual_ref_scene_pack_breakfast";
export const VISUAL_REFERENCE_CHAPTER_ID = "chapter_02_breakfast_time";
export const VISUAL_REFERENCE_SELECTED_TARGET_PLACEMENT_ID = "placement_target_cat";

export type CoursePlannerVisualReferenceFixture = {
  chapter: Chapter;
  characterIps: CharacterIpProfile[];
  referenceImages: ReferenceLibraryImage[];
  scenePack: ScenePack;
  scenePackage: ChapterScenePackage;
  selectedTargetPlacementId: string;
};

export function coursePlannerVisualReferenceFixture(): CoursePlannerVisualReferenceFixture {
  const lockedFinalAssembly = visualReferenceAssemblyFixture("2026-07-04T09:18:00Z");
  const scenePackage = visualReferenceScenePackageFixture({
    assembly: {
      ...lockedFinalAssembly,
      updated_at: null,
    },
    final_scene: {
      id: "visual_final_scene_001",
      original_filename: "chapter-02-breakfast-time-final.png",
      storage_path: "scene_package/visual_final_scene_001.png",
      media_type: "image/png",
      width: 1024,
      height: 768,
      empty_scene_image_id: "visual_empty_scene_wide_kitchen",
      assembly_snapshot: lockedFinalAssembly,
      prompt_snapshot: visualPrompt().prompt_text,
      reference_snapshot: snapshot(
        ["reference_visual_cat_character", "reference_visual_storybook_style", "reference_visual_kitchen_scene"],
        "visual_empty_scene_wide_kitchen",
        "locked browser visual QA reference",
      ),
      created_at: "2026-07-04T09:20:00Z",
    },
  });

  return {
    chapter: visualReferenceChapterFixture(),
    characterIps: [visualReferenceCharacterIpFixture()],
    referenceImages: visualReferenceImages(),
    scenePack: visualReferenceScenePackFixture(),
    scenePackage,
    selectedTargetPlacementId: VISUAL_REFERENCE_SELECTED_TARGET_PLACEMENT_ID,
  };
}

function visualReferenceScenePackFixture(): ScenePack {
  return {
    id: VISUAL_REFERENCE_SCENE_PACK_ID,
    title: "Morning Home Routine",
    intent: "Browser visual QA reference state for breakfast-time chapter workflows.",
    notes: "Matches the accepted visual reference data density.",
    status: "active",
    chapterIds: [VISUAL_REFERENCE_CHAPTER_ID],
    chapterListLocked: true,
  };
}

function visualReferenceChapterFixture(): Chapter {
  return {
    id: VISUAL_REFERENCE_CHAPTER_ID,
    scenePackId: VISUAL_REFERENCE_SCENE_PACK_ID,
    title: "Chapter 02 - Breakfast Time",
    summary: "A wide kitchen scene with a cat waiting beside a busy breakfast island.",
    seed: {
      scenePackId: VISUAL_REFERENCE_SCENE_PACK_ID,
      scenePackTitle: "Morning Home Routine",
      chapterId: VISUAL_REFERENCE_CHAPTER_ID,
      chapterTitle: "Chapter 02 - Breakfast Time",
      chapterIntent: "Show the breakfast setup, household warmth, and the target cat placement.",
      sceneDomain: "indoor-home",
      dailyMoment: "morning",
      eventSeed: "A cat waits near the island while breakfast is being set out.",
      spatialSeed: "Wide kitchen, island centered, window left, refrigerator and sink along the back wall.",
      objectCoverageHint: ["cat", "breakfast bowl", "milk carton", "cereal box", "spoon", "sun patch"],
      characterConceptHint: {
        castMode: "main_cast_and_supporting_cast",
        mainCastHint: "Mochi the cat is the selected target placement.",
        supportingCastHint: "Breakfast props imply family activity without adding extra characters.",
        referenceAssetIds: ["reference_visual_cat_character"],
        constraints: ["Keep the cat readable at thumbnail size", "Do not add visible text labels"],
      },
      styleNotes: "Clean storybook lighting with warm morning color and production-like asset density.",
    },
    sortOrder: 2,
    status: "designing",
  };
}

function visualReferenceScenePackageFixture(
  overrides: Partial<ChapterScenePackage> = {},
): ChapterScenePackage {
  // WHY: 该 fixture 只用于让浏览器视觉 QA 与参考图可比较，不能沉淀为生产业务规则。
  return {
    chapter_id: VISUAL_REFERENCE_CHAPTER_ID,
    current_empty_scene_image_id: "visual_empty_scene_wide_kitchen",
    prompt: visualPrompt(),
    prompt_confirmations: {
      avoid_objects_reviewed: true,
      style_reference_mode: "selected",
    },
    cast_assignments: [{
      id: "visual_cast_cat_mochi",
      character_ip_id: "character_ip_mochi_cat",
      role_label: "target cat",
      action_intent: "Sit alert beside the breakfast island and look toward the cereal bowl.",
      reference_image_ids: ["reference_visual_cat_character"],
    }],
    reference_selections: [
      {
        id: "visual_reference_selection_character",
        reference_image_id: "reference_visual_cat_character",
        prompt_role: "character",
      },
      {
        id: "visual_reference_selection_style",
        reference_image_id: "reference_visual_storybook_style",
        prompt_role: "style",
      },
      {
        id: "visual_reference_selection_scene",
        reference_image_id: "reference_visual_kitchen_scene",
        prompt_role: "scene",
      },
    ],
    target_objects: [
      {
        id: "target_object_cat",
        label: "cat",
        description: "Selected cat placement beside the breakfast island.",
        priority: "core",
      },
      {
        id: "target_object_bowl",
        label: "breakfast bowl",
        description: "Bowl on the island counter near the cat.",
        priority: "core",
      },
      {
        id: "target_object_milk",
        label: "milk carton",
        description: "Milk carton placed behind the bowl.",
        priority: "required",
      },
      {
        id: "target_object_cereal_box",
        label: "cereal box",
        description: "Colorful cereal box anchoring the breakfast cluster.",
        priority: "required",
      },
      {
        id: "target_object_spoon",
        label: "spoon",
        description: "Small spoon beside the bowl for scale.",
        priority: "recommended",
      },
      {
        id: "target_object_sun_patch",
        label: "sun patch",
        description: "Morning light patch across the floor.",
        priority: "recommended",
      },
    ],
    target_object_exemptions: [],
    avoid_objects: [
      {
        id: "avoid_object_visible_text",
        label: "visible text",
        description: "Avoid readable labels on packaging or appliances.",
      },
      {
        id: "avoid_object_sharp_tools",
        label: "sharp tools",
        description: "Keep knives and sharp tools out of reach.",
      },
    ],
    empty_scene_images: [{
      id: "visual_empty_scene_wide_kitchen",
      original_filename: "Kitchen-Morning.png",
      storage_path: "scene_package/visual_empty_scene_wide_kitchen.png",
      media_type: "image/png",
      width: 1024,
      height: 768,
      status: "available",
      prompt_snapshot: "Wide 4:3 morning kitchen with breakfast island, no character or prop cutouts.",
      reference_snapshot: snapshot(
        ["reference_visual_storybook_style", "reference_visual_kitchen_scene"],
        null,
        "wide kitchen empty scene reference",
      ),
      created_at: "2026-07-04T09:00:00Z",
    }],
    complete_images: visualCompleteImages(),
    chapter_assets: visualChapterAssets(),
    assembly: visualReferenceAssemblyFixture(null),
    final_scene: null,
    ...overrides,
  };
}

function visualPrompt() {
  return {
    prompt_text: "Wide storybook kitchen at breakfast time, warm sunlight, a small cat waiting by the island while breakfast items are arranged for a family morning routine.",
    scene_spatial_contract: "1024x768 wide kitchen; island centered in foreground, refrigerator and sink on the back wall, window light from left, open floor area for the selected cat placement.",
    updated_at: "2026-07-04T08:58:00Z",
  };
}

function visualCompleteImages(): ChapterScenePackage["complete_images"] {
  return [
    {
      id: "visual_complete_scene_001",
      original_filename: "Kitchen-Table-Close.png",
      storage_path: "scene_package/visual_complete_scene_001.png",
      media_type: "image/png",
      width: 1024,
      height: 768,
      empty_scene_image_id: "visual_empty_scene_wide_kitchen",
      status: "active",
      prompt_snapshot: "Cat at island with breakfast bowl, milk carton, cereal box, spoon, and morning sun patch.",
      reference_snapshot: snapshot(
        ["reference_visual_cat_character", "reference_visual_storybook_style"],
        "visual_empty_scene_wide_kitchen",
        "complete scene candidate 1",
      ),
      generation_note: "Accepted reference candidate with balanced left window light.",
      pipeline_run_id: "visual_run_complete_001",
      pipeline_run_status: "ready",
      created_at: "2026-07-04T09:06:00Z",
    },
    {
      id: "visual_complete_scene_002",
      original_filename: "Kitchen-Table-Wide.png",
      storage_path: "scene_package/visual_complete_scene_002.png",
      media_type: "image/png",
      width: 1024,
      height: 768,
      empty_scene_image_id: "visual_empty_scene_wide_kitchen",
      status: "active",
      prompt_snapshot: "Breakfast kitchen alternate with clearer cereal box silhouette and cat eye line.",
      reference_snapshot: snapshot(
        ["reference_visual_cat_character", "reference_visual_kitchen_scene"],
        "visual_empty_scene_wide_kitchen",
        "complete scene candidate 2",
      ),
      generation_note: "Alternate accepted candidate for image list density.",
      pipeline_run_id: "visual_run_complete_002",
      pipeline_run_status: "ready",
      created_at: "2026-07-04T09:08:00Z",
    },
    {
      id: "visual_complete_scene_003",
      original_filename: "Kitchen-Sun-Patch.png",
      storage_path: "scene_package/visual_complete_scene_003.png",
      media_type: "image/png",
      width: 1024,
      height: 768,
      empty_scene_image_id: "visual_empty_scene_wide_kitchen",
      status: "active",
      prompt_snapshot: "Breakfast kitchen alternate with stronger floor sun patch and compact prop cluster.",
      reference_snapshot: snapshot(
        ["reference_visual_storybook_style", "reference_visual_kitchen_scene"],
        "visual_empty_scene_wide_kitchen",
        "complete scene candidate 3",
      ),
      generation_note: "Alternate accepted candidate for comparison thumbnails.",
      pipeline_run_id: "visual_run_complete_003",
      pipeline_run_status: "ready",
      created_at: "2026-07-04T09:10:00Z",
    },
  ];
}

function visualChapterAssets(): ChapterScenePackage["chapter_assets"] {
  return [
    generatedVisualAsset(
      sceneAsset("chapter_asset_cat_mochi", "Mochi target cat", "mochi-target-cat.png", { linkedTargetObjectId: "target_object_cat" }),
      "visual_generated_cat_variant",
    ),
    generatedVisualAsset(
      sceneAsset("chapter_asset_breakfast_bowl", "Breakfast bowl", "breakfast-bowl.png", { linkedTargetObjectId: "target_object_bowl" }),
      "visual_generated_breakfast_bowl",
    ),
    sceneAsset("chapter_asset_milk_carton", "Milk carton", "milk-carton.png", { linkedTargetObjectId: "target_object_milk" }),
    sceneAsset("chapter_asset_cereal_box", "Cereal box", "cereal-box.png", { linkedTargetObjectId: "target_object_cereal_box" }),
    sceneAsset("chapter_asset_spoon", "Small spoon", "small-spoon.png", { linkedTargetObjectId: "target_object_spoon" }),
    sceneAsset("chapter_asset_sun_patch", "Morning sun patch", "morning-sun-patch.png", { linkedTargetObjectId: "target_object_sun_patch" }),
    sceneAsset("chapter_asset_toast_plate", "Toast plate", "toast-plate.png"),
    sceneAsset("chapter_asset_blue_mug", "Blue mug", "blue-mug.png"),
    sceneAsset("chapter_asset_tea_towel", "Folded tea towel", "folded-tea-towel.png"),
    sceneAsset("chapter_asset_fruit_bowl", "Fruit bowl", "fruit-bowl.png"),
    sceneAsset("chapter_asset_kitchen_stool", "Kitchen stool", "kitchen-stool.png"),
    sceneAsset("chapter_asset_potted_herb", "Potted herb", "potted-herb.png"),
  ];
}

function generatedVisualAsset(
  asset: ChapterScenePackage["chapter_assets"][number],
  runAssetId: string,
): ChapterScenePackage["chapter_assets"][number] {
  return {
    ...asset,
    lineage: {
      source_kind: "generated_asset",
      complete_scene_image_id: "visual_complete_scene_001",
      pipeline_run_id: "visual_run_complete_001",
      run_asset_id: runAssetId,
    },
  };
}

function visualReferenceAssemblyFixture(updatedAt: string | null): ChapterSceneAssemblyManifest {
  return {
    schema_version: 1,
    empty_scene_image_id: "visual_empty_scene_wide_kitchen",
    empty_scene_size: { width: 1024, height: 768 },
    placements: [
      {
        id: VISUAL_REFERENCE_SELECTED_TARGET_PLACEMENT_ID,
        asset_id: "chapter_asset_cat_mochi",
        display_name: "Mochi target cat",
        runtime_role: "target",
        transform: { cx: 0.39, cy: 0.66, w: 0.19, h: 0.26, rotation_deg: -3 },
        group_id: null,
        requires_placed: [],
      },
      {
        id: "placement_breakfast_bowl",
        asset_id: "chapter_asset_breakfast_bowl",
        display_name: "Breakfast bowl",
        runtime_role: "target",
        transform: { cx: 0.46, cy: 0.61, w: 0.17, h: 0.13, rotation_deg: -5 },
        group_id: null,
        requires_placed: [VISUAL_REFERENCE_SELECTED_TARGET_PLACEMENT_ID],
      },
      {
        id: "placement_milk_carton",
        asset_id: "chapter_asset_milk_carton",
        display_name: "Milk carton",
        runtime_role: "target",
        transform: { cx: 0.62, cy: 0.45, w: 0.11, h: 0.2, rotation_deg: 2 },
        group_id: null,
        requires_placed: ["placement_breakfast_bowl"],
      },
      {
        id: "placement_cereal_box",
        asset_id: "chapter_asset_cereal_box",
        display_name: "Cereal box",
        runtime_role: "target",
        transform: { cx: 0.43, cy: 0.46, w: 0.13, h: 0.22, rotation_deg: -2 },
        group_id: null,
        requires_placed: ["placement_breakfast_bowl"],
      },
      {
        id: "placement_spoon",
        asset_id: "chapter_asset_spoon",
        display_name: "Small spoon",
        runtime_role: "target",
        transform: { cx: 0.58, cy: 0.6, w: 0.1, h: 0.06, rotation_deg: 18 },
        group_id: null,
        requires_placed: ["placement_breakfast_bowl"],
      },
      {
        id: "placement_sun_patch",
        asset_id: "chapter_asset_sun_patch",
        display_name: "Morning sun patch",
        runtime_role: "target",
        transform: { cx: 0.25, cy: 0.78, w: 0.28, h: 0.16, rotation_deg: -8 },
        group_id: null,
        requires_placed: [],
      },
    ],
    groups: [],
    // WHY: Visual reference 要同时覆盖真实初始选中态和 z-order；controller 会选中首个 placement，
    // 而 manifest 协议定义 layer_order[0] 为 frontmost，所以把目标猫放在最前层并与碗局部重叠。
    layer_order: [
      VISUAL_REFERENCE_SELECTED_TARGET_PLACEMENT_ID,
      "placement_breakfast_bowl",
      "placement_milk_carton",
      "placement_cereal_box",
      "placement_spoon",
      "placement_sun_patch",
    ],
    updated_at: updatedAt,
  };
}

function visualReferenceCharacterIpFixture(): CharacterIpProfile {
  return {
    id: "character_ip_mochi_cat",
    display_name: "Mochi",
    visual_invariants: "Small cream cat, orange ears, green collar, rounded storybook silhouette.",
    personality_cues: "Patient, curious, watching the breakfast bowl closely.",
    reference_image_ids: ["reference_visual_cat_character"],
    status: "available",
    created_at: "2026-07-04T08:50:00Z",
    updated_at: null,
  };
}

function visualReferenceImages(): ReferenceLibraryImage[] {
  return [
    {
      id: "reference_visual_cat_character",
      original_filename: "mochi-cat-reference.png",
      storage_path: "reference_library/reference_visual_cat_character.png",
      media_type: "image/png",
      width: 768,
      height: 768,
      tags: ["cat", "character", "breakfast"],
      notes: "Selected character reference for Mochi target cat.",
      created_at: "2026-07-04T08:51:00Z",
      status: "available",
    },
    {
      id: "reference_visual_storybook_style",
      original_filename: "storybook-kitchen-style.png",
      storage_path: "reference_library/reference_visual_storybook_style.png",
      media_type: "image/png",
      width: 768,
      height: 768,
      tags: ["style", "storybook", "warm-light"],
      notes: "Warm storybook rendering reference.",
      created_at: "2026-07-04T08:52:00Z",
      status: "available",
    },
    {
      id: "reference_visual_kitchen_scene",
      original_filename: "wide-breakfast-kitchen-reference.png",
      storage_path: "reference_library/reference_visual_kitchen_scene.png",
      media_type: "image/png",
      width: 1024,
      height: 768,
      tags: ["scene", "kitchen", "wide"],
      notes: "Wide kitchen composition reference for the empty scene.",
      created_at: "2026-07-04T08:53:00Z",
      status: "available",
    },
  ];
}
