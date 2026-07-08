import "./assemblyEditorDependencyMocks";
import { afterEach, beforeEach, vi } from "vitest";

import {
  cleanup,
  describe,
  expect,
  it,
  render,
  screen,
  userEvent,
  within,
} from "../app/appTestHarness";
import {
  sceneAsset,
  studioScenePackageFixture,
} from "./chapterWorkspaceFixtures";
import {
  AssemblyEditorHarness,
  emptyAssemblyManifest,
  mockScenePackageImages,
  scenePackageWithDependentPlacements,
  scenePackageWithGroupedPlacements,
  scenePackageWithTwoPlacements,
} from "./assemblyEditorHarness";
import { layerLabels } from "./assemblyEditorTestUtils";

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

describe("Assembly editor asset actions", () => {
  it("confirms used Chapter Asset deletion and removes placement plus dependency references", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    render(<AssemblyEditorHarness initialScenePackage={scenePackageWithDependentPlacements()} />);

    const assetPool = screen.getByRole("region", { name: "Assembly asset pool" });
    const assetRows = within(assetPool).getAllByRole("article");
    await user.click(within(assetRows[0] ?? document.body).getByRole("button", { name: "Asset actions for Breakfast bowl" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete asset" }));
    expect(await screen.findByText("Delete Breakfast bowl?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm delete asset" }));

    expect(within(assetPool).queryByText("Breakfast bowl")).not.toBeInTheDocument();
    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    expect(within(layerTree).queryByRole("button", { name: /Breakfast bowl/ })).not.toBeInTheDocument();
    await user.click(within(layerTree).getByRole("button", { name: /Cleanup cloth target/ }));
    const properties = screen.getByRole("region", { name: "Placement properties" });
    expect(within(properties).queryByRole("checkbox", { name: /Breakfast bowl/i })).not.toBeInTheDocument();
  });

  it("keeps placement metadata read-only and does not surface out-of-scope custom gameplay fields", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    render(<AssemblyEditorHarness initialScenePackage={scenePackageWithTwoPlacements()} />);

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    await user.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));

    const properties = screen.getByRole("region", { name: "Placement properties" });
    expect(within(properties).getAllByText("Breakfast bowl").length).toBeGreaterThan(0);
    expect(properties).not.toHaveTextContent("chapter_asset_bowl");
    expect(within(properties).queryByLabelText(/display name/i)).not.toBeInTheDocument();
    expect(within(properties).queryByLabelText(/asset id/i)).not.toBeInTheDocument();
    expect(properties).not.toHaveTextContent("Blocked toast");
    expect(properties).not.toHaveTextContent("Target area");
    expect(properties).not.toHaveTextContent("Tolerance");
    expect(properties).not.toHaveTextContent("Gameplay step");
  });

  it("keeps UUID-only asset identifiers out of visible placement labels", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    const uuidAssetId = "40764843-f70d-48dd-9d6a-8475a3fff53d";
    const dependencyUuidAssetId = "4e29bf91-7146-4f3e-9c6c-091d8e7f7bd9";
    render(
      <AssemblyEditorHarness
        initialScenePackage={studioScenePackageFixture({
          chapter_assets: [
            sceneAsset(uuidAssetId, uuidAssetId, `${uuidAssetId}.png`, { linkedTargetObjectId: "target_object_bowl" }),
            sceneAsset(dependencyUuidAssetId, dependencyUuidAssetId, `${dependencyUuidAssetId}.png`, { linkedTargetObjectId: "target_object_cloth" }),
          ],
          assembly: {
            ...emptyAssemblyManifest(),
            placements: [
              {
                id: "placement_uuid_primary",
                asset_id: uuidAssetId,
                display_name: uuidAssetId,
                runtime_role: "target",
                transform: { cx: 0.42, cy: 0.58, w: 0.18, h: 0.18, rotation_deg: 0 },
                group_id: null,
                requires_placed: [],
              },
              {
                id: "placement_uuid_dependency",
                asset_id: dependencyUuidAssetId,
                display_name: dependencyUuidAssetId,
                runtime_role: "initial",
                transform: { cx: 0.62, cy: 0.54, w: 0.14, h: 0.14, rotation_deg: 0 },
                group_id: null,
                requires_placed: [],
              },
            ],
            layer_order: ["placement_uuid_primary", "placement_uuid_dependency"],
          },
        })}
      />,
    );

    const assetPool = screen.getByRole("region", { name: "Assembly asset pool" });
    expect(assetPool).not.toHaveTextContent(uuidAssetId);
    expect(assetPool).not.toHaveTextContent(dependencyUuidAssetId);
    expect(within(assetPool).getByText("Unnamed target asset 1")).toBeInTheDocument();
    expect(within(assetPool).getByText("Unnamed target asset 2")).toBeInTheDocument();

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    await user.click(within(layerTree).getByRole("button", { name: /Unnamed target asset 1 target/ }));

    const properties = screen.getByRole("region", { name: "Placement properties" });
    expect(properties).not.toHaveTextContent(uuidAssetId);
    expect(properties).not.toHaveTextContent(dependencyUuidAssetId);
    expect(within(properties).getAllByText("Unnamed target asset 1").length).toBeGreaterThan(0);
    expect(within(properties).getByLabelText("Name")).toHaveDisplayValue("Unnamed target asset 1");
    expect(within(properties).queryByText("Dependencies")).not.toBeInTheDocument();
    expect(within(properties).queryByRole("checkbox", { name: /Unnamed target asset 2 initial/ })).not.toBeInTheDocument();
  });

  it("does not expose grouping controls in the placement properties workflow", async () => {
    mockScenePackageImages();
    render(<AssemblyEditorHarness initialScenePackage={scenePackageWithGroupedPlacements()} />);

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    expect(within(layerTree).queryByRole("button", { name: "Breakfast props" })).not.toBeInTheDocument();
    const properties = screen.getByRole("region", { name: "Placement properties" });
    expect(within(properties).queryByRole("button", { name: "Ungroup selected layer" })).not.toBeInTheDocument();
    expect(within(properties).queryByRole("button", { name: "Group selected layers" })).not.toBeInTheDocument();
    expect(layerLabels(layerTree)).toEqual(expect.arrayContaining(["Breakfast bowl", "Cleanup cloth"]));
  });

  it("uploads a direct scene asset into the same connected pool", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    const uploadInputSpy = vi.fn();
    render(
      <AssemblyEditorHarness
        initialScenePackage={studioScenePackageFixture()}
        onDirectAssetUploadInput={uploadInputSpy}
      />,
    );

    const input = screen.getByLabelText("Upload Scene Asset", { selector: 'input[type="file"]' });
    await user.selectOptions(screen.getByLabelText("Upload target object"), "target_object_cloth");

    await user.upload(input, new File(["asset"], "cloth.png", { type: "image/png" }));

    expect(uploadInputSpy).toHaveBeenCalledWith({
      displayName: "cloth",
      linkedTargetObjectId: "target_object_cloth",
    });
    const assetPool = screen.getByRole("region", { name: "Assembly asset pool" });
    const uploadsGroup = await within(assetPool).findByRole("group", { name: "Uploads" });
    expect(await within(uploadsGroup).findByRole("heading", { name: "cloth" })).toBeInTheDocument();
    expect(within(assetPool).getByRole("button", { name: "Upload images" })).toBeInTheDocument();
  });
});
