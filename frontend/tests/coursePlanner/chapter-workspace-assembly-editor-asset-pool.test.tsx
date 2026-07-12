import "./assemblyEditorDependencyMocks";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, vi } from "vitest";

import {
  cleanup,
  describe,
  expect,
  fireEvent,
  it,
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from "../app/appTestHarness";
import type { ChapterScenePackage } from "../../src/features/coursePlanner/types";
import {
  sceneAsset,
  studioScenePackageFixture,
} from "./chapterWorkspaceFixtures";
import {
  AssemblyEditorHarness,
  emptyAssemblyManifest,
  mockScenePackageImages,
  scenePackageWithTwoPlacements,
} from "./assemblyEditorHarness";
import { coursePlannerVisualReferenceFixture } from "./coursePlannerVisualReferenceFixtures";

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal("requestAnimationFrame", ((callback: FrameRequestCallback) => {
    callback(performance.now());
    return 1;
  }) as typeof requestAnimationFrame);
  vi.stubGlobal("cancelAnimationFrame", (() => undefined) as typeof cancelAnimationFrame);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Assembly editor asset pool", () => {
  it("keeps asset cards compact with reference-style add and more actions", async () => {
    mockScenePackageImages();
    render(
      <AssemblyEditorHarness
        initialScenePackage={studioScenePackageFixture({
          chapter_assets: [
            sceneAsset(
              "chapter_asset_bowl",
              "Breakfast bowl",
              "40764843-f70d-48dd-9d6a-8475a3fff53d.png",
              { linkedTargetObjectId: "target_object_bowl" },
            ),
          ],
        })}
      />,
    );

    const assetPool = screen.getByRole("region", { name: "Assembly asset pool" });
    expect(within(assetPool).getByText("Breakfast bowl")).toBeInTheDocument();
    expect(within(assetPool).queryByText("40764843-f70d-48dd-9d6a-8475a3fff53d.png")).not.toBeInTheDocument();

    const card = within(assetPool).getByText("Breakfast bowl").closest("article") as HTMLElement;
    expect(within(card).getByRole("button", { name: "Add to Assembly" })).toHaveClass("assembly-asset-card-add");
    expect(within(card).getByRole("button", { name: "Asset actions for Breakfast bowl" })).toHaveClass("assembly-asset-card-more");
    expect(within(card).queryByRole("button", { name: "Locate Placement" })).not.toBeInTheDocument();
  });

  it("renders generated assets as the primary group and uploads as secondary with usage counts", async () => {
    const user = userEvent.setup();
    mockScenePackageImages();
    render(<AssemblyEditorHarness initialScenePackage={manyResourceAssetPoolScenePackage()} />);

    const assetPool = screen.getByRole("region", { name: "Assembly asset pool" });
    expect(within(assetPool).getByRole("heading", { name: "Asset Pool" })).toBeInTheDocument();
    expect(within(assetPool).getByRole("searchbox", { name: "Search assets" })).toBeInTheDocument();
    expect(within(assetPool).queryByRole("button", { name: /Filter/i })).not.toBeInTheDocument();
    expect(within(assetPool).queryByRole("button", { name: "All" })).not.toBeInTheDocument();
    expect(within(assetPool).queryByRole("button", { name: "Target" })).not.toBeInTheDocument();
    expect(within(assetPool).queryByRole("button", { name: "Prop" })).not.toBeInTheDocument();
    expect(within(assetPool).queryByRole("button", { name: "Scene" })).not.toBeInTheDocument();
    expect(within(assetPool).queryByRole("button", { name: /List view/i })).not.toBeInTheDocument();
    expect(within(assetPool).queryByText("Linked")).not.toBeInTheDocument();
    expect(within(assetPool).queryByText("Unlinked")).not.toBeInTheDocument();
    const generatedGroup = within(assetPool).getByRole("group", { name: "Generated assets" });
    const uploadsGroup = within(assetPool).getByRole("group", { name: "Uploads" });
    expect(assetPool.compareDocumentPosition(generatedGroup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(generatedGroup.compareDocumentPosition(uploadsGroup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(generatedGroup).getByText("Cute Cat")).toBeInTheDocument();
    expect(within(generatedGroup).getByText("Tissue Box")).toBeInTheDocument();
    expect(within(generatedGroup).getByText("2 uses")).toBeInTheDocument();
    expect(within(generatedGroup).getAllByText("1 use").length).toBeGreaterThanOrEqual(2);
    const generatedHeading = within(generatedGroup).getByRole("heading", { name: "Generated assets (3)" });
    expect(generatedHeading).toBeInTheDocument();
    const generatedCollapseButton = within(generatedGroup).getByRole("button", { name: "Collapse Generated assets" });
    expect(generatedCollapseButton).toHaveClass("course-planner-icon-button");
    expect(generatedCollapseButton).toHaveAttribute("aria-expanded", "true");
    expect(generatedCollapseButton.closest(".assembly-asset-pool-group-heading-actions")).toBeInstanceOf(HTMLElement);
    await user.click(generatedCollapseButton);
    expect(within(generatedGroup).queryByText("Cute Cat")).not.toBeInTheDocument();
    expect(within(generatedGroup).getByRole("button", { name: "Expand Generated assets" })).toHaveAttribute("aria-expanded", "false");
    const uploadedRugCard = within(uploadsGroup).getByText("Uploaded rug").closest("article");
    expect(uploadedRugCard).toBeInTheDocument();
    expect(within(uploadedRugCard as HTMLElement).getByText("0 uses")).toBeInTheDocument();
    expect(within(assetPool).queryByText(/40764843|c47d8a10|Chapter asset 001/)).not.toBeInTheDocument();
    expect(within(assetPool).getByText("Unnamed asset 1")).toBeInTheDocument();
    expect(within(assetPool).getByText("Unnamed asset 2")).toBeInTheDocument();
  });

  it("uses fixed thumbnail frames, three-part cards, and a sticky upload footer", () => {
    mockScenePackageImages();
    render(<AssemblyEditorHarness initialScenePackage={manyResourceAssetPoolScenePackage()} />);

    const assetPool = screen.getByRole("region", { name: "Assembly asset pool" });
    const generatedGroup = within(assetPool).getByRole("group", { name: "Generated assets" });
    const catCard = within(generatedGroup).getByText("Cute Cat").closest("article");
    expect(catCard).toBeInTheDocument();
    expect(catCard).toHaveClass("assembly-asset-row");
    expect(catCard?.querySelector(".assembly-asset-card-top")).toBeInstanceOf(HTMLElement);
    expect(catCard?.querySelector(".assembly-asset-card-middle")).toBeInstanceOf(HTMLElement);
    expect(catCard?.querySelector(".assembly-asset-card-bottom")).toBeInstanceOf(HTMLElement);
    expect(catCard?.querySelector(".assembly-asset-thumb-frame")).toBeInstanceOf(HTMLElement);
    expect(catCard?.querySelector(".assembly-asset-thumb-frame img.assembly-asset-thumb")).toBeInstanceOf(HTMLImageElement);
    expect(catCard?.querySelector(".assembly-asset-card-add")).toBeInstanceOf(HTMLButtonElement);
    expect(catCard?.querySelector(".assembly-asset-card-bottom .assembly-asset-usage-count")).toBeInTheDocument();
    expect(catCard?.querySelector(".assembly-asset-card-bottom .assembly-asset-actions")).toBeInTheDocument();
    expect(within(catCard as HTMLElement).getByText("1024 x 1024")).toBeInTheDocument();
    expect(within(catCard as HTMLElement).getByRole("button", { name: "Add to Assembly" })).toBeEnabled();
    expect(within(catCard as HTMLElement).getByRole("button", { name: "Asset actions for Cute Cat" })).toHaveClass("assembly-asset-card-more");
    expect(within(assetPool).queryByText(/^x$/i)).not.toBeInTheDocument();

    const uploadFooter = assetPool.querySelector(".assembly-asset-pool-upload-footer");
    expect(uploadFooter).toBeInstanceOf(HTMLElement);
    expect(within(uploadFooter as HTMLElement).getByRole("button", { name: "Upload images" })).toBeInTheDocument();
    expect(within(uploadFooter as HTMLElement).getByRole("button", { name: "Upload images" })).toHaveClass(
      "assembly-asset-pool-upload-button",
    );
    expect(within(assetPool).getAllByRole("button", { name: "Upload images" })).toHaveLength(1);

    const stylesheet = readFileSync(
      path.join(process.cwd(), "src", "features", "coursePlanner", "components", "assemblyAssetPool.css"),
      "utf8",
    );
    expect(cssRule(stylesheet, ".assembly-editor-assets-column .assembly-asset-row")).toContain(
      "grid-template-rows: auto minmax(0, 1fr) auto",
    );
    expect(cssRule(stylesheet, ".assembly-editor-assets-column .assembly-asset-thumb-frame")).toContain(
      "aspect-ratio: 4 / 3",
    );
    const footerRule = cssRule(stylesheet, ".assembly-asset-pool-upload-footer");
    expect(footerRule).toContain("position: sticky");
    expect(footerRule).toContain("bottom: 0");
    const shellStylesheet = readFileSync(
      path.join(process.cwd(), "src", "features", "coursePlanner", "components", "assemblyEditorShell.css"),
      "utf8",
    );
    const railRule = cssRule(shellStylesheet, ".assembly-product-shell .assembly-editor-assets-column");
    expect(railRule).toContain("grid-template-rows: minmax(0, 1fr)");
    expect(railRule).toContain("align-content: stretch");
  });

  it("searches generated and uploaded asset groups from the same field", async () => {
    const user = userEvent.setup();
    mockScenePackageImages();
    render(<AssemblyEditorHarness initialScenePackage={manyResourceAssetPoolScenePackage()} />);

    const assetPool = screen.getByRole("region", { name: "Assembly asset pool" });
    const search = within(assetPool).getByRole("searchbox", { name: "Search assets" });

    fireEvent.change(search, { target: { value: "rug" } });

    await waitFor(() => {
      expect(within(assetPool).getByText("Uploaded rug")).toBeInTheDocument();
      expect(within(assetPool).queryByText("Cute Cat")).not.toBeInTheDocument();
      expect(within(assetPool).queryByRole("group", { name: "Generated assets" })).not.toBeInTheDocument();
    });

    fireEvent.change(search, { target: { value: "cute" } });

    await waitFor(() => {
      expect(within(assetPool).getByText("Cute Cat")).toBeInTheDocument();
      expect(within(assetPool).queryByText("Uploaded rug")).not.toBeInTheDocument();
      expect(within(assetPool).queryByRole("group", { name: "Uploads" })).not.toBeInTheDocument();
    });
  });

  it("keeps scene-linked assets visible without a fake Scene asset filter", async () => {
    mockScenePackageImages();
    render(<AssemblyEditorHarness initialScenePackage={manyResourceAssetPoolScenePackage()} />);

    const assetPool = screen.getByRole("region", { name: "Assembly asset pool" });
    expect(within(assetPool).queryByRole("button", { name: "Scene assets unavailable" })).not.toBeInTheDocument();
    expect(within(assetPool).getByText("Cute Cat")).toBeInTheDocument();
    expect(within(assetPool).getByText("Tissue Box")).toBeInTheDocument();
  });

  it("adds an unused available asset when clicking its asset card", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    render(
      <AssemblyEditorHarness
        initialScenePackage={studioScenePackageFixture({
          chapter_assets: [
            sceneAsset("chapter_asset_cup", "Milk cup", "milk-cup.png", { linkedTargetObjectId: "target_object_cloth" }),
          ],
          assembly: emptyAssemblyManifest(),
        })}
      />,
    );

    const assetPool = screen.getByRole("region", { name: "Assembly asset pool" });
    const card = within(assetPool).getByText("Milk cup").closest("article");
    expect(card).toBeInTheDocument();

    await user.click(card as HTMLElement);

    expect(await screen.findByText("Saving changes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Milk cup target/, pressed: true })).toBeInTheDocument();
    expect(within(card as HTMLElement).getByRole("button", { name: "Asset actions for Milk cup" })).toBeInTheDocument();
  });

  it("locates an existing placement when clicking its used asset card", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    render(<AssemblyEditorHarness initialScenePackage={scenePackageWithTwoPlacements()} />);

    const assetPool = screen.getByRole("region", { name: "Assembly asset pool" });
    const cleanupCard = within(assetPool).getByText("Cleanup cloth").closest("article");
    expect(cleanupCard).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Breakfast bowl target/, pressed: true })).toBeInTheDocument();

    await user.click(cleanupCard as HTMLElement);

    expect(screen.getByRole("button", { name: /Cleanup cloth target/, pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Placement properties" })).toHaveTextContent("Cleanup cloth");
  });

  it("adds another placement row for a used asset while keeping locate available", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    render(<AssemblyEditorHarness initialScenePackage={studioScenePackageFixture()} />);

    const assetPool = screen.getByRole("region", { name: "Assembly asset pool" });
    expect(within(assetPool).getByRole("button", { name: "Asset actions for Breakfast bowl" })).toBeInTheDocument();

    await user.click(within(assetPool).getByRole("button", { name: "Add to Assembly" }));

    expect(await screen.findByText("Saving changes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Breakfast bowl target/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Breakfast bowl 2 target/, pressed: true })).toBeInTheDocument();
    expect(within(assetPool).getByRole("button", { name: "Asset actions for Breakfast bowl" })).toBeInTheDocument();
    expect(within(assetPool).getByRole("button", { name: "Add to Assembly" })).toBeEnabled();
    expect(within(assetPool).getByText("2 uses")).toBeInTheDocument();
  });

  it("opens generated Chapter Assets drawer as a fixed overlay with output states", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    render(
      <AssemblyEditorHarness
        initialScenePackage={manyResourceAssetPoolScenePackage()}
        generatedAssets={[
          generatedOutput("element_floor_lamp", "Floor Lamp", "available"),
          generatedOutput("element_wall_clock", "Wall Clock", "unavailable", {
            unavailable_reason: "Generated asset image file is missing.",
          }),
          generatedOutput("element_cat", "Cute Cat", "added", {
            chapter_asset_id: "chapter_asset_cat_mochi",
          }),
        ]}
      />,
    );

    const assetPool = screen.getByRole("region", { name: "Assembly asset pool" });
    await user.click(within(assetPool).getByRole("button", { name: "Import generated assets" }));

    const drawer = await screen.findByRole("dialog", { name: "Generated Chapter Assets" });
    expect(drawer).toHaveClass("course-planner-drawer");
    expect(drawer.closest(".assembly-editor-layout")).toBeNull();
    expect(within(drawer).getByRole("heading", { name: "Generated Chapter Assets" })).toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: "By Complete Image" })).toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: "By Run" })).toBeInTheDocument();
    expect(within(drawer).getByRole("searchbox", { name: "Search generated assets" })).toBeInTheDocument();
    expect(within(drawer).getByText("Complete Image: Kitchen Table Close.png")).toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: "Add Floor Lamp" })).toBeEnabled();
    expect(within(drawer).getByRole("button", { name: "Added Cute Cat" })).toBeDisabled();
    expect(within(drawer).getByText("Generated asset image file is missing.")).toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: "Add Wall Clock" })).toBeDisabled();
  });

  it("keeps removed assets unavailable from card add actions", async () => {
    mockScenePackageImages();
    const removedAsset = {
      ...sceneAsset("chapter_asset_removed", "Removed cup", "removed-cup.png"),
      status: "removed" as const,
    };
    render(
      <AssemblyEditorHarness
        initialScenePackage={studioScenePackageFixture({
          chapter_assets: [
            sceneAsset("chapter_asset_cup", "Milk cup", "milk-cup.png"),
            removedAsset,
          ],
          assembly: emptyAssemblyManifest(),
        })}
      />,
    );

    const assetPool = screen.getByRole("region", { name: "Assembly asset pool" });
    expect(within(assetPool).getByText("Milk cup")).toBeInTheDocument();
    expect(within(assetPool).queryByText("Removed cup")).not.toBeInTheDocument();
    expect(within(assetPool).getAllByRole("article")).toHaveLength(1);
  });

  it("searches UUID-only assets by the same fallback name shown in the grid", async () => {
    const user = userEvent.setup();
    mockScenePackageImages();
    render(<AssemblyEditorHarness initialScenePackage={manyResourceAssetPoolScenePackage()} />);

    const assetPool = screen.getByRole("region", { name: "Assembly asset pool" });
    const search = within(assetPool).getByRole("searchbox", { name: "Search assets" });
    expect(within(assetPool).getByText("Unnamed asset 1")).toBeInTheDocument();

    await user.type(search, "Unnamed asset");

    expect(within(assetPool).getByText("Unnamed asset 1")).toBeInTheDocument();
    expect(within(assetPool).getByText("Unnamed asset 2")).toBeInTheDocument();
    expect(within(assetPool).queryByText(/40764843|Chapter asset 001/)).not.toBeInTheDocument();
  });

  it("uses readable fallback names when uploaded assets only have UUID filenames", async () => {
    mockScenePackageImages();
    const uuidName = "40764843-f70d-48dd-9d6a-8475a3fff53d";
    render(
      <AssemblyEditorHarness
        initialScenePackage={studioScenePackageFixture({
          chapter_assets: [
            sceneAsset("chapter_asset_001", uuidName, `${uuidName}.png`, { linkedTargetObjectId: null }),
          ],
          assembly: {
            ...emptyAssemblyManifest(),
            placements: [{
              id: "placement_chapter_asset_001",
              asset_id: "chapter_asset_001",
              display_name: uuidName,
              runtime_role: "target",
              transform: { cx: 0.42, cy: 0.58, w: 0.18, h: 0.18, rotation_deg: 0 },
              group_id: null,
              requires_placed: [],
            }],
            layer_order: ["placement_chapter_asset_001"],
          },
        })}
      />,
    );

    const assetPool = screen.getByRole("region", { name: "Assembly asset pool" });
    expect(within(assetPool).queryByText(uuidName)).not.toBeInTheDocument();
    expect(within(assetPool).queryByText(`${uuidName}.png`)).not.toBeInTheDocument();
    expect(within(assetPool).getByText("Unnamed asset")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Unnamed asset target/ })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Placement properties" })).toHaveTextContent("Unnamed asset");
  });

  it("disables Add to Assembly when no Empty Scene Image is selected", () => {
    render(
      <AssemblyEditorHarness
        initialScenePackage={studioScenePackageFixture({
          current_empty_scene_image_id: null,
          assembly: {
            ...emptyAssemblyManifest(),
            empty_scene_image_id: null,
            empty_scene_size: null,
          },
        })}
      />,
    );

    const assetPool = screen.getByRole("region", { name: "Assembly asset pool" });
    expect(within(assetPool).getByText("Select an Empty Scene Image to enable Add to Assembly.")).toBeInTheDocument();
    const addButton = within(assetPool).getByRole("button", { name: "Add to Assembly" });
    expect(addButton).toBeDisabled();
    expect(within(assetPool).queryByRole("article", { name: "Add Breakfast bowl to Assembly" })).not.toBeInTheDocument();
    expect(screen.queryByRole("toolbar", { name: "Canvas tools" })).not.toBeInTheDocument();
    expect(screen.getByText("Select an Empty Scene Image to start the Assembly editor.")).toBeInTheDocument();
  });
});

function manyResourceAssetPoolScenePackage(): ChapterScenePackage {
  const scenePackage = coursePlannerVisualReferenceFixture().scenePackage;
  const uuidOnlyAssetName = "40764843-f70d-48dd-9d6a-8475a3fff53d";
  const secondUuidOnlyAssetName = "c47d8a10-9a5f-4e01-a45f-01cb21b7ec23";

  return {
    ...scenePackage,
    assembly: {
      ...scenePackage.assembly,
      placements: [
        ...scenePackage.assembly.placements,
        {
          id: "placement_cat_second",
          asset_id: "chapter_asset_cat_mochi",
          display_name: "Cute Cat",
          runtime_role: "target",
          transform: { cx: 0.5, cy: 0.7, w: 0.16, h: 0.2, rotation_deg: 0 },
          group_id: null,
          requires_placed: [],
        },
        {
          id: "placement_tissue_box",
          asset_id: "chapter_asset_tea_towel",
          display_name: "Tissue Box",
          runtime_role: "target",
          transform: { cx: 0.72, cy: 0.64, w: 0.12, h: 0.12, rotation_deg: 0 },
          group_id: null,
          requires_placed: [],
        },
      ],
      layer_order: ["placement_cat_second", "placement_tissue_box", ...scenePackage.assembly.layer_order],
    },
    chapter_assets: [
      ...scenePackage.chapter_assets.map((asset) => {
        if (asset.id === "chapter_asset_cat_mochi") {
          return generatedChapterAsset(asset, "Cute Cat", "cute-cat.png", "element_cat");
        }
        if (asset.id === "chapter_asset_tea_towel") {
          return generatedChapterAsset(asset, "Tissue Box", "tissue-box.png", "element_tissue_box");
        }
        return asset;
      }),
      sceneAsset("chapter_asset_rug", "Uploaded rug", "uploaded-rug.png"),
      sceneAsset("chapter_asset_001", uuidOnlyAssetName, `${uuidOnlyAssetName}.png`),
      {
        ...sceneAsset("chapter_asset_002", secondUuidOnlyAssetName, `${secondUuidOnlyAssetName}.png`),
        width: null as unknown as number,
        height: null as unknown as number,
      },
    ],
  };
}

function generatedChapterAsset(
  asset: ChapterScenePackage["chapter_assets"][number],
  displayName: string,
  originalFilename: string,
  runAssetId: string,
): ChapterScenePackage["chapter_assets"][number] {
  return {
    ...asset,
    display_name: displayName,
    original_filename: originalFilename,
    lineage: {
      source_kind: "generated_asset",
      complete_scene_image_id: "visual_complete_scene_001",
      pipeline_run_id: "visual_run_complete_001",
      run_asset_id: runAssetId,
    },
  };
}

function generatedOutput(
  runAssetId: string,
  displayName: string,
  state: "available" | "unavailable" | "added",
  overrides: Partial<{
    chapter_asset_id: string | null;
    unavailable_reason: string | null;
  }> = {},
) {
  return {
    complete_scene_image_id: "visual_complete_scene_001",
    pipeline_run_id: "visual_run_complete_001",
    run_asset_id: runAssetId,
    display_name: displayName,
    state,
    width: state === "unavailable" ? null : 1024,
    height: state === "unavailable" ? null : 1024,
    unavailable_reason: overrides.unavailable_reason ?? null,
    chapter_asset_id: overrides.chapter_asset_id ?? null,
  };
}

function cssRule(stylesheet: string, selector: string): string {
  return stylesheet.match(new RegExp(`${escapeRegExp(selector)}\\s*\\{[^}]+}`))?.[0] ?? "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
