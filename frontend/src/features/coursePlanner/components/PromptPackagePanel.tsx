import { type ChangeEvent, useState } from "react";

import type { PromptPackage, PromptVersion } from "../types";

type PromptPackagePanelProps = {
  isGeneratingPrompt: boolean;
  isUploadingAttempt: boolean;
  promptVersion: PromptVersion | null;
  onGeneratePromptPackage: (version: PromptVersion) => Promise<PromptVersion | null>;
  onUploadGeneratedImage: (file: File) => Promise<void>;
  onViewFull: () => void;
};

export function PromptPackagePanel({
  isGeneratingPrompt,
  isUploadingAttempt,
  promptVersion,
  onGeneratePromptPackage,
  onUploadGeneratedImage,
  onViewFull,
}: PromptPackagePanelProps) {
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const promptPackage = promptVersion?.promptPackage ?? null;

  async function copyText(label: string, value: string | null | undefined) {
    if (!value || !navigator.clipboard?.writeText) {
      return;
    }
    await navigator.clipboard.writeText(value);
    setCopyStatus(`${label} copied`);
  }

  async function uploadGeneratedImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      return;
    }
    await onUploadGeneratedImage(file);
    event.target.value = "";
  }

  return (
    <section className="chapter-workspace-panel prompt-package-panel" aria-label="Prompt Preview">
      <div className="chapter-workspace-panel-header">
        <div>
          <h2>Prompt Preview</h2>
          <p>{promptVersion ? `${promptVersion.versionLabel} / ${promptVersion.title}` : "Select a Prompt Version."}</p>
        </div>
      </div>

      <div className="chapter-workspace-actions">
        <button
          type="button"
          className="course-planner-primary-action"
          disabled={!promptVersion || isGeneratingPrompt}
          onClick={() => promptVersion && void onGeneratePromptPackage(promptVersion)}
        >
          {isGeneratingPrompt ? "生成 Prompt 中..." : "生成/刷新 Prompt"}
        </button>
        <button
          type="button"
          disabled={!promptPackage?.fullPrompt}
          onClick={() => void copyText("Full Prompt", promptPackage?.fullPrompt)}
        >
          复制完整 Prompt
        </button>
        <button
          type="button"
          disabled={!promptPackage?.negativeConstraints}
          onClick={() => void copyText("Negative Constraints", promptPackage?.negativeConstraints)}
        >
          复制负面约束
        </button>
        <button type="button" disabled={!promptPackage} onClick={onViewFull}>
          查看 Prompt Package
        </button>
      </div>

      <GeneratedImageUpload
        disabled={!promptVersion || isUploadingAttempt}
        isUploading={isUploadingAttempt}
        onUpload={uploadGeneratedImage}
      />

      {copyStatus ? <p className="course-planner-status">{copyStatus}</p> : null}
      <PromptPackagePreview promptPackage={promptPackage} />
    </section>
  );
}

type GeneratedImageUploadProps = {
  disabled: boolean;
  isUploading: boolean;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
};

function GeneratedImageUpload({ disabled, isUploading, onUpload }: GeneratedImageUploadProps) {
  return (
    <div className="generated-image-upload">
      <label htmlFor="generated-image-upload">上传生成图</label>
      <input
        id="generated-image-upload"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label="选择生成图文件"
        disabled={disabled}
        onChange={(event) => void onUpload(event)}
      />
      <span>{isUploading ? "上传中..." : "会挂到当前 Prompt Version"}</span>
    </div>
  );
}

function PromptPackagePreview({ promptPackage }: { promptPackage: PromptPackage | null }) {
  if (!promptPackage) {
    return <p className="course-planner-empty">当前版本还没有 Prompt Package。</p>;
  }
  return (
    <div className="prompt-package-preview">
      <section aria-label="Full Prompt">
        <h3>Full Prompt</h3>
        <p>{promptPackage.fullPrompt}</p>
      </section>
      <section aria-label="Negative Constraints">
        <h3>Negative Constraints</h3>
        <p>{promptPackage.negativeConstraints}</p>
      </section>
      {promptPackage.shortPrompt ? (
        <section aria-label="Short Prompt">
          <h3>Short Prompt</h3>
          <p>{promptPackage.shortPrompt}</p>
        </section>
      ) : null}
    </div>
  );
}
