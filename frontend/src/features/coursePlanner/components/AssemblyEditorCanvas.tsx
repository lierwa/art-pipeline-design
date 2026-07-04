import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { ImageOff, Redo2, ScanSearch, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { Tldraw, type Editor, useEditor, useReactor } from "tldraw";
// WHY: tldraw 只是摆放编辑器的 authoring 边界实现，但它的交互壳依赖官方样式；
// 样式必须跟 editor 入口一起加载，避免全局页面误以为自己拥有 canvas 内部 UI。
import "tldraw/tldraw.css";

import type { AssemblyManifestDraft } from "../assembly/assemblyManifestDraft";
import {
  buildTldrawAssemblySnapshot,
  isAssemblyManagedAssetId,
  isAssemblyManagedShapeId,
  isTrustedAssemblyBackgroundShape,
  normalizePlacementShapeForProjection,
  projectManifestChangesFromCanvas,
  readPlacementIdFromShape,
  selectionShapeIdForPlacement,
} from "../assembly/tldrawAssemblyAdapter";
import type { ChapterScenePackage } from "../types";

type AssemblyEditorCanvasProps = {
  draft: AssemblyManifestDraft;
  scenePackage: ChapterScenePackage;
  selectedPlacementId: string | null;
  onDraftChange: (draft: AssemblyManifestDraft) => void;
  onSelectPlacement: (placementId: string | null) => void;
};

export type AssemblyEditorShapeLike = {
  id: string;
  x: number;
  y: number;
  rotation: number;
  isLocked?: boolean;
  props: { assetId?: string; w?: number; h?: number };
  meta?: { kind?: string; source?: string; placementId?: string };
};

type AssemblyEditorLike = Pick<Editor,
  | "createAssets"
  | "createShapes"
  | "deleteAssets"
  | "deleteShapes"
  | "getAssets"
  | "getCurrentPageShapes"
  | "getCurrentPageShapesSorted"
  | "getSelectedShapeIds"
  | "getSelectedShapes"
  | "run"
  | "select"
  | "selectNone"
  | "zoomToBounds">;

type AssemblyCameraFitState = {
  hasFittedInitialScene: boolean;
  lastFittedEmptySceneImageId: string | null;
};

export function AssemblyEditorCanvas({
  draft,
  onDraftChange,
  onSelectPlacement,
  scenePackage,
  selectedPlacementId,
}: AssemblyEditorCanvasProps) {
  const emptySceneImage = scenePackage.empty_scene_images.find((image) => image.id === draft.empty_scene_image_id) ?? null;
  const editorRef = useRef<Editor | null>(null);
  const isApplyingSnapshotRef = useRef(false);
  const cameraFitStateRef = useRef<AssemblyCameraFitState>({
    hasFittedInitialScene: false,
    lastFittedEmptySceneImageId: null,
  });

  const snapshot = useMemo(() => buildTldrawAssemblySnapshot({ draft, scenePackage }), [draft, scenePackage]);

  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor;
    editor.setCurrentTool("select");
    applySnapshotToEditor(editor, snapshot, isApplyingSnapshotRef, cameraFitStateRef);
    syncSelectionToEditor(editor, selectedPlacementId);
  }, [selectedPlacementId, snapshot]);

  useEffect(() => {
    return () => {
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!editorRef.current) {
      return;
    }
    applySnapshotToEditor(editorRef.current, snapshot, isApplyingSnapshotRef, cameraFitStateRef);
  }, [snapshot]);

  useEffect(() => {
    if (!editorRef.current) {
      return;
    }
    syncSelectionToEditor(editorRef.current, selectedPlacementId);
  }, [selectedPlacementId]);

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
    <section className="assembly-editor-stage" aria-label="Assembly canvas">
      <div className="assembly-editor-toolbar" role="toolbar" aria-label="Assembly canvas controls">
        <button
          type="button"
          className="course-planner-secondary-action chapter-studio-icon-action"
          onClick={() => editorRef.current?.undo()}
          aria-label="Undo"
        >
          <Undo2 size={16} aria-hidden="true" />
          <span>Undo</span>
        </button>
        <button
          type="button"
          className="course-planner-secondary-action chapter-studio-icon-action"
          onClick={() => editorRef.current?.redo()}
          aria-label="Redo"
        >
          <Redo2 size={16} aria-hidden="true" />
          <span>Redo</span>
        </button>
        <button
          type="button"
          className="course-planner-secondary-action chapter-studio-icon-action"
          onClick={() => editorRef.current?.zoomToBounds(snapshot.fitBounds, { inset: 48 })}
          aria-label="Fit"
        >
          <ScanSearch size={16} aria-hidden="true" />
          <span>Fit</span>
        </button>
        <button
          type="button"
          className="course-planner-secondary-action chapter-studio-icon-action"
          onClick={() => editorRef.current?.zoomIn()}
          aria-label="Zoom in"
        >
          <ZoomIn size={16} aria-hidden="true" />
          <span>Zoom in</span>
        </button>
        <button
          type="button"
          className="course-planner-secondary-action chapter-studio-icon-action"
          onClick={() => editorRef.current?.zoomOut()}
          aria-label="Zoom out"
        >
          <ZoomOut size={16} aria-hidden="true" />
          <span>Zoom out</span>
        </button>
      </div>
      <div
        className="assembly-editor-artboard assembly-editor-tldraw"
        style={{ aspectRatio: `${emptySceneImage.width} / ${emptySceneImage.height}` }}
      >
        <Tldraw autoFocus={false} hideUi onMount={handleMount}>
          <AssemblyEditorBridge
            draft={draft}
            emptySceneSize={{ width: emptySceneImage.width, height: emptySceneImage.height }}
            isApplyingSnapshotRef={isApplyingSnapshotRef}
            onDraftChange={onDraftChange}
            onSelectPlacement={onSelectPlacement}
          />
        </Tldraw>
      </div>
    </section>
  );
}

type AssemblyEditorBridgeProps = {
  draft: AssemblyManifestDraft;
  emptySceneSize: { width: number; height: number };
  isApplyingSnapshotRef: MutableRefObject<boolean>;
  onDraftChange: (draft: AssemblyManifestDraft) => void;
  onSelectPlacement: (placementId: string | null) => void;
};

function AssemblyEditorBridge({
  draft,
  emptySceneSize,
  isApplyingSnapshotRef,
  onDraftChange,
  onSelectPlacement,
}: AssemblyEditorBridgeProps) {
  const editor = useEditor();

  useReactor("assembly-editor-selection", () => {
    if (isApplyingSnapshotRef.current) {
      return;
    }
    const selectionState = readPlacementSelectionState(editor);
    if (selectionState.shouldClearSelection) {
      editor.selectNone();
    }
    onSelectPlacement(selectionState.placementId);
  }, [editor, isApplyingSnapshotRef, onSelectPlacement]);

  useReactor("assembly-editor-projection", () => {
    if (isApplyingSnapshotRef.current) {
      return;
    }
    const shapesInZOrder = editor.getCurrentPageShapesSorted()
      .map((shape) => normalizePlacementShapeForProjection(shape as unknown as AssemblyEditorShapeLike))
      .filter((shape): shape is NonNullable<typeof shape> => Boolean(shape));

    const projected = projectManifestChangesFromCanvas({
      draft,
      shapesInZOrder,
      emptySceneSize,
    });
    if (sameProjection(draft, projected)) {
      return;
    }
    onDraftChange({
      ...draft,
      placements: projected.placements,
      layer_order: projected.layer_order,
    });
  }, [draft, editor, emptySceneSize, isApplyingSnapshotRef, onDraftChange]);

  return null;
}

export function createAssemblyCameraFitState(): MutableRefObject<AssemblyCameraFitState> {
  return {
    current: {
      hasFittedInitialScene: false,
      lastFittedEmptySceneImageId: null,
    },
  };
}

export function readPlacementSelectionState(
  editor: Pick<AssemblyEditorLike, "getSelectedShapes">,
): { placementId: string | null; shouldClearSelection: boolean } {
  const selectedShapes = editor.getSelectedShapes().map((shape) => shape as unknown as AssemblyEditorShapeLike);
  const placementShape = selectedShapes.find((shape) => Boolean(readPlacementIdFromShape(shape)));
  if (placementShape) {
    return {
      placementId: readPlacementIdFromShape(placementShape),
      shouldClearSelection: false,
    };
  }
  return {
    placementId: null,
    // WHY: jsdom 里无法可靠证明 tldraw 原生 hit-test/lock 行为；这里在 bridge 边界主动清掉背景选中，
    // 保证业务层永远不会把 Empty Scene 当作可选 placement。
    shouldClearSelection: selectedShapes.some((shape) => isTrustedAssemblyBackgroundShape(shape)),
  };
}

export function syncSelectionToEditor(
  editor: Pick<AssemblyEditorLike, "getSelectedShapeIds" | "select" | "selectNone">,
  selectedPlacementId: string | null,
) {
  const expectedSelection = selectedPlacementId ? selectionShapeIdForPlacement(selectedPlacementId) : null;
  const currentSelection = [...editor.getSelectedShapeIds()].map(String)[0] ?? null;
  if (currentSelection === expectedSelection) {
    return;
  }
  if (expectedSelection) {
    editor.select(expectedSelection as never);
    return;
  }
  editor.selectNone();
}

export function applySnapshotToEditor(
  editor: AssemblyEditorLike,
  snapshot: ReturnType<typeof buildTldrawAssemblySnapshot>,
  isApplyingSnapshotRef: MutableRefObject<boolean>,
  cameraFitStateRef: MutableRefObject<AssemblyCameraFitState>,
) {
  if (snapshotAlreadyApplied(editor, snapshot)) {
    return;
  }

  const emptySceneImageId = snapshot.backgroundAsset.meta.sourceId;
  const shouldFitCamera = !cameraFitStateRef.current.hasFittedInitialScene
    || cameraFitStateRef.current.lastFittedEmptySceneImageId !== emptySceneImageId;

  isApplyingSnapshotRef.current = true;
  editor.run(() => {
    const currentShapeIds = editor.getCurrentPageShapes()
      .map((shape) => String(shape.id))
      .filter((shapeId) => isAssemblyManagedShapeId(shapeId));
    if (currentShapeIds.length > 0) {
      editor.deleteShapes(currentShapeIds as never);
    }

    const currentAssetIds = editor.getAssets()
      .map((asset) => String(asset.id))
      .filter((assetId) => isAssemblyManagedAssetId(assetId));
    if (currentAssetIds.length > 0) {
      editor.deleteAssets(currentAssetIds as never);
    }

    editor.createAssets([snapshot.backgroundAsset, ...snapshot.assetRecords] as never);
    editor.createShapes([
      snapshot.backgroundShape,
      ...[...snapshot.placementShapes].reverse(),
    ] as never);

    if (shouldFitCamera) {
      editor.zoomToBounds(snapshot.fitBounds, { inset: 48 });
    }
  }, { history: "ignore", ignoreShapeLock: true });

  if (shouldFitCamera) {
    cameraFitStateRef.current = {
      hasFittedInitialScene: true,
      lastFittedEmptySceneImageId: emptySceneImageId,
    };
  }

  requestAnimationFrame(() => {
    isApplyingSnapshotRef.current = false;
  });
}

function snapshotAlreadyApplied(
  editor: AssemblyEditorLike,
  snapshot: ReturnType<typeof buildTldrawAssemblySnapshot>,
) {
  const currentShapes = editor.getCurrentPageShapes()
    .map((shape) => shape as unknown as {
      id: string;
      x: number;
      y: number;
      rotation: number;
      isLocked?: boolean;
      props: { assetId?: string; w?: number; h?: number };
    })
    .filter((shape) => isAssemblyManagedShapeId(shape.id));
  const expectedShapes = [snapshot.backgroundShape, ...snapshot.placementShapes];

  if (currentShapes.length !== expectedShapes.length) {
    return false;
  }

  const currentAssets = editor.getAssets()
    .map((asset) => asset as unknown as { id: string; props: { src?: string } })
    .filter((asset) => isAssemblyManagedAssetId(asset.id));
  const expectedAssets = [snapshot.backgroundAsset, ...snapshot.assetRecords];
  if (currentAssets.length !== expectedAssets.length) {
    return false;
  }

  const currentShapeById = new Map(currentShapes.map((shape) => [shape.id, shape]));
  for (const shape of expectedShapes) {
    const currentShape = currentShapeById.get(shape.id);
    if (!currentShape) {
      return false;
    }
    if (
      currentShape.x !== shape.x ||
      currentShape.y !== shape.y ||
      currentShape.rotation !== shape.rotation ||
      currentShape.props.assetId !== shape.props.assetId ||
      currentShape.props.w !== shape.props.w ||
      currentShape.props.h !== shape.props.h ||
      Boolean(currentShape.isLocked) !== Boolean(shape.isLocked)
    ) {
      return false;
    }
  }

  const currentAssetById = new Map(currentAssets.map((asset) => [asset.id, asset]));
  for (const asset of expectedAssets) {
    if (currentAssetById.get(asset.id)?.props.src !== asset.props.src) {
      return false;
    }
  }

  return true;
}

function sameProjection(
  draft: AssemblyManifestDraft,
  projected: Pick<AssemblyManifestDraft, "placements" | "layer_order">,
) {
  return JSON.stringify(draft.placements) === JSON.stringify(projected.placements) &&
    JSON.stringify(draft.layer_order) === JSON.stringify(projected.layer_order);
}
