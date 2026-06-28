import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";

import { PromptPackageModal } from "../components/PromptPackageModal";
import { PromptPackagePanel } from "../components/PromptPackagePanel";
import {
  draftEquals,
  draftFromVersion,
  PromptVersionDraftEditor,
  promptVersionPatchFromDraft,
  type PromptVersionDraft,
} from "../components/PromptVersionDraftEditor";
import "../components/coursePlanner.css";
import { useCoursePlannerState } from "../hooks/useCoursePlannerState";
import type { Chapter, CoursePlannerState, PromptVersion } from "../types";

export function ChapterWorkspacePage() {
  const { chapterId } = useParams();
  const [searchParams] = useSearchParams();
  const planner = useCoursePlannerState();
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [promptVersionDrafts, setPromptVersionDrafts] = useState<Record<string, PromptVersionDraft>>({});
  const [revisionFeedback, setRevisionFeedback] = useState("");
  const [revisionTarget, setRevisionTarget] = useState<PromptVersion | null>(null);

  const chapter = useMemo(() => findChapter(planner.state, chapterId ?? null), [chapterId, planner.state]);
  const scenePack = chapter ? planner.state.scenePacks.find((pack) => pack.id === chapter.scenePackId) ?? null : null;
  const versions = chapter ? promptVersionsForChapter(planner.state, chapter.id) : [];
  const routePromptVersionId = searchParams.get("versionId");
  const selectedVersion = preferredPromptVersion(
    versions,
    routePromptVersionId,
    planner.state.selectedPromptVersionId,
    chapter,
  );

  useEffect(() => {
    if (!chapter) {
      return;
    }
    // WHY: 02 的上传和生成动作都依赖当前 Chapter 选择；路由进入时同步单一状态源，避免操作落到上一个 Chapter。
    if (planner.state.activeScenePackId !== chapter.scenePackId) {
      planner.setActiveScenePackId(chapter.scenePackId);
    }
    if (planner.state.selectedChapterId !== chapter.id) {
      planner.setSelectedChapterId(chapter.id);
    }
  }, [chapter, planner]);

  useEffect(() => {
    if (!selectedVersion || planner.state.selectedPromptVersionId === selectedVersion.id) {
      return;
    }
    planner.setSelectedPromptVersionId(selectedVersion.id);
  }, [planner, selectedVersion]);

  if (!chapter || !scenePack) {
    return (
      <main className="chapter-workspace-page">
        <div className="chapter-workspace-page-header">
          <Link to="/course-planner">Back to board</Link>
          <h1>Chapter not found</h1>
        </div>
        <p className="course-planner-empty">Select a Chapter from the Course Planner board.</p>
      </main>
    );
  }

  const currentChapter = chapter;
  const createVersionKey = `createPromptVersion:${currentChapter.id}`;
  const generatePromptKey = selectedVersion ? `generatePromptPackage:${selectedVersion.id}` : "";
  const uploadAttemptKey = selectedVersion ? `uploadAttempt:${selectedVersion.id}` : "";
  const savePromptVersionKey = selectedVersion ? `updatePromptVersion:${selectedVersion.id}` : "";
  const isCreatingVersion = isPending(planner.state, createVersionKey);
  const isGeneratingPrompt = isPending(planner.state, generatePromptKey);
  const isUploadingAttempt = isPending(planner.state, uploadAttemptKey);
  const isSavingPromptDraft = isPending(planner.state, savePromptVersionKey);

  async function createPromptVersion(request: { feedback?: string; sourceVersionId?: string } = {}) {
    await planner.createPromptVersion(currentChapter.id, request);
  }

  async function uploadGeneratedImage(file: File) {
    if (!selectedVersion) {
      return;
    }
    const attempt = await planner.uploadImageAttempt(selectedVersion.id, file);
    if (attempt) {
      // WHY: 02 只负责把上传挂到当前 PromptVersion；03 的评审路由由后续页面承接，避免在这里内嵌评审 UI。
      window.open(attemptReviewPath(currentChapter.id, selectedVersion.id, attempt.id), "_self");
    }
  }

  function updatePromptVersionDraft(version: PromptVersion, draft: PromptVersionDraft) {
    setPromptVersionDrafts((current) => ({ ...current, [version.id]: draft }));
  }

  async function savePromptVersionDraft(version: PromptVersion): Promise<PromptVersion | null> {
    const draft = promptVersionDrafts[version.id];
    if (!draft || draftEquals(draft, draftFromVersion(version))) {
      return version;
    }
    const updated = await planner.updatePromptVersion(version.id, promptVersionPatchFromDraft(draft));
    if (updated) {
      setPromptVersionDrafts((current) => {
        const { [version.id]: _saved, ...rest } = current;
        return rest;
      });
    }
    return updated;
  }

  async function generatePromptPackage(version: PromptVersion) {
    const persisted = await savePromptVersionDraft(version);
    if (!persisted) {
      return null;
    }
    return planner.generatePromptPackage(version.id);
  }

  async function submitRevisionFeedback() {
    const feedback = revisionFeedback.trim();
    if (!revisionTarget || !feedback) {
      return;
    }
    await createPromptVersion({ sourceVersionId: revisionTarget.id, feedback });
    setRevisionFeedback("");
    setRevisionTarget(null);
  }

  return (
    <main className="chapter-workspace-page">
      <div className="chapter-workspace-page-header">
        <Link to="/course-planner">Back to board</Link>
        <div>
          <p className="course-planner-kicker">{scenePack.title} / Chapter</p>
          <h1>{currentChapter.title}</h1>
          <p>{currentChapter.summary}</p>
        </div>
        <span>{currentChapter.status}</span>
      </div>

      <ChapterSeedContext chapter={currentChapter} />

      {versions.length === 0 ? (
        <section className="chapter-workspace-panel prompt-version-empty" aria-label="Prompt Version Empty State">
          <div>
            <h2>Prompt Version Designer</h2>
            <p>Chapter Seed 已准备好，先让 AI 生成第一个可复制、可上传回溯的 Prompt 版本。</p>
          </div>
          <button
            type="button"
            className="course-planner-primary-action"
            disabled={isCreatingVersion}
            onClick={() => void createPromptVersion()}
          >
            {isCreatingVersion ? "生成中..." : "基于 Chapter Seed 生成第一个 Prompt 版本"}
          </button>
        </section>
      ) : (
        <div className="chapter-workspace-grid prompt-version-designer-grid">
          <PromptVersionList
            isCreatingVersion={isCreatingVersion}
            selectedVersionId={selectedVersion?.id ?? null}
            versions={versions}
            onAdopt={(version) => void planner.adoptPromptVersion(currentChapter.id, version.id)}
            onCreate={() => void createPromptVersion()}
            onDelete={(version) => void planner.deletePromptVersion(version.id)}
            onDuplicate={(version) => void planner.duplicatePromptVersion(version.id)}
            onRevise={(version) => {
              setRevisionTarget(version);
              setRevisionFeedback("");
            }}
            onSelect={planner.setSelectedPromptVersionId}
          />
          <PromptVersionDraftEditor
            draft={selectedVersion ? promptVersionDrafts[selectedVersion.id] ?? null : null}
            isSaving={isSavingPromptDraft}
            version={selectedVersion}
            onDraftChange={updatePromptVersionDraft}
            onSave={(version) => void savePromptVersionDraft(version)}
          />
          <PromptPackagePanel
            isGeneratingPrompt={isGeneratingPrompt}
            isUploadingAttempt={isUploadingAttempt}
            promptVersion={selectedVersion}
            onGeneratePromptPackage={generatePromptPackage}
            onUploadGeneratedImage={uploadGeneratedImage}
            onViewFull={() => setIsPromptModalOpen(true)}
          />
          {revisionTarget ? (
            <RevisionFeedbackPanel
              feedback={revisionFeedback}
              version={revisionTarget}
              onCancel={() => setRevisionTarget(null)}
              onFeedbackChange={setRevisionFeedback}
              onSubmit={() => void submitRevisionFeedback()}
            />
          ) : null}
        </div>
      )}

      <PromptPackageModal
        isOpen={isPromptModalOpen}
        promptPackage={selectedVersion?.promptPackage ?? null}
        onClose={() => setIsPromptModalOpen(false)}
      />
    </main>
  );
}

function ChapterSeedContext({ chapter }: { chapter: Chapter }) {
  const seed = chapter.seed;
  return (
    <section className="chapter-workspace-panel chapter-seed-context" aria-label="Chapter Seed Context">
      <div className="chapter-workspace-panel-header">
        <div>
          <h2>Chapter Seed</h2>
          <p>{seed.scenePackTitle}</p>
        </div>
        <span>{seed.sceneDomain}</span>
      </div>
      <div className="chapter-seed-grid">
        <SeedItem label="Seed Summary" value={chapter.summary} />
        <SeedItem label="Event Hint" value={seed.eventSeed} />
        <SeedItem label="Spatial Hint" value={seed.spatialSeed} />
        <SeedItem label="Character Hint" value={seed.characterConceptHint.mainCastHint} />
      </div>
      <div className="chapter-workspace-chip-list" aria-label="Object Hints">
        {seed.objectCoverageHint.map((hint) => (
          <span key={hint} className="chapter-workspace-chip">
            {hint}
          </span>
        ))}
      </div>
    </section>
  );
}

function SeedItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <p>{value}</p>
    </div>
  );
}

type PromptVersionListProps = {
  isCreatingVersion: boolean;
  selectedVersionId: string | null;
  versions: PromptVersion[];
  onAdopt: (version: PromptVersion) => void;
  onCreate: () => void;
  onDelete: (version: PromptVersion) => void;
  onDuplicate: (version: PromptVersion) => void;
  onRevise: (version: PromptVersion) => void;
  onSelect: (versionId: string) => void;
};

function PromptVersionList({
  isCreatingVersion,
  selectedVersionId,
  versions,
  onAdopt,
  onCreate,
  onDelete,
  onDuplicate,
  onRevise,
  onSelect,
}: PromptVersionListProps) {
  const selectedVersion = versions.find((version) => version.id === selectedVersionId) ?? null;
  return (
    <section className="chapter-workspace-panel prompt-version-list" aria-label="Prompt Versions">
      <div className="chapter-workspace-panel-header">
        <div>
          <h2>Prompt Versions</h2>
          <p>每个版本都保留自己的 prompt 与上传回溯。</p>
        </div>
        <button type="button" disabled={isCreatingVersion} onClick={onCreate}>
          {isCreatingVersion ? "生成中..." : "+ New"}
        </button>
      </div>
      <div className="prompt-version-list-items">
        {versions.map((version) => (
          <button
            key={version.id}
            type="button"
            className={version.id === selectedVersionId ? "is-active" : ""}
            aria-pressed={version.id === selectedVersionId}
            onClick={() => onSelect(version.id)}
          >
            <strong>{version.versionLabel}</strong>
            <span>{version.title}</span>
            <span>{version.status}</span>
            <span>{version.imageAttemptIds.length} 次</span>
          </button>
        ))}
      </div>
      <div className="chapter-workspace-actions">
        <button type="button" disabled={!selectedVersion} onClick={() => selectedVersion && onDuplicate(selectedVersion)}>
          Duplicate
        </button>
        <button type="button" disabled={!selectedVersion} onClick={() => selectedVersion && onRevise(selectedVersion)}>
          AI 修改当前版本
        </button>
        <button type="button" disabled={!selectedVersion} onClick={() => selectedVersion && onAdopt(selectedVersion)}>
          Mark Adopted
        </button>
        <button type="button" disabled={!selectedVersion} onClick={() => selectedVersion && onDelete(selectedVersion)}>
          Archive
        </button>
      </div>
    </section>
  );
}

function RevisionFeedbackPanel({
  feedback,
  version,
  onCancel,
  onFeedbackChange,
  onSubmit,
}: {
  feedback: string;
  version: PromptVersion;
  onCancel: () => void;
  onFeedbackChange: (feedback: string) => void;
  onSubmit: () => void;
}) {
  return (
    <section className="chapter-workspace-panel prompt-revision-feedback" aria-label="AI Revision Feedback">
      <div className="chapter-workspace-panel-header">
        <div>
          <h2>AI Revision Feedback</h2>
          <p>{version.versionLabel} / {version.title}</p>
        </div>
      </div>
      <label htmlFor="prompt-version-revision-feedback">Revision Feedback</label>
      <textarea
        id="prompt-version-revision-feedback"
        aria-label="Revision Feedback"
        value={feedback}
        onChange={(event) => onFeedbackChange(event.target.value)}
      />
      <div className="chapter-workspace-actions">
        <button type="button" disabled={!feedback.trim()} onClick={onSubmit}>
          提交 AI 修改
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}

function findChapter(state: CoursePlannerState, chapterId: string | null): Chapter | null {
  if (!chapterId) {
    return null;
  }
  return Object.values(state.chaptersByScenePackId).flat().find((chapter) => chapter.id === chapterId) ?? null;
}

function promptVersionsForChapter(state: CoursePlannerState, chapterId: string): PromptVersion[] {
  // WHY: API normalizers may transform record keys, so PromptVersion.chapterId remains the authoritative scope check.
  const versions = Object.values(state.promptVersionsByChapterId).flat().filter((version) => version.chapterId === chapterId);
  // WHY: 异步 upsert 期间同一版本可能短暂存在于旧投影和新投影；按 id 去重，避免 UI 把同一事实渲染两次。
  return Array.from(new Map(versions.map((version) => [version.id, version])).values());
}

function preferredPromptVersion(
  versions: PromptVersion[],
  routePromptVersionId: string | null,
  selectedPromptVersionId: string | null,
  chapter: Chapter | null,
): PromptVersion | null {
  if (versions.length === 0) {
    return null;
  }
  // WHY: 03 返回 02 时只携带 URL 上的 PromptVersion 上下文；优先读取路由参数，避免重新加载状态后落回 adopted/latest 版本。
  return (
    versions.find((version) => version.id === routePromptVersionId) ??
    versions.find((version) => version.id === selectedPromptVersionId) ??
    versions.find((version) => version.id === chapter?.adoptedPromptVersionId) ??
    versions.find((version) => version.status === "adopted") ??
    versions[versions.length - 1]
  );
}

function isPending(state: CoursePlannerState, key: string): boolean {
  return Boolean(key && state.asyncStatus[key]?.status === "pending");
}

function attemptReviewPath(chapterId: string, versionId: string, attemptId: string): string {
  return `/course-planner/chapters/${encodeURIComponent(chapterId)}/versions/${encodeURIComponent(versionId)}/attempts/${encodeURIComponent(attemptId)}`;
}
