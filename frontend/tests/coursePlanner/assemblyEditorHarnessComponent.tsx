import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import type {
  DirectChapterAssetUploadInput,
  GeneratedChapterAssetMaterializeInput,
} from "../../src/features/coursePlanner/api";
import { AssemblyWorkspacePanel } from "../../src/features/coursePlanner/components/AssemblyWorkspacePanel";
import type { AssemblyWorkspaceLockFinalState } from "../../src/features/coursePlanner/components/AssemblyWorkspacePanel";
import type {
  AsyncStatusMap,
  ChapterSceneAssemblyManifest,
  ChapterScenePackage,
  GeneratedChapterAsset,
} from "../../src/features/coursePlanner/types";
import {
  sceneAsset,
  snapshot,
  studioChapterFixture,
} from "./chapterWorkspaceFixtures";

export type AssemblyEditorHarnessProps = {
  generatedAssets?: GeneratedChapterAsset[];
  initialScenePackage: ChapterScenePackage;
  onDirectAssetUploadInput?: (input: DirectChapterAssetUploadInput) => void;
  onGeneratedAssetMaterializeInput?: (input: GeneratedChapterAssetMaterializeInput) => void;
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
  getLockFinalState: () => AssemblyWorkspaceLockFinalState | null;
  getScenePackage: () => ChapterScenePackage;
  lockFinal: (file?: File) => Promise<ChapterScenePackage | null>;
  pushScenePackage: (nextScenePackage: ChapterScenePackage) => void;
  selectEmptySceneImage: (imageId: string) => Promise<ChapterScenePackage | null>;
};

type ScenePackageSetter = (nextScenePackage: ChapterScenePackage) => void;
const EMPTY_GENERATED_ASSETS: GeneratedChapterAsset[] = [];

export function AssemblyEditorHarness(props: AssemblyEditorHarnessProps) {
  const controller = useAssemblyEditorHarnessController(props);
  return (
    <AssemblyWorkspacePanel
      onDeleteChapterAsset={controller.handleDeleteChapterAsset}
      onDuplicateChapterAsset={controller.handleDuplicateChapterAsset}
      onListGeneratedAssets={controller.handleListGeneratedAssets}
      onLockFinalStateChange={controller.handleLockFinalStateChange}
      onMaterializeGeneratedAsset={controller.handleMaterializeGeneratedAsset}
      onRegisterLockFinalFlush={controller.handleRegisterLockFinalFlush}
      onSaveAssembly={controller.handleSaveAssembly}
      onUploadDirectAsset={controller.handleUploadDirectAsset}
      saveStatus={controller.asyncStatus[`scenePackage:assemblySave:${controller.chapterId}`]}
      scenePackage={controller.scenePackage}
    />
  );
}

function useAssemblyEditorHarnessController({
  initialScenePackage,
  generatedAssets = EMPTY_GENERATED_ASSETS,
  onDirectAssetUploadInput,
  onGeneratedAssetMaterializeInput,
  onHarnessReady,
  lockFinalBehavior,
  onSaveAssemblyManifest,
  saveAssemblyBehavior,
  selectEmptySceneImageBehavior,
}: AssemblyEditorHarnessProps) {
  const chapter = useMemo(() => studioChapterFixture(), []);
  const [scenePackage, setScenePackage] = useState(initialScenePackage);
  const [asyncStatus, setAsyncStatus] = useState<AsyncStatusMap>({});
  const lockFinalFlushRef = useRef<(() => Promise<ChapterScenePackage | null>) | null>(null);
  const lockFinalStateRef = useRef<AssemblyWorkspaceLockFinalState | null>(null);
  const scenePackageRef = useRef(scenePackage);

  useEffect(() => {
    scenePackageRef.current = scenePackage;
  }, [scenePackage]);

  const setNextScenePackage = useCallback((nextScenePackage: ChapterScenePackage) => {
    scenePackageRef.current = nextScenePackage;
    setScenePackage(nextScenePackage);
  }, []);

  const handleSaveAssembly = useHarnessSaveAssembly({
    chapterId: chapter.id,
    onSaveAssemblyManifest,
    saveAssemblyBehavior,
    scenePackageRef,
    setAsyncStatus,
    setNextScenePackage,
  });
  const assetHandlers = useHarnessAssetActions({
    generatedAssets,
    onDirectAssetUploadInput,
    onGeneratedAssetMaterializeInput,
    scenePackageRef,
    setNextScenePackage,
  });
  const finalHandlers = useHarnessFinalActions({
    lockFinalBehavior,
    lockFinalFlushRef,
    scenePackageRef,
    setNextScenePackage,
    selectEmptySceneImageBehavior,
  });

  useEffect(() => {
    onHarnessReady?.({
      getLockFinalState: () => lockFinalStateRef.current,
      getScenePackage: () => scenePackageRef.current,
      lockFinal: finalHandlers.handleLockFinal,
      pushScenePackage: setNextScenePackage,
      selectEmptySceneImage: finalHandlers.handleSelectEmptySceneImage,
    });
  }, [finalHandlers.handleLockFinal, finalHandlers.handleSelectEmptySceneImage, onHarnessReady, setNextScenePackage]);

  return {
    asyncStatus,
    chapterId: chapter.id,
    scenePackage,
    ...assetHandlers,
    ...finalHandlers,
    handleSaveAssembly,
    handleLockFinalStateChange: (state: AssemblyWorkspaceLockFinalState) => {
      lockFinalStateRef.current = state;
    },
    handleRegisterLockFinalFlush: (flush: () => Promise<ChapterScenePackage | null>) => {
      lockFinalFlushRef.current = flush;
    },
  };
}

function useHarnessSaveAssembly(input: {
  chapterId: string;
  onSaveAssemblyManifest?: AssemblyEditorHarnessProps["onSaveAssemblyManifest"];
  saveAssemblyBehavior?: AssemblyEditorHarnessProps["saveAssemblyBehavior"];
  scenePackageRef: MutableRefObject<ChapterScenePackage>;
  setAsyncStatus: Dispatch<SetStateAction<AsyncStatusMap>>;
  setNextScenePackage: ScenePackageSetter;
}) {
  const saveAttemptRef = useRef(0);
  return useCallback(async (manifest: ChapterSceneAssemblyManifest) => {
    input.onSaveAssemblyManifest?.(manifest);
    input.setAsyncStatus({ [`scenePackage:assemblySave:${input.chapterId}`]: { status: "pending" } });
    saveAttemptRef.current += 1;
    try {
      await Promise.resolve();
      const currentScenePackage = input.scenePackageRef.current;
      const nextScenePackage = input.saveAssemblyBehavior
        ? await input.saveAssemblyBehavior(manifest, currentScenePackage, saveAttemptRef.current)
        : { ...currentScenePackage, assembly: { ...manifest, updated_at: "2026-07-03T12:30:00Z" } };
      if (!nextScenePackage) {
        input.setAsyncStatus({ [`scenePackage:assemblySave:${input.chapterId}`]: { status: "failed", error: "Assembly save returned no package." } });
        return null;
      }
      input.setNextScenePackage(nextScenePackage);
      input.setAsyncStatus({ [`scenePackage:assemblySave:${input.chapterId}`]: { status: "succeeded" } });
      return nextScenePackage;
    } catch (error) {
      input.setAsyncStatus({
        [`scenePackage:assemblySave:${input.chapterId}`]: {
          status: "failed",
          error: error instanceof Error ? error.message : "Assembly save failed.",
        },
      });
      return null;
    }
  }, [input]);
}

function useHarnessAssetActions(input: {
  generatedAssets: GeneratedChapterAsset[];
  onDirectAssetUploadInput?: AssemblyEditorHarnessProps["onDirectAssetUploadInput"];
  onGeneratedAssetMaterializeInput?: AssemblyEditorHarnessProps["onGeneratedAssetMaterializeInput"];
  scenePackageRef: MutableRefObject<ChapterScenePackage>;
  setNextScenePackage: ScenePackageSetter;
}) {
  const [generatedAssets, setGeneratedAssets] = useState(input.generatedAssets);

  useEffect(() => {
    setGeneratedAssets(input.generatedAssets);
  }, [input.generatedAssets]);

  const handleListGeneratedAssets = useCallback(async () => generatedAssets, [generatedAssets]);

  const handleMaterializeGeneratedAsset = useCallback(async (materializeInput: GeneratedChapterAssetMaterializeInput) => {
    input.onGeneratedAssetMaterializeInput?.(materializeInput);
    const currentScenePackage = input.scenePackageRef.current;
    const generatedAsset = generatedAssets.find((asset) => (
      asset.complete_scene_image_id === materializeInput.completeSceneImageId
      && asset.pipeline_run_id === materializeInput.pipelineRunId
      && asset.run_asset_id === materializeInput.runAssetId
    ));
    if (!generatedAsset) {
      return null;
    }
    const assetId = `chapter_asset_generated_${String(currentScenePackage.chapter_assets.length + 1).padStart(3, "0")}`;
    const chapterAsset = {
      ...sceneAsset(assetId, generatedAsset.display_name, `${generatedAsset.run_asset_id}.png`),
      lineage: {
        source_kind: "generated_asset" as const,
        complete_scene_image_id: generatedAsset.complete_scene_image_id,
        pipeline_run_id: generatedAsset.pipeline_run_id,
        run_asset_id: generatedAsset.run_asset_id,
      },
    };
    const nextScenePackage = {
      ...currentScenePackage,
      chapter_assets: [...currentScenePackage.chapter_assets, chapterAsset],
    };
    setGeneratedAssets((current) => current.map((asset) => (
      asset === generatedAsset ? { ...asset, state: "added", chapter_asset_id: chapterAsset.id } : asset
    )));
    input.setNextScenePackage(nextScenePackage);
    return { chapterAsset, scenePackage: nextScenePackage };
  }, [generatedAssets, input]);

  const handleUploadDirectAsset = useCallback(async (file: File, directInput: DirectChapterAssetUploadInput) => {
    input.onDirectAssetUploadInput?.(directInput);
    const currentScenePackage = input.scenePackageRef.current;
    const assetId = `chapter_asset_uploaded_${String(currentScenePackage.chapter_assets.length + 1).padStart(3, "0")}`;
    const nextScenePackage = {
      ...currentScenePackage,
      chapter_assets: [
        ...currentScenePackage.chapter_assets,
        sceneAsset(assetId, file.name.replace(/\.[^.]+$/, ""), file.name, {
          linkedTargetObjectId: directInput.linkedTargetObjectId ?? null,
        }),
      ],
    };
    input.setNextScenePackage(nextScenePackage);
    return nextScenePackage;
  }, [input]);

  const handleDuplicateChapterAsset = useCallback(async (assetId: string) => {
    const currentScenePackage = input.scenePackageRef.current;
    const sourceAsset = currentScenePackage.chapter_assets.find((asset) => asset.id === assetId);
    if (!sourceAsset) {
      return null;
    }
    const duplicateId = `${assetId}_copy_${String(currentScenePackage.chapter_assets.length + 1).padStart(2, "0")}`;
    const nextScenePackage = {
      ...currentScenePackage,
      chapter_assets: [...currentScenePackage.chapter_assets, { ...sourceAsset, id: duplicateId, created_at: "2026-07-03T12:10:00Z" }],
    };
    input.setNextScenePackage(nextScenePackage);
    return nextScenePackage;
  }, [input]);

  const handleDeleteChapterAsset = useCallback(async (assetId: string) => {
    const nextScenePackage = deleteChapterAssetFromHarness(input.scenePackageRef.current, assetId);
    input.setNextScenePackage(nextScenePackage);
    return nextScenePackage;
  }, [input]);

  return {
    handleDeleteChapterAsset,
    handleDuplicateChapterAsset,
    handleListGeneratedAssets,
    handleMaterializeGeneratedAsset,
    handleUploadDirectAsset,
  };
}

function useHarnessFinalActions(input: {
  lockFinalBehavior?: AssemblyEditorHarnessProps["lockFinalBehavior"];
  lockFinalFlushRef: MutableRefObject<(() => Promise<ChapterScenePackage | null>) | null>;
  scenePackageRef: MutableRefObject<ChapterScenePackage>;
  selectEmptySceneImageBehavior?: AssemblyEditorHarnessProps["selectEmptySceneImageBehavior"];
  setNextScenePackage: ScenePackageSetter;
}) {
  const lockAttemptRef = useRef(0);
  const handleSelectEmptySceneImage = useCallback(async (imageId: string) => {
    await Promise.resolve();
    const currentScenePackage = input.scenePackageRef.current;
    const nextScenePackage = input.selectEmptySceneImageBehavior
      ? await input.selectEmptySceneImageBehavior(imageId, currentScenePackage)
      : { ...currentScenePackage, current_empty_scene_image_id: imageId };
    if (!nextScenePackage) {
      return null;
    }
    input.setNextScenePackage(nextScenePackage);
    return nextScenePackage;
  }, [input]);

  const handleLockFinal = useCallback(async (file: File = new File(["png"], "chapter-scene-final.png", { type: "image/png" })) => {
    lockAttemptRef.current += 1;
    const currentScenePackage = input.lockFinalFlushRef.current
      ? await input.lockFinalFlushRef.current()
      : input.scenePackageRef.current;
    if (!currentScenePackage) {
      return null;
    }
    const nextScenePackage = input.lockFinalBehavior
      ? await input.lockFinalBehavior(file, currentScenePackage, lockAttemptRef.current)
      : { ...currentScenePackage, final_scene: buildLockedFinalScene(currentScenePackage, file.name) };
    if (!nextScenePackage) {
      return null;
    }
    input.setNextScenePackage(nextScenePackage);
    return nextScenePackage;
  }, [input]);

  return { handleLockFinal, handleSelectEmptySceneImage };
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
    prompt_snapshot: current.current_prompt_package?.complete_scene_prompt ?? "",
    reference_snapshot: snapshot(
      current.complete_images.at(-1)?.reference_snapshot.reference_image_ids ?? [],
      current.current_empty_scene_image_id,
    ),
    created_at: "2026-07-04T08:11:00Z",
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
