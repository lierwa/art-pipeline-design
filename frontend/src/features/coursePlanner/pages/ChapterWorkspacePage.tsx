import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router";

import { CoursePlannerPageHeader } from "../components/CoursePlannerChrome";
import { PromptVersionEditDrawer } from "../components/PromptVersionEditDrawer";
import { PromptPackageModal } from "../components/PromptPackageModal";
import { PromptPackagePanel } from "../components/PromptPackagePanel";
import {
  draftEquals,
  draftFromVersion,
  PromptVersionDraftEditor,
  promptVersionPatchFromDraft,
  type PromptVersionDraft,
} from "../components/PromptVersionDraftEditor";
import { CREATE_PROMPT_VERSION_PENDING_ID, PromptVersionList } from "../components/PromptVersionList";
import "../components/coursePlanner.css";
import { chapterStatusLabel } from "../domain/chapterStatus";
import { canShowPromptVersionText, derivePromptVersionDisplayState } from "../domain/promptVersionUiState";
import { useCoursePlannerState } from "../hooks/useCoursePlannerState";
import type { Chapter, CoursePlannerState, PromptVersion } from "../types";

export function ChapterWorkspacePage() {
  const { chapterId } = useParams();
  const [searchParams] = useSearchParams();
  const planner = useCoursePlannerState();
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [promptVersionDrafts, setPromptVersionDrafts] = useState<Record<string, PromptVersionDraft>>({});
  const [revisionTarget, setRevisionTarget] = useState<PromptVersion | null>(null);
  const [adoptedVersionOverrideId, setAdoptedVersionOverrideId] = useState<string | null>(null);
  const [tuneRequestKey, setTuneRequestKey] = useState(0);

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

  useEffect(() => {
    setAdoptedVersionOverrideId(null);
  }, [chapter?.id]);

  useEffect(() => {
    if (adoptedVersionOverrideId && chapter?.adoptedPromptVersionId === adoptedVersionOverrideId) {
      setAdoptedVersionOverrideId(null);
    }
  }, [adoptedVersionOverrideId, chapter?.adoptedPromptVersionId]);

  if (!chapter || !scenePack) {
    return (
      <main className="chapter-workspace-page">
        <CoursePlannerPageHeader backTo="/course-planner" backLabel="Back to board" title="Chapter not found" />
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
  const effectiveAdoptedVersionId = adoptedVersionOverrideId ?? currentChapter.adoptedPromptVersionId ?? null;
  // WHY: optimistic adopt 期间，列表与详情必须共享同一个“当前 adopted 事实”，
  // 否则选中版本会在左侧显示 Prompt ready、右侧却继续显示 Adopted。
  const selectedVersionUiState = derivePromptVersionDisplayState(selectedVersion, effectiveAdoptedVersionId);
  const modalPromptPackage = selectedVersion?.promptPackage ?? null;

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

  async function submitRevisionFeedback(feedback: string) {
    const trimmedFeedback = feedback.trim();
    if (!revisionTarget || !trimmedFeedback) {
      return;
    }
    await createPromptVersion({ sourceVersionId: revisionTarget.id, feedback: trimmedFeedback });
    setRevisionTarget(null);
  }

  async function adoptPromptVersion(versionId: string) {
    const previousAdoptedVersionId = currentChapter.adoptedPromptVersionId ?? null;
    setAdoptedVersionOverrideId(versionId);
    const response = await planner.adoptPromptVersion(currentChapter.id, versionId);
    if (!response) {
      setAdoptedVersionOverrideId(previousAdoptedVersionId);
    }
  }

  async function deletePromptVersion(versionId: string) {
    const nextVersionId = selectedVersion?.id === versionId
      ? pickNextPromptVersionId(versions, versionId, currentChapter.adoptedPromptVersionId ?? null)
      : null;
    const deletedVersion = await planner.deletePromptVersion(versionId);
    if (!deletedVersion) {
      return;
    }
    if (selectedVersion?.id === versionId) {
      planner.setSelectedPromptVersionId(nextVersionId);
    }
  }

  return (
    <main className="chapter-workspace-page">
      <CoursePlannerPageHeader
        backTo="/course-planner"
        backLabel="Back to board"
        eyebrow={`${scenePack.title} / Chapter`}
        title={currentChapter.title}
        subtitle={chapterHeaderSubtitle(currentChapter.summary, selectedVersionUiState)}
        status={selectedVersion ? selectedVersionUiState.label : chapterStatusLabel(currentChapter.status)}
        statusTone={selectedVersion ? selectedVersionUiState.tone : "neutral"}
      />

      {versions.length === 0 ? (
        <section className="chapter-workspace-panel prompt-version-empty" aria-label="Prompt Version Empty State">
          <ChapterSeedSummary chapter={currentChapter} />
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
            selectedVersionId={selectedVersion?.id ?? null}
            versions={versions}
            adoptedVersionId={effectiveAdoptedVersionId}
            pendingVersionId={isCreatingVersion ? CREATE_PROMPT_VERSION_PENDING_ID : null}
            onAdoptVersion={(versionId) => void adoptPromptVersion(versionId)}
            onCreateVersion={() => void createPromptVersion()}
            onDeleteVersion={(versionId) => void deletePromptVersion(versionId)}
            onDuplicateVersion={(versionId) => void planner.duplicatePromptVersion(versionId)}
            onReviseVersion={(versionId) => {
              const version = versions.find((candidate) => candidate.id === versionId) ?? null;
              if (!version) {
                return;
              }
              setRevisionTarget(version);
            }}
            onSelectVersion={planner.setSelectedPromptVersionId}
          />
          <PromptVersionDraftEditor
            draft={selectedVersion ? promptVersionDrafts[selectedVersion.id] ?? null : null}
            isSaving={isSavingPromptDraft}
            uiState={selectedVersionUiState}
            version={selectedVersion}
            onDraftChange={updatePromptVersionDraft}
            onSave={(version) => void savePromptVersionDraft(version)}
            tuneRequestKey={tuneRequestKey}
          />
          <PromptPackagePanel
            isGeneratingPrompt={isGeneratingPrompt}
            isUploadingAttempt={isUploadingAttempt}
            promptVersion={selectedVersion}
            uiState={selectedVersionUiState}
            onGeneratePromptPackage={generatePromptPackage}
            onTunePrompt={() => setTuneRequestKey((current) => current + 1)}
            onUploadGeneratedImage={uploadGeneratedImage}
            onViewFull={() => setIsPromptModalOpen(true)}
          />
        </div>
      )}

      <PromptPackageModal
        isOpen={isPromptModalOpen}
        promptPackage={modalPromptPackage}
        onClose={() => setIsPromptModalOpen(false)}
      />
      <PromptVersionEditDrawer
        mode="revise"
        version={revisionTarget}
        isOpen={Boolean(revisionTarget)}
        isSaving={isCreatingVersion}
        onClose={() => setRevisionTarget(null)}
        onSave={() => {}}
        onSubmitRevision={(feedback) => void submitRevisionFeedback(feedback)}
      />
    </main>
  );
}

function ChapterSeedSummary({ chapter }: { chapter: Chapter }) {
  const seed = chapter.seed;
  return (
    <section className="chapter-seed-summary" aria-label="Chapter Seed Summary">
      <div className="chapter-workspace-panel-header">
        <div>
          <h2>Chapter Seed Summary</h2>
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

function findChapter(state: CoursePlannerState, chapterId: string | null): Chapter | null {
  if (!chapterId) {
    return null;
  }
  return Object.values(state.chaptersByScenePackId).flat().find((chapter) => chapter.id === chapterId) ?? null;
}

function promptVersionsForChapter(state: CoursePlannerState, chapterId: string): PromptVersion[] {
  // WHY: API normalizers may transform record keys, so PromptVersion.chapterId remains the authoritative scope check.
  const versions = Object.values(state.promptVersionsByChapterId)
    .flat()
    // WHY: 后端 DELETE 的持久化语义是 archive；02 的列表语义是当前可用版本，
    // archived 不能继续占据工作台，否则用户看到的就是“删不掉”。
    .filter((version) => version.chapterId === chapterId && version.status !== "archived");
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

function pickNextPromptVersionId(
  versions: PromptVersion[],
  deletedVersionId: string,
  adoptedVersionId: string | null,
): string | null {
  const remaining = versions.filter((version) => version.id !== deletedVersionId);
  if (remaining.length === 0) {
    return null;
  }
  const adoptedVersion = adoptedVersionId
    ? remaining.find((version) => version.id === adoptedVersionId) ?? null
    : null;
  if (adoptedVersion) {
    return adoptedVersion.id;
  }
  const deletedIndex = versions.findIndex((version) => version.id === deletedVersionId);
  const fallbackIndex = Math.min(Math.max(deletedIndex, 0), remaining.length - 1);
  // WHY: 删除当前选中版本后，用户预期继续停留在原来列表位置附近，而不是总是跳到最后一个版本。
  return remaining[fallbackIndex]?.id ?? remaining[0]?.id ?? null;
}

function isPending(state: CoursePlannerState, key: string): boolean {
  return Boolean(key && state.asyncStatus[key]?.status === "pending");
}

function attemptReviewPath(chapterId: string, versionId: string, attemptId: string): string {
  return `/course-planner/chapters/${encodeURIComponent(chapterId)}/versions/${encodeURIComponent(versionId)}/attempts/${encodeURIComponent(attemptId)}`;
}

function chapterHeaderSubtitle(summary: string, uiState: ReturnType<typeof derivePromptVersionDisplayState>): string {
  if (canShowPromptVersionText(uiState, summary)) {
    return summary;
  }
  return "等待 Tune Prompt 录入角色 IP 后展示角色关系摘要。";
}
