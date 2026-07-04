import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";

import {
  assignCharacterIpToChapter,
  deleteChapterAsset,
  deleteCompleteSceneImage,
  fetchChapterScenePackage,
  importCompleteSceneImageToPipeline,
  listCharacterIps,
  listReferenceLibraryImages,
  lockFinalChapterScene,
  saveChapterSceneAssembly,
  selectChapterReferenceImage,
  selectEmptySceneImage,
  updateChapterScenePrompt,
  uploadCompleteSceneImage,
  uploadDirectChapterAsset,
  uploadEmptySceneImage,
  uploadReferenceLibraryImage,
} from "../api";
import { isAssemblyReady } from "../assembly/assemblyReadiness";
import type {
  ChapterCastAssignmentInput,
  ChapterReferenceSelectionInput,
  ChapterScenePromptInput,
  CompleteImageUploadInput,
  DirectChapterAssetUploadInput,
  EmptySceneImageUploadInput,
  ReferenceLibraryImageUploadInput,
} from "../api";
import { ChapterSceneStudio } from "../components/ChapterSceneStudio";
import { CoursePlannerPageHeader } from "../components/CoursePlannerChrome";
import "../components/coursePlanner.css";
import "../components/coursePlannerPanels.css";
import "../components/assemblyWorkspace.css";
import { useCoursePlannerState } from "../hooks/useCoursePlannerState";
import type {
  Chapter,
  ChapterScenePackage,
  CharacterIpProfile,
  CoursePlannerState,
  ReferenceLibraryImage,
} from "../types";

type ScenePackageLoadState = "idle" | "loading" | "ready" | "error";
type CoursePlannerController = ReturnType<typeof useCoursePlannerState>;
type AsyncOperationRunner = CoursePlannerController["runAsyncOperation"];

export function ChapterWorkspacePage() {
  const { chapterId } = useParams();
  const planner = useCoursePlannerState();
  const { chapter, scenePack } = useChapterContext(planner, chapterId ?? null);
  const studioData = useChapterStudioData(chapter, planner.runAsyncOperation);
  const handlers = useChapterStudioMutations(chapter, planner.runAsyncOperation, studioData);
  const { characterIps, errorMessage, loadState, referenceImages, scenePackage } = studioData;

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
      <CoursePlannerPageHeader
        backTo="/course-planner"
        backLabel="Back to board"
        eyebrow={`${scenePack.title} / Chapter Scene Studio`}
        title={chapter.title}
        subtitle={chapter.summary}
        status={studioStatusLabel(loadState, scenePackage)}
        statusTone={studioStatusTone(loadState, scenePackage)}
      />
      {loadState === "loading" && !scenePackage ? (
        <section className="chapter-workspace-panel" aria-label="Chapter Scene Package Loading">
          <h2>Loading Scene Package</h2>
          <p>Loading the latest chapter scene-package snapshot.</p>
        </section>
      ) : null}
      {loadState === "error" ? (
        <section className="chapter-workspace-panel" aria-label="Chapter Scene Package Error">
          <h2>Scene Package Unavailable</h2>
          <p>{errorMessage ?? "Could not load Chapter Scene Package."}</p>
        </section>
      ) : null}
      {scenePackage ? (
        <ChapterSceneStudio
          chapter={chapter}
          scenePack={scenePack}
          scenePackage={scenePackage}
          characterIps={characterIps}
          referenceImages={referenceImages}
          asyncStatus={planner.state.asyncStatus}
          onAssignCharacterIp={handlers.handleAssignCharacterIp}
          onSelectReferenceImage={handlers.handleSelectReferenceImage}
          onUpdatePrompt={handlers.handleUpdatePrompt}
          onUploadReferenceImage={handlers.handleUploadReferenceImage}
          onUploadEmptySceneImage={handlers.handleUploadEmptySceneImage}
          onSelectEmptySceneImage={handlers.handleSelectEmptySceneImage}
          onUploadCompleteSceneImage={handlers.handleUploadCompleteSceneImage}
          onDeleteCompleteSceneImage={handlers.handleDeleteCompleteSceneImage}
          onImportCompleteImage={handlers.handleImportCompleteImage}
          onUploadDirectAsset={handlers.handleUploadDirectAsset}
          onDeleteChapterAsset={handlers.handleDeleteChapterAsset}
          onSaveAssembly={handlers.handleSaveAssembly}
          onLockFinal={handlers.handleLockFinal}
        />
      ) : null}
    </main>
  );
}

function useChapterContext(planner: CoursePlannerController, chapterId: string | null) {
  const chapter = useMemo(() => findChapter(planner.state, chapterId), [chapterId, planner.state]);
  const scenePack = useMemo(
    () => (chapter ? planner.state.scenePacks.find((pack) => pack.id === chapter.scenePackId) ?? null : null),
    [chapter, planner.state.scenePacks],
  );

  useEffect(() => {
    if (!chapter) {
      return;
    }
    // WHY: Chapter workspace 的路由是唯一上下文入口；进入页面时同步 planner 选中状态，
    // 避免 board 选中结果滞后，导致数据面板指向别的 chapter。
    if (planner.state.activeScenePackId !== chapter.scenePackId) {
      planner.setActiveScenePackId(chapter.scenePackId);
    }
    if (planner.state.selectedChapterId !== chapter.id) {
      planner.setSelectedChapterId(chapter.id);
    }
  }, [chapter, planner]);

  return { chapter, scenePack };
}

function useChapterStudioData(chapter: Chapter | null, runAsyncOperation: AsyncOperationRunner) {
  const [scenePackage, setScenePackage] = useState<ChapterScenePackage | null>(null);
  const [characterIps, setCharacterIps] = useState<CharacterIpProfile[]>([]);
  const [referenceImages, setReferenceImages] = useState<ReferenceLibraryImage[]>([]);
  const [loadState, setLoadState] = useState<ScenePackageLoadState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadScenePackage = useCallback(async () => {
    if (!chapter) {
      setScenePackage(null);
      setCharacterIps([]);
      setReferenceImages([]);
      setLoadState("idle");
      setErrorMessage(null);
      return null;
    }
    setLoadState("loading");
    setErrorMessage(null);
    const nextStudioData = await runAsyncOperation(`scenePackage:load:${chapter.id}`, () =>
      Promise.all([
        fetchChapterScenePackage(chapter.id),
        listCharacterIps(),
        listReferenceLibraryImages(),
      ]));
    if (!nextStudioData) {
      setScenePackage(null);
      setLoadState("error");
      setErrorMessage("Could not load Chapter Scene Package.");
      return null;
    }
    const [nextScenePackage, nextCharacterIps, nextReferenceImages] = nextStudioData;
    setScenePackage(nextScenePackage);
    setCharacterIps(nextCharacterIps);
    setReferenceImages(nextReferenceImages);
    setLoadState("ready");
    return nextScenePackage;
  }, [chapter, runAsyncOperation]);

  useEffect(() => {
    let cancelled = false;
    void loadScenePackage().catch((error: unknown) => {
      if (cancelled) {
        return;
      }
      setScenePackage(null);
      setLoadState("error");
      setErrorMessage(error instanceof Error ? error.message : "Could not load Chapter Scene Package.");
    });
    return () => {
      cancelled = true;
    };
  }, [loadScenePackage]);

  const applyScenePackage = useCallback(async (operationKey: string, operation: () => Promise<ChapterScenePackage>) => {
    const nextScenePackage = await runAsyncOperation(operationKey, operation);
    if (nextScenePackage) {
      setScenePackage(nextScenePackage);
      setLoadState("ready");
    }
    return nextScenePackage;
  }, [runAsyncOperation]);

  return {
    applyScenePackage,
    characterIps,
    errorMessage,
    loadState,
    referenceImages,
    scenePackage,
    setLoadState,
    setReferenceImages,
    setScenePackage,
  };
}

function useChapterStudioMutations(
  chapter: Chapter | null,
  runAsyncOperation: AsyncOperationRunner,
  studioData: ReturnType<typeof useChapterStudioData>,
) {
  const { applyScenePackage, setLoadState, setReferenceImages, setScenePackage } = studioData;
  const withChapter = useCallback(
    (key: string, operation: (chapter: Chapter) => Promise<ChapterScenePackage>) =>
      chapter ? applyScenePackage(`scenePackage:${key}:${chapter.id}`, () => operation(chapter)) : Promise.resolve(null),
    [applyScenePackage, chapter],
  );
  const handleUpdatePrompt = useCallback(
    (input: ChapterScenePromptInput) => withChapter("prompt", (item) => updateChapterScenePrompt(item.id, input)),
    [withChapter],
  );
  const handleSelectReferenceImage = useCallback(
    (input: ChapterReferenceSelectionInput) => withChapter("referenceSelect", (item) => selectChapterReferenceImage(item.id, input)),
    [withChapter],
  );
  const handleAssignCharacterIp = useCallback(
    (input: ChapterCastAssignmentInput) => withChapter("castAssign", (item) => assignCharacterIpToChapter(item.id, input)),
    [withChapter],
  );
  const handleUploadEmptySceneImage = useCallback(
    (file: File, input: EmptySceneImageUploadInput) => withChapter("emptyUpload", (item) => uploadEmptySceneImage(item.id, file, input)),
    [withChapter],
  );
  const handleSelectEmptySceneImage = useCallback(
    (imageId: string) => withChapter("emptySelect", (item) => selectEmptySceneImage(item.id, imageId)),
    [withChapter],
  );
  const handleUploadCompleteSceneImage = useCallback(
    (file: File, input: CompleteImageUploadInput) => withChapter("completeUpload", (item) => uploadCompleteSceneImage(item.id, file, input)),
    [withChapter],
  );
  const handleDeleteCompleteSceneImage = useCallback(
    (completeImageId: string) => withChapter("completeDelete", (item) => deleteCompleteSceneImage(item.id, completeImageId)),
    [withChapter],
  );
  const handleUploadDirectAsset = useCallback(
    (file: File, input: DirectChapterAssetUploadInput) => withChapter("assetUpload", (item) => uploadDirectChapterAsset(item.id, file, input)),
    [withChapter],
  );
  const handleDeleteChapterAsset = useCallback(
    (assetId: string) => withChapter("assetDelete", (item) => deleteChapterAsset(item.id, assetId)),
    [withChapter],
  );
  const handleSaveAssembly = useCallback(
    (manifest: ChapterScenePackage["assembly"]) => withChapter("assemblySave", (item) => saveChapterSceneAssembly(item.id, manifest)),
    [withChapter],
  );
  const handleLockFinal = useCallback(
    (file: File) => withChapter("final", (item) => lockFinalChapterScene(item.id, file)),
    [withChapter],
  );
  const handleUploadReferenceImage = useCallback(async (file: File, input: ReferenceLibraryImageUploadInput) => {
    const referenceImage = await runAsyncOperation("scenePackage:referenceUpload", () => uploadReferenceLibraryImage(file, input));
    if (referenceImage) {
      setReferenceImages((current) => [...current.filter((item) => item.id !== referenceImage.id), referenceImage]);
    }
    return referenceImage;
  }, [runAsyncOperation, setReferenceImages]);
  const handleImportCompleteImage = useCallback(async (completeImageId: string) => {
    if (!chapter) {
      return null;
    }
    const result = await runAsyncOperation(
      `scenePackage:completeImport:${chapter.id}:${completeImageId}`,
      () => importCompleteSceneImageToPipeline(chapter.id, completeImageId),
    );
    if (!result) {
      return null;
    }
    setScenePackage(result.scenePackage);
    setLoadState("ready");
    return result.scenePackage;
  }, [chapter, runAsyncOperation, setLoadState, setScenePackage]);

  return {
    handleAssignCharacterIp,
    handleImportCompleteImage,
    handleLockFinal,
    handleDeleteChapterAsset,
    handleDeleteCompleteSceneImage,
    handleSelectEmptySceneImage,
    handleSelectReferenceImage,
    handleSaveAssembly,
    handleUpdatePrompt,
    handleUploadCompleteSceneImage,
    handleUploadDirectAsset,
    handleUploadEmptySceneImage,
    handleUploadReferenceImage,
  };
}

function findChapter(state: CoursePlannerState, chapterId: string | null): Chapter | null {
  if (!chapterId) {
    return null;
  }
  return Object.values(state.chaptersByScenePackId)
    .flat()
    .find((chapter) => chapter.id === chapterId) ?? null;
}

export function studioStatusLabel(loadState: ScenePackageLoadState, scenePackage: ChapterScenePackage | null): string {
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
  if (isAssemblyReady(scenePackage)) {
    return "Assembly ready";
  }
  if (scenePackage.complete_images.length > 0) {
    return "Images ready";
  }
  if (scenePackage.empty_scene_images.length > 0) {
    return "Empty scene ready";
  }
  return "Prompt drafted";
}

export function studioStatusTone(
  loadState: ScenePackageLoadState,
  scenePackage: ChapterScenePackage | null,
): "neutral" | "warning" | "success" | "danger" {
  if (loadState === "error") {
    return "danger";
  }
  if (scenePackage?.final_scene) {
    return "success";
  }
  if ((scenePackage && isAssemblyReady(scenePackage)) || scenePackage?.empty_scene_images.length) {
    return "warning";
  }
  return "neutral";
}
