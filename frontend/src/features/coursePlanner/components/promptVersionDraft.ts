import type { CastBinding, PromptTuning, PromptVersion, SceneVocabulary } from "../types";

export type SceneVocabularyText = {
  narrativeAnchors: string;
  optionalVocabularyCandidates: string;
  ambientFurnishingPolicy: string;
  avoidObjects: string;
};

export type PromptTuningText = {
  styleAnchor: string;
  styleReferenceImageIds: string;
  sceneReferenceImageIds: string;
  mustKeep: string;
  avoid: string;
};

export type PromptVersionDraft = {
  sceneDirectorPlan: PromptVersion["sceneDirectorPlan"];
  castBindingText: string;
  sceneVocabularyText: SceneVocabularyText;
  promptTuningText: PromptTuningText;
};

export function draftFromVersion(version: PromptVersion): PromptVersionDraft {
  return {
    sceneDirectorPlan: { ...version.sceneDirectorPlan },
    castBindingText: castBindingsToText(version.castBindings ?? []),
    sceneVocabularyText: sceneVocabularyToText(version.sceneVocabulary ?? emptySceneVocabulary()),
    promptTuningText: promptTuningToText(version.promptTuning ?? promptTuningFallback(version)),
  };
}

// WHY: 02 的设计 drawer 编辑的是多段 textarea 文本，而后端 patch 仍要求结构化对象；
// 统一在这里做收敛，避免 page、drawer、测试各自维护一套文本协议。
export function promptVersionPatchFromDraft(
  draft: PromptVersionDraft,
): Pick<PromptVersion, "sceneDirectorPlan" | "castBindings" | "sceneVocabulary" | "promptTuning"> {
  return {
    sceneDirectorPlan: draft.sceneDirectorPlan,
    castBindings: castBindingsFromText(draft.castBindingText),
    sceneVocabulary: sceneVocabularyFromText(draft.sceneVocabularyText),
    promptTuning: promptTuningFromText(draft.promptTuningText),
  };
}

export function draftEquals(left: PromptVersionDraft, right: PromptVersionDraft): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function castBindingsToText(bindings: CastBinding[]): string {
  return bindings
    .map((binding) => [
      binding.characterId,
      binding.displayName,
      binding.roleInScene,
      binding.actionIntent,
      binding.referenceImageIds.join(", "),
      binding.invariants.join(", "),
    ].join(" | "))
    .join("\n");
}

function sceneVocabularyToText(vocabulary: SceneVocabulary): SceneVocabularyText {
  return {
    narrativeAnchors: vocabulary.narrativeAnchors.join("\n"),
    optionalVocabularyCandidates: vocabulary.optionalVocabularyCandidates.join("\n"),
    ambientFurnishingPolicy: vocabulary.ambientFurnishingPolicy,
    avoidObjects: vocabulary.avoidObjects.join("\n"),
  };
}

function promptTuningToText(tuning: PromptTuning): PromptTuningText {
  return {
    styleAnchor: tuning.styleAnchor,
    styleReferenceImageIds: tuning.styleReferenceImageIds.join("\n"),
    sceneReferenceImageIds: tuning.sceneReferenceImageIds.join("\n"),
    mustKeep: tuning.mustKeep.join("\n"),
    avoid: tuning.avoid.join("\n"),
  };
}

function promptTuningFallback(version: PromptVersion): PromptTuning {
  return {
    styleAnchor: version.sceneDirectorPlan.styleAndConstraints,
    styleReferenceImageIds: [],
    sceneReferenceImageIds: [],
    mustKeep: [],
    avoid: [],
  };
}

function emptySceneVocabulary(): SceneVocabulary {
  return {
    narrativeAnchors: [],
    optionalVocabularyCandidates: [],
    ambientFurnishingPolicy: "",
    avoidObjects: [],
  };
}

function castBindingsFromText(text: string): CastBinding[] {
  return text
    .split(/\r?\n/)
    .map(castBindingFromLine)
    .filter((binding): binding is CastBinding => Boolean(binding));
}

function castBindingFromLine(line: string): CastBinding | null {
  const [characterId = "", displayName = "", roleInScene = "", actionIntent = "", referenceImageIds = "", invariants = ""] = line
    .split("|")
    .map((part) => part.trim());
  if (!characterId || !displayName || !actionIntent) {
    return null;
  }
  return {
    characterId,
    displayName,
    roleInScene: parseCastRole(roleInScene),
    actionIntent,
    referenceImageIds: commaListFromText(referenceImageIds),
    invariants: commaListFromText(invariants),
  };
}

function parseCastRole(value: string): CastBinding["roleInScene"] {
  if (value === "main" || value === "support" || value === "background") {
    return value;
  }
  return "support";
}

function sceneVocabularyFromText(text: SceneVocabularyText): SceneVocabulary {
  return {
    narrativeAnchors: linesFromText(text.narrativeAnchors),
    optionalVocabularyCandidates: linesFromText(text.optionalVocabularyCandidates),
    ambientFurnishingPolicy: text.ambientFurnishingPolicy.trim(),
    avoidObjects: linesFromText(text.avoidObjects),
  };
}

function promptTuningFromText(text: PromptTuningText): PromptTuning {
  return {
    styleAnchor: text.styleAnchor.trim(),
    styleReferenceImageIds: linesFromText(text.styleReferenceImageIds),
    sceneReferenceImageIds: linesFromText(text.sceneReferenceImageIds),
    mustKeep: linesFromText(text.mustKeep),
    avoid: linesFromText(text.avoid),
  };
}

function linesFromText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function commaListFromText(text: string): string[] {
  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
