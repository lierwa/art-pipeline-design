import { describe, expect, it } from "../../app/appTestHarness";

import type { AssemblyManifestDraft } from "../../../src/features/coursePlanner/assembly/assemblyManifestDraft";
import {
  buildTldrawAssemblySnapshot,
  createInitialPlacementTransform,
  fitCameraBoundsForEmptyScene,
  normalizePlacementShapeForProjection,
  projectManifestChangesFromCanvas,
  projectPlacementTransformFromShape,
} from "../../../src/features/coursePlanner/assembly/tldrawAssemblyAdapter";
import { scenePackageMediaUrl } from "../../../src/features/coursePlanner/scenePackageMedia";
import { sceneAsset, studioScenePackageFixture } from "../chapterWorkspaceFixtures";

describe("tldrawAssemblyAdapter", () => {
  it("projects manifest placements into canvas pixels using the selected Empty Scene dimensions", () => {
    const scenePackage = studioScenePackageFixture({
      empty_scene_images: [
        {
          ...studioScenePackageFixture().empty_scene_images[0],
          width: 1200,
          height: 800,
        },
      ],
      assembly: {
        ...studioScenePackageFixture().assembly,
        empty_scene_size: { width: 1200, height: 800 },
        placements: [
          {
            ...studioScenePackageFixture().assembly.placements[0],
            transform: { cx: 0.25, cy: 0.75, w: 0.2, h: 0.3, rotation_deg: 12 },
          },
        ],
      },
    });

    const snapshot = buildTldrawAssemblySnapshot({
      draft: scenePackage.assembly as AssemblyManifestDraft,
      scenePackage,
    });
    const placementShape = snapshot.placementShapes[0];

    expect(placementShape).toMatchObject({
      x: 180,
      y: 480,
      rotation: expect.closeTo((12 * Math.PI) / 180, 6),
      props: {
        w: 240,
        h: 240,
      },
    });
  });

  it("projects canvas image shapes back into normalized manifest transforms using the selected Empty Scene dimensions", () => {
    const transform = projectPlacementTransformFromShape(
      {
        x: 300,
        y: 120,
        rotation: Math.PI / 4,
        props: { w: 150, h: 240 },
      },
      { width: 1200, height: 800 },
    );

    expect(transform).toEqual({
      cx: 0.3125,
      cy: 0.3,
      w: 0.125,
      h: 0.3,
      rotation_deg: 45,
    });
  });

  it("round-trips rotation between manifest degrees and tldraw radians", () => {
    const scenePackage = studioScenePackageFixture();
    const snapshot = buildTldrawAssemblySnapshot({
      draft: scenePackage.assembly as AssemblyManifestDraft,
      scenePackage,
    });

    const transform = projectPlacementTransformFromShape(snapshot.placementShapes[0], { width: 1024, height: 1024 });

    expect(transform.rotation_deg).toBe(0);
  });

  it("preserves frontmost layer order when projecting shapes back to manifest order", () => {
    const draft = draftWithThreePlacements();

    const projected = projectManifestChangesFromCanvas({
      draft,
      shapesInZOrder: [
        makeProjectionShape("placement_chapter_asset_cloth", { x: 40, y: 40, w: 80, h: 80 }),
        makeProjectionShape("placement_bowl", { x: 60, y: 60, w: 120, h: 120 }),
        makeProjectionShape("placement_chapter_asset_cup", { x: 80, y: 80, w: 90, h: 90 }),
      ],
      emptySceneSize: { width: 1024, height: 1024 },
    });

    expect(projected.layer_order).toEqual([
      "placement_chapter_asset_cup",
      "placement_bowl",
      "placement_chapter_asset_cloth",
    ]);
  });

  it("ignores unknown editor shapes instead of projecting them into manifest placements", () => {
    const scenePackage = studioScenePackageFixture();
    const draft = scenePackage.assembly as AssemblyManifestDraft;

    const projected = projectManifestChangesFromCanvas({
      draft,
      shapesInZOrder: [
        makeProjectionShape("placement_bowl", { x: 320, y: 520, w: 180, h: 180 }),
        normalizePlacementShapeForProjection({
          id: "shape:note:freeform",
          meta: { kind: "foreign" },
          x: 0,
          y: 0,
          rotation: 0,
          props: { w: 12, h: 12 },
        }),
      ].filter((shape): shape is NonNullable<typeof shape> => Boolean(shape)),
      emptySceneSize: { width: 1024, height: 1024 },
    });

    expect(projected.placements).toHaveLength(1);
    expect(projected.placements[0]?.id).toBe("placement_bowl");
  });

  it("ignores internal-prefix shapes whose placement metadata was not trusted by the adapter", () => {
    const scenePackage = studioScenePackageFixture();
    const draft = scenePackage.assembly as AssemblyManifestDraft;

    const projected = projectManifestChangesFromCanvas({
      draft,
      shapesInZOrder: [
        {
          id: "shape:assembly:placement_bowl",
          meta: { kind: "foreign", placementId: "placement_bowl" },
          x: 320,
          y: 520,
          rotation: 0,
          props: { w: 180, h: 180 },
        },
      ],
      emptySceneSize: { width: 1024, height: 1024 },
    });

    expect(projected.placements).toEqual(draft.placements);
    expect(projected.layer_order).toEqual(draft.layer_order);
  });

  it("normalizes only trusted placement shapes for projection", () => {
    expect(
      normalizePlacementShapeForProjection({
        id: "shape:assembly:placement_bowl",
        meta: { kind: "placement", placementId: "placement_bowl", source: "assembly-editor" },
        x: 32,
        y: 48,
        rotation: 0,
        props: { w: 64, h: 96 },
      }),
    ).toMatchObject({
      placementId: "placement_bowl",
      x: 32,
      y: 48,
      props: { w: 64, h: 96 },
    });

    expect(
      normalizePlacementShapeForProjection({
        id: "shape:assembly:placement_bowl",
        meta: { kind: "placement", placementId: "placement_bowl" },
        x: 32,
        y: 48,
        rotation: 0,
        props: { w: 64, h: 96 },
      }),
    ).toBeNull();
  });

  it("generates media URLs through scenePackageMediaUrl for the Empty Scene and chapter asset images", () => {
    const scenePackage = studioScenePackageFixture();

    const snapshot = buildTldrawAssemblySnapshot({
      draft: scenePackage.assembly as AssemblyManifestDraft,
      scenePackage,
    });

    expect(snapshot.backgroundAsset.props.src).toBe(
      scenePackageMediaUrl(scenePackage.chapter_id, "empty_scene_images", "empty_scene_001"),
    );
    expect(snapshot.assetRecords[0]?.props.src).toBe(
      scenePackageMediaUrl(scenePackage.chapter_id, "chapter_assets", "chapter_asset_bowl"),
    );
  });

  it("keeps initial placement size within the canvas while preserving asset aspect ratio", () => {
    const transform = createInitialPlacementTransform({
      canvasWidth: 1200,
      canvasHeight: 800,
      assetWidth: 600,
      assetHeight: 300,
    });

    expect(transform).toEqual({
      cx: 0.5,
      cy: 0.5,
      w: 0.4,
      h: 0.3,
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

function draftWithThreePlacements(): AssemblyManifestDraft {
  const base = studioScenePackageFixture({
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

  return base.assembly as AssemblyManifestDraft;
}

function makeProjectionShape(
  placementId: string,
  input: { x: number; y: number; w: number; h: number; rotation?: number },
) {
  return normalizePlacementShapeForProjection({
    id: `shape:assembly:${placementId}`,
    meta: { kind: "placement", placementId, source: "assembly-editor" as const },
    x: input.x,
    y: input.y,
    rotation: input.rotation ?? 0,
    props: { w: input.w, h: input.h },
  }) as NonNullable<ReturnType<typeof normalizePlacementShapeForProjection>>;
}
