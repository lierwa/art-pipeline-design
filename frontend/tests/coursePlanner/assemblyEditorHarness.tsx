import { useEffect, useMemo, useRef, useState } from "react";
import { act } from "@testing-library/react";
import { vi } from "vitest";

import type { DirectChapterAssetUploadInput } from "../../src/features/coursePlanner/api";
import { buildTldrawAssemblySnapshot } from "../../src/features/coursePlanner/assembly/tldrawAssemblyAdapter";
import { ChapterSceneStudio } from "../../src/features/coursePlanner/components/ChapterSceneStudio";
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

export const ASSEMBLY_AUTOSAVE_DEBOUNCE_MS = 800;

export type AssemblyEditorHarnessProps = {
  initialScenePackage: ChapterScenePackage;
  onDirectAssetUploadInput?: (input: DirectChapterAssetUploadInput) => void;
  onHarnessReady?: (controls: AssemblyEditorHarnessControls) => void;
  lockFinalBehavior?: (
    file: File,
    currentScenePackage: ChapterScenePackage,
    attempt: number,
  ) => Promise<ChapterScenePackage | null>;
  onSaveAssemblyManifest?: (manifest: ChapterSceneAssemblyManifest) => void;
  saveAssemblyBehavior?: (
    manifest: ChapterSceneAssemblyManifest,
    currentScenePackage: ChapterScenePackage,
    attempt: number,
  ) => Promise<ChapterScenePackage | null>;
  selectEmptySceneImageBehavior?: (
    imageId: string,
    currentScenePackage: ChapterScenePackage,
  ) => Promise<ChapterScenePackage | null>;
};

export type AssemblyEditorHarnessControls = {
  pushScenePackage: (nextScenePackage: ChapterScenePackage) => void;
};

export function AssemblyEditorHarness({
  initialScenePackage,
  onDirectAssetUploadInput,
  onHarnessReady,
  lockFinalBehavior,
  onSaveAssemblyManifest,
  saveAssemblyBehavior,
  selectEmptySceneImageBehavior,
}: AssemblyEditorHarnessProps) {
  const chapter = useMemo(() => studioChapterFixture(), []);
  const scenePack = useMemo(() => studioScenePackFixture(), []);
  const characterIps = useMemo(() => [characterIpFixture()], []);
  const referenceImages = useMemo(() => [referenceImageFixture()], []);
  const [scenePackage, setScenePackage] = useState(initialScenePackage);
  const [asyncStatus, setAsyncStatus] = useState<AsyncStatusMap>({});
  const saveAttemptRef = useRef(0);
  const lockAttemptRef = useRef(0);

  async function handleSaveAssembly(manifest: ChapterSceneAssemblyManifest) {
    onSaveAssemblyManifest?.(manifest);
    setAsyncStatus({
      [`scenePackage:assemblySave:${chapter.id}`]: { status: "pending" },
    });
    saveAttemptRef.current += 1;
    try {
      await Promise.resolve();
      const nextScenePackage = saveAssemblyBehavior
        ? await saveAssemblyBehavior(manifest, scenePackage, saveAttemptRef.current)
        : {
            ...scenePackage,
            assembly: {
              ...manifest,
              updated_at: "2026-07-03T12:30:00Z",
            },
          };
      if (!nextScenePackage) {
        setAsyncStatus({
          [`scenePackage:assemblySave:${chapter.id}`]: { status: "failed", error: "Assembly save returned no package." },
        });
        return null;
      }
      setScenePackage(nextScenePackage);
      setAsyncStatus({
        [`scenePackage:assemblySave:${chapter.id}`]: { status: "succeeded" },
      });
      return nextScenePackage;
    } catch (error) {
      setAsyncStatus({
        [`scenePackage:assemblySave:${chapter.id}`]: {
          status: "failed",
          error: error instanceof Error ? error.message : "Assembly save failed.",
        },
      });
      return null;
    }
  }

  async function handleUploadDirectAsset(file: File, input: DirectChapterAssetUploadInput) {
    onDirectAssetUploadInput?.(input);
    const assetId = `chapter_asset_uploaded_${String(scenePackage.chapter_assets.length + 1).padStart(3, "0")}`;
    const nextScenePackage = {
      ...scenePackage,
      chapter_assets: [
        ...scenePackage.chapter_assets,
        sceneAsset(assetId, file.name.replace(/\.[^.]+$/, ""), file.name, {
          linkedTargetObjectId: input.linkedTargetObjectId ?? null,
        }),
      ],
    };
    setScenePackage(nextScenePackage);
    return nextScenePackage;
  }

  async function handleDuplicateChapterAsset(assetId: string) {
    const sourceAsset = scenePackage.chapter_assets.find((asset) => asset.id === assetId);
    if (!sourceAsset) {
      return null;
    }
    const duplicateId = `${assetId}_copy_${String(scenePackage.chapter_assets.length + 1).padStart(2, "0")}`;
    const nextScenePackage = {
      ...scenePackage,
      chapter_assets: [
        ...scenePackage.chapter_assets,
        {
          ...sourceAsset,
          id: duplicateId,
          created_at: "2026-07-03T12:10:00Z",
        },
      ],
    };
    setScenePackage(nextScenePackage);
    return nextScenePackage;
  }

  async function handleDeleteChapterAsset(assetId: string) {
    const nextScenePackage = deleteChapterAssetFromHarness(scenePackage, assetId);
    setScenePackage(nextScenePackage);
    return nextScenePackage;
  }

  async function handleDeleteCompleteSceneImage(completeImageId: string) {
    const nextScenePackage = {
      ...scenePackage,
      complete_images: scenePackage.complete_images.map((image) => (
        image.id === completeImageId
          ? { ...image, status: "deleted" as const }
          : image
      )),
    };
    setScenePackage(nextScenePackage);
    return nextScenePackage;
  }

  async function handleSelectEmptySceneImage(imageId: string) {
    await Promise.resolve();
    const nextScenePackage = selectEmptySceneImageBehavior
      ? await selectEmptySceneImageBehavior(imageId, scenePackage)
      : {
          ...scenePackage,
          current_empty_scene_image_id: imageId,
        };
    if (!nextScenePackage) {
      return null;
    }
    setScenePackage(nextScenePackage);
    return nextScenePackage;
  }

  async function handleLockFinal(file: File) {
    lockAttemptRef.current += 1;
    await Promise.resolve();
    const nextScenePackage = lockFinalBehavior
      ? await lockFinalBehavior(file, scenePackage, lockAttemptRef.current)
      : {
          ...scenePackage,
          final_scene: buildLockedFinalScene(scenePackage, file.name),
        };
    if (!nextScenePackage) {
      return null;
    }
    setScenePackage(nextScenePackage);
    return nextScenePackage;
  }

  useEffect(() => {
    onHarnessReady?.({
      pushScenePackage: setScenePackage,
    });
  }, [onHarnessReady]);

  return (
    <ChapterSceneStudio
      asyncStatus={asyncStatus}
      chapter={chapter}
      characterIps={characterIps}
      referenceImages={referenceImages}
      onAssignCharacterIp={async () => null}
      onDeleteChapterAsset={handleDeleteChapterAsset}
      onDeleteCompleteSceneImage={handleDeleteCompleteSceneImage}
      onDuplicateChapterAsset={handleDuplicateChapterAsset}
      onImportCompleteImage={async () => null}
      onLockFinal={handleLockFinal}
      onSaveAssembly={handleSaveAssembly}
      onSelectEmptySceneImage={handleSelectEmptySceneImage}
      onSelectReferenceImage={async () => null}
      onUpdatePrompt={async () => null}
      onUploadCompleteSceneImage={async () => null}
      onUploadDirectAsset={handleUploadDirectAsset}
      onUploadEmptySceneImage={async () => null}
      onUploadReferenceImage={async () => null}
      scenePack={scenePack}
      scenePackage={scenePackage}
    />
  );
}

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

export function buildLockedFinalScene(
  current: ChapterScenePackage,
  originalFilename = "chapter-scene-final.png",
) {
  return {
    id: "final_scene_001",
    original_filename: originalFilename,
    storage_path: "scene_package/final_scene_001.png",
    media_type: "image/png" as const,
    width: 1024,
    height: 1024,
    empty_scene_image_id: current.current_empty_scene_image_id ?? "empty_scene_001",
    assembly_snapshot: current.assembly,
    prompt_snapshot: current.prompt.prompt_text,
    reference_snapshot: snapshot(
      current.reference_selections.map((selection) => selection.reference_image_id),
      current.current_empty_scene_image_id,
    ),
    created_at: "2026-07-04T08:11:00Z",
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

export function buildSnapshot(scenePackage: ChapterScenePackage) {
  return buildTldrawAssemblySnapshot({
    draft: scenePackage.assembly,
    scenePackage,
  });
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

function deleteChapterAssetFromHarness(
  current: ChapterScenePackage,
  assetId: string,
): ChapterScenePackage {
  const removedPlacementIds = new Set(
    current.assembly.placements
      .filter((placement) => placement.asset_id === assetId)
      .map((placement) => placement.id),
  );
  const remainingPlacements = current.assembly.placements
    .filter((placement) => placement.asset_id !== assetId)
    .map((placement) => ({
      ...placement,
      requires_placed: placement.requires_placed.filter((requiredId) => !removedPlacementIds.has(requiredId)),
    }));
  const remainingGroups = current.assembly.groups
    .map((group) => ({
      ...group,
      placement_ids: group.placement_ids.filter((placementId) => !removedPlacementIds.has(placementId)),
    }))
    .filter((group) => group.placement_ids.length >= 2);
  const validGroupIds = new Set(remainingGroups.map((group) => group.id));

  return {
    ...current,
    chapter_assets: current.chapter_assets.filter((asset) => asset.id !== assetId),
    assembly: {
      ...current.assembly,
      placements: remainingPlacements.map((placement) => ({
        ...placement,
        group_id: placement.group_id && validGroupIds.has(placement.group_id) ? placement.group_id : null,
      })),
      groups: remainingGroups,
      layer_order: current.assembly.layer_order.filter((placementId) => !removedPlacementIds.has(placementId)),
    },
  };
}
