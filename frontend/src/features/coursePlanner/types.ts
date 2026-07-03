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

export type ChapterStatus = "draft" | "designing" | "imported";

export type Chapter = {
  id: string;
  scenePackId: string;
  title: string;
  summary: string;
  seed: ChapterSeed;
  sortOrder: number;
  status: ChapterStatus;
};

export type ChapterCandidate = {
  id: string;
  scenePackId: string;
  title: string;
  summary: string;
  seed: ChapterSeed;
};

export type RuntimeRole = "target" | "initial";

export type ChapterScenePrompt = {
  prompt_text: string;
  scene_spatial_contract: string;
  updated_at: string | null;
};

export type TargetObjectItem = {
  id: string;
  label: string;
  description: string;
  priority: "core" | "required" | "recommended";
};

export type AvoidObjectItem = {
  id: string;
  label: string;
  description: string;
};

export type PromptReadinessConfirmation = {
  avoid_objects_reviewed: boolean;
  style_reference_mode: "unreviewed" | "selected" | "confirmed_empty";
};

export type ChapterCastAssignment = {
  id: string;
  character_ip_id: string;
  role_label: string;
  action_intent: string;
  reference_image_ids: string[];
};

export type ChapterReferenceSelection = {
  id: string;
  reference_image_id: string;
  prompt_role: "character" | "style" | "scene" | "other";
};

export type ImageReferenceSnapshot = {
  reference_image_ids: string[];
  current_empty_scene_image_id: string | null;
  notes: string;
};

export type EmptySceneImage = {
  id: string;
  original_filename: string;
  storage_path: string;
  media_type: "image/png";
  width: number;
  height: number;
  status: "available" | "removed";
  prompt_snapshot: string;
  reference_snapshot: ImageReferenceSnapshot;
  created_at: string;
};

export type CompleteSceneImage = {
  id: string;
  original_filename: string;
  storage_path: string;
  media_type: "image/png";
  width: number;
  height: number;
  empty_scene_image_id: string | null;
  status: "active" | "historical" | "deleted";
  prompt_snapshot: string;
  reference_snapshot: ImageReferenceSnapshot;
  generation_note: string;
  pipeline_run_id: string | null;
  pipeline_run_status: string | null;
  created_at: string;
};

export type ChapterAssetLineage = {
  source_kind: "pipeline_run_asset" | "direct_upload";
  source_run_id: string | null;
  source_run_asset_id: string | null;
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
  empty_scene_image_id: string | null;
  empty_scene_size: { width: number; height: number } | null;
  placements: ChapterSceneAssemblyPlacement[];
  groups: ChapterSceneAssemblyGroup[];
  layer_order: string[];
  updated_at: string | null;
};

export type FinalChapterScene = {
  id: string;
  original_filename: string;
  storage_path: string;
  media_type: "image/png";
  width: number;
  height: number;
  empty_scene_image_id: string;
  assembly_snapshot: ChapterSceneAssemblyManifest;
  prompt_snapshot: string;
  reference_snapshot: ImageReferenceSnapshot;
  created_at: string;
};

export type ChapterScenePackage = {
  chapter_id: string;
  current_empty_scene_image_id: string | null;
  prompt: ChapterScenePrompt;
  prompt_confirmations: PromptReadinessConfirmation;
  cast_assignments: ChapterCastAssignment[];
  reference_selections: ChapterReferenceSelection[];
  target_objects: TargetObjectItem[];
  avoid_objects: AvoidObjectItem[];
  empty_scene_images: EmptySceneImage[];
  complete_images: CompleteSceneImage[];
  chapter_assets: ChapterAsset[];
  assembly: ChapterSceneAssemblyManifest;
  final_scene: FinalChapterScene | null;
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
  selectedChapterId: string | null;
  asyncStatus: AsyncStatusMap;
  tasks: AiTaskRecord[];
};
