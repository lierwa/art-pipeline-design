import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type PointerEvent } from "react";

import { CanvasStage } from "../../canvas/CanvasStage";
import { useCanvasViewport } from "../../canvas/useCanvasViewport";
import { isEditableShortcutTarget, isSpacePanShortcut } from "../../../app/keyboardShortcuts";
import type { Box, ElementSelectionMode, OverlayState, SourceMetadata } from "../../../domain/workspace";
import {
  buildAssemblyCanvasObjects,
  canvasBoxToPlacementTransform,
} from "../assembly/assemblyCanvasViewModel";
import {
  movePlacementLayer,
  projectManifestForSave,
  updatePlacementTransform,
  type AssemblyManifestDraft,
} from "../assembly/assemblyManifestDraft";
import { scenePackageMediaUrl } from "../scenePackageMedia";
import type { ChapterScenePackage } from "../types";
import {
  AssemblyPlacementContextMenu,
  type AssemblyPlacementContextMenuAction,
} from "./AssemblyPlacementContextMenu";
import {
  alignAssemblyPlacements,
  boxIntersectsSelection,
  canvasPointFromEvent,
  isFiniteCanvasPoint,
  nudgeAssemblyPlacements,
  readAssemblyAssetDragData,
  removeAssemblyPlacements,
} from "./assemblyCanvasControls";

export type AssemblyAuthoringCanvasControls = {
  align: (alignment: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom") => void;
  canAlign: boolean;
  isPanMode: boolean;
  zoomPercent: number;
  pan: () => void;
  select: () => void;
  fit: () => void;
  getViewportCenter: () => { x: number; y: number } | null;
  zoomIn: () => void;
  zoomOut: () => void;
};

type AssemblyAuthoringCanvasProps = {
  canRedo?: boolean;
  canSave?: boolean;
  canUndo?: boolean;
  draft: AssemblyManifestDraft;
  overlays: OverlayState;
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
  onUngroupSelectedLayers?: () => void;
  onUndo?: () => void;
};

const ASSEMBLY_CANVAS_CAPABILITIES = {
  canDraw: false,
  canSplit: false,
  canClickDetect: false,
  canCreateChild: false,
  canRenameObjects: false,
  canUseMissingMask: false,
} as const;

export function AssemblyAuthoringCanvas({
  canRedo = false,
  canSave = false,
  canUndo = false,
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
  onUngroupSelectedLayers,
  onUndo,
  overlays,
  scenePackage,
  selectedPlacementId,
  selectedPlacementIds = selectedPlacementId ? [selectedPlacementId] : [],
}: AssemblyAuthoringCanvasProps) {
  const viewport = useCanvasViewport();
  const viewportRef = useRef(viewport);
  const canvasRootRef = useRef<HTMLDivElement | null>(null);
  const disabledPipelineCommandRef = useRef(() => undefined);
  const marqueeRef = useRef<{
    pointerId: number;
    start: { x: number; y: number };
  } | null>(null);
  const lastDragPointRef = useRef<{ x: number; y: number } | null>(null);
  const [placementMenu, setPlacementMenu] = useState<{
    placementId: string;
    position: { x: number; y: number };
  } | null>(null);
  const [marqueeBox, setMarqueeBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [deleteRequest, setDeleteRequest] = useState<string[] | null>(null);
  viewportRef.current = viewport;

  const emptySceneImage = scenePackage.empty_scene_images.find((image) => image.id === draft.empty_scene_image_id) ?? null;
  const sceneSize = useMemo(
    () => draft.empty_scene_size ?? (
      emptySceneImage ? { width: emptySceneImage.width, height: emptySceneImage.height } : null
    ),
    [draft.empty_scene_size, emptySceneImage],
  );
  const emptySceneViewportKey = sceneSize
    ? `${draft.empty_scene_image_id ?? ""}:${sceneSize.width}x${sceneSize.height}`
    : null;
  const lastEmptySceneViewportKeyRef = useRef<string | null>(null);
  const canvasObjects = useMemo(
    () => buildAssemblyCanvasObjects({ draft, scenePackage, sceneSize }),
    [draft, scenePackage, sceneSize],
  );
  const source = useMemo<SourceMetadata | null>(() => {
    if (!emptySceneImage || !sceneSize) {
      return null;
    }
    return {
      filename: emptySceneImage.original_filename,
      path: emptySceneImage.storage_path,
      width: sceneSize.width,
      height: sceneSize.height,
    };
  }, [emptySceneImage, sceneSize]);
  const sourceUrl = emptySceneImage
    ? scenePackageMediaUrl(scenePackage.chapter_id, "empty_scene_images", emptySceneImage.id)
    : null;
  const controls = useMemo<AssemblyAuthoringCanvasControls>(() => ({
    isPanMode: viewport.isCanvasPanMode,
    align: handleAlign,
    canAlign: selectedPlacementIds.length >= 2,
    zoomPercent: viewport.canvasZoom,
    pan: () => viewportRef.current.togglePanMode(Boolean(source)),
    select: () => viewportRef.current.selectCanvasTool("select"),
    fit: () => viewportRef.current.fitCanvas(),
    getViewportCenter: () => getViewportCenter(canvasRootRef.current, sceneSize),
    zoomIn: () => viewportRef.current.zoomIn(),
    zoomOut: () => viewportRef.current.zoomOut(),
  }), [sceneSize, selectedPlacementIds.length, source, viewport.canvasZoom, viewport.isCanvasPanMode]);
  // WHY: Assembly 的 layer_order[0] 是 frontmost；多选/右键也必须遵守 manifest 层级语义，不能复用 pipeline 的面积优先命中。
  const assemblyHitTestStrategy = "front";
  const placementMenuActions = useMemo(
    () => resolvePlacementMenuActions({
      draft,
      menu: placementMenu,
      onClose: () => setPlacementMenu(null),
      onDraftChange,
      onRequestDelete: (placementId) => setDeleteRequest([placementId]),
      onSelectPlacement,
    }),
    [draft, onDraftChange, onSelectPlacement, placementMenu],
  );

  useEffect(() => {
    onEditorControlsChange?.(controls);
    return () => onEditorControlsChange?.(null);
  }, [controls, onEditorControlsChange]);
  useEffect(() => {
    if (!source || !emptySceneViewportKey || lastEmptySceneViewportKeyRef.current === emptySceneViewportKey) {
      return;
    }
    // WHY: Empty Scene identity/size changes replace the canvas coordinate system, so the viewport must
    // refit even after manual pan/zoom; this stays in view state and never enters manifest history/autosave.
    lastEmptySceneViewportKeyRef.current = emptySceneViewportKey;
    viewportRef.current.fitCanvas();
  }, [emptySceneViewportKey, source]);
  useAssemblyCanvasKeyboardShortcuts({
    canRedo,
    canSave,
    canUndo,
    hasSource: Boolean(source),
    onClearSelection: () => {
      setPlacementMenu(null);
      onSelectPlacement(null);
    },
    onCloseMenu: () => setPlacementMenu(null),
    onRedo,
    onSave,
    onSelectAllPlacements,
    onDeleteSelection: () => {
      if (selectedPlacementIds.length > 0) {
        setDeleteRequest(selectedPlacementIds);
      }
    },
    onGroupSelectedLayers,
    onNudgeSelection: (delta) => {
      if (!sceneSize || selectedPlacementIds.length === 0) {
        return;
      }
      onDraftChange(nudgeAssemblyPlacements(draft, selectedPlacementIds, sceneSize, delta));
    },
    onUngroupSelectedLayers,
    onUndo,
    selectedPlacementIds,
    viewport,
  });

  function handleSelectPlacement(placementId: string, mode?: ElementSelectionMode) {
    onSelectPlacement(placementId, mode);
  }

  function handleOpenPlacementContextMenu(placementId: string, position: { x: number; y: number }) {
    onSelectPlacement(placementId);
    setPlacementMenu({ placementId, position });
  }

  function handleBlankCanvasContextMenu(event: MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    setPlacementMenu(null);
  }

  function beginMarqueeSelection(
    event: MouseEvent<HTMLDivElement> | PointerEvent<HTMLDivElement>,
    pointerId: number,
  ) {
    if (marqueeRef.current) {
      return;
    }
    if (!source || !sceneSize || viewport.tool !== "select" || viewport.isCanvasPanMode || event.button !== 0) {
      return;
    }
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.closest(".canvas-drawing-surface")) {
      return;
    }
    const artboard = findArtboard();
    if (!artboard) {
      return;
    }
    const point = canvasPointFromEvent(event, artboard, sceneSize);
    if (findCanvasObjectAtPoint(point, canvasObjects)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    marqueeRef.current = { pointerId, start: point };
    setMarqueeBox({ x: point.x, y: point.y, w: 0, h: 0 });
  }

  function updateMarqueeSelection(event: MouseEvent<HTMLDivElement> | PointerEvent<HTMLDivElement>) {
    const marquee = marqueeRef.current;
    if (!marquee || !sceneSize) {
      return;
    }
    const artboard = findArtboard();
    if (!artboard) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const point = canvasPointFromEvent(event, artboard, sceneSize);
    setMarqueeBox(pointsToSelectionBox(marquee.start, point));
  }

  function finishMarqueeSelection(event: MouseEvent<HTMLDivElement> | PointerEvent<HTMLDivElement>) {
    const marquee = marqueeRef.current;
    if (!marquee || !sceneSize) {
      return;
    }
    const artboard = findArtboard();
    if (!artboard) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const point = canvasPointFromEvent(event, artboard, sceneSize);
    const selectionBox = pointsToSelectionBox(marquee.start, point);
    marqueeRef.current = null;
    setMarqueeBox(null);
    if (selectionBox.w < 4 && selectionBox.h < 4) {
      onSelectPlacement(null);
      return;
    }
    const selectedIds = canvasObjects
      .filter((object) => boxIntersectsSelection(selectionBox, object.box))
      .map((object) => object.id);
    if (onSelectPlacementIds) {
      onSelectPlacementIds(selectedIds);
    } else {
      selectCanvasPlacementIds(selectedIds, onSelectPlacement);
    }
  }

  function handleCanvasPointerDownCapture(event: PointerEvent<HTMLDivElement>) {
    beginMarqueeSelection(event, event.pointerId);
    if (marqueeRef.current?.pointerId === event.pointerId) {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
  }

  function handleCanvasPointerMoveCapture(event: PointerEvent<HTMLDivElement>) {
    updateMarqueeSelection(event);
  }

  function handleCanvasPointerUpCapture(event: PointerEvent<HTMLDivElement>) {
    finishMarqueeSelection(event);
  }

  function handleCanvasDragOver(event: DragEvent<HTMLDivElement>) {
    if (!readAssemblyAssetDragData(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (sceneSize) {
      const artboard = findArtboard();
      if (artboard) {
        const point = canvasPointFromEvent(event, artboard, sceneSize);
        if (isFiniteCanvasPoint(point)) {
          lastDragPointRef.current = point;
        }
      }
    }
  }

  function handleCanvasDrop(event: DragEvent<HTMLDivElement>) {
    const assetId = readAssemblyAssetDragData(event.dataTransfer);
    if (!assetId || !sceneSize || !onAddAsset) {
      return;
    }
    const artboard = findArtboard();
    if (!artboard) {
      return;
    }
    event.preventDefault();
    const dropPoint = canvasPointFromEvent(event, artboard, sceneSize);
    const point = isFiniteCanvasPoint(dropPoint)
      ? dropPoint
      : lastDragPointRef.current ?? getViewportCenter(canvasRootRef.current, sceneSize);
    lastDragPointRef.current = null;
    if (!isFiniteCanvasPoint(point)) {
      return;
    }
    void onAddAsset(assetId, point);
  }

  function handleBoxDraftChange(placementId: string, box: Box) {
    if (!sceneSize) {
      return;
    }
    onDraftChange(updatePlacementTransform(
      draft,
      placementId,
      canvasBoxToPlacementTransform({ ...box, rotationDeg: objectRotation(canvasObjects, placementId) }, sceneSize),
    ));
  }

  return (
    <div
      ref={canvasRootRef}
      className="assembly-authoring-canvas"
      onContextMenu={handleBlankCanvasContextMenu}
      onDragOver={handleCanvasDragOver}
      onDrop={handleCanvasDrop}
      onMouseDownCapture={(event) => beginMarqueeSelection(event, -1)}
      onMouseMoveCapture={updateMarqueeSelection}
      onMouseUpCapture={finishMarqueeSelection}
      onPointerDownCapture={handleCanvasPointerDownCapture}
      onPointerMoveCapture={handleCanvasPointerMoveCapture}
      onPointerUpCapture={handleCanvasPointerUpCapture}
      onPointerCancelCapture={() => {
        marqueeRef.current = null;
        setMarqueeBox(null);
      }}
    >
      <CanvasStage
        assetCacheKey={0}
        canvasObjects={canvasObjects}
        canCreateChildFromDraft={false}
        canDrawMissingMask={false}
        capabilities={ASSEMBLY_CANVAS_CAPABILITIES}
        draftRegion={null}
        editingElementId={selectedPlacementId}
        focusRequest={null}
        hasUnsavedBoxEdit={false}
        hitTestStrategy={assemblyHitTestStrategy}
        isPanMode={viewport.isCanvasPanMode}
        manualElementName=""
        mergePreview={null}
        missingMaskRegion={null}
        overlays={overlays}
        panOffset={viewport.canvasPan}
        renamingElementId={null}
        selectedElementId={selectedPlacementId}
        selectedElementIds={selectedPlacementIds}
        showHeader={false}
        source={source}
        sourceDetails=""
        sourceUrl={sourceUrl}
        splitRegions={[]}
        tool={viewport.tool}
        workspaceRunId={null}
        zoomPercent={viewport.canvasZoom}
        onAddSplitRegion={disabledPipelineCommandRef.current}
        onApplySplit={disabledPipelineCommandRef.current}
        onBoxDraftChange={handleBoxDraftChange}
        onBoxEditEnd={onBoxEditEnd}
        onBoxEditStart={onBoxEditStart}
        onCancelBoxEdit={disabledPipelineCommandRef.current}
        onCancelRenameElement={disabledPipelineCommandRef.current}
        onClearDrafts={disabledPipelineCommandRef.current}
        onClearSelection={() => {
          setPlacementMenu(null);
          onSelectPlacement(null);
        }}
        onCommitRenameElement={disabledPipelineCommandRef.current}
        onConfirmBoxEdit={disabledPipelineCommandRef.current}
        onCompleteMissingMaskRegion={disabledPipelineCommandRef.current}
        onCreateChildElement={disabledPipelineCommandRef.current}
        onCreateElement={disabledPipelineCommandRef.current}
        onDraftRegionChange={disabledPipelineCommandRef.current}
        onManualElementNameChange={disabledPipelineCommandRef.current}
        onMissingMaskRegionChange={disabledPipelineCommandRef.current}
        onOpenElementContextMenu={handleOpenPlacementContextMenu}
        onPanChange={viewport.panCanvas}
        onSelectElement={handleSelectPlacement}
        onStartRenameElement={disabledPipelineCommandRef.current}
        onZoomByGesture={(scaleDelta) => viewport.zoomByGesture(Boolean(source), scaleDelta)}
        onZoomByWheel={(deltaY) => viewport.zoomByWheel(Boolean(source), deltaY)}
      />
      {placementMenu ? (
        <AssemblyPlacementContextMenu
          actions={placementMenuActions}
          position={placementMenu.position}
          onClose={() => setPlacementMenu(null)}
        />
      ) : null}
      {marqueeBox && sceneSize ? <MarqueeOverlay box={marqueeBox} sceneSize={sceneSize} /> : null}
      <DeletePlacementsDialog
        placementIds={deleteRequest}
        onCancel={() => setDeleteRequest(null)}
        onConfirm={() => {
          if (deleteRequest) {
            onDraftChange(removeAssemblyPlacements(draft, deleteRequest));
            onSelectPlacement(null);
          }
          setDeleteRequest(null);
        }}
      />
    </div>
  );

  function findArtboard() {
    return canvasRootRef.current?.querySelector<HTMLElement>("[data-testid='canvas-artboard']") ?? null;
  }

  function handleAlign(alignment: Parameters<typeof alignAssemblyPlacements>[2]) {
    if (selectedPlacementIds.length < 2) {
      return;
    }
    onDraftChange(alignAssemblyPlacements(draft, selectedPlacementIds, alignment));
  }
}

function resolvePlacementMenuActions({
  draft,
  menu,
  onClose,
  onDraftChange,
  onRequestDelete,
  onSelectPlacement,
}: {
  draft: AssemblyManifestDraft;
  menu: { placementId: string } | null;
  onClose: () => void;
  onDraftChange: (draft: AssemblyManifestDraft) => void;
  onRequestDelete: (placementId: string) => void;
  onSelectPlacement: (placementId: string | null) => void;
}): AssemblyPlacementContextMenuAction[] {
  if (!menu) {
    return [];
  }

  const placementId = menu.placementId;
  const layerOrder = projectManifestForSave(draft).layer_order;
  const layerIndex = layerOrder.indexOf(placementId);
  if (layerIndex === -1) {
    return [];
  }

  function movePlacement(toIndex: number) {
    onDraftChange(movePlacementLayer(draft, placementId, toIndex));
    onSelectPlacement(placementId);
    onClose();
  }

  const actions: AssemblyPlacementContextMenuAction[] = [
    {
      id: "edit",
      label: "Edit placement",
      onSelect: () => {
        onSelectPlacement(placementId);
        onClose();
      },
    },
  ];

  // WHY: 菜单只渲染会真实改变 manifest 的 z-order 命令；边界位置不显示禁用项，
  // 避免把不可执行的占位动作误认为 Assembly 已接入完整命令系统。
  if (layerIndex > 0) {
    actions.push(
      { id: "bring-to-front", label: "Bring to front", onSelect: () => movePlacement(0) },
      { id: "move-forward", label: "Move forward", onSelect: () => movePlacement(layerIndex - 1) },
    );
  }
  if (layerIndex < layerOrder.length - 1) {
    actions.push(
      { id: "move-backward", label: "Move backward", onSelect: () => movePlacement(layerIndex + 1) },
      { id: "send-to-back", label: "Send to back", onSelect: () => movePlacement(layerOrder.length - 1) },
    );
  }
  actions.push({
    id: "remove",
    label: "Remove placement",
    tone: "danger",
    onSelect: () => {
      // WHY: 右键菜单和键盘 Delete 都是破坏性删除入口，必须复用同一确认边界；
      // 不能让某个 UI affordance 直接改 manifest 绕过作者确认。
      onSelectPlacement(placementId);
      onRequestDelete(placementId);
      onClose();
    },
  });

  return actions;
}

function objectRotation(
  canvasObjects: ReturnType<typeof buildAssemblyCanvasObjects>,
  placementId: string,
) {
  return canvasObjects.find((object) => object.id === placementId)?.box.rotationDeg ?? 0;
}

function findCanvasObjectAtPoint(
  point: { x: number; y: number },
  canvasObjects: ReturnType<typeof buildAssemblyCanvasObjects>,
) {
  return [...canvasObjects]
    .reverse()
    .find((object) => (
      point.x >= object.box.x
      && point.x <= object.box.x + object.box.w
      && point.y >= object.box.y
      && point.y <= object.box.y + object.box.h
    )) ?? null;
}

function pointsToSelectionBox(start: { x: number; y: number }, end: { x: number; y: number }) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    w: Math.abs(end.x - start.x),
    h: Math.abs(end.y - start.y),
  };
}

function selectCanvasPlacementIds(
  placementIds: string[],
  onSelectPlacement: (placementId: string | null, mode?: ElementSelectionMode) => void,
) {
  if (placementIds.length === 0) {
    onSelectPlacement(null);
    return;
  }
  onSelectPlacement(placementIds[0], "replace");
  placementIds.slice(1).forEach((placementId) => onSelectPlacement(placementId, "toggle"));
}

function getViewportCenter(root: HTMLDivElement | null, sceneSize: { width: number; height: number } | null) {
  if (!root || !sceneSize) {
    return null;
  }
  const artboard = root.querySelector<HTMLElement>("[data-testid='canvas-artboard']");
  const stage = root.querySelector<HTMLElement>(".canvas-stage");
  if (!artboard || !stage) {
    return { x: sceneSize.width / 2, y: sceneSize.height / 2 };
  }
  const stageRect = stage.getBoundingClientRect();
  const artboardRect = artboard.getBoundingClientRect();
  if (stageRect.width <= 0 || stageRect.height <= 0 || artboardRect.width <= 0 || artboardRect.height <= 0) {
    return { x: sceneSize.width / 2, y: sceneSize.height / 2 };
  }
  const clientX = stageRect.left + stageRect.width / 2;
  const clientY = stageRect.top + stageRect.height / 2;
  return canvasPointFromEvent({ clientX, clientY }, artboard, sceneSize);
}

function MarqueeOverlay({
  box,
  sceneSize,
}: {
  box: { x: number; y: number; w: number; h: number };
  sceneSize: { width: number; height: number };
}) {
  return (
    <div
      className="assembly-marquee"
      aria-hidden="true"
      style={{
        left: `${(box.x / sceneSize.width) * 100}%`,
        top: `${(box.y / sceneSize.height) * 100}%`,
        width: `${(box.w / sceneSize.width) * 100}%`,
        height: `${(box.h / sceneSize.height) * 100}%`,
      }}
    />
  );
}

function DeletePlacementsDialog({
  placementIds,
  onCancel,
  onConfirm,
}: {
  placementIds: string[] | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const count = placementIds?.length ?? 0;
  return (
    <AlertDialog.Root open={count > 0} onOpenChange={(open) => {
      if (!open) {
        onCancel();
      }
    }}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="confirm-dialog-overlay" data-confirm-dialog />
        <AlertDialog.Content className="confirm-dialog-content" data-confirm-dialog>
          <AlertDialog.Title className="confirm-dialog-title">
            {count === 1 ? "Delete selected placement?" : "Delete selected placements?"}
          </AlertDialog.Title>
          <AlertDialog.Description className="confirm-dialog-description">
            This removes the selected placement layers, group membership, and dependency references.
          </AlertDialog.Description>
          <div className="confirm-dialog-actions">
            <AlertDialog.Cancel className="confirm-dialog-cancel">Cancel</AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button type="button" className="confirm-dialog-danger" onClick={onConfirm}>
                {count === 1 ? "Confirm delete placement" : "Confirm delete placements"}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

function useAssemblyCanvasKeyboardShortcuts({
  canRedo,
  canSave,
  canUndo,
  hasSource,
  onClearSelection,
  onCloseMenu,
  onRedo,
  onSave,
  onDeleteSelection,
  onGroupSelectedLayers,
  onNudgeSelection,
  onSelectAllPlacements,
  onUngroupSelectedLayers,
  onUndo,
  selectedPlacementIds,
  viewport,
}: {
  canRedo: boolean;
  canSave: boolean;
  canUndo: boolean;
  hasSource: boolean;
  onClearSelection: () => void;
  onCloseMenu: () => void;
  onRedo?: () => void;
  onSave?: () => Promise<void>;
  onDeleteSelection: () => void;
  onGroupSelectedLayers?: () => void;
  onNudgeSelection: (delta: { x: number; y: number }) => void;
  onSelectAllPlacements?: () => void;
  onUngroupSelectedLayers?: () => void;
  onUndo?: () => void;
  selectedPlacementIds: string[];
  viewport: ReturnType<typeof useCanvasViewport>;
}) {
  useEffect(() => {
    function handleGlobalKeyDown(event: globalThis.KeyboardEvent) {
      if (isEditableShortcutTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const hasSystemModifier = event.ctrlKey || event.metaKey;

      if (isSpacePanShortcut(event) && viewport.beginTemporaryPan(hasSource)) {
        event.preventDefault();
        return;
      }

      if (hasSystemModifier && key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          if (canRedo) {
            onRedo?.();
          }
          return;
        }
        if (canUndo) {
          onUndo?.();
        }
        return;
      }

      if (hasSystemModifier && key === "y") {
        event.preventDefault();
        if (canRedo) {
          onRedo?.();
        }
        return;
      }

      if (hasSystemModifier && key === "s") {
        event.preventDefault();
        if (canSave) {
          void onSave?.();
        }
        return;
      }

      if (hasSystemModifier && key === "a") {
        event.preventDefault();
        onSelectAllPlacements?.();
        return;
      }

      if (hasSystemModifier && key === "g") {
        event.preventDefault();
        if (event.shiftKey) {
          onUngroupSelectedLayers?.();
        } else {
          onGroupSelectedLayers?.();
        }
        return;
      }

      if (hasSystemModifier) {
        return;
      }

      if (key === "delete" || key === "backspace") {
        if (selectedPlacementIds.length > 0) {
          event.preventDefault();
          onDeleteSelection();
        }
        return;
      }

      if (event.key.startsWith("Arrow")) {
        const delta = arrowKeyDelta(event.key, event.shiftKey ? 10 : 1);
        if (delta && selectedPlacementIds.length > 0) {
          event.preventDefault();
          onNudgeSelection(delta);
        }
        return;
      }

      if (key === "escape") {
        event.preventDefault();
        onCloseMenu();
        viewport.endTemporaryPan();
        viewport.selectCanvasTool("select");
        onClearSelection();
        return;
      }

      if (key === "q") {
        event.preventDefault();
        viewport.selectCanvasTool("select");
        return;
      }

      if (key === "r" && hasSource) {
        event.preventDefault();
        viewport.togglePanMode(true);
        return;
      }

      if (key === "+" || key === "=") {
        event.preventDefault();
        viewport.zoomIn();
        return;
      }

      if (key === "-") {
        event.preventDefault();
        viewport.zoomOut();
        return;
      }

      if (key === "0") {
        event.preventDefault();
        viewport.fitCanvas();
      }
    }

    function handleGlobalKeyUp(event: globalThis.KeyboardEvent) {
      if (isEditableShortcutTarget(event.target)) {
        return;
      }
      if (isSpacePanShortcut(event)) {
        event.preventDefault();
        viewport.endTemporaryPan();
      }
    }

    window.addEventListener("keydown", handleGlobalKeyDown);
    window.addEventListener("keyup", handleGlobalKeyUp);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
      window.removeEventListener("keyup", handleGlobalKeyUp);
    };
  }, [
    canRedo,
    canSave,
    canUndo,
    hasSource,
    onClearSelection,
    onCloseMenu,
    onRedo,
    onSave,
    onDeleteSelection,
    onGroupSelectedLayers,
    onNudgeSelection,
    onSelectAllPlacements,
    onUngroupSelectedLayers,
    onUndo,
    selectedPlacementIds,
    viewport,
  ]);

  useEffect(() => {
    window.addEventListener("blur", viewport.endTemporaryPan);
    return () => window.removeEventListener("blur", viewport.endTemporaryPan);
  }, [viewport.endTemporaryPan]);
}

function arrowKeyDelta(key: string, step: number) {
  if (key === "ArrowLeft") {
    return { x: -step, y: 0 };
  }
  if (key === "ArrowRight") {
    return { x: step, y: 0 };
  }
  if (key === "ArrowUp") {
    return { x: 0, y: -step };
  }
  if (key === "ArrowDown") {
    return { x: 0, y: step };
  }
  return null;
}
