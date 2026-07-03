import {
  describe,
  expect,
  it,
  render,
  screen,
  within,
} from "../app/appTestHarness";
import { MemoryRouter } from "react-router";

import { ChapterBoard } from "../../src/features/coursePlanner/components/ChapterBoard";
import type {
  Chapter,
  ChapterScenePackage,
} from "../../src/features/coursePlanner/types";

describe("Scene Category Board chapter status contract", () => {
  it("renders chapter production metrics from the chapter scene package contract", () => {
    render(
      <MemoryRouter>
        <ChapterBoard
          chapters={[chapterFixture()]}
          chapterScenePackagesByChapterId={{
            chapter_breakfast_kitchen: scenePackageFixture(),
          }}
        />
      </MemoryRouter>,
    );

    const board = screen.getByRole("region", { name: "Chapter Board" });
    expect(within(board).getByText("Prompt Text")).toBeInTheDocument();
    expect(within(board).getByText("ready")).toBeInTheDocument();
    expect(within(board).getByText("2 objects")).toBeInTheDocument();
    expect(within(board).getByText("1 asset placed")).toBeInTheDocument();
    expect(within(board).getByText("locked")).toBeInTheDocument();
  });
});

function chapterFixture(): Chapter {
  return {
    id: "chapter_breakfast_kitchen",
    scenePackId: "packHome",
    title: "早餐厨房",
    summary: "厨房餐台和冰箱前的早晨动线",
    seed: {
      scenePackId: "packHome",
      scenePackTitle: "室内家庭篇",
      chapterId: "chapter_breakfast_kitchen",
      chapterTitle: "早餐厨房",
      chapterIntent: "厨房餐台和冰箱前的早晨动线",
      sceneDomain: "indoor-home",
      dailyMoment: "morning",
      eventSeed: "找牛奶、拿杯子、准备早餐",
      spatialSeed: "冰箱、杯子、麦片盒",
      objectCoverageHint: ["冰箱", "杯子", "麦片盒"],
      characterConceptHint: {
        castMode: "main_cast_and_supporting_cast",
        mainCastHint: "孩子",
        supportingCastHint: "家长",
        referenceAssetIds: [],
        constraints: ["保持家庭主角一致"],
      },
      styleNotes: "温暖晨光、家庭写实感",
    },
    sortOrder: 1,
    status: "draft",
  };
}

function scenePackageFixture(): ChapterScenePackage {
  return {
    chapter_id: "chapter_breakfast_kitchen",
    current_empty_scene_image_id: "empty_scene_001",
    prompt: {
      prompt_text: "Morning kitchen with a child reaching for cereal.",
      scene_spatial_contract: "Table centered, fridge on the left.",
      updated_at: "2026-07-03T10:00:00Z",
    },
    prompt_confirmations: {
      avoid_objects_reviewed: true,
      style_reference_mode: "selected",
    },
    cast_assignments: [],
    reference_selections: [],
    target_objects: [
      {
        id: "target_object_bowl",
        label: "bowl",
        description: "Breakfast bowl on table.",
        priority: "core",
      },
      {
        id: "target_object_spoon",
        label: "spoon",
        description: "Metal spoon near the bowl.",
        priority: "required",
      },
    ],
    avoid_objects: [],
    empty_scene_images: [],
    complete_images: [],
    chapter_assets: [],
    assembly: {
      schema_version: 1,
      empty_scene_image_id: "empty_scene_001",
      empty_scene_size: { width: 1024, height: 1024 },
      placements: [
        {
          id: "placement_bowl",
          asset_id: "asset_bowl",
          display_name: "Breakfast bowl",
          runtime_role: "target",
          transform: {
            cx: 0.4,
            cy: 0.55,
            w: 0.18,
            h: 0.18,
            rotation_deg: 0,
          },
          group_id: null,
          requires_placed: [],
        },
      ],
      groups: [],
      layer_order: ["placement_bowl"],
      updated_at: "2026-07-03T10:05:00Z",
    },
    final_scene: {
      id: "final_scene_001",
      original_filename: "final-scene.png",
      storage_path: "final_scene/final_scene_001.png",
      media_type: "image/png",
      width: 1024,
      height: 1024,
      empty_scene_image_id: "empty_scene_001",
      assembly_snapshot: {
        schema_version: 1,
        empty_scene_image_id: "empty_scene_001",
        empty_scene_size: { width: 1024, height: 1024 },
        placements: [],
        groups: [],
        layer_order: [],
        updated_at: "2026-07-03T10:10:00Z",
      },
      prompt_snapshot: "Morning kitchen with a child reaching for cereal.",
      reference_snapshot: {
        reference_image_ids: [],
        current_empty_scene_image_id: "empty_scene_001",
        notes: "",
      },
      created_at: "2026-07-03T10:10:00Z",
    },
  };
}
