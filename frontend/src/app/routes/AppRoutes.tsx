import type { ComponentProps } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";

import { AppWorkbenchContent, type AppWorkbenchProps } from "../components/AppWorkbench";
import { TopAppBar } from "../components/TopAppBar";
import { SceneCategoryBoardPage } from "../../features/coursePlanner/pages/SceneCategoryBoardPage";
import { ChapterWorkspacePage } from "../../features/coursePlanner/pages/ChapterWorkspacePage";
import { ImageAttemptReviewPage } from "../../features/coursePlanner/pages/ImageAttemptReviewPage";

type AppRoutesProps = {
  workbenchProps: AppWorkbenchProps;
};

export function AppRoutes({ workbenchProps }: AppRoutesProps) {
  const { pathname } = useLocation();
  // WHY: 产品区导航是跨路由的主导航，保持同一个 TopAppBar 实例可避免路由切换时右侧动作区和导航焦点被反复重建。
  const topBarProps = buildTopBarProps(pathname, workbenchProps.topBar);
  const shellClassName = pathname.startsWith("/course-planner")
    ? "app-shell course-planner-shell"
    : pathname.startsWith("/lesson-plan")
      ? "app-shell lesson-plan-shell"
      : "app-shell";

  return (
    <div className={shellClassName}>
      <TopAppBar {...topBarProps} />
      <Routes>
        <Route path="/" element={<Navigate to="/pipeline" replace />} />
        <Route path="/pipeline" element={<AppWorkbenchContent {...workbenchProps} />} />
        <Route path="/course-planner" element={<SceneCategoryBoardPage />} />
        <Route path="/course-planner/chapters/:chapterId" element={<ChapterWorkspacePage />} />
        <Route
          path="/course-planner/chapters/:chapterId/versions/:versionId/attempts/:attemptId"
          element={<ImageAttemptReviewPage />}
        />
        <Route path="/lesson-plan" element={<LessonPlanPage />} />
        <Route path="*" element={<Navigate to="/pipeline" replace />} />
      </Routes>
    </div>
  );
}

type TopBarProps = ComponentProps<typeof TopAppBar>;

function buildTopBarProps(pathname: string, pipelineTopBar: TopBarProps): TopBarProps {
  if (pathname.startsWith("/course-planner")) {
    return {
      source: null,
      status: pathname.startsWith("/course-planner/chapters/")
        ? "Chapter workspace ready."
        : "Course Planner ready.",
      title: "Course Planner",
      showPipelineControls: false,
      isPrimaryActionRunning: false,
      isPrimaryActionDisabled: false,
      canStopCodexGeneration: false,
      isStoppingCodexGeneration: false,
      runs: [],
      activeRunId: null,
    };
  }

  if (pathname.startsWith("/lesson-plan")) {
    return {
      source: null,
      status: "Lesson Plan ready.",
      title: "Teaching Materials",
      showPipelineControls: false,
      isPrimaryActionRunning: false,
      isPrimaryActionDisabled: true,
      canStopCodexGeneration: false,
      isStoppingCodexGeneration: false,
      runs: [],
      activeRunId: null,
    };
  }

  return pipelineTopBar;
}

function LessonPlanPage() {
  return (
    <main className="lesson-plan-frame">
      <h1>Lesson Plan</h1>
      <p>Lesson Plan is a product area reserved for course teaching material workflow.</p>
    </main>
  );
}
