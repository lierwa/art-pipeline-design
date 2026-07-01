export type ScenePack = {
  id: string;
  title: string;
  intent: string;
  notes?: string | null;
  status: "draft" | "active" | "archived";
  chapterIds: string[];
  chapterListLocked?: boolean | null;
};

export type CharacterConceptHint = {
  castMode: "main_cast_and_supporting_cast";
  mainCastHint: string;
  supportingCastHint?: string | null;
  referenceAssetIds?: string[] | null;
  constraints: string[];
};

export type ChapterSeed = {
  scenePackId: string;
  scenePackTitle: string;
  chapterId: string;
  chapterTitle: string;
  chapterIntent: string;
  sceneDomain: string;
  dailyMoment?: string | null;
  eventSeed: string;
  spatialSeed: string;
  objectCoverageHint: string[];
  characterConceptHint: CharacterConceptHint;
  styleNotes?: string | null;
};

export type ChapterStatus = "draft" | "designing" | "prompt_ready" | "has_attempts" | "imported";

export type Chapter = {
  id: string;
  scenePackId: string;
  title: string;
  summary: string;
  seed: ChapterSeed;
  sortOrder: number;
  status: ChapterStatus;
  adoptedPromptVersionId?: string | null;
};

export type ChapterCandidate = {
  id: string;
  scenePackId: string;
  title: string;
  summary: string;
  seed: ChapterSeed;
};

export type SceneDirectorPlan = {
  storyEvent: string;
  sceneComposition: string;
  spatialStructure: string;
  characterArrangement: string;
  actionDesign: string;
  styleAndConstraints: string;
};

export type PlannedObject = {
  name: string;
  roleInScene: string;
  placementHint?: string | null;
  priority: "core" | "required" | "recommended" | "avoid";
};

export type ObjectPlan = {
  coreObjects: PlannedObject[];
  requiredObjects: PlannedObject[];
  recommendedObjects: PlannedObject[];
  avoidOrMoveObjects: PlannedObject[];
};

export type CastBinding = {
  characterId: string;
  displayName: string;
  roleInScene: "main" | "support" | "background";
  actionIntent: string;
  referenceImageIds: string[];
  invariants: string[];
};

export type SceneVocabulary = {
  narrativeAnchors: string[];
  optionalVocabularyCandidates: string[];
  ambientFurnishingPolicy: string;
  avoidObjects: string[];
};

export type PromptTuning = {
  styleAnchor: string;
  styleReferenceImageIds: string[];
  sceneReferenceImageIds: string[];
  mustKeep: string[];
  avoid: string[];
};

export type PromptPackage = {
  fullPrompt: string;
  shortPrompt?: string | null;
  negativeConstraints: string;
  revisionPrompt?: string | null;
};

export type PromptVersion = {
  id: string;
  chapterId: string;
  versionLabel: string;
  title: string;
  status: "draft" | "prompt_ready" | "has_attempts" | "adopted" | "archived";
  sceneDirectorPlan: SceneDirectorPlan;
  castBindings: CastBinding[];
  sceneVocabulary: SceneVocabulary;
  promptTuning: PromptTuning;
  objectPlan: ObjectPlan;
  promptPackage: PromptPackage;
  sourceVersionId?: string | null;
  imageAttemptIds: string[];
};

export type ImageAttemptReview = {
  summary: string;
  strengths: string[];
  issues: string[];
  recommendation?: "accept" | "revise" | "reject" | null;
};

export type ImageAttempt = {
  id: string;
  promptVersionId: string;
  uploadedImageId: string;
  status: "uploaded" | "ai_reviewed" | "accepted" | "not_accepted" | "imported";
  aiReview?: ImageAttemptReview | null;
  humanDecision?: "accept" | "revise_version" | "keep_record" | "delete" | null;
  pipelineImportId?: string | null;
};

export type AsyncOperationState = {
  status: "idle" | "pending" | "succeeded" | "failed";
  error?: string | null;
};

export type AsyncStatusMap = Record<string, AsyncOperationState | undefined>;

export type AiTaskRecord = {
  id: string;
  kind: string;
  status: "succeeded" | "failed";
  target: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  error: string | null;
};

export type CoursePlannerState = {
  scenePacks: ScenePack[];
  activeScenePackId: string | null;
  candidatesByScenePackId: Record<string, ChapterCandidate[]>;
  chaptersByScenePackId: Record<string, Chapter[]>;
  promptVersionsByChapterId: Record<string, PromptVersion[]>;
  imageAttemptsByVersionId: Record<string, ImageAttempt[]>;
  selectedChapterId: string | null;
  selectedPromptVersionId: string | null;
  asyncStatus: AsyncStatusMap;
  tasks: AiTaskRecord[];
};
