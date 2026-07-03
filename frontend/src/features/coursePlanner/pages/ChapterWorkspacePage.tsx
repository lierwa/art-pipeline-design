import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";

import {
  fetchChapterScenePackage,
  lockFinalChapterScene,
  saveChapterSceneAssembly,
  selectEmptySceneImage,
  updateChapterScenePrompt,
  uploadCompleteSceneImage,
  uploadDirectChapterAsset,
  uploadEmptySceneImage,
} from "../api";
import type {
  ChapterScenePromptInput,
  CompleteImageUploadInput,
  DirectChapterAssetUploadInput,
  EmptySceneImageUploadInput,
} from "../api";
import { ChapterSceneStudio } from "../components/ChapterSceneStudio";
import { CoursePlannerPageHeader } from "../components/CoursePlannerChrome";
import "../components/coursePlanner.css";
import "../components/coursePlannerPanels.css";
import { useCoursePlannerState } from "../hooks/useCoursePlannerState";
import type {
  Chapter,
  ChapterSceneAssemblyManifest,
  ChapterScenePackage,
  CoursePlannerState,
} from "../types";

type ScenePackageLoadState = "idle" | "loading" | "ready" | "error";

export function ChapterWorkspacePage() {
  const { chapterId } = useParams();
  const planner = useCoursePlannerState();
  const [scenePackage, setScenePackage] = useState<ChapterScenePackage | null>(null);
  const [loadState, setLoadState] = useState<ScenePackageLoadState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const chapter = useMemo(() => findChapter(planner.state, chapterId ?? null), [chapterId, planner.state]);
  const scenePack = useMemo(
    () => (chapter ? planner.state.scenePacks.find((pack) => pack.id === chapter.scenePackId) ?? null : null),
    [chapter, planner.state.scenePacks],
  );

  const runAsyncOperation = planner.runAsyncOperation;

  useEffect(() => {
    if (!chapter) {
      return;
    }
    // WHY: Chapter workspace 的路由是唯一上下文入口；进入页面时同步 planner 选中状态，
    // 避免后续 Task 5 继续复用旧的 board 选中结果，导致数据面板指向别的 chapter。
    if (planner.state.activeScenePackId !== chapter.scenePackId) {
      planner.setActiveScenePackId(chapter.scenePackId);
    }
    if (planner.state.selectedChapterId !== chapter.id) {
      planner.setSelectedChapterId(chapter.id);
    }
  }, [chapter, planner]);

  const loadScenePackage = useCallback(async () => {
    if (!chapter) {
      setScenePackage(null);
      setLoadState("idle");
      setErrorMessage(null);
      return null;
    }
    setLoadState("loading");
    setErrorMessage(null);
    const nextScenePackage = await runAsyncOperation(
      `scenePackage:load:${chapter.id}`,
      () => fetchChapterScenePackage(chapter.id),
    );
    if (!nextScenePackage) {
      setScenePackage(null);
      setLoadState("error");
      setErrorMessage("Could not load Chapter Scene Package.");
      return null;
    }
    setScenePackage(nextScenePackage);
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

  const applyScenePackage = useCallback(
    async (operationKey: string, operation: () => Promise<ChapterScenePackage>) => {
      const nextScenePackage = await runAsyncOperation(operationKey, operation);
      if (nextScenePackage) {
        setScenePackage(nextScenePackage);
        setLoadState("ready");
      }
      return nextScenePackage;
    },
    [runAsyncOperation],
  );

  const handleUpdatePrompt = useCallback(
    async (input: ChapterScenePromptInput) =>
      chapter
        ? applyScenePackage(`scenePackage:prompt:${chapter.id}`, () => updateChapterScenePrompt(chapter.id, input))
        : null,
    [applyScenePackage, chapter],
  );

  const handleUploadEmptySceneImage = useCallback(
    async (file: File, input: EmptySceneImageUploadInput) =>
      chapter
        ? applyScenePackage(`scenePackage:emptyUpload:${chapter.id}`, () => uploadEmptySceneImage(chapter.id, file, input))
        : null,
    [applyScenePackage, chapter],
  );

  const handleSelectEmptySceneImage = useCallback(
    async (imageId: string) =>
      chapter
        ? applyScenePackage(`scenePackage:emptySelect:${chapter.id}`, () => selectEmptySceneImage(chapter.id, imageId))
        : null,
    [applyScenePackage, chapter],
  );

  const handleUploadCompleteSceneImage = useCallback(
    async (file: File, input: CompleteImageUploadInput) =>
      chapter
        ? applyScenePackage(`scenePackage:completeUpload:${chapter.id}`, () => uploadCompleteSceneImage(chapter.id, file, input))
        : null,
    [applyScenePackage, chapter],
  );

  const handleUploadDirectAsset = useCallback(
    async (file: File, input: DirectChapterAssetUploadInput) =>
      chapter
        ? applyScenePackage(`scenePackage:assetUpload:${chapter.id}`, () => uploadDirectChapterAsset(chapter.id, file, input))
        : null,
    [applyScenePackage, chapter],
  );

  const handleSaveAssembly = useCallback(
    async (manifest: ChapterSceneAssemblyManifest) =>
      chapter
        ? applyScenePackage(`scenePackage:assembly:${chapter.id}`, () => saveChapterSceneAssembly(chapter.id, manifest))
        : null,
    [applyScenePackage, chapter],
  );

  const handleLockFinal = useCallback(
    async (file: File) =>
      chapter
        ? applyScenePackage(`scenePackage:final:${chapter.id}`, () => lockFinalChapterScene(chapter.id, file))
        : null,
    [applyScenePackage, chapter],
  );

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
          asyncStatus={planner.state.asyncStatus}
          onUpdatePrompt={handleUpdatePrompt}
          onUploadEmptySceneImage={handleUploadEmptySceneImage}
          onSelectEmptySceneImage={handleSelectEmptySceneImage}
          onUploadCompleteSceneImage={handleUploadCompleteSceneImage}
          onUploadDirectAsset={handleUploadDirectAsset}
          onSaveAssembly={handleSaveAssembly}
          onLockFinal={handleLockFinal}
        />
      ) : null}
    </main>
  );
}

function findChapter(state: CoursePlannerState, chapterId: string | null): Chapter | null {
  if (!chapterId) {
    return null;
  }
  return Object.values(state.chaptersByScenePackId)
    .flat()
    .find((chapter) => chapter.id === chapterId) ?? null;
}

function studioStatusLabel(loadState: ScenePackageLoadState, scenePackage: ChapterScenePackage | null): string {
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
  if (scenePackage.assembly.updated_at) {
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

function studioStatusTone(
  loadState: ScenePackageLoadState,
  scenePackage: ChapterScenePackage | null,
): "neutral" | "warning" | "success" | "danger" {
  if (loadState === "error") {
    return "danger";
  }
  if (scenePackage?.final_scene) {
    return "success";
  }
  if (scenePackage?.assembly.updated_at || scenePackage?.empty_scene_images.length) {
    return "warning";
  }
  return "neutral";
}
