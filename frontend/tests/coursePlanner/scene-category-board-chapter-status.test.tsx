import { BrowserRouter, MemoryRouter } from "react-router";

import { describe, expect, it, render, screen, userEvent, within } from "../app/appTestHarness";

import { ChapterBoard } from "../../src/features/coursePlanner/components/ChapterBoard";
import { SelectedChapterSequence } from "../../src/features/coursePlanner/components/SelectedChapterSequence";
import type { Chapter, ChapterScenePackage } from "../../src/features/coursePlanner/types";

describe("Scene Category Board chapter status contract", () => {
  it("renders chapter production metrics from the chapter scene package contract", () => {
    render(
      <MemoryRouter>
        <ChapterBoard
          chapters={[chapter("chapter_breakfast_kitchen", "早餐厨房")]}
          chapterScenePackagesByChapterId={{
            chapter_breakfast_kitchen: scenePackageFixture(),
          }}
        />
      </MemoryRouter>,
    );

    const board = screen.getByRole("region", { name: "Chapter Board" });
    expect(within(board).getByText("Prompt Text")).toBeInTheDocument();
    expect(within(board).getByText("Target Objects")).toBeInTheDocument();
    expect(within(board).getByText("Placed Assets")).toBeInTheDocument();
    expect(within(board).getByText("Final Scene")).toBeInTheDocument();
    expect(within(board).getByText("ready")).toBeInTheDocument();
    expect(within(board).getByText("2 objects")).toBeInTheDocument();
    expect(within(board).getByText("1 asset placed")).toBeInTheDocument();
    expect(within(board).getByText("locked")).toBeInTheDocument();
  });
});

describe("Scene Category Board chapter density", () => {
  it("uses a compact drag handle and compact chapter actions while keeping delete confirmation", async () => {
    const user = userEvent.setup();
    render(
      <BrowserRouter>
        <SelectedChapterSequence
          chapters={[chapter("chapter_breakfast_kitchen", "早餐厨房")]}
          deletingChapterId={null}
          isReordering={false}
          onDeleteChapter={() => undefined}
          onReorderChapters={() => undefined}
        />
      </BrowserRouter>,
    );

    const chapterList = screen.getByRole("region", { name: "Chapter list" });
    const chapterItem = within(chapterList).getByRole("listitem");
    expect(chapterItem).not.toHaveAttribute("draggable", "true");

    const dragHandle = within(chapterItem).getByRole("button", { name: "Drag handle for 早餐厨房" });
    expect(dragHandle).toHaveClass("course-planner-icon-button");
    expect(dragHandle).toHaveAttribute("draggable", "true");

    const openDesigner = within(chapterItem).getByRole("link", { name: "Open Designer for 早餐厨房" });
    expect(openDesigner).toHaveClass("course-planner-icon-link");
    expect(openDesigner).toHaveClass("course-planner-compact-link");
    expect(within(chapterItem).queryByText(/^Open Designer$/)).not.toBeInTheDocument();

    const chapterActions = within(chapterItem).getByRole("group", { name: "Chapter actions for 早餐厨房" });
    expect(chapterActions).toHaveClass("selected-sequence-actions");

    const deleteButton = within(chapterActions).getByRole("button", { name: "Delete Chapter 早餐厨房" });
    expect(deleteButton).toHaveClass("course-planner-icon-button");

    await user.click(deleteButton);

    const dialog = await screen.findByRole("alertdialog", { name: "Delete Chapter" });
    expect(dialog).toHaveTextContent("Delete 早餐厨房 from this Scene Pack's accepted Chapter list.");
  });

  it("keeps the pending delete action compact and icon-only", () => {
    render(
      <BrowserRouter>
        <SelectedChapterSequence
          chapters={[chapter("chapter_breakfast_kitchen", "早餐厨房")]}
          deletingChapterId="chapter_breakfast_kitchen"
          isReordering={false}
          onDeleteChapter={() => undefined}
          onReorderChapters={() => undefined}
        />
      </BrowserRouter>,
    );

    const chapterList = screen.getByRole("region", { name: "Chapter list" });
    const chapterItem = within(chapterList).getByRole("listitem");
    const chapterActions = within(chapterItem).getByRole("group", { name: "Chapter actions for 早餐厨房" });
    const pendingDeleteButton = within(chapterActions).getByRole("button", { name: "Deleting Chapter 早餐厨房" });

    expect(pendingDeleteButton).toHaveClass("course-planner-icon-button");
    expect(pendingDeleteButton).toBeDisabled();
    expect(pendingDeleteButton).toHaveAttribute("title", "Deleting Chapter 早餐厨房");
    expect(within(chapterActions).queryByText(/^Deleting\.\.\.$/)).not.toBeInTheDocument();
  });

});

function chapter(id: string, title: string): Chapter {
  return {
    id,
    scenePackId: "packHome",
    title,
    summary: "厨房餐台和冰箱前的早晨动线",
    sortOrder: 1,
    status: "draft",
    seed: {
      scenePackId: "packHome",
      scenePackTitle: "室内家庭篇",
      chapterId: id,
      chapterTitle: title,
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
      styleNotes: "Pipeline blue-black visual density",
    },
  };
}

function scenePackageFixture(): ChapterScenePackage {
  return {
    schema_version: 2,
    chapter_id: "chapter_breakfast_kitchen",
    current_empty_scene_image_id: "empty_scene_001",
    selected_character_ip_ids: [],
    scene_style_reference_id: null,
    current_prompt_package: {
      empty_scene_prompt: "Morning kitchen shell without characters or detachable objects.",
      complete_scene_prompt: "Morning kitchen with a child reaching for cereal.",
      scene_spatial_contract: "Table centered, fridge on the left.",
      cast_directions: [],
      reference_snapshot: {
        character_model_sheets: [],
        scene_style_reference_id: null,
        scene_style_image_id: null,
        current_empty_scene_image_id: "empty_scene_001",
        global_reference_image_ids: [],
      },
      generation_feedback: "",
      generated_at: "2026-07-03T10:00:00Z",
    },
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
    target_object_exemptions: [],
    avoid_objects: [],
    empty_scene_images: [],
    complete_images: [],
    chapter_assets: [
      {
        id: "asset_bowl",
        display_name: "Breakfast bowl",
        original_filename: "bowl.png",
        storage_path: "chapter_assets/asset_bowl.png",
        media_type: "image/png",
        lineage: {
          source_kind: "direct_upload",
        },
        linked_target_object_id: "target_object_bowl",
        status: "available",
        created_at: "2026-07-03T10:01:00Z",
      },
    ],
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
