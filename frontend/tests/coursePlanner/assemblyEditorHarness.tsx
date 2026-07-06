import { act } from "@testing-library/react";
import { vi } from "vitest";

import type {
  ChapterSceneAssemblyManifest,
} from "../../src/features/coursePlanner/types";
import { ASSEMBLY_AUTOSAVE_DEBOUNCE_MS } from "../../src/features/coursePlanner/components/assemblyWorkspaceConstants";
import {
  sceneAsset,
  studioScenePackageFixture,
} from "./chapterWorkspaceFixtures";
export {
  AssemblyEditorHarness,
  buildLockedFinalScene,
  type AssemblyEditorHarnessControls,
  type AssemblyEditorHarnessProps,
} from "./assemblyEditorHarnessComponent";
export { ASSEMBLY_AUTOSAVE_DEBOUNCE_MS };

export function emptyAssemblyManifest(): ChapterSceneAssemblyManifest {
  return {
    schema_version: 1,
    empty_scene_image_id: "empty_scene_001",
    empty_scene_size: { width: 1024, height: 1024 },
    placements: [],
    groups: [],
    layer_order: [],
    updated_at: null,
  };
}

export function mockCanvasBlob() {
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
    callback(new Blob(["png"], { type: "image/png" }));
  });
}

export function mockScenePackageImages() {
  class MockImage {
    onload: null | (() => void) = null;

    onerror: null | (() => void) = null;

    decode = vi.fn(async () => undefined);

    naturalWidth = 512;

    naturalHeight = 256;

    width = 512;

    height = 256;

    #src = "";

    set src(value: string) {
      this.#src = value;
      if (value.includes("empty_scene_images")) {
        this.naturalWidth = 1024;
        this.naturalHeight = 1024;
        this.width = 1024;
        this.height = 1024;
      }
      this.onload?.();
    }

    get src() {
      return this.#src;
    }
  }

  vi.stubGlobal("Image", MockImage as unknown as typeof Image);
}

export function scenePackageWithTwoPlacements() {
  return scenePackageWithTwoPlacementsConfig();
}

export function scenePackageWithTwoPlacementsConfig(input?: {
  placementOverrides?: Partial<Record<string, { transform?: Partial<ChapterSceneAssemblyManifest["placements"][number]["transform"]> }>>;
}) {
  const placementOverrides = input?.placementOverrides ?? {};
  return studioScenePackageFixture({
    chapter_assets: [
      sceneAsset("chapter_asset_bowl", "Breakfast bowl", "bowl.png", { linkedTargetObjectId: "target_object_bowl" }),
      sceneAsset("chapter_asset_cloth", "Cleanup cloth", "cloth.png", { linkedTargetObjectId: "target_object_cloth" }),
    ],
    assembly: {
      ...emptyAssemblyManifest(),
      placements: [
        {
          id: "placement_bowl",
          asset_id: "chapter_asset_bowl",
          display_name: "Breakfast bowl",
          runtime_role: "target",
          transform: {
            cx: 0.42,
            cy: 0.58,
            w: 0.18,
            h: 0.18,
            rotation_deg: 0,
            ...(placementOverrides.placement_bowl?.transform ?? {}),
          },
          group_id: null,
          requires_placed: [],
        },
        {
          id: "placement_cloth",
          asset_id: "chapter_asset_cloth",
          display_name: "Cleanup cloth",
          runtime_role: "target",
          transform: {
            cx: 0.62,
            cy: 0.54,
            w: 0.14,
            h: 0.14,
            rotation_deg: 0,
            ...(placementOverrides.placement_cloth?.transform ?? {}),
          },
          group_id: null,
          requires_placed: [],
        },
      ],
      layer_order: ["placement_bowl", "placement_cloth"],
    },
  });
}

export async function advanceAutosaveTime(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

export async function flushAsyncScenePackage() {
  await act(async () => {
    await Promise.resolve();
  });
}

export async function advanceAutosaveCycle() {
  await advanceAutosaveTime(ASSEMBLY_AUTOSAVE_DEBOUNCE_MS);
  await flushAsyncScenePackage();
}

export function scenePackageWithGroupedPlacements() {
  const scenePackage = scenePackageWithTwoPlacements();
  return {
    ...scenePackage,
    assembly: {
      ...scenePackage.assembly,
      placements: scenePackage.assembly.placements.map((placement) => ({
        ...placement,
        group_id: "group_1",
      })),
      groups: [{
        id: "group_1",
        display_name: "Breakfast props",
        placement_ids: ["placement_bowl", "placement_cloth"],
      }],
    },
  };
}

export function scenePackageWithDependentPlacements() {
  const scenePackage = scenePackageWithTwoPlacements();
  return {
    ...scenePackage,
    assembly: {
      ...scenePackage.assembly,
      placements: scenePackage.assembly.placements.map((placement) => (
        placement.id === "placement_cloth"
          ? { ...placement, requires_placed: ["placement_bowl"] }
          : placement
      )),
    },
  };
}

export function scenePackageWithReplacementCandidate() {
  return {
    ...scenePackageWithTwoPlacements(),
    empty_scene_images: [
      scenePackageWithTwoPlacements().empty_scene_images[0],
      {
        ...scenePackageWithTwoPlacements().empty_scene_images[0],
        id: "empty_scene_002",
        original_filename: "empty-scene-wide.png",
        storage_path: "scene_package/empty_scene_002.png",
        width: 1536,
        height: 1024,
      },
    ],
  };
}
