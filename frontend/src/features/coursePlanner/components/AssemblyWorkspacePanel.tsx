import { useEffect, useMemo, useRef, useState } from "react";

import {
  addAssetPlacement,
  createAssemblyDraft,
  projectManifestForSave,
  updatePlacementTransform,
  validateAssemblyDraft,
  type AssemblyManifestDraft,
} from "../assembly/assemblyManifestDraft";
import {
  type AssemblyReadiness,
  buildAssemblyReadiness,
} from "../assembly/assemblyReadiness";
import {
  manifestKeyOf,
  reconcileAlignmentRiskPlacementIds,
  sameEmptySceneSize,
} from "../assembly/assemblyWorkspaceState";
import { createInitialPlacementTransform } from "../assembly/tldrawAssemblyAdapter";
import type { DirectChapterAssetUploadInput } from "../api";
import { loadScenePackageImage } from "../scenePackageMedia";
import type { AsyncOperationState, ChapterScenePackage } from "../types";
import { AssemblyAssetPoolPanel } from "./AssemblyAssetPoolPanel";
import { AssemblyEditorCanvas } from "./AssemblyEditorCanvas";
import { AssemblyLayerTree } from "./AssemblyLayerTree";
import { AssemblyPlacementProperties } from "./AssemblyPlacementProperties";
import { AssemblyTargetCoveragePanel } from "./AssemblyTargetCoveragePanel";
import { AssemblyWorkspaceFeedback } from "./AssemblyWorkspaceFeedback";

type AssemblyWorkspacePanelProps = {
  onDeleteChapterAsset: (assetId: string) => Promise<ChapterScenePackage | null>;
  scenePackage: ChapterScenePackage;
  onDuplicateChapterAsset?: (assetId: string) => Promise<ChapterScenePackage | null>;
  onSaveAssembly: (manifest: ChapterScenePackage["assembly"]) => Promise<ChapterScenePackage | null>;
  onLockFinalStateChange?: (state: AssemblyWorkspaceLockFinalState) => void;
  onRegisterLockFinalFlush?: (
    flush: (() => Promise<ChapterScenePackage | null>) | null,
  ) => void;
  onUploadDirectAsset: (file: File, input: DirectChapterAssetUploadInput) => Promise<ChapterScenePackage | null>;
  saveStatus?: AsyncOperationState;
};

export type AssemblyWorkspaceSaveState = "saved" | "saving" | "failed" | "conflict";

export type AssemblyWorkspaceLockFinalState = {
  manifest: ChapterScenePackage["assembly"];
  hasDirtyChanges: boolean;
  canPersistDraft: boolean;
  readiness: AssemblyReadiness;
  saveError: string | null;
  saveState: AssemblyWorkspaceSaveState;
};

const ASSEMBLY_AUTOSAVE_DEBOUNCE_MS = 800;
const DEFAULT_ASSEMBLY_SAVE_ERROR = "Could not save assembly.";
const DEFAULT_ASSEMBLY_CONFLICT_ERROR = "New package data arrived from the server. Retry to save your local assembly edits.";

export function AssemblyWorkspacePanel({
  onDeleteChapterAsset,
  onLockFinalStateChange,
  onRegisterLockFinalFlush,
  onDuplicateChapterAsset,
  scenePackage,
  onSaveAssembly,
  onUploadDirectAsset,
  saveStatus,
}: AssemblyWorkspacePanelProps) {
  const sceneManifestKey = useMemo(() => JSON.stringify(scenePackage.assembly), [scenePackage.assembly]);
  const [draft, setDraft] = useState(() => createAssemblyDraft(scenePackage));
  const [selectedPlacementId, setSelectedPlacementId] = useState<string | null>(scenePackage.assembly.placements[0]?.id ?? null);
  const [selectedLayerNodeIds, setSelectedLayerNodeIds] = useState<string[]>(
    scenePackage.assembly.placements[0]?.id ? [scenePackage.assembly.placements[0].id] : [],
  );
  const [saveState, setSaveState] = useState<AssemblyWorkspaceSaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [integratedSceneManifestKey, setIntegratedSceneManifestKey] = useState(sceneManifestKey);
  const [requiresExplicitSelectionSave, setRequiresExplicitSelectionSave] = useState(false);
  const [alignmentRiskPlacementIds, setAlignmentRiskPlacementIds] = useState<string[]>([]);
  const [saveRevision, setSaveRevision] = useState(0);
  const autosaveTimerRef = useRef<number | null>(null);
  const retryManifestRef = useRef<ChapterScenePackage["assembly"] | null>(null);
  const inFlightManifestKeyRef = useRef<string | null>(null);
  const lastObservedSceneManifestKeyRef = useRef(sceneManifestKey);
  const latestScenePackageRef = useRef(scenePackage);
  const latestLockFinalStateRef = useRef<AssemblyWorkspaceLockFinalState>({
    manifest: scenePackage.assembly,
    hasDirtyChanges: false,
    canPersistDraft: false,
    readiness: buildAssemblyReadiness(scenePackage),
    saveError: null,
    saveState: "saved",
  });
  const saveRequestRef = useRef<Promise<ChapterScenePackage | null> | null>(null);
  const selectedPlacementIds = useMemo(() => {
    const placementIdSet = new Set(draft.placements.map((placement) => placement.id));
    return selectedLayerNodeIds.filter((nodeId) => placementIdSet.has(nodeId));
  }, [draft.placements, selectedLayerNodeIds]);
  const saveManifest = useMemo(() => projectManifestForSave(draft), [draft]);
  const saveManifestKey = useMemo(() => JSON.stringify(saveManifest), [saveManifest]);
  const validation = useMemo(() => validateAssemblyDraft(draft, scenePackage), [draft, scenePackage]);
  const readiness = useMemo(
    () => buildAssemblyReadiness(scenePackage, saveManifest),
    [saveManifest, scenePackage],
  );
  const hasDirtyChanges = saveManifestKey !== integratedSceneManifestKey;
  const canPersistDraft = Boolean(draft.empty_scene_image_id) && validation.is_valid;

  useEffect(() => {
    latestScenePackageRef.current = scenePackage;
  }, [scenePackage]);

  useEffect(() => {
    const nextState = {
      manifest: saveManifest,
      hasDirtyChanges,
      canPersistDraft,
      readiness,
      saveError,
      saveState,
    } satisfies AssemblyWorkspaceLockFinalState;
    latestLockFinalStateRef.current = nextState;
    onLockFinalStateChange?.(nextState);
  }, [
    canPersistDraft,
    hasDirtyChanges,
    onLockFinalStateChange,
    readiness,
    saveError,
    saveManifest,
    saveState,
  ]);

  useEffect(() => {
    onRegisterLockFinalFlush?.(() => flushCurrentManifestForLockFinal());
    return () => {
      onRegisterLockFinalFlush?.(null);
    };
  }, [onRegisterLockFinalFlush]);

  useEffect(() => {
    const sourceDraft = createAssemblyDraft(scenePackage);
    if (sceneManifestKey !== lastObservedSceneManifestKeyRef.current) {
      lastObservedSceneManifestKeyRef.current = sceneManifestKey;
      if (!hasDirtyChanges && inFlightManifestKeyRef.current === null) {
        setDraft(sourceDraft);
        setSelectedPlacementId(sourceDraft.placements[0]?.id ?? null);
        setSelectedLayerNodeIds(sourceDraft.placements[0]?.id ? [sourceDraft.placements[0].id] : []);
        setIntegratedSceneManifestKey(sceneManifestKey);
        retryManifestRef.current = null;
        setSaveError(null);
        setSaveState("saved");
        return;
      }
      retryManifestRef.current = saveManifest;
      setSaveError(DEFAULT_ASSEMBLY_CONFLICT_ERROR);
      setSaveState("conflict");
      return;
    }
    // WHY: duplicate/upload 只会刷新 asset catalog 和当前 empty-scene 绑定；这里保留用户的未保存摆放，
    // 避免 connected pool 一次素材操作就把 editor draft 重置回后端快照。
    setDraft((currentDraft) => {
      const selectionChanged = (
        currentDraft.empty_scene_image_id !== sourceDraft.empty_scene_image_id
        || !sameEmptySceneSize(currentDraft.empty_scene_size, sourceDraft.empty_scene_size)
      );
      if (selectionChanged) {
        // WHY: 当前 empty-scene 选择来自显式的媒体选择动作，不代表作者已经接受新的坐标基准；
        // 这里先把 draft 跟到最新背景，但禁止 autosave 偷偷改写持久化 assembly，直到作者 save/clear/继续编辑。
        setRequiresExplicitSelectionSave(true);
        setAlignmentRiskPlacementIds(
          currentDraft.placements.length > 0
            ? currentDraft.placements.map((placement) => placement.id)
            : [],
        );
      }
      if (
        currentDraft.empty_scene_image_id === sourceDraft.empty_scene_image_id &&
        sameEmptySceneSize(currentDraft.empty_scene_size, sourceDraft.empty_scene_size) &&
        JSON.stringify(currentDraft.asset_catalog) === JSON.stringify(sourceDraft.asset_catalog)
      ) {
        return currentDraft;
      }
      return {
        ...currentDraft,
        empty_scene_image_id: sourceDraft.empty_scene_image_id,
        empty_scene_size: sourceDraft.empty_scene_size,
        asset_catalog: sourceDraft.asset_catalog,
      };
    });
  }, [hasDirtyChanges, saveManifest, sceneManifestKey, scenePackage]);

  useEffect(() => {
    if (saveStatus?.status === "pending") {
      setSaveState("saving");
      setSaveError(null);
      return;
    }
    if (saveStatus?.status === "failed") {
      setSaveError(saveStatus.error ?? DEFAULT_ASSEMBLY_SAVE_ERROR);
      setSaveState("failed");
      return;
    }
    if (!hasDirtyChanges && inFlightManifestKeyRef.current === null) {
      setSaveError(null);
      setSaveState("saved");
    }
  }, [hasDirtyChanges, saveStatus?.error, saveStatus?.status]);

  useEffect(() => {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (!hasDirtyChanges || !canPersistDraft) {
      return;
    }
    if (saveState === "failed" && retryManifestRef.current && JSON.stringify(retryManifestRef.current) === saveManifestKey) {
      return;
    }
    if (saveState === "conflict") {
      return;
    }
    if (saveState === "saving" && saveRequestRef.current) {
      return;
    }
    if (requiresExplicitSelectionSave) {
      // WHY: 仅由“切换 Empty Scene”带来的 draft 变化必须停在 author-review 阶段，
      // 不能通过 autosave 悄悄把新的 empty_scene_image_id/size 落盘。
      return;
    }
    setSaveState("saving");
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      void performSave(saveManifest);
    }, ASSEMBLY_AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [canPersistDraft, hasDirtyChanges, requiresExplicitSelectionSave, saveManifest, saveManifestKey, saveRevision]);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, []);

  async function handleAddAsset(assetId: string) {
    if (!draft.empty_scene_image_id || !draft.empty_scene_size) {
      return;
    }
    const assetImage = await loadScenePackageImage(scenePackage.chapter_id, "chapter_assets", assetId);
    const nextDraft = addAssetPlacement(draft, assetId);
    const placement = nextDraft.placements.find((item) => item.asset_id === assetId);
    if (!placement) {
      return;
    }
    const nextTransform = createInitialPlacementTransform({
      canvasWidth: draft.empty_scene_size.width,
      canvasHeight: draft.empty_scene_size.height,
      assetWidth: assetImage.naturalWidth || assetImage.width || 1,
      assetHeight: assetImage.naturalHeight || assetImage.height || 1,
    });
    setDraft(updatePlacementTransform(nextDraft, placement.id, nextTransform));
    setSelectedPlacementId(placement.id);
    setSelectedLayerNodeIds([placement.id]);
  }

  function handleDraftChange(nextDraft: AssemblyManifestDraft) {
    const nextManifest = projectManifestForSave(nextDraft);
    // WHY: retryManifest 只能代表最近一次失败/冲突时的投影快照；用户继续编辑后，
    // 当前 draft 必须重新成为唯一提交来源，避免 Retry/Save 继续发送旧 manifest。
    if (retryManifestRef.current && manifestKeyOf(retryManifestRef.current) !== manifestKeyOf(nextManifest)) {
      retryManifestRef.current = null;
    }
    if (requiresExplicitSelectionSave || alignmentRiskPlacementIds.length > 0) {
      // WHY: Empty Scene 替换后的风险确认必须按 placement 粒度收敛。
      // 只有作者真正改动了某个 risky placement 的 transform，才视为接受了这个 placement 的新坐标基准；
      // 其他 placement 仍然保留 warning，并继续阻止 autosave 偷偷落盘。
      const nextAlignmentRiskPlacementIds = reconcileAlignmentRiskPlacementIds(
        draft,
        nextDraft,
        alignmentRiskPlacementIds,
      );
      setAlignmentRiskPlacementIds(nextAlignmentRiskPlacementIds);
      setRequiresExplicitSelectionSave(nextAlignmentRiskPlacementIds.length > 0);
    }
    setDraft(nextDraft);
  }

  async function performSave(manifest: ChapterScenePackage["assembly"]) {
    const manifestKey = manifestKeyOf(manifest);
    if (
      saveRequestRef.current
      && inFlightManifestKeyRef.current === manifestKey
    ) {
      return await saveRequestRef.current;
    }
    if (saveRequestRef.current) {
      await saveRequestRef.current;
      if (manifestKeyOf(latestLockFinalStateRef.current.manifest) !== manifestKey) {
        return latestScenePackageRef.current;
      }
    }
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    const saveRequest = (async () => {
      retryManifestRef.current = manifest;
      inFlightManifestKeyRef.current = manifestKey;
      setSaveError(null);
      setSaveState("saving");
      const nextScenePackage = await onSaveAssembly(manifest);
      inFlightManifestKeyRef.current = null;
      if (!nextScenePackage) {
        setSaveError((current) => current ?? saveStatus?.error ?? DEFAULT_ASSEMBLY_SAVE_ERROR);
        setSaveState("failed");
        return null;
      }
      const nextManifestKey = JSON.stringify(nextScenePackage.assembly);
      lastObservedSceneManifestKeyRef.current = nextManifestKey;
      latestScenePackageRef.current = nextScenePackage;
      setIntegratedSceneManifestKey(nextManifestKey);
      retryManifestRef.current = null;
      if (manifestKeyOf(latestLockFinalStateRef.current.manifest) === manifestKey) {
        setRequiresExplicitSelectionSave(false);
        setAlignmentRiskPlacementIds([]);
        setDraft(createAssemblyDraft(nextScenePackage));
        setSelectedPlacementId(nextScenePackage.assembly.placements[0]?.id ?? null);
        setSelectedLayerNodeIds(nextScenePackage.assembly.placements[0]?.id ? [nextScenePackage.assembly.placements[0].id] : []);
      }
      setSaveError(null);
      // WHY: 保存响应只确认它对应的 manifest 已落盘；如果作者在请求期间继续编辑，
      // 这里只更新已保存基线，不用旧服务端快照覆盖当前 draft，后续 autosave 会继续保存新草稿。
      setSaveState("saved");
      return nextScenePackage;
    })();
    saveRequestRef.current = saveRequest;
    try {
      return await saveRequest;
    } finally {
      if (saveRequestRef.current === saveRequest) {
        saveRequestRef.current = null;
        setSaveRevision((current) => current + 1);
      }
    }
  }

  async function handleSave() {
    if (!canPersistDraft) {
      return;
    }
    await performSave(retryManifestRef.current ?? saveManifest);
  }

  async function flushCurrentManifestForLockFinal() {
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
  }

  async function handleClearPlacementsForCurrentEmptyScene() {
    // WHY: clear placements 是作者显式确认的 destructive path；这里直接生成并持久化新的空 manifest，
    // 但保留 Chapter Assets / Complete Images / Final snapshot，不再靠后续隐式同步推断。
    const clearedDraft = {
      ...draft,
      placements: [],
      groups: [],
      layer_order: [],
    } satisfies AssemblyManifestDraft;
    setDraft(clearedDraft);
    setSelectedPlacementId(null);
    setSelectedLayerNodeIds([]);
    setRequiresExplicitSelectionSave(false);
    setAlignmentRiskPlacementIds([]);
    await performSave(projectManifestForSave(clearedDraft));
  }

  function handleCanvasPlacementSelection(placementId: string | null) {
    setSelectedPlacementId(placementId);
    setSelectedLayerNodeIds(placementId ? [placementId] : []);
  }

  function handlePropertySelectionChange(placementId: string | null, placementIds: string[]) {
    setSelectedPlacementId(placementId);
    setSelectedLayerNodeIds(placementIds);
  }

  const showRetry = saveState === "failed" || saveState === "conflict";
  const actionLabel = showRetry ? "Retry" : "Save Assembly";
  const canTriggerSave = canPersistDraft && (showRetry || hasDirtyChanges);

  return (
    <section className="chapter-studio-panel chapter-studio-panel-stack" aria-label="Assembly workspace">
      <AssemblyWorkspaceFeedback
        actionLabel={actionLabel}
        alignmentRiskPlacementCount={alignmentRiskPlacementIds.length}
        canTriggerSave={canTriggerSave}
        placementCount={draft.placements.length}
        readiness={readiness}
        saveError={saveError}
        saveState={saveState}
        saveStatus={saveStatus}
        onClearPlacementsForCurrentEmptyScene={handleClearPlacementsForCurrentEmptyScene}
        onSave={handleSave}
      />

      <div className="assembly-workspace-shell">
        <AssemblyAssetPoolPanel
          alignmentRiskPlacementIds={alignmentRiskPlacementIds}
          draft={draft}
          onDeleteChapterAsset={onDeleteChapterAsset}
          scenePackage={scenePackage}
          onAddAsset={handleAddAsset}
          onDuplicateChapterAsset={onDuplicateChapterAsset}
          onLocatePlacement={handleCanvasPlacementSelection}
          onUploadDirectAsset={onUploadDirectAsset}
        />

        <AssemblyTargetCoveragePanel
          items={readiness.target_coverage}
        />

        <div className="assembly-workspace-main">
          <AssemblyEditorCanvas
            draft={draft}
            scenePackage={scenePackage}
            selectedPlacementId={selectedPlacementId}
            onDraftChange={handleDraftChange}
            onSelectPlacement={handleCanvasPlacementSelection}
          />
          <AssemblyLayerTree
            draft={draft}
            selectedNodeIds={selectedLayerNodeIds}
            selectedPlacementId={selectedPlacementId}
            onDraftChange={handleDraftChange}
            onSelectNodeIds={setSelectedLayerNodeIds}
            onSelectPlacement={setSelectedPlacementId}
          />
        </div>

        <AssemblyPlacementProperties
          alignmentRiskPlacementIds={alignmentRiskPlacementIds}
          draft={draft}
          onDraftChange={handleDraftChange}
          onSelectionChange={handlePropertySelectionChange}
          scenePackage={scenePackage}
          selectedPlacementId={selectedPlacementId}
          selectedPlacementIds={selectedPlacementIds}
        />
      </div>
    </section>
  );
}
