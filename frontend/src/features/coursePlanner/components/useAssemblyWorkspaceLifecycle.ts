import { type Dispatch, type MutableRefObject, type SetStateAction, useEffect, useRef } from "react";

import {
  createAssemblyDraft,
  projectManifestForSave,
  type AssemblyManifestDraft,
} from "../assembly/assemblyManifestDraft";
import { classifyIncomingAssemblyManifest } from "../assembly/assemblyAutosavePolicy";
import type { AssemblyReadiness } from "../assembly/assemblyReadiness";
import {
  manifestKeyOf,
  sameEmptySceneSize,
} from "../assembly/assemblyWorkspaceState";
import type { AsyncOperationState, ChapterScenePackage } from "../types";
import {
  ASSEMBLY_AUTOSAVE_DEBOUNCE_MS,
  DEFAULT_ASSEMBLY_CONFLICT_ERROR,
  DEFAULT_ASSEMBLY_SAVE_ERROR,
} from "./assemblyWorkspaceConstants";
import type {
  AssemblyWorkspaceLockFinalState,
  AssemblyWorkspaceRetryKind,
  AssemblyWorkspaceSaveState,
} from "./useAssemblyWorkspaceController";
import {
  clearAutosaveTimer,
  preserveAssemblySelection,
  type AssemblySelectionSnapshot,
} from "./useAssemblyWorkspaceSaveController";

type RegisterLockFinalFlush = (flush: (() => Promise<ChapterScenePackage | null>) | null) => void;

type SceneManifestIntegrationInput = {
  alignmentRiskPlacementIds: string[];
  hasDirtyChanges: boolean;
  inFlightManifestKeyRef: MutableRefObject<string | null>;
  integratedSceneManifestKey: string;
  lastAcceptedSaveManifestKeyRef: MutableRefObject<string | null>;
  lastObservedSceneManifestKeyRef: MutableRefObject<string>;
  retryManifestKindRef: MutableRefObject<AssemblyWorkspaceRetryKind | null>;
  retryManifestRef: MutableRefObject<ChapterScenePackage["assembly"] | null>;
  saveManifest: ChapterScenePackage["assembly"];
  sceneManifestKey: string;
  scenePackage: ChapterScenePackage;
  getSelectionSnapshot: () => AssemblySelectionSnapshot;
  setAlignmentRiskPlacementIds: (value: string[]) => void;
  setDraft: Dispatch<SetStateAction<AssemblyManifestDraft>>;
  setIntegratedSceneManifestKey: (value: string) => void;
  setRequiresExplicitSelectionSave: (value: boolean) => void;
  setSaveError: Dispatch<SetStateAction<string | null>>;
  setSaveState: (value: AssemblyWorkspaceSaveState) => void;
  setSelectedLayerNodeIds: (value: string[]) => void;
  setSelectedPlacementId: (value: string | null) => void;
};

type AutosaveInput = {
  canPersistDraft: boolean;
  hasDirtyChanges: boolean;
  performSave: (manifest: ChapterScenePackage["assembly"]) => Promise<ChapterScenePackage | null>;
  requiresExplicitSelectionSave: boolean;
  retryManifestRef: MutableRefObject<ChapterScenePackage["assembly"] | null>;
  saveManifest: ChapterScenePackage["assembly"];
  saveManifestKey: string;
  saveRequestRef: MutableRefObject<Promise<ChapterScenePackage | null> | null>;
  saveRevision: number;
  saveState: AssemblyWorkspaceSaveState;
  setSaveState: (value: AssemblyWorkspaceSaveState) => void;
  timerRef: MutableRefObject<number | null>;
};

export function usePublishLockFinalState(input: {
  canPersistDraft: boolean;
  hasDirtyChanges: boolean;
  latestLockFinalStateRef: MutableRefObject<AssemblyWorkspaceLockFinalState>;
  onLockFinalStateChange?: (state: AssemblyWorkspaceLockFinalState) => void;
  readiness: AssemblyReadiness;
  saveError: string | null;
  saveManifest: ChapterScenePackage["assembly"];
  saveState: AssemblyWorkspaceSaveState;
}) {
  useEffect(() => {
    const nextState = {
      manifest: input.saveManifest,
      hasDirtyChanges: input.hasDirtyChanges,
      canPersistDraft: input.canPersistDraft,
      readiness: input.readiness,
      saveError: input.saveError,
      saveState: input.saveState,
    } satisfies AssemblyWorkspaceLockFinalState;
    input.latestLockFinalStateRef.current = nextState;
    input.onLockFinalStateChange?.(nextState);
  }, [input]);
}

export function useRegisterLockFinalFlush(
  onRegisterLockFinalFlush: RegisterLockFinalFlush | undefined,
  flushCurrentManifestForLockFinal: () => Promise<ChapterScenePackage | null>,
) {
  useEffect(() => {
    onRegisterLockFinalFlush?.(() => flushCurrentManifestForLockFinal());
    return () => {
      onRegisterLockFinalFlush?.(null);
    };
  }, [flushCurrentManifestForLockFinal, onRegisterLockFinalFlush]);
}

export function useSceneManifestIntegration(input: SceneManifestIntegrationInput) {
  useEffect(() => {
    const sourceDraft = createAssemblyDraft(input.scenePackage);
    const decision = classifyIncomingAssemblyManifest({
      baselineManifestKey: input.integratedSceneManifestKey,
      incomingManifest: input.scenePackage.assembly,
      inFlightManifestKey: input.inFlightManifestKeyRef.current,
      lastAcceptedSaveManifestKey: input.lastAcceptedSaveManifestKeyRef.current,
      lastObservedManifestKey: input.lastObservedSceneManifestKeyRef.current,
      localPendingManifest: input.saveManifest,
    });
    integrateNewServerManifest(input, sourceDraft, decision);
  }, [input]);
}

export function useSaveStatusSync(input: {
  hasDirtyChanges: boolean;
  inFlightManifestKeyRef: MutableRefObject<string | null>;
  saveStatus?: AsyncOperationState;
  setSaveError: Dispatch<SetStateAction<string | null>>;
  setSaveState: (value: AssemblyWorkspaceSaveState) => void;
}) {
  useEffect(() => {
    if (input.saveStatus?.status === "pending") {
      input.setSaveState("saving");
      input.setSaveError(null);
      return;
    }
    if (input.saveStatus?.status === "failed") {
      input.setSaveError(input.saveStatus.error ?? DEFAULT_ASSEMBLY_SAVE_ERROR);
      input.setSaveState("failed");
      return;
    }
    if (!input.hasDirtyChanges && input.inFlightManifestKeyRef.current === null) {
      input.setSaveError(null);
      input.setSaveState("saved");
    }
  }, [input]);
}

export function useAutosave(input: AutosaveInput) {
  const performSaveRef = useRef(input.performSave);
  useEffect(() => {
    performSaveRef.current = input.performSave;
  }, [input.performSave]);

  useEffect(() => {
    clearAutosaveTimer(input.timerRef);
    if (!shouldAutosave(input)) {
      return;
    }
    input.setSaveState("saving");
    input.timerRef.current = window.setTimeout(() => {
      input.timerRef.current = null;
      void performSaveRef.current(input.saveManifest);
    }, ASSEMBLY_AUTOSAVE_DEBOUNCE_MS);
    return () => clearAutosaveTimer(input.timerRef);
  }, [
    input.canPersistDraft,
    input.hasDirtyChanges,
    input.requiresExplicitSelectionSave,
    input.retryManifestRef,
    input.saveManifest,
    input.saveManifestKey,
    input.saveRequestRef,
    input.saveRevision,
    input.saveState,
    input.setSaveState,
    input.timerRef,
  ]);
}

export function useAutosaveTimerCleanup(timerRef: MutableRefObject<number | null>) {
  useEffect(() => () => clearAutosaveTimer(timerRef), [timerRef]);
}

function integrateNewServerManifest(
  input: SceneManifestIntegrationInput,
  sourceDraft: AssemblyManifestDraft,
  decision: ReturnType<typeof classifyIncomingAssemblyManifest>,
) {
  if (decision === "catalog-only-refresh") {
    integrateCatalogOnlyScenePackage(input, sourceDraft);
    return;
  }
  input.lastObservedSceneManifestKeyRef.current = input.sceneManifestKey;
  if (decision === "integrate-clean-server" || decision === "integrate-own-save-echo") {
    const preservedSelection = preserveAssemblySelection(sourceDraft, input.getSelectionSnapshot());
    input.setDraft(sourceDraft);
    input.setSelectedPlacementId(preservedSelection.selectedPlacementId);
    input.setSelectedLayerNodeIds(preservedSelection.selectedLayerNodeIds);
    input.setIntegratedSceneManifestKey(input.sceneManifestKey);
    input.retryManifestKindRef.current = null;
    input.retryManifestRef.current = null;
    input.setSaveError(null);
    input.setSaveState("saved");
    return;
  }
  if (decision === "keep-local-after-older-save") {
    input.setIntegratedSceneManifestKey(input.sceneManifestKey);
    input.retryManifestKindRef.current = null;
    input.retryManifestRef.current = null;
    input.setSaveError(null);
    return;
  }
  input.retryManifestKindRef.current = "server-conflict";
  input.retryManifestRef.current = input.saveManifest;
  input.setSaveError(DEFAULT_ASSEMBLY_CONFLICT_ERROR);
  input.setSaveState("conflict");
}

function integrateCatalogOnlyScenePackage(input: SceneManifestIntegrationInput, sourceDraft: AssemblyManifestDraft) {
  // WHY: duplicate/upload 只会刷新 asset catalog 和当前 empty-scene 绑定；这里保留用户的未保存摆放，
  // 避免 connected pool 一次素材操作就把 editor draft 重置回后端快照。
  input.setDraft((currentDraft) => {
    const selectionChanged = hasEmptySceneSelectionChanged(currentDraft, sourceDraft);
    if (selectionChanged) {
      // WHY: 当前 empty-scene 选择来自显式的媒体选择动作，不代表作者已经接受新的坐标基准；
      // 这里先把 draft 跟到最新背景，但禁止 autosave 偷偷改写持久化 assembly，直到作者 save/clear/继续编辑。
      input.setRequiresExplicitSelectionSave(true);
      input.setAlignmentRiskPlacementIds(currentDraft.placements.map((placement) => placement.id));
    }
    if (!selectionChanged && JSON.stringify(currentDraft.asset_catalog) === JSON.stringify(sourceDraft.asset_catalog)) {
      return currentDraft;
    }
    return {
      ...currentDraft,
      empty_scene_image_id: sourceDraft.empty_scene_image_id,
      empty_scene_size: sourceDraft.empty_scene_size,
      asset_catalog: sourceDraft.asset_catalog,
    };
  });
}

function shouldAutosave(input: AutosaveInput): boolean {
  if (!input.hasDirtyChanges || !input.canPersistDraft || input.saveState === "conflict") {
    return false;
  }
  if (input.saveState === "saving" && input.saveRequestRef.current) {
    return false;
  }
  if (input.requiresExplicitSelectionSave) {
    // WHY: 仅由“切换 Empty Scene”带来的 draft 变化必须停在 author-review 阶段，
    // 不能通过 autosave 悄悄把新的 empty_scene_image_id/size 落盘。
    return false;
  }
  return input.retryManifestRef.current === null;
}

function hasEmptySceneSelectionChanged(currentDraft: AssemblyManifestDraft, sourceDraft: AssemblyManifestDraft): boolean {
  return currentDraft.empty_scene_image_id !== sourceDraft.empty_scene_image_id ||
    !sameEmptySceneSize(currentDraft.empty_scene_size, sourceDraft.empty_scene_size);
}
