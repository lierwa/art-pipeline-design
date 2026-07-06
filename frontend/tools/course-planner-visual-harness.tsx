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
  ChapterSceneAssemblyManifest,
  ChapterScenePackage,
  GeneratedChapterAsset,
} from "../src/features/coursePlanner/types";
import { TopAppBar } from "../src/app/components/TopAppBar";
import { ChapterSceneStudio } from "../src/features/coursePlanner/components/ChapterSceneStudio";
import { AssemblyWorkspacePanel } from "../src/features/coursePlanner/components/AssemblyWorkspacePanel";
import { coursePlannerVisualReferenceFixture } from "../tests/coursePlanner/coursePlannerVisualReferenceFixtures";

type VisualView = "chapter" | "assembly" | "assembly-drawer";

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
          status={view === "chapter" ? "Course Planner ready." : "Chapter workspace ready."}
          title="Course Planner"
        />
        {view === "chapter" ? (
          <main className="chapter-workspace-page visual-screenshot-page">
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
          </main>
        ) : (
          <AssemblyVisualPage
            onDeleteChapterAsset={() => resolveScenePackage()}
            onDuplicateChapterAsset={() => resolveScenePackage()}
            onSaveAssembly={handleSaveAssembly}
            onUploadDirectAsset={() => resolveScenePackage()}
            scenePackage={scenePackage}
            shouldOpenGeneratedAssets={view === "assembly-drawer"}
          />
        )}
      </div>
    </MemoryRouter>
  );
}

function AssemblyVisualPage({
  onDeleteChapterAsset,
  onDuplicateChapterAsset,
  onSaveAssembly,
  onUploadDirectAsset,
  scenePackage,
  shouldOpenGeneratedAssets,
}: {
  onDeleteChapterAsset: () => Promise<ChapterScenePackage | null>;
  onDuplicateChapterAsset: () => Promise<ChapterScenePackage | null>;
  onSaveAssembly: (manifest: ChapterSceneAssemblyManifest) => Promise<ChapterScenePackage | null>;
  onUploadDirectAsset: () => Promise<ChapterScenePackage | null>;
  scenePackage: ChapterScenePackage;
  shouldOpenGeneratedAssets: boolean;
}) {
  useEffect(() => {
    if (!shouldOpenGeneratedAssets) {
      return undefined;
    }

    const openTimer = window.setTimeout(() => {
      document
        .querySelector<HTMLButtonElement>("[aria-label='Import generated assets']")
        ?.click();
    }, 0);
    return () => window.clearTimeout(openTimer);
  }, [shouldOpenGeneratedAssets]);

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

function resolveView(): VisualView {
  const params = new URLSearchParams(window.location.search);
  if (params.get("view") === "assembly-drawer") {
    return "assembly-drawer";
  }
  return params.get("view") === "assembly" ? "assembly" : "chapter";
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

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <CoursePlannerVisualHarness />
  </React.StrictMode>,
);
