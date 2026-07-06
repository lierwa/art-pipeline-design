import {
  describe,
  expect,
  it,
} from "../../app/appTestHarness";

import {
  arePlacementDependenciesSatisfiedAtStart,
  addAssetPlacement,
  getPlacementDependencyOptionState,
  createAssemblyDraft,
  groupPlacements,
  movePlacementLayer,
  projectManifestForSave,
  removePlacement,
  setPlacementRuntimeRole,
  setPlacementDependencies,
  ungroupPlacementGroup,
  updatePlacementTransform,
  validateAssemblyDraft,
} from "../../../src/features/coursePlanner/assembly/assemblyManifestDraft";
import {
  sceneAsset,
  studioScenePackageFixture,
} from "../chapterWorkspaceFixtures";

describe("assemblyManifestDraft", () => {
  it("copies the manifest and synchronizes empty_scene_image_id from the current empty scene selection", () => {
    const scenePackage = studioScenePackageFixture({
      current_empty_scene_image_id: "empty_scene_002",
      empty_scene_images: [
        ...studioScenePackageFixture().empty_scene_images,
        {
          ...studioScenePackageFixture().empty_scene_images[0],
          id: "empty_scene_002",
          original_filename: "empty-scene-2.png",
          storage_path: "scene_package/empty_scene_002.png",
        },
      ],
      assembly: {
        ...studioScenePackageFixture().assembly,
        empty_scene_image_id: "stale_empty_scene",
      },
    });

    const draft = createAssemblyDraft(scenePackage);

    expect(draft.empty_scene_image_id).toBe("empty_scene_002");
    expect(draft.placements).toEqual(scenePackage.assembly.placements);
    expect(draft.layer_order).toEqual(scenePackage.assembly.layer_order);
  });

  it("adds one placement for an unused asset with normalized defaults and frontmost layer order", () => {
    const scenePackage = studioScenePackageFixture({
      chapter_assets: [
        sceneAsset("chapter_asset_cloth", "Cleanup cloth", "cloth.png", { linkedTargetObjectId: "target_object_cloth" }),
      ],
      assembly: {
        ...studioScenePackageFixture().assembly,
        placements: [],
        groups: [],
        layer_order: [],
      },
    });

    const draft = addAssetPlacement(createAssemblyDraft(scenePackage), "chapter_asset_cloth");

    expect(draft.placements).toHaveLength(1);
    expect(draft.placements[0]).toEqual({
      id: "placement_chapter_asset_cloth",
      asset_id: "chapter_asset_cloth",
      display_name: "Cleanup cloth",
      runtime_role: "target",
      transform: { cx: 0.5, cy: 0.5, w: 0.25, h: 0.25, rotation_deg: 0 },
      group_id: null,
      requires_placed: [],
    });
    expect(draft.layer_order).toEqual(["placement_chapter_asset_cloth"]);
  });

  it("creates multiple placement records for the same Chapter Asset without renaming the asset source", () => {
    const scenePackage = studioScenePackageFixture();

    const secondPlacementDraft = addAssetPlacement(createAssemblyDraft(scenePackage), "chapter_asset_bowl");
    const thirdPlacementDraft = addAssetPlacement(secondPlacementDraft, "chapter_asset_bowl");

    expect(thirdPlacementDraft.placements.map((placement) => ({
      id: placement.id,
      asset_id: placement.asset_id,
      display_name: placement.display_name,
    }))).toEqual([
      { id: "placement_bowl", asset_id: "chapter_asset_bowl", display_name: "Breakfast bowl" },
      { id: "placement_chapter_asset_bowl", asset_id: "chapter_asset_bowl", display_name: "Breakfast bowl 2" },
      { id: "placement_chapter_asset_bowl_2", asset_id: "chapter_asset_bowl", display_name: "Breakfast bowl 3" },
    ]);
    expect(thirdPlacementDraft.layer_order).toEqual([
      "placement_chapter_asset_bowl_2",
      "placement_chapter_asset_bowl",
      "placement_bowl",
    ]);
    expect(scenePackage.chapter_assets[0]?.display_name).toBe("Breakfast bowl");
    expect(thirdPlacementDraft.asset_catalog.chapter_asset_bowl?.display_name).toBe("Breakfast bowl");
  });

  it("fills an available non-conflicting display suffix after deleting an earlier duplicate", () => {
    const draft = createAssemblyDraft(studioScenePackageFixture());
    const secondPlacementDraft = addAssetPlacement(draft, "chapter_asset_bowl");
    const thirdPlacementDraft = addAssetPlacement(secondPlacementDraft, "chapter_asset_bowl");
    const withSecondRemoved = removePlacement(thirdPlacementDraft, "placement_chapter_asset_bowl");

    const nextDraft = addAssetPlacement(withSecondRemoved, "chapter_asset_bowl");

    expect(nextDraft.placements.map((placement) => placement.display_name)).toEqual([
      "Breakfast bowl",
      "Breakfast bowl 3",
      "Breakfast bowl 2",
    ]);
    expect(new Set(nextDraft.placements.map((placement) => placement.display_name)).size).toBe(3);
  });

  it("clamps invalid normalized transform values when projecting for save", () => {
    const draft = updatePlacementTransform(createAssemblyDraft(studioScenePackageFixture()), "placement_bowl", {
      cx: -0.2,
      cy: 1.3,
      w: 0,
      h: 2,
      rotation_deg: 720,
    });

    const manifest = projectManifestForSave(draft);

    expect(manifest.placements[0]?.transform).toEqual({
      cx: 0,
      cy: 1,
      w: 0.001,
      h: 1,
      rotation_deg: 720,
    });
  });

  it("moves layers by updating layer_order only while keeping placement records stable", () => {
    const scenePackage = studioScenePackageFixture({
      chapter_assets: [
        ...studioScenePackageFixture().chapter_assets,
        sceneAsset("chapter_asset_cloth", "Cleanup cloth", "cloth.png", { linkedTargetObjectId: "target_object_cloth" }),
      ],
    });
    const originalDraft = addAssetPlacement(createAssemblyDraft(scenePackage), "chapter_asset_cloth");
    const originalPlacements = structuredClone(originalDraft.placements);

    const movedDraft = movePlacementLayer(originalDraft, "placement_chapter_asset_cloth", 0);

    expect(movedDraft.layer_order).toEqual(["placement_chapter_asset_cloth", "placement_bowl"]);
    expect(movedDraft.placements).toEqual(originalPlacements);
  });

  it("removes placements from placements, layer order, groups, and dependency lists", () => {
    const scenePackage = studioScenePackageFixture({
      chapter_assets: [
        ...studioScenePackageFixture().chapter_assets,
        sceneAsset("chapter_asset_cloth", "Cleanup cloth", "cloth.png", { linkedTargetObjectId: "target_object_cloth" }),
      ],
    });
    const draftWithSecondPlacement = addAssetPlacement(createAssemblyDraft(scenePackage), "chapter_asset_cloth");
    const groupedDraft = groupPlacements(draftWithSecondPlacement, ["placement_bowl", "placement_chapter_asset_cloth"], "Breakfast props");
    const dependencyDraft = setPlacementDependencies(groupedDraft, "placement_chapter_asset_cloth", ["placement_bowl"]);

    const draft = removePlacement(dependencyDraft, "placement_bowl");

    expect(draft.placements.map((placement) => placement.id)).toEqual(["placement_chapter_asset_cloth"]);
    expect(draft.layer_order).toEqual(["placement_chapter_asset_cloth"]);
    expect(draft.groups).toEqual([]);
    expect(draft.placements[0]?.requires_placed).toEqual([]);
  });

  it("rejects unknown dependency ids and cycles during validation", () => {
    const scenePackage = studioScenePackageFixture({
      chapter_assets: [
        ...studioScenePackageFixture().chapter_assets,
        sceneAsset("chapter_asset_cloth", "Cleanup cloth", "cloth.png", { linkedTargetObjectId: "target_object_cloth" }),
        sceneAsset("chapter_asset_cup", "Milk cup", "cup.png"),
      ],
    });
    const draftWithSecondPlacement = addAssetPlacement(createAssemblyDraft(scenePackage), "chapter_asset_cloth");
    const draftWithThirdPlacement = addAssetPlacement(draftWithSecondPlacement, "chapter_asset_cup");
    const unknownDependencyDraft = setPlacementDependencies(draftWithThirdPlacement, "placement_chapter_asset_cup", ["missing_placement"]);
    const cyclicDraft = setPlacementDependencies(unknownDependencyDraft, "placement_chapter_asset_cloth", ["placement_bowl"]);
    const draft = setPlacementDependencies(cyclicDraft, "placement_bowl", ["placement_chapter_asset_cloth"]);

    const validation = validateAssemblyDraft(draft, scenePackage);

    expect(validation.is_valid).toBe(false);
    expect(validation.errors.map((error) => error.code)).toEqual([
      "unknown-placement-dependency",
      "placement-dependency-cycle",
    ]);
  });

  it("marks self and cycle-causing dependency options as disabled from the helper boundary", () => {
    const scenePackage = studioScenePackageFixture({
      chapter_assets: [
        ...studioScenePackageFixture().chapter_assets,
        sceneAsset("chapter_asset_cloth", "Cleanup cloth", "cloth.png", { linkedTargetObjectId: "target_object_cloth" }),
      ],
    });
    const draftWithSecondPlacement = addAssetPlacement(createAssemblyDraft(scenePackage), "chapter_asset_cloth");
    const bowlDependsOnCloth = setPlacementDependencies(draftWithSecondPlacement, "placement_bowl", ["placement_chapter_asset_cloth"]);

    expect(getPlacementDependencyOptionState(bowlDependsOnCloth, "placement_bowl", "placement_bowl")).toEqual({
      disabled: true,
      reason: "self",
    });
    expect(
      getPlacementDependencyOptionState(
        bowlDependsOnCloth,
        "placement_chapter_asset_cloth",
        "placement_bowl",
      ),
    ).toEqual({
      disabled: true,
      reason: "cycle",
    });
    expect(
      getPlacementDependencyOptionState(
        bowlDependsOnCloth,
        "placement_bowl",
        "placement_chapter_asset_cloth",
      ),
    ).toEqual({
      disabled: false,
      reason: null,
    });
  });

  it("treats dependencies on initial placements as satisfied at scene start", () => {
    const scenePackage = studioScenePackageFixture({
      chapter_assets: [
        ...studioScenePackageFixture().chapter_assets,
        sceneAsset("chapter_asset_cloth", "Cleanup cloth", "cloth.png", { linkedTargetObjectId: "target_object_cloth" }),
      ],
    });
    const draftWithSecondPlacement = addAssetPlacement(createAssemblyDraft(scenePackage), "chapter_asset_cloth");
    const initialDraft = setPlacementRuntimeRole(draftWithSecondPlacement, ["placement_bowl"], "initial");
    const dependencyDraft = setPlacementDependencies(initialDraft, "placement_chapter_asset_cloth", ["placement_bowl"]);

    expect(arePlacementDependenciesSatisfiedAtStart(dependencyDraft, "placement_chapter_asset_cloth")).toBe(true);
    expect(arePlacementDependenciesSatisfiedAtStart(dependencyDraft, "placement_bowl")).toBe(true);

    const targetOnlyDraft = setPlacementRuntimeRole(dependencyDraft, ["placement_bowl"], "target");
    expect(arePlacementDependenciesSatisfiedAtStart(targetOnlyDraft, "placement_chapter_asset_cloth")).toBe(false);
  });

  it("rejects malformed group and placement references during validation", () => {
    const scenePackage = studioScenePackageFixture({
      chapter_assets: [
        ...studioScenePackageFixture().chapter_assets,
        sceneAsset("chapter_asset_cloth", "Cleanup cloth", "cloth.png", { linkedTargetObjectId: "target_object_cloth" }),
      ],
    });
    const draft = addAssetPlacement(createAssemblyDraft(scenePackage), "chapter_asset_cloth");
    const malformedDraft = {
      ...draft,
      placements: draft.placements.map((placement) => {
        if (placement.id === "placement_bowl") {
          return { ...placement, group_id: "group_missing" };
        }
        return { ...placement, group_id: "group_kept" };
      }),
      groups: [
        {
          id: "group_kept",
          display_name: "Broken kept group",
          placement_ids: ["placement_chapter_asset_cloth", "placement_missing"],
        },
        {
          id: "group_mismatch",
          display_name: "Broken mismatch group",
          placement_ids: ["placement_bowl", "placement_chapter_asset_cloth"],
        },
        {
          id: "group_orphan",
          display_name: "Orphan group",
          placement_ids: [],
        },
      ],
    };

    const validation = validateAssemblyDraft(malformedDraft, scenePackage);

    expect(validation.is_valid).toBe(false);
    expect(validation.errors.map((error) => error.code)).toEqual([
      "dangling-placement-group",
      "group-unknown-placement",
      "group-placement-membership-mismatch",
      "group-placement-membership-mismatch",
      "degenerate-placement-group",
    ]);
  });

  it("rejects duplicate placement ids inside layer_order during validation", () => {
    const scenePackage = studioScenePackageFixture();
    const draft = {
      ...createAssemblyDraft(scenePackage),
      layer_order: ["placement_bowl", "placement_bowl"],
    };

    const validation = validateAssemblyDraft(draft, scenePackage);

    expect(validation.is_valid).toBe(false);
    expect(validation.errors.map((error) => error.code)).toEqual(["duplicate-layer-order-placement"]);
  });

  it("rejects unknown and missing placement ids inside layer_order during validation", () => {
    const scenePackage = studioScenePackageFixture({
      chapter_assets: [
        ...studioScenePackageFixture().chapter_assets,
        sceneAsset("chapter_asset_cloth", "Cleanup cloth", "cloth.png", { linkedTargetObjectId: "target_object_cloth" }),
      ],
    });
    const draft = addAssetPlacement(createAssemblyDraft(scenePackage), "chapter_asset_cloth");
    const malformedDraft = {
      ...draft,
      layer_order: ["placement_bowl", "placement_missing"],
    };

    const validation = validateAssemblyDraft(malformedDraft, scenePackage);

    expect(validation.is_valid).toBe(false);
    expect(validation.errors.map((error) => error.code)).toEqual([
      "unknown-layer-order-placement",
      "missing-layer-order-placement",
    ]);
  });

  it("creates one first-level group and rejects nested grouping", () => {
    const scenePackage = studioScenePackageFixture({
      chapter_assets: [
        ...studioScenePackageFixture().chapter_assets,
        sceneAsset("chapter_asset_cloth", "Cleanup cloth", "cloth.png", { linkedTargetObjectId: "target_object_cloth" }),
        sceneAsset("chapter_asset_cup", "Milk cup", "cup.png"),
      ],
    });
    const draftWithSecondPlacement = addAssetPlacement(createAssemblyDraft(scenePackage), "chapter_asset_cloth");
    const draftWithThirdPlacement = addAssetPlacement(draftWithSecondPlacement, "chapter_asset_cup");
    const groupedDraft = groupPlacements(draftWithThirdPlacement, ["placement_bowl", "placement_chapter_asset_cloth"], "Breakfast props");

    const nestedAttempt = groupPlacements(
      groupedDraft,
      ["placement_bowl", "placement_chapter_asset_cup"],
      "Nested should fail",
    );

    expect(groupedDraft.groups).toHaveLength(1);
    expect(groupedDraft.groups[0]).toEqual({
      id: "group_1",
      display_name: "Breakfast props",
      placement_ids: ["placement_bowl", "placement_chapter_asset_cloth"],
    });
    expect(nestedAttempt).toEqual(groupedDraft);
  });

  it("keeps grouped placements contiguous in layer_order from the helper boundary", () => {
    const scenePackage = studioScenePackageFixture({
      chapter_assets: [
        ...studioScenePackageFixture().chapter_assets,
        sceneAsset("chapter_asset_cloth", "Cleanup cloth", "cloth.png", { linkedTargetObjectId: "target_object_cloth" }),
        sceneAsset("chapter_asset_cup", "Milk cup", "cup.png"),
      ],
    });
    const draftWithSecondPlacement = addAssetPlacement(createAssemblyDraft(scenePackage), "chapter_asset_cloth");
    const draftWithThirdPlacement = addAssetPlacement(draftWithSecondPlacement, "chapter_asset_cup");
    const groupedDraft = groupPlacements(
      {
        ...draftWithThirdPlacement,
        layer_order: ["placement_bowl", "placement_chapter_asset_cup", "placement_chapter_asset_cloth"],
      },
      ["placement_bowl", "placement_chapter_asset_cloth"],
      "Breakfast props",
    );

    expect(groupedDraft.layer_order).toEqual([
      "placement_bowl",
      "placement_chapter_asset_cloth",
      "placement_chapter_asset_cup",
    ]);
    expect(groupedDraft.groups[0]?.placement_ids).toEqual(["placement_bowl", "placement_chapter_asset_cloth"]);
  });

  it("ungroups a first-level group while keeping placements and layer_order stable", () => {
    const scenePackage = studioScenePackageFixture({
      chapter_assets: [
        ...studioScenePackageFixture().chapter_assets,
        sceneAsset("chapter_asset_cloth", "Cleanup cloth", "cloth.png", { linkedTargetObjectId: "target_object_cloth" }),
      ],
    });
    const draftWithSecondPlacement = addAssetPlacement(createAssemblyDraft(scenePackage), "chapter_asset_cloth");
    const groupedDraft = groupPlacements(
      draftWithSecondPlacement,
      ["placement_chapter_asset_cloth", "placement_bowl"],
      "Breakfast props",
    );

    const ungroupedDraft = ungroupPlacementGroup(groupedDraft, "group_1");

    expect(ungroupedDraft.groups).toEqual([]);
    expect(ungroupedDraft.layer_order).toEqual(groupedDraft.layer_order);
    expect(ungroupedDraft.placements.map((placement) => ({ id: placement.id, group_id: placement.group_id }))).toEqual([
      { id: "placement_bowl", group_id: null },
      { id: "placement_chapter_asset_cloth", group_id: null },
    ]);
  });

  it("never emits editor-only records when projecting a manifest", () => {
    const draft = createAssemblyDraft(studioScenePackageFixture());
    const editorDraft = {
      ...draft,
      placements: draft.placements.map((placement) => ({
        ...placement,
        editor_shape_id: "shape:placement_bowl",
        legacy_canvas_record: { id: "shape:placement_bowl", typeName: "shape" },
      })),
      groups: draft.groups.map((group) => ({
        ...group,
        editor_shape_id: "shape:group_1",
      })),
      legacy_canvas_document: { records: [] },
    };

    const manifest = projectManifestForSave(editorDraft);

    expect(manifest).not.toHaveProperty("legacy_canvas_document");
    expect(manifest.placements[0]).not.toHaveProperty("editor_shape_id");
    expect(manifest.placements[0]).not.toHaveProperty("legacy_canvas_record");
  });

  it("dedupes raw layer_order during draft creation and save projection but still keeps every placement", () => {
    const scenePackage = studioScenePackageFixture({
      chapter_assets: [
        ...studioScenePackageFixture().chapter_assets,
        sceneAsset("chapter_asset_cloth", "Cleanup cloth", "cloth.png", { linkedTargetObjectId: "target_object_cloth" }),
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
            transform: { cx: 0.4, cy: 0.4, w: 0.2, h: 0.2, rotation_deg: 0 },
            group_id: null,
            requires_placed: [],
          },
        ],
        layer_order: ["placement_bowl", "placement_bowl"],
      },
    });

    const draft = createAssemblyDraft(scenePackage);
    const manifest = projectManifestForSave(draft);

    expect(draft.layer_order).toEqual(["placement_bowl", "placement_chapter_asset_cloth"]);
    expect(manifest.layer_order).toEqual(["placement_bowl", "placement_chapter_asset_cloth"]);
  });
});
