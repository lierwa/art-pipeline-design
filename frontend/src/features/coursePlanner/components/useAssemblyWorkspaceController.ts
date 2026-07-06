import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  addAssetPlacement,
  createAssemblyDraft,
  groupPlacements,
  projectManifestForSave,
  ungroupPlacementGroup,
  updatePlacementTransform,
  validateAssemblyDraft,
  type AssemblyManifestDraft,
} from "../assembly/assemblyManifestDraft";
import type { ElementSelectionMode, OverlayState } from "../../../domain/workspace";
import {
  canRedoHistory,
  canUndoHistory,
  createOperationHistory,
  recordOperation,
  stepOperationHistory,
} from "../../../domain/operationHistory";
import {
  type AssemblyReadiness,
  buildAssemblyReadiness,
} from "../assembly/assemblyReadiness";
import {
  manifestKeyOf,
  reconcileAlignmentRiskPlacementIds,
} from "../assembly/assemblyWorkspaceState";
import { createInitialPlacementTransform } from "../assembly/assemblyCanvasViewModel";
import {
  resolveGroupActionState,
  resolveNextSelection,
  resolvePrimaryPlacementId,
  buildLayerTreeData,
  indexLayerNodes,
} from "./assemblyLayerTreeModel";
import { loadScenePackageImage } from "../scenePackageMedia";
import type { AsyncOperationState, ChapterScenePackage } from "../types";
import {
  initialSelectedLayerNodeIds,
  useFlushForLockFinal,
  usePerformAssemblySave,
} from "./useAssemblyWorkspaceSaveController";
import {
  useAutosave,
  useAutosaveTimerCleanup,
  usePublishLockFinalState,
  useRegisterLockFinalFlush,
  useSaveStatusSync,
  useSceneManifestIntegration,
} from "./useAssemblyWorkspaceLifecycle";

type AssemblyHistorySnapshot = {
  draft: AssemblyManifestDraft;
};

const DEFAULT_ASSEMBLY_OVERLAYS: OverlayState = {
  showBoxes: true,
  showMasks: false,
  showNames: true,
  showRejected: false,
  showThumbs: true,
};

type UseAssemblyWorkspaceControllerInput = {
  onLockFinalStateChange?: (state: AssemblyWorkspaceLockFinalState) => void;
  onRegisterLockFinalFlush?: (flush: (() => Promise<ChapterScenePackage | null>) | null) => void;
  onSaveAssembly: (manifest: ChapterScenePackage["assembly"]) => Promise<ChapterScenePackage | null>;
  saveStatus?: AsyncOperationState;
  scenePackage: ChapterScenePackage;
};

export type AssemblyWorkspaceSaveState = "saved" | "saving" | "failed" | "conflict";
export type AssemblyWorkspaceRetryKind = "save-failure" | "server-conflict";

export type AssemblyWorkspaceLockFinalState = {
  manifest: ChapterScenePackage["assembly"];
  hasDirtyChanges: boolean;
  canPersistDraft: boolean;
  readiness: AssemblyReadiness;
  saveError: string | null;
  saveState: AssemblyWorkspaceSaveState;
};

export function useAssemblyWorkspaceController({
  onLockFinalStateChange,
  onRegisterLockFinalFlush,
  onSaveAssembly,
  saveStatus,
  scenePackage,
}: UseAssemblyWorkspaceControllerInput) {
  const sceneManifestKey = useMemo(() => manifestKeyOf(scenePackage.assembly), [scenePackage.assembly]);
  const [draft, setDraft] = useState(() => createAssemblyDraft(scenePackage));
  const [selectedPlacementId, setSelectedPlacementId] = useState<string | null>(scenePackage.assembly.placements[0]?.id ?? null);
  const [selectedLayerNodeIds, setSelectedLayerNodeIds] = useState<string[]>(initialSelectedLayerNodeIds(scenePackage));
  const [canvasOverlays, setCanvasOverlays] = useState<OverlayState>(() => DEFAULT_ASSEMBLY_OVERLAYS);
  const [history, setHistory] = useState(() => createOperationHistory<AssemblyHistorySnapshot>());
  const [saveState, setSaveState] = useState<AssemblyWorkspaceSaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [integratedSceneManifestKey, setIntegratedSceneManifestKey] = useState(sceneManifestKey);
  const [requiresExplicitSelectionSave, setRequiresExplicitSelectionSave] = useState(false);
  const [alignmentRiskPlacementIds, setAlignmentRiskPlacementIds] = useState<string[]>([]);
  const [saveRevision, setSaveRevision] = useState(0);
  const autosaveTimerRef = useRef<number | null>(null);
  const retryManifestRef = useRef<ChapterScenePackage["assembly"] | null>(null);
  const retryManifestKindRef = useRef<AssemblyWorkspaceRetryKind | null>(null);
  const currentSaveManifestKeyRef = useRef(sceneManifestKey);
  const inFlightManifestKeyRef = useRef<string | null>(null);
  const lastAcceptedSaveManifestKeyRef = useRef<string | null>(null);
  const lastObservedSceneManifestKeyRef = useRef(sceneManifestKey);
  const latestScenePackageRef = useRef(scenePackage);
  const latestLockFinalStateRef = useRef(initialLockFinalState(scenePackage));
  const saveRequestRef = useRef<Promise<ChapterScenePackage | null> | null>(null);
  const selectedPlacementIdRef = useRef(selectedPlacementId);
  const selectedLayerNodeIdsRef = useRef(selectedLayerNodeIds);
  const boxEditHistoryRef = useRef<{
    placementId: string;
    recorded: boolean;
    snapshot: AssemblyHistorySnapshot;
  } | null>(null);
  const selectedPlacementIds = useSelectedPlacementIds(draft, selectedLayerNodeIds);
  const saveManifest = useMemo(() => projectManifestForSave(draft), [draft]);
  const saveManifestKey = useMemo(() => manifestKeyOf(saveManifest), [saveManifest]);
  const validation = useMemo(() => validateAssemblyDraft(draft, scenePackage), [draft, scenePackage]);
  const readiness = useMemo(() => buildAssemblyReadiness(scenePackage, saveManifest), [saveManifest, scenePackage]);
  const hasDirtyChanges = saveManifestKey !== integratedSceneManifestKey;
  const canPersistDraft = Boolean(draft.empty_scene_image_id) && validation.is_valid;
  currentSaveManifestKeyRef.current = saveManifestKey;
  selectedPlacementIdRef.current = selectedPlacementId;
  selectedLayerNodeIdsRef.current = selectedLayerNodeIds;
  const getSelectionSnapshot = useCallback(() => ({
    selectedPlacementId: selectedPlacementIdRef.current,
    selectedLayerNodeIds: selectedLayerNodeIdsRef.current,
  }), []);
  const performSave = usePerformAssemblySave({
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
    timerRef: autosaveTimerRef,
  });

  useEffect(() => {
    latestScenePackageRef.current = scenePackage;
  }, [scenePackage]);
  usePublishLockFinalState({ canPersistDraft, hasDirtyChanges, latestLockFinalStateRef, onLockFinalStateChange, readiness, saveError, saveManifest, saveState });
  const flushCurrentManifestForBoundary = useFlushForLockFinal(performSave, latestLockFinalStateRef, latestScenePackageRef, saveRequestRef);
  useRegisterLockFinalFlush(onRegisterLockFinalFlush, flushCurrentManifestForBoundary);
  useSceneManifestIntegration({
    alignmentRiskPlacementIds,
    hasDirtyChanges,
    inFlightManifestKeyRef,
    integratedSceneManifestKey,
    lastAcceptedSaveManifestKeyRef,
    lastObservedSceneManifestKeyRef,
    retryManifestKindRef,
    retryManifestRef,
    saveManifest,
    sceneManifestKey,
    scenePackage,
    getSelectionSnapshot,
    setAlignmentRiskPlacementIds,
    setDraft,
    setIntegratedSceneManifestKey,
    setRequiresExplicitSelectionSave,
    setSaveError,
    setSaveState,
    setSelectedLayerNodeIds,
    setSelectedPlacementId,
  });
  useSaveStatusSync({ hasDirtyChanges, inFlightManifestKeyRef, saveStatus, setSaveError, setSaveState });
  useAutosave({ canPersistDraft, hasDirtyChanges, performSave, requiresExplicitSelectionSave, saveManifest, saveManifestKey, saveRevision, saveState, retryManifestRef, saveRequestRef, setSaveState, timerRef: autosaveTimerRef });
  useAutosaveTimerCleanup(autosaveTimerRef);

  const hasRetryManifest = retryManifestRef.current !== null;
  const applyDraftChange = useDraftChangeHandler(draft, alignmentRiskPlacementIds, currentSaveManifestKeyRef, requiresExplicitSelectionSave, setAlignmentRiskPlacementIds, setDraft, setRequiresExplicitSelectionSave, retryManifestKindRef, retryManifestRef);
  const createHistorySnapshot = useCallback((): AssemblyHistorySnapshot => ({ draft }), [draft]);
  const recordHistorySnapshot = useCallback((snapshot: AssemblyHistorySnapshot) => {
    setHistory((current) => recordOperation(current, snapshot));
  }, []);
  const handleDraftChange = useCallback((nextDraft: AssemblyManifestDraft) => {
    const activeBoxEdit = boxEditHistoryRef.current;
    if (activeBoxEdit) {
      if (!activeBoxEdit.recorded) {
        recordHistorySnapshot(activeBoxEdit.snapshot);
        boxEditHistoryRef.current = { ...activeBoxEdit, recorded: true };
      }
      applyDraftChange(nextDraft);
      return;
    }
    recordHistorySnapshot(createHistorySnapshot());
    applyDraftChange(nextDraft);
  }, [applyDraftChange, createHistorySnapshot, recordHistorySnapshot]);
  const restoreHistorySnapshot = useCallback((snapshot: AssemblyHistorySnapshot) => {
    boxEditHistoryRef.current = null;
    applyDraftChange(snapshot.draft);
  }, [applyDraftChange]);
  const handleUndo = useCallback(() => {
    const nextStep = stepOperationHistory(history, "undo", createHistorySnapshot());
    if (!nextStep.target) {
      return;
    }
    setHistory(nextStep.history);
    restoreHistorySnapshot(nextStep.target);
  }, [createHistorySnapshot, history, restoreHistorySnapshot]);
  const handleRedo = useCallback(() => {
    const nextStep = stepOperationHistory(history, "redo", createHistorySnapshot());
    if (!nextStep.target) {
      return;
    }
    setHistory(nextStep.history);
    restoreHistorySnapshot(nextStep.target);
  }, [createHistorySnapshot, history, restoreHistorySnapshot]);
  const handleBoxEditStart = useCallback((placementId: string) => {
    if (boxEditHistoryRef.current?.placementId === placementId) {
      return;
    }
    boxEditHistoryRef.current = {
      placementId,
      recorded: false,
      snapshot: createHistorySnapshot(),
    };
  }, [createHistorySnapshot]);
  const handleBoxEditEnd = useCallback((placementId: string) => {
    if (boxEditHistoryRef.current?.placementId === placementId) {
      boxEditHistoryRef.current = null;
    }
  }, []);
  const handleToggleCanvasOverlay = useCallback((key: "showBoxes" | "showNames") => {
    setCanvasOverlays((current) => ({ ...current, [key]: !current[key] }));
  }, []);

  return {
    actionLabel: saveState === "conflict" || hasRetryManifest ? "Retry" : "Save Assembly",
    alignmentRiskPlacementIds,
    canRedo: canRedoHistory(history),
    canTriggerSave: canPersistDraft && (saveState === "conflict" || hasRetryManifest || hasDirtyChanges),
    canUndo: canUndoHistory(history),
    canvasOverlays,
    draft,
    handleAddAsset: useAddAssetHandler(draft, currentSaveManifestKeyRef, scenePackage, setDraft, setSelectedLayerNodeIds, setSelectedPlacementId, createHistorySnapshot, recordHistorySnapshot),
    handleBeforeBackNavigation: useBackNavigationFlushHandler(flushCurrentManifestForBoundary, latestLockFinalStateRef),
    handleBoxEditEnd,
    handleBoxEditStart,
    handleCanvasPlacementSelection: useCanvasPlacementSelectionHandler(draft, selectedLayerNodeIds, setSelectedLayerNodeIds, setSelectedPlacementId),
    handleGroupSelectedLayers: useGroupSelectedLayersHandler(draft, selectedLayerNodeIds, currentSaveManifestKeyRef, setDraft, setSelectedLayerNodeIds, setSelectedPlacementId, createHistorySnapshot, recordHistorySnapshot),
    handleSelectAllPlacements: useSelectAllPlacementsHandler(draft, setSelectedLayerNodeIds, setSelectedPlacementId),
    handleUngroupSelectedLayers: useUngroupSelectedLayersHandler(draft, selectedLayerNodeIds, currentSaveManifestKeyRef, setDraft, setSelectedLayerNodeIds, setSelectedPlacementId, createHistorySnapshot, recordHistorySnapshot),
    handleClearPlacementsForCurrentEmptyScene: useClearPlacementsHandler(draft, currentSaveManifestKeyRef, performSave, setAlignmentRiskPlacementIds, setDraft, setRequiresExplicitSelectionSave, setSelectedLayerNodeIds, setSelectedPlacementId, createHistorySnapshot, recordHistorySnapshot),
    handleDraftChange,
    handlePropertySelectionChange: usePropertySelectionHandler(setSelectedLayerNodeIds, setSelectedPlacementId),
    handleRedo,
    handleSave: useSaveHandler(canPersistDraft, performSave, retryManifestRef, saveManifest),
    handleToggleCanvasOverlay,
    handleUndo,
    readiness,
    saveError,
    saveState,
    selectedLayerNodeIds,
    selectedPlacementId,
    selectedPlacementIds,
    setSelectedLayerNodeIds,
    setSelectedPlacementId,
  };
}

function useSelectedPlacementIds(draft: AssemblyManifestDraft, selectedLayerNodeIds: string[]) {
  return useMemo(() => {
    const placementIdSet = new Set(draft.placements.map((placement) => placement.id));
    return selectedLayerNodeIds.filter((nodeId) => placementIdSet.has(nodeId));
  }, [draft.placements, selectedLayerNodeIds]);
}

function useBackNavigationFlushHandler(
  flushCurrentManifestForBoundary: () => Promise<ChapterScenePackage | null>,
  latestLockFinalStateRef: MutableRefObject<AssemblyWorkspaceLockFinalState>,
) {
  return useCallback(async () => {
    const state = latestLockFinalStateRef.current;
    if (!state.hasDirtyChanges || !state.canPersistDraft) {
      return true;
    }
    // WHY: invalid drafts不能被强行持久化；valid dirty draft 则必须在离开前落盘，
    // trade-off 是保存失败时留在编辑器里，让用户保留 retry/error 上下文。
    return Boolean(await flushCurrentManifestForBoundary());
  }, [flushCurrentManifestForBoundary, latestLockFinalStateRef]);
}

function setLocalDraftMutation(
  nextDraft: AssemblyManifestDraft,
  currentSaveManifestKeyRef: MutableRefObject<string>,
  setDraft: Dispatch<SetStateAction<AssemblyManifestDraft>>,
) {
  // WHY: save response 可能在 React 处理 setDraft 之前完成；先同步推进 freshness key，
  // 才能让旧保存回包识别为 stale，不覆盖刚发生的本地编辑。
  currentSaveManifestKeyRef.current = manifestKeyOf(projectManifestForSave(nextDraft));
  setDraft(nextDraft);
}

function useAddAssetHandler(
  draft: AssemblyManifestDraft,
  currentSaveManifestKeyRef: MutableRefObject<string>,
  scenePackage: ChapterScenePackage,
  setDraft: Dispatch<SetStateAction<AssemblyManifestDraft>>,
  setSelectedLayerNodeIds: (value: string[]) => void,
  setSelectedPlacementId: (value: string | null) => void,
  createHistorySnapshot: () => AssemblyHistorySnapshot,
  recordHistorySnapshot: (snapshot: AssemblyHistorySnapshot) => void,
) {
  return useCallback(async (assetId: string, center?: { x: number; y: number }) => {
    if (!draft.empty_scene_image_id || !draft.empty_scene_size) {
      return;
    }
    const assetImage = await loadScenePackageImage(scenePackage.chapter_id, "chapter_assets", assetId);
    const nextDraft = addAssetPlacement(draft, assetId);
    const existingPlacementIds = new Set(draft.placements.map((item) => item.id));
    const placement = nextDraft.placements.find((item) => item.asset_id === assetId && !existingPlacementIds.has(item.id));
    if (!placement) {
      return;
    }
    recordHistorySnapshot(createHistorySnapshot());
    const nextTransform = createInitialPlacementTransform({
      canvasWidth: draft.empty_scene_size.width,
      canvasHeight: draft.empty_scene_size.height,
      assetWidth: assetImage.naturalWidth || assetImage.width || 1,
      assetHeight: assetImage.naturalHeight || assetImage.height || 1,
      centerX: center ? center.x / draft.empty_scene_size.width : 0.5,
      centerY: center ? center.y / draft.empty_scene_size.height : 0.5,
    });
    setLocalDraftMutation(updatePlacementTransform(nextDraft, placement.id, nextTransform), currentSaveManifestKeyRef, setDraft);
    setSelectedPlacementId(placement.id);
    setSelectedLayerNodeIds([placement.id]);
  }, [createHistorySnapshot, currentSaveManifestKeyRef, draft, recordHistorySnapshot, scenePackage.chapter_id, setDraft, setSelectedLayerNodeIds, setSelectedPlacementId]);
}

function useDraftChangeHandler(
  draft: AssemblyManifestDraft,
  alignmentRiskPlacementIds: string[],
  currentSaveManifestKeyRef: MutableRefObject<string>,
  requiresExplicitSelectionSave: boolean,
  setAlignmentRiskPlacementIds: (value: string[]) => void,
  setDraft: Dispatch<SetStateAction<AssemblyManifestDraft>>,
  setRequiresExplicitSelectionSave: (value: boolean) => void,
  retryManifestKindRef: MutableRefObject<AssemblyWorkspaceRetryKind | null>,
  retryManifestRef: MutableRefObject<ChapterScenePackage["assembly"] | null>,
) {
  return useCallback((nextDraft: AssemblyManifestDraft) => {
    const nextManifest = projectManifestForSave(nextDraft);
    const nextManifestKey = manifestKeyOf(nextManifest);
    currentSaveManifestKeyRef.current = nextManifestKey;
    if (retryManifestRef.current && manifestKeyOf(retryManifestRef.current) !== nextManifestKey) {
      if (retryManifestKindRef.current === "server-conflict") {
        // WHY: 服务端冲突的 Retry 是作者确认“用本地编辑覆盖新服务端快照”；
        // 后续编辑仍属于这次确认流程，所以 retry manifest 必须跟随最新草稿。
        retryManifestRef.current = nextManifest;
      } else {
        retryManifestKindRef.current = null;
        retryManifestRef.current = null;
      }
    }
    if (requiresExplicitSelectionSave || alignmentRiskPlacementIds.length > 0) {
      // WHY: Empty Scene 替换后的风险确认必须按 placement 粒度收敛。
      const nextRiskIds = reconcileAlignmentRiskPlacementIds(draft, nextDraft, alignmentRiskPlacementIds);
      setAlignmentRiskPlacementIds(nextRiskIds);
      setRequiresExplicitSelectionSave(nextRiskIds.length > 0);
    }
    setLocalDraftMutation(nextDraft, currentSaveManifestKeyRef, setDraft);
  }, [alignmentRiskPlacementIds, currentSaveManifestKeyRef, draft, requiresExplicitSelectionSave, retryManifestKindRef, retryManifestRef, setAlignmentRiskPlacementIds, setDraft, setRequiresExplicitSelectionSave]);
}

function useClearPlacementsHandler(
  draft: AssemblyManifestDraft,
  currentSaveManifestKeyRef: MutableRefObject<string>,
  performSave: (manifest: ChapterScenePackage["assembly"]) => Promise<ChapterScenePackage | null>,
  setAlignmentRiskPlacementIds: (value: string[]) => void,
  setDraft: Dispatch<SetStateAction<AssemblyManifestDraft>>,
  setRequiresExplicitSelectionSave: (value: boolean) => void,
  setSelectedLayerNodeIds: (value: string[]) => void,
  setSelectedPlacementId: (value: string | null) => void,
  createHistorySnapshot: () => AssemblyHistorySnapshot,
  recordHistorySnapshot: (snapshot: AssemblyHistorySnapshot) => void,
) {
  return useCallback(async () => {
    // WHY: clear placements 是作者显式确认的 destructive path；这里直接生成并持久化新的空 manifest，
    // 但保留 Chapter Assets / Complete Images / Final snapshot，不再靠后续隐式同步推断。
    const clearedDraft = { ...draft, placements: [], groups: [], layer_order: [] } satisfies AssemblyManifestDraft;
    recordHistorySnapshot(createHistorySnapshot());
    setLocalDraftMutation(clearedDraft, currentSaveManifestKeyRef, setDraft);
    setSelectedPlacementId(null);
    setSelectedLayerNodeIds([]);
    setRequiresExplicitSelectionSave(false);
    setAlignmentRiskPlacementIds([]);
    await performSave(projectManifestForSave(clearedDraft));
  }, [createHistorySnapshot, currentSaveManifestKeyRef, draft, performSave, recordHistorySnapshot, setAlignmentRiskPlacementIds, setDraft, setRequiresExplicitSelectionSave, setSelectedLayerNodeIds, setSelectedPlacementId]);
}

function useSaveHandler(
  canPersistDraft: boolean,
  performSave: (manifest: ChapterScenePackage["assembly"]) => Promise<ChapterScenePackage | null>,
  retryManifestRef: MutableRefObject<ChapterScenePackage["assembly"] | null>,
  saveManifest: ChapterScenePackage["assembly"],
) {
  return useCallback(async () => {
    if (!canPersistDraft) {
      return;
    }
    await performSave(retryManifestRef.current ?? saveManifest);
  }, [canPersistDraft, performSave, retryManifestRef, saveManifest]);
}

function useCanvasPlacementSelectionHandler(
  draft: AssemblyManifestDraft,
  selectedLayerNodeIds: string[],
  setSelectedLayerNodeIds: (value: string[]) => void,
  setSelectedPlacementId: (value: string | null) => void,
) {
  return useCallback((placementId: string | null, mode: ElementSelectionMode = "replace") => {
    if (!placementId) {
      setSelectedPlacementId(null);
      setSelectedLayerNodeIds([]);
      return;
    }

    if (mode === "toggle") {
      const nextIds = resolveNextSelection(
        placementId,
        selectedLayerNodeIds,
        new Set(selectedLayerNodeIds),
        true,
      );
      setSelectedLayerNodeIds(nextIds);
      setSelectedPlacementId(nextIds.includes(placementId) ? placementId : resolvePrimaryFromDraft(draft, nextIds));
      return;
    }

    if (mode === "focus" && selectedLayerNodeIds.includes(placementId)) {
      setSelectedPlacementId(placementId);
      return;
    }

    setSelectedPlacementId(placementId);
    setSelectedLayerNodeIds([placementId]);
  }, [draft, selectedLayerNodeIds, setSelectedLayerNodeIds, setSelectedPlacementId]);
}

function usePropertySelectionHandler(
  setSelectedLayerNodeIds: (value: string[]) => void,
  setSelectedPlacementId: (value: string | null) => void,
) {
  return useCallback((placementId: string | null, placementIds: string[]) => {
    setSelectedPlacementId(placementId);
    setSelectedLayerNodeIds(placementIds);
  }, [setSelectedLayerNodeIds, setSelectedPlacementId]);
}

function initialLockFinalState(scenePackage: ChapterScenePackage): AssemblyWorkspaceLockFinalState {
  return {
    manifest: scenePackage.assembly,
    hasDirtyChanges: false,
    canPersistDraft: false,
    readiness: buildAssemblyReadiness(scenePackage),
    saveError: null,
    saveState: "saved",
  };
}

function useSelectAllPlacementsHandler(
  draft: AssemblyManifestDraft,
  setSelectedLayerNodeIds: (value: string[]) => void,
  setSelectedPlacementId: (value: string | null) => void,
) {
  return useCallback(() => {
    const orderedIds = draft.layer_order.filter((placementId) => (
      draft.placements.some((placement) => placement.id === placementId)
    ));
    const missingIds = draft.placements
      .map((placement) => placement.id)
      .filter((placementId) => !orderedIds.includes(placementId));
    const nextIds = [...orderedIds, ...missingIds];
    setSelectedLayerNodeIds(nextIds);
    setSelectedPlacementId(nextIds[0] ?? null);
  }, [draft.layer_order, draft.placements, setSelectedLayerNodeIds, setSelectedPlacementId]);
}

function useGroupSelectedLayersHandler(
  draft: AssemblyManifestDraft,
  selectedLayerNodeIds: string[],
  currentSaveManifestKeyRef: MutableRefObject<string>,
  setDraft: Dispatch<SetStateAction<AssemblyManifestDraft>>,
  setSelectedLayerNodeIds: (value: string[]) => void,
  setSelectedPlacementId: (value: string | null) => void,
  createHistorySnapshot: () => AssemblyHistorySnapshot,
  recordHistorySnapshot: (snapshot: AssemblyHistorySnapshot) => void,
) {
  return useCallback(() => {
    const groupAction = resolveGroupActionState(draft, selectedLayerNodeIds);
    if (groupAction.kind !== "group") {
      return;
    }
    const nextDraft = groupPlacements(draft, groupAction.placementIds, `Group ${draft.groups.length + 1}`);
    if (nextDraft === draft) {
      return;
    }
    const groupId = nextDraft.groups[nextDraft.groups.length - 1]?.id ?? null;
    recordHistorySnapshot(createHistorySnapshot());
    setLocalDraftMutation(nextDraft, currentSaveManifestKeyRef, setDraft);
    setSelectedLayerNodeIds(groupId ? [groupId] : []);
    setSelectedPlacementId(null);
  }, [createHistorySnapshot, currentSaveManifestKeyRef, draft, recordHistorySnapshot, selectedLayerNodeIds, setDraft, setSelectedLayerNodeIds, setSelectedPlacementId]);
}

function useUngroupSelectedLayersHandler(
  draft: AssemblyManifestDraft,
  selectedLayerNodeIds: string[],
  currentSaveManifestKeyRef: MutableRefObject<string>,
  setDraft: Dispatch<SetStateAction<AssemblyManifestDraft>>,
  setSelectedLayerNodeIds: (value: string[]) => void,
  setSelectedPlacementId: (value: string | null) => void,
  createHistorySnapshot: () => AssemblyHistorySnapshot,
  recordHistorySnapshot: (snapshot: AssemblyHistorySnapshot) => void,
) {
  return useCallback(() => {
    const groupAction = resolveGroupActionState(draft, selectedLayerNodeIds);
    if (groupAction.kind !== "ungroup") {
      return;
    }
    const nextDraft = ungroupPlacementGroup(draft, groupAction.groupId);
    if (nextDraft === draft) {
      return;
    }
    recordHistorySnapshot(createHistorySnapshot());
    setLocalDraftMutation(nextDraft, currentSaveManifestKeyRef, setDraft);
    setSelectedLayerNodeIds(groupAction.placementIds);
    setSelectedPlacementId(groupAction.placementIds[0] ?? null);
  }, [createHistorySnapshot, currentSaveManifestKeyRef, draft, recordHistorySnapshot, selectedLayerNodeIds, setDraft, setSelectedLayerNodeIds, setSelectedPlacementId]);
}

function resolvePrimaryFromDraft(draft: AssemblyManifestDraft, selectedIds: string[]) {
  const tree = buildLayerTreeData(draft);
  const nodesById = indexLayerNodes(tree);
  const activeNodeId = selectedIds[selectedIds.length - 1] ?? null;
  const activeNode = activeNodeId ? nodesById.get(activeNodeId) : null;
  return activeNode ? resolvePrimaryPlacementId(activeNode, selectedIds, nodesById) : null;
}
