import { useParams } from "react-router";

import { AssemblyWorkspacePanel } from "../components/AssemblyWorkspacePanel";
import {
  CoursePlannerPageHeader,
  CoursePlannerStatusBadge,
  CoursePlannerWorkspaceHeader,
} from "../components/CoursePlannerChrome";
import "../components/coursePlanner.css";
import "../components/coursePlannerPanels.css";
import "../components/chapterStudioShared.css";
import "../components/assemblyWorkspace.css";
import "../components/assemblyRightRail.css";
import "../components/assemblyAssetPool.css";
import "../components/assemblyEditorShell.css";
import { useChapterScenePackageWorkspace } from "../hooks/useChapterScenePackageWorkspace";

export function ChapterAssemblyEditorPage() {
  const { chapterId } = useParams();
  const workspace = useChapterScenePackageWorkspace(chapterId ?? null);
  const { asyncStatus, chapter, errorMessage, handlers, loadState, scenePackage, scenePack } = workspace;

  if (!chapter || !scenePack) {
    return (
      <main className="chapter-assembly-editor-page">
        <CoursePlannerPageHeader backTo="/course-planner" backLabel="Back to board" title="Chapter not found" />
        <p className="course-planner-empty">Select a Chapter from the Course Planner board.</p>
      </main>
    );
  }

  // WHY: Chapter 路由负责准备、状态聚合和最终锁定；Assembly 路由独占高频 canvas 编辑面，
  // 避免两个页面同时承载同一套 placement 交互，造成导航语义和用户心智混乱。
  const backToChapter = `/course-planner/chapters/${encodeURIComponent(chapter.id)}`;
  const shouldRenderRouteHeader = !scenePackage;

  return (
    <main className={scenePackage ? "chapter-assembly-editor-page chapter-assembly-editor-page--loaded" : "chapter-assembly-editor-page"}>
      {shouldRenderRouteHeader ? (
        <AssemblyRouteHeader
          backTo={backToChapter}
          chapterTitle={chapter.title}
          status={assemblyRouteStatusLabel(loadState)}
        />
      ) : null}
      <div className="chapter-assembly-route-body">
        {loadState === "loading" && !scenePackage ? (
          <section className="chapter-workspace-panel course-planner-route-placeholder" aria-label="Chapter Scene Package Loading">
            <h2>Loading Scene Package</h2>
            <p>Loading the latest chapter scene-package snapshot.</p>
          </section>
        ) : null}
        {loadState === "error" ? (
          <section className="chapter-workspace-panel course-planner-route-placeholder" aria-label="Chapter Scene Package Error">
            <h2>Scene Package Unavailable</h2>
            <p>{errorMessage ?? "Could not load Chapter Scene Package."}</p>
          </section>
        ) : null}
        {scenePackage ? (
          <AssemblyWorkspacePanel
            backTo={backToChapter}
            chapterTitle={chapter.title}
            onDeleteChapterAsset={handlers.handleDeleteChapterAsset}
            onDuplicateChapterAsset={handlers.handleDuplicateChapterAsset}
            onListGeneratedAssets={handlers.handleListGeneratedAssets}
            onMaterializeGeneratedAsset={handlers.handleMaterializeGeneratedAsset}
            onSaveAssembly={handlers.handleSaveAssembly}
            onUploadDirectAsset={handlers.handleUploadDirectAsset}
            saveStatus={asyncStatus[`scenePackage:assemblySave:${chapter.id}`]}
            scenePackage={scenePackage}
          />
        ) : null}
      </div>
    </main>
  );
}

function assemblyRouteStatusLabel(loadState: ReturnType<typeof useChapterScenePackageWorkspace>["loadState"]) {
  if (loadState === "error") {
    return "Load failed";
  }
  if (loadState === "loading") {
    return "Loading";
  }
  return "Idle";
}

function AssemblyRouteHeader({
  backTo,
  chapterTitle,
  status,
}: {
  backTo: string;
  chapterTitle: string;
  status: string;
}) {
  return (
    <CoursePlannerWorkspaceHeader
      backTo={backTo}
      backLabel="Back to Chapter"
      eyebrow="Assembly"
      title={chapterTitle}
      status={(
        <CoursePlannerStatusBadge
          label={status}
          tone={status === "Load failed" ? "danger" : "neutral"}
        />
      )}
    />
  );
}
