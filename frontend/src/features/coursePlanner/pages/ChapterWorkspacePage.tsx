import { useParams } from "react-router";

import { chapterPromptStatus, chapterPromptStatusLabel } from "../domain/chapterPromptStatus";
import { ChapterSceneStudio } from "../components/ChapterSceneStudio";
import {
  CoursePlannerPageHeader,
  CoursePlannerStatusBadge,
  CoursePlannerWorkspaceHeader,
} from "../components/CoursePlannerChrome";
import "../components/coursePlanner.css";
import "../components/coursePlannerPanels.css";
import "../components/chapterStudioShared.css";
import "../components/chapterMediaPanels.css";
import "../components/chapterStudioLayout.css";
import { useChapterScenePackageWorkspace } from "../hooks/useChapterScenePackageWorkspace";
import type { ChapterScenePackage, CharacterIpProfile, SceneStyleReference } from "../types";

type ScenePackageLoadState = ReturnType<typeof useChapterScenePackageWorkspace>["loadState"];

export function ChapterWorkspacePage() {
  const { chapterId } = useParams();
  const workspace = useChapterScenePackageWorkspace(chapterId ?? null);
  const { asyncStatus, chapter, characterIps, errorMessage, handlers, loadState, scenePackage, scenePack, sceneStyles } = workspace;

  if (!chapter || !scenePack) {
    return (
      <main className="chapter-workspace-page">
        <CoursePlannerPageHeader backTo="/course-planner" backLabel="Back to board" title="Chapter not found" />
        <p className="course-planner-empty">Select a Chapter from the Course Planner board.</p>
      </main>
    );
  }

  return (
    <main className="chapter-workspace-page">
      <CoursePlannerWorkspaceHeader
        backTo="/course-planner"
        backLabel="Back to board"
        title={chapter.title}
        status={(
          <CoursePlannerStatusBadge
            label={studioStatusLabel(
              loadState,
              scenePackage,
              characterIps,
              sceneStyles,
              workspace.isGeneratingPrompt,
            )}
            tone={studioStatusTone(
              loadState,
              scenePackage,
              characterIps,
              sceneStyles,
              workspace.isGeneratingPrompt,
            )}
            role="status"
          />
        )}
      />
      <div className="chapter-workspace-route-body">
        {loadState === "loading" && !scenePackage ? (
          <section className="chapter-workspace-panel course-planner-route-placeholder" aria-label="Chapter Scene Package Loading">
            <h2>Loading Scene Package</h2>
            <p>Loading the latest chapter scene-package snapshot.</p>
          </section>
        ) : null}
        {loadState === "error" ? (
          <section className="chapter-workspace-panel course-planner-route-placeholder" aria-label="Chapter Scene Package Error">
            <h2>Scene Package Unavailable</h2>
            <p>{errorMessage ?? "Could not load Chapter Scene Package."}</p>
          </section>
        ) : null}
        {scenePackage ? (
          <ChapterSceneStudio
            chapter={chapter}
            scenePackage={scenePackage}
            characterIps={characterIps}
            sceneStyles={sceneStyles}
            asyncStatus={asyncStatus}
            isGeneratingPrompt={workspace.isGeneratingPrompt}
            onClearSceneStyle={handlers.handleClearSceneStyle}
            onGeneratePrompt={handlers.handleGeneratePrompt}
            onSelectCharacters={handlers.handleSelectCharacters}
            onSelectSceneStyle={handlers.handleSelectSceneStyle}
            onUploadEmptySceneImage={handlers.handleUploadEmptySceneImage}
            onSelectEmptySceneImage={handlers.handleSelectEmptySceneImage}
            onUploadCompleteSceneImage={handlers.handleUploadCompleteSceneImage}
            onDeleteCompleteSceneImage={handlers.handleDeleteCompleteSceneImage}
            onImportCompleteImage={handlers.handleImportCompleteImage}
            onLockFinal={handlers.handleLockFinal}
          />
        ) : null}
      </div>
    </main>
  );
}

export function studioStatusLabel(
  loadState: ScenePackageLoadState,
  scenePackage: ChapterScenePackage | null,
  characterIps: CharacterIpProfile[] = [],
  sceneStyles: SceneStyleReference[] = [],
  isGeneratingPrompt = false,
): string {
  if (loadState === "loading" && !scenePackage) {
    return "Loading";
  }
  if (loadState === "error") {
    return "Load failed";
  }
  if (!scenePackage) {
    return "Idle";
  }
  if (scenePackage.final_scene) {
    return "Final locked";
  }
  return chapterPromptStatusLabel(
    chapterPromptStatus(scenePackage, characterIps, sceneStyles, isGeneratingPrompt),
  );
}

export function studioStatusTone(
  loadState: ScenePackageLoadState,
  scenePackage: ChapterScenePackage | null,
  characterIps: CharacterIpProfile[] = [],
  sceneStyles: SceneStyleReference[] = [],
  isGeneratingPrompt = false,
): "neutral" | "warning" | "success" | "danger" {
  if (loadState === "error") {
    return "danger";
  }
  if (scenePackage?.final_scene) {
    return "success";
  }
  if (scenePackage && chapterPromptStatus(
    scenePackage,
    characterIps,
    sceneStyles,
    isGeneratingPrompt,
  ) === "needs_regeneration") {
    return "warning";
  }
  return "neutral";
}
