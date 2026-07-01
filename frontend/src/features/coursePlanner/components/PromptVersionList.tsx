import { CopyPlus, Plus, Trash2, WandSparkles } from "lucide-react";

import { ConfirmActionDialog } from "../../../shared/ui/ConfirmActionDialog";
import { CoursePlannerStatusBadge } from "./CoursePlannerChrome";
import { promptVersionAttemptCountLabel } from "../domain/promptVersionLabels";
import { derivePromptVersionDisplayState, isPromptVersionAdopted } from "../domain/promptVersionUiState";
import type { PromptVersion } from "../types";

export type PromptVersionListProps = {
  versions: PromptVersion[];
  selectedVersionId: string | null;
  adoptedVersionId: string | null;
  pendingVersionId?: string | null;
  onSelectVersion: (versionId: string) => void;
  onAdoptVersion: (versionId: string) => void;
  onDuplicateVersion: (versionId: string) => void;
  onReviseVersion: (versionId: string) => void;
  onDeleteVersion: (versionId: string) => void;
  onCreateVersion: () => void;
};

export const CREATE_PROMPT_VERSION_PENDING_ID = "__create_prompt_version__";

export function PromptVersionList({
  adoptedVersionId,
  pendingVersionId = null,
  selectedVersionId,
  versions,
  onAdoptVersion,
  onCreateVersion,
  onDeleteVersion,
  onDuplicateVersion,
  onReviseVersion,
  onSelectVersion,
}: PromptVersionListProps) {
  const isCreatingVersion = pendingVersionId === CREATE_PROMPT_VERSION_PENDING_ID;

  return (
    <section className="chapter-workspace-panel prompt-version-list" aria-label="Prompt Versions">
      <div className="chapter-workspace-panel-header">
        <div>
          <h2>Prompt Versions</h2>
          <p>每个版本都保留自己的 prompt 与上传回溯。</p>
        </div>
        <button
          type="button"
          className="prompt-version-create-button"
          aria-label="New Prompt Version"
          disabled={isCreatingVersion}
          onClick={onCreateVersion}
        >
          {isCreatingVersion ? null : <Plus size={15} aria-hidden="true" />}
          {isCreatingVersion ? "生成中..." : "New"}
        </button>
      </div>
      <div className="prompt-version-list-items">
        {versions.map((version) => {
          const isSelected = version.id === selectedVersionId;
          const isAdopted = isPromptVersionAdopted(version, adoptedVersionId);
          const isPending = pendingVersionId === version.id;
          const uiState = derivePromptVersionDisplayState(version, adoptedVersionId);
          return (
            <article
              key={version.id}
              role="group"
              aria-label={`${version.versionLabel} ${version.title}`}
              className={`prompt-version-item${isSelected ? " is-active" : ""}${isAdopted ? " is-adopted" : ""}`}
            >
              <div className="prompt-version-item-main">
                <input
                  type="radio"
                  name="adopted-prompt-version"
                  aria-label={`Adopt ${version.versionLabel}`}
                  checked={isAdopted}
                  disabled={isPending}
                  onChange={() => {
                    if (!isAdopted) {
                      onAdoptVersion(version.id);
                    }
                  }}
                />
                <button
                  type="button"
                  className="prompt-version-card"
                  aria-label={`View ${version.versionLabel} / ${version.title}`}
                  aria-pressed={isSelected}
                  onClick={() => onSelectVersion(version.id)}
                >
                  <span className="prompt-version-card-topline">
                    <strong>{version.versionLabel}</strong>
                    <CoursePlannerStatusBadge tone={isAdopted ? "success" : uiState.tone}>
                      {isAdopted ? "Adopted" : uiState.label}
                    </CoursePlannerStatusBadge>
                  </span>
                  <span className="prompt-version-card-title">{version.title}</span>
                  <span className="prompt-version-card-meta">{promptVersionAttemptCountLabel(version.imageAttemptIds.length)}</span>
                </button>
              </div>
              <div className="prompt-version-item-actions">
                <button
                  type="button"
                  aria-label={`Duplicate ${version.versionLabel}`}
                  disabled={isPending}
                  onClick={() => onDuplicateVersion(version.id)}
                >
                  <CopyPlus size={14} aria-hidden="true" />
                  <span>复制</span>
                </button>
                <button
                  type="button"
                  aria-label={`Revise ${version.versionLabel} with AI`}
                  disabled={isPending}
                  onClick={() => onReviseVersion(version.id)}
                >
                  <WandSparkles size={14} aria-hidden="true" />
                  <span>AI 修改</span>
                </button>
                {isAdopted ? (
                  <ConfirmActionDialog
                    title="Delete adopted Prompt Version"
                    description="Deleting this version leaves the Chapter without an adopted Prompt Version."
                    confirmLabel="Delete version"
                    trigger={(
                      <button type="button" aria-label={`Delete ${version.versionLabel}`} disabled={isPending}>
                        <Trash2 size={14} aria-hidden="true" />
                        <span>删除</span>
                      </button>
                    )}
                    onConfirm={() => onDeleteVersion(version.id)}
                  />
                ) : (
                  <button
                    type="button"
                    aria-label={`Delete ${version.versionLabel}`}
                    disabled={isPending}
                    onClick={() => onDeleteVersion(version.id)}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    <span>删除</span>
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
