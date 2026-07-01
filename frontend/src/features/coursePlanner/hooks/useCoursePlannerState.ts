import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  acceptChapterCandidate,
  adoptPromptVersion,
  createImageAttempt,
  createPromptVersion,
  createScenePack,
  deleteChapter,
  deleteChapterCandidate,
  deletePromptVersion,
  deleteScenePack,
  duplicatePromptVersion,
  fetchCoursePlannerState,
  generateChapterCandidates,
  generatePromptPackage,
  importImageAttempt,
  listImageAttempts,
  listPromptVersions,
  reorderChapters,
  reviewImageAttempt,
  reviseChapterCandidates,
  updateImageAttempt,
  updatePromptVersion,
  updateScenePack,
  uploadImageAttempt,
} from "../api";
import type { AsyncOperationState, Chapter, ChapterCandidate, CoursePlannerState, ImageAttempt, PromptVersion, ScenePack } from "../types";
import type { CreateScenePackRequest, GenerateChapterCandidatesRequest, PromptVersionCreateRequest, UpdateScenePackRequest, ImageAttemptPatchRequest } from "../api";
import {
  appendChapterId,
  findChapter,
  findPromptVersion,
  mergeById,
  orderedChapters,
  preferredPromptVersionId,
  preferredPromptVersionIdForChapter,
  promptVersionBelongsToChapter,
  reorderLocalChapters,
  upsertById,
} from "./stateHelpers";
const EMPTY_COURSE_PLANNER_STATE: CoursePlannerState = {
  scenePacks: [],
  activeScenePackId: null,
  candidatesByScenePackId: {},
  chaptersByScenePackId: {},
  promptVersionsByChapterId: {},
  imageAttemptsByVersionId: {},
  selectedChapterId: null,
  selectedPromptVersionId: null,
  asyncStatus: {},
  tasks: [],
};

export function useCoursePlannerState() {
  const [state, setState] = useState<CoursePlannerState>(EMPTY_COURSE_PLANNER_STATE);
  const stateRef = useRef<CoursePlannerState>(EMPTY_COURSE_PLANNER_STATE);

  const activeScenePack = useMemo(
    () => state.scenePacks.find((pack) => pack.id === state.activeScenePackId) ?? null,
    [state.activeScenePackId, state.scenePacks],
  );
  const candidatesForActiveScenePack = state.activeScenePackId
    ? state.candidatesByScenePackId[state.activeScenePackId] ?? []
    : [];
  const chaptersForActiveScenePack = state.activeScenePackId
    ? orderedChapters(state.chaptersByScenePackId[state.activeScenePackId] ?? [])
    : [];
  const selectedChapter = useMemo(
    () => findChapter(state, state.selectedChapterId),
    [state, state.selectedChapterId],
  );
  const promptVersionsForSelectedChapter = state.selectedChapterId
    ? state.promptVersionsByChapterId[state.selectedChapterId] ?? []
    : [];
  const selectedPromptVersion = useMemo(
    () => findPromptVersion(state, state.selectedPromptVersionId),
    [state, state.selectedPromptVersionId],
  );
  const imageAttemptsForSelectedPromptVersion = state.selectedPromptVersionId
    ? state.imageAttemptsByVersionId[state.selectedPromptVersionId] ?? []
    : [];

  const applyState = useCallback((update: CoursePlannerState | ((current: CoursePlannerState) => CoursePlannerState)) => {
    const next = typeof update === "function" ? update(stateRef.current) : update;
    stateRef.current = next;
    setState(next);
  }, []);

  const setAsyncStatus = useCallback((key: string, status: AsyncOperationState) => {
    applyState((current) => ({
      ...current,
      asyncStatus: { ...current.asyncStatus, [key]: status },
    }));
  }, [applyState]);

  const clearAsyncStatus = useCallback((key: string) => {
    applyState((current) => {
      const asyncStatus = { ...current.asyncStatus };
      delete asyncStatus[key];
      // WHY: Toast 关闭只清理对应异步状态；其他并发操作仍由 asyncStatus 单一事实源驱动。
      return { ...current, asyncStatus };
    });
  }, [applyState]);

  const runOperation = useCallback(async <T,>(key: string, operation: () => Promise<T>): Promise<T | null> => {
    setAsyncStatus(key, { status: "pending" });
    try {
      const result = await operation();
      setAsyncStatus(key, { status: "succeeded" });
      return result;
    } catch (error) {
      setAsyncStatus(key, {
        status: "failed",
        error: error instanceof Error ? error.message : "Course Planner action failed.",
      });
      return null;
    }
  }, [setAsyncStatus]);

  const refresh = useCallback(async () => {
    return runOperation("load-state", async () => {
      const next = await fetchCoursePlannerState();
      applyState((current) => ({ ...next, asyncStatus: current.asyncStatus }));
      return next;
    });
  }, [applyState, runOperation]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleCreateScenePack(request: CreateScenePackRequest) {
    return runOperation("createScenePack", async () => {
      const pack = await createScenePack(request);
      applyState((current) => ({
        ...current,
        scenePacks: upsertById(current.scenePacks, pack),
        activeScenePackId: pack.id,
      }));
      return pack;
    });
  }

  async function handleUpdateScenePack(scenePackId: string, request: UpdateScenePackRequest) {
    return runOperation(`updateScenePack:${scenePackId}`, async () => {
      const pack = await updateScenePack(scenePackId, request);
      upsertScenePack(pack);
      return pack;
    });
  }

  async function handleDeleteScenePack(scenePackId: string) {
    return runOperation(`deleteScenePack:${scenePackId}`, async () => {
      const pack = await deleteScenePack(scenePackId);
      upsertScenePack(pack);
      return pack;
    });
  }

  async function handleGenerateCandidates(
    scenePackId: string,
    request: GenerateChapterCandidatesRequest = {},
    options: { mode?: "append" | "replace" } = {},
  ) {
    return runOperation(`generateCandidates:${scenePackId}`, async () => {
      const candidates = await generateChapterCandidates(scenePackId, request);
      mergeCandidates(scenePackId, candidates, options.mode ?? "append");
      return candidates;
    });
  }

  async function handleReviseCandidates(scenePackId: string, request: GenerateChapterCandidatesRequest) {
    return runOperation(`reviseCandidates:${scenePackId}`, async () => {
      const candidates = await reviseChapterCandidates(scenePackId, request);
      replaceCandidates(scenePackId, candidates);
      return candidates;
    });
  }

  async function handleDeleteCandidate(scenePackId: string, candidateId: string) {
    return runOperation(`deleteCandidate:${candidateId}`, async () => {
      await deleteChapterCandidate(candidateId);
      applyState((current) => ({
        ...current,
        candidatesByScenePackId: {
          ...current.candidatesByScenePackId,
          [scenePackId]: (current.candidatesByScenePackId[scenePackId] ?? []).filter((candidate) => candidate.id !== candidateId),
        },
      }));
    });
  }

  function requireCandidate(scenePackId: string, candidateId: string): ChapterCandidate {
    const candidate = stateRef.current.candidatesByScenePackId[scenePackId]?.find((item) => item.id === candidateId);
    if (!candidate) {
      throw new Error("Generate or load the Chapter candidate before accepting it.");
    }
    return candidate;
  }

  async function handleAcceptCandidate(scenePackId: string, candidateId: string) {
    return runOperation(`acceptCandidate:${candidateId}`, async () => {
      const candidate = requireCandidate(scenePackId, candidateId);
      const response = await acceptChapterCandidate(scenePackId, candidate.seed);
      // WHY: 接受候选是候选池到唯一 Chapter 列表的边界；这里同批更新，避免页面各自维护 selected/locked 副本。
      applyState((current) => ({
        ...current,
        scenePacks: upsertById(current.scenePacks, appendChapterId(current.scenePacks.find((pack) => pack.id === scenePackId), response.chapter.id)),
        candidatesByScenePackId: {
          ...current.candidatesByScenePackId,
          [scenePackId]: (current.candidatesByScenePackId[scenePackId] ?? []).filter((item) => item.id !== candidateId),
        },
        chaptersByScenePackId: {
          ...current.chaptersByScenePackId,
          [scenePackId]: orderedChapters(upsertById(current.chaptersByScenePackId[scenePackId] ?? [], response.chapter)),
        },
        selectedChapterId: response.chapter.id,
        selectedPromptVersionId: preferredPromptVersionIdForChapter(current, response.chapter.id),
      }));
      return response.chapter;
    });
  }

  async function handleReorderChapters(scenePackId: string, chapterIds: string[]) {
    return runOperation(`reorderChapters:${scenePackId}`, async () => {
      const response = await reorderChapters(scenePackId, chapterIds);
      applyScenePackWithLocalChapterOrder(response.scenePack);
      return response.scenePack;
    });
  }

  async function handleDeleteChapter(scenePackId: string, chapterId: string) {
    return runOperation(`deleteChapter:${chapterId}`, async () => {
      await deleteChapter(scenePackId, chapterId);
      applyState((current) => ({
        ...current,
        // WHY: ScenePack.chapterIds 是章节顺序的权威索引；删除 Chapter 时必须同步清掉索引，避免页面按旧 id 复活已删章节。
        scenePacks: current.scenePacks.map((pack) =>
          pack.id === scenePackId ? { ...pack, chapterIds: pack.chapterIds.filter((id) => id !== chapterId) } : pack,
        ),
        chaptersByScenePackId: {
          ...current.chaptersByScenePackId,
          [scenePackId]: (current.chaptersByScenePackId[scenePackId] ?? []).filter((chapter) => chapter.id !== chapterId),
        },
        selectedChapterId: current.selectedChapterId === chapterId ? null : current.selectedChapterId,
        selectedPromptVersionId: current.selectedChapterId === chapterId ? null : current.selectedPromptVersionId,
      }));
    });
  }

  async function handleListPromptVersions(chapterId: string) {
    return runOperation(`listPromptVersions:${chapterId}`, async () => {
      const versions = await listPromptVersions(chapterId);
      applyState((current) => ({
        ...current,
        promptVersionsByChapterId: { ...current.promptVersionsByChapterId, [chapterId]: versions },
        // WHY: PromptVersion selection is scoped to the loaded Chapter; otherwise uploads/reviews attach to the wrong lineage.
        selectedPromptVersionId: current.selectedChapterId === chapterId ? preferredPromptVersionId(versions) : current.selectedPromptVersionId,
      }));
      return versions;
    });
  }

  async function handleCreatePromptVersion(chapterId: string, request: PromptVersionCreateRequest = {}) {
    return runPromptVersionOperation(`createPromptVersion:${chapterId}`, () => createPromptVersion(chapterId, request));
  }

  async function handleDuplicatePromptVersion(versionId: string) {
    return runPromptVersionOperation(`duplicatePromptVersion:${versionId}`, () => duplicatePromptVersion(versionId));
  }

  async function handleUpdatePromptVersion(versionId: string, patch: Partial<PromptVersion>) {
    return runPromptVersionOperation(`updatePromptVersion:${versionId}`, () => updatePromptVersion(versionId, patch));
  }

  async function handleAdoptPromptVersion(chapterId: string, versionId: string) {
    return runOperation(`adoptPromptVersion:${versionId}`, async () => {
      const response = await adoptPromptVersion(chapterId, versionId);
      upsertChapter(response.chapter);
      applyState((current) => ({
        ...current,
        promptVersionsByChapterId: {
          ...current.promptVersionsByChapterId,
          [response.chapter.id]: response.promptVersions,
        },
        selectedChapterId: response.chapter.id,
        selectedPromptVersionId: versionId,
      }));
      return response;
    });
  }

  async function handleDeletePromptVersion(versionId: string) {
    return runOperation(`deletePromptVersion:${versionId}`, async () => {
      const version = await deletePromptVersion(versionId);
      if (version.status === "archived") {
        removePromptVersionById(version.id);
      } else {
        upsertPromptVersion(version);
      }
      return version;
    });
  }

  async function handleGeneratePromptPackage(versionId: string) {
    return runPromptVersionOperation(`generatePromptPackage:${versionId}`, () => generatePromptPackage(versionId));
  }

  async function handleListImageAttempts(versionId: string) {
    return runOperation(`listImageAttempts:${versionId}`, async () => {
      const attempts = await listImageAttempts(versionId);
      applyState((current) => ({
        ...current,
        imageAttemptsByVersionId: { ...current.imageAttemptsByVersionId, [versionId]: attempts },
      }));
      return attempts;
    });
  }

  async function handleCreateImageAttempt(versionId: string, uploadedImageId: string) {
    return runImageAttemptOperation(`uploadAttempt:${versionId}`, () => createImageAttempt(versionId, uploadedImageId));
  }

  async function handleUploadImageAttempt(versionId: string, file: File) {
    return runImageAttemptOperation(`uploadAttempt:${versionId}`, () => uploadImageAttempt(versionId, file));
  }

  async function handleReviewImageAttempt(attemptId: string) {
    return runImageAttemptOperation(`reviewAttempt:${attemptId}`, () => reviewImageAttempt(attemptId));
  }

  async function handleUpdateImageAttempt(attemptId: string, patch: ImageAttemptPatchRequest) {
    return runImageAttemptOperation(`updateAttempt:${attemptId}`, () => updateImageAttempt(attemptId, patch));
  }

  async function handleImportImageAttempt(attemptId: string) {
    return runImageAttemptOperation(`importAttempt:${attemptId}`, () => importImageAttempt(attemptId));
  }

  function runPromptVersionOperation(key: string, operation: () => Promise<PromptVersion>) {
    return runOperation(key, async () => {
      const version = await operation();
      upsertPromptVersion(version);
      return version;
    });
  }

  function runImageAttemptOperation(key: string, operation: () => Promise<ImageAttempt>) {
    return runOperation(key, async () => {
      const attempt = await operation();
      upsertImageAttempt(attempt);
      return attempt;
    });
  }

  function upsertScenePack(pack: ScenePack) {
    applyState((current) => ({ ...current, scenePacks: upsertById(current.scenePacks, pack) }));
  }

  function upsertChapter(chapter: Chapter) {
    applyState((current) => ({
      ...current,
      chaptersByScenePackId: {
        ...current.chaptersByScenePackId,
        [chapter.scenePackId]: orderedChapters(upsertById(current.chaptersByScenePackId[chapter.scenePackId] ?? [], chapter)),
      },
    }));
  }

  function replaceCandidates(scenePackId: string, candidates: ChapterCandidate[]) {
    applyState((current) => ({
      ...current,
      candidatesByScenePackId: { ...current.candidatesByScenePackId, [scenePackId]: candidates },
    }));
  }

  function mergeCandidates(scenePackId: string, candidates: ChapterCandidate[], mode: "append" | "replace") {
    applyState((current) => ({
      ...current,
      candidatesByScenePackId: {
        ...current.candidatesByScenePackId,
        [scenePackId]: mode === "replace"
          ? candidates
          : mergeById(current.candidatesByScenePackId[scenePackId] ?? [], candidates),
      },
    }));
  }

  function applyScenePackWithLocalChapterOrder(pack: ScenePack) {
    applyState((current) => ({
      ...current,
      scenePacks: upsertById(current.scenePacks, pack),
      chaptersByScenePackId: {
        ...current.chaptersByScenePackId,
        [pack.id]: reorderLocalChapters(current.chaptersByScenePackId[pack.id] ?? [], pack.chapterIds),
      },
    }));
  }

  function upsertPromptVersion(version: PromptVersion) {
    applyState((current) => ({
      ...current,
      promptVersionsByChapterId: {
        ...current.promptVersionsByChapterId,
        [version.chapterId]: upsertById(current.promptVersionsByChapterId[version.chapterId] ?? [], version),
      },
      selectedPromptVersionId: current.selectedChapterId === version.chapterId ? version.id : current.selectedPromptVersionId,
    }));
  }

  function removePromptVersionById(versionId: string) {
    applyState((current) => {
      const promptVersionsByChapterId = Object.fromEntries(
        Object.entries(current.promptVersionsByChapterId).map(([chapterId, versions]) => [
          chapterId,
          versions.filter((candidate) => candidate.id !== versionId),
        ]),
      );
      const fallbackVersions = current.selectedChapterId
        ? promptVersionsByChapterId[current.selectedChapterId] ?? []
        : [];
      return {
        ...current,
        promptVersionsByChapterId,
        // WHY: DELETE 的用户语义是“移出当前工作台”，后端返回的 archived 版本只证明删除成功；
        // 前端按 versionId 从所有投影移除，避免响应缺失 chapterId 或旧投影导致“删不掉”。
        selectedPromptVersionId: current.selectedPromptVersionId === versionId
          ? preferredPromptVersionId(fallbackVersions)
          : current.selectedPromptVersionId,
      };
    });
  }

  function upsertImageAttempt(attempt: ImageAttempt) {
    applyState((current) => ({
      ...current,
      imageAttemptsByVersionId: {
        ...current.imageAttemptsByVersionId,
        [attempt.promptVersionId]: upsertById(current.imageAttemptsByVersionId[attempt.promptVersionId] ?? [], attempt),
      },
    }));
  }

  return {
    ...state,
    activeScenePack,
    candidatesForActiveScenePack,
    chaptersForActiveScenePack,
    imageAttemptsForSelectedPromptVersion,
    promptVersionsForSelectedChapter,
    selectedChapter,
    selectedPromptVersion,
    state,
    createScenePack: handleCreateScenePack,
    updateScenePack: handleUpdateScenePack,
    deleteScenePack: handleDeleteScenePack,
    generateChapterCandidates: handleGenerateCandidates,
    reviseChapterCandidates: handleReviseCandidates,
    deleteChapterCandidate: handleDeleteCandidate,
    acceptChapterCandidate: handleAcceptCandidate,
    reorderChapters: handleReorderChapters,
    deleteChapter: handleDeleteChapter,
    listPromptVersions: handleListPromptVersions,
    createPromptVersion: handleCreatePromptVersion,
    duplicatePromptVersion: handleDuplicatePromptVersion,
    updatePromptVersion: handleUpdatePromptVersion,
    adoptPromptVersion: handleAdoptPromptVersion,
    deletePromptVersion: handleDeletePromptVersion,
    generatePromptPackage: handleGeneratePromptPackage,
    listImageAttempts: handleListImageAttempts,
    createImageAttempt: handleCreateImageAttempt,
    uploadImageAttempt: handleUploadImageAttempt,
    reviewImageAttempt: handleReviewImageAttempt,
    updateImageAttempt: handleUpdateImageAttempt,
    importImageAttempt: handleImportImageAttempt,
    refresh,
    clearAsyncStatus,
    setActiveScenePackId: (activeScenePackId: string | null) => applyState((current) => ({ ...current, activeScenePackId })),
    setSelectedChapterId: (selectedChapterId: string | null) => applyState((current) => ({
      ...current,
      // WHY: Chapter selection owns PromptVersion selection, otherwise uploads can target a previous Chapter lineage.
      selectedChapterId,
      selectedPromptVersionId: preferredPromptVersionIdForChapter(current, selectedChapterId),
    })),
    setSelectedPromptVersionId: (selectedPromptVersionId: string | null) => applyState((current) => ({
      ...current,
      selectedPromptVersionId: promptVersionBelongsToChapter(current, selectedPromptVersionId, current.selectedChapterId) ? selectedPromptVersionId : null,
    })),
  };
}

export type CoursePlannerController = ReturnType<typeof useCoursePlannerState>;
