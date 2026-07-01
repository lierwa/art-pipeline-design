import { CoursePlannerStatusBadge } from "./CoursePlannerChrome";
import { canShowPromptVersionText, type PromptVersionUiState } from "../domain/promptVersionUiState";
import type { CastBinding, PromptVersion } from "../types";

export type PromptVersionPreviewProps = {
  version: PromptVersion | null;
  uiState: PromptVersionUiState;
  onTunePrompt: () => void;
  onEditDesign: () => void;
};

export function PromptVersionPreview({ version, uiState, onTunePrompt, onEditDesign }: PromptVersionPreviewProps) {
  if (!version) {
    return (
      <section className="chapter-workspace-panel scene-intent-preview" role="region" aria-label="Scene Intent Preview">
        <div className="chapter-workspace-panel-header">
          <div>
            <h2>Scene Intent Preview</h2>
            <p>选择一个 Prompt Version 查看 scene-first 预览。</p>
          </div>
          <CoursePlannerStatusBadge tone={uiState.tone}>{uiState.label}</CoursePlannerStatusBadge>
        </div>
        <p className="course-planner-empty">Select a Prompt Version to inspect the scene-first prompt plan.</p>
      </section>
    );
  }

  const sceneLines = [
    version.sceneDirectorPlan.storyEvent,
    version.sceneDirectorPlan.characterArrangement,
    version.sceneDirectorPlan.actionDesign,
  ].filter((text) => canShowSceneText(uiState, text));

  const narrativeAnchors = filterPreviewItems(uiState, version.sceneVocabulary?.narrativeAnchors ?? []);
  const optionalVocabulary = filterPreviewItems(uiState, version.sceneVocabulary?.optionalVocabularyCandidates ?? []);
  const avoidObjects = filterPreviewItems(uiState, version.sceneVocabulary?.avoidObjects ?? []);
  const ambientFurnishingPolicy = canShowSceneText(uiState, version.sceneVocabulary?.ambientFurnishingPolicy)
    ? version.sceneVocabulary.ambientFurnishingPolicy
    : "";

  return (
    <section className="chapter-workspace-panel scene-intent-preview" role="region" aria-label="Scene Intent Preview">
      <div className="chapter-workspace-panel-header">
        <div>
          <h2>Scene Intent Preview</h2>
          <p>{version.versionLabel} / {version.title}</p>
        </div>
        <div className="scene-intent-toolbar" aria-label="Scene preview actions" role="group">
          <CoursePlannerStatusBadge tone={uiState.tone}>{uiState.label}</CoursePlannerStatusBadge>
          <button type="button" onClick={onTunePrompt}>Tune Prompt</button>
          <button type="button" onClick={onEditDesign}>Edit Design</button>
        </div>
      </div>
      <section className="prompt-version-preview" aria-label="Prompt Version Preview">
        {uiState.key === "needs_tuning" ? (
          <div
            role="status"
            aria-label="Prompt tuning required"
            className="course-planner-blocking-banner"
          >
            先录入角色 IP 和参考图，再生成最终 Image2 prompt。
          </div>
        ) : null}
        <article className="prompt-version-preview-card prompt-version-preview-card-primary">
          <h3>核心画面</h3>
          <strong>{version.title}</strong>
          {sceneLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </article>
        <article className="prompt-version-preview-card">
          <h3>角色 IP</h3>
          <CastBindingPreview castBindings={version.castBindings ?? []} />
        </article>
        <article className="prompt-version-preview-card">
          <h3>镜头与空间</h3>
          <dl>
            <PreviewFact label="镜头构图" value={version.sceneDirectorPlan.sceneComposition} uiState={uiState} />
            <PreviewFact label="空间关系" value={version.sceneDirectorPlan.spatialStructure} uiState={uiState} />
          </dl>
        </article>
        <article className="prompt-version-preview-card prompt-version-preview-card-wide">
          <h3>可选词与约束</h3>
          <div className="prompt-preview-section" aria-label="可选词与约束">
            <PreviewChipGroup label="叙事锚点" items={narrativeAnchors} />
            <PreviewChipGroup label="可选词池" items={optionalVocabulary} />
            {ambientFurnishingPolicy ? <PreviewFact label="环境补足策略" value={ambientFurnishingPolicy} /> : null}
            <PreviewChipGroup label="禁止项" items={avoidObjects} tone="danger" />
          </div>
        </article>
      </section>
    </section>
  );
}

function CastBindingPreview({ castBindings }: { castBindings: CastBinding[] }) {
  if (castBindings.length === 0) {
    return <p className="prompt-preview-muted">待 Tune Prompt 录入角色 IP 与参考图。</p>;
  }

  return (
    <ul className="scene-vocabulary-preview-list">
      {castBindings.map((binding) => (
        <li key={`${binding.characterId}-${binding.roleInScene}`}>
          <strong>{binding.displayName}</strong>
          <small>{binding.characterId} / {binding.roleInScene} / {binding.actionIntent}</small>
        </li>
      ))}
    </ul>
  );
}

function PreviewFact({
  label,
  value,
  uiState,
}: {
  label: string;
  value: string | null | undefined;
  uiState?: PromptVersionUiState;
}) {
  if (!value || (uiState && !canShowSceneText(uiState, value))) {
    return null;
  }

  return (
    <div className="prompt-preview-fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function PreviewChipGroup({
  items,
  label,
  tone = "default",
}: {
  items: string[];
  label: string;
  tone?: "default" | "danger";
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="prompt-preview-chip-group">
      <span>{label}</span>
      <div className="course-planner-chip-list">
        {items.map((item) => (
          <span
            key={`${label}-${item}`}
            className={tone === "danger" ? "course-planner-chip course-planner-chip-danger" : "course-planner-chip"}
          >
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}

function canShowSceneText(uiState: PromptVersionUiState, text: string | null | undefined): boolean {
  return canShowPromptVersionText(uiState, text);
}

function filterPreviewItems(uiState: PromptVersionUiState, items: string[]): string[] {
  return items.filter((item) => canShowSceneText(uiState, item));
}
