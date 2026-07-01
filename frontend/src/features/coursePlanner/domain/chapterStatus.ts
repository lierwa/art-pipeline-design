import type { ChapterStatus, CoursePlannerState } from "../types";

export type ChapterProductionStatus = {
  hasPromptVersion: boolean;
  objectCount: number;
  attemptCount: number;
  hasImportedAttempt: boolean;
};

export function chapterStatusLabel(status: ChapterStatus): string {
  const labels: Record<ChapterStatus, string> = {
    draft: "Draft",
    designing: "Designing",
    prompt_ready: "Prompt ready",
    has_attempts: "Has attempts",
    imported: "Imported",
  };
  return labels[status];
}

export function deriveChapterProductionStatus(
  state: CoursePlannerState,
  chapterId: string,
): ChapterProductionStatus {
  const versions = state.promptVersionsByChapterId[chapterId] ?? [];
  const attempts = versions.flatMap((version) => state.imageAttemptsByVersionId[version.id] ?? []);
  const objectCount = versions.reduce((total, version) => {
    const { sceneVocabulary } = version;
    // WHY: 02 是 scene-first；这里统计的是可选词池与叙事锚点数量，
    // 不是旧 object-first 的必出物体数量。
    return total
      + sceneVocabulary.narrativeAnchors.length
      + sceneVocabulary.optionalVocabularyCandidates.length;
  }, 0);

  return {
    hasPromptVersion: versions.length > 0,
    objectCount,
    attemptCount: attempts.length,
    hasImportedAttempt: attempts.some((attempt) => attempt.status === "imported"),
  };
}
