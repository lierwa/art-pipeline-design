import type {
  Chapter,
  ChapterSceneAssemblyManifest,
  ChapterScenePackage,
  ScenePack,
  AsyncStatusMap,
} from "../types";
import type {
  ChapterScenePromptInput,
  CompleteImageUploadInput,
  DirectChapterAssetUploadInput,
  EmptySceneImageUploadInput,
} from "../api";
import { AssemblyWorkspacePanel, isAssemblyReady } from "./AssemblyWorkspacePanel";
import { ChapterAssetPoolPanel } from "./ChapterAssetPoolPanel";
import { CompleteSceneImagesPanel } from "./CompleteSceneImagesPanel";
import { EmptySceneImagesPanel } from "./EmptySceneImagesPanel";
import { FinalScenePanel } from "./FinalScenePanel";
import { LibrarySelectionPanel } from "./LibrarySelectionPanel";
import { PromptFactsPanel } from "./PromptFactsPanel";

type ChapterSceneStudioProps = {
  chapter: Chapter;
  scenePack: ScenePack;
  scenePackage: ChapterScenePackage;
  asyncStatus: AsyncStatusMap;
  onUpdatePrompt: (input: ChapterScenePromptInput) => Promise<ChapterScenePackage | null>;
  onUploadEmptySceneImage: (file: File, input: EmptySceneImageUploadInput) => Promise<ChapterScenePackage | null>;
  onSelectEmptySceneImage: (imageId: string) => Promise<ChapterScenePackage | null>;
  onUploadCompleteSceneImage: (file: File, input: CompleteImageUploadInput) => Promise<ChapterScenePackage | null>;
  onUploadDirectAsset: (file: File, input: DirectChapterAssetUploadInput) => Promise<ChapterScenePackage | null>;
  onSaveAssembly: (manifest: ChapterSceneAssemblyManifest) => Promise<ChapterScenePackage | null>;
  onLockFinal: (file: File) => Promise<ChapterScenePackage | null>;
};

export function ChapterSceneStudio({
  asyncStatus,
  chapter,
  onLockFinal,
  onSaveAssembly,
  onSelectEmptySceneImage,
  onUpdatePrompt,
  onUploadCompleteSceneImage,
  onUploadDirectAsset,
  onUploadEmptySceneImage,
  scenePack,
  scenePackage,
}: ChapterSceneStudioProps) {
  const steps = [
    { key: "prompt", label: "Prompt", state: promptReadinessState(scenePackage) },
    { key: "empty-scene", label: "Empty Scene", state: emptySceneState(scenePackage) },
    { key: "images", label: "Images", state: completeImagesState(scenePackage) },
    { key: "runs", label: "Runs", state: runState(scenePackage) },
    { key: "assembly", label: "Assembly", state: assemblyState(scenePackage) },
    { key: "final", label: "Final", state: finalState(scenePackage) },
  ];
  const pendingCount = Object.values(asyncStatus).filter((status) => status?.status === "pending").length;

  return (
    <div className="chapter-scene-studio">
      <aside className="chapter-studio-rail" aria-label="Studio progress">
        <div className="chapter-studio-rail-header">
          <h2>{scenePack.title}</h2>
          <p>{chapter.seed.eventSeed}</p>
          <p>{pendingCount > 0 ? `${pendingCount} running` : "Ready"}</p>
        </div>
        <ol className="chapter-studio-step-list">
          {steps.map((step, index) => (
            <li key={step.key} className={`chapter-studio-step chapter-studio-step-${step.state}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <strong>{step.label}</strong>
                <small>{step.state}</small>
              </div>
            </li>
          ))}
        </ol>
      </aside>

      <div className="chapter-studio-main">
        <div className="chapter-studio-column">
          <PromptFactsPanel scenePackage={scenePackage} onUpdatePrompt={onUpdatePrompt} />
          <LibrarySelectionPanel scenePackage={scenePackage} />
          <EmptySceneImagesPanel
            scenePackage={scenePackage}
            onSelectEmptySceneImage={onSelectEmptySceneImage}
            onUploadEmptySceneImage={onUploadEmptySceneImage}
          />
        </div>

        <div className="chapter-studio-column">
          <CompleteSceneImagesPanel scenePackage={scenePackage} onUploadCompleteSceneImage={onUploadCompleteSceneImage} />
          <ChapterAssetPoolPanel scenePackage={scenePackage} onUploadDirectAsset={onUploadDirectAsset} />
          <AssemblyWorkspacePanel scenePackage={scenePackage} onSaveAssembly={onSaveAssembly} />
        </div>

        <div className="chapter-studio-column">
          <FinalScenePanel scenePackage={scenePackage} onLockFinal={onLockFinal} />
        </div>
      </div>
    </div>
  );
}

function promptReadinessState(scenePackage: ChapterScenePackage): StudioStepState {
  return scenePackage.cast_assignments.length > 0 &&
    (scenePackage.reference_selections.length > 0 || scenePackage.prompt_confirmations.style_reference_mode === "confirmed_empty") &&
    scenePackage.prompt_confirmations.avoid_objects_reviewed
    ? "ready"
    : "pending";
}

function emptySceneState(scenePackage: ChapterScenePackage): StudioStepState {
  if (scenePackage.current_empty_scene_image_id) {
    return "ready";
  }
  return scenePackage.empty_scene_images.length > 0 ? "pending" : "idle";
}

function completeImagesState(scenePackage: ChapterScenePackage): StudioStepState {
  return scenePackage.complete_images.length > 0 ? "ready" : "idle";
}

function runState(scenePackage: ChapterScenePackage): StudioStepState {
  if (scenePackage.complete_images.some((image) => image.pipeline_run_id || image.pipeline_run_status)) {
    return "ready";
  }
  return scenePackage.complete_images.length > 0 ? "pending" : "idle";
}

function assemblyState(scenePackage: ChapterScenePackage): StudioStepState {
  if (isAssemblyReady(scenePackage)) {
    return "ready";
  }
  return scenePackage.assembly.placements.length > 0 ? "pending" : "idle";
}

function finalState(scenePackage: ChapterScenePackage): StudioStepState {
  if (scenePackage.final_scene) {
    return "ready";
  }
  return isAssemblyReady(scenePackage) ? "pending" : "idle";
}

type StudioStepState = "idle" | "pending" | "ready";
