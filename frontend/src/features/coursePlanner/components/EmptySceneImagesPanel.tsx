import { type ChangeEvent, useRef } from "react";

import { ConfirmActionDialog } from "../../../shared/ui/ConfirmActionDialog";
import type { EmptySceneImageUploadInput } from "../api";
import type { ChapterScenePackage } from "../types";
import { CoursePlannerStatusBadge } from "./CoursePlannerChrome";

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
    await onUploadEmptySceneImage(file, {
      referenceImageIds: scenePackage.reference_selections.map((selection) => selection.reference_image_id),
    });
    event.target.value = "";
  }

  return (
    <section className="chapter-studio-panel chapter-studio-panel-stack" aria-label="Empty scene images">
      <div className="chapter-studio-panel-heading">
        <div>
          <h2>Empty Scene</h2>
          <p>{scenePackage.empty_scene_images.length} candidates</p>
        </div>
      </div>

      <div className="chapter-studio-actions">
        <button type="button" className="course-planner-primary-action" onClick={() => inputRef.current?.click()}>
          Upload Empty Scene Image
        </button>
        <input ref={inputRef} hidden type="file" accept="image/png" onChange={handleFileChange} />
      </div>

      <div className="chapter-studio-card-list">
        {scenePackage.empty_scene_images.map((image) => {
          const isCurrent = image.id === scenePackage.current_empty_scene_image_id;
          const isReplacingCurrent = Boolean(scenePackage.current_empty_scene_image_id) && !isCurrent;
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
            <article key={image.id} className="chapter-studio-card">
              <div className="chapter-studio-card-header">
                <div>
                  <h3>{image.original_filename}</h3>
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
            </article>
          );
        })}
      </div>
    </section>
  );
}
