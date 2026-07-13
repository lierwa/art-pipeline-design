import type {
  ChapterScenePackage,
  CharacterIpProfile,
  SceneStyleReference,
} from "../types";

export type ChapterPromptStatus =
  | "prompt_setup"
  | "generating"
  | "prompt_ready"
  | "needs_regeneration";

export function chapterPromptStatus(
  scenePackage: ChapterScenePackage,
  characterIps: CharacterIpProfile[],
  sceneStyles: SceneStyleReference[],
  isGeneratingPrompt = false,
): ChapterPromptStatus {
  if (isGeneratingPrompt) {
    return "generating";
  }
  if (!scenePackage.current_prompt_package) {
    return "prompt_setup";
  }
  return isCurrentChapterPromptPackage(scenePackage, characterIps, sceneStyles)
    ? "prompt_ready"
    : "needs_regeneration";
}

export function chapterPromptStatusLabel(status: ChapterPromptStatus): string {
  return {
    prompt_setup: "Prompt setup",
    generating: "Generating",
    prompt_ready: "Prompt ready",
    needs_regeneration: "Needs regeneration",
  }[status];
}

export function isCurrentChapterPromptPackage(
  scenePackage: ChapterScenePackage,
  characterIps: CharacterIpProfile[],
  sceneStyles: SceneStyleReference[],
): boolean {
  const promptPackage = scenePackage.current_prompt_package;
  if (!promptPackage) {
    return false;
  }
  const snapshot = promptPackage.reference_snapshot;
  const charactersById = new Map(characterIps.map((item) => [item.id, item]));
  const style = sceneStyles.find((item) => item.id === scenePackage.scene_style_reference_id);
  const selectedIds = scenePackage.selected_character_ip_ids;

  // WHY: stale 是冻结输入与当前资料的比较结果，不再落一份布尔状态；这样角色、风格、
  // Empty Scene 任何一处改变都只需更新权威输入，不会与独立状态标志漂移。
  return arraysEqual(
    promptPackage.cast_directions.map((item) => item.character_ip_id),
    selectedIds,
  ) && arraysEqual(
    snapshot.character_model_sheets.map((item) => item.character_ip_id),
    selectedIds,
  ) && arraysEqual(
    snapshot.character_model_sheets.map((item) => item.model_sheet_id),
    selectedIds.map((id) => charactersById.get(id)?.current_model_sheet_id ?? ""),
  ) && snapshot.scene_style_reference_id === scenePackage.scene_style_reference_id
    && snapshot.scene_style_image_id === (style?.current_image_id ?? null)
    && snapshot.current_empty_scene_image_id === scenePackage.current_empty_scene_image_id
    && snapshot.global_reference_image_ids.length === 0;
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
