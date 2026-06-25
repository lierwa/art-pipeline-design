import { useEffect, useMemo, useState } from "react";
import { ImageOff, Layers, MessageSquareText, Send } from "lucide-react";

import {
  codexFinalArtifactUrls,
  isCodexFinalSourceProvider,
  sam2EdgeArtifactUrls,
  workspaceAssetUrl,
  type WorkspaceElement,
} from "../../domain/workspace";
import {
  fetchCodexFinalRequestMetadata,
  type CodexFinalRequestInputImage,
  type CodexFinalRequestMetadata,
} from "../../domain/workspaceApi";
import { isGenerateSelectableElement } from "../../domain/workspaceDerived";
import {
  taskItemStatusLabel,
  taskStatusTone,
  type WorkspaceTaskItem,
  type WorkspaceTaskItemIndex,
} from "../../domain/workspaceTasks";
import {
  codexFinalAgentArtifactDetails,
  codexFinalFailedCandidatePath,
  codexFinalQualityArtifactBadge,
  codexFinalRepairNote,
} from "../../domain/workspaceTaskArtifacts";
import { AssetTag } from "../../shared/ui/AssetTag";
import { PreviewFigure } from "../segment/SegmentMaskReviewParts";

type GenerateReviewPanelProps = {
  assetCacheKey: number;
  elements: WorkspaceElement[];
  generatePromptHints: Record<string, string>;
  selectedElement: WorkspaceElement | null;
  taskItemsByElementId: WorkspaceTaskItemIndex;
  workspaceRunId: string | null;
  onRerunElement: (elementId: string, promptHint: string) => void;
  onSavePromptHint: (elementId: string, promptHint: string) => void;
};

const EMPTY_PROMPT_HINTS: Record<string, string> = {};
const NO_CODEX_REQUEST_METADATA = "No previous Codex request metadata recorded for this asset.";

export function GenerateReviewPanel({
  assetCacheKey,
  elements,
  generatePromptHints,
  selectedElement,
  taskItemsByElementId,
  workspaceRunId,
  onRerunElement,
  onSavePromptHint,
}: GenerateReviewPanelProps) {
  const promptHints = generatePromptHints ?? EMPTY_PROMPT_HINTS;
  const reviewElements = useMemo(
    () => elements.filter((element) => element.mergedInto === null && isGenerateSelectableElement(element)),
    [elements],
  );
  const activeElement = selectedElement && reviewElements.some((element) => element.id === selectedElement.id)
    ? selectedElement
    : reviewElements[0] ?? null;
  const removedChildren = useMemo(
    () => activeElement ? removedChildrenFor(elements, activeElement) : [],
    [activeElement, elements],
  );
  const [promptDraft, setPromptDraft] = useState("");
  const [codexRequest, setCodexRequest] = useState<CodexFinalRequestMetadata | null>(null);

  useEffect(() => {
    setPromptDraft(activeElement ? promptHints[activeElement.id] ?? "" : "");
  }, [activeElement?.id, promptHints]);

  useEffect(() => {
    let isCancelled = false;
    setCodexRequest(null);
    if (!activeElement) {
      return () => {
        isCancelled = true;
      };
    }
    void fetchCodexFinalRequestMetadata(activeElement.id, workspaceRunId)
      .then((metadata) => {
        if (!isCancelled) {
          setCodexRequest(metadata);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setCodexRequest(null);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [activeElement?.id, workspaceRunId, activeElement?.sourcePrompt]);

  if (!activeElement) {
    return (
      <section className="generate-review-panel generate-review-empty" aria-label="Generate review">
        <strong>Generate</strong>
        <p>No assets are ready for final generation.</p>
      </section>
    );
  }

  const sam2Urls = sam2EdgeArtifactUrls(activeElement, assetCacheKey, workspaceRunId);
  const taskItem = taskItemsByElementId[activeElement.id] ?? null;
  const agentArtifactDetails = codexFinalAgentArtifactDetails(taskItem?.artifactPaths);
  const qualityBadge = codexFinalQualityArtifactBadge(taskItem?.artifactPaths);
  const finalCacheKey = codexFinalCacheKey(assetCacheKey, activeElement, taskItem);
  const finalUrls = codexFinalArtifactUrls(
    activeElement,
    finalCacheKey,
    workspaceRunId,
  );
  const failedCandidateUrl = workspaceAssetUrl(
    codexFinalFailedCandidatePath(taskItem?.artifactPaths),
    finalCacheKey,
    workspaceRunId,
  );
  const repairNote = codexFinalRepairNote(taskItem?.artifactPaths);
  const promptChanged = (promptHints[activeElement.id] ?? "") !== (activeElement.sourcePromptHint ?? "");

  function savePromptDraft() {
    if (!activeElement) {
      return;
    }
    onSavePromptHint(activeElement.id, normalizedPromptDraft());
  }

  function rerunWithPromptDraft() {
    if (!activeElement) {
      return;
    }
    const normalizedPrompt = normalizedPromptDraft();
    onSavePromptHint(activeElement.id, normalizedPrompt);
    onRerunElement(activeElement.id, normalizedPrompt);
  }

  function normalizedPromptDraft(): string {
    return promptDraft.trim();
  }

  return (
    <section className="generate-review-panel" aria-label="Generate final review">
      <div className="generate-review-header">
        <div>
          <span>Final review</span>
          <h3>{activeElement.name}</h3>
        </div>
        <div className="generate-review-actions">
          {qualityBadge ? (
            <AssetTag tone={qualityBadge.tone}>
              {qualityBadge.label}
            </AssetTag>
          ) : taskItem ? (
            <AssetTag tone={taskStatusTone(taskItem.status)}>
              {taskItemStatusLabel(taskItem.status)}
            </AssetTag>
          ) : null}
          {promptChanged ? <AssetTag tone="queued">Prompt changed</AssetTag> : null}
        </div>
      </div>

      <div className="generate-review-detail">
        <div className="generate-comparison-grid">
          <PreviewFigure
            caption="Source crop"
            imageAlt={`${activeElement.name} source crop`}
            imageSrc={sam2Urls.sourceCropUrl ?? undefined}
            icon={ImageOff}
            status="Reference"
          />
          <PreviewFigure
            caption="Mask sticker"
            className="checkerboard-preview"
            imageAlt={`${activeElement.name} SAM2 sticker`}
            imageSrc={sam2Urls.transparentAssetUrl ?? undefined}
            icon={Layers}
            status="Mask output"
          />
          <PreviewFigure
            caption="Codex final"
            className="checkerboard-preview"
            imageAlt={`${activeElement.name} Codex final`}
            imageSrc={finalUrls.transparentAssetUrl ?? undefined}
            icon={Layers}
            placeholderLabel="No final yet"
            status={codexFinalPreviewStatus(activeElement, taskItem)}
          />
        </div>
        {failedCandidateUrl ? (
          <section className="generate-failed-candidate-panel" aria-label="Failed candidate preview">
            <PreviewFigure
              caption="Failed candidate"
              className="checkerboard-preview"
              imageAlt={`${activeElement.name} failed candidate`}
              imageSrc={failedCandidateUrl}
              icon={Layers}
              status="QA failed"
            />
          </section>
        ) : null}

        <div className="generate-prompt-panel" role="group" aria-label="Generate prompt tools">
          {removedChildren.length > 0 ? (
            <div className="generate-context-note">
              <span>Parent completion</span>
              <p>Fill the parent surface without bringing back: {removedChildren.map((child) => child.name).join(", ")}</p>
            </div>
          ) : null}
          {repairNote ? (
            <section className="generate-repair-note" aria-label="QA repair note">
              <strong>Repair note</strong>
              <p>{repairNote}</p>
            </section>
          ) : null}
          <label className="generate-prompt-hint-field">
            <span>
              <MessageSquareText size={14} aria-hidden="true" />
              Prompt hint
            </span>
            <span className="generate-prompt-input-shell">
              <textarea
                value={promptDraft}
                placeholder="Add angle, view, material, or correction notes for this asset."
                onBlur={savePromptDraft}
                onChange={(event) => setPromptDraft(event.currentTarget.value)}
              />
              <button
                aria-label={`Rerun ${activeElement.name} with prompt hint`}
                className="generate-prompt-send-button"
                onClick={rerunWithPromptDraft}
                type="button"
              >
                <Send size={16} aria-hidden="true" />
              </button>
            </span>
          </label>
          <section className="generate-request-panel" aria-label="Full request used last time">
            <strong>Full request used last time</strong>
            <pre>{codexRequest ? formatCodexRequest(codexRequest) : NO_CODEX_REQUEST_METADATA}</pre>
          </section>
          {agentArtifactDetails.length > 0 ? (
            <section className="generate-agent-artifacts" aria-label="Codex agent handoff artifacts">
              <strong>Codex agent handoff</strong>
              <dl>
                {agentArtifactDetails.map((artifact) => (
                  <div key={artifact.key}>
                    <dt>{artifact.label}</dt>
                    <dd>{artifact.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
          {taskItem?.message ? <p className="generate-task-message">{taskItem.message}</p> : null}
        </div>
      </div>
    </section>
  );
}

function codexFinalPreviewStatus(
  element: WorkspaceElement,
  taskItem: WorkspaceTaskItem | null,
): string {
  if (isCodexFinalSourceProvider(element.sourceProvider) && ["ready", "exported"].includes(element.exportStatus)) {
    return "Final ready";
  }
  if (taskItem?.status === "failed") {
    return "Failed";
  }
  if (taskItem?.status === "running") {
    return "Waiting for agent";
  }
  return "Waiting";
}

function formatCodexRequest(metadata: CodexFinalRequestMetadata): string {
  return [
    "REQUEST",
    fieldLine("Provider", metadata.provider),
    fieldLine("Created at", metadata.createdAt),
    fieldLine("Generation profile", metadata.generationProfile),
    fieldLine("Output path", metadata.assetPath),
    fieldLine("Raw Codex output path", metadata.rawOutputPath),
    fieldLine("Job id", metadata.jobId),
    fieldLine("Codex thread", metadata.codexThreadId),
    fieldLine("Job work dir", metadata.workDirPath),
    fieldLine("Job output path", metadata.outputPath),
    fieldLine("Prompt path", metadata.promptPath),
    fieldLine("Brief image", metadata.briefImagePath),
    fieldLine("Brief JSON", metadata.briefJsonPath),
    fieldLine("Chroma key", formatChromaKey(metadata.chromaKey)),
    fieldLine("Raw output seconds", formatTimingSeconds(metadata.timing?.rawOutputSeconds)),
    fieldLine("Reference sha256", metadata.referenceSha256),
    fieldLine("Raw output sha256", metadata.rawOutputSha256),
    fieldLine("Output sha256", metadata.outputSha256),
    fieldLine("Identical to mask sticker", formatBoolean(metadata.isOutputIdenticalToReference)),
    fieldLine("Prompt hint", metadata.promptHint),
    "",
    "ATTACHED IMAGES, EXACT ORDER",
    ...formatImageLines(metadata),
    "",
    "TEXT PROMPT SENT TO CODEX",
    metadata.prompt?.trim() || "(empty prompt)",
  ].join("\n");
}

function fieldLine(label: string, value: string | null | undefined): string {
  return `${label}: ${value?.trim() || "-"}`;
}

function formatBoolean(value: boolean | null | undefined): string {
  return typeof value === "boolean" ? String(value) : "-";
}

function formatChromaKey(value: [number, number, number] | null | undefined): string | null {
  return value ? `rgb(${value[0]}, ${value[1]}, ${value[2]})` : null;
}

function formatTimingSeconds(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)}s` : null;
}

function codexFinalCacheKey(
  assetCacheKey: number,
  element: WorkspaceElement,
  taskItem: WorkspaceTaskItem | null,
): string {
  const taskVersion = [
    taskItem?.status ?? "idle",
    taskItem?.finishedAt ?? taskItem?.startedAt ?? "-",
    taskItem?.message ?? "-",
  ].join(":");
  return `codex-final:${element.id}:${assetCacheKey}:${taskVersion}`;
}

function formatImageLines(metadata: CodexFinalRequestMetadata): string[] {
  const images = codexFinalRequestImages(metadata);
  if (images.length === 0) {
    return ["(no attached images recorded)"];
  }
  let removedChildOrdinal = 0;
  return images.map((image, index) => {
    const role = imageRoleLabel(image, index, metadata, removedChildOrdinal);
    const authority = imageAuthorityLabel(image.role, index);
    if (image.role === "removed_child_mask") {
      removedChildOrdinal += 1;
    }
    return [
      String(index + 1).padEnd(3),
      role.padEnd(22),
      image.path.padEnd(58),
      authority,
    ].join(" ");
  });
}

function codexFinalRequestImages(
  metadata: CodexFinalRequestMetadata,
): Array<CodexFinalRequestInputImage | { path: string; role: null }> {
  if (metadata.inputImages.length > 0) {
    return metadata.inputImages;
  }
  return metadata.inputImagePaths.map((path) => ({ path, role: null }));
}

function imageRoleLabel(
  image: CodexFinalRequestInputImage | { path: string; role: null },
  index: number,
  metadata: CodexFinalRequestMetadata,
  removedChildOrdinal: number,
): string {
  if (image.role) {
    if (image.role === "removed_child_mask") {
      return `removed_child_mask:${removedChildNameFor(image.path, metadata, removedChildOrdinal)}`;
    }
    return image.role;
  }
  return fallbackImageRoleLabel(index, metadata);
}

function fallbackImageRoleLabel(index: number, metadata: CodexFinalRequestMetadata): string {
  if (index === 0) {
    return "source_crop";
  }
  if (index === 1) {
    return "transparent_cutout";
  }
  if (index === 2) {
    return "mask";
  }
  const child = metadata.removedChildren[index - 3];
  const childName = typeof child?.name === "string" && child.name.trim() ? child.name.trim() : `child_${index - 2}`;
  return `removed_child_mask:${childName}`;
}

function imageAuthorityLabel(role: string | null, index: number): string {
  // WHY: inputImages.role 是后端 prompt/input 协议的唯一权威；仅旧 metadata
  // 缺少 role 时才退回历史 index 规则，避免 layout_guide 被误标成 removed child。
  switch (role) {
    case "source_crop":
      return "source authority";
    case "visual_generation_brief":
      return "task map";
    case "transparent_cutout":
      return "mask output reference";
    case "mask":
      return "diagnostic mask";
    case "layout_guide":
      return "layout guide";
    case "previous_final":
      return "accepted final reference";
    case "failed_candidate":
      return "failed candidate";
    case "removed_child_mask":
      return "removed child mask";
    default:
      break;
  }
  if (index === 0) {
    return "source authority";
  }
  if (index === 1) {
    return "mask output reference";
  }
  if (index === 2) {
    return "diagnostic mask";
  }
  return "removed child mask";
}

function removedChildNameFor(
  path: string,
  metadata: CodexFinalRequestMetadata,
  ordinal: number,
): string {
  const pathMatchedChild = metadata.removedChildren.find((child) => child.maskPath === path);
  const child = pathMatchedChild ?? metadata.removedChildren[ordinal];
  return typeof child?.name === "string" && child.name.trim() ? child.name.trim() : `child_${ordinal + 1}`;
}

function removedChildrenFor(elements: WorkspaceElement[], parent: WorkspaceElement): WorkspaceElement[] {
  if (parent.assetRole !== "parent") {
    return [];
  }
  return elements.filter((element) => (
    element.assetRole === "removable_child"
    && element.removeFromParent === parent.id
    && element.mergedInto === null
  ));
}
