import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";

import type {
  DirectChapterAssetUploadInput,
  GeneratedChapterAssetMaterializeInput,
  GeneratedChapterAssetMaterializeResult,
} from "../api";
import type { AsyncOperationState, ChapterScenePackage, GeneratedChapterAsset } from "../types";
import type { AssemblyAuthoringCanvasControls } from "./AssemblyAuthoringCanvas";
import { AssemblyAssetPoolPanel } from "./AssemblyAssetPoolPanel";
import { AssemblyEditorCanvas } from "./AssemblyEditorCanvas";
import { GeneratedChapterAssetsDrawer } from "./GeneratedChapterAssetsDrawer";
import { AssemblyLayerTree } from "./AssemblyLayerTree";
import { AssemblyPlacementProperties } from "./AssemblyPlacementProperties";
import { AssemblyWorkspaceFeedback } from "./AssemblyWorkspaceFeedback";
import {
  flattenNodePlacementIds,
  sameStringSet,
  type AssemblyLayerTreeNode,
} from "./assemblyLayerTreeModel";
import {
  useAssemblyWorkspaceController,
  type AssemblyWorkspaceLockFinalState,
  type AssemblyWorkspaceSaveState,
} from "./useAssemblyWorkspaceController";

export type { AssemblyWorkspaceLockFinalState, AssemblyWorkspaceSaveState };

const ASSEMBLY_EDITOR_PANEL_GROUP_ID = "assembly-editor-layout";
const ASSEMBLY_EDITOR_PANEL_LAYOUT_STORAGE_KEY = "course-planner:assembly-editor:panel-layout";
const ASSEMBLY_EDITOR_PANEL_IDS = [
  "assembly-editor-assets-panel",
  "assembly-editor-canvas-panel",
  "assembly-editor-inspector-panel",
] as const;
const DEFAULT_ASSEMBLY_EDITOR_PANEL_LAYOUT = {
  [ASSEMBLY_EDITOR_PANEL_IDS[0]]: 23,
  [ASSEMBLY_EDITOR_PANEL_IDS[1]]: 51,
  [ASSEMBLY_EDITOR_PANEL_IDS[2]]: 26,
};

function readAssemblyEditorPanelLayout() {
  const savedLayout = window.localStorage.getItem(ASSEMBLY_EDITOR_PANEL_LAYOUT_STORAGE_KEY);
  if (!savedLayout) {
    return DEFAULT_ASSEMBLY_EDITOR_PANEL_LAYOUT;
  }
  try {
    const parsed = JSON.parse(savedLayout);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return DEFAULT_ASSEMBLY_EDITOR_PANEL_LAYOUT;
    }
    return ASSEMBLY_EDITOR_PANEL_IDS.every((panelId) => typeof parsed[panelId] === "number")
      ? parsed
      : DEFAULT_ASSEMBLY_EDITOR_PANEL_LAYOUT;
  } catch {
    return DEFAULT_ASSEMBLY_EDITOR_PANEL_LAYOUT;
  }
}

function storeAssemblyEditorPanelLayout(layout: unknown) {
  // WHY: rail 宽度只是本机编辑偏好；固定写入 UI localStorage，避免混入 scene manifest、
  // autosave key 或 readiness 判断，破坏领域事实的单一来源。
  window.localStorage.setItem(ASSEMBLY_EDITOR_PANEL_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
}

type AssemblyWorkspacePanelProps = {
  backTo?: string;
  chapterTitle?: string;
  onDeleteChapterAsset: (assetId: string) => Promise<ChapterScenePackage | null>;
  scenePackage: ChapterScenePackage;
  onDuplicateChapterAsset?: (assetId: string) => Promise<ChapterScenePackage | null>;
  onListGeneratedAssets: () => Promise<GeneratedChapterAsset[]>;
  onMaterializeGeneratedAsset: (
    input: GeneratedChapterAssetMaterializeInput,
  ) => Promise<GeneratedChapterAssetMaterializeResult | null>;
  onSaveAssembly: (manifest: ChapterScenePackage["assembly"]) => Promise<ChapterScenePackage | null>;
  onLockFinalStateChange?: (state: AssemblyWorkspaceLockFinalState) => void;
  onRegisterLockFinalFlush?: (
    flush: (() => Promise<ChapterScenePackage | null>) | null,
  ) => void;
  onUploadDirectAsset: (file: File, input: DirectChapterAssetUploadInput) => Promise<ChapterScenePackage | null>;
  saveStatus?: AsyncOperationState;
};

export function AssemblyWorkspacePanel({
  backTo,
  chapterTitle,
  onDeleteChapterAsset,
  onDuplicateChapterAsset,
  onListGeneratedAssets,
  onLockFinalStateChange,
  onMaterializeGeneratedAsset,
  onRegisterLockFinalFlush,
  onSaveAssembly,
  onUploadDirectAsset,
  saveStatus,
  scenePackage,
}: AssemblyWorkspacePanelProps) {
  const [canvasControls, setCanvasControls] = useState<AssemblyAuthoringCanvasControls | null>(null);
  const [hiddenPlacementIds, setHiddenPlacementIds] = useState<Set<string>>(() => new Set());
  const generatedAssetsDrawer = useGeneratedAssetsDrawer({
    onListGeneratedAssets,
    onMaterializeGeneratedAsset,
  });
  const controller = useAssemblyWorkspaceController({
    onLockFinalStateChange,
    onRegisterLockFinalFlush,
    onSaveAssembly,
    saveStatus,
    scenePackage,
  });
  useEffect(() => {
    const placementIds = new Set(controller.draft.placements.map((placement) => placement.id));
    setHiddenPlacementIds((current) => {
      const next = new Set([...current].filter((placementId) => placementIds.has(placementId)));
      return sameStringSet(current, next) ? current : next;
    });
  }, [controller.draft.placements]);

  function handleTogglePlacementVisibility(node: AssemblyLayerTreeNode) {
    const placementIds = flattenNodePlacementIds(node);
    if (placementIds.length === 0) {
      return;
    }
    setHiddenPlacementIds((current) => {
      const next = new Set(current);
      const shouldShow = placementIds.every((placementId) => next.has(placementId));
      placementIds.forEach((placementId) => {
        if (shouldShow) {
          next.delete(placementId);
        } else {
          next.add(placementId);
        }
      });
      return next;
    });
  }

  return (
    <section className="assembly-workspace assembly-product-shell" aria-label="Assembly workspace">
      <AssemblyWorkspaceFeedback
        alignmentRiskPlacementCount={controller.alignmentRiskPlacementIds.length}
        backTo={backTo}
        chapterTitle={chapterTitle}
        placementCount={controller.draft.placements.length}
        readiness={controller.readiness}
        saveError={controller.saveError}
        saveState={controller.saveState}
        onBeforeBackNavigation={controller.handleBeforeBackNavigation}
        onClearPlacementsForCurrentEmptyScene={controller.handleClearPlacementsForCurrentEmptyScene}
      />

      <AssemblyEditorColumns
        canvasControls={canvasControls}
        hiddenPlacementIds={hiddenPlacementIds}
        onCanvasControlsChange={setCanvasControls}
        onTogglePlacementVisibility={handleTogglePlacementVisibility}
        controller={controller}
        onDeleteChapterAsset={onDeleteChapterAsset}
        onDuplicateChapterAsset={onDuplicateChapterAsset}
        onOpenGeneratedAssets={generatedAssetsDrawer.handleOpen}
        saveStatus={saveStatus}
        onUploadDirectAsset={onUploadDirectAsset}
        scenePackage={scenePackage}
      />
      <GeneratedChapterAssetsDrawer
        assets={generatedAssetsDrawer.assets}
        errorMessage={generatedAssetsDrawer.errorMessage}
        isLoading={generatedAssetsDrawer.isLoading}
        isOpen={generatedAssetsDrawer.isOpen}
        onClose={generatedAssetsDrawer.handleClose}
        onMaterializeAsset={generatedAssetsDrawer.handleMaterialize}
        scenePackage={scenePackage}
      />
      <AssemblyEditorStatusBar controller={controller} />
    </section>
  );
}

function useGeneratedAssetsDrawer({
  onListGeneratedAssets,
  onMaterializeGeneratedAsset,
}: {
  onListGeneratedAssets: AssemblyWorkspacePanelProps["onListGeneratedAssets"];
  onMaterializeGeneratedAsset: AssemblyWorkspacePanelProps["onMaterializeGeneratedAsset"];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [assets, setAssets] = useState<GeneratedChapterAsset[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadAssets = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      setAssets(await onListGeneratedAssets());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not load generated Chapter Assets.");
    } finally {
      setIsLoading(false);
    }
  }, [onListGeneratedAssets]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    void loadAssets();
  }, [isOpen, loadAssets]);

  const handleMaterialize = useCallback(async (asset: GeneratedChapterAsset) => {
    const result = await onMaterializeGeneratedAsset({
      completeSceneImageId: asset.complete_scene_image_id,
      pipelineRunId: asset.pipeline_run_id,
      runAssetId: asset.run_asset_id,
    });
    if (!result) {
      return;
    }
    setAssets((current) => current.map((item) => (
      item.complete_scene_image_id === asset.complete_scene_image_id
      && item.pipeline_run_id === asset.pipeline_run_id
      && item.run_asset_id === asset.run_asset_id
        ? { ...item, state: "added", chapter_asset_id: result.chapterAsset.id }
        : item
    )));
  }, [onMaterializeGeneratedAsset]);

  return {
    assets,
    errorMessage,
    handleClose: () => setIsOpen(false),
    handleMaterialize,
    handleOpen: () => setIsOpen(true),
    isLoading,
    isOpen,
  };
}

function AssemblyEditorColumns({
  canvasControls,
  controller,
  hiddenPlacementIds,
  onCanvasControlsChange,
  onDeleteChapterAsset,
  onDuplicateChapterAsset,
  onOpenGeneratedAssets,
  onTogglePlacementVisibility,
  saveStatus,
  onUploadDirectAsset,
  scenePackage,
}: {
  canvasControls: AssemblyAuthoringCanvasControls | null;
  controller: ReturnType<typeof useAssemblyWorkspaceController>;
  hiddenPlacementIds: ReadonlySet<string>;
  onCanvasControlsChange: (controls: AssemblyAuthoringCanvasControls | null) => void;
  onDeleteChapterAsset: AssemblyWorkspacePanelProps["onDeleteChapterAsset"];
  onDuplicateChapterAsset: AssemblyWorkspacePanelProps["onDuplicateChapterAsset"];
  onOpenGeneratedAssets: () => void;
  onTogglePlacementVisibility: (node: AssemblyLayerTreeNode) => void;
  saveStatus?: AsyncOperationState;
  onUploadDirectAsset: AssemblyWorkspacePanelProps["onUploadDirectAsset"];
  scenePackage: ChapterScenePackage;
}) {
  useEffect(() => {
    if (!window.localStorage.getItem(ASSEMBLY_EDITOR_PANEL_LAYOUT_STORAGE_KEY)) {
      storeAssemblyEditorPanelLayout(DEFAULT_ASSEMBLY_EDITOR_PANEL_LAYOUT);
    }
  }, []);

  return (
    <Group
      className="assembly-editor-layout"
      data-panel-group="assembly-editor"
      data-testid="assembly-editor-layout"
      defaultLayout={readAssemblyEditorPanelLayout()}
      id={ASSEMBLY_EDITOR_PANEL_GROUP_ID}
      onLayoutChanged={storeAssemblyEditorPanelLayout}
      orientation="horizontal"
      style={{ height: "100%" }}
    >
      <Panel id={ASSEMBLY_EDITOR_PANEL_IDS[0]} defaultSize="23%" minSize="260px" maxSize="420px">
        <AssemblyAssetsColumn
          canvasControls={canvasControls}
          controller={controller}
          onDeleteChapterAsset={onDeleteChapterAsset}
          onDuplicateChapterAsset={onDuplicateChapterAsset}
          onOpenGeneratedAssets={onOpenGeneratedAssets}
          onUploadDirectAsset={onUploadDirectAsset}
          scenePackage={scenePackage}
        />
      </Panel>
      <AssemblyEditorResizeHandle label="Resize assets rail" />
      <Panel id={ASSEMBLY_EDITOR_PANEL_IDS[1]} defaultSize="51%" minSize="460px">
        <AssemblyCanvasColumn
          canvasControls={canvasControls}
          controller={controller}
          hiddenPlacementIds={hiddenPlacementIds}
          onCanvasControlsChange={onCanvasControlsChange}
          saveStatus={saveStatus}
          scenePackage={scenePackage}
        />
      </Panel>
      <AssemblyEditorResizeHandle label="Resize inspector rail" />
      <Panel id={ASSEMBLY_EDITOR_PANEL_IDS[2]} defaultSize="26%" minSize="320px" maxSize="500px">
        <AssemblyInspectorColumn
          controller={controller}
          hiddenPlacementIds={hiddenPlacementIds}
          onTogglePlacementVisibility={onTogglePlacementVisibility}
          scenePackage={scenePackage}
        />
      </Panel>
    </Group>
  );
}

function AssemblyEditorResizeHandle({ label }: { label: string }) {
  return (
    <Separator
      className="assembly-editor-resize-handle"
      aria-label={label}
    >
      <span aria-hidden="true" />
    </Separator>
  );
}

function AssemblyAssetsColumn({
  canvasControls,
  controller,
  onDeleteChapterAsset,
  onDuplicateChapterAsset,
  onOpenGeneratedAssets,
  onUploadDirectAsset,
  scenePackage,
}: {
  canvasControls: AssemblyAuthoringCanvasControls | null;
  controller: ReturnType<typeof useAssemblyWorkspaceController>;
  onDeleteChapterAsset: AssemblyWorkspacePanelProps["onDeleteChapterAsset"];
  onDuplicateChapterAsset: AssemblyWorkspacePanelProps["onDuplicateChapterAsset"];
  onOpenGeneratedAssets: () => void;
  onUploadDirectAsset: AssemblyWorkspacePanelProps["onUploadDirectAsset"];
  scenePackage: ChapterScenePackage;
}) {
  return (
    <div className="assembly-editor-assets-column">
      <AssemblyAssetPoolPanel
        alignmentRiskPlacementIds={controller.alignmentRiskPlacementIds}
        draft={controller.draft}
        onAddAsset={(assetId) => controller.handleAddAsset(assetId, canvasControls?.getViewportCenter() ?? undefined)}
        onDeleteChapterAsset={onDeleteChapterAsset}
        onDuplicateChapterAsset={onDuplicateChapterAsset}
        onOpenGeneratedAssets={onOpenGeneratedAssets}
        onLocatePlacement={controller.handleCanvasPlacementSelection}
        onUploadDirectAsset={onUploadDirectAsset}
        scenePackage={scenePackage}
      />
    </div>
  );
}

function AssemblyCanvasColumn({
  canvasControls,
  controller,
  hiddenPlacementIds,
  onCanvasControlsChange,
  saveStatus,
  scenePackage,
}: {
  canvasControls: AssemblyAuthoringCanvasControls | null;
  controller: ReturnType<typeof useAssemblyWorkspaceController>;
  hiddenPlacementIds: ReadonlySet<string>;
  onCanvasControlsChange: (controls: AssemblyAuthoringCanvasControls | null) => void;
  saveStatus?: AsyncOperationState;
  scenePackage: ChapterScenePackage;
}) {
  return (
    <div className="assembly-editor-canvas-column">
      <AssemblyEditorCanvas
        actionLabel={controller.actionLabel}
        canRedo={controller.canRedo}
        canTriggerSave={controller.canTriggerSave}
        canUndo={controller.canUndo}
        canvasControls={canvasControls}
        canvasOverlays={controller.canvasOverlays}
        draft={controller.draft}
        hiddenPlacementIds={hiddenPlacementIds}
        saveStatus={saveStatus}
        scenePackage={scenePackage}
        selectedLayerNodeIds={controller.selectedLayerNodeIds}
        selectedPlacementId={controller.selectedPlacementId}
        selectedPlacementIds={controller.selectedPlacementIds}
        onBoxEditEnd={controller.handleBoxEditEnd}
        onBoxEditStart={controller.handleBoxEditStart}
        onAddAsset={controller.handleAddAsset}
        onDraftChange={controller.handleDraftChange}
        onEditorControlsChange={onCanvasControlsChange}
        onGroupSelectedLayers={controller.handleGroupSelectedLayers}
        onRedo={controller.handleRedo}
        onSave={controller.handleSave}
        onSelectAllPlacements={controller.handleSelectAllPlacements}
        onSelectPlacement={controller.handleCanvasPlacementSelection}
        onSelectPlacementIds={(placementIds) => {
          controller.setSelectedLayerNodeIds(placementIds);
          controller.setSelectedPlacementId(placementIds[0] ?? null);
        }}
        onToggleCanvasOverlay={controller.handleToggleCanvasOverlay}
        onUngroupSelectedLayers={controller.handleUngroupSelectedLayers}
        onUndo={controller.handleUndo}
      />
    </div>
  );
}

function AssemblyInspectorColumn({
  controller,
  hiddenPlacementIds,
  onTogglePlacementVisibility,
  scenePackage,
}: {
  controller: ReturnType<typeof useAssemblyWorkspaceController>;
  hiddenPlacementIds: ReadonlySet<string>;
  onTogglePlacementVisibility: (node: AssemblyLayerTreeNode) => void;
  scenePackage: ChapterScenePackage;
}) {
  return (
    <div className="assembly-editor-inspector-column">
      <AssemblyPlacementProperties
        alignmentRiskPlacementIds={controller.alignmentRiskPlacementIds}
        draft={controller.draft}
        onDraftChange={controller.handleDraftChange}
        onSelectionChange={controller.handlePropertySelectionChange}
        scenePackage={scenePackage}
        selectedNodeIds={controller.selectedLayerNodeIds}
        selectedPlacementId={controller.selectedPlacementId}
        selectedPlacementIds={controller.selectedPlacementIds}
      />
      <AssemblyLayerTree
        draft={controller.draft}
        hiddenPlacementIds={hiddenPlacementIds}
        scenePackage={scenePackage}
        selectedNodeIds={controller.selectedLayerNodeIds}
        selectedPlacementId={controller.selectedPlacementId}
        onDraftChange={controller.handleDraftChange}
        onSelectNodeIds={controller.setSelectedLayerNodeIds}
        onSelectPlacement={controller.setSelectedPlacementId}
        onTogglePlacementVisibility={onTogglePlacementVisibility}
      />
    </div>
  );
}

function AssemblyEditorStatusBar({
  controller,
}: {
  controller: ReturnType<typeof useAssemblyWorkspaceController>;
}) {
  const selectedPlacements = controller.selectedPlacementIds
    .map((placementId) => controller.draft.placements.find((placement) => placement.id === placementId))
    .filter((placement): placement is typeof controller.draft.placements[number] => Boolean(placement));
  const primaryPlacement = selectedPlacements[0] ?? null;
  const metrics = primaryPlacement && controller.draft.empty_scene_size
    ? placementStatusMetrics(primaryPlacement, controller.draft.empty_scene_size)
    : [];
  const selectedLayerCount = controller.selectedLayerNodeIds.length;
  const sceneSize = controller.draft.empty_scene_size;
  const layerCount = controller.draft.layer_order.length;

  return (
    <footer className="assembly-editor-statusbar" aria-label="Assembly editor status">
      <div className="assembly-editor-statusbar-save">
        <Check size={16} aria-hidden="true" />
        <span>{editorStatusLabel(controller.saveState)}</span>
      </div>
      <div className="assembly-editor-statusbar-metrics">
        <span>{selectedLayerCount} selected</span>
        {metrics.map((metric) => (
          <span key={metric.label}>{metric.label} {metric.value}</span>
        ))}
      </div>
      <div className="assembly-editor-statusbar-context">
        <span>{layerCount} {layerCount === 1 ? "layer" : "layers"}</span>
        {sceneSize ? <span>{sceneSize.width} x {sceneSize.height}</span> : null}
      </div>
    </footer>
  );
}

function editorStatusLabel(saveState: ReturnType<typeof useAssemblyWorkspaceController>["saveState"]) {
  if (saveState === "saving") {
    return "Saving changes";
  }
  if (saveState === "conflict") {
    return "Save conflict";
  }
  if (saveState === "failed") {
    return "Save failed";
  }
  return "All changes saved";
}

function placementStatusMetrics(
  placement: ReturnType<typeof useAssemblyWorkspaceController>["draft"]["placements"][number],
  emptySceneSize: NonNullable<ReturnType<typeof useAssemblyWorkspaceController>["draft"]["empty_scene_size"]>,
) {
  return [
    { label: "X", value: Math.round(placement.transform.cx * emptySceneSize.width) },
    { label: "Y", value: Math.round(placement.transform.cy * emptySceneSize.height) },
    { label: "W", value: Math.round(placement.transform.w * emptySceneSize.width) },
    { label: "H", value: Math.round(placement.transform.h * emptySceneSize.height) },
    { label: "R", value: `${Math.round(placement.transform.rotation_deg)}°` },
  ];
}
