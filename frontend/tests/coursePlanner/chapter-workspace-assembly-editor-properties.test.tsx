import "./assemblyEditorDependencyMocks";
import { useEffect, useMemo, useRef, useState } from "react";
import { act } from "@testing-library/react";
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
import type { DirectChapterAssetUploadInput } from "../../src/features/coursePlanner/api";
import {
  buildAssemblyReadiness,
  isAssemblyReady,
} from "../../src/features/coursePlanner/assembly/assemblyReadiness";
import { exportAssemblyPreviewFile } from "../../src/features/coursePlanner/assembly/assemblyExport";
import { studioStatusLabel } from "../../src/features/coursePlanner/pages/ChapterWorkspacePage";
import type {
  AsyncStatusMap,
  ChapterSceneAssemblyManifest,
  ChapterScenePackage,
} from "../../src/features/coursePlanner/types";
import {
  characterIpFixture,
  referenceImageFixture,
  sceneAsset,
  snapshot,
  studioChapterFixture,
  studioScenePackageFixture,
  studioScenePackFixture,
} from "./chapterWorkspaceFixtures";

import {
  ASSEMBLY_AUTOSAVE_DEBOUNCE_MS,
  AssemblyEditorHarness,
  type AssemblyEditorHarnessControls,
  advanceAutosaveCycle,
  advanceAutosaveTime,
  buildLockedFinalScene,
  emptyAssemblyManifest,
  flushAsyncScenePackage,
  mockCanvasBlob,
  mockScenePackageImages,
  scenePackageWithDependentPlacements,
  scenePackageWithGroupedPlacements,
  scenePackageWithReplacementCandidate,
  scenePackageWithTwoPlacements,
  scenePackageWithTwoPlacementsConfig,
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

function scenePackageWithPixelGeometry(input?: {
  transform?: Partial<ChapterSceneAssemblyManifest["placements"][number]["transform"]>;
}) {
  const baseScenePackage = scenePackageWithTwoPlacementsConfig({
    placementOverrides: {
      placement_bowl: {
        transform: {
          cx: 0.54,
          cy: 0.4,
          w: 0.18,
          h: 0.2,
          rotation_deg: 12,
          ...(input?.transform ?? {}),
        },
      },
    },
  });
  return {
    ...baseScenePackage,
    empty_scene_images: [
      {
        ...baseScenePackage.empty_scene_images[0],
        width: 900,
        height: 600,
      },
    ],
    assembly: {
      ...baseScenePackage.assembly,
      empty_scene_size: { width: 900, height: 600 },
    },
  };
}


describe("Assembly editor properties and asset actions", () => {
  it("batch-updates runtime role for multi-selected placements from the properties panel", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    const saveSpy = vi.fn();
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithTwoPlacements()}
        onSaveAssemblyManifest={saveSpy}
      />,
    );

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    await user.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));
    await user.keyboard("{Control>}");
    await user.click(within(layerTree).getByRole("button", { name: /Cleanup cloth target/ }));
    await user.keyboard("{/Control}");

    const properties = screen.getByRole("region", { name: "Placement properties" });
    expect(within(properties).getByText("2 selected")).toBeInTheDocument();
    expect(within(properties).getByText("2 placements selected")).toBeInTheDocument();

    await user.click(within(properties).getByRole("button", { name: "Initial" }));

    expect(within(layerTree).getByRole("button", { name: /Breakfast bowl initial/ })).toBeInTheDocument();
    expect(within(layerTree).getByRole("button", { name: /Cleanup cloth initial/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(saveSpy).toHaveBeenLastCalledWith(expect.objectContaining({
        placements: expect.arrayContaining([
          expect.objectContaining({ id: "placement_bowl", runtime_role: "initial" }),
          expect.objectContaining({ id: "placement_cloth", runtime_role: "initial" }),
        ]),
      }));
    });
  });

  it("shows compact high-frequency placement fields without internal transform names", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    render(<AssemblyEditorHarness initialScenePackage={scenePackageWithPixelGeometry()} />);

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    await user.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));

    const properties = screen.getByRole("region", { name: "Placement properties" });
    expect(within(properties).getByRole("heading", { name: "Placement" })).toBeInTheDocument();
    expect(within(properties).getByLabelText("Name")).toHaveDisplayValue("Breakfast bowl");
    expect(within(properties).getByRole("button", { name: "Target" })).toHaveAttribute("aria-pressed", "true");
    expect(within(properties).getByRole("button", { name: "Initial" })).toHaveAttribute("aria-pressed", "false");
    expect(within(properties).getByLabelText("Position X")).toHaveDisplayValue("486");
    expect(within(properties).getByLabelText("Position Y")).toHaveDisplayValue("240");
    expect(within(properties).getByLabelText("Width")).toHaveDisplayValue("162");
    expect(within(properties).getByLabelText("Height")).toHaveDisplayValue("120");
    expect(within(properties).getByLabelText("Rotation")).toHaveDisplayValue("12");
    expect(properties).toHaveTextContent("px");
    expect(properties).toHaveTextContent("degrees");
    expect(properties).not.toHaveTextContent("Dependencies");
    expect(within(properties).queryByText("rotation_deg")).not.toBeInTheDocument();
    expect(within(properties).queryByText("cx")).not.toBeInTheDocument();
    expect(within(properties).queryByText("cy")).not.toBeInTheDocument();
    expect(within(properties).queryByText("w")).not.toBeInTheDocument();
    expect(within(properties).queryByText("h")).not.toBeInTheDocument();
    expect(properties).not.toHaveTextContent("Target object");
    expect(properties).not.toHaveTextContent("target_object_bowl");
  });

  it("rejects non-positive pixel sizes without mutating the placement draft", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    const saveSpy = vi.fn();
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithPixelGeometry()}
        onSaveAssemblyManifest={saveSpy}
      />,
    );

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    await user.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));

    const properties = screen.getByRole("region", { name: "Placement properties" });
    const width = within(properties).getByLabelText("Width");
    const height = within(properties).getByLabelText("Height");
    expect(width).toHaveDisplayValue("162");
    expect(height).toHaveDisplayValue("120");

    fireEvent.change(width, { target: { value: "0" } });
    fireEvent.change(height, { target: { value: "-5" } });

    expect(width).toHaveDisplayValue("162");
    expect(height).toHaveDisplayValue("120");
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("writes pixel placement edits back to normalized manifest transform values", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    const saveSpy = vi.fn();
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithPixelGeometry()}
        onSaveAssemblyManifest={saveSpy}
      />,
    );

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    await user.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));

    const properties = screen.getByRole("region", { name: "Placement properties" });
    fireEvent.change(within(properties).getByLabelText("Position X"), { target: { value: "450" } });
    fireEvent.change(within(properties).getByLabelText("Position Y"), { target: { value: "0" } });
    fireEvent.change(within(properties).getByLabelText("Width"), { target: { value: "180" } });
    fireEvent.change(within(properties).getByLabelText("Rotation"), { target: { value: "-15" } });

    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(saveSpy).toHaveBeenLastCalledWith(expect.objectContaining({
        placements: expect.arrayContaining([
          expect.objectContaining({
            id: "placement_bowl",
            transform: expect.objectContaining({
              cx: 0.5,
              cy: 0,
              w: 0.2,
              rotation_deg: -15,
            }),
          }),
        ]),
      }));
    });
  });

  it("shows mixed batch geometry and applies entered pixel values to all selected placements", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    const saveSpy = vi.fn();
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithPixelGeometry({
          transform: { cx: 0.54, w: 0.18 },
        })}
        onSaveAssemblyManifest={saveSpy}
      />,
    );

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    await user.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));
    await user.keyboard("{Control>}");
    await user.click(within(layerTree).getByRole("button", { name: /Cleanup cloth target/ }));
    await user.keyboard("{/Control}");

    const properties = screen.getByRole("region", { name: "Placement properties" });
    expect(within(properties).getByText("2 selected")).toBeInTheDocument();
    expect(within(properties).getByLabelText("Position X")).toHaveDisplayValue("");
    expect(within(properties).getByLabelText("Position X")).toHaveAttribute("placeholder", "Mixed");
    expect(within(properties).getByLabelText("Width")).toHaveDisplayValue("");
    expect(within(properties).getByLabelText("Width")).toHaveAttribute("placeholder", "Mixed");

    fireEvent.change(within(properties).getByLabelText("Position X"), { target: { value: "450" } });
    fireEvent.change(within(properties).getByLabelText("Width"), { target: { value: "180" } });

    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(saveSpy).toHaveBeenLastCalledWith(expect.objectContaining({
        placements: expect.arrayContaining([
          expect.objectContaining({
            id: "placement_bowl",
            transform: expect.objectContaining({ cx: 0.5, w: 0.2 }),
          }),
          expect.objectContaining({
            id: "placement_cloth",
            transform: expect.objectContaining({ cx: 0.5, w: 0.2 }),
          }),
        ]),
      }));
    });
  });

  it("renames only the selected placement and keeps the source Chapter Asset name unchanged", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    const saveSpy = vi.fn();
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithPixelGeometry()}
        onSaveAssemblyManifest={saveSpy}
      />,
    );

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    await user.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));

    const properties = screen.getByRole("region", { name: "Placement properties" });
    fireEvent.change(within(properties).getByLabelText("Name"), {
      target: { value: "Hero bowl placement" },
    });

    await waitFor(() => {
      expect(within(layerTree).getByRole("button", { name: /Hero bowl placement target/ })).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: "Breakfast bowl" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(saveSpy).toHaveBeenLastCalledWith(expect.objectContaining({
        placements: expect.arrayContaining([
          expect.objectContaining({
            id: "placement_bowl",
            asset_id: "chapter_asset_bowl",
            display_name: "Hero bowl placement",
          }),
        ]),
      }));
    });
  });

  it("keeps placement names typed in properties literal across canvas and layer labels", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    const saveSpy = vi.fn();
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithPixelGeometry()}
        onSaveAssemblyManifest={saveSpy}
      />,
    );

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    await user.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));

    const rawPlacementName = "Hero_bowl-placement_01";
    const properties = screen.getByRole("region", { name: "Placement properties" });
    fireEvent.change(within(properties).getByLabelText("Name"), {
      target: { value: rawPlacementName },
    });

    expect(within(properties).getByLabelText("Name")).toHaveDisplayValue(rawPlacementName);
    await waitFor(() => {
      expect(within(layerTree).getByRole("button", { name: `${rawPlacementName} target` })).toBeInTheDocument();
      expect(screen.getByTestId("overlay-label-placement_bowl")).toHaveTextContent(rawPlacementName);
    });
    expect(screen.getByRole("heading", { name: "Breakfast bowl" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(saveSpy).toHaveBeenLastCalledWith(expect.objectContaining({
        placements: expect.arrayContaining([
          expect.objectContaining({
            id: "placement_bowl",
            asset_id: "chapter_asset_bowl",
            display_name: rawPlacementName,
          }),
        ]),
      }));
    });
  });

  it("confirms batch placement removal and deletes all selected placement facts", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    const saveSpy = vi.fn();
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithTwoPlacements()}
        onSaveAssemblyManifest={saveSpy}
      />,
    );

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    await user.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));
    await user.keyboard("{Control>}");
    await user.click(within(layerTree).getByRole("button", { name: /Cleanup cloth target/ }));
    await user.keyboard("{/Control}");

    const properties = screen.getByRole("region", { name: "Placement properties" });
    expect(within(layerTree).getByRole("button", { name: "Group selected layers" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Align left" })).not.toBeInTheDocument();
    await user.click(within(properties).getByRole("button", { name: "Remove selected placements" }));

    expect(await screen.findByText("Remove 2 placements?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm removal" }));

    expect(within(layerTree).queryByRole("button", { name: /Breakfast bowl/ })).not.toBeInTheDocument();
    expect(within(layerTree).queryByRole("button", { name: /Cleanup cloth/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(saveSpy).toHaveBeenLastCalledWith(expect.objectContaining({
        placements: [],
        groups: [],
        layer_order: [],
      }));
    });
  });

  it("hides dependency controls from the primary placement properties panel", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    render(<AssemblyEditorHarness initialScenePackage={scenePackageWithDependentPlacements()} />);

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    await user.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));

    const properties = screen.getByRole("region", { name: "Placement properties" });
    expect(within(properties).queryByText("Dependencies")).not.toBeInTheDocument();
    expect(within(properties).queryByText("Advanced dependencies")).not.toBeInTheDocument();
    expect(within(properties).queryByRole("checkbox", { name: /Cleanup cloth/i })).not.toBeInTheDocument();
  });

  it("confirms placement removal and clears dependency references from remaining placements", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    const saveSpy = vi.fn();
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithDependentPlacements()}
        onSaveAssemblyManifest={saveSpy}
      />,
    );

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    await user.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));

    const properties = screen.getByRole("region", { name: "Placement properties" });
    await user.click(within(properties).getByRole("button", { name: "Remove placement" }));

    expect(await screen.findByText("Remove Breakfast bowl?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm removal" }));

    expect(within(layerTree).queryByRole("button", { name: /Breakfast bowl/ })).not.toBeInTheDocument();
    expect(within(layerTree).getByRole("button", { name: /Cleanup cloth target/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(saveSpy).toHaveBeenLastCalledWith(expect.objectContaining({
        placements: [expect.objectContaining({
          id: "placement_cloth",
          requires_placed: [],
        })],
      }));
    });
  });

  it("keeps the manifest unchanged when placement removal is canceled", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    const saveSpy = vi.fn();
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithDependentPlacements()}
        onSaveAssemblyManifest={saveSpy}
      />,
    );

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    await user.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));

    const properties = screen.getByRole("region", { name: "Placement properties" });
    await user.click(within(properties).getByRole("button", { name: "Remove placement" }));
    expect(await screen.findByText("Remove Breakfast bowl?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Remove Breakfast bowl?")).not.toBeInTheDocument();

    expect(saveSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });

  it("keeps preserved placements in alignment review after Empty Scene replacement until the author explicitly saves", async () => {
    vi.useFakeTimers();
    mockScenePackageImages();
    const saveSpy = vi.fn();
    const controlsRef = { current: null as AssemblyEditorHarnessControls | null };
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithReplacementCandidate()}
        onHarnessReady={(controls) => {
          controlsRef.current = controls;
        }}
        onSaveAssemblyManifest={saveSpy}
      />,
    );

    await act(async () => {
      await controlsRef.current?.selectEmptySceneImage("empty_scene_002");
    });

    expect(screen.getByText("2 placements need alignment review.")).toBeInTheDocument();
    expect(screen.getAllByText("Alignment risk").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /save/i })).toBeEnabled();

    await advanceAutosaveCycle();
    expect(saveSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await flushAsyncScenePackage();

    expect(saveSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      empty_scene_image_id: "empty_scene_002",
      empty_scene_size: { width: 1536, height: 1024 },
      placements: expect.arrayContaining([
        expect.objectContaining({
          id: "placement_bowl",
          transform: {
            cx: 0.42,
            cy: 0.58,
            w: 0.18,
            h: 0.18,
            rotation_deg: 0,
          },
        }),
        expect.objectContaining({
          id: "placement_cloth",
          transform: {
            cx: 0.62,
            cy: 0.54,
            w: 0.14,
            h: 0.14,
            rotation_deg: 0,
          },
        }),
      ]),
    }));
    expect(screen.queryByText("2 placements need alignment review.")).not.toBeInTheDocument();
  });

  it("keeps autosave blocked when only one preserved placement is re-positioned after Empty Scene replacement", async () => {
    vi.useFakeTimers();
    mockScenePackageImages();
    const saveSpy = vi.fn();
    const controlsRef = { current: null as AssemblyEditorHarnessControls | null };
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithReplacementCandidate()}
        onHarnessReady={(controls) => {
          controlsRef.current = controls;
        }}
        onSaveAssemblyManifest={saveSpy}
      />,
    );

    await act(async () => {
      await controlsRef.current?.selectEmptySceneImage("empty_scene_002");
    });

    expect(screen.getByText("2 placements need alignment review.")).toBeInTheDocument();

    const properties = screen.getByRole("region", { name: "Placement properties" });
    fireEvent.change(within(properties).getByLabelText("Position X"), { target: { value: "768" } });

    expect(screen.getByText("1 placements need alignment review.")).toBeInTheDocument();

    await advanceAutosaveCycle();
    expect(saveSpy).not.toHaveBeenCalled();
    expect(screen.getByText("1 placements need alignment review.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save/i })).toBeEnabled();
  });

  it("requires explicit confirmation before clearing placements after Empty Scene replacement", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    const saveSpy = vi.fn();
    const controlsRef = { current: null as AssemblyEditorHarnessControls | null };
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithReplacementCandidate()}
        onHarnessReady={(controls) => {
          controlsRef.current = controls;
        }}
        onSaveAssemblyManifest={saveSpy}
      />,
    );

    await act(async () => {
      await controlsRef.current?.selectEmptySceneImage("empty_scene_002");
    });

    await user.click(screen.getByRole("button", { name: "Clear placements" }));
    expect(await screen.findByText("Clear placements for the new Empty Scene?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm clear" }));

    await waitFor(() => {
      expect(saveSpy).toHaveBeenLastCalledWith(expect.objectContaining({
        empty_scene_image_id: "empty_scene_002",
        empty_scene_size: { width: 1536, height: 1024 },
        placements: [],
        groups: [],
        layer_order: [],
      }));
    });
  });

});
