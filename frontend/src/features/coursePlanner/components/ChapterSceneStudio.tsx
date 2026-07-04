import { useCallback, useEffect, useRef, useState } from "react";

import type {
  Chapter,
  ChapterScenePackage,
  CharacterIpProfile,
  ReferenceLibraryImage,
  ScenePack,
  AsyncStatusMap,
} from "../types";
import type {
  ChapterCastAssignmentInput,
  ChapterReferenceSelectionInput,
  ChapterScenePromptInput,
  CompleteImageUploadInput,
  DirectChapterAssetUploadInput,
  EmptySceneImageUploadInput,
  ReferenceLibraryImageUploadInput,
} from "../api";
import {
  deleteChapterAsset,
  deleteCompleteSceneImage,
  duplicateChapterAsset,
} from "../api";
import { buildAssemblyReadiness } from "../assembly/assemblyReadiness";
import { exportAssemblyPreviewFile } from "../assembly/assemblyExport";
import {
  AssemblyWorkspacePanel,
  type AssemblyWorkspaceLockFinalState,
} from "./AssemblyWorkspacePanel";
import { CompleteSceneImagesPanel } from "./CompleteSceneImagesPanel";
import { EmptySceneImagesPanel } from "./EmptySceneImagesPanel";
import { FinalScenePanel } from "./FinalScenePanel";
import { LibrarySelectionPanel } from "./LibrarySelectionPanel";
import { PromptFactsPanel } from "./PromptFactsPanel";

type ChapterSceneStudioProps = {
  chapter: Chapter;
  scenePack: ScenePack;
  scenePackage: ChapterScenePackage;
  characterIps: CharacterIpProfile[];
  referenceImages: ReferenceLibraryImage[];
  asyncStatus: AsyncStatusMap;
  onAssignCharacterIp: (input: ChapterCastAssignmentInput) => Promise<ChapterScenePackage | null>;
  onSelectReferenceImage: (input: ChapterReferenceSelectionInput) => Promise<ChapterScenePackage | null>;
  onUpdatePrompt: (input: ChapterScenePromptInput) => Promise<ChapterScenePackage | null>;
  onUploadReferenceImage: (file: File, input: ReferenceLibraryImageUploadInput) => Promise<ReferenceLibraryImage | null>;
  onUploadEmptySceneImage: (file: File, input: EmptySceneImageUploadInput) => Promise<ChapterScenePackage | null>;
  onSelectEmptySceneImage: (imageId: string) => Promise<ChapterScenePackage | null>;
  onUploadCompleteSceneImage: (file: File, input: CompleteImageUploadInput) => Promise<ChapterScenePackage | null>;
  onDeleteCompleteSceneImage?: (completeImageId: string) => Promise<ChapterScenePackage | null>;
  onImportCompleteImage: (completeImageId: string) => Promise<ChapterScenePackage | null>;
  onUploadDirectAsset: (file: File, input: DirectChapterAssetUploadInput) => Promise<ChapterScenePackage | null>;
  onDuplicateChapterAsset?: (assetId: string) => Promise<ChapterScenePackage | null>;
  onDeleteChapterAsset?: (assetId: string) => Promise<ChapterScenePackage | null>;
  onSaveAssembly: (manifest: ChapterScenePackage["assembly"]) => Promise<ChapterScenePackage | null>;
  onLockFinal: (file: File) => Promise<ChapterScenePackage | null>;
};

export function ChapterSceneStudio({
  asyncStatus,
  chapter,
  characterIps,
  referenceImages,
  onAssignCharacterIp,
  onImportCompleteImage,
  onLockFinal,
  onDuplicateChapterAsset,
  onDeleteChapterAsset,
  onDeleteCompleteSceneImage,
  onSelectEmptySceneImage,
  onSelectReferenceImage,
  onSaveAssembly,
  onUpdatePrompt,
  onUploadCompleteSceneImage,
  onUploadDirectAsset,
  onUploadEmptySceneImage,
  onUploadReferenceImage,
  scenePack,
  scenePackage,
}: ChapterSceneStudioProps) {
  const [localScenePackage, setLocalScenePackage] = useState(scenePackage);
  const [assemblyLockState, setAssemblyLockState] = useState<AssemblyWorkspaceLockFinalState>(() =>
    buildAssemblyLockFinalState(scenePackage),
  );
  const assemblyLockStateRef = useRef(assemblyLockState);
  const flushAssemblyForLockFinalRef = useRef<(() => Promise<ChapterScenePackage | null>) | null>(null);

  useEffect(() => {
    setLocalScenePackage(scenePackage);
  }, [scenePackage]);

  useEffect(() => {
    setAssemblyLockState(buildAssemblyLockFinalState(localScenePackage));
  }, [localScenePackage]);

  useEffect(() => {
    assemblyLockStateRef.current = assemblyLockState;
  }, [assemblyLockState]);

  const handleUploadDirectAsset = useCallback(async (file: File, input: DirectChapterAssetUploadInput) => {
    const nextScenePackage = await onUploadDirectAsset(file, input);
    if (nextScenePackage) {
      setLocalScenePackage(nextScenePackage);
    }
    return nextScenePackage;
  }, [onUploadDirectAsset]);

  const handleDuplicateChapterAsset = useCallback(async (assetId: string) => {
    const nextScenePackage = onDuplicateChapterAsset
      ? await onDuplicateChapterAsset(assetId)
      : await duplicateChapterAsset(localScenePackage.chapter_id, assetId);
    if (nextScenePackage) {
      setLocalScenePackage(nextScenePackage);
    }
    return nextScenePackage;
  }, [localScenePackage.chapter_id, onDuplicateChapterAsset]);

  const handleDeleteChapterAsset = useCallback(async (assetId: string) => {
    const nextScenePackage = onDeleteChapterAsset
      ? await onDeleteChapterAsset(assetId)
      : await deleteChapterAsset(localScenePackage.chapter_id, assetId);
    if (nextScenePackage) {
      setLocalScenePackage(nextScenePackage);
    }
    return nextScenePackage;
  }, [localScenePackage.chapter_id, onDeleteChapterAsset]);

  const handleSelectEmptySceneImage = useCallback(async (imageId: string) => {
    const nextScenePackage = await onSelectEmptySceneImage(imageId);
    if (nextScenePackage) {
      setLocalScenePackage(nextScenePackage);
    }
    return nextScenePackage;
  }, [onSelectEmptySceneImage]);

  const handleDeleteCompleteSceneImage = useCallback(async (completeImageId: string) => {
    const nextScenePackage = onDeleteCompleteSceneImage
      ? await onDeleteCompleteSceneImage(completeImageId)
      : await deleteCompleteSceneImage(localScenePackage.chapter_id, completeImageId);
    if (nextScenePackage) {
      setLocalScenePackage(nextScenePackage);
    }
    return nextScenePackage;
  }, [localScenePackage.chapter_id, onDeleteCompleteSceneImage]);

  const handleSaveAssembly = useCallback(async (manifest: ChapterScenePackage["assembly"]) => {
    const nextScenePackage = await onSaveAssembly(manifest);
    if (nextScenePackage) {
      setLocalScenePackage(nextScenePackage);
    }
    return nextScenePackage;
  }, [onSaveAssembly]);

  const handleAssemblyLockStateChange = useCallback((nextState: AssemblyWorkspaceLockFinalState) => {
    setAssemblyLockState(nextState);
  }, []);

  const handleRegisterLockFinalFlush = useCallback((
    flush: (() => Promise<ChapterScenePackage | null>) | null,
  ) => {
    flushAssemblyForLockFinalRef.current = flush;
  }, []);

  const handleLockFinal = useCallback(async () => {
    const flushedScenePackage = flushAssemblyForLockFinalRef.current
      ? await flushAssemblyForLockFinalRef.current()
      : localScenePackage;
    if (!flushedScenePackage) {
      return null;
    }
    const manifest = flushAssemblyForLockFinalRef.current
      ? flushedScenePackage.assembly
      : assemblyLockStateRef.current.manifest;
    const file = await exportAssemblyPreviewFile(flushedScenePackage, manifest);
    const nextScenePackage = await onLockFinal(file);
    if (nextScenePackage) {
      setLocalScenePackage(nextScenePackage);
    }
    return nextScenePackage;
  }, [localScenePackage, onLockFinal]);

  const steps = [
    { key: "prompt", label: "Prompt", state: promptReadinessState(localScenePackage) },
    { key: "empty-scene", label: "Empty Scene", state: emptySceneState(localScenePackage) },
    { key: "images", label: "Images", state: completeImagesState(localScenePackage) },
    { key: "runs", label: "Runs", state: runState(localScenePackage) },
    { key: "assembly", label: "Assembly", state: assemblyState(localScenePackage, assemblyLockState.readiness.is_ready) },
    { key: "final", label: "Final", state: finalState(localScenePackage, assemblyLockState.readiness.is_ready) },
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
          <PromptFactsPanel
            characterIps={characterIps}
            referenceImages={referenceImages}
            scenePackage={localScenePackage}
            onUpdatePrompt={onUpdatePrompt}
          />
          <LibrarySelectionPanel
            characterIps={characterIps}
            referenceImages={referenceImages}
            scenePackage={localScenePackage}
            onAssignCharacterIp={onAssignCharacterIp}
            onSelectReferenceImage={onSelectReferenceImage}
            onUploadReferenceImage={onUploadReferenceImage}
          />
          <EmptySceneImagesPanel
            scenePackage={localScenePackage}
            onSelectEmptySceneImage={handleSelectEmptySceneImage}
            onUploadEmptySceneImage={onUploadEmptySceneImage}
          />
        </div>

        <div className="chapter-studio-column">
          <CompleteSceneImagesPanel
            scenePackage={localScenePackage}
            onDeleteCompleteSceneImage={handleDeleteCompleteSceneImage}
            onImportCompleteImage={onImportCompleteImage}
            onUploadCompleteSceneImage={onUploadCompleteSceneImage}
          />
          <AssemblyWorkspacePanel
            onDeleteChapterAsset={handleDeleteChapterAsset}
            scenePackage={localScenePackage}
            onDuplicateChapterAsset={handleDuplicateChapterAsset}
            onLockFinalStateChange={handleAssemblyLockStateChange}
            onRegisterLockFinalFlush={handleRegisterLockFinalFlush}
            onSaveAssembly={handleSaveAssembly}
            onUploadDirectAsset={handleUploadDirectAsset}
            saveStatus={asyncStatus[`scenePackage:assemblySave:${chapter.id}`]}
          />
        </div>

        <div className="chapter-studio-column">
          <FinalScenePanel
            assemblyState={assemblyLockState}
            scenePackage={localScenePackage}
            onLockFinal={handleLockFinal}
          />
        </div>
      </div>
    </div>
  );
}

function promptReadinessState(scenePackage: ChapterScenePackage): StudioStepState {
  const hasPromptText = Boolean(scenePackage.prompt.prompt_text.trim());
  const hasSpatialContract = Boolean(scenePackage.prompt.scene_spatial_contract.trim());
  const hasCharacter = scenePackage.cast_assignments.length > 0 && scenePackage.cast_assignments.every((assignment) =>
    Boolean(assignment.character_ip_id.trim()) &&
    Boolean(assignment.action_intent.trim()) &&
    assignment.reference_image_ids.length > 0
  );
  const hasTargetObjects = scenePackage.target_objects.length > 0;
  const hasStyleResolution = scenePackage.reference_selections.some((selection) => selection.prompt_role === "style") ||
    scenePackage.prompt_confirmations.style_reference_mode === "confirmed_empty";
  return hasPromptText &&
    hasSpatialContract &&
    hasCharacter &&
    hasTargetObjects &&
    hasStyleResolution &&
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

function assemblyState(
  scenePackage: ChapterScenePackage,
  currentAssemblyReady: boolean,
): StudioStepState {
  if (currentAssemblyReady) {
    return "ready";
  }
  return scenePackage.assembly.placements.length > 0 ? "pending" : "idle";
}

function finalState(
  scenePackage: ChapterScenePackage,
  currentAssemblyReady: boolean,
): StudioStepState {
  if (scenePackage.final_scene) {
    return "ready";
  }
  return currentAssemblyReady ? "pending" : "idle";
}

type StudioStepState = "idle" | "pending" | "ready";

function buildAssemblyLockFinalState(
  scenePackage: ChapterScenePackage,
): AssemblyWorkspaceLockFinalState {
  return {
    manifest: scenePackage.assembly,
    hasDirtyChanges: false,
    canPersistDraft: Boolean(scenePackage.current_empty_scene_image_id),
    readiness: buildAssemblyReadiness(scenePackage),
    saveError: null,
    saveState: "saved",
  };
}
