import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import {
  deleteChapterAsset,
  deleteCompleteSceneImage,
  duplicateChapterAsset,
  fetchChapterScenePackage,
  generateChapterPromptPackage,
  importCompleteSceneImageToPipeline,
  listGeneratedChapterAssets,
  listCharacterIps,
  listSceneStyleReferences,
  lockFinalChapterScene,
  materializeGeneratedChapterAsset,
  saveChapterSceneAssembly,
  clearChapterSceneStyleReference,
  selectChapterSceneStyleReference,
  selectEmptySceneImage,
  updateChapterCastSelection,
  uploadCompleteSceneImage,
  uploadDirectChapterAsset,
  uploadEmptySceneImage,
} from "../api";
import type {
  CompleteImageUploadInput,
  DirectChapterAssetUploadInput,
  EmptySceneImageUploadInput,
  GeneratedChapterAssetMaterializeInput,
  GeneratedChapterAssetMaterializeResult,
} from "../api";
import { useCoursePlannerState } from "./useCoursePlannerState";
import type {
  Chapter,
  ChapterScenePackage,
  CharacterIpProfile,
  CoursePlannerState,
  GeneratedChapterAsset,
  SceneStyleReference,
} from "../types";

type ScenePackageLoadState = "idle" | "loading" | "ready" | "error";
type CoursePlannerController = ReturnType<typeof useCoursePlannerState>;
type AsyncOperationRunner = CoursePlannerController["runAsyncOperation"];
type ChapterStudioLoadInput = {
  activeChapterIdRef: MutableRefObject<string | null>;
  applyScenePackageIfCurrent: (expectedChapterId: string, nextScenePackage: ChapterScenePackage) => boolean;
  chapter: Chapter | null;
  runAsyncOperation: AsyncOperationRunner;
  setCharacterIps: Dispatch<SetStateAction<CharacterIpProfile[]>>;
  setErrorMessage: Dispatch<SetStateAction<string | null>>;
  setLoadState: Dispatch<SetStateAction<ScenePackageLoadState>>;
  setSceneStyles: Dispatch<SetStateAction<SceneStyleReference[]>>;
  setScenePackage: Dispatch<SetStateAction<ChapterScenePackage | null>>;
};

// WHY: Chapter 页面和 Assembly 编辑器是两个路由，但它们共享同一个 scene-package
// 加载与 mutation 协议；抽成 hook 可以避免两个页面各自维护一套事实源。
export function useChapterScenePackageWorkspace(chapterId: string | null) {
  const planner = useCoursePlannerState();
  const { chapter, scenePack } = useChapterContext(planner, chapterId);
  const studioData = useChapterStudioData(chapter, planner.runAsyncOperation);
  const mutations = useChapterStudioMutations(chapter, planner.runAsyncOperation, studioData);
  const { isGeneratingPrompt, ...handlers } = mutations;

  return {
    asyncStatus: planner.state.asyncStatus,
    chapter,
    characterIps: studioData.characterIps,
    errorMessage: studioData.errorMessage,
    handlers,
    isGeneratingPrompt,
    loadState: studioData.loadState,
    sceneStyles: studioData.sceneStyles,
    scenePack,
    scenePackage: studioData.scenePackage,
  };
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
  const [sceneStyles, setSceneStyles] = useState<SceneStyleReference[]>([]);
  const [loadState, setLoadState] = useState<ScenePackageLoadState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const activeChapterId = chapter?.id ?? null;
  const activeChapterIdRef = useRef<string | null>(activeChapterId);
  // WHY: mutation/import 的 Promise 可能跨 route resolve；用 ref 作为当前 chapter 的单一门闩，
  // 代价是渲染期同步 ref，但可避免旧闭包把非当前 chapter 的 package 写回共享 hook state。
  activeChapterIdRef.current = activeChapterId;

  const applyScenePackageIfCurrent = useCallback((expectedChapterId: string, nextScenePackage: ChapterScenePackage) => {
    if (activeChapterIdRef.current !== expectedChapterId || nextScenePackage.chapter_id !== expectedChapterId) {
      return false;
    }
    setScenePackage(nextScenePackage);
    setLoadState("ready");
    setErrorMessage(null);
    return true;
  }, []);

  useLoadChapterStudioData({
    activeChapterIdRef,
    applyScenePackageIfCurrent,
    chapter,
    runAsyncOperation,
    setCharacterIps,
    setErrorMessage,
    setLoadState,
    setSceneStyles,
    setScenePackage,
  });

  const applyScenePackage = useCallback(async (
    expectedChapterId: string,
    operationKey: string,
    operation: () => Promise<ChapterScenePackage>,
  ) => {
    const nextScenePackage = await runAsyncOperation(operationKey, operation);
    if (!nextScenePackage) {
      return null;
    }
    return applyScenePackageIfCurrent(expectedChapterId, nextScenePackage) ? nextScenePackage : null;
  }, [applyScenePackageIfCurrent, runAsyncOperation]);

  const exposedScenePackage = scenePackage?.chapter_id === activeChapterId ? scenePackage : null;

  return {
    applyScenePackageIfCurrent,
    applyScenePackage,
    characterIps,
    errorMessage,
    loadState,
    sceneStyles,
    scenePackage: exposedScenePackage,
    setLoadState,
    setSceneStyles,
  };
}

function useLoadChapterStudioData({
  activeChapterIdRef,
  applyScenePackageIfCurrent,
  chapter,
  runAsyncOperation,
  setCharacterIps,
  setErrorMessage,
  setLoadState,
  setSceneStyles,
  setScenePackage,
}: ChapterStudioLoadInput) {
  useEffect(() => {
    let cancelled = false;

    if (!chapter) {
      setScenePackage(null);
      setCharacterIps([]);
      setSceneStyles([]);
      setLoadState("idle");
      setErrorMessage(null);
      return;
    }
    setScenePackage((current) => (current?.chapter_id === chapter.id ? current : null));
    setLoadState("loading");
    setErrorMessage(null);

    // WHY: route/chapter 切换会让旧请求晚于新请求返回；所有完成路径必须确认
    // 当前 effect 仍有效，避免旧 chapter 覆盖新 chapter 的 scene-package 事实源。
    const expectedChapterId = chapter.id;
    void runAsyncOperation(
      `scenePackage:load:${expectedChapterId}`,
      () => Promise.all([
        fetchChapterScenePackage(expectedChapterId),
        listCharacterIps(),
        listSceneStyleReferences(),
      ]),
    ).then((nextStudioData) => {
      if (cancelled || activeChapterIdRef.current !== expectedChapterId) {
        return;
      }
      if (!nextStudioData) {
        setScenePackage(null);
        setLoadState("error");
        setErrorMessage("Could not load Chapter Scene Package.");
        return;
      }
      const [nextScenePackage, nextCharacterIps, nextSceneStyles] = nextStudioData;
      if (!applyScenePackageIfCurrent(expectedChapterId, nextScenePackage)) {
        return;
      }
      setCharacterIps(nextCharacterIps);
      setSceneStyles(nextSceneStyles);
    }).catch((error: unknown) => {
      if (cancelled || activeChapterIdRef.current !== expectedChapterId) {
        return;
      }
      setScenePackage(null);
      setLoadState("error");
      setErrorMessage(error instanceof Error ? error.message : "Could not load Chapter Scene Package.");
    });

    return () => {
      cancelled = true;
    };
  }, [
    activeChapterIdRef,
    applyScenePackageIfCurrent,
    chapter,
    runAsyncOperation,
    setCharacterIps,
    setErrorMessage,
    setLoadState,
    setSceneStyles,
    setScenePackage,
  ]);
}

function useChapterStudioMutations(
  chapter: Chapter | null,
  runAsyncOperation: AsyncOperationRunner,
  studioData: ReturnType<typeof useChapterStudioData>,
) {
  const { applyScenePackage, applyScenePackageIfCurrent } = studioData;
  const promptGenerationRequestRef = useRef<{
    chapterId: string;
    promise: Promise<ChapterScenePackage | null>;
  } | null>(null);
  const [promptGenerationChapterId, setPromptGenerationChapterId] = useState<string | null>(null);
  const withChapter = useCallback(
    (key: string, operation: (chapter: Chapter) => Promise<ChapterScenePackage>) =>
      chapter ? applyScenePackage(chapter.id, `scenePackage:${key}:${chapter.id}`, () => operation(chapter)) : Promise.resolve(null),
    [applyScenePackage, chapter],
  );
  const handleSelectSceneStyle = useCallback(
    (sceneStyleId: string) => withChapter("styleSelect", (item) => selectChapterSceneStyleReference(item.id, sceneStyleId)),
    [withChapter],
  );
  const handleClearSceneStyle = useCallback(
    () => withChapter("styleClear", (item) => clearChapterSceneStyleReference(item.id)),
    [withChapter],
  );
  const handleSelectCharacters = useCallback(
    (characterIpIds: string[]) => withChapter(
      "castSelection",
      (item) => updateChapterCastSelection(item.id, characterIpIds),
    ),
    [withChapter],
  );
  const handleGeneratePrompt = useCallback((feedback: string) => {
    if (!chapter) {
      return Promise.resolve(null);
    }
    const activeRequest = promptGenerationRequestRef.current;
    if (activeRequest?.chapterId === chapter.id) {
      return activeRequest.promise;
    }
    const expectedChapterId = chapter.id;
    // WHY: Generate 是有成本的同步 AI 调用；同一 Chapter 的重复点击共享一个 Promise，
    // 同时仍允许路由切换后的新 Chapter 发起独立请求，并由既有 chapter guard 隔离回写。
    const promise = applyScenePackage(
      expectedChapterId,
      `scenePackage:promptGenerate:${expectedChapterId}`,
      async () => (
        await generateChapterPromptPackage(expectedChapterId, { feedback })
      ).scenePackage,
    ).finally(() => {
      if (promptGenerationRequestRef.current?.promise !== promise) {
        return;
      }
      promptGenerationRequestRef.current = null;
      setPromptGenerationChapterId((current) => (
        current === expectedChapterId ? null : current
      ));
    });
    promptGenerationRequestRef.current = { chapterId: expectedChapterId, promise };
    setPromptGenerationChapterId(expectedChapterId);
    return promise;
  }, [applyScenePackage, chapter]);
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
  const handleDuplicateChapterAsset = useCallback(
    (assetId: string) => withChapter("assetDuplicate", (item) => duplicateChapterAsset(item.id, assetId)),
    [withChapter],
  );
  const handleDeleteChapterAsset = useCallback(
    (assetId: string) => withChapter("assetDelete", (item) => deleteChapterAsset(item.id, assetId)),
    [withChapter],
  );
  const handleListGeneratedAssets = useCallback(async (): Promise<GeneratedChapterAsset[]> => {
    if (!chapter) {
      return [];
    }
    const assets = await runAsyncOperation(
      `scenePackage:generatedAssets:${chapter.id}`,
      () => listGeneratedChapterAssets(chapter.id),
    );
    return assets ?? [];
  }, [chapter, runAsyncOperation]);
  const handleMaterializeGeneratedAsset = useCallback(async (
    input: GeneratedChapterAssetMaterializeInput,
  ): Promise<GeneratedChapterAssetMaterializeResult | null> => {
    if (!chapter) {
      return null;
    }
    const result = await runAsyncOperation(
      `scenePackage:generatedAssetMaterialize:${chapter.id}:${input.pipelineRunId}:${input.runAssetId}`,
      () => materializeGeneratedChapterAsset(chapter.id, input),
    );
    if (!result) {
      return null;
    }
    // WHY: materialize 同时返回 asset 与 scenePackage；scenePackage 仍是唯一权威状态，
    // 这里只在路由 chapter 未切换时接收，避免 drawer 的旧请求污染当前编辑器。
    return applyScenePackageIfCurrent(chapter.id, result.scenePackage) ? result : null;
  }, [applyScenePackageIfCurrent, chapter, runAsyncOperation]);
  const handleSaveAssembly = useCallback(
    (manifest: ChapterScenePackage["assembly"]) => withChapter("assemblySave", (item) => saveChapterSceneAssembly(item.id, manifest)),
    [withChapter],
  );
  const handleLockFinal = useCallback(
    (file: File) => withChapter("final", (item) => lockFinalChapterScene(item.id, file)),
    [withChapter],
  );
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
    return applyScenePackageIfCurrent(chapter.id, result.scenePackage) ? result.scenePackage : null;
  }, [applyScenePackageIfCurrent, chapter, runAsyncOperation]);

  return {
    handleClearSceneStyle,
    handleDeleteChapterAsset,
    handleDeleteCompleteSceneImage,
    handleDuplicateChapterAsset,
    handleGeneratePrompt,
    handleImportCompleteImage,
    handleListGeneratedAssets,
    handleLockFinal,
    handleMaterializeGeneratedAsset,
    handleSaveAssembly,
    handleSelectEmptySceneImage,
    handleSelectCharacters,
    handleSelectSceneStyle,
    handleUploadCompleteSceneImage,
    handleUploadDirectAsset,
    handleUploadEmptySceneImage,
    isGeneratingPrompt: promptGenerationChapterId === chapter?.id,
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
