import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";

import type {
  AsyncStatusMap,
  Chapter,
  ChapterScenePackage,
  CharacterIpProfile,
  SceneStyleReference,
} from "../types";
import type {
  CompleteImageUploadInput,
  EmptySceneImageUploadInput,
} from "../api";
import { buildAssemblyReadiness } from "../assembly/assemblyReadiness";
import { exportAssemblyPreviewFile } from "../assembly/assemblyExport";
import { chapterPromptStatus } from "../domain/chapterPromptStatus";
import { ChapterPromptGenerationPanel } from "./ChapterPromptGenerationPanel";
import { CompleteSceneImagesPanel } from "./CompleteSceneImagesPanel";
import { CoursePlannerResizableColumns } from "./CoursePlannerChrome";
import { EmptySceneImagesPanel } from "./EmptySceneImagesPanel";
import { FinalScenePanel } from "./FinalScenePanel";

type ChapterSceneStudioProps = {
  chapter: Chapter;
  scenePackage: ChapterScenePackage;
  characterIps: CharacterIpProfile[];
  sceneStyles: SceneStyleReference[];
  asyncStatus: AsyncStatusMap;
  isGeneratingPrompt: boolean;
  onGeneratePrompt: (feedback: string) => Promise<ChapterScenePackage | null>;
  onSelectCharacters: (characterIpIds: string[]) => Promise<ChapterScenePackage | null>;
  onSelectSceneStyle: (sceneStyleId: string) => Promise<ChapterScenePackage | null>;
  onClearSceneStyle: () => Promise<ChapterScenePackage | null>;
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

export function ChapterSceneStudio({
  chapter,
  characterIps,
  isGeneratingPrompt,
  sceneStyles,
  onClearSceneStyle,
  onGeneratePrompt,
  onImportCompleteImage,
  onLockFinal,
  onDeleteCompleteSceneImage,
  onSelectEmptySceneImage,
  onSelectCharacters,
  onSelectSceneStyle,
  onUploadCompleteSceneImage,
  onUploadEmptySceneImage,
  scenePackage,
}: ChapterSceneStudioProps) {
  const [localScenePackage, setLocalScenePackage] = useState(scenePackage);
  const assemblyReadiness = useMemo(() => buildAssemblyReadiness(localScenePackage), [localScenePackage]);
  const promptStatus = chapterPromptStatus(localScenePackage, characterIps, sceneStyles, isGeneratingPrompt);
  const steps = useMemo(
    () => buildStudioSteps(localScenePackage, assemblyReadiness.is_ready, promptStatus),
    [assemblyReadiness.is_ready, localScenePackage, promptStatus],
  );

  useEffect(() => {
    setLocalScenePackage(scenePackage);
  }, [scenePackage]);

  const applyMutation = useCallback(async (
    operation: () => Promise<ChapterScenePackage | null>,
  ) => {
    const nextScenePackage = await operation();
    if (nextScenePackage) {
      setLocalScenePackage(nextScenePackage);
    }
    return nextScenePackage;
  }, []);

  const handleSelectCharacters = useCallback(
    (characterIpIds: string[]) => applyMutation(() => onSelectCharacters(characterIpIds)),
    [applyMutation, onSelectCharacters],
  );
  const handleSelectSceneStyle = useCallback(
    (sceneStyleId: string) => applyMutation(() => onSelectSceneStyle(sceneStyleId)),
    [applyMutation, onSelectSceneStyle],
  );
  const handleClearSceneStyle = useCallback(
    () => applyMutation(onClearSceneStyle),
    [applyMutation, onClearSceneStyle],
  );
  const handleGeneratePrompt = useCallback(
    (feedback: string) => applyMutation(() => onGeneratePrompt(feedback)),
    [applyMutation, onGeneratePrompt],
  );

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

  return (
    <>
      <CoursePlannerResizableColumns
        ariaLabel="Chapter Scene Studio columns"
        className="chapter-scene-studio"
        groupId="chapter-scene-studio-layout"
        storageKey="course-planner:chapter-scene-studio-layout"
        left={{
          id: "studio-progress",
          defaultSize: "19%",
          minSize: "260px",
          maxSize: "380px",
          className: "chapter-scene-studio__rail",
          children: <StudioProgressRail steps={steps} />,
        }}
        center={{
          id: "chapter-preparation",
          defaultSize: "39%",
          minSize: "430px",
          className: "chapter-scene-studio__preparation",
          children: (
            <ChapterPreparationColumn
              assemblyReadiness={assemblyReadiness}
              chapter={chapter}
              characterIps={characterIps}
              isGeneratingPrompt={isGeneratingPrompt}
              localScenePackage={localScenePackage}
              onClearSceneStyle={handleClearSceneStyle}
              onGeneratePrompt={handleGeneratePrompt}
              onSelectCharacters={handleSelectCharacters}
              onSelectSceneStyle={handleSelectSceneStyle}
              sceneStyles={sceneStyles}
            />
          ),
        }}
        right={{
          id: "chapter-media",
          defaultSize: "42%",
          minSize: "520px",
          maxSize: "760px",
          className: "chapter-scene-studio__media",
          children: (
            <ChapterMediaColumn
              assemblyReadiness={assemblyReadiness}
              localScenePackage={localScenePackage}
              onDeleteCompleteSceneImage={handleDeleteCompleteSceneImage}
              onImportCompleteImage={onImportCompleteImage}
              onLockFinal={handleLockFinal}
              onSelectEmptySceneImage={handleSelectEmptySceneImage}
              onUploadCompleteSceneImage={onUploadCompleteSceneImage}
              onUploadEmptySceneImage={onUploadEmptySceneImage}
              promptReady={promptStatus === "prompt_ready"}
            />
          ),
        }}
      />
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

function ChapterPreparationColumn({
  assemblyReadiness,
  chapter,
  characterIps,
  isGeneratingPrompt,
  localScenePackage,
  onClearSceneStyle,
  onGeneratePrompt,
  onSelectCharacters,
  onSelectSceneStyle,
  sceneStyles,
}: {
  assemblyReadiness: ReturnType<typeof buildAssemblyReadiness>;
  chapter: Chapter;
  characterIps: CharacterIpProfile[];
  isGeneratingPrompt: boolean;
  localScenePackage: ChapterScenePackage;
  onClearSceneStyle: ChapterSceneStudioProps["onClearSceneStyle"];
  onGeneratePrompt: ChapterSceneStudioProps["onGeneratePrompt"];
  onSelectCharacters: ChapterSceneStudioProps["onSelectCharacters"];
  onSelectSceneStyle: ChapterSceneStudioProps["onSelectSceneStyle"];
  sceneStyles: SceneStyleReference[];
}) {
  return (
    <div className="chapter-studio-column">
      <ChapterPromptGenerationPanel
        characterIps={characterIps}
        isGeneratingPrompt={isGeneratingPrompt}
        onClearSceneStyle={onClearSceneStyle}
        onGeneratePrompt={onGeneratePrompt}
        onSelectCharacters={onSelectCharacters}
        onSelectSceneStyle={onSelectSceneStyle}
        sceneStyles={sceneStyles}
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

function ChapterMediaColumn({
  assemblyReadiness,
  localScenePackage,
  onDeleteCompleteSceneImage,
  onImportCompleteImage,
  onLockFinal,
  onSelectEmptySceneImage,
  onUploadCompleteSceneImage,
  onUploadEmptySceneImage,
  promptReady,
}: {
  assemblyReadiness: ReturnType<typeof buildAssemblyReadiness>;
  localScenePackage: ChapterScenePackage;
  onDeleteCompleteSceneImage: ChapterSceneStudioProps["onDeleteCompleteSceneImage"];
  onImportCompleteImage: ChapterSceneStudioProps["onImportCompleteImage"];
  onLockFinal: () => Promise<ChapterScenePackage | null>;
  onSelectEmptySceneImage: ChapterSceneStudioProps["onSelectEmptySceneImage"];
  onUploadCompleteSceneImage: ChapterSceneStudioProps["onUploadCompleteSceneImage"];
  onUploadEmptySceneImage: ChapterSceneStudioProps["onUploadEmptySceneImage"];
  promptReady: boolean;
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
        promptReady={promptReady}
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
  promptStatus: ReturnType<typeof chapterPromptStatus>,
): StudioStep[] {
  return [
    buildStudioStep(
      "prompt",
      "Prompt",
      promptStatus === "prompt_ready" ? "ready" : "pending",
      {
        pending: promptStatus === "needs_regeneration" ? "Needs regeneration" : "Pending",
      },
    ),
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
