import "./assemblyEditorDependencyMocks";
import { useEffect, useMemo, useRef, useState } from "react";
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
  userEvent,
  waitFor,
  within,
} from "../app/appTestHarness";
import type { DirectChapterAssetUploadInput } from "../../src/features/coursePlanner/api";
import {
  buildAssemblyReadiness,
  isAssemblyReady,
} from "../../src/features/coursePlanner/assembly/assemblyReadiness";
import { classifyIncomingAssemblyManifest } from "../../src/features/coursePlanner/assembly/assemblyAutosavePolicy";
import { exportAssemblyPreviewFile } from "../../src/features/coursePlanner/assembly/assemblyExport";
import { manifestKeyOf } from "../../src/features/coursePlanner/assembly/assemblyWorkspaceState";
import { AssemblyWorkspacePanel } from "../../src/features/coursePlanner/components/AssemblyWorkspacePanel";
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

function placementTransformCx(manifest: ChapterSceneAssemblyManifest, placementId: string) {
  return manifest.placements.find((placement) => placement.id === placementId)?.transform.cx;
}

function manifestWithPlacementX(scenePackage: ChapterScenePackage, placementId: string, cx: number) {
  return {
    ...scenePackage.assembly,
    placements: scenePackage.assembly.placements.map((placement) => (
      placement.id === placementId
        ? { ...placement, transform: { ...placement.transform, cx } }
        : placement
    )),
  } satisfies ChapterSceneAssemblyManifest;
}

function scenePackageWithOnlyBowlPlacement() {
  const scenePackage = scenePackageWithTwoPlacements();
  return {
    ...scenePackage,
    assembly: {
      ...scenePackage.assembly,
      placements: scenePackage.assembly.placements.filter((placement) => placement.id === "placement_bowl"),
      layer_order: ["placement_bowl"],
    },
  } satisfies ChapterScenePackage;
}

describe("assembly autosave manifest policy", () => {
  it("classifies save echoes, stale save responses, clean refreshes, conflicts, and catalog refreshes", () => {
    const initialScenePackage = scenePackageWithTwoPlacements();
    const baselineManifest = initialScenePackage.assembly;
    const firstLocalManifest = manifestWithPlacementX(initialScenePackage, "placement_bowl", 0.401);
    const newerLocalManifest = manifestWithPlacementX(initialScenePackage, "placement_bowl", 0.611);
    const remoteManifest = manifestWithPlacementX(initialScenePackage, "placement_bowl", 0.87);
    const baselineManifestKey = manifestKeyOf(baselineManifest);
    const firstLocalManifestKey = manifestKeyOf(firstLocalManifest);

    expect(classifyIncomingAssemblyManifest({
      baselineManifestKey,
      incomingManifest: remoteManifest,
      inFlightManifestKey: null,
      lastAcceptedSaveManifestKey: null,
      lastObservedManifestKey: baselineManifestKey,
      localPendingManifest: baselineManifest,
    })).toBe("integrate-clean-server");

    expect(classifyIncomingAssemblyManifest({
      baselineManifestKey,
      incomingManifest: firstLocalManifest,
      inFlightManifestKey: firstLocalManifestKey,
      lastAcceptedSaveManifestKey: null,
      lastObservedManifestKey: baselineManifestKey,
      localPendingManifest: firstLocalManifest,
    })).toBe("integrate-own-save-echo");

    expect(classifyIncomingAssemblyManifest({
      baselineManifestKey,
      incomingManifest: firstLocalManifest,
      inFlightManifestKey: firstLocalManifestKey,
      lastAcceptedSaveManifestKey: null,
      lastObservedManifestKey: baselineManifestKey,
      localPendingManifest: newerLocalManifest,
    })).toBe("keep-local-after-older-save");

    expect(classifyIncomingAssemblyManifest({
      baselineManifestKey,
      incomingManifest: remoteManifest,
      inFlightManifestKey: null,
      lastAcceptedSaveManifestKey: firstLocalManifestKey,
      lastObservedManifestKey: baselineManifestKey,
      localPendingManifest: firstLocalManifest,
    })).toBe("server-conflict");

    expect(classifyIncomingAssemblyManifest({
      baselineManifestKey,
      incomingManifest: baselineManifest,
      inFlightManifestKey: null,
      lastAcceptedSaveManifestKey: null,
      lastObservedManifestKey: baselineManifestKey,
      localPendingManifest: firstLocalManifest,
    })).toBe("catalog-only-refresh");
  });
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

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    fireEvent.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));

    const properties = screen.getByRole("region", { name: "Placement properties" });
    const positionXInput = placementGeometryInput(properties, "Position X");
    const positionYInput = placementGeometryInput(properties, "Position Y");

    fireEvent.change(positionXInput, { target: { value: "462" } });
    fireEvent.change(positionYInput, { target: { value: "616" } });

    expect(saveSpy).not.toHaveBeenCalled();
    expect(within(assemblyEditorStatus()).getByText("Saving changes")).toBeInTheDocument();

    await advanceAutosaveTime(ASSEMBLY_AUTOSAVE_DEBOUNCE_MS - 1);
    expect(saveSpy).not.toHaveBeenCalled();

    await advanceAutosaveTime(1);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      placements: expect.arrayContaining([
        expect.objectContaining({
          id: "placement_bowl",
          transform: expect.objectContaining({
            cx: normalizedPlacementPx(462),
            cy: normalizedPlacementPx(616),
          }),
        }),
      ]),
    }));
    await flushAsyncScenePackage();
    expect(within(assemblyEditorStatus()).getByText("All changes saved")).toBeInTheDocument();
  });

  it("does not enter conflict when a placement drag autosaves and the server echoes the same material manifest", async () => {
    vi.useFakeTimers();
    mockScenePackageImages();
    const savedManifests: ChapterSceneAssemblyManifest[] = [];
    const initialScenePackage = scenePackageWithTwoPlacements();
    render(
      <AssemblyEditorHarness
        initialScenePackage={initialScenePackage}
        saveAssemblyBehavior={async (manifest, current) => {
          savedManifests.push(manifest);
          return {
            ...current,
            assembly: {
              ...manifest,
              updated_at: "2026-07-04T08:14:00Z",
            },
          };
        }}
      />,
    );

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    fireEvent.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));

    const properties = screen.getByRole("region", { name: "Placement properties" });
    const positionXInput = placementGeometryInput(properties, "Position X");
    fireEvent.change(positionXInput, { target: { value: "462" } });

    await advanceAutosaveCycle();

    expect(savedManifests).toHaveLength(1);
    expect(screen.queryByText(/New package data arrived from the server/)).not.toBeInTheDocument();
    expect(within(assemblyEditorStatus()).getByText("All changes saved")).toBeInTheDocument();
    expect(placementGeometryInput(properties, "Position X")).toHaveValue(462);
  });

  it("preserves the selected placement after autosave integrates its own save echo", async () => {
    vi.useFakeTimers();
    mockScenePackageImages();
    const savedManifests: ChapterSceneAssemblyManifest[] = [];
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithTwoPlacements()}
        saveAssemblyBehavior={async (manifest, current) => {
          savedManifests.push(manifest);
          return {
            ...current,
            assembly: {
              ...manifest,
              updated_at: "2026-07-04T08:14:30Z",
            },
          };
        }}
      />,
    );

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    fireEvent.click(within(layerTree).getByRole("button", { name: /Cleanup cloth target/ }));
    const properties = screen.getByRole("region", { name: "Placement properties" });
    fireEvent.change(placementGeometryInput(properties, "Position X"), { target: { value: "690" } });

    await advanceAutosaveCycle();

    expect(savedManifests).toHaveLength(1);
    expect(within(layerTree).getByRole("button", { name: /Cleanup cloth target/, pressed: true })).toBeInTheDocument();
    expect(within(layerTree).getByRole("button", { name: /Breakfast bowl target/, pressed: false })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Placement properties" })).toHaveTextContent("Cleanup cloth");
    expect(screen.getByLabelText("Assembly editor status")).toHaveTextContent("X 690");
  });

  it("does not overwrite a newer local drag when an older save response resolves", async () => {
    vi.useFakeTimers();
    mockScenePackageImages();
    const controlsRef = { current: null as AssemblyEditorHarnessControls | null };
    const savedManifests: ChapterSceneAssemblyManifest[] = [];
    let releaseFirstSave: (() => void) | null = null;
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithTwoPlacements()}
        onHarnessReady={(controls) => {
          controlsRef.current = controls;
        }}
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
              updated_at: `2026-07-04T08:1${attempt}:00Z`,
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

    await act(async () => {
      fireEvent.change(positionXInput, { target: { value: "627" } });
      releaseFirstSave?.();
      await Promise.resolve();
    });

    expect(placementGeometryInput(properties, "Position X")).toHaveValue(627);
    expect(within(assemblyEditorStatus()).queryByText("All changes saved")).not.toBeInTheDocument();
    expect(within(assemblyEditorStatus()).getByText("Saving changes")).toBeInTheDocument();
    expect(controlsRef.current?.getLockFinalState()?.hasDirtyChanges).toBe(true);
    expect(placementTransformCx(controlsRef.current?.getScenePackage().assembly ?? savedManifests[0], "placement_bowl"))
      .toBe(normalizedPlacementPx(411));

    await advanceAutosaveCycle();

    expect(savedManifests).toHaveLength(2);
    expect(placementTransformCx(savedManifests[1], "placement_bowl")).toBe(normalizedPlacementPx(627));
    expect(within(assemblyEditorStatus()).getByText("All changes saved")).toBeInTheDocument();
  });

  it("does not restart the autosave debounce on unrelated scene package rerenders", async () => {
    vi.useFakeTimers();
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
              updated_at: "2026-07-04T08:15:00Z",
            },
          };
        }}
      />,
    );

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    fireEvent.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));
    const properties = screen.getByRole("region", { name: "Placement properties" });
    fireEvent.change(placementGeometryInput(properties, "Position X"), { target: { value: "520" } });

    await advanceAutosaveTime(ASSEMBLY_AUTOSAVE_DEBOUNCE_MS / 2);
    await act(async () => {
      const currentScenePackage = controlsRef.current?.getScenePackage();
      if (currentScenePackage) {
        controlsRef.current?.pushScenePackage({
          ...currentScenePackage,
          current_prompt_package: {
            ...currentScenePackage.current_prompt_package!,
            generated_at: "2026-07-04T08:15:30Z",
          },
        });
      }
    });
    await advanceAutosaveTime(ASSEMBLY_AUTOSAVE_DEBOUNCE_MS / 2);

    expect(savedManifests).toHaveLength(1);
    expect(placementTransformCx(savedManifests[0], "placement_bowl")).toBe(normalizedPlacementPx(520));
  });

  it("does not let an older save response overwrite an added asset draft", async () => {
    vi.useFakeTimers();
    mockScenePackageImages();
    const savedManifests: ChapterSceneAssemblyManifest[] = [];
    let releaseFirstSave: (() => void) | null = null;
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithOnlyBowlPlacement()}
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
              updated_at: `2026-07-04T08:2${attempt}:00Z`,
            },
          };
        }}
      />,
    );

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    fireEvent.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));
    const properties = screen.getByRole("region", { name: "Placement properties" });
    fireEvent.change(placementGeometryInput(properties, "Position X"), { target: { value: "411" } });
    await advanceAutosaveCycle();
    expect(savedManifests).toHaveLength(1);

    await act(async () => {
      const cleanupCard = screen.getByText("Cleanup cloth").closest("article");
      expect(cleanupCard).toBeInTheDocument();
      fireEvent.click(within(cleanupCard as HTMLElement).getByRole("button", { name: "Add to Assembly" }));
      await Promise.resolve();
      releaseFirstSave?.();
      await Promise.resolve();
    });

    expect(within(screen.getByRole("region", { name: "Placement layers" })).getByRole("button", { name: /Cleanup cloth target/ }))
      .toBeInTheDocument();
    expect(within(assemblyEditorStatus()).queryByText("All changes saved")).not.toBeInTheDocument();
    expect(within(assemblyEditorStatus()).getByText("Saving changes")).toBeInTheDocument();

    await advanceAutosaveCycle();

    expect(savedManifests).toHaveLength(2);
    expect(savedManifests[1]?.placements.some((placement) => placement.display_name === "Cleanup cloth")).toBe(true);
    expect(within(assemblyEditorStatus()).getByText("All changes saved")).toBeInTheDocument();
  });

  it("enters conflict only when remote assembly content diverges from the local pending manifest", async () => {
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
              updated_at: "2026-07-04T08:13:00Z",
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

    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
    expect(screen.getByText("Conflict").closest(".course-planner-inline-error")).toHaveTextContent(
      "New package data arrived from the server. Retry overwrites the newer server assembly with your local draft.",
    );
    expect(positionXInput).toHaveValue(308);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await flushAsyncScenePackage();
    expect(savedManifests).toHaveLength(1);
    expect(placementTransformCx(savedManifests[0], "placement_bowl")).toBe(normalizedPlacementPx(308));
    expect(within(assemblyEditorStatus()).getByText("All changes saved")).toBeInTheDocument();
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

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    fireEvent.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));

    const properties = screen.getByRole("region", { name: "Placement properties" });
    const positionXInput = placementGeometryInput(properties, "Position X");
    fireEvent.change(positionXInput, { target: { value: "341" } });

    await advanceAutosaveCycle();
    expect(within(assemblyEditorStatus()).getByText("Save failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
    expect(screen.getByText(
      "Autosave exploded. Retry saves the same local manifest after the failed request.",
    ).closest(".course-planner-inline-error")).toHaveTextContent(
      "Autosave exploded. Retry saves the same local manifest after the failed request.",
    );
    expect(placementGeometryInput(properties, "Position X")).toHaveValue(341);
  });
});
