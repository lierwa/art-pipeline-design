import type { CoursePlannerState } from "../types";

export type ChapterProductionStatus = {
  hasPromptVersion: boolean;
  objectCount: number;
  attemptCount: number;
  hasImportedAttempt: boolean;
};

export function deriveChapterProductionStatus(
  state: CoursePlannerState,
  chapterId: string,
): ChapterProductionStatus {
  const versions = state.promptVersionsByChapterId[chapterId] ?? [];
  const attempts = versions.flatMap((version) => state.imageAttemptsByVersionId[version.id] ?? []);
  const objectCount = versions.reduce((total, version) => {
    const { objectPlan } = version;
    // WHY: 旧 Chapter 状态面板仍参与编译；从 PromptVersion 的对象规划派生，只读投影避免恢复旧 scenes/keywords 状态源。
    return total
      + objectPlan.coreObjects.length
      + objectPlan.requiredObjects.length
      + objectPlan.recommendedObjects.length;
  }, 0);

  return {
    hasPromptVersion: versions.length > 0,
    objectCount,
    attemptCount: attempts.length,
    hasImportedAttempt: attempts.some((attempt) => attempt.status === "imported"),
  };
}
