import "./assemblyEditorDependencyMocks";
import { act } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, vi } from "vitest";

import {
  cleanup,
  describe,
  expect,
  fireEvent,
  it,
  render,
  screen,
  within,
} from "../app/appTestHarness";
import { AssemblyWorkspacePanel } from "../../src/features/coursePlanner/components/AssemblyWorkspacePanel";
import type { ChapterSceneAssemblyManifest } from "../../src/features/coursePlanner/types";
import {
  ASSEMBLY_AUTOSAVE_DEBOUNCE_MS,
  AssemblyEditorHarness,
  type AssemblyEditorHarnessControls,
  advanceAutosaveCycle,
  advanceAutosaveTime,
  flushAsyncScenePackage,
  mockScenePackageImages,
  scenePackageWithTwoPlacements,
  scenePackageWithTwoPlacementsConfig,
} from "./assemblyEditorHarness";

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

const ASSEMBLY_TEST_SCENE_SIZE_PX = 1024;

function placementGeometryInput(properties: HTMLElement, name: string) {
  return within(properties).getByRole("spinbutton", { name });
}

function normalizedPlacementPx(pixelValue: number) {
  return pixelValue / ASSEMBLY_TEST_SCENE_SIZE_PX;
}

function displayedPlacementPx(normalizedValue: number) {
  return Math.round(normalizedValue * ASSEMBLY_TEST_SCENE_SIZE_PX);
}

function assemblyEditorStatus() {
  return screen.getByLabelText("Assembly editor status");
}

describe("Chapter Scene Studio assembly autosave retry and refresh paths", () => {
  it("flushes a dirty placement edit before Back navigation can clear the debounce timer", async () => {
    vi.useFakeTimers();
    mockScenePackageImages();
    const initialScenePackage = scenePackageWithTwoPlacements();
    const saveSpy = vi.fn(async (manifest: ChapterSceneAssemblyManifest) => ({
      ...initialScenePackage,
      assembly: {
        ...manifest,
        updated_at: "2026-07-04T08:12:00Z",
      },
    }));
    render(
      <MemoryRouter initialEntries={["/course-planner/chapters/chapter_breakfast_kitchen/assembly"]}>
        <AssemblyWorkspacePanel
          backTo="/course-planner/chapters/chapter_breakfast_kitchen"
          chapterTitle="Chapter 02 - Breakfast Time"
          onDeleteChapterAsset={vi.fn(async () => null)}
          onDuplicateChapterAsset={vi.fn(async () => null)}
          onListGeneratedAssets={vi.fn(async () => [])}
          onMaterializeGeneratedAsset={vi.fn(async () => null)}
          onSaveAssembly={saveSpy}
          onUploadDirectAsset={vi.fn(async () => null)}
          scenePackage={initialScenePackage}
        />
      </MemoryRouter>,
    );

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    fireEvent.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));

    const properties = screen.getByRole("region", { name: "Placement properties" });
    fireEvent.change(placementGeometryInput(properties, "Position X"), { target: { value: "512" } });
    await advanceAutosaveTime(ASSEMBLY_AUTOSAVE_DEBOUNCE_MS - 1);
    expect(saveSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("link", { name: "Back to Chapter" }));
    await flushAsyncScenePackage();

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      placements: expect.arrayContaining([
        expect.objectContaining({
          id: "placement_bowl",
          transform: expect.objectContaining({
            cx: normalizedPlacementPx(512),
          }),
        }),
      ]),
    }));
  });

  it("retries with the same projected manifest after a failed autosave", async () => {
    vi.useFakeTimers();
    mockScenePackageImages();
    const savedManifests: ChapterSceneAssemblyManifest[] = [];
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithTwoPlacements()}
        saveAssemblyBehavior={async (manifest, current, attempt) => {
          savedManifests.push(manifest);
          if (attempt === 1) {
            throw new Error("First autosave failed.");
          }
          return {
            ...current,
            assembly: {
              ...manifest,
              updated_at: "2026-07-04T08:00:00Z",
            },
          };
        }}
      />,
    );

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    fireEvent.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));

    const properties = screen.getByRole("region", { name: "Placement properties" });
    const positionXInput = placementGeometryInput(properties, "Position X");
    fireEvent.change(positionXInput, { target: { value: "294" } });

    await advanceAutosaveCycle();
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await flushAsyncScenePackage();
    expect(savedManifests).toHaveLength(2);
    expect(savedManifests[1]).toEqual(savedManifests[0]);
    expect(within(assemblyEditorStatus()).getByText("All changes saved")).toBeInTheDocument();
  });

  it("uses the latest projected manifest after editing again following a failed autosave", async () => {
    vi.useFakeTimers();
    mockScenePackageImages();
    const savedManifests: ChapterSceneAssemblyManifest[] = [];
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithTwoPlacements()}
        saveAssemblyBehavior={async (manifest, current, attempt) => {
          savedManifests.push(manifest);
          if (attempt === 1) {
            throw new Error("First autosave failed.");
          }
          return {
            ...current,
            assembly: {
              ...manifest,
              updated_at: "2026-07-04T08:02:00Z",
            },
          };
        }}
      />,
    );

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    fireEvent.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));

    const properties = screen.getByRole("region", { name: "Placement properties" });
    const positionXInput = placementGeometryInput(properties, "Position X");
    fireEvent.change(positionXInput, { target: { value: "294" } });

    await advanceAutosaveCycle();
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();

    fireEvent.change(positionXInput, { target: { value: "422" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Assembly" }));

    await flushAsyncScenePackage();
    expect(savedManifests).toHaveLength(2);
    expect(savedManifests[0]?.placements.find((placement) => placement.id === "placement_bowl")?.transform.cx).toBe(normalizedPlacementPx(294));
    expect(savedManifests[1]?.placements.find((placement) => placement.id === "placement_bowl")?.transform.cx).toBe(normalizedPlacementPx(422));
    expect(within(assemblyEditorStatus()).getByText("All changes saved")).toBeInTheDocument();
  });

  it("refreshes the draft from the returned package after autosave succeeds", async () => {
    vi.useFakeTimers();
    mockScenePackageImages();
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithTwoPlacements()}
        saveAssemblyBehavior={async (manifest, current) => ({
          ...current,
          assembly: {
            ...manifest,
            placements: manifest.placements.map((placement) => (
              placement.id === "placement_bowl"
                ? {
                    ...placement,
                    transform: { ...placement.transform, cx: 0.777 },
                  }
                : placement
            )),
            updated_at: "2026-07-04T08:05:00Z",
          },
        })}
      />,
    );

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    fireEvent.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));

    const properties = screen.getByRole("region", { name: "Placement properties" });
    const positionXInput = placementGeometryInput(properties, "Position X");
    fireEvent.change(positionXInput, { target: { value: "411" } });

    await advanceAutosaveCycle();
    expect(placementGeometryInput(properties, "Position X")).toHaveValue(displayedPlacementPx(0.777));
    expect(within(assemblyEditorStatus()).getByText("All changes saved")).toBeInTheDocument();
  });

  it("does not let a slow autosave response overwrite newer dirty edits", async () => {
    vi.useFakeTimers();
    mockScenePackageImages();
    const savedManifests: ChapterSceneAssemblyManifest[] = [];
    let releaseFirstSave: (() => void) | null = null;
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithTwoPlacements()}
        saveAssemblyBehavior={async (manifest, current, attempt) => {
          savedManifests.push(manifest);
          if (attempt === 1) {
            await new Promise<void>((resolve) => {
              releaseFirstSave = resolve;
            });
          }
          return {
            ...current,
            assembly: {
              ...manifest,
              updated_at: `2026-07-04T08:0${attempt}:00Z`,
            },
          };
        }}
      />,
    );

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    fireEvent.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));
    const properties = screen.getByRole("region", { name: "Placement properties" });
    const positionXInput = placementGeometryInput(properties, "Position X");

    fireEvent.change(positionXInput, { target: { value: "411" } });
    await advanceAutosaveCycle();
    expect(savedManifests).toHaveLength(1);

    fireEvent.change(positionXInput, { target: { value: "627" } });
    expect(positionXInput).toHaveValue(627);
    await act(async () => {
      releaseFirstSave?.();
    });

    expect(placementGeometryInput(properties, "Position X")).toHaveValue(627);
    await advanceAutosaveCycle();

    expect(savedManifests).toHaveLength(2);
    expect(savedManifests[0]?.placements.find((placement) => placement.id === "placement_bowl")?.transform.cx).toBe(normalizedPlacementPx(411));
    expect(savedManifests[1]?.placements.find((placement) => placement.id === "placement_bowl")?.transform.cx).toBe(normalizedPlacementPx(627));
    expect(within(assemblyEditorStatus()).getByText("All changes saved")).toBeInTheDocument();
  });

  it("merges clean server package updates when there are no local dirty edits", async () => {
    mockScenePackageImages();
    const controlsRef = { current: null as AssemblyEditorHarnessControls | null };
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithTwoPlacements()}
        onHarnessReady={(controls) => {
          controlsRef.current = controls;
        }}
      />,
    );

    fireEvent.click(within(screen.getByRole("region", { name: "Placement layers" })).getByRole("button", { name: /Breakfast bowl target/ }));

    await act(async () => {
      controlsRef.current?.pushScenePackage(scenePackageWithTwoPlacementsConfig({
        placementOverrides: {
          placement_bowl: { transform: { cx: 0.91 } },
        },
      }));
    });

    expect(placementGeometryInput(screen.getByRole("region", { name: "Placement properties" }), "Position X"))
      .toHaveValue(displayedPlacementPx(0.91));
    expect(within(assemblyEditorStatus()).getByText("All changes saved")).toBeInTheDocument();
  });

  it("keeps editing when a background refresh only changes assembly updated_at metadata", async () => {
    mockScenePackageImages();
    const controlsRef = { current: null as AssemblyEditorHarnessControls | null };
    const initialScenePackage = scenePackageWithTwoPlacements();
    render(
      <AssemblyEditorHarness
        initialScenePackage={initialScenePackage}
        onHarnessReady={(controls) => {
          controlsRef.current = controls;
        }}
      />,
    );

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    fireEvent.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));

    const properties = screen.getByRole("region", { name: "Placement properties" });
    const positionXInput = placementGeometryInput(properties, "Position X");
    fireEvent.change(positionXInput, { target: { value: "308" } });

    await act(async () => {
      controlsRef.current?.pushScenePackage({
        ...initialScenePackage,
        assembly: {
          ...initialScenePackage.assembly,
          updated_at: "2026-07-04T08:06:00Z",
        },
      });
    });

    expect(positionXInput).toHaveValue(308);
    expect(screen.queryByText(/New package data arrived from the server/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Assembly" })).toBeEnabled();
  });

  it("keeps the dirty local draft on server conflict and retries with the latest edited manifest", async () => {
    mockScenePackageImages();
    const controlsRef = { current: null as AssemblyEditorHarnessControls | null };
    const savedManifests: ChapterSceneAssemblyManifest[] = [];
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithTwoPlacements()}
        onHarnessReady={(controls) => {
          controlsRef.current = controls;
        }}
        saveAssemblyBehavior={async (manifest, current) => {
          savedManifests.push(manifest);
          return {
            ...current,
            assembly: {
              ...manifest,
              updated_at: "2026-07-04T08:07:00Z",
            },
          };
        }}
      />,
    );

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    fireEvent.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));

    const properties = screen.getByRole("region", { name: "Placement properties" });
    const positionXInput = placementGeometryInput(properties, "Position X");
    fireEvent.change(positionXInput, { target: { value: "308" } });

    await act(async () => {
      controlsRef.current?.pushScenePackage(scenePackageWithTwoPlacementsConfig({
        placementOverrides: {
          placement_bowl: { transform: { cx: 0.87 } },
        },
      }));
    });

    expect(positionXInput).toHaveValue(308);
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
    const conflictStatus = screen.getByRole("status");
    expect(conflictStatus).toHaveTextContent(
      "New package data arrived from the server. Retry overwrites the newer server assembly with your local draft.",
    );
    expect(conflictStatus.closest(".assembly-workspace-feedback")).not.toBeNull();
    expect(screen.getByRole("region", { name: "Assembly asset pool" })).toBeInTheDocument();

    fireEvent.change(positionXInput, { target: { value: "330" } });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await flushAsyncScenePackage();
    expect(savedManifests).toHaveLength(1);
    expect(savedManifests[0]?.placements.find((placement) => placement.id === "placement_bowl")?.transform.cx).toBe(normalizedPlacementPx(330));
    expect(within(assemblyEditorStatus()).getByText("All changes saved")).toBeInTheDocument();
  });
});
