import {
  AssetRole,
  Box,
  GenerationProfile,
  WorkflowState,
  WorkflowStage,
  RepairMetadata,
  RepairQaReport,
  SelectedElementIds,
  normalizeWorkspaceState,
  workspaceApiUrl,
  WorkspaceElement,
  WorkspaceState,
} from "./workspace";
import type { WorkspaceTask } from "./workspaceTasks";

export type Fetcher = typeof fetch;

export type CreateElementResponse = {
  element: WorkspaceElement;
  state: WorkspaceState;
};

export type WorkspaceElementMutationResponse = {
  element: WorkspaceElement;
  state: WorkspaceState;
};

export type WorkspaceWorkflowResponse = WorkflowState;

export type WorkspaceStageResponse = {
  state: WorkspaceState;
  workflow: WorkflowState;
  task?: WorkspaceTask;
};

export type CodexFinalTaskRequest = {
  elementIds?: string[];
  promptHints?: Record<string, string>;
  force?: boolean;
};

export type PatchWorkspaceElementRequest = {
  bbox?: Box;
  label?: string;
  visible?: boolean;
  assetRole?: AssetRole;
  removeFromParent?: string | null;
};

export type ElementParentRequest = {
  parentId: string | null;
};

export type ChildWorkspaceElementRequest = {
  label: string;
  bbox: Box;
};

export type MergeWorkspaceElementsRequest = {
  elementIds: SelectedElementIds;
  label?: string;
};

export type SplitElementResponse = {
  children: WorkspaceElement[];
  state: WorkspaceState;
};

export type SplitRequestResponse = {
  requestId: string;
  path: string;
};

export type ClickDetectResponse = {
  element: WorkspaceElement;
  state: WorkspaceState;
};

export type SegmentSuggestResponse = {
  element: WorkspaceElement;
  segmentation: Record<string, unknown>;
  state: WorkspaceState;
};

export type SegmentSuggestAllResponse = {
  segmentations: Array<{ elementId: string } & Record<string, unknown>>;
  state: WorkspaceState;
};

export type SegmentAcceptResponse = {
  element: WorkspaceElement;
  state: WorkspaceState;
};

export type SegmentMaskPatchRequest = {
  operation?: "replace" | "add" | "subtract";
  shape:
    | {
      type: "rectangle";
      coordinateSpace: "canvas";
      bbox: Box;
    }
    | {
      type: "magic_wand";
      coordinateSpace: "canvas";
      seed: { x: number; y: number };
      tolerance: number;
    }
    | {
      type: "mask_delta";
      coordinateSpace: "canvas";
      maskData: string;
      cleanupMinArea?: number;
    };
};

export type CodexFinalGenerateResponse = {
  element: WorkspaceElement;
  generation: Record<string, unknown>;
  state: WorkspaceState;
};

export type CodexFinalTimingMetadata = {
  rawOutputSeconds?: number | null;
  processSeconds?: number | null;
  [key: string]: unknown;
};

export type CodexFinalRequestInputImage = {
  path: string;
  role: string;
  [key: string]: unknown;
};

export type CodexFinalRequestMetadata = {
  provider: string | null;
  createdAt: string | null;
  generationProfile: GenerationProfile | null;
  assetPath: string | null;
  rawOutputPath: string | null;
  outputPath: string | null;
  workDirPath: string | null;
  promptPath: string | null;
  briefImagePath: string | null;
  briefJsonPath: string | null;
  jobId: string | null;
  codexThreadId: string | null;
  referenceSha256: string | null;
  rawOutputSha256: string | null;
  outputSha256: string | null;
  isOutputIdenticalToReference: boolean | null;
  chromaKey: [number, number, number] | null;
  timing: CodexFinalTimingMetadata | null;
  inputImagePaths: string[];
  inputImages: CodexFinalRequestInputImage[];
  removedChildren: Array<{ name?: string | null; maskPath?: string | null } & Record<string, unknown>>;
  promptHint: string | null;
  prompt: string | null;
};

export type ExtractWorkspaceResponse = {
  extractions: Array<{
    elementId: string;
    strategy: string;
    maskPath: string;
    assetPath: string;
    sourceCropPath?: string;
  }>;
  state: WorkspaceState;
};

export type ClearMaskResponse = {
  state: WorkspaceState;
};

export type ReplaceMaskResponse = {
  state: WorkspaceState;
};

export type SaveMissingMaskResponse = {
  missingMaskPath: string;
  repair?: RepairMetadata;
  state: WorkspaceState;
};

export type CreateRepairTaskResponse = {
  paths: Record<string, string>;
  repair?: RepairMetadata;
  state: WorkspaceState;
};

export type ValidateRepairResponse = {
  qa: RepairQaReport;
  repair?: RepairMetadata;
  state: WorkspaceState;
};

export async function runWorkspaceDetection(
  runId: string | null = null,
  fetcher: Fetcher = fetch,
): Promise<WorkspaceState> {
  return requestJson<WorkspaceState>(
    fetcher,
    workspaceApiUrl("/api/workspace/detect", runId),
    { method: "POST" },
    "Detection failed.",
  );
}

export async function fetchWorkspaceWorkflow(
  runId: string | null = null,
  fetcher: Fetcher = fetch,
): Promise<WorkspaceWorkflowResponse> {
  return normalizeWorkflowState(await requestJson<WorkspaceWorkflowResponse>(
    fetcher,
    workspaceApiUrl("/api/workspace/workflow", runId),
    { method: "GET" },
    "Could not load workflow state.",
  ));
}

export async function runWorkspaceStageDetect(
  runId: string | null = null,
  fetcher: Fetcher = fetch,
): Promise<WorkspaceStageResponse> {
  let response: Response;
  try {
    response = await fetcher(workspaceApiUrl("/api/workspace/stage/detect", runId), { method: "POST" });
  } catch {
    return wrapLegacyStageState(await runWorkspaceDetection(runId, fetcher), "detect");
  }
  if (response.ok) {
    return normalizeStageResponse((await response.json()) as WorkspaceStageResponse);
  }
  // WHY: 旧测试和旧本地后端只实现 /detect；只在 stage API 缺失时降级，
  // 避免把真实 provider 失败误吞成另一条流程。
  if (response.status === 404) {
    return wrapLegacyStageState(await runWorkspaceDetection(runId, fetcher), "detect");
  }
  throw await responseError(response, "Detection failed.");
}

export async function runWorkspaceStageMask(
  runId: string | null = null,
  fetcher: Fetcher = fetch,
): Promise<WorkspaceStageResponse> {
  let response: Response;
  try {
    response = await fetcher(workspaceApiUrl("/api/workspace/stage/mask", runId), { method: "POST" });
  } catch {
    return startLegacyTaskStage("mask", "/api/workspace/tasks/sam2-masks", runId, fetcher);
  }
  if (response.ok) {
    return normalizeStageResponse((await response.json()) as WorkspaceStageResponse);
  }
  if (response.status === 404) {
    return startLegacyTaskStage("mask", "/api/workspace/tasks/sam2-masks", runId, fetcher);
  }
  throw await responseError(response, "Could not start mask generation.");
}

export async function runWorkspaceStageGenerate(
  elementIds: string[],
  request: Omit<CodexFinalTaskRequest, "elementIds"> = {},
  runId: string | null = null,
  fetcher: Fetcher = fetch,
): Promise<WorkspaceStageResponse> {
  const body = { ...request, elementIds };
  let response: Response;
  try {
    response = await fetcher(
      workspaceApiUrl("/api/workspace/stage/generate", runId),
      jsonRequest("POST", body),
    );
  } catch {
    return startLegacyTaskStage("generate", "/api/workspace/tasks/codex-finals", runId, fetcher, body);
  }
  if (response.ok) {
    return normalizeStageResponse((await response.json()) as WorkspaceStageResponse);
  }
  if (response.status === 404) {
    return startLegacyTaskStage("generate", "/api/workspace/tasks/codex-finals", runId, fetcher, body);
  }
  throw await responseError(response, "Could not start final generation.");
}

export async function runWorkspaceStageBack(
  runId: string | null = null,
  fetcher: Fetcher = fetch,
): Promise<WorkspaceStageResponse> {
  return normalizeStageResponse(await requestJson<WorkspaceStageResponse>(
    fetcher,
    workspaceApiUrl("/api/workspace/stage/back", runId),
    { method: "POST" },
    "Could not go back to the previous workflow stage.",
  ));
}

export async function saveWorkflowGenerateSelection(
  generateSelection: Record<string, boolean>,
  runId: string | null = null,
  fetcher: Fetcher = fetch,
): Promise<WorkspaceWorkflowResponse> {
  return normalizeWorkflowState(await requestJson<WorkspaceWorkflowResponse>(
    fetcher,
    workspaceApiUrl("/api/workspace/workflow/generate-selection", runId),
    jsonRequest("PATCH", { generateSelection }),
    "Could not save generate selection.",
  ));
}

export async function saveWorkflowGeneratePromptHints(
  generatePromptHints: Record<string, string>,
  runId: string | null = null,
  fetcher: Fetcher = fetch,
): Promise<WorkspaceWorkflowResponse> {
  return normalizeWorkflowState(await requestJson<WorkspaceWorkflowResponse>(
    fetcher,
    workspaceApiUrl("/api/workspace/workflow/generate-prompts", runId),
    jsonRequest("PATCH", { generatePromptHints }),
    "Could not save generate prompt hints.",
  ));
}

export async function fetchCodexFinalRequestMetadata(
  elementId: string,
  runId: string | null = null,
  fetcher: Fetcher = fetch,
): Promise<CodexFinalRequestMetadata | null> {
  const response = await fetcher(
    workspaceApiUrl(`/api/workspace/elements/${elementId}/codex-final/request`, runId),
    { method: "GET" },
  );
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw await responseError(response, "Could not load Codex request metadata.");
  }
  return normalizeCodexFinalRequestMetadata((await response.json()) as CodexFinalRequestMetadata);
}

export async function patchWorkspaceElement(
  elementId: string,
  request: PatchWorkspaceElementRequest,
  runId: string | null = null,
  fetcher: Fetcher = fetch,
): Promise<WorkspaceElementMutationResponse> {
  return requestJson<WorkspaceElementMutationResponse>(
    fetcher,
    workspaceApiUrl(`/api/workspace/elements/${elementId}`, runId),
    jsonRequest("PATCH", request),
    "Could not save element.",
  );
}

export async function patchWorkspaceElementParent(
  elementId: string,
  request: ElementParentRequest,
  runId: string | null = null,
  fetcher: Fetcher = fetch,
): Promise<WorkspaceElementMutationResponse> {
  return requestJson<WorkspaceElementMutationResponse>(
    fetcher,
    workspaceApiUrl(`/api/workspace/elements/${elementId}/parent`, runId),
    jsonRequest("PATCH", request),
    "Could not update parent relationship.",
  );
}

export async function createWorkspaceChildElement(
  elementId: string,
  request: ChildWorkspaceElementRequest,
  runId: string | null = null,
  fetcher: Fetcher = fetch,
): Promise<WorkspaceElementMutationResponse> {
  return requestJson<WorkspaceElementMutationResponse>(
    fetcher,
    workspaceApiUrl(`/api/workspace/elements/${elementId}/children`, runId),
    jsonRequest("POST", request),
    "Could not create child element.",
  );
}

export async function mergeWorkspaceElements(
  request: MergeWorkspaceElementsRequest,
  runId: string | null = null,
  fetcher: Fetcher = fetch,
): Promise<WorkspaceElementMutationResponse> {
  return requestJson<WorkspaceElementMutationResponse>(
    fetcher,
    workspaceApiUrl("/api/workspace/elements/merge", runId),
    jsonRequest("POST", request),
    "Could not merge elements.",
  );
}

export async function saveDetectionVocabulary(
  labels: string[],
  runId: string | null = null,
  fetcher: Fetcher = fetch,
): Promise<WorkspaceState> {
  return requestJson<WorkspaceState>(
    fetcher,
    workspaceApiUrl("/api/workspace/detection-vocabulary", runId),
    jsonRequest("POST", labels),
    "Could not save detection vocabulary.",
  );
}

export async function clickDetectWorkspace(
  point: { x: number; y: number },
  label: string,
  runId: string | null = null,
  fetcher: Fetcher = fetch,
): Promise<ClickDetectResponse> {
  return requestJson<ClickDetectResponse>(
    fetcher,
    workspaceApiUrl("/api/workspace/click-detect", runId),
    jsonRequest("POST", {
      x: point.x,
      y: point.y,
      label,
    }),
    "Click detection failed.",
  );
}

export async function suggestElementSegment(
  elementId: string,
  runId: string | null = null,
  fetcher: Fetcher = fetch,
): Promise<SegmentSuggestResponse> {
  return requestJson<SegmentSuggestResponse>(
    fetcher,
    workspaceApiUrl(`/api/workspace/elements/${elementId}/segment/suggest`, runId),
    { method: "POST" },
    "Could not suggest segment mask.",
  );
}

export async function suggestWorkspaceSegments(
  runId: string | null = null,
  fetcher: Fetcher = fetch,
): Promise<SegmentSuggestAllResponse> {
  return requestJson<SegmentSuggestAllResponse>(
    fetcher,
    workspaceApiUrl("/api/workspace/segment/suggest", runId),
    { method: "POST" },
    "Could not suggest segment masks.",
  );
}

export async function acceptElementSegment(
  elementId: string,
  runId: string | null = null,
  fetcher: Fetcher = fetch,
): Promise<SegmentAcceptResponse> {
  return requestJson<SegmentAcceptResponse>(
    fetcher,
    workspaceApiUrl(`/api/workspace/elements/${elementId}/segment/accept`, runId),
    { method: "POST" },
    "Could not accept segment mask.",
  );
}

export async function patchElementSegmentMask(
  elementId: string,
  patch: SegmentMaskPatchRequest,
  runId: string | null = null,
  fetcher: Fetcher = fetch,
): Promise<SegmentSuggestResponse> {
  return requestJson<SegmentSuggestResponse>(
    fetcher,
    workspaceApiUrl(`/api/workspace/elements/${elementId}/segment/mask`, runId),
    jsonRequest("PATCH", patch),
    "Could not update segment mask.",
  );
}

export async function generateElementCodexFinal(
  elementId: string,
  promptHint: string | null = null,
  runId: string | null = null,
  fetcher: Fetcher = fetch,
): Promise<CodexFinalGenerateResponse> {
  return requestJson<CodexFinalGenerateResponse>(
    fetcher,
    workspaceApiUrl(`/api/workspace/elements/${elementId}/codex-final/generate`, runId),
    promptHint ? jsonRequest("POST", { promptHint }) : { method: "POST" },
    "Could not generate Codex final asset.",
  );
}

function jsonRequest(method: "PATCH" | "POST", body: unknown): RequestInit {
  return {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

async function requestJson<T>(
  fetcher: Fetcher,
  input: RequestInfo | URL,
  init: RequestInit,
  fallbackError: string,
): Promise<T> {
  const response = await fetcher(input, init);
  if (!response.ok) {
    throw await responseError(response, fallbackError);
  }
  return (await response.json()) as T;
}

async function responseError(response: Response, fallbackError: string): Promise<Error> {
  const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
  return new Error(payload?.detail ?? fallbackError);
}

function wrapLegacyStageState(
  state: WorkspaceState,
  stage: WorkflowStage,
): WorkspaceStageResponse {
  return {
    state,
    workflow: buildWorkflowState(stage, state),
  };
}

async function startLegacyTaskStage(
  stage: WorkflowStage,
  taskPath: string,
  runId: string | null,
  fetcher: Fetcher,
  body?: Record<string, unknown>,
): Promise<WorkspaceStageResponse> {
  const task = await requestJson<WorkspaceTask>(
    fetcher,
    workspaceApiUrl(taskPath, runId),
    body ? jsonRequest("POST", body) : { method: "POST" },
    stage === "mask" ? "Could not start mask generation." : "Could not start final generation.",
  );
  const state = await requestJson<WorkspaceState>(
    fetcher,
    workspaceApiUrl("/api/workspace/state", runId),
    { method: "GET" },
    "Could not refresh workspace state.",
  );
  return {
    state,
    workflow: buildWorkflowState(stage, state),
    task,
  };
}

function buildWorkflowState(stage: WorkflowStage, state: WorkspaceState): WorkflowState {
  return {
    stage,
    generateSelection: Object.fromEntries(
      state.elements
        .filter((element) => element.mergedInto === null && element.visible && element.assetRole !== "skip")
        .map((element) => [element.id, true]),
    ),
    generatePromptHints: {},
    stageSnapshots: {},
    taskIds: {
      detectionBatch: null,
      sam2MaskBatch: null,
      codexFinalBatches: [],
    },
    lastExportSummary: null,
  };
}

function normalizeStageResponse(response: WorkspaceStageResponse): WorkspaceStageResponse {
  return {
    ...response,
    state: normalizeWorkspaceState(response.state),
    workflow: normalizeWorkflowState(response.workflow),
  };
}

function normalizeWorkflowState(workflow: WorkflowState): WorkflowState {
  return {
    ...workflow,
    generateSelection: workflow.generateSelection ?? {},
    generatePromptHints: workflow.generatePromptHints ?? {},
    stageSnapshots: workflow.stageSnapshots ?? {},
    taskIds: {
      detectionBatch: workflow.taskIds?.detectionBatch ?? null,
      sam2MaskBatch: workflow.taskIds?.sam2MaskBatch ?? null,
      codexFinalBatches: workflow.taskIds?.codexFinalBatches ?? [],
    },
    lastExportSummary: workflow.lastExportSummary ?? null,
  };
}

function normalizeCodexFinalRequestMetadata(
  metadata: CodexFinalRequestMetadata,
): CodexFinalRequestMetadata {
  return {
    provider: metadata.provider ?? null,
    createdAt: metadata.createdAt ?? null,
    generationProfile: metadata.generationProfile ?? null,
    assetPath: metadata.assetPath ?? null,
    rawOutputPath: metadata.rawOutputPath ?? null,
    outputPath: metadata.outputPath ?? null,
    workDirPath: metadata.workDirPath ?? null,
    promptPath: metadata.promptPath ?? null,
    briefImagePath: metadata.briefImagePath ?? null,
    briefJsonPath: metadata.briefJsonPath ?? null,
    jobId: metadata.jobId ?? null,
    codexThreadId: metadata.codexThreadId ?? null,
    referenceSha256: metadata.referenceSha256 ?? null,
    rawOutputSha256: metadata.rawOutputSha256 ?? null,
    outputSha256: metadata.outputSha256 ?? null,
    isOutputIdenticalToReference: typeof metadata.isOutputIdenticalToReference === "boolean"
      ? metadata.isOutputIdenticalToReference
      : null,
    chromaKey: normalizeChromaKey(metadata.chromaKey),
    timing: normalizeTimingMetadata(metadata.timing),
    inputImagePaths: Array.isArray(metadata.inputImagePaths) ? metadata.inputImagePaths : [],
    inputImages: normalizeCodexFinalRequestInputImages(metadata.inputImages),
    removedChildren: Array.isArray(metadata.removedChildren) ? metadata.removedChildren : [],
    promptHint: metadata.promptHint ?? null,
    prompt: metadata.prompt ?? null,
  };
}

function normalizeCodexFinalRequestInputImages(value: unknown): CodexFinalRequestInputImage[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const record = item as Record<string, unknown>;
    const path = record.path;
    const role = record.role;
    if (typeof path !== "string" || !path.trim() || typeof role !== "string" || !role.trim()) {
      return [];
    }
    return [{
      ...record,
      path: path.trim(),
      role: role.trim(),
    }];
  });
}

function normalizeChromaKey(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3) {
    return null;
  }
  const channels = value.map((channel) => Number(channel));
  return channels.every((channel) => Number.isFinite(channel))
    ? [channels[0], channels[1], channels[2]]
    : null;
}

function normalizeTimingMetadata(value: unknown): CodexFinalTimingMetadata | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as CodexFinalTimingMetadata
    : null;
}
