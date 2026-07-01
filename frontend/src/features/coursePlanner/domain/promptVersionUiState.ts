import type { PromptVersion } from "../types";

const GENERIC_HUMAN_ROLE_PATTERN = /小学生|孩子|家长|student|child|parent/i;

export type PromptVersionUiStateKey =
  | "empty"
  | "needs_tuning"
  | "prompt_ready"
  | "adopted"
  | "archived"
  | "draft";

export type PromptVersionUiState = {
  key: PromptVersionUiStateKey;
  label: string;
  tone: "neutral" | "info" | "success" | "warning" | "danger";
  canGeneratePrompt: boolean;
  canCopyPrompt: boolean;
  canUploadImage: boolean;
  reason?: string;
};

export function hasCastBindings(version: PromptVersion | null): boolean {
  return Boolean(version?.castBindings && version.castBindings.length > 0);
}

export function isLegacyPromptPackage(version: PromptVersion | null): boolean {
  const fullPrompt = version?.promptPackage?.fullPrompt ?? "";
  return /Scene Director Plan:|Object Plan:|required_objects|core_objects/i.test(fullPrompt);
}

export function canShowPromptVersionText(uiState: PromptVersionUiState, text: string | null | undefined): boolean {
  if (!text) {
    return false;
  }
  if (uiState.key !== "needs_tuning") {
    return true;
  }
  // WHY: 缺角色 IP 时，旧 AI 产物里的“孩子/家长/学生”只能作为待调校输入，
  // 不能在 02 被展示成有效角色事实，否则会误导最终 Image2 prompt 链路。
  return !GENERIC_HUMAN_ROLE_PATTERN.test(text);
}

export function isPromptVersionAdopted(version: PromptVersion | null, adoptedVersionId: string | null): boolean {
  if (!version) {
    return false;
  }
  // WHY: adoptedVersionId 一旦存在，就代表当前工作台在这个渲染瞬间的唯一 adopted 事实；
  // 乐观 adopt 窗口里必须优先吃这份事实源，避免列表和详情各自解释 status，出现同一版本一边 Adopted 一边 Prompt ready。
  if (adoptedVersionId) {
    return version.id === adoptedVersionId;
  }
  return version.status === "adopted";
}

// WHY: 02 的 readiness 同时受后端 status、角色 IP 绑定、历史 Prompt Package 协议影响；
// 统一在这里派生，避免列表、中栏、右栏各自写一套“能不能继续往下走”的判断。
export function derivePromptVersionUiState(version: PromptVersion | null): PromptVersionUiState {
  if (!version) {
    return {
      key: "empty",
      label: "No version",
      tone: "neutral",
      canGeneratePrompt: false,
      canCopyPrompt: false,
      canUploadImage: false,
    };
  }

  if (version.status === "archived") {
    return {
      key: "archived",
      label: "Archived",
      tone: "neutral",
      canGeneratePrompt: false,
      canCopyPrompt: false,
      canUploadImage: false,
      reason: "Archived versions cannot generate or upload images.",
    };
  }

  if (!hasCastBindings(version)) {
    return {
      key: "needs_tuning",
      label: "Needs tuning",
      tone: "warning",
      canGeneratePrompt: false,
      canCopyPrompt: false,
      canUploadImage: false,
      reason: "Add role IP and reference images before generating the final Image2 prompt.",
    };
  }

  const canUseGeneratedPrompt = !isLegacyPromptPackage(version);

  if (version.status === "adopted") {
    return {
      key: "adopted",
      label: "Adopted",
      tone: "success",
      canGeneratePrompt: true,
      canCopyPrompt: canUseGeneratedPrompt,
      canUploadImage: canUseGeneratedPrompt,
    };
  }

  if (version.status === "prompt_ready" || version.status === "has_attempts") {
    return {
      key: "prompt_ready",
      label: "Prompt ready",
      tone: "success",
      canGeneratePrompt: true,
      canCopyPrompt: canUseGeneratedPrompt,
      canUploadImage: canUseGeneratedPrompt,
    };
  }

  return {
    key: "draft",
    label: "Draft",
    tone: "info",
    canGeneratePrompt: true,
    canCopyPrompt: false,
    canUploadImage: false,
  };
}

export function derivePromptVersionDisplayState(
  version: PromptVersion | null,
  adoptedVersionId: string | null,
): PromptVersionUiState {
  const uiState = derivePromptVersionUiState(version);
  if (uiState.key !== "adopted" || isPromptVersionAdopted(version, adoptedVersionId)) {
    return uiState;
  }
  return {
    ...uiState,
    key: "prompt_ready",
    label: "Prompt ready",
  };
}
