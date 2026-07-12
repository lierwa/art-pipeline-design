import { type ChangeEvent, useRef } from "react";
import { Send, Trash2, Upload } from "lucide-react";

import { ConfirmActionDialog } from "../../../shared/ui/ConfirmActionDialog";
import type { CompleteImageUploadInput } from "../api";
import { scenePackageMediaUrl } from "../scenePackageMedia";
import type { ChapterScenePackage } from "../types";
import { CoursePlannerStatusBadge } from "./CoursePlannerChrome";
import { readableSceneMediaName } from "./mediaDisplayNames";

type CompleteSceneImagesPanelProps = {
  scenePackage: ChapterScenePackage;
  onDeleteCompleteSceneImage: (completeImageId: string) => Promise<ChapterScenePackage | null>;
  onImportCompleteImage: (completeImageId: string) => Promise<ChapterScenePackage | null>;
  onUploadCompleteSceneImage: (file: File, input: CompleteImageUploadInput) => Promise<ChapterScenePackage | null>;
};

export function CompleteSceneImagesPanel({
  onDeleteCompleteSceneImage,
  onImportCompleteImage,
  onUploadCompleteSceneImage,
  scenePackage,
}: CompleteSceneImagesPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const visibleImages = scenePackage.complete_images.filter((image) => image.status !== "deleted");

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    await onUploadCompleteSceneImage(file, {
      generationNote: "",
    });
    event.target.value = "";
  }

  return (
    <section className="chapter-studio-panel chapter-studio-panel-stack chapter-complete-images-panel" aria-label="Complete scene images">
      <div className="chapter-studio-panel-heading">
        <div>
          <h2>Images</h2>
          <p>{visibleImages.length} complete images</p>
        </div>
      </div>

      <div className="chapter-complete-image-list">
        {visibleImages.map((image, index) => {
          const imageName = readableSceneMediaName(image.original_filename, `Complete Image ${index + 1}`);
          return (
            <article key={image.id} className="chapter-complete-image-row">
              <img
                className="chapter-complete-image-thumb"
                alt=""
                src={scenePackageMediaUrl(scenePackage.chapter_id, "complete_images", image.id)}
              />
              <div className="chapter-complete-image-copy">
                <div className="chapter-media-title-row">
                  <h3 title={image.original_filename}>{imageName}</h3>
                  <CoursePlannerStatusBadge tone="success">
                    {image.pipeline_run_status ?? "Complete"}
                  </CoursePlannerStatusBadge>
                </div>
                <p>{image.width} x {image.height}</p>
                {image.generation_note ? <p className="chapter-media-note">{image.generation_note}</p> : null}
              </div>
              <div className="chapter-complete-image-actions">
                <button
                  type="button"
                  className="course-planner-secondary-action chapter-studio-icon-action"
                  disabled={Boolean(image.pipeline_run_id)}
                  onClick={() => void onImportCompleteImage(image.id)}
                >
                  <Send size={16} aria-hidden="true" />
                  Send to Pipeline
                </button>
                <ConfirmActionDialog
                  trigger={(
                    <button type="button" className="course-planner-secondary-action chapter-studio-icon-action">
                      <Trash2 size={16} aria-hidden="true" />
                      Delete Image
                    </button>
                  )}
                  title={`Delete ${image.original_filename}?`}
                  description="This removes the Complete Scene Image from the chapter history only. Direct-upload Chapter Assets and the locked Final snapshot stay intact."
                  confirmLabel="Confirm delete image"
                  onConfirm={async () => {
                    await onDeleteCompleteSceneImage(image.id);
                  }}
                />
              </div>
            </article>
          );
        })}
      </div>
      <button type="button" className="course-planner-secondary-action chapter-studio-icon-action chapter-complete-image-upload" onClick={() => inputRef.current?.click()}>
        <Upload size={16} aria-hidden="true" />
        Upload Complete Scene Image
      </button>
      <input ref={inputRef} hidden type="file" accept="image/png" onChange={handleFileChange} />
    </section>
  );
}
