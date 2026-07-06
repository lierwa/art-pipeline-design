import * as Tooltip from "@radix-ui/react-tooltip";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  Hand,
  ImageOff,
  Maximize2,
  MousePointer2,
  Redo2,
  Save,
  SquareDashed,
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
  saveStatus?: AsyncOperationState;
  scenePackage: ChapterScenePackage;
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
  actionLabel = "Save Assembly",
  canRedo = false,
  canTriggerSave = false,
  canUndo = false,
  canvasControls,
  canvasOverlays = DEFAULT_ASSEMBLY_CANVAS_OVERLAYS,
  draft,
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
  selectedPlacementId,
  selectedPlacementIds,
}: AssemblyEditorCanvasProps) {
  const [localCanvasControls, setLocalCanvasControls] = useState<AssemblyAuthoringCanvasControls | null>(null);
  const emptySceneImage = scenePackage.empty_scene_images.find((image) => image.id === draft.empty_scene_image_id) ?? null;
  const resolvedCanvasControls = canvasControls ?? localCanvasControls;

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
        overlays={canvasOverlays}
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
          overlays={canvasOverlays}
          scenePackage={scenePackage}
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

        <div className="canvas-tool-group" aria-label="Alignment controls">
          <IconButton
            label="Align left"
            icon={<AlignStartVertical size={16} strokeWidth={2.2} />}
            disabled={!controls?.canAlign}
            onClick={() => controls?.align("left")}
          />
          <IconButton
            label="Align horizontal center"
            icon={<AlignCenterVertical size={16} strokeWidth={2.2} />}
            disabled={!controls?.canAlign}
            onClick={() => controls?.align("hcenter")}
          />
          <IconButton
            label="Align right"
            icon={<AlignEndVertical size={16} strokeWidth={2.2} />}
            disabled={!controls?.canAlign}
            onClick={() => controls?.align("right")}
          />
          <IconButton
            label="Align top"
            icon={<AlignStartHorizontal size={16} strokeWidth={2.2} />}
            disabled={!controls?.canAlign}
            onClick={() => controls?.align("top")}
          />
          <IconButton
            label="Align vertical middle"
            icon={<AlignCenterHorizontal size={16} strokeWidth={2.2} />}
            disabled={!controls?.canAlign}
            onClick={() => controls?.align("vcenter")}
          />
          <IconButton
            label="Align bottom"
            icon={<AlignEndHorizontal size={16} strokeWidth={2.2} />}
            disabled={!controls?.canAlign}
            onClick={() => controls?.align("bottom")}
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
            checked={overlays.showBoxes}
            icon={<SquareDashed size={16} strokeWidth={2.2} />}
            label="Show boxes"
            onChange={() => onToggleOverlay?.("showBoxes")}
          />
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
            label={saveStatus?.status === "pending" ? "Saving Assembly" : actionLabel}
            aria-label={saveStatus?.status === "pending" ? "Saving Assembly" : actionLabel}
            icon={<Save size={16} strokeWidth={2.2} />}
            showLabel
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
  showBoxes: true,
  showMasks: false,
  showNames: true,
  showRejected: false,
  showThumbs: true,
};
