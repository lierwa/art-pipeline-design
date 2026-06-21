import { useEffect, useMemo, useState } from "react";
import { ImageOff, Layers, MessageSquareText, Send } from "lucide-react";

import {
  codexFinalArtifactUrls,
  sam2EdgeArtifactUrls,
  type WorkspaceElement,
} from "../../domain/workspace";
import { isGenerateSelectableElement } from "../../domain/workspaceDerived";
import {
  taskItemStatusLabel,
  taskStatusTone,
  type WorkspaceTaskItemIndex,
} from "../../domain/workspaceTasks";
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

  useEffect(() => {
    setPromptDraft(activeElement ? promptHints[activeElement.id] ?? "" : "");
  }, [activeElement?.id, promptHints]);

  if (!activeElement) {
    return (
      <section className="generate-review-panel generate-review-empty" aria-label="Generate review">
        <strong>Generate</strong>
        <p>No assets are ready for final generation.</p>
      </section>
    );
  }

  const sam2Urls = sam2EdgeArtifactUrls(activeElement, assetCacheKey, workspaceRunId);
  const finalUrls = codexFinalArtifactUrls(activeElement, assetCacheKey, workspaceRunId);
  const taskItem = taskItemsByElementId[activeElement.id] ?? null;
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
          {taskItem ? (
            <span className={`asset-task-badge ${taskStatusTone(taskItem.status)}`}>
              {taskItemStatusLabel(taskItem.status)}
            </span>
          ) : null}
          {promptChanged ? <span className="asset-task-badge is-queued">Prompt changed</span> : null}
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
            status={activeElement.sourceProvider === "codex_cli" ? "Final ready" : "Waiting"}
          />
        </div>

        <div className="generate-prompt-panel" role="group" aria-label="Generate prompt tools">
          {removedChildren.length > 0 ? (
            <div className="generate-context-note">
              <span>Parent completion</span>
              <p>Fill the parent surface without bringing back: {removedChildren.map((child) => child.name).join(", ")}</p>
            </div>
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
          <section className="generate-previous-prompt" aria-label="Prompt used last time">
            <strong>Prompt used last time</strong>
            {activeElement.sourcePrompt ? (
              <pre>{activeElement.sourcePrompt}</pre>
            ) : (
              <p>No previous prompt has been recorded for this asset.</p>
            )}
          </section>
          {taskItem?.message ? <p className="generate-task-message">{taskItem.message}</p> : null}
        </div>
      </div>
    </section>
  );
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
