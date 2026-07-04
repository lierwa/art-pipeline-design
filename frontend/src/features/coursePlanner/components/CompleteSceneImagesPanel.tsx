import { type ChangeEvent, useRef } from "react";
import { Send, Trash2, Upload } from "lucide-react";

import { ConfirmActionDialog } from "../../../shared/ui/ConfirmActionDialog";
import type { CompleteImageUploadInput } from "../api";
import type { ChapterScenePackage } from "../types";
import { CoursePlannerStatusBadge } from "./CoursePlannerChrome";

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
      referenceImageIds: scenePackage.reference_selections.map((selection) => selection.reference_image_id),
      generationNote: "",
    });
    event.target.value = "";
  }

  return (
    <section className="chapter-studio-panel chapter-studio-panel-stack" aria-label="Complete scene images">
      <div className="chapter-studio-panel-heading">
        <div>
          <h2>Images</h2>
          <p>{visibleImages.length} complete images</p>
        </div>
      </div>

      <div className="chapter-studio-actions">
        <button type="button" className="course-planner-primary-action chapter-studio-icon-action" onClick={() => inputRef.current?.click()}>
          <Upload size={16} aria-hidden="true" />
          Upload Complete Scene Image
        </button>
        <input ref={inputRef} hidden type="file" accept="image/png" onChange={handleFileChange} />
      </div>

      <div className="chapter-studio-card-list">
        {visibleImages.map((image) => (
          <article key={image.id} className="chapter-studio-card">
            <div className="chapter-studio-card-header">
              <div>
                <h3>{image.original_filename}</h3>
                <p>{image.generation_note || "No note"}</p>
              </div>
              <CoursePlannerStatusBadge tone={image.pipeline_run_status ? "success" : "warning"}>
                {image.pipeline_run_status ?? "Run status"}
              </CoursePlannerStatusBadge>
            </div>
            <div className="chapter-studio-actions">
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
        ))}
      </div>
    </section>
  );
}
