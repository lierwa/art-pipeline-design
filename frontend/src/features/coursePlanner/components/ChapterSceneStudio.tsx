import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";

import type {
  AsyncStatusMap,
  Chapter,
  ChapterScenePackage,
  CharacterIpProfile,
  ReferenceLibraryImage,
} from "../types";
import type {
  ChapterCastAssignmentInput,
  ChapterReferenceSelectionInput,
  ChapterScenePromptInput,
  CompleteImageUploadInput,
  EmptySceneImageUploadInput,
  ReferenceLibraryImageUploadInput,
} from "../api";
import { buildAssemblyReadiness } from "../assembly/assemblyReadiness";
import { exportAssemblyPreviewFile } from "../assembly/assemblyExport";
import { CompleteSceneImagesPanel } from "./CompleteSceneImagesPanel";
import { CoursePlannerDrawer, CoursePlannerStatusBadge } from "./CoursePlannerChrome";
import { EmptySceneImagesPanel } from "./EmptySceneImagesPanel";
import { FinalScenePanel } from "./FinalScenePanel";
import { CharacterBindingPanel, LibrarySelectionPanel, ReferenceImagesPanel } from "./LibrarySelectionPanel";
import { PromptFactsPanel } from "./PromptFactsPanel";

type ChapterSceneStudioProps = {
  chapter: Chapter;
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
  onDeleteCompleteSceneImage: (completeImageId: string) => Promise<ChapterScenePackage | null>;
  onImportCompleteImage: (completeImageId: string) => Promise<ChapterScenePackage | null>;
  onLockFinal: (file: File) => Promise<ChapterScenePackage | null>;
};

type StudioStep = {
  key: string;
  label: string;
  state: StudioStepState;
  stateLabel: string;
};

type LibraryDrawerKey = "character" | "reference";

export function ChapterSceneStudio({
  asyncStatus,
  chapter,
  characterIps,
  referenceImages,
  onAssignCharacterIp,
  onImportCompleteImage,
  onLockFinal,
  onDeleteCompleteSceneImage,
  onSelectEmptySceneImage,
  onSelectReferenceImage,
  onUpdatePrompt,
  onUploadCompleteSceneImage,
  onUploadEmptySceneImage,
  onUploadReferenceImage,
  scenePackage,
}: ChapterSceneStudioProps) {
  const [localScenePackage, setLocalScenePackage] = useState(scenePackage);
  const [activeLibraryDrawer, setActiveLibraryDrawer] = useState<LibraryDrawerKey | null>(null);
  const libraryDrawerTriggerRef = useRef<HTMLButtonElement | null>(null);
  const assemblyReadiness = useMemo(() => buildAssemblyReadiness(localScenePackage), [localScenePackage]);
  const pendingCount = Object.values(asyncStatus).filter((status) => status?.status === "pending").length;
  const steps = useMemo(
    () => buildStudioSteps(localScenePackage, assemblyReadiness.is_ready),
    [assemblyReadiness.is_ready, localScenePackage],
  );

  useEffect(() => {
    setLocalScenePackage(scenePackage);
  }, [scenePackage]);

  const handleSelectEmptySceneImage = useCallback(async (imageId: string) => {
    const nextScenePackage = await onSelectEmptySceneImage(imageId);
    if (nextScenePackage) {
      setLocalScenePackage(nextScenePackage);
    }
    return nextScenePackage;
  }, [onSelectEmptySceneImage]);

  const handleDeleteCompleteSceneImage = useCallback(async (completeImageId: string) => {
    const nextScenePackage = await onDeleteCompleteSceneImage(completeImageId);
    if (nextScenePackage) {
      setLocalScenePackage(nextScenePackage);
    }
    return nextScenePackage;
  }, [onDeleteCompleteSceneImage]);

  const handleLockFinal = useCallback(async () => {
    const file = await exportAssemblyPreviewFile(localScenePackage, localScenePackage.assembly);
    const nextScenePackage = await onLockFinal(file);
    if (nextScenePackage) {
      setLocalScenePackage(nextScenePackage);
    }
    return nextScenePackage;
  }, [localScenePackage, onLockFinal]);

  const openCharacterBindingDrawer = useCallback((trigger: HTMLButtonElement) => {
    libraryDrawerTriggerRef.current = trigger;
    setActiveLibraryDrawer("character");
  }, []);

  const openReferenceImagesDrawer = useCallback((trigger: HTMLButtonElement) => {
    libraryDrawerTriggerRef.current = trigger;
    setActiveLibraryDrawer("reference");
  }, []);

  const closeLibraryDrawer = useCallback(() => {
    const trigger = libraryDrawerTriggerRef.current;
    setActiveLibraryDrawer(null);
    if (trigger) {
      window.setTimeout(() => {
        trigger.focus();
      }, 0);
    }
  }, []);

  return (
    <>
      <div className="chapter-scene-studio">
        <StudioProgressRail steps={steps} />
        <ChapterStudioMain
          activeLibraryDrawer={activeLibraryDrawer}
          assemblyReadiness={assemblyReadiness}
          chapter={chapter}
          characterIps={characterIps}
          localScenePackage={localScenePackage}
          onAssignCharacterIp={onAssignCharacterIp}
          onCloseLibraryDrawer={closeLibraryDrawer}
          onDeleteCompleteSceneImage={handleDeleteCompleteSceneImage}
          onImportCompleteImage={onImportCompleteImage}
          onLockFinal={handleLockFinal}
          onOpenCharacterBindingDrawer={openCharacterBindingDrawer}
          onOpenReferenceImagesDrawer={openReferenceImagesDrawer}
          onSelectEmptySceneImage={handleSelectEmptySceneImage}
          onSelectReferenceImage={onSelectReferenceImage}
          onUpdatePrompt={onUpdatePrompt}
          onUploadCompleteSceneImage={onUploadCompleteSceneImage}
          onUploadEmptySceneImage={onUploadEmptySceneImage}
          onUploadReferenceImage={onUploadReferenceImage}
          pendingCount={pendingCount}
          referenceImages={referenceImages}
        />
      </div>
    </>
  );
}

function StudioProgressRail({
  steps,
}: {
  steps: StudioStep[];
}) {
  return (
    <aside className="chapter-studio-rail" aria-label="Studio progress">
      <div className="chapter-studio-rail-header">
        <h2>Studio Progress</h2>
      </div>
      <ol className="chapter-studio-step-list">
        {steps.map((step, index) => (
          <li key={step.key} className={`chapter-studio-step chapter-studio-step-${step.state}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <strong>{step.label}</strong>
                <small>{step.stateLabel}</small>
              </div>
            </li>
          ))}
      </ol>
    </aside>
  );
}

function ChapterStudioMain({
  activeLibraryDrawer,
  assemblyReadiness,
  chapter,
  characterIps,
  localScenePackage,
  onAssignCharacterIp,
  onCloseLibraryDrawer,
  onDeleteCompleteSceneImage,
  onImportCompleteImage,
  onLockFinal,
  onOpenCharacterBindingDrawer,
  onOpenReferenceImagesDrawer,
  onSelectEmptySceneImage,
  onSelectReferenceImage,
  onUpdatePrompt,
  onUploadCompleteSceneImage,
  onUploadEmptySceneImage,
  onUploadReferenceImage,
  pendingCount,
  referenceImages,
}: {
  activeLibraryDrawer: LibraryDrawerKey | null;
  assemblyReadiness: ReturnType<typeof buildAssemblyReadiness>;
  chapter: Chapter;
  characterIps: CharacterIpProfile[];
  localScenePackage: ChapterScenePackage;
  onAssignCharacterIp: ChapterSceneStudioProps["onAssignCharacterIp"];
  onCloseLibraryDrawer: () => void;
  onDeleteCompleteSceneImage: ChapterSceneStudioProps["onDeleteCompleteSceneImage"];
  onImportCompleteImage: ChapterSceneStudioProps["onImportCompleteImage"];
  onLockFinal: () => Promise<ChapterScenePackage | null>;
  onOpenCharacterBindingDrawer: (trigger: HTMLButtonElement) => void;
  onOpenReferenceImagesDrawer: (trigger: HTMLButtonElement) => void;
  onSelectEmptySceneImage: ChapterSceneStudioProps["onSelectEmptySceneImage"];
  onSelectReferenceImage: ChapterSceneStudioProps["onSelectReferenceImage"];
  onUpdatePrompt: ChapterSceneStudioProps["onUpdatePrompt"];
  onUploadCompleteSceneImage: ChapterSceneStudioProps["onUploadCompleteSceneImage"];
  onUploadEmptySceneImage: ChapterSceneStudioProps["onUploadEmptySceneImage"];
  onUploadReferenceImage: ChapterSceneStudioProps["onUploadReferenceImage"];
  pendingCount: number;
  referenceImages: ReferenceLibraryImage[];
}) {
  return (
    <div className="chapter-studio-main">
      <ChapterStudioTitle chapter={chapter} pendingCount={pendingCount} />
      <ChapterPreparationColumn
        activeLibraryDrawer={activeLibraryDrawer}
        assemblyReadiness={assemblyReadiness}
        chapter={chapter}
        characterIps={characterIps}
        localScenePackage={localScenePackage}
        onAssignCharacterIp={onAssignCharacterIp}
        onCloseLibraryDrawer={onCloseLibraryDrawer}
        onOpenCharacterBindingDrawer={onOpenCharacterBindingDrawer}
        onOpenReferenceImagesDrawer={onOpenReferenceImagesDrawer}
        onSelectReferenceImage={onSelectReferenceImage}
        onUpdatePrompt={onUpdatePrompt}
        onUploadReferenceImage={onUploadReferenceImage}
        referenceImages={referenceImages}
      />
      <ChapterMediaColumn
        assemblyReadiness={assemblyReadiness}
        localScenePackage={localScenePackage}
        onDeleteCompleteSceneImage={onDeleteCompleteSceneImage}
        onImportCompleteImage={onImportCompleteImage}
        onLockFinal={onLockFinal}
        onSelectEmptySceneImage={onSelectEmptySceneImage}
        onUploadCompleteSceneImage={onUploadCompleteSceneImage}
        onUploadEmptySceneImage={onUploadEmptySceneImage}
      />
    </div>
  );
}

function ChapterStudioTitle({
  chapter,
  pendingCount,
}: {
  chapter: Chapter;
  pendingCount: number;
}) {
  return (
    <header className="chapter-studio-main-heading">
      <div>
        <h1>{chapter.title}</h1>
        <span>{chapter.summary}</span>
      </div>
      <span className="chapter-studio-save-indicator">{pendingCount > 0 ? "Syncing" : "Saved"}</span>
    </header>
  );
}

function ChapterPreparationColumn({
  activeLibraryDrawer,
  assemblyReadiness,
  chapter,
  characterIps,
  localScenePackage,
  onAssignCharacterIp,
  onCloseLibraryDrawer,
  onOpenCharacterBindingDrawer,
  onOpenReferenceImagesDrawer,
  onSelectReferenceImage,
  onUpdatePrompt,
  onUploadReferenceImage,
  referenceImages,
}: {
  activeLibraryDrawer: LibraryDrawerKey | null;
  assemblyReadiness: ReturnType<typeof buildAssemblyReadiness>;
  chapter: Chapter;
  characterIps: CharacterIpProfile[];
  localScenePackage: ChapterScenePackage;
  onAssignCharacterIp: ChapterSceneStudioProps["onAssignCharacterIp"];
  onCloseLibraryDrawer: () => void;
  onOpenCharacterBindingDrawer: (trigger: HTMLButtonElement) => void;
  onOpenReferenceImagesDrawer: (trigger: HTMLButtonElement) => void;
  onSelectReferenceImage: ChapterSceneStudioProps["onSelectReferenceImage"];
  onUpdatePrompt: ChapterSceneStudioProps["onUpdatePrompt"];
  onUploadReferenceImage: ChapterSceneStudioProps["onUploadReferenceImage"];
  referenceImages: ReferenceLibraryImage[];
}) {
  return (
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
        onOpenCharacterBindingDrawer={onOpenCharacterBindingDrawer}
        onOpenReferenceImagesDrawer={onOpenReferenceImagesDrawer}
        onSelectReferenceImage={onSelectReferenceImage}
        onUploadReferenceImage={onUploadReferenceImage}
      />
      <LibraryActionDrawer
        activeDrawer={activeLibraryDrawer}
        availableCharacterIps={characterIps.filter((item) => item.status === "available")}
        availableReferences={referenceImages.filter((item) => item.status === "available")}
        onAssignCharacterIp={onAssignCharacterIp}
        onClose={onCloseLibraryDrawer}
        onSelectReferenceImage={onSelectReferenceImage}
        onUploadReferenceImage={onUploadReferenceImage}
        scenePackage={localScenePackage}
      />
      <ChapterAssemblySummary
        assemblyReadiness={assemblyReadiness}
        chapter={chapter}
        scenePackage={localScenePackage}
      />
    </div>
  );
}

function LibraryActionDrawer({
  activeDrawer,
  availableCharacterIps,
  availableReferences,
  onAssignCharacterIp,
  onClose,
  onSelectReferenceImage,
  onUploadReferenceImage,
  scenePackage,
}: {
  activeDrawer: LibraryDrawerKey | null;
  availableCharacterIps: CharacterIpProfile[];
  availableReferences: ReferenceLibraryImage[];
  onAssignCharacterIp: ChapterSceneStudioProps["onAssignCharacterIp"];
  onClose: () => void;
  onSelectReferenceImage: ChapterSceneStudioProps["onSelectReferenceImage"];
  onUploadReferenceImage: ChapterSceneStudioProps["onUploadReferenceImage"];
  scenePackage: ChapterScenePackage;
}) {
  if (activeDrawer === null) {
    return null;
  }

  const isCharacterDrawer = activeDrawer === "character";
  return (
    <CoursePlannerDrawer
      ariaLabel={isCharacterDrawer ? "Bind Character IP" : "Upload Reference"}
      backdrop
      description={isCharacterDrawer ? "Bind an available character profile into this chapter scene package." : "Upload or select reference images for prompt grounding."}
      isOpen
      onClose={onClose}
      title={isCharacterDrawer ? "Bind Character IP" : "Upload Reference"}
    >
      {isCharacterDrawer ? (
        <CharacterBindingPanel
          availableCharacterIps={availableCharacterIps}
          onAssignCharacterIp={onAssignCharacterIp}
          scenePackage={scenePackage}
        />
      ) : (
        <ReferenceImagesPanel
          availableReferences={availableReferences}
          onSelectReferenceImage={onSelectReferenceImage}
          onUploadReferenceImage={onUploadReferenceImage}
        />
      )}
    </CoursePlannerDrawer>
  );
}

function ChapterMediaColumn({
  assemblyReadiness,
  localScenePackage,
  onDeleteCompleteSceneImage,
  onImportCompleteImage,
  onLockFinal,
  onSelectEmptySceneImage,
  onUploadCompleteSceneImage,
  onUploadEmptySceneImage,
}: {
  assemblyReadiness: ReturnType<typeof buildAssemblyReadiness>;
  localScenePackage: ChapterScenePackage;
  onDeleteCompleteSceneImage: ChapterSceneStudioProps["onDeleteCompleteSceneImage"];
  onImportCompleteImage: ChapterSceneStudioProps["onImportCompleteImage"];
  onLockFinal: () => Promise<ChapterScenePackage | null>;
  onSelectEmptySceneImage: ChapterSceneStudioProps["onSelectEmptySceneImage"];
  onUploadCompleteSceneImage: ChapterSceneStudioProps["onUploadCompleteSceneImage"];
  onUploadEmptySceneImage: ChapterSceneStudioProps["onUploadEmptySceneImage"];
}) {
  return (
    <div className="chapter-studio-column">
      <EmptySceneImagesPanel
        scenePackage={localScenePackage}
        onSelectEmptySceneImage={onSelectEmptySceneImage}
        onUploadEmptySceneImage={onUploadEmptySceneImage}
      />
      <CompleteSceneImagesPanel
        scenePackage={localScenePackage}
        onDeleteCompleteSceneImage={onDeleteCompleteSceneImage}
        onImportCompleteImage={onImportCompleteImage}
        onUploadCompleteSceneImage={onUploadCompleteSceneImage}
      />
      <FinalScenePanel
        assemblyReadiness={assemblyReadiness}
        scenePackage={localScenePackage}
        onLockFinal={onLockFinal}
      />
    </div>
  );
}

function ChapterAssemblySummary({
  assemblyReadiness,
  chapter,
  scenePackage,
}: {
  assemblyReadiness: ReturnType<typeof buildAssemblyReadiness>;
  chapter: Chapter;
  scenePackage: ChapterScenePackage;
}) {
  const assemblyCoverageLabel = targetCoverageSummary(assemblyReadiness.target_coverage);
  const assemblyReadinessLabel = assemblyReadiness.is_ready
    ? "Ready for final lock."
    : assemblyBlockerSummary(assemblyReadiness.reasons);

  return (
    <section className="chapter-studio-panel chapter-assembly-summary-card" aria-label="Assembly summary">
      <div className="chapter-assembly-summary-heading">
        <div className="chapter-assembly-summary-copy">
          <h2>Assembly</h2>
          <p>{assemblyReadiness.is_ready ? "Ready" : "Needs review"}</p>
        </div>
        <div className="chapter-assembly-summary-actions">
          <CoursePlannerStatusBadge tone="success">Saved</CoursePlannerStatusBadge>
          {/* WHY: Chapter 是准备和状态聚合页；摆放编辑器有独立路由。
              这里只保留 Assembly 摘要和入口，避免把高频 canvas 工作台塞回 Chapter。 */}
          <Link
            className="course-planner-primary-action"
            to={`/course-planner/chapters/${encodeURIComponent(chapter.id)}/assembly`}
          >
            Open Assembly Editor
          </Link>
        </div>
      </div>
      <dl className="chapter-assembly-summary-metrics">
        <div>
          <dt>Placements</dt>
          <dd>{scenePackage.assembly.placements.length}</dd>
        </div>
        <div>
          <dt>Target coverage</dt>
          <dd>{assemblyCoverageLabel}</dd>
        </div>
        <div>
          <dt>Readiness blockers</dt>
          <dd>{assemblyReadinessLabel}</dd>
        </div>
      </dl>
    </section>
  );
}

function buildStudioSteps(
  scenePackage: ChapterScenePackage,
  currentAssemblyReady: boolean,
): StudioStep[] {
  return [
    buildStudioStep("prompt", "Prompt", promptReadinessState(scenePackage)),
    buildStudioStep("empty-scene", "Empty Scene", emptySceneState(scenePackage)),
    buildStudioStep("images", "Images", completeImagesState(scenePackage)),
    buildStudioStep("assembly", "Assembly", assemblyState(scenePackage, currentAssemblyReady), {
      pending: "In Progress",
    }),
    buildStudioStep("final", "Final", finalState(scenePackage, currentAssemblyReady), {
      ready: scenePackage.final_scene ? "Locked" : "Complete",
    }),
  ];
}

function buildStudioStep(
  key: string,
  label: string,
  state: StudioStepState,
  labels: Partial<Record<StudioStepState, string>> = {},
): StudioStep {
  return {
    key,
    label,
    state,
    stateLabel: labels[state] ?? defaultStudioStepStateLabel(state),
  };
}

function defaultStudioStepStateLabel(state: StudioStepState): string {
  if (state === "ready") {
    return "Complete";
  }
  if (state === "pending") {
    return "Pending";
  }
  return "Not Started";
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

function targetCoverageSummary(
  coverage: ReturnType<typeof buildAssemblyReadiness>["target_coverage"],
): string {
  if (coverage.length === 0) {
    return "No target objects";
  }
  const coveredCount = coverage.filter((item) => item.status === "covered").length;
  return `${coveredCount}/${coverage.length} targets covered`;
}

function assemblyBlockerSummary(reasons: string[]): string {
  if (reasons.length === 0) {
    return "No blockers.";
  }
  if (reasons.length === 1) {
    return reasons[0];
  }
  return `${reasons.length} blockers: ${reasons[0]}`;
}
