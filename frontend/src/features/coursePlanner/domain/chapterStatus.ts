import type { ChapterScenePackage } from "../types";

export type ChapterProductionStatus = {
  hasPromptText: boolean;
  targetObjectCount: number;
  placedAssetCount: number;
  hasFinalScene: boolean;
};

export function deriveChapterProductionStatus(scenePackage: ChapterScenePackage | null): ChapterProductionStatus {
  if (!scenePackage) {
    return {
      hasPromptText: false,
      targetObjectCount: 0,
      placedAssetCount: 0,
      hasFinalScene: false,
    };
  }

  return {
    hasPromptText: scenePackage.prompt.prompt_text.trim().length > 0,
    targetObjectCount: scenePackage.target_objects.length,
    // WHY: 这里统计的是已进入 assembly 的 placed asset，而不是 chapter_assets 总数；
    // Task 5 页面需要的是“是否完成摆放”的合同信号，而不是“素材库里有多少图片”。
    placedAssetCount: scenePackage.assembly.placements.length,
    hasFinalScene: scenePackage.final_scene !== null,
  };
}
