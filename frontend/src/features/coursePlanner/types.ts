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

export type TargetObjectExemption = {
  target_object_id: string;
  reason: string;
};

export type CharacterIpProfile = {
  id: string;
  display_name: string;
  current_model_sheet_id: string;
  created_at: string;
  updated_at: string | null;
};

export type SceneStyleReference = {
  id: string;
  display_name: string;
  current_image_id: string;
  created_at: string;
  updated_at: string | null;
};

export type PromptReadinessConfirmation = {
  avoid_objects_reviewed: boolean;
};

export type ChapterCastAssignment = {
  id: string;
  character_ip_id: string;
  role_label: string;
  action_intent: string;
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

export type ChapterAssetLineage =
  | {
    source_kind: "direct_upload";
  }
  | {
    source_kind: "generated_asset";
    complete_scene_image_id: string;
    pipeline_run_id: string;
    run_asset_id: string;
  };

export type ChapterAsset = {
  id: string;
  display_name: string;
  original_filename: string;
  storage_path: string;
  media_type: "image/png";
  width: number;
  height: number;
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

export type WorkspaceRunImportSummary = {
  id: string;
  title: string;
  sourceFilename: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  elementCount: number;
};

export type GeneratedChapterAssetState = "available" | "unavailable" | "added";

export type GeneratedChapterAsset = {
  complete_scene_image_id: string;
  pipeline_run_id: string;
  run_asset_id: string;
  display_name: string;
  state: GeneratedChapterAssetState;
  width: number | null;
  height: number | null;
  unavailable_reason: string | null;
  chapter_asset_id: string | null;
};

export type ChapterScenePackage = {
  chapter_id: string;
  current_empty_scene_image_id: string | null;
  prompt: ChapterScenePrompt;
  prompt_confirmations: PromptReadinessConfirmation;
  cast_assignments: ChapterCastAssignment[];
  scene_style_reference_id: string | null;
  target_objects: TargetObjectItem[];
  target_object_exemptions: TargetObjectExemption[];
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
