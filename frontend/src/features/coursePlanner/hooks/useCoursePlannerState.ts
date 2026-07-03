import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  acceptChapterCandidate,
  createScenePack,
  deleteChapter,
  deleteChapterCandidate,
  deleteScenePack,
  fetchCoursePlannerState,
  generateChapterCandidates,
  reorderChapters,
  reviseChapterCandidates,
  updateScenePack,
} from "../api";
import type { AsyncOperationState, Chapter, ChapterCandidate, CoursePlannerState, ScenePack } from "../types";
import type { CreateScenePackRequest, GenerateChapterCandidatesRequest, UpdateScenePackRequest } from "../api";
import {
  appendChapterId,
  findChapter,
  mergeById,
  orderedChapters,
  reorderLocalChapters,
  upsertById,
} from "./stateHelpers";

const EMPTY_COURSE_PLANNER_STATE: CoursePlannerState = {
  scenePacks: [],
  activeScenePackId: null,
  candidatesByScenePackId: {},
  chaptersByScenePackId: {},
  selectedChapterId: null,
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
      }));
    });
  }

  function upsertScenePack(pack: ScenePack) {
    applyState((current) => ({ ...current, scenePacks: upsertById(current.scenePacks, pack) }));
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

  return {
    ...state,
    activeScenePack,
    candidatesForActiveScenePack,
    chaptersForActiveScenePack,
    selectedChapter,
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
    refresh,
    runAsyncOperation: runOperation,
    clearAsyncStatus,
    setActiveScenePackId: (activeScenePackId: string | null) => applyState((current) => ({ ...current, activeScenePackId })),
    setSelectedChapterId: (selectedChapterId: string | null) => applyState((current) => ({ ...current, selectedChapterId })),
  };
}

export type CoursePlannerController = ReturnType<typeof useCoursePlannerState>;
