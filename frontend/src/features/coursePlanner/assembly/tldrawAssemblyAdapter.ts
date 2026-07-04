import type { AssemblyManifestDraft } from "./assemblyManifestDraft";
import { scenePackageMediaUrl } from "../scenePackageMedia";
import type { ChapterSceneAssemblyTransform, ChapterScenePackage } from "../types";

type CanvasSize = { width: number; height: number };
const ASSEMBLY_SHAPE_ID_PREFIX = "shape:assembly:";
const ASSEMBLY_ASSET_ID_PREFIX = "asset:assembly:";
const ASSEMBLY_META_SOURCE = "assembly-editor";

export type AssemblyTldrawAssetRecord = {
  id: string;
  typeName: "asset";
  type: "image";
  props: {
    name: string;
    src: string;
    w: number;
    h: number;
    mimeType: string;
    isAnimated: boolean;
  };
  meta: {
    kind: "empty-scene" | "chapter-asset";
    sourceId: string;
  };
};

type AssemblyShapeMeta =
  | { kind: "background"; source: typeof ASSEMBLY_META_SOURCE }
  | { kind: "placement"; source: typeof ASSEMBLY_META_SOURCE; placementId: string }
  | { kind: "foreign"; source?: string; placementId?: string };

export type AssemblyTldrawImageShape = {
  id: string;
  type: "image";
  x: number;
  y: number;
  rotation: number;
  isLocked?: boolean;
  opacity?: number;
  props: {
    assetId: string;
    w: number;
    h: number;
  };
  meta: AssemblyShapeMeta;
};

export type TldrawAssemblySnapshot = {
  backgroundAsset: AssemblyTldrawAssetRecord;
  backgroundShape: AssemblyTldrawImageShape;
  assetRecords: AssemblyTldrawAssetRecord[];
  placementShapes: AssemblyTldrawImageShape[];
  fitBounds: { x: number; y: number; w: number; h: number };
};

type BuildTldrawAssemblySnapshotInput = {
  draft: AssemblyManifestDraft;
  scenePackage: ChapterScenePackage;
};

type ProjectManifestChangesFromCanvasInput = {
  draft: AssemblyManifestDraft;
  shapesInZOrder: NormalizedPlacementShape[];
  emptySceneSize: CanvasSize;
};

type MaybeAssemblyShapeMeta = {
  kind?: string;
  source?: string;
  placementId?: string;
};

export type NormalizedPlacementShape = {
  id: string;
  placementId: string;
  x: number;
  y: number;
  rotation: number;
  props: {
    w: number;
    h: number;
  };
};

const DEFAULT_CANVAS_SIZE = { width: 1024, height: 1024 } as const;

// WHY: tldraw 的 shape / asset id 只是 authoring 期内部句柄；真正持久化的仍然是 manifest placement id。
// 这里把映射集中在 adapter，避免其他模块把 tldraw record 语义误当成业务协议扩散出去。
export function buildTldrawAssemblySnapshot({
  draft,
  scenePackage,
}: BuildTldrawAssemblySnapshotInput): TldrawAssemblySnapshot {
  const emptyScene = scenePackage.empty_scene_images.find((image) => image.id === draft.empty_scene_image_id) ?? null;
  const canvasSize = selectedCanvasSize(draft, emptyScene ? { width: emptyScene.width, height: emptyScene.height } : null);

  const backgroundAsset = buildAssetRecord({
    chapterId: scenePackage.chapter_id,
    kind: "empty_scene_images",
    mediaId: draft.empty_scene_image_id ?? "missing-empty-scene",
    displayName: emptyScene?.original_filename ?? "Empty Scene",
    canvasSize,
  });
  const backgroundShape: AssemblyTldrawImageShape = {
    id: backgroundShapeId(draft.empty_scene_image_id ?? "missing-empty-scene"),
    type: "image",
    x: 0,
    y: 0,
    rotation: 0,
    isLocked: true,
    props: {
      assetId: backgroundAsset.id,
      w: canvasSize.width,
      h: canvasSize.height,
    },
    meta: { kind: "background", source: ASSEMBLY_META_SOURCE },
  };

  const assetById = new Map(scenePackage.chapter_assets.map((asset) => [asset.id, asset]));
  const placementShapes: AssemblyTldrawImageShape[] = orderedPlacements(draft).flatMap((placement) => {
    const asset = assetById.get(placement.asset_id);
    if (!asset) {
      return [];
    }

    return [
      {
        id: placementShapeId(placement.id),
        type: "image" as const,
        x: (placement.transform.cx - placement.transform.w / 2) * canvasSize.width,
        y: (placement.transform.cy - placement.transform.h / 2) * canvasSize.height,
        rotation: degreesToRadians(placement.transform.rotation_deg),
        props: {
          assetId: assetRecordId("chapter_assets", asset.id),
          w: placement.transform.w * canvasSize.width,
          h: placement.transform.h * canvasSize.height,
        },
        meta: {
          kind: "placement" as const,
          source: ASSEMBLY_META_SOURCE,
          placementId: placement.id,
        },
      },
    ];
  });

  const assetRecords = draft.placements.flatMap((placement) => {
    const asset = assetById.get(placement.asset_id);
    if (!asset) {
      return [];
    }
    return [
      buildAssetRecord({
        chapterId: scenePackage.chapter_id,
        kind: "chapter_assets",
        mediaId: asset.id,
        displayName: placement.display_name,
        canvasSize: {
          width: Math.max(1, Math.round(placement.transform.w * canvasSize.width)),
          height: Math.max(1, Math.round(placement.transform.h * canvasSize.height)),
        },
      }),
    ];
  });

  return {
    backgroundAsset,
    backgroundShape,
    assetRecords,
    placementShapes,
    fitBounds: fitCameraBoundsForEmptyScene(canvasSize),
  };
}

export function projectPlacementTransformFromShape(
  shape: { x: number; y: number; rotation: number; props: { w: number; h: number } },
  emptySceneSize: CanvasSize,
): ChapterSceneAssemblyTransform {
  return {
    cx: round((shape.x + shape.props.w / 2) / emptySceneSize.width),
    cy: round((shape.y + shape.props.h / 2) / emptySceneSize.height),
    w: round(shape.props.w / emptySceneSize.width),
    h: round(shape.props.h / emptySceneSize.height),
    rotation_deg: round(radiansToDegrees(shape.rotation), 3),
  };
}

export function projectManifestChangesFromCanvas({
  draft,
  shapesInZOrder,
  emptySceneSize,
}: ProjectManifestChangesFromCanvasInput): Pick<AssemblyManifestDraft, "placements" | "layer_order"> {
  const placementsById = new Map(draft.placements.map((placement) => [placement.id, placement]));
  const nextPlacementsById = new Map<string, AssemblyManifestDraft["placements"][number]>();

  for (const shape of shapesInZOrder) {
    const placement = placementsById.get(shape.placementId);
    if (!placement) {
      continue;
    }
    nextPlacementsById.set(shape.placementId, {
      ...placement,
      transform: projectPlacementTransformFromShape(shape, emptySceneSize),
    });
  }

  const placements = draft.placements.map((placement) => nextPlacementsById.get(placement.id) ?? placement);
  const layer_order: string[] = [];
  for (let index = shapesInZOrder.length - 1; index >= 0; index -= 1) {
    const placementId = shapesInZOrder[index]?.placementId;
    if (!placementId || !placementsById.has(placementId) || layer_order.includes(placementId)) {
      continue;
    }
    layer_order.push(placementId);
  }

  for (const placement of draft.placements) {
    if (!layer_order.includes(placement.id)) {
      layer_order.push(placement.id);
    }
  }

  return { placements, layer_order };
}

export function createInitialPlacementTransform(input: {
  canvasWidth: number;
  canvasHeight: number;
  assetWidth: number;
  assetHeight: number;
}): ChapterSceneAssemblyTransform {
  const maxWidth = input.canvasWidth * 0.4;
  const maxHeight = input.canvasHeight * 0.4;
  const scale = Math.min(maxWidth / input.assetWidth, maxHeight / input.assetHeight, 1);

  return {
    cx: 0.5,
    cy: 0.5,
    w: round((input.assetWidth * scale) / input.canvasWidth),
    h: round((input.assetHeight * scale) / input.canvasHeight),
    rotation_deg: 0,
  };
}

export function fitCameraBoundsForEmptyScene(emptySceneSize: CanvasSize) {
  return {
    x: 0,
    y: 0,
    w: emptySceneSize.width,
    h: emptySceneSize.height,
  };
}

// WHY: 允许 canvas 通过语义 API 选中 placement，但不暴露 shape id 协议细节。
export function selectionShapeIdForPlacement(placementId: string) {
  return `${ASSEMBLY_SHAPE_ID_PREFIX}${placementId}`;
}

export function isAssemblyManagedShapeId(shapeId: string) {
  return shapeId.startsWith(ASSEMBLY_SHAPE_ID_PREFIX);
}

export function isAssemblyManagedAssetId(assetId: string) {
  return assetId.startsWith(ASSEMBLY_ASSET_ID_PREFIX);
}

export function normalizePlacementShapeForProjection(
  shape: {
    id: string;
    x: number;
    y: number;
    rotation: number;
    props: { w?: number; h?: number };
    meta?: MaybeAssemblyShapeMeta;
  },
): NormalizedPlacementShape | null {
  if (!isTrustedPlacementMeta(shape.meta)) {
    return null;
  }
  const width = Number(shape.props.w);
  const height = Number(shape.props.h);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return {
    id: shape.id,
    placementId: shape.meta.placementId,
    x: shape.x,
    y: shape.y,
    rotation: shape.rotation,
    props: {
      w: width,
      h: height,
    },
  };
}

export function readPlacementIdFromShape(
  shape: { meta?: MaybeAssemblyShapeMeta } | null | undefined,
): string | null {
  if (!shape) {
    return null;
  }
  return isTrustedPlacementMeta(shape.meta) ? shape.meta.placementId : null;
}

export function isTrustedAssemblyBackgroundShape(
  shape: { meta?: MaybeAssemblyShapeMeta } | null | undefined,
): boolean {
  return Boolean(
    shape
      && shape.meta?.kind === "background"
      && shape.meta.source === ASSEMBLY_META_SOURCE,
  );
}

function assetRecordId(kind: "empty_scene_images" | "chapter_assets", mediaId: string) {
  return `${ASSEMBLY_ASSET_ID_PREFIX}${kind}:${mediaId}`;
}

function buildAssetRecord(input: {
  chapterId: string;
  kind: "empty_scene_images" | "chapter_assets";
  mediaId: string;
  displayName: string;
  canvasSize: CanvasSize;
}): AssemblyTldrawAssetRecord {
  return {
    id: assetRecordId(input.kind, input.mediaId),
    typeName: "asset",
    type: "image",
    props: {
      name: input.displayName,
      src: scenePackageMediaUrl(input.chapterId, input.kind, input.mediaId),
      w: input.canvasSize.width,
      h: input.canvasSize.height,
      mimeType: "image/png",
      isAnimated: false,
    },
    meta: {
      kind: input.kind === "empty_scene_images" ? "empty-scene" : "chapter-asset",
      sourceId: input.mediaId,
    },
  };
}

function orderedPlacements(draft: AssemblyManifestDraft) {
  const placementsById = new Map(draft.placements.map((placement) => [placement.id, placement]));
  const ordered = draft.layer_order
    .map((placementId) => placementsById.get(placementId))
    .filter((placement): placement is AssemblyManifestDraft["placements"][number] => Boolean(placement));
  const seen = new Set(ordered.map((placement) => placement.id));
  return [
    ...ordered,
    ...draft.placements.filter((placement) => !seen.has(placement.id)),
  ];
}

function selectedCanvasSize(
  draft: AssemblyManifestDraft,
  emptySceneSize: CanvasSize | null,
): CanvasSize {
  if (emptySceneSize) {
    return emptySceneSize;
  }
  if (draft.empty_scene_size) {
    return draft.empty_scene_size;
  }
  return DEFAULT_CANVAS_SIZE;
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}

function radiansToDegrees(value: number) {
  return (value * 180) / Math.PI;
}

function round(value: number, precision = 6) {
  const base = 10 ** precision;
  return Math.round(value * base) / base;
}

function placementShapeId(placementId: string) {
  return selectionShapeIdForPlacement(placementId);
}

function backgroundShapeId(emptySceneImageId: string) {
  return `${ASSEMBLY_SHAPE_ID_PREFIX}background:${emptySceneImageId}`;
}

function isTrustedPlacementMeta(
  meta: MaybeAssemblyShapeMeta | AssemblyShapeMeta | undefined,
): meta is Extract<AssemblyShapeMeta, { kind: "placement" }> {
  return Boolean(
    meta?.kind === "placement"
      && meta.source === ASSEMBLY_META_SOURCE
      && meta.placementId,
  );
}
