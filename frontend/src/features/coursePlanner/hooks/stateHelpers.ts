import type { Chapter, CoursePlannerState, PromptVersion, ScenePack } from "../types";

export function findChapter(state: CoursePlannerState, chapterId: string | null): Chapter | null {
  if (!chapterId) {
    return null;
  }
  return Object.values(state.chaptersByScenePackId).flat().find((chapter) => chapter.id === chapterId) ?? null;
}

export function findPromptVersion(state: CoursePlannerState, versionId: string | null): PromptVersion | null {
  if (!versionId) {
    return null;
  }
  return Object.values(state.promptVersionsByChapterId).flat().find((version) => version.id === versionId) ?? null;
}

export function orderedChapters(chapters: Chapter[]): Chapter[] {
  return [...chapters].sort((left, right) => left.sortOrder - right.sortOrder);
}

export function reorderLocalChapters(chapters: Chapter[], chapterIds: string[]): Chapter[] {
  const byId = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  return chapterIds
    .map((chapterId, index) => {
      const chapter = byId.get(chapterId);
      return chapter ? { ...chapter, sortOrder: index + 1 } : null;
    })
    .filter((chapter): chapter is Chapter => Boolean(chapter));
}

export function preferredPromptVersionId(versions: PromptVersion[]): string | null {
  return versions.find((version) => version.status === "adopted")?.id ?? versions[versions.length - 1]?.id ?? null;
}

export function preferredPromptVersionIdForChapter(state: CoursePlannerState, chapterId: string | null): string | null {
  return chapterId ? preferredPromptVersionId(state.promptVersionsByChapterId[chapterId] ?? []) : null;
}

export function promptVersionBelongsToChapter(state: CoursePlannerState, versionId: string | null, chapterId: string | null): boolean {
  return Boolean(versionId && chapterId && findPromptVersion(state, versionId)?.chapterId === chapterId);
}

export function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  const index = items.findIndex((candidate) => candidate.id === item.id);
  if (index === -1) {
    return [...items, item];
  }
  return items.map((candidate, currentIndex) => currentIndex === index ? item : candidate);
}

export function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  return incoming.reduce((items, item) => upsertById(items, item), current);
}

export function appendChapterId(pack: ScenePack | undefined, chapterId: string): ScenePack {
  if (!pack) {
    throw new Error("Select a Scene Pack before accepting a Chapter candidate.");
  }
  if (pack.chapterIds.includes(chapterId)) {
    return pack;
  }
  return { ...pack, chapterIds: [...pack.chapterIds, chapterId] };
}
