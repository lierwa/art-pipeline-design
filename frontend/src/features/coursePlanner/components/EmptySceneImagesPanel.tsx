import { type ChangeEvent, useRef } from "react";
import { Upload } from "lucide-react";

import { ConfirmActionDialog } from "../../../shared/ui/ConfirmActionDialog";
import type { EmptySceneImageUploadInput } from "../api";
import { scenePackageMediaUrl } from "../scenePackageMedia";
import type { ChapterScenePackage } from "../types";
import { CoursePlannerStatusBadge } from "./CoursePlannerChrome";
import { readableSceneMediaName } from "./mediaDisplayNames";

type EmptySceneImagesPanelProps = {
  scenePackage: ChapterScenePackage;
  onSelectEmptySceneImage: (imageId: string) => Promise<ChapterScenePackage | null>;
  onUploadEmptySceneImage: (file: File, input: EmptySceneImageUploadInput) => Promise<ChapterScenePackage | null>;
};

export function EmptySceneImagesPanel({
  onSelectEmptySceneImage,
  onUploadEmptySceneImage,
  scenePackage,
}: EmptySceneImagesPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    await onUploadEmptySceneImage(file, {});
    event.target.value = "";
  }

  return (
    <section className="chapter-studio-panel chapter-studio-panel-stack chapter-empty-scene-panel" aria-label="Empty scene images">
      <div className="chapter-studio-panel-heading">
        <div>
          <h2>Empty Scene</h2>
          <p>{scenePackage.empty_scene_images.length} candidates</p>
        </div>
      </div>

      <div className="chapter-empty-scene-list">
        {scenePackage.empty_scene_images.map((image, index) => {
          const isCurrent = image.id === scenePackage.current_empty_scene_image_id;
          const isReplacingCurrent = Boolean(scenePackage.current_empty_scene_image_id) && !isCurrent;
          const imageName = readableSceneMediaName(image.original_filename, `Empty Scene ${index + 1}`);
          const selectButton = (
            <button
              type="button"
              className="course-planner-secondary-action"
              disabled={isCurrent}
              onClick={isReplacingCurrent ? undefined : () => void onSelectEmptySceneImage(image.id)}
            >
              Select as Empty Scene
            </button>
          );
          return (
            <article key={image.id} className="chapter-empty-scene-card">
              <img
                className="chapter-empty-scene-preview"
                alt=""
                src={scenePackageMediaUrl(scenePackage.chapter_id, "empty_scene_images", image.id)}
              />
              <div className="chapter-empty-scene-body">
                <div className="chapter-studio-card-header">
                  <div>
                    <h3 title={image.original_filename}>{imageName}</h3>
                    <p>{image.width} x {image.height}</p>
                  </div>
                  {isCurrent ? <CoursePlannerStatusBadge tone="success">Current Empty Scene</CoursePlannerStatusBadge> : null}
                </div>
                <div className="chapter-studio-actions">
                  {isReplacingCurrent ? (
                    <ConfirmActionDialog
                      trigger={selectButton}
                      title="Replace Empty Scene"
                      description="Switch the Assembly background for this Chapter Scene Package. Existing placements, Chapter Assets, Complete Scene Images, and pipeline run associations stay preserved, but placements may need repositioning against the new Empty Scene."
                      confirmLabel="Replace Empty Scene"
                      onConfirm={() => {
                        void onSelectEmptySceneImage(image.id);
                      }}
                    />
                  ) : selectButton}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <button
        type="button"
        className="course-planner-secondary-action chapter-studio-icon-action chapter-empty-scene-upload"
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={16} aria-hidden="true" />
        Upload Empty Scene Image
      </button>
      <input ref={inputRef} hidden type="file" accept="image/png" onChange={handleFileChange} />
    </section>
  );
}
