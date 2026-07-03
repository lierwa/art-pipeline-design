import { type ChangeEvent, useRef } from "react";

import type { CompleteImageUploadInput } from "../api";
import type { ChapterScenePackage } from "../types";
import { CoursePlannerStatusBadge } from "./CoursePlannerChrome";

type CompleteSceneImagesPanelProps = {
  scenePackage: ChapterScenePackage;
  onUploadCompleteSceneImage: (file: File, input: CompleteImageUploadInput) => Promise<ChapterScenePackage | null>;
};

export function CompleteSceneImagesPanel({
  onUploadCompleteSceneImage,
  scenePackage,
}: CompleteSceneImagesPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    await onUploadCompleteSceneImage(file, {
      referenceImageIds: scenePackage.reference_selections.map((selection) => selection.reference_image_id),
      promptSnapshot: scenePackage.prompt.prompt_text,
      generationNote: "",
    });
    event.target.value = "";
  }

  return (
    <section className="chapter-studio-panel chapter-studio-panel-stack" aria-label="Complete scene images">
      <div className="chapter-studio-panel-heading">
        <div>
          <h2>Images</h2>
          <p>{scenePackage.complete_images.length} complete images</p>
        </div>
      </div>

      <div className="chapter-studio-actions">
        <button type="button" className="course-planner-primary-action" onClick={() => inputRef.current?.click()}>
          Upload Complete Scene Image
        </button>
        <input ref={inputRef} hidden type="file" accept="image/png" onChange={handleFileChange} />
      </div>

      <div className="chapter-studio-card-list">
        {scenePackage.complete_images.map((image) => (
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
              <button type="button" className="course-planner-secondary-action" disabled>
                Send to Pipeline
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
