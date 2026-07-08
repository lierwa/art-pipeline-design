import * as Tooltip from "@radix-ui/react-tooltip";
import {
  Hand,
  ImageOff,
  Maximize2,
  MousePointer2,
  Redo2,
  Save,
  Tags,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { IconButton } from "../../../shared/ui/IconButton";
import type { ElementSelectionMode, OverlayState } from "../../../domain/workspace";
import type { AssemblyManifestDraft } from "../assembly/assemblyManifestDraft";
import type { AsyncOperationState, ChapterScenePackage } from "../types";
import {
  AssemblyAuthoringCanvas,
  type AssemblyAuthoringCanvasControls,
} from "./AssemblyAuthoringCanvas";

type AssemblyEditorCanvasProps = {
  actionLabel?: string;
  canRedo?: boolean;
  canTriggerSave?: boolean;
  canUndo?: boolean;
  canvasControls?: AssemblyAuthoringCanvasControls | null;
  canvasOverlays?: OverlayState;
  draft: AssemblyManifestDraft;
  hiddenPlacementIds?: ReadonlySet<string>;
  saveStatus?: AsyncOperationState;
  scenePackage: ChapterScenePackage;
  selectedLayerNodeIds?: string[];
  selectedPlacementId: string | null;
  selectedPlacementIds?: string[];
  onAddAsset?: (assetId: string, center?: { x: number; y: number }) => Promise<void> | void;
  onBoxEditEnd?: (placementId: string) => void;
  onBoxEditStart?: (placementId: string) => void;
  onDraftChange: (draft: AssemblyManifestDraft) => void;
  onEditorControlsChange?: (controls: AssemblyAuthoringCanvasControls | null) => void;
  onGroupSelectedLayers?: () => void;
  onRedo?: () => void;
  onSave?: () => Promise<void>;
  onSelectAllPlacements?: () => void;
  onSelectPlacement: (placementId: string | null, mode?: ElementSelectionMode) => void;
  onSelectPlacementIds?: (placementIds: string[]) => void;
  onToggleCanvasOverlay?: (key: "showBoxes" | "showNames") => void;
  onUngroupSelectedLayers?: () => void;
  onUndo?: () => void;
};

export function AssemblyEditorCanvas({
  actionLabel = "Save",
  canRedo = false,
  canTriggerSave = false,
  canUndo = false,
  canvasControls,
  canvasOverlays = DEFAULT_ASSEMBLY_CANVAS_OVERLAYS,
  draft,
  hiddenPlacementIds,
  onAddAsset,
  onBoxEditEnd,
  onBoxEditStart,
  onDraftChange,
  onEditorControlsChange,
  onGroupSelectedLayers,
  onRedo,
  onSave,
  onSelectAllPlacements,
  onSelectPlacement,
  onSelectPlacementIds,
  onToggleCanvasOverlay,
  onUngroupSelectedLayers,
  onUndo,
  saveStatus,
  scenePackage,
  selectedLayerNodeIds,
  selectedPlacementId,
  selectedPlacementIds,
}: AssemblyEditorCanvasProps) {
  const [localCanvasControls, setLocalCanvasControls] = useState<AssemblyAuthoringCanvasControls | null>(null);
  const emptySceneImage = scenePackage.empty_scene_images.find((image) => image.id === draft.empty_scene_image_id) ?? null;
  const resolvedCanvasControls = canvasControls ?? localCanvasControls;
  const renderedCanvasOverlays: OverlayState = {
    ...canvasOverlays,
    showBoxes: false,
  };

  function handleEditorControlsChange(controls: AssemblyAuthoringCanvasControls | null) {
    setLocalCanvasControls(controls);
    onEditorControlsChange?.(controls);
  }

  if (!emptySceneImage) {
    return (
      <section className="assembly-editor-empty-state" aria-label="Assembly editor empty state">
        <ImageOff size={18} aria-hidden="true" />
        <div>
          <strong>Select an Empty Scene Image to start the Assembly editor.</strong>
          <p>The editor uses the selected Empty Scene as the locked background and placement coordinate system.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="assembly-editor-stage canvas-workspace" aria-label="Assembly canvas" style={{ minHeight: "0px" }}>
      <h2 className="visually-hidden">Canvas</h2>
      <AssemblyCanvasToolbar
        actionLabel={actionLabel}
        canRedo={canRedo}
        canTriggerSave={canTriggerSave && Boolean(onSave)}
        canUndo={canUndo}
        controls={resolvedCanvasControls}
        overlays={renderedCanvasOverlays}
        canvasSizeLabel={formatCanvasSize({ width: emptySceneImage.width, height: emptySceneImage.height })}
        saveStatus={saveStatus}
        onRedo={onRedo}
        onSave={onSave}
        onToggleOverlay={onToggleCanvasOverlay}
        onUndo={onUndo}
      />
      <div
        className="assembly-editor-canvas-body canvas-stage-shell"
        data-testid="assembly-editor-canvas-body"
        style={{ height: "100%", minHeight: "0px" }}
      >
        <AssemblyAuthoringCanvas
          draft={draft}
          hiddenPlacementIds={hiddenPlacementIds}
          overlays={renderedCanvasOverlays}
          scenePackage={scenePackage}
          selectedLayerNodeIds={selectedLayerNodeIds}
          selectedPlacementId={selectedPlacementId}
          selectedPlacementIds={selectedPlacementIds}
          onAddAsset={onAddAsset}
          onBoxEditEnd={onBoxEditEnd}
          onBoxEditStart={onBoxEditStart}
          onDraftChange={onDraftChange}
          onEditorControlsChange={handleEditorControlsChange}
          onGroupSelectedLayers={onGroupSelectedLayers}
          onRedo={onRedo}
          onSave={onSave}
          onSelectAllPlacements={onSelectAllPlacements}
          onSelectPlacement={onSelectPlacement}
          onSelectPlacementIds={onSelectPlacementIds}
          onUngroupSelectedLayers={onUngroupSelectedLayers}
          onUndo={onUndo}
          canRedo={canRedo}
          canSave={canTriggerSave && Boolean(onSave)}
          canUndo={canUndo}
        />
      </div>
    </section>
  );
}

function AssemblyCanvasToolbar({
  actionLabel,
  canRedo,
  canTriggerSave,
  canUndo,
  canvasSizeLabel,
  controls,
  overlays,
  saveStatus,
  onRedo,
  onSave,
  onToggleOverlay,
  onUndo,
}: {
  actionLabel: string;
  canRedo: boolean;
  canTriggerSave: boolean;
  canUndo: boolean;
  canvasSizeLabel: string;
  controls: AssemblyAuthoringCanvasControls | null;
  overlays: OverlayState;
  saveStatus?: AsyncOperationState;
  onRedo?: () => void;
  onSave?: () => Promise<void>;
  onToggleOverlay?: (key: "showBoxes" | "showNames") => void;
  onUndo?: () => void;
}) {
  const zoomPercent = Math.round(controls?.zoomPercent ?? 100);
  const hasCanvasControls = Boolean(controls);

  return (
    <Tooltip.Provider delayDuration={250}>
      <div className="canvas-toolbar assembly-canvas-toolbar" role="toolbar" aria-label="Canvas tools">
        <div className="canvas-tool-group" aria-label="Assembly editing tools">
          <IconButton
            label="Select"
            aria-label="Select"
            aria-pressed={hasCanvasControls && !controls?.isPanMode}
            icon={<MousePointer2 size={16} strokeWidth={2.2} />}
            isActive={hasCanvasControls && !controls?.isPanMode}
            disabled={!controls}
            onClick={controls?.select}
          />
          <IconButton
            label="Pan canvas"
            aria-label="Pan canvas"
            aria-pressed={Boolean(controls?.isPanMode)}
            icon={<Hand size={16} strokeWidth={2.2} />}
            isActive={Boolean(controls?.isPanMode)}
            disabled={!controls}
            onClick={controls?.pan}
          />
        </div>

        <div className="canvas-history-controls" aria-label="History controls">
          <IconButton
            label="Undo"
            icon={<Undo2 size={16} strokeWidth={2.2} />}
            disabled={!canUndo || !onUndo}
            onClick={onUndo}
          />
          <IconButton
            label="Redo"
            icon={<Redo2 size={16} strokeWidth={2.2} />}
            disabled={!canRedo || !onRedo}
            onClick={onRedo}
          />
        </div>

        <div className="zoom-controls" aria-label="Zoom controls">
          <IconButton
            label="Zoom out"
            icon={<ZoomOut size={16} strokeWidth={2.2} />}
            disabled={!controls || zoomPercent <= 40}
            onClick={controls?.zoomOut}
          />
          <span>{zoomPercent}%</span>
          <IconButton
            label="Zoom in"
            icon={<ZoomIn size={16} strokeWidth={2.2} />}
            disabled={!controls || zoomPercent >= 200}
            onClick={controls?.zoomIn}
          />
          <IconButton
            label="Fit canvas"
            icon={<Maximize2 size={16} strokeWidth={2.2} />}
            disabled={!controls}
            onClick={controls?.fit}
          />
        </div>

        <div className="canvas-overlay-switches" aria-label="Canvas overlays">
          <OverlayToggle
            checked={overlays.showNames}
            icon={<Tags size={16} strokeWidth={2.2} />}
            label="Show names"
            onChange={() => onToggleOverlay?.("showNames")}
          />
        </div>

        <div className="canvas-draft-actions assembly-canvas-actions">
          <span className="assembly-canvas-size-label">{canvasSizeLabel}</span>
          <IconButton
            label={saveButtonLabel(actionLabel, saveStatus)}
            aria-label={saveButtonLabel(actionLabel, saveStatus)}
            icon={<Save size={16} strokeWidth={2.2} />}
            disabled={!canTriggerSave || !onSave || saveStatus?.status === "pending"}
            onClick={() => void onSave?.()}
          />
        </div>
      </div>
    </Tooltip.Provider>
  );
}

function OverlayToggle({
  checked,
  icon,
  label,
  onChange,
}: {
  checked: boolean;
  icon: ReactNode;
  label: string;
  onChange: () => void;
}) {
  return (
    <label className="panel-checkbox overlay-toggle">
      <input
        aria-label={label}
        checked={checked}
        type="checkbox"
        onChange={onChange}
      />
      <span className="shared-icon-button-icon" aria-hidden="true">{icon}</span>
      <span className="visually-hidden">{label}</span>
    </label>
  );
}

function formatCanvasSize(size: { width: number; height: number }) {
  return `${size.width} x ${size.height}`;
}

const DEFAULT_ASSEMBLY_CANVAS_OVERLAYS: OverlayState = {
  showBoxes: false,
  showMasks: false,
  showNames: true,
  showRejected: false,
  showThumbs: true,
};

function saveButtonLabel(actionLabel: string, saveStatus?: AsyncOperationState) {
  if (saveStatus?.status === "pending") {
    return "Saving";
  }
  if (actionLabel.toLowerCase().includes("retry")) {
    return "Retry";
  }
  return "Save";
}
