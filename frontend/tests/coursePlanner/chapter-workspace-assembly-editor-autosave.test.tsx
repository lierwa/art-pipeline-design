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
import { buildTldrawAssemblySnapshot } from "../../src/features/coursePlanner/assembly/tldrawAssemblyAdapter";
import {
  applySnapshotToEditor,
  createAssemblyCameraFitState,
  readPlacementSelectionState,
  syncSelectionToEditor,
  type AssemblyEditorShapeLike,
} from "../../src/features/coursePlanner/components/AssemblyEditorCanvas";
import { ChapterSceneStudio } from "../../src/features/coursePlanner/components/ChapterSceneStudio";
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
  buildSnapshot,
  flushAsyncScenePackage,
  mockCanvasBlob,
  mockScenePackageImages,
  scenePackageWithDependentPlacements,
  scenePackageWithGroupedPlacements,
  scenePackageWithReplacementCandidate,
  scenePackageWithTwoPlacements,
  scenePackageWithTwoPlacementsConfig,
} from "./assemblyEditorHarness";
import { createMockAssemblyEditor, layerLabels } from "./assemblyEditorTestUtils";

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


describe("Chapter Scene Studio assembly autosave", () => {
  it("debounces rapid transform edits into one autosave", async () => {
    vi.useFakeTimers();
    mockScenePackageImages();
    const saveSpy = vi.fn();
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithTwoPlacements()}
        onSaveAssemblyManifest={saveSpy}
      />,
    );

    const layerTree = screen.getByRole("region", { name: "Assembly layers" });
    fireEvent.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));

    const properties = screen.getByRole("region", { name: "Placement properties" });
    const cxInput = within(properties).getByRole("spinbutton", { name: "cx" });
    const cyInput = within(properties).getByRole("spinbutton", { name: "cy" });

    fireEvent.change(cxInput, { target: { value: "0.451" } });
    fireEvent.change(cyInput, { target: { value: "0.602" } });

    expect(saveSpy).not.toHaveBeenCalled();
    expect(screen.getByText("Saving")).toBeInTheDocument();

    await advanceAutosaveTime(ASSEMBLY_AUTOSAVE_DEBOUNCE_MS - 1);
    expect(saveSpy).not.toHaveBeenCalled();

    await advanceAutosaveTime(1);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      placements: expect.arrayContaining([
        expect.objectContaining({
          id: "placement_bowl",
          transform: expect.objectContaining({ cx: 0.451, cy: 0.602 }),
        }),
      ]),
    }));
    await flushAsyncScenePackage();
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("keeps the edited transform and exposes Retry when autosave fails", async () => {
    vi.useFakeTimers();
    mockScenePackageImages();
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithTwoPlacements()}
        saveAssemblyBehavior={async (_manifest, _current, attempt) => {
          if (attempt === 1) {
            throw new Error("Autosave exploded.");
          }
          return null;
        }}
      />,
    );

    const layerTree = screen.getByRole("region", { name: "Assembly layers" });
    fireEvent.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));

    const properties = screen.getByRole("region", { name: "Placement properties" });
    const cxInput = within(properties).getByRole("spinbutton", { name: "cx" });
    fireEvent.change(cxInput, { target: { value: "0.333" } });

    await advanceAutosaveCycle();
    expect(screen.getAllByText("Save failed")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
    expect(screen.getByText("Autosave exploded.")).toBeInTheDocument();
    expect(within(properties).getByRole("spinbutton", { name: "cx" })).toHaveValue(0.333);
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

    const layerTree = screen.getByRole("region", { name: "Assembly layers" });
    fireEvent.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));

    const properties = screen.getByRole("region", { name: "Placement properties" });
    const cxInput = within(properties).getByRole("spinbutton", { name: "cx" });
    fireEvent.change(cxInput, { target: { value: "0.287" } });

    await advanceAutosaveCycle();
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await flushAsyncScenePackage();
    expect(savedManifests).toHaveLength(2);
    expect(savedManifests[1]).toEqual(savedManifests[0]);
    expect(screen.getByText("Saved")).toBeInTheDocument();
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

    const layerTree = screen.getByRole("region", { name: "Assembly layers" });
    fireEvent.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));

    const properties = screen.getByRole("region", { name: "Placement properties" });
    const cxInput = within(properties).getByRole("spinbutton", { name: "cx" });
    fireEvent.change(cxInput, { target: { value: "0.287" } });

    await advanceAutosaveCycle();
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();

    fireEvent.change(cxInput, { target: { value: "0.412" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Assembly" }));

    await flushAsyncScenePackage();
    expect(savedManifests).toHaveLength(2);
    expect(savedManifests[0]?.placements.find((placement) => placement.id === "placement_bowl")?.transform.cx).toBe(0.287);
    expect(savedManifests[1]?.placements.find((placement) => placement.id === "placement_bowl")?.transform.cx).toBe(0.412);
    expect(screen.getByText("Saved")).toBeInTheDocument();
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

    const layerTree = screen.getByRole("region", { name: "Assembly layers" });
    fireEvent.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));

    const properties = screen.getByRole("region", { name: "Placement properties" });
    const cxInput = within(properties).getByRole("spinbutton", { name: "cx" });
    fireEvent.change(cxInput, { target: { value: "0.401" } });

    await advanceAutosaveCycle();
    expect(within(properties).getByRole("spinbutton", { name: "cx" })).toHaveValue(0.777);
    expect(screen.getByText("Saved")).toBeInTheDocument();
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

    const layerTree = screen.getByRole("region", { name: "Assembly layers" });
    fireEvent.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));
    const properties = screen.getByRole("region", { name: "Placement properties" });
    const cxInput = within(properties).getByRole("spinbutton", { name: "cx" });

    fireEvent.change(cxInput, { target: { value: "0.401" } });
    await advanceAutosaveCycle();
    expect(savedManifests).toHaveLength(1);

    fireEvent.change(cxInput, { target: { value: "0.612" } });
    expect(cxInput).toHaveValue(0.612);
    await act(async () => {
      releaseFirstSave?.();
    });

    expect(within(properties).getByRole("spinbutton", { name: "cx" })).toHaveValue(0.612);
    await advanceAutosaveCycle();

    expect(savedManifests).toHaveLength(2);
    expect(savedManifests[0]?.placements.find((placement) => placement.id === "placement_bowl")?.transform.cx).toBe(0.401);
    expect(savedManifests[1]?.placements.find((placement) => placement.id === "placement_bowl")?.transform.cx).toBe(0.612);
    expect(screen.getByText("Saved")).toBeInTheDocument();
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

    fireEvent.click(within(screen.getByRole("region", { name: "Assembly layers" })).getByRole("button", { name: /Breakfast bowl target/ }));

    await act(async () => {
      controlsRef.current?.pushScenePackage(scenePackageWithTwoPlacementsConfig({
        placementOverrides: {
          placement_bowl: { transform: { cx: 0.91 } },
        },
      }));
    });

    expect(within(screen.getByRole("region", { name: "Placement properties" })).getByRole("spinbutton", { name: "cx" })).toHaveValue(0.91);
    expect(screen.getByText("Saved")).toBeInTheDocument();
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

    const layerTree = screen.getByRole("region", { name: "Assembly layers" });
    fireEvent.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));

    const properties = screen.getByRole("region", { name: "Placement properties" });
    const cxInput = within(properties).getByRole("spinbutton", { name: "cx" });
    fireEvent.change(cxInput, { target: { value: "0.301" } });

    await act(async () => {
      controlsRef.current?.pushScenePackage(scenePackageWithTwoPlacementsConfig({
        placementOverrides: {
          placement_bowl: { transform: { cx: 0.87 } },
        },
      }));
    });

    expect(cxInput).toHaveValue(0.301);
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
    expect(screen.getByText("New package data arrived from the server. Retry to save your local assembly edits.")).toBeInTheDocument();

    fireEvent.change(cxInput, { target: { value: "0.322" } });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await flushAsyncScenePackage();
    expect(savedManifests).toHaveLength(1);
    expect(savedManifests[0]?.placements.find((placement) => placement.id === "placement_bowl")?.transform.cx).toBe(0.322);
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });
});
