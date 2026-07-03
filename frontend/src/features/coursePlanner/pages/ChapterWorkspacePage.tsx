import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";

import { fetchChapterScenePackage } from "../api";
import { CoursePlannerPageHeader } from "../components/CoursePlannerChrome";
import "../components/coursePlanner.css";
import { useCoursePlannerState } from "../hooks/useCoursePlannerState";
import type { Chapter, ChapterScenePackage, CoursePlannerState } from "../types";

type ScenePackageLoadState = "idle" | "loading" | "ready" | "error";

export function ChapterWorkspacePage() {
  const { chapterId } = useParams();
  const planner = useCoursePlannerState();
  const [scenePackage, setScenePackage] = useState<ChapterScenePackage | null>(null);
  const [loadState, setLoadState] = useState<ScenePackageLoadState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const chapter = useMemo(() => findChapter(planner.state, chapterId ?? null), [chapterId, planner.state]);
  const scenePack = useMemo(
    () => (chapter ? planner.state.scenePacks.find((pack) => pack.id === chapter.scenePackId) ?? null : null),
    [chapter, planner.state.scenePacks],
  );

  useEffect(() => {
    if (!chapter) {
      return;
    }
    // WHY: Chapter workspace 的路由是唯一上下文入口；进入页面时同步 planner 选中状态，
    // 避免后续 Task 5 继续复用旧的 board 选中结果，导致数据面板指向别的 chapter。
    if (planner.state.activeScenePackId !== chapter.scenePackId) {
      planner.setActiveScenePackId(chapter.scenePackId);
    }
    if (planner.state.selectedChapterId !== chapter.id) {
      planner.setSelectedChapterId(chapter.id);
    }
  }, [chapter, planner]);

  useEffect(() => {
    if (!chapter) {
      setScenePackage(null);
      setLoadState("idle");
      setErrorMessage(null);
      return;
    }
    let cancelled = false;
    setLoadState("loading");
    setErrorMessage(null);
    void fetchChapterScenePackage(chapter.id)
      .then((nextScenePackage) => {
        if (cancelled) {
          return;
        }
        setScenePackage(nextScenePackage);
        setLoadState("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setScenePackage(null);
        setLoadState("error");
        setErrorMessage(error instanceof Error ? error.message : "Could not load Chapter Scene Package.");
      });
    return () => {
      cancelled = true;
    };
  }, [chapter?.id]);

  if (!chapter || !scenePack) {
    return (
      <main className="chapter-workspace-page">
        <CoursePlannerPageHeader backTo="/course-planner" backLabel="Back to board" title="Chapter not found" />
        <p className="course-planner-empty">Select a Chapter from the Course Planner board.</p>
      </main>
    );
  }

  return (
    <main className="chapter-workspace-page">
      <CoursePlannerPageHeader
        backTo="/course-planner"
        backLabel="Back to board"
        eyebrow={`${scenePack.title} / Chapter`}
        title={chapter.title}
        subtitle={chapter.summary}
        status={scenePackageStatusLabel(loadState, scenePackage)}
        statusTone={scenePackageStatusTone(loadState, scenePackage)}
      />
      {loadState === "loading" && !scenePackage ? (
        <section className="chapter-workspace-panel" aria-label="Chapter Scene Package Loading">
          <h2>Loading Scene Package</h2>
          <p>Loading the latest chapter scene-package snapshot.</p>
        </section>
      ) : null}
      {loadState === "error" ? (
        <section className="chapter-workspace-panel" aria-label="Chapter Scene Package Error">
          <h2>Scene Package Unavailable</h2>
          <p>{errorMessage ?? "Could not load Chapter Scene Package."}</p>
        </section>
      ) : null}
      {scenePackage ? <ChapterScenePackageOverview chapter={chapter} scenePackage={scenePackage} /> : null}
    </main>
  );
}

function ChapterScenePackageOverview({
  chapter,
  scenePackage,
}: {
  chapter: Chapter;
  scenePackage: ChapterScenePackage;
}) {
  const latestCompleteImage = scenePackage.complete_images[scenePackage.complete_images.length - 1] ?? null;

  return (
    <div className="chapter-workspace-grid">
      <section className="chapter-workspace-panel" aria-label="Prompt">
        <h2>Prompt</h2>
        <p>{scenePackage.prompt.prompt_text}</p>
        <p>Spatial contract: {fallbackText(scenePackage.prompt.scene_spatial_contract, "Not set yet.")}</p>
        <p>Target objects: {scenePackage.target_objects.length}</p>
        <p>Avoid objects: {scenePackage.avoid_objects.length}</p>
        <p>Reference selections: {scenePackage.reference_selections.length}</p>
        <p>Style review: {scenePackage.prompt_confirmations.style_reference_mode}</p>
      </section>

      <section className="chapter-workspace-panel" aria-label="Empty Scene">
        <h2>Empty Scene</h2>
        <p>Current empty scene: {scenePackage.current_empty_scene_image_id ?? "Not selected yet."}</p>
        <p>Available empty scenes: {scenePackage.empty_scene_images.length}</p>
        <p>Cast assignments: {scenePackage.cast_assignments.length}</p>
        <p>Chapter seed: {chapter.seed.eventSeed}</p>
      </section>

      <section className="chapter-workspace-panel" aria-label="Images">
        <h2>Images</h2>
        <p>Complete scenes: {scenePackage.complete_images.length}</p>
        <p>Chapter assets: {scenePackage.chapter_assets.length}</p>
        <p>Latest complete image: {latestCompleteImage?.original_filename ?? "None yet."}</p>
        <p>Latest run status: {latestCompleteImage?.pipeline_run_status ?? "Not associated."}</p>
      </section>

      <section className="chapter-workspace-panel" aria-label="Assembly">
        <h2>Assembly</h2>
        <p>Placements: {scenePackage.assembly.placements.length}</p>
        <p>Groups: {scenePackage.assembly.groups.length}</p>
        <p>Layer order entries: {scenePackage.assembly.layer_order.length}</p>
        <p>Assembly updated: {scenePackage.assembly.updated_at ?? "Not saved yet."}</p>
      </section>

      <section className="chapter-workspace-panel" aria-label="Final">
        <h2>Final</h2>
        <p>Locked final scene: {scenePackage.final_scene?.original_filename ?? "Not locked yet."}</p>
        <p>Final prompt snapshot: {scenePackage.final_scene?.prompt_snapshot ?? "No final snapshot yet."}</p>
        <p>Final empty scene: {scenePackage.final_scene?.empty_scene_image_id ?? "Not locked yet."}</p>
      </section>
    </div>
  );
}

function findChapter(state: CoursePlannerState, chapterId: string | null): Chapter | null {
  if (!chapterId) {
    return null;
  }
  return Object.values(state.chaptersByScenePackId)
    .flat()
    .find((chapter) => chapter.id === chapterId) ?? null;
}

function scenePackageStatusLabel(loadState: ScenePackageLoadState, scenePackage: ChapterScenePackage | null): string {
  if (loadState === "loading" && !scenePackage) {
    return "Loading";
  }
  if (loadState === "error") {
    return "Load failed";
  }
  if (!scenePackage) {
    return "Idle";
  }
  if (scenePackage.final_scene) {
    return "Final locked";
  }
  if (scenePackage.complete_images.length > 0) {
    return "Assembly in progress";
  }
  if (scenePackage.empty_scene_images.length > 0) {
    return "Empty scene ready";
  }
  return "Prompt drafted";
}

function scenePackageStatusTone(
  loadState: ScenePackageLoadState,
  scenePackage: ChapterScenePackage | null,
): "neutral" | "warning" | "success" | "danger" {
  if (loadState === "error") {
    return "danger";
  }
  if (scenePackage?.final_scene) {
    return "success";
  }
  if (scenePackage?.empty_scene_images.length) {
    return "warning";
  }
  return "neutral";
}

function fallbackText(value: string | null | undefined, emptyText: string): string {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : emptyText;
}
