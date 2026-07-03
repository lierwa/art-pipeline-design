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
  const placements = scenePackage.chapter_assets.map((asset, index) => draftPlacement(asset, index));
  const layerOrder = placements.map((placement) => placement.id);

  return {
    schema_version: 1,
    empty_scene_image_id: scenePackage.current_empty_scene_image_id,
    empty_scene_size: scenePackage.empty_scene_images[0]
      ? { width: scenePackage.empty_scene_images[0].width, height: scenePackage.empty_scene_images[0].height }
      : null,
    placements,
    groups: [],
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
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not prepare assembly export.");
  }

  // WHY: Task 5 先交付稳定的 Studio shell，而不是重新发明完整画布引擎；
  // 这里用与预览同源的轻量导出保证 Lock Final 走真实 PNG 文件边界，后续 Task 6/7 再接入正式素材渲染。
  context.fillStyle = "#0b141e";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#1a2f42";
  context.fillRect(40, 40, canvas.width - 80, canvas.height - 80);
  context.fillStyle = "#e6edf7";
  context.font = "28px sans-serif";
  context.fillText("Chapter Scene Studio", 72, 110);

  scenePackage.assembly.placements.forEach((placement, index) => {
    const width = Math.max(placement.transform.w * canvas.width, 120);
    const height = Math.max(placement.transform.h * canvas.height, 120);
    const x = Math.max(placement.transform.cx * canvas.width - width / 2, 56);
    const y = Math.max(placement.transform.cy * canvas.height - height / 2, 156);
    context.fillStyle = previewColor(index);
    context.fillRect(x, y, width, height);
    context.fillStyle = "#071018";
    context.fillText(placement.display_name, x + 18, y + 42);
  });

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
