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

export type RuntimeRole = "target" | "initial";

export type ChapterScenePrompt = {
  prompt_text: string;
  negative_constraints: string;
  style_notes: string;
  updated_at: string | null;
};

export type TargetObjectItem = {
  id: string;
  label: string;
  description: string;
  priority: "core" | "required" | "recommended";
};

export type ChapterSceneReference = {
  id: string;
  original_filename: string;
  storage_path: string;
  media_type: "image/png";
  created_at: string;
  prompt_role: "style" | "scene" | "character" | "other";
  notes: string;
};

export type ImageReferenceSnapshot = {
  reference_ids: string[];
  locked_base_candidate_id: string | null;
  notes: string;
};

export type EmptyBaseSceneCandidate = {
  id: string;
  original_filename: string;
  storage_path: string;
  media_type: "image/png";
  width: number;
  height: number;
  status: "candidate" | "locked" | "inactive";
  prompt_snapshot: string;
  reference_snapshot: ImageReferenceSnapshot;
  created_at: string;
  locked_at: string | null;
};

export type CompleteSceneImage = {
  id: string;
  original_filename: string;
  storage_path: string;
  media_type: "image/png";
  width: number;
  height: number;
  base_candidate_id: string;
  status: "active" | "historical" | "deleted";
  prompt_snapshot: string;
  reference_snapshot: ImageReferenceSnapshot;
  variation_prompt: string;
  pipeline_run_id: string | null;
  pipeline_run_status: string | null;
  created_at: string;
};

export type ChapterAssetLineage = {
  source_run_id: string;
  source_run_asset_id: string;
  source_complete_image_id: string | null;
};

export type ChapterAsset = {
  id: string;
  display_name: string;
  original_filename: string;
  storage_path: string;
  media_type: "image/png";
  lineage: ChapterAssetLineage;
  linked_target_object_id: string | null;
  status: "available" | "removed";
  created_at: string;
};

export type ChapterSceneAssemblyBaseSize = {
  width: number;
  height: number;
};

export type ChapterSceneAssemblyTransform = {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rotation_deg: number;
};

export type ChapterSceneAssemblyPlacement = {
  id: string;
  asset_id: string;
  display_name: string;
  runtime_role: RuntimeRole;
  transform: ChapterSceneAssemblyTransform;
  group_id: string | null;
  requires_placed: string[];
};

export type ChapterSceneAssemblyGroup = {
  id: string;
  display_name: string;
  placement_ids: string[];
};

export type ChapterSceneAssemblyManifest = {
  schema_version: 1;
  base_candidate_id: string | null;
  base_size: ChapterSceneAssemblyBaseSize | null;
  placements: ChapterSceneAssemblyPlacement[];
  groups: ChapterSceneAssemblyGroup[];
  layer_order: string[];
  updated_at: string | null;
};

export type ChapterScenePackage = {
  chapter_id: string;
  prompt: ChapterScenePrompt;
  target_objects: TargetObjectItem[];
  references: ChapterSceneReference[];
  base_candidates: EmptyBaseSceneCandidate[];
  locked_base_candidate_id: string | null;
  complete_images: CompleteSceneImage[];
  chapter_assets: ChapterAsset[];
  assembly: ChapterSceneAssemblyManifest;
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
