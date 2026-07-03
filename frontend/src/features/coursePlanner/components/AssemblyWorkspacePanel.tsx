import type {
  ChapterAsset,
  ChapterSceneAssemblyManifest,
  ChapterSceneAssemblyPlacement,
  ChapterScenePackage,
} from "../types";

type AssemblyWorkspacePanelProps = {
  scenePackage: ChapterScenePackage;
  onSaveAssembly: (manifest: ChapterSceneAssemblyManifest) => Promise<ChapterScenePackage | null>;
};

const DEFAULT_ASSEMBLY_EXPORT_SIZE = { width: 1024, height: 1024 } as const;

export function AssemblyWorkspacePanel({ onSaveAssembly, scenePackage }: AssemblyWorkspacePanelProps) {
  async function handleSave() {
    const nextManifest = createAssemblyManifest(scenePackage);
    await onSaveAssembly(nextManifest);
  }

  const previewItems = scenePackage.assembly.placements.length > 0
    ? scenePackage.assembly.placements
    : scenePackage.chapter_assets.slice(0, 4).map((asset, index) => draftPlacement(asset, index));

  return (
    <section className="chapter-studio-panel chapter-studio-panel-stack" aria-label="Assembly workspace">
      <div className="chapter-studio-panel-heading">
        <div>
          <h2>Assembly</h2>
          <p>{scenePackage.assembly.placements.length} placements</p>
        </div>
      </div>

      <div className="chapter-studio-preview-frame">
        <svg viewBox="0 0 100 100" role="img" aria-label="Assembly preview">
          <rect x="0" y="0" width="100" height="100" rx="6" className="chapter-studio-preview-bg" />
          {previewItems.map((placement, index) => (
            <g key={placement.id}>
              <rect
                x={Math.max(placement.transform.cx * 100 - placement.transform.w * 50, 4)}
                y={Math.max(placement.transform.cy * 100 - placement.transform.h * 50, 4)}
                width={Math.max(placement.transform.w * 100, 10)}
                height={Math.max(placement.transform.h * 100, 10)}
                rx="4"
                className={`chapter-studio-preview-asset chapter-studio-preview-asset-${index % 3}`}
              />
              <text x={placement.transform.cx * 100} y={placement.transform.cy * 100} textAnchor="middle" dominantBaseline="middle">
                {placement.display_name}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div className="chapter-studio-actions">
        <button type="button" className="course-planner-primary-action" onClick={() => void handleSave()}>
          Save Assembly
        </button>
      </div>
    </section>
  );
}

export function createAssemblyManifest(scenePackage: ChapterScenePackage): ChapterSceneAssemblyManifest {
  const hasPersistedPlacements = scenePackage.assembly.placements.length > 0;
  const placements = hasPersistedPlacements
    ? scenePackage.assembly.placements
    : scenePackage.chapter_assets.map((asset, index) => draftPlacement(asset, index));
  const selectedEmptyScene = currentEmptySceneImage(scenePackage);
  const layerOrder = hasPersistedPlacements && scenePackage.assembly.layer_order.length > 0
    ? scenePackage.assembly.layer_order
    : placements.map((placement) => placement.id);

  return {
    ...scenePackage.assembly,
    schema_version: 1,
    empty_scene_image_id: scenePackage.current_empty_scene_image_id,
    // WHY: assembly manifest 必须沿用“当前选中的 empty scene”作为唯一事实源；
    // 只有找不到选中图片记录时才回退到已持久化尺寸，避免首张图片把用户当前选择覆盖掉。
    empty_scene_size: selectedEmptyScene
      ? { width: selectedEmptyScene.width, height: selectedEmptyScene.height }
      : scenePackage.assembly.empty_scene_size,
    placements,
    layer_order: layerOrder,
    updated_at: new Date().toISOString(),
  };
}

export function isAssemblyReady(scenePackage: ChapterScenePackage): boolean {
  return Boolean(
    scenePackage.current_empty_scene_image_id &&
    scenePackage.assembly.placements.length > 0 &&
    scenePackage.assembly.updated_at,
  );
}

export async function exportAssemblyPreviewFile(scenePackage: ChapterScenePackage): Promise<File> {
  const emptySceneImageId = scenePackage.current_empty_scene_image_id;
  if (!emptySceneImageId) {
    throw new Error("Could not export assembly preview without a selected Empty Scene Image.");
  }

  const selectedEmptyScene = currentEmptySceneImage(scenePackage);
  const canvasSize = selectedEmptyScene
    ? { width: selectedEmptyScene.width, height: selectedEmptyScene.height }
    : scenePackage.assembly.empty_scene_size ?? DEFAULT_ASSEMBLY_EXPORT_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = canvasSize.width;
  canvas.height = canvasSize.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not prepare assembly export.");
  }

  // WHY: lock final 产物要复用当前 assembly 的真实素材合同，
  // 不能再导出占位图，否则 backend 保存的 final scene 与用户看到的摆放结果会分叉。
  const emptySceneImage = await loadScenePackageImage(scenePackage.chapter_id, "empty_scene_images", emptySceneImageId);
  context.drawImage(emptySceneImage, 0, 0, canvas.width, canvas.height);

  for (const placement of scenePackage.assembly.placements) {
    const asset = scenePackage.chapter_assets.find((chapterAsset) => chapterAsset.id === placement.asset_id);
    if (!asset) {
      throw new Error(`Could not find Chapter Asset ${placement.asset_id} for assembly export.`);
    }
    const assetImage = await loadScenePackageImage(scenePackage.chapter_id, "chapter_assets", asset.id);
    drawPlacementImage(context, assetImage, placement, canvas.width, canvas.height);
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((nextBlob) => {
      if (nextBlob) {
        resolve(nextBlob);
        return;
      }
      reject(new Error("Could not export assembly preview."));
    }, "image/png");
  });

  return new File([blob], "chapter-scene-final.png", { type: "image/png" });
}

function draftPlacement(asset: ChapterAsset, index: number): ChapterSceneAssemblyPlacement {
  return {
    id: `placement_${asset.id}`,
    asset_id: asset.id,
    display_name: asset.display_name,
    runtime_role: "target",
    transform: {
      cx: 0.26 + (index % 3) * 0.22,
      cy: 0.34 + Math.floor(index / 3) * 0.22,
      w: 0.18,
      h: 0.18,
      rotation_deg: 0,
    },
    group_id: null,
    requires_placed: [],
  };
}

function previewColor(index: number): string {
  return ["#89ddff", "#91f7dc", "#ffe082"][index % 3] ?? "#89ddff";
}

function currentEmptySceneImage(scenePackage: ChapterScenePackage) {
  return scenePackage.empty_scene_images.find((image) => image.id === scenePackage.current_empty_scene_image_id) ?? null;
}

function scenePackageMediaUrl(
  chapterId: string,
  mediaKind: "empty_scene_images" | "chapter_assets",
  mediaId: string,
): string {
  return `/api/course-planner/chapters/${chapterId}/scene-package/media/${mediaKind}/${mediaId}`;
}

function loadScenePackageImage(
  chapterId: string,
  mediaKind: "empty_scene_images" | "chapter_assets",
  mediaId: string,
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${mediaKind} image ${mediaId} for assembly export.`));
    image.src = scenePackageMediaUrl(chapterId, mediaKind, mediaId);
  });
}

function drawPlacementImage(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  placement: ChapterSceneAssemblyPlacement,
  canvasWidth: number,
  canvasHeight: number,
) {
  const width = placement.transform.w * canvasWidth;
  const height = placement.transform.h * canvasHeight;
  const centerX = placement.transform.cx * canvasWidth;
  const centerY = placement.transform.cy * canvasHeight;

  context.save();
  context.translate(centerX, centerY);
  context.rotate((placement.transform.rotation_deg * Math.PI) / 180);
  context.drawImage(image, -width / 2, -height / 2, width, height);
  context.restore();
}
