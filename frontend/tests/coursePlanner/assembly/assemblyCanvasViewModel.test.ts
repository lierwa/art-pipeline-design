import { describe, expect, it } from "../../app/appTestHarness";

import type { AssemblyManifestDraft } from "../../../src/features/coursePlanner/assembly/assemblyManifestDraft";
import {
  buildAssemblyCanvasObjects,
  canvasBoxToPlacementTransform,
  createInitialPlacementTransform,
  fitCameraBoundsForEmptyScene,
  placementToCanvasBox,
} from "../../../src/features/coursePlanner/assembly/assemblyCanvasViewModel";
import { scenePackageMediaUrl } from "../../../src/features/coursePlanner/scenePackageMedia";
import { sceneAsset, studioScenePackageFixture } from "../chapterWorkspaceFixtures";

describe("assemblyCanvasViewModel", () => {
  it("projects manifest placement transforms into canvas pixel boxes", () => {
    expect(
      placementToCanvasBox(
        { cx: 0.25, cy: 0.75, w: 0.2, h: 0.3, rotation_deg: 12 },
        { width: 1200, height: 800 },
      ),
    ).toEqual({
      x: 180,
      y: 480,
      w: 240,
      h: 240,
      rotationDeg: 12,
    });
  });

  it("projects edited canvas boxes back into normalized manifest transforms", () => {
    expect(
      canvasBoxToPlacementTransform(
        { x: 300, y: 120, w: 150, h: 240, rotationDeg: 45 },
        { width: 1200, height: 800 },
      ),
    ).toEqual({
      cx: 0.3125,
      cy: 0.3,
      w: 0.125,
      h: 0.3,
      rotation_deg: 45,
    });
  });

  it("renders layer_order back-to-front while keeping frontmost hit testing last", () => {
    const scenePackage = scenePackageWithThreePlacements();
    const canvasObjects = buildAssemblyCanvasObjects({
      draft: scenePackage.assembly as AssemblyManifestDraft,
      scenePackage,
      sceneSize: scenePackage.assembly.empty_scene_size,
    });

    expect(canvasObjects.map((object) => object.id)).toEqual([
      "placement_chapter_asset_cloth",
      "placement_chapter_asset_cup",
      "placement_bowl",
    ]);
  });

  it("generates media URLs for chapter asset thumbnails", () => {
    const scenePackage = studioScenePackageFixture();
    const canvasObjects = buildAssemblyCanvasObjects({
      draft: scenePackage.assembly as AssemblyManifestDraft,
      scenePackage,
      sceneSize: scenePackage.assembly.empty_scene_size,
    });

    expect(canvasObjects[0]?.thumbnailUrl).toBe(
      scenePackageMediaUrl(scenePackage.chapter_id, "chapter_assets", "chapter_asset_bowl"),
    );
    expect(canvasObjects[0]?.contentImageUrl).toBe(
      scenePackageMediaUrl(scenePackage.chapter_id, "chapter_assets", "chapter_asset_bowl"),
    );
  });

  it("fails closed without a resolved Empty Scene size instead of projecting against a default", () => {
    const scenePackage = studioScenePackageFixture({
      assembly: {
        ...studioScenePackageFixture().assembly,
        empty_scene_size: null,
      },
    });

    expect(buildAssemblyCanvasObjects({
      draft: scenePackage.assembly as AssemblyManifestDraft,
      scenePackage,
      sceneSize: null,
    })).toEqual([]);
  });

  it("keeps initial placement size within the canvas while preserving asset aspect ratio", () => {
    expect(
      createInitialPlacementTransform({
        canvasWidth: 1200,
        canvasHeight: 800,
        assetWidth: 600,
        assetHeight: 300,
      }),
    ).toEqual({
      cx: 0.5,
      cy: 0.5,
      w: 0.166667,
      h: 0.125,
      rotation_deg: 0,
    });
  });

  it("computes nonblank fit-to-background bounds from the selected Empty Scene Image", () => {
    expect(fitCameraBoundsForEmptyScene({ width: 1536, height: 864 })).toEqual({
      x: 0,
      y: 0,
      w: 1536,
      h: 864,
    });
  });
});

function scenePackageWithThreePlacements() {
  return studioScenePackageFixture({
    chapter_assets: [
      ...studioScenePackageFixture().chapter_assets,
      sceneAsset("chapter_asset_cloth", "Cleanup cloth", "cloth.png", { linkedTargetObjectId: "target_object_cloth" }),
      sceneAsset("chapter_asset_cup", "Milk cup", "cup.png"),
    ],
    assembly: {
      ...studioScenePackageFixture().assembly,
      placements: [
        ...studioScenePackageFixture().assembly.placements,
        {
          id: "placement_chapter_asset_cloth",
          asset_id: "chapter_asset_cloth",
          display_name: "Cleanup cloth",
          runtime_role: "target",
          transform: { cx: 0.25, cy: 0.25, w: 0.12, h: 0.12, rotation_deg: 0 },
          group_id: null,
          requires_placed: [],
        },
        {
          id: "placement_chapter_asset_cup",
          asset_id: "chapter_asset_cup",
          display_name: "Milk cup",
          runtime_role: "target",
          transform: { cx: 0.75, cy: 0.65, w: 0.18, h: 0.18, rotation_deg: 0 },
          group_id: null,
          requires_placed: [],
        },
      ],
      layer_order: ["placement_bowl", "placement_chapter_asset_cup", "placement_chapter_asset_cloth"],
    },
  });
}
