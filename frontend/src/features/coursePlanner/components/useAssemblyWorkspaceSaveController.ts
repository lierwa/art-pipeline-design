import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback } from "react";

import {
  createAssemblyDraft,
  type AssemblyManifestDraft,
} from "../assembly/assemblyManifestDraft";
import { manifestKeyOf } from "../assembly/assemblyWorkspaceState";
import type { AsyncOperationState, ChapterScenePackage } from "../types";
import type {
  AssemblyWorkspaceLockFinalState,
  AssemblyWorkspaceRetryKind,
  AssemblyWorkspaceSaveState,
} from "./useAssemblyWorkspaceController";
import { DEFAULT_ASSEMBLY_SAVE_ERROR } from "./assemblyWorkspaceConstants";

type SaveControllerInput = {
  currentSaveManifestKeyRef: MutableRefObject<string>;
  getSelectionSnapshot: () => AssemblySelectionSnapshot;
  inFlightManifestKeyRef: MutableRefObject<string | null>;
  lastAcceptedSaveManifestKeyRef: MutableRefObject<string | null>;
  latestScenePackageRef: MutableRefObject<ChapterScenePackage>;
  onSaveAssembly: (manifest: ChapterScenePackage["assembly"]) => Promise<ChapterScenePackage | null>;
  retryManifestKindRef: MutableRefObject<AssemblyWorkspaceRetryKind | null>;
  retryManifestRef: MutableRefObject<ChapterScenePackage["assembly"] | null>;
  saveRequestRef: MutableRefObject<Promise<ChapterScenePackage | null> | null>;
  saveStatus?: AsyncOperationState;
  setAlignmentRiskPlacementIds: (value: string[]) => void;
  setDraft: Dispatch<SetStateAction<AssemblyManifestDraft>>;
  setIntegratedSceneManifestKey: (value: string) => void;
  setRequiresExplicitSelectionSave: (value: boolean) => void;
  setSaveError: Dispatch<SetStateAction<string | null>>;
  setSaveRevision: Dispatch<SetStateAction<number>>;
  setSaveState: (value: AssemblyWorkspaceSaveState) => void;
  setSelectedLayerNodeIds: (value: string[]) => void;
  setSelectedPlacementId: (value: string | null) => void;
  timerRef: MutableRefObject<number | null>;
};

export type AssemblySelectionSnapshot = {
  selectedPlacementId: string | null;
  selectedLayerNodeIds: string[];
};

export function usePerformAssemblySave(input: SaveControllerInput) {
  const {
    currentSaveManifestKeyRef,
    getSelectionSnapshot,
    inFlightManifestKeyRef,
    lastAcceptedSaveManifestKeyRef,
    latestScenePackageRef,
    onSaveAssembly,
    retryManifestKindRef,
    retryManifestRef,
    saveRequestRef,
    saveStatus,
    setAlignmentRiskPlacementIds,
    setDraft,
    setIntegratedSceneManifestKey,
    setRequiresExplicitSelectionSave,
    setSaveError,
    setSaveRevision,
    setSaveState,
    setSelectedLayerNodeIds,
    setSelectedPlacementId,
    timerRef,
  } = input;
  return useCallback(async (manifest: ChapterScenePackage["assembly"]) => {
    const saveInput = {
      currentSaveManifestKeyRef,
      getSelectionSnapshot,
      inFlightManifestKeyRef,
      lastAcceptedSaveManifestKeyRef,
      latestScenePackageRef,
      onSaveAssembly,
      retryManifestKindRef,
      retryManifestRef,
      saveRequestRef,
      saveStatus,
      setAlignmentRiskPlacementIds,
      setDraft,
      setIntegratedSceneManifestKey,
      setRequiresExplicitSelectionSave,
      setSaveError,
      setSaveRevision,
      setSaveState,
      setSelectedLayerNodeIds,
      setSelectedPlacementId,
      timerRef,
    } satisfies SaveControllerInput;
    const existingRequest = await reuseCompatibleSaveRequest(saveInput, manifest);
    if (existingRequest !== undefined) {
      return existingRequest;
    }
    clearAutosaveTimer(timerRef);
    const saveRequest = runAssemblySave(saveInput, manifest);
    saveRequestRef.current = saveRequest;
    try {
      return await saveRequest;
    } finally {
      if (saveRequestRef.current === saveRequest) {
        saveRequestRef.current = null;
        setSaveRevision((current) => current + 1);
      }
    }
  }, [
    currentSaveManifestKeyRef,
    getSelectionSnapshot,
    inFlightManifestKeyRef,
    lastAcceptedSaveManifestKeyRef,
    latestScenePackageRef,
    onSaveAssembly,
    retryManifestKindRef,
    retryManifestRef,
    saveRequestRef,
    saveStatus,
    setAlignmentRiskPlacementIds,
    setDraft,
    setIntegratedSceneManifestKey,
    setRequiresExplicitSelectionSave,
    setSaveError,
    setSaveRevision,
    setSaveState,
    setSelectedLayerNodeIds,
    setSelectedPlacementId,
    timerRef,
  ]);
}

export function useFlushForLockFinal(
  performSave: (manifest: ChapterScenePackage["assembly"]) => Promise<ChapterScenePackage | null>,
  latestLockFinalStateRef: MutableRefObject<AssemblyWorkspaceLockFinalState>,
  latestScenePackageRef: MutableRefObject<ChapterScenePackage>,
  saveRequestRef: MutableRefObject<Promise<ChapterScenePackage | null> | null>,
) {
  return useCallback(async () => {
    while (true) {
      const lockState = latestLockFinalStateRef.current;
      if (!lockState.canPersistDraft) {
        return null;
      }
      if (saveRequestRef.current) {
        await saveRequestRef.current;
        continue;
      }
      if (!lockState.hasDirtyChanges) {
        return latestScenePackageRef.current;
      }
      return await performSave(lockState.manifest);
    }
  }, [latestLockFinalStateRef, latestScenePackageRef, performSave, saveRequestRef]);
}

export function clearAutosaveTimer(timerRef: MutableRefObject<number | null>) {
  if (timerRef.current !== null) {
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}

export function initialSelectedLayerNodeIds(scenePackage: ChapterScenePackage): string[] {
  const placementId = scenePackage.assembly.placements[0]?.id;
  return placementId ? [placementId] : [];
}

export function preserveAssemblySelection(
  draft: AssemblyManifestDraft,
  selection: AssemblySelectionSnapshot,
): AssemblySelectionSnapshot {
  const placementIds = new Set(draft.placements.map((placement) => placement.id));
  const selectedLayerNodeIds = selection.selectedLayerNodeIds.filter((nodeId) => placementIds.has(nodeId));
  const selectedPlacementId = selection.selectedPlacementId && placementIds.has(selection.selectedPlacementId)
    ? selection.selectedPlacementId
    : selectedLayerNodeIds[0] ?? null;

  return {
    selectedPlacementId,
    selectedLayerNodeIds: selectedLayerNodeIds.length > 0
      ? selectedLayerNodeIds
      : selectedPlacementId ? [selectedPlacementId] : [],
  };
}

async function runAssemblySave(
  input: SaveControllerInput,
  manifest: ChapterScenePackage["assembly"],
) {
  const manifestKey = manifestKeyOf(manifest);
  input.inFlightManifestKeyRef.current = manifestKey;
  input.setSaveError(null);
  input.setSaveState("saving");
  let nextScenePackage: ChapterScenePackage | null;
  try {
    nextScenePackage = await input.onSaveAssembly(manifest);
  } catch (error) {
    markAssemblySaveFailed(input, manifest, error instanceof Error ? error.message : DEFAULT_ASSEMBLY_SAVE_ERROR);
    return null;
  }
  input.inFlightManifestKeyRef.current = null;
  if (!nextScenePackage) {
    markAssemblySaveFailed(input, manifest, input.saveStatus?.error ?? DEFAULT_ASSEMBLY_SAVE_ERROR);
    return null;
  }
  commitSuccessfulSave(input, nextScenePackage, manifestKey);
  return nextScenePackage;
}

function markAssemblySaveFailed(
  input: SaveControllerInput,
  manifest: ChapterScenePackage["assembly"],
  message: string,
) {
  input.inFlightManifestKeyRef.current = null;
  // WHY: 保存失败后必须停在显式 Retry；否则 autosave 会立刻重试同一份 manifest，
  // 把用户可见的 failed 状态冲回 saving，导致失败原因和重试入口消失。
  input.retryManifestKindRef.current = "save-failure";
  input.retryManifestRef.current = manifest;
  input.setSaveError((current) => current ?? message);
  input.setSaveState("failed");
}

function commitSuccessfulSave(
  input: SaveControllerInput,
  nextScenePackage: ChapterScenePackage,
  manifestKey: string,
) {
  const nextManifestKey = manifestKeyOf(nextScenePackage.assembly);
  const responseMatchesCurrentDraft = input.currentSaveManifestKeyRef.current === manifestKey;
  input.latestScenePackageRef.current = nextScenePackage;
  input.lastAcceptedSaveManifestKeyRef.current = nextManifestKey;
  input.retryManifestKindRef.current = null;
  input.retryManifestRef.current = null;
  input.setIntegratedSceneManifestKey(nextManifestKey);
  if (responseMatchesCurrentDraft) {
    const nextDraft = createAssemblyDraft(nextScenePackage);
    const preservedSelection = preserveAssemblySelection(nextDraft, input.getSelectionSnapshot());
    input.setRequiresExplicitSelectionSave(false);
    input.setAlignmentRiskPlacementIds([]);
    input.setDraft(nextDraft);
    input.setSelectedPlacementId(preservedSelection.selectedPlacementId);
    input.setSelectedLayerNodeIds(preservedSelection.selectedLayerNodeIds);
  }
  input.setSaveError(null);
  // WHY: 保存响应只确认它对应的 manifest 已落盘；如果作者在请求期间继续编辑，
  // 这里只更新已保存基线，不用旧服务端快照覆盖当前 draft，后续 autosave 会继续保存新草稿。
  if (responseMatchesCurrentDraft) {
    input.setSaveState("saved");
  }
}

async function reuseCompatibleSaveRequest(
  input: SaveControllerInput,
  manifest: ChapterScenePackage["assembly"],
) {
  const manifestKey = manifestKeyOf(manifest);
  if (input.saveRequestRef.current && input.inFlightManifestKeyRef.current === manifestKey) {
    return await input.saveRequestRef.current;
  }
  if (!input.saveRequestRef.current) {
    return undefined;
  }
  await input.saveRequestRef.current;
  return input.currentSaveManifestKeyRef.current !== manifestKey
    ? input.latestScenePackageRef.current
    : undefined;
}
