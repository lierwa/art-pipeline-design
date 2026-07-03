import { type ChangeEvent, useMemo, useRef } from "react";

import type { DirectChapterAssetUploadInput } from "../api";
import type { ChapterScenePackage } from "../types";
import { CoursePlannerStatusBadge } from "./CoursePlannerChrome";

type ChapterAssetPoolPanelProps = {
  scenePackage: ChapterScenePackage;
  onUploadDirectAsset: (file: File, input: DirectChapterAssetUploadInput) => Promise<ChapterScenePackage | null>;
};

export function ChapterAssetPoolPanel({ onUploadDirectAsset, scenePackage }: ChapterAssetPoolPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const usedAssetIds = useMemo(
    () => new Set(scenePackage.assembly.placements.map((placement) => placement.asset_id)),
    [scenePackage.assembly.placements],
  );

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    await onUploadDirectAsset(file, {
      displayName: file.name.replace(/\.[^.]+$/, ""),
      linkedTargetObjectId: scenePackage.target_objects[0]?.id,
    });
    event.target.value = "";
  }

  return (
    <section className="chapter-studio-panel chapter-studio-panel-stack" aria-label="Chapter asset pool">
      <div className="chapter-studio-panel-heading">
        <div>
          <h2>Chapter Asset Pool</h2>
          <p>{scenePackage.chapter_assets.length} assets</p>
        </div>
      </div>

      <div className="chapter-studio-actions">
        <button type="button" className="course-planner-primary-action" onClick={() => inputRef.current?.click()}>
          Upload Scene Asset
        </button>
        <button type="button" className="course-planner-secondary-action" disabled>
          Add from Run Asset
        </button>
        <input ref={inputRef} hidden type="file" accept="image/png" onChange={handleFileChange} />
      </div>

      <div className="chapter-studio-card-list">
        {scenePackage.chapter_assets.map((asset) => {
          const isUsed = usedAssetIds.has(asset.id);
          return (
            <article key={asset.id} className="chapter-studio-card">
              <div className="chapter-studio-card-header">
                <div>
                  <h3>{asset.display_name}</h3>
                  <p>{asset.original_filename}</p>
                </div>
                <CoursePlannerStatusBadge tone={isUsed ? "info" : "neutral"}>{isUsed ? "Used" : "Unused"}</CoursePlannerStatusBadge>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
