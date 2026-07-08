import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";

import "../src/styles.css";
import "../src/features/coursePlanner/components/coursePlanner.css";
import "../src/features/coursePlanner/components/coursePlannerPanels.css";
import "../src/features/coursePlanner/components/chapterMediaPanels.css";
import "../src/features/coursePlanner/components/chapterStudioLayout.css";
import "../src/features/coursePlanner/components/assemblyWorkspace.css";
import "../src/features/coursePlanner/components/assemblyRightRail.css";
import "../src/features/coursePlanner/components/assemblyAssetPool.css";
import "../src/features/coursePlanner/components/assemblyEditorShell.css";

import type {
  ChapterCandidate,
  ChapterSceneAssemblyManifest,
  ChapterScenePackage,
  GeneratedChapterAsset,
} from "../src/features/coursePlanner/types";
import { TopAppBar } from "../src/app/components/TopAppBar";
import { ChapterSceneStudio } from "../src/features/coursePlanner/components/ChapterSceneStudio";
import { AssemblyWorkspacePanel } from "../src/features/coursePlanner/components/AssemblyWorkspacePanel";
import { CandidateChapterBoard } from "../src/features/coursePlanner/components/CandidateChapterBoard";
import {
  CoursePlannerPageHeader,
  CoursePlannerResizableColumns,
  CoursePlannerStatusBadge,
  CoursePlannerWorkspaceHeader,
} from "../src/features/coursePlanner/components/CoursePlannerChrome";
import { PlanningBriefPanel } from "../src/features/coursePlanner/components/PlanningBriefPanel";
import { SceneCategoryList } from "../src/features/coursePlanner/components/SceneCategoryList";
import { SelectedChapterSequence } from "../src/features/coursePlanner/components/SelectedChapterSequence";
import { coursePlannerVisualReferenceFixture } from "../tests/coursePlanner/coursePlannerVisualReferenceFixtures";

type VisualView =
  | "assembly"
  | "assembly-delete"
  | "assembly-drawer"
  | "assembly-grouping"
  | "assembly-loading"
  | "assembly-multiselect"
  | "board"
  | "chapter"
  | "chapter-loading";

const SAVE_TIMESTAMP_BASE_MS = Date.parse("2026-07-05T08:00:00Z");
const fixture = coursePlannerVisualReferenceFixture();
const view = resolveView();

function CoursePlannerVisualHarness() {
  const [scenePackage, setScenePackage] = useState(fixture.scenePackage);
  const saveTimestampRevisionRef = useRef(0);

  const resolveScenePackage = useCallback(async (nextScenePackage: ChapterScenePackage | null = scenePackage) => {
    if (nextScenePackage) {
      setScenePackage(nextScenePackage);
    }
    return nextScenePackage;
  }, [scenePackage]);

  const handleSaveAssembly = useCallback(async (manifest: ChapterSceneAssemblyManifest) => {
    saveTimestampRevisionRef.current += 1;
    // WHY: harness 需要模拟服务端每次保存都会刷新 freshness metadata；
    // 使用固定基准加递增秒数，避免真实时钟让视觉截图或局部测试变得不稳定。
    const savedAt = formatSavedAt(saveTimestampRevisionRef.current);
    const nextScenePackage = {
      ...scenePackage,
      assembly: {
        ...manifest,
        updated_at: savedAt,
      },
    };
    setScenePackage(nextScenePackage);
    return nextScenePackage;
  }, [scenePackage]);

  return (
    <MemoryRouter initialEntries={[`/course-planner/chapters/${fixture.chapter.id}`]}>
      <style>{visualHarnessCss}</style>
      <div className="app-shell course-planner-shell visual-screenshot-shell">
        <TopAppBar
          activeRunId={null}
          canStopCodexGeneration={false}
          isStoppingCodexGeneration={false}
          runs={[]}
          showPipelineControls={false}
          source={null}
          status={topBarStatus(view)}
          title="Course Planner"
        />
        {view === "board" ? <BoardVisualPage /> : null}
        {view === "chapter-loading" ? <ChapterLoadingVisualPage /> : null}
        {view === "chapter" ? (
          <main className="chapter-workspace-page visual-screenshot-page">
            <CoursePlannerWorkspaceHeader
              backTo="/course-planner"
              backLabel="Back to board"
              title={fixture.chapter.title}
              status={<CoursePlannerStatusBadge label="Final locked" tone="success" />}
            />
            <div className="chapter-workspace-route-body">
              <ChapterSceneStudio
                asyncStatus={{}}
                chapter={fixture.chapter}
                characterIps={fixture.characterIps}
                referenceImages={fixture.referenceImages}
                scenePackage={scenePackage}
                onAssignCharacterIp={() => resolveScenePackage()}
                onDeleteCompleteSceneImage={() => resolveScenePackage()}
                onImportCompleteImage={() => resolveScenePackage()}
                onLockFinal={() => resolveScenePackage()}
                onSelectEmptySceneImage={() => resolveScenePackage()}
                onSelectReferenceImage={() => resolveScenePackage()}
                onUpdatePrompt={() => resolveScenePackage()}
                onUploadCompleteSceneImage={() => resolveScenePackage()}
                onUploadEmptySceneImage={() => resolveScenePackage()}
                onUploadReferenceImage={async () => fixture.referenceImages[0] ?? null}
              />
            </div>
          </main>
        ) : null}
        {view === "assembly-loading" ? <AssemblyLoadingVisualPage /> : null}
        {isAssemblyView(view) ? (
          <AssemblyVisualPage
            mode={view}
            onDeleteChapterAsset={() => resolveScenePackage()}
            onDuplicateChapterAsset={() => resolveScenePackage()}
            onSaveAssembly={handleSaveAssembly}
            onUploadDirectAsset={() => resolveScenePackage()}
            scenePackage={scenePackage}
          />
        ) : null}
      </div>
    </MemoryRouter>
  );
}

function BoardVisualPage() {
  const candidates = visualChapterCandidates();
  return (
    <main className="scene-category-board-page visual-screenshot-page">
      <div className="scene-category-board-page__header">
        <CoursePlannerWorkspaceHeader
          title="Scene Pack / Chapter Board"
          description={fixture.scenePack.title}
          status={<CoursePlannerStatusBadge label="Ready" tone="success" />}
        />
      </div>
      <CoursePlannerResizableColumns
        ariaLabel="Scene Pack board columns"
        className="scene-category-board-layout"
        groupId="visual-scene-category-board-layout"
        storageKey="course-planner:visual-scene-category-board-layout"
        left={{
          id: "visual-scene-packs",
          defaultSize: "19%",
          minSize: "300px",
          maxSize: "460px",
          className: "scene-category-board-layout__left",
          children: (
            <SceneCategoryList
              isBusy={false}
              scenePacks={[fixture.scenePack]}
              selectedScenePackId={fixture.scenePack.id}
              onArchiveScenePack={() => undefined}
              onCreateScenePack={() => undefined}
              onDeleteScenePack={() => undefined}
              onEditScenePack={() => undefined}
              onSelectScenePack={() => undefined}
            />
          ),
        }}
        center={{
          id: "visual-chapter-board",
          defaultSize: "56%",
          minSize: "560px",
          className: "scene-category-board-layout__center",
          children: (
            <div className="scene-category-board-main">
              <PlanningBriefPanel
                activeScenePack={fixture.scenePack}
                candidateCount={candidates.length}
                chapterCount={1}
                isGenerating={false}
                isRevising={false}
                onGenerate={() => undefined}
                onGenerateMore={() => undefined}
                onOpenBatchRevision={() => undefined}
              />
              <CandidateChapterBoard
                acceptingCandidateId={null}
                activeScenePack={fixture.scenePack}
                candidates={candidates}
                deletingCandidateId={null}
                onAccept={() => undefined}
                onDelete={() => undefined}
              />
            </div>
          ),
        }}
        right={{
          id: "visual-chapter-sequence",
          defaultSize: "25%",
          minSize: "360px",
          maxSize: "560px",
          className: "scene-category-board-layout__right",
          children: (
            <SelectedChapterSequence
              chapters={[fixture.chapter]}
              deletingChapterId={null}
              isReordering={false}
              onDeleteChapter={() => undefined}
              onReorderChapters={() => undefined}
            />
          ),
        }}
      />
    </main>
  );
}

function ChapterLoadingVisualPage() {
  return (
    <main className="chapter-workspace-page visual-screenshot-page">
      <CoursePlannerPageHeader
        backTo="/course-planner"
        backLabel="Back to board"
        eyebrow={`${fixture.scenePack.title} / Chapter Scene Studio`}
        title={fixture.chapter.title}
        subtitle={fixture.chapter.summary}
        status="Loading"
        statusTone="neutral"
      />
      <div className="chapter-workspace-route-body">
        <section className="chapter-workspace-panel course-planner-route-placeholder" aria-label="Chapter Scene Package Loading">
          <h2>Loading Scene Package</h2>
          <p>Loading the latest chapter scene-package snapshot.</p>
        </section>
      </div>
    </main>
  );
}

function AssemblyLoadingVisualPage() {
  return (
    <main className="chapter-assembly-editor-page visual-screenshot-page">
      <CoursePlannerPageHeader
        backTo={`/course-planner/chapters/${fixture.chapter.id}`}
        backLabel="Back to Chapter"
        eyebrow="Assembly"
        title={fixture.chapter.title}
        status="Loading"
        statusTone="neutral"
      />
      <div className="chapter-assembly-route-body">
        <section className="chapter-workspace-panel course-planner-route-placeholder" aria-label="Chapter Scene Package Loading">
          <h2>Loading Scene Package</h2>
          <p>Loading the latest chapter scene-package snapshot.</p>
        </section>
      </div>
    </main>
  );
}

function AssemblyVisualPage({
  mode,
  onDeleteChapterAsset,
  onDuplicateChapterAsset,
  onSaveAssembly,
  onUploadDirectAsset,
  scenePackage,
}: {
  mode: Extract<VisualView, `assembly${string}`>;
  onDeleteChapterAsset: () => Promise<ChapterScenePackage | null>;
  onDuplicateChapterAsset: () => Promise<ChapterScenePackage | null>;
  onSaveAssembly: (manifest: ChapterSceneAssemblyManifest) => Promise<ChapterScenePackage | null>;
  onUploadDirectAsset: () => Promise<ChapterScenePackage | null>;
  scenePackage: ChapterScenePackage;
}) {
  useEffect(() => {
    const actionTimer = window.setTimeout(() => {
      applyAssemblyVisualMode(mode);
    }, 0);
    return () => window.clearTimeout(actionTimer);
  }, [mode]);

  return (
    <main className="chapter-assembly-editor-page visual-screenshot-page">
      <AssemblyWorkspacePanel
        backTo={`/course-planner/chapters/${fixture.chapter.id}`}
        chapterTitle={fixture.chapter.title}
        onDeleteChapterAsset={onDeleteChapterAsset}
        onDuplicateChapterAsset={onDuplicateChapterAsset}
        onListGeneratedAssets={async () => visualGeneratedChapterAssets}
        onMaterializeGeneratedAsset={async () => null}
        onSaveAssembly={onSaveAssembly}
        onUploadDirectAsset={onUploadDirectAsset}
        scenePackage={scenePackage}
      />
    </main>
  );
}

function applyAssemblyVisualMode(mode: Extract<VisualView, `assembly${string}`>) {
  if (mode === "assembly-drawer") {
    retryVisualAction(() => clickVisualButton("[aria-label='Import generated assets']"));
    return;
  }
  if (mode === "assembly-multiselect") {
    retryVisualAction(() => selectAssemblyRows(["Mochi target cat target", "Breakfast bowl target"]));
    return;
  }
  if (mode === "assembly-grouping") {
    retryVisualAction(() => {
      if (!selectAssemblyRows(["Mochi target cat target", "Breakfast bowl target"])) {
        return false;
      }
      window.setTimeout(() => {
        retryVisualAction(() => clickVisualButton("[aria-label='Group selected layers']"));
      }, 0);
      return true;
    });
    return;
  }
  if (mode === "assembly-delete") {
    retryVisualAction(() => clickVisualButton(".assembly-layer-panel-delete-button"));
  }
}

function clickVisualButton(selector: string) {
  const button = document.querySelector<HTMLButtonElement>(selector);
  if (!button) {
    return false;
  }
  button.click();
  return true;
}

function retryVisualAction(action: () => boolean | undefined | void, attempt = 0) {
  const result = action();
  if (result !== false) {
    return;
  }
  if (attempt >= 60) {
    return;
  }
  window.setTimeout(() => retryVisualAction(action, attempt + 1), 100);
}

function selectAssemblyRows(labels: string[]) {
  const rows = labels.map((label) => (
    document.querySelector<HTMLElement>(`.assembly-layer-row-select[aria-label='${cssEscape(label)}']`)
  ));
  if (rows.some((row) => !row)) {
    return false;
  }
  rows.forEach((row, index) => {
    if (!row) {
      return;
    }
    row.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      ctrlKey: index > 0,
    }));
  });
  return true;
}

function cssEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function resolveView(): VisualView {
  const params = new URLSearchParams(window.location.search);
  const requestedView = params.get("view");
  if (
    requestedView === "assembly"
    || requestedView === "assembly-delete"
    || requestedView === "assembly-drawer"
    || requestedView === "assembly-grouping"
    || requestedView === "assembly-loading"
    || requestedView === "assembly-multiselect"
    || requestedView === "board"
    || requestedView === "chapter"
    || requestedView === "chapter-loading"
  ) {
    return requestedView;
  }
  return "chapter";
}

function isAssemblyView(value: VisualView): value is Extract<VisualView, `assembly${string}`> {
  return value === "assembly"
    || value === "assembly-delete"
    || value === "assembly-drawer"
    || value === "assembly-grouping"
    || value === "assembly-multiselect";
}

function topBarStatus(currentView: VisualView) {
  if (currentView === "board") {
    return "Course Planner ready.";
  }
  if (currentView === "chapter-loading" || currentView === "assembly-loading") {
    return "Loading chapter workspace.";
  }
  return "Chapter workspace ready.";
}

function formatSavedAt(revision: number) {
  return new Date(SAVE_TIMESTAMP_BASE_MS + revision * 1000).toISOString().replace(".000Z", "Z");
}

const visualHarnessCss = `
  html,
  body,
  #root {
    width: 100%;
    height: 100%;
    min-height: 100%;
    margin: 0;
    background: #f4f6f8;
  }

  .visual-screenshot-page {
    height: 100%;
    min-height: 0;
    box-sizing: border-box;
  }
`;

const visualGeneratedChapterAssets: GeneratedChapterAsset[] = [
  {
    chapter_asset_id: null,
    complete_scene_image_id: "visual_complete_scene_001",
    display_name: "Generated cat variant",
    height: 512,
    pipeline_run_id: "visual_run_complete_001",
    run_asset_id: "visual_generated_cat_variant",
    state: "available",
    unavailable_reason: null,
    width: 512,
  },
  {
    chapter_asset_id: null,
    complete_scene_image_id: "visual_complete_scene_001",
    display_name: "Generated breakfast prop",
    height: 512,
    pipeline_run_id: "visual_run_complete_001",
    run_asset_id: "visual_generated_breakfast_prop",
    state: "available",
    unavailable_reason: null,
    width: 512,
  },
];

function visualChapterCandidates(): ChapterCandidate[] {
  return [
    {
      id: "visual_candidate_001",
      scenePackId: fixture.scenePack.id,
      title: "Breakfast counter setup",
      summary: "Mochi watches the breakfast bowl while morning light reaches the island.",
      seed: {
        ...fixture.chapter.seed,
        chapterId: "visual_candidate_001",
        chapterTitle: "Breakfast counter setup",
      },
    },
    {
      id: "visual_candidate_002",
      scenePackId: fixture.scenePack.id,
      title: "Sunny kitchen floor",
      summary: "The cat and breakfast props are staged with a stronger sun patch for spatial clarity.",
      seed: {
        ...fixture.chapter.seed,
        chapterId: "visual_candidate_002",
        chapterTitle: "Sunny kitchen floor",
      },
    },
  ];
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <CoursePlannerVisualHarness />
  </React.StrictMode>,
);
