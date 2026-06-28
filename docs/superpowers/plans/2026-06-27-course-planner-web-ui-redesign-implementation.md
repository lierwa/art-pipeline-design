# Course Planner Web UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current all-in-one Course Planner page with route-level navigation, a Scene Category Board, and per-chapter workspaces.

**Architecture:** Use React Router in declarative mode for product-level routes, keeping existing Art Pipeline behavior under `/pipeline`. Preserve the real Course Planner API/types/state work, but rewrite the visual shell so scene categories own chapter boards and each chapter owns scene design, prompt package, and image attempts.

**Tech Stack:** React 18, Vite, TypeScript, Vitest, Testing Library, `react-router` installed from the official React Router package, existing FastAPI Course Planner API.

---

## Verification Policy

Do not run the full project workflow after every small edit.

- Task 1 runs only route/navigation tests plus `npm run build` because it changes app entry and dependency graph.
- Task 2 runs only Course Planner board tests.
- Task 3 runs only Chapter Workspace tests.
- Task 4 runs the full verification set and cleanup checks.

Full verification is reserved for the final task:

```powershell
cd frontend
npm test -- --run tests/coursePlanner
npm test -- --run tests/app/app-flow-01.test.tsx
npm run build
cd ..
python -m pytest backend/tests/course_planner -q
```

## External Library Check

React Router official declarative installation docs currently instruct Vite React apps to install `react-router` and wrap the app in `<BrowserRouter>` from `react-router`: https://reactrouter.com/start/declarative/installation

Implementation should use:

```powershell
cd frontend
npm install react-router
```

Then verify `frontend/package.json` and lockfile update together. Do not add `react-router-dom` unless official docs or package constraints prove it is required.

## File Map

Modify:

- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/src/main.tsx`
- `frontend/src/App.tsx`
- `frontend/src/app/components/TopAppBar.tsx`
- `frontend/src/features/coursePlanner/hooks/useCoursePlannerState.ts`
- `frontend/src/features/coursePlanner/components/coursePlanner.css`
- `frontend/tests/coursePlanner/course-planner-flow.test.tsx`

Create:

- `frontend/src/app/routes/AppRoutes.tsx`
- `frontend/src/app/components/ProductNav.tsx`
- `frontend/src/features/coursePlanner/pages/SceneCategoryBoardPage.tsx`
- `frontend/src/features/coursePlanner/pages/ChapterWorkspacePage.tsx`
- `frontend/src/features/coursePlanner/components/SceneCategoryList.tsx`
- `frontend/src/features/coursePlanner/components/ChapterBoard.tsx`
- `frontend/src/features/coursePlanner/components/ChapterCard.tsx`
- `frontend/src/features/coursePlanner/components/SceneCardEditor.tsx`
- `frontend/src/features/coursePlanner/components/DetectionKeywordsEditor.tsx`
- `frontend/src/features/coursePlanner/components/PromptPackagePanel.tsx`
- `frontend/src/features/coursePlanner/components/PromptPackageModal.tsx`
- `frontend/src/features/coursePlanner/components/ImageAttemptsPanel.tsx`
- `frontend/src/features/coursePlanner/domain/chapterStatus.ts`
- `frontend/tests/coursePlanner/course-planner-routing.test.tsx`
- `frontend/tests/coursePlanner/scene-category-board.test.tsx`
- `frontend/tests/coursePlanner/chapter-workspace.test.tsx`

Remove after replacement:

- `frontend/src/features/coursePlanner/components/SpaceChapterModule.tsx`
- `frontend/src/features/coursePlanner/components/ChapterSceneDesignerModule.tsx`
- `frontend/src/features/coursePlanner/components/ImageAttemptReviewModule.tsx`
- `frontend/src/features/coursePlanner/components/PromptPackageDialog.tsx`

Keep:

- `frontend/src/features/coursePlanner/api.ts`
- `frontend/src/features/coursePlanner/types.ts`

## Task 1: App Routing And Main Navigation

**Purpose:** Introduce route-level navigation beside the logo and move Pipeline/Course Planner/Lesson Plan out of the right action area.

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/app/components/TopAppBar.tsx`
- Modify: `frontend/tests/app/appTestHarness.tsx`
- Create: `frontend/src/app/routes/AppRoutes.tsx`
- Create: `frontend/src/app/components/ProductNav.tsx`
- Create: `frontend/tests/coursePlanner/course-planner-routing.test.tsx`

- [ ] **Step 1: Install React Router**

Run:

```powershell
cd frontend
npm install react-router
```

Expected:

```text
frontend/package.json includes "react-router"
frontend/package-lock.json changes
```

- [ ] **Step 2: Write route/navigation test first**

Create `frontend/tests/coursePlanner/course-planner-routing.test.tsx`:

```tsx
import {
  App,
  describe,
  expect,
  installFetchMock,
  it,
  jsonResponse,
  render,
  screen,
  userEvent,
  within,
} from "../app/appTestHarness";

describe("Course Planner route navigation", () => {
  it("shows product navigation beside the logo and routes between product areas", async () => {
    const user = userEvent.setup();
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/runs" && (!init || init.method === "GET")) {
        return jsonResponse({ runs: [] });
      }
      if (input === "/api/course-planner/state" && (!init || init.method === "GET")) {
        return jsonResponse(emptyPlannerState());
      }
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse({ source: null, elements: [], detectionVocabulary: [] });
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      window.history.pushState({}, "", "/pipeline");
      render(<App />);

      const banner = await screen.findByRole("banner");
      const productNav = within(banner).getByRole("navigation", { name: /product areas/i });
      expect(within(productNav).getByRole("link", { name: /pipeline/i })).toHaveAttribute("href", "/pipeline");
      expect(within(productNav).getByRole("link", { name: /course planner/i })).toHaveAttribute("href", "/course-planner");
      expect(within(productNav).getByRole("link", { name: /lesson plan/i })).toHaveAttribute("href", "/lesson-plan");

      await user.click(within(productNav).getByRole("link", { name: /course planner/i }));
      expect(await screen.findByRole("heading", { name: /scene category board/i })).toBeInTheDocument();

      await user.click(within(productNav).getByRole("link", { name: /lesson plan/i }));
      expect(await screen.findByRole("heading", { name: /lesson plan/i })).toBeInTheDocument();
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });
});

function emptyPlannerState() {
  return {
    courses: [],
    spaces: [],
    chapters: [],
    scenes: [],
    keywords: [],
    versions: [],
    tasks: [],
  };
}
```

- [ ] **Step 3: Run routing test to verify it fails**

Run:

```powershell
cd frontend
npm test -- --run tests/coursePlanner/course-planner-routing.test.tsx
```

Expected failure:

```text
Unable to find navigation with name /product areas/i
```

- [ ] **Step 4: Wrap app with BrowserRouter**

Modify `frontend/src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";

import { App } from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
```

- [ ] **Step 5: Create product nav**

Create `frontend/src/app/components/ProductNav.tsx`:

```tsx
import { BookOpen, ClipboardList, Workflow } from "lucide-react";
import { NavLink } from "react-router";

export function ProductNav() {
  return (
    <nav className="product-nav" aria-label="Product areas">
      <NavLink to="/pipeline">
        <Workflow size={15} aria-hidden="true" />
        Pipeline
      </NavLink>
      <NavLink to="/course-planner">
        <BookOpen size={15} aria-hidden="true" />
        Course Planner
      </NavLink>
      <NavLink to="/lesson-plan">
        <ClipboardList size={15} aria-hidden="true" />
        Lesson Plan
      </NavLink>
    </nav>
  );
}
```

- [ ] **Step 6: Move navigation into TopAppBar**

Modify `frontend/src/app/components/TopAppBar.tsx`:

```tsx
import { ChangeEvent } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { CircleStop, HelpCircle, Loader2, PackageOpen, Play, RefreshCw, Settings, Upload } from "lucide-react";

import { IconButton } from "../../shared/ui/IconButton";
import { ConfirmActionDialog } from "../../shared/ui/ConfirmActionDialog";
import { ProcessingRecordsPopover } from "./ProcessingRecordsPopover";
import { ProductNav } from "./ProductNav";
import { SourceMetadata, WorkspaceRunSummary } from "../../domain/workspace";
```

Keep `title?: string` and `showPipelineControls?: boolean`, but remove `activeWorkbench` and `onSelectWorkbench` props. Inside the brand lockup render:

```tsx
<div className="brand-lockup">
  <div className="brand-mark" aria-hidden="true" />
  <div>
    <h1>{title}</h1>
    <p>{status}</p>
  </div>
  <ProductNav />
</div>
```

Do not render the old `.workbench-switcher`.

- [ ] **Step 7: Create route component**

Create `frontend/src/app/routes/AppRoutes.tsx`:

```tsx
import { Navigate, Route, Routes } from "react-router";

import { AppWorkbench, type AppWorkbenchProps } from "../components/AppWorkbench";
import { TopAppBar } from "../components/TopAppBar";
import { SceneCategoryBoardPage } from "../../features/coursePlanner/pages/SceneCategoryBoardPage";
import { ChapterWorkspacePage } from "../../features/coursePlanner/pages/ChapterWorkspacePage";

type AppRoutesProps = {
  workbenchProps: AppWorkbenchProps;
};

export function AppRoutes({ workbenchProps }: AppRoutesProps) {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/pipeline" replace />} />
      <Route path="/pipeline" element={<AppWorkbench {...workbenchProps} />} />
      <Route path="/course-planner" element={<SceneCategoryBoardPage />} />
      <Route path="/course-planner/chapters/:chapterId" element={<ChapterWorkspacePage />} />
      <Route path="/lesson-plan" element={<LessonPlanPage />} />
      <Route path="*" element={<Navigate to="/pipeline" replace />} />
    </Routes>
  );
}

function LessonPlanPage() {
  return (
    <div className="app-shell lesson-plan-shell">
      <TopAppBar
        source={null}
        status="Lesson Plan ready."
        title="Lesson Plan"
        showPipelineControls={false}
        primaryActionLabel="Refresh"
        primaryActionHelp="Lesson Plan data is not wired in this Course Planner UI task."
        isPrimaryActionRunning={false}
        isPrimaryActionDisabled={true}
        canStopCodexGeneration={false}
        isStoppingCodexGeneration={false}
        runs={[]}
        activeRunId={null}
        onUpload={() => {}}
        onPrimaryAction={() => {}}
        onStopCodexGeneration={() => {}}
        onSelectRun={() => {}}
        onDuplicateRun={() => {}}
        onDeleteRun={() => {}}
      />
      <main className="lesson-plan-frame">
        <h1>Lesson Plan</h1>
        <p>Lesson Plan is a product area reserved for course teaching material workflow.</p>
      </main>
    </div>
  );
}
```

- [ ] **Step 8: Update App to use routes**

Modify the end of `frontend/src/App.tsx`:

```tsx
import { AppRoutes } from "./app/routes/AppRoutes";
```

Remove:

```tsx
import { useState } from "react";
import { CoursePlannerShell } from "./features/coursePlanner/components/CoursePlannerShell";
```

Remove:

```tsx
const [activeWorkbench, setActiveWorkbench] = useState<"pipeline" | "coursePlanner">("pipeline");
```

Replace the conditional return with:

```tsx
return (
  <AppRoutes
    workbenchProps={{
      ...workbenchProps,
      topBar: {
        ...workbenchProps.topBar,
        title: "Art Asset Pipeline",
      },
    }}
  />
);
```

- [ ] **Step 9: Add navigation CSS**

Modify `frontend/src/styles.css` or `frontend/src/features/coursePlanner/components/coursePlanner.css` only where the existing top-bar CSS lives:

```css
.top-app-bar {
  grid-template-columns: minmax(520px, max-content) minmax(0, 1fr);
}

.brand-lockup {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  min-width: 0;
}

.product-nav {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  margin-left: 0.5rem;
  padding: 0.18rem;
  border: 1px solid #2b394d;
  border-radius: 7px;
  background: #0d1622;
}

.product-nav a {
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 0.36rem;
  padding: 0 0.58rem;
  border-radius: 5px;
  color: #9eacc0;
  font-size: 0.76rem;
  font-weight: 700;
  text-decoration: none;
}

.product-nav a.active {
  background: #1a2a40;
  color: #f3f8ff;
  box-shadow: inset 0 0 0 1px #35577f;
}
```

- [ ] **Step 10: Update test harness to provide Router context**

Modify `frontend/tests/app/appTestHarness.tsx` so tests that import `App` get the same router context as production.

Add these imports with the existing imports at the top:

```tsx
import { BrowserRouter } from "react-router";
import { App as RawApp } from "../../src/App";
```

Keep these existing re-export lines unchanged:

```tsx
export { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
export { describe, expect, it, vi } from "vitest";
```

Replace the final `export { App } from "../../src/App";` with:

```tsx
export function App() {
  return (
    <BrowserRouter>
      <RawApp />
    </BrowserRouter>
  );
}
```

- [ ] **Step 11: Create initial route page shells**

Create minimal route pages so navigation is testable before the board and workspace are filled in.

Create `frontend/src/features/coursePlanner/pages/SceneCategoryBoardPage.tsx`:

```tsx
import { TopAppBar } from "../../../app/components/TopAppBar";
import "../components/coursePlanner.css";

export function SceneCategoryBoardPage() {
  return (
    <div className="app-shell course-planner-shell">
      <TopAppBar
        source={null}
        status="Course Planner ready."
        title="Course Planner"
        showPipelineControls={false}
        primaryActionLabel="Refresh"
        primaryActionHelp="Reload Course Planner state"
        isPrimaryActionRunning={false}
        isPrimaryActionDisabled={false}
        canStopCodexGeneration={false}
        isStoppingCodexGeneration={false}
        runs={[]}
        activeRunId={null}
        onUpload={() => {}}
        onPrimaryAction={() => {}}
        onStopCodexGeneration={() => {}}
        onSelectRun={() => {}}
        onDuplicateRun={() => {}}
        onDeleteRun={() => {}}
      />
      <main className="course-planner-page-frame">
        <h1>Scene Category Board</h1>
      </main>
    </div>
  );
}
```

Create `frontend/src/features/coursePlanner/pages/ChapterWorkspacePage.tsx`:

```tsx
import { TopAppBar } from "../../../app/components/TopAppBar";
import "../components/coursePlanner.css";

export function ChapterWorkspacePage() {
  return (
    <div className="app-shell course-planner-shell">
      <TopAppBar
        source={null}
        status="Chapter workspace ready."
        title="Course Planner"
        showPipelineControls={false}
        primaryActionLabel="Refresh"
        primaryActionHelp="Reload Course Planner state"
        isPrimaryActionRunning={false}
        isPrimaryActionDisabled={false}
        canStopCodexGeneration={false}
        isStoppingCodexGeneration={false}
        runs={[]}
        activeRunId={null}
        onUpload={() => {}}
        onPrimaryAction={() => {}}
        onStopCodexGeneration={() => {}}
        onSelectRun={() => {}}
        onDuplicateRun={() => {}}
        onDeleteRun={() => {}}
      />
      <main className="course-planner-page-frame">
        <h1>Chapter Workspace</h1>
      </main>
    </div>
  );
}
```

- [ ] **Step 12: Run focused routing verification**

Run:

```powershell
cd frontend
npm test -- --run tests/coursePlanner/course-planner-routing.test.tsx
npm run build
```

Expected:

```text
course-planner-routing.test.tsx passes
build passes
```

- [ ] **Step 13: Commit Task 1**

Run:

```powershell
git add frontend/package.json frontend/package-lock.json frontend/src/main.tsx frontend/src/App.tsx frontend/src/app/components/TopAppBar.tsx frontend/src/app/components/ProductNav.tsx frontend/src/app/routes/AppRoutes.tsx frontend/src/features/coursePlanner/pages frontend/src/features/coursePlanner/components/coursePlanner.css frontend/tests/app/appTestHarness.tsx frontend/tests/coursePlanner/course-planner-routing.test.tsx
git commit -m "feat: add route-level product navigation"
```

## Task 2: Scene Category Board

**Purpose:** Replace the all-in-one Course Planner page with a board where scene categories own chapter cards.

**Files:**
- Modify: `frontend/src/features/coursePlanner/pages/SceneCategoryBoardPage.tsx`
- Modify: `frontend/src/features/coursePlanner/hooks/useCoursePlannerState.ts`
- Create: `frontend/src/features/coursePlanner/components/SceneCategoryList.tsx`
- Create: `frontend/src/features/coursePlanner/components/ChapterBoard.tsx`
- Create: `frontend/src/features/coursePlanner/components/ChapterCard.tsx`
- Create: `frontend/src/features/coursePlanner/domain/chapterStatus.ts`
- Modify: `frontend/src/features/coursePlanner/components/coursePlanner.css`
- Create: `frontend/tests/coursePlanner/scene-category-board.test.tsx`

- [ ] **Step 1: Write board test first**

Create `frontend/tests/coursePlanner/scene-category-board.test.tsx`:

```tsx
import {
  App,
  describe,
  expect,
  installFetchMock,
  it,
  jsonResponse,
  render,
  screen,
  userEvent,
  within,
} from "../app/appTestHarness";

describe("Scene Category Board", () => {
  it("renders scene categories and chapter cards as parallel work items", async () => {
    const user = userEvent.setup();
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/runs" && (!init || init.method === "GET")) {
        return jsonResponse({ runs: [] });
      }
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse({ source: null, elements: [], detectionVocabulary: [] });
      }
      if (input === "/api/course-planner/state" && (!init || init.method === "GET")) {
        return jsonResponse(plannerState());
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      window.history.pushState({}, "", "/course-planner");
      render(<App />);

      expect(await screen.findByRole("heading", { name: /scene category board/i })).toBeInTheDocument();
      const categoryNav = screen.getByRole("navigation", { name: /scene categories/i });
      expect(within(categoryNav).getByRole("button", { name: /home life/i })).toBeInTheDocument();
      expect(within(categoryNav).getByRole("button", { name: /school/i })).toBeInTheDocument();

      const chapterBoard = screen.getByRole("region", { name: /chapter board/i });
      expect(within(chapterBoard).getByText("Kitchen")).toBeInTheDocument();
      expect(within(chapterBoard).getByText(/scene ready/i)).toBeInTheDocument();
      expect(within(chapterBoard).getByText(/2 keywords/i)).toBeInTheDocument();
      expect(within(chapterBoard).getByText(/1 attempt/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /new scene category/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /generate chapters/i })).toBeInTheDocument();

      await user.click(within(categoryNav).getByRole("button", { name: /school/i }));
      expect(within(chapterBoard).getByText("Classroom")).toBeInTheDocument();
      expect(within(chapterBoard).queryByText("Kitchen")).not.toBeInTheDocument();
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });
});

function plannerState() {
  return {
    courses: [{ id: "course_001", title_zh: "猫咪英语启蒙", app_language: "zh-CN", target_language: "en" }],
    spaces: [
      { id: "space_home", course_id: "course_001", title_zh: "Home Life", target_language: "en", target_level: "A1", chapter_count: 2, storyline_mode: "parallel", space_type: "scene_category", notes: "", order: 1 },
      { id: "space_school", course_id: "course_001", title_zh: "School", target_language: "en", target_level: "A1", chapter_count: 1, storyline_mode: "parallel", space_type: "scene_category", notes: "", order: 2 },
    ],
    chapters: [
      { id: "chapter_kitchen", space_id: "space_home", order: 1, title_zh: "Kitchen", summary_zh: "Morning kitchen scene." },
      { id: "chapter_living", space_id: "space_home", order: 2, title_zh: "Living Room", summary_zh: "Reading on the sofa." },
      { id: "chapter_classroom", space_id: "space_school", order: 1, title_zh: "Classroom", summary_zh: "A classroom activity." },
    ],
    scenes: [{ chapter_id: "chapter_kitchen", title_zh: "Kitchen", visual_brief_zh: "Kitchen scene", image2_style: "storybook" }],
    keywords: [{ chapter_id: "chapter_kitchen", keywords: ["cup", "sink"] }],
    versions: [{ id: "version_001", chapter_id: "chapter_kitchen", index: 1, image_path: "versions/v001/image.png", status: "uploaded", created_at: "2026-06-27T10:00:00Z", updated_at: "2026-06-27T10:00:00Z" }],
    tasks: [],
  };
}
```

- [ ] **Step 2: Run board test to verify it fails**

Run:

```powershell
cd frontend
npm test -- --run tests/coursePlanner/scene-category-board.test.tsx
```

Expected failure:

```text
Unable to find navigation with name /scene categories/i
```

- [ ] **Step 3: Add chapter status derivation**

Create `frontend/src/features/coursePlanner/domain/chapterStatus.ts`:

```ts
import type { CoursePlannerState } from "../types";

export type ChapterProductionStatus = {
  hasScene: boolean;
  keywordCount: number;
  attemptCount: number;
  hasLockedVersion: boolean;
};

export function deriveChapterProductionStatus(
  state: CoursePlannerState,
  chapterId: string,
): ChapterProductionStatus {
  const keywords = state.keywords.find((item) => item.chapter_id === chapterId);
  const versions = state.versions.filter((version) => version.chapter_id === chapterId);
  return {
    hasScene: state.scenes.some((scene) => scene.chapter_id === chapterId),
    keywordCount: keywords?.keywords.length ?? 0,
    attemptCount: versions.length,
    hasLockedVersion: versions.some((version) => version.status === "locked"),
  };
}
```

- [ ] **Step 4: Add scene category list**

Create `frontend/src/features/coursePlanner/components/SceneCategoryList.tsx`:

```tsx
import type { Space } from "../types";

type SceneCategoryListProps = {
  categories: Space[];
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string) => void;
};

export function SceneCategoryList({ categories, selectedCategoryId, onSelectCategory }: SceneCategoryListProps) {
  return (
    <nav className="scene-category-list" aria-label="Scene categories">
      {categories.map((category) => (
        <button
          type="button"
          className={category.id === selectedCategoryId ? "is-active" : ""}
          key={category.id}
          onClick={() => onSelectCategory(category.id)}
        >
          <strong>{category.title_zh}</strong>
          <span>{category.target_level} / {category.chapter_count} chapters</span>
        </button>
      ))}
    </nav>
  );
}
```

- [ ] **Step 5: Add chapter card**

Create `frontend/src/features/coursePlanner/components/ChapterCard.tsx`:

```tsx
import { Link } from "react-router";

import type { ChapterProductionStatus } from "../domain/chapterStatus";
import type { Chapter } from "../types";

type ChapterCardProps = {
  chapter: Chapter;
  status: ChapterProductionStatus;
};

export function ChapterCard({ chapter, status }: ChapterCardProps) {
  return (
    <article className="chapter-card">
      <header>
        <div>
          <h3>{chapter.title_zh}</h3>
          <p>{chapter.summary_zh}</p>
        </div>
        <span>#{chapter.order}</span>
      </header>
      <dl>
        <div>
          <dt>Scene Card</dt>
          <dd>{status.hasScene ? "scene ready" : "scene missing"}</dd>
        </div>
        <div>
          <dt>Keywords</dt>
          <dd>{status.keywordCount} keywords</dd>
        </div>
        <div>
          <dt>Image Attempts</dt>
          <dd>{status.attemptCount} {status.attemptCount === 1 ? "attempt" : "attempts"}</dd>
        </div>
        <div>
          <dt>Pipeline Import</dt>
          <dd>{status.hasLockedVersion ? "locked" : "not imported"}</dd>
        </div>
      </dl>
      <div className="chapter-card-actions">
        <Link to={`/course-planner/chapters/${encodeURIComponent(chapter.id)}`}>Open Designer</Link>
        <Link to={`/course-planner/chapters/${encodeURIComponent(chapter.id)}#attempts`}>Attempts</Link>
      </div>
    </article>
  );
}
```

- [ ] **Step 6: Add chapter board**

Create `frontend/src/features/coursePlanner/components/ChapterBoard.tsx`:

```tsx
import { deriveChapterProductionStatus } from "../domain/chapterStatus";
import type { Chapter, CoursePlannerState } from "../types";
import { ChapterCard } from "./ChapterCard";

type ChapterBoardProps = {
  chapters: Chapter[];
  state: CoursePlannerState;
};

export function ChapterBoard({ chapters, state }: ChapterBoardProps) {
  return (
    <section className="chapter-board" aria-label="Chapter Board">
      {chapters.length > 0 ? (
        chapters.map((chapter) => (
          <ChapterCard
            chapter={chapter}
            key={chapter.id}
            status={deriveChapterProductionStatus(state, chapter.id)}
          />
        ))
      ) : (
        <p className="course-planner-empty">No chapters in this scene category.</p>
      )}
    </section>
  );
}
```

- [ ] **Step 7: Implement SceneCategoryBoardPage**

Replace `frontend/src/features/coursePlanner/pages/SceneCategoryBoardPage.tsx`:

```tsx
import { useMemo, useState } from "react";

import { TopAppBar } from "../../../app/components/TopAppBar";
import { useCoursePlannerState } from "../hooks/useCoursePlannerState";
import { ChapterBoard } from "../components/ChapterBoard";
import "../components/coursePlanner.css";
import { SceneCategoryList } from "../components/SceneCategoryList";

export function SceneCategoryBoardPage() {
  const planner = useCoursePlannerState();
  const categories = planner.spacesForCourse;
  const [categoryDraft, setCategoryDraft] = useState({
    id: "",
    title: "",
    targetLevel: "",
    chapterCount: 1,
  });
  const chapters = useMemo(
    () => planner.state.chapters.filter((chapter) => chapter.space_id === planner.selectedSpaceId),
    [planner.selectedSpaceId, planner.state.chapters],
  );
  const canCreateCategory = Boolean(
    planner.selectedCourse &&
    categoryDraft.id.trim() &&
    categoryDraft.title.trim() &&
    categoryDraft.targetLevel.trim() &&
    categoryDraft.chapterCount >= 1,
  );

  async function createCategory() {
    if (!planner.selectedCourse || !canCreateCategory) {
      return;
    }

    await planner.createSpace({
      id: categoryDraft.id.trim(),
      course_id: planner.selectedCourse.id,
      title_zh: categoryDraft.title.trim(),
      target_language: planner.selectedCourse.target_language,
      target_level: categoryDraft.targetLevel.trim(),
      chapter_count: Math.max(1, categoryDraft.chapterCount),
      storyline_mode: "parallel",
      space_type: "scene_category",
      notes: "",
      order: categories.length + 1,
    });
  }

  return (
    <div className="app-shell course-planner-shell">
      <TopAppBar
        source={null}
        status={planner.status}
        title="Course Planner"
        showPipelineControls={false}
        primaryActionLabel="Refresh"
        primaryActionHelp="Reload Course Planner state"
        isPrimaryActionRunning={planner.busyAction === "load-state"}
        isPrimaryActionDisabled={planner.busyAction !== null}
        canStopCodexGeneration={false}
        isStoppingCodexGeneration={false}
        runs={[]}
        activeRunId={null}
        onUpload={() => {}}
        onPrimaryAction={() => void planner.refresh()}
        onStopCodexGeneration={() => {}}
        onSelectRun={() => {}}
        onDuplicateRun={() => {}}
        onDeleteRun={() => {}}
      />
      <main className="scene-category-board-page">
        <header className="course-planner-page-header">
          <div>
            <h1>Scene Category Board</h1>
            <p>Scene categories group parallel chapter work items.</p>
          </div>
          <div className="course-planner-actions">
            <button
              type="button"
              disabled={!canCreateCategory}
              onClick={() => void createCategory()}
            >
              New Scene Category
            </button>
            <button
              type="button"
              disabled={!planner.selectedSpaceId || planner.busyAction !== null}
              onClick={() => void planner.generateChapters()}
            >
              Generate Chapters
            </button>
          </div>
        </header>
        <div className="scene-category-board-layout">
          <aside className="scene-category-panel">
            <h2>Scene Categories</h2>
            <div className="scene-category-create-form">
              <label>
                <span>Category ID</span>
                <input
                  value={categoryDraft.id}
                  onChange={(event) => setCategoryDraft((draft) => ({ ...draft, id: event.target.value }))}
                />
              </label>
              <label>
                <span>Category Name</span>
                <input
                  value={categoryDraft.title}
                  onChange={(event) => setCategoryDraft((draft) => ({ ...draft, title: event.target.value }))}
                />
              </label>
              <label>
                <span>Chapters</span>
                <input
                  min={1}
                  type="number"
                  value={categoryDraft.chapterCount}
                  onChange={(event) => setCategoryDraft((draft) => ({ ...draft, chapterCount: Number(event.target.value) }))}
                />
              </label>
              <label>
                <span>Target Level</span>
                <input
                  value={categoryDraft.targetLevel}
                  onChange={(event) => setCategoryDraft((draft) => ({ ...draft, targetLevel: event.target.value }))}
                />
              </label>
            </div>
            <SceneCategoryList
              categories={categories}
              selectedCategoryId={planner.selectedSpaceId}
              onSelectCategory={planner.setSelectedSpaceId}
            />
          </aside>
          <ChapterBoard chapters={chapters} state={planner.state} />
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 8: Add board CSS**

Replace the four-panel layout CSS in `frontend/src/features/coursePlanner/components/coursePlanner.css` with page-based rules. Keep product nav CSS if it lives there.

```css
.course-planner-shell {
  background: #070c12;
}

.scene-category-board-page,
.chapter-workspace-page,
.lesson-plan-frame {
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 0.8rem;
  padding: 0.9rem;
  overflow: auto;
  background: #080e15;
}

.course-planner-page-header {
  display: flex;
  justify-content: space-between;
  gap: 0.8rem;
  padding-bottom: 0.7rem;
  border-bottom: 1px solid #253246;
}

.course-planner-page-header h1,
.course-planner-page-header p,
.scene-category-panel h2,
.chapter-card h3,
.chapter-card p {
  margin: 0;
}

.course-planner-page-header h1,
.scene-category-panel h2,
.chapter-card h3 {
  color: #f3f7ff;
}

.course-planner-page-header p,
.chapter-card p,
.scene-category-list span,
.course-planner-empty {
  color: #8fa1b8;
  font-size: 0.76rem;
}

.scene-category-board-layout {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(260px, 0.26fr) minmax(0, 1fr);
  gap: 1px;
  background: #202b39;
  overflow: hidden;
}

.scene-category-panel,
.chapter-board {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  background: #0b1119;
}

.scene-category-panel {
  display: grid;
  align-content: start;
  gap: 0.65rem;
  padding: 0.82rem;
}

.scene-category-list,
.chapter-board,
.scene-category-create-form {
  display: grid;
  gap: 0.55rem;
}

.scene-category-create-form label {
  display: grid;
  gap: 0.24rem;
}

.scene-category-create-form span {
  color: #8fa1b8;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0;
}

.scene-category-create-form input {
  width: 100%;
  height: 34px;
  min-width: 0;
  padding: 0 0.55rem;
  border: 1px solid #2c3a4e;
  border-radius: 6px;
  background: #0d1621;
  color: #edf4ff;
}

.scene-category-list button {
  min-width: 0;
  display: grid;
  justify-items: start;
  gap: 0.12rem;
  padding: 0.55rem 0.6rem;
  border-color: #263449;
  background: #0f1824;
  text-align: left;
}

.scene-category-list button.is-active {
  border-color: #4089ff;
  background: #12243a;
  box-shadow: inset 3px 0 0 #4089ff;
}

.chapter-board {
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  align-content: start;
  padding: 0.82rem;
}

.chapter-card {
  min-width: 0;
  display: grid;
  gap: 0.62rem;
  padding: 0.72rem;
  border: 1px solid #29384b;
  border-radius: 7px;
  background: #0f1824;
}

.chapter-card header {
  display: flex;
  justify-content: space-between;
  gap: 0.65rem;
}

.chapter-card dl {
  display: grid;
  gap: 0.34rem;
  margin: 0;
}

.chapter-card dl div {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
}

.chapter-card dt {
  color: #8fa1b8;
  font-size: 0.68rem;
  font-weight: 700;
}

.chapter-card dd {
  margin: 0;
  color: #dce8f8;
  font-size: 0.74rem;
}

.chapter-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.42rem;
}

.chapter-card-actions a {
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 0.62rem;
  border: 1px solid #2d3f5a;
  border-radius: 6px;
  background: #101927;
  color: #c8d6ea;
  font-size: 0.76rem;
  font-weight: 700;
  text-decoration: none;
}

@media (max-width: 980px) {
  .scene-category-board-layout {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 9: Run focused board test**

Run:

```powershell
cd frontend
npm test -- --run tests/coursePlanner/scene-category-board.test.tsx
```

Expected:

```text
scene-category-board.test.tsx passes
```

- [ ] **Step 10: Commit Task 2**

Run:

```powershell
git add frontend/src/features/coursePlanner/pages/SceneCategoryBoardPage.tsx frontend/src/features/coursePlanner/components/SceneCategoryList.tsx frontend/src/features/coursePlanner/components/ChapterBoard.tsx frontend/src/features/coursePlanner/components/ChapterCard.tsx frontend/src/features/coursePlanner/domain/chapterStatus.ts frontend/src/features/coursePlanner/components/coursePlanner.css frontend/tests/coursePlanner/scene-category-board.test.tsx
git commit -m "feat: add scene category chapter board"
```

## Task 3: Chapter Workspace

**Purpose:** Build the per-chapter workspace with scene card editing, keyword chips, prompt package, and optional image attempts.

**Files:**
- Modify: `frontend/src/features/coursePlanner/pages/ChapterWorkspacePage.tsx`
- Create: `frontend/src/features/coursePlanner/components/SceneCardEditor.tsx`
- Create: `frontend/src/features/coursePlanner/components/DetectionKeywordsEditor.tsx`
- Create: `frontend/src/features/coursePlanner/components/PromptPackagePanel.tsx`
- Create: `frontend/src/features/coursePlanner/components/PromptPackageModal.tsx`
- Create: `frontend/src/features/coursePlanner/components/ImageAttemptsPanel.tsx`
- Modify: `frontend/src/features/coursePlanner/components/coursePlanner.css`
- Create: `frontend/tests/coursePlanner/chapter-workspace.test.tsx`

- [ ] **Step 1: Write workspace test first**

Create `frontend/tests/coursePlanner/chapter-workspace.test.tsx`:

```tsx
import {
  App,
  describe,
  expect,
  installFetchMock,
  it,
  jsonResponse,
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from "../app/appTestHarness";

describe("Chapter Workspace", () => {
  it("shows one chapter workspace with scene card, keywords, prompt package, and attempts", async () => {
    const user = userEvent.setup();
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/runs" && (!init || init.method === "GET")) {
        return jsonResponse({ runs: [] });
      }
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse({ source: null, elements: [], detectionVocabulary: [] });
      }
      if (input === "/api/course-planner/state" && (!init || init.method === "GET")) {
        return jsonResponse(plannerState());
      }
      if (input === "/api/course-planner/courses/course_001/spaces/space_home/chapters/chapter_kitchen/prompt-package" && init?.method === "POST") {
        return jsonResponse({
          chapter_id: "chapter_kitchen",
          prompt: "Create a kitchen scene.",
          negative_prompt: "No text.",
          detection_keywords: ["cup", "sink"],
        });
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      window.history.pushState({}, "", "/course-planner/chapters/chapter_kitchen");
      render(<App />);

      expect(await screen.findByRole("heading", { name: /chapter: kitchen/i })).toBeInTheDocument();
      expect(screen.getByRole("region", { name: /scene card/i })).toBeInTheDocument();
      expect(screen.getByRole("region", { name: /detection keywords/i })).toBeInTheDocument();
      expect(screen.getByRole("region", { name: /prompt package/i })).toBeInTheDocument();
      expect(screen.getByRole("region", { name: /image attempts/i })).toBeInTheDocument();

      const keywords = screen.getByRole("region", { name: /detection keywords/i });
      expect(within(keywords).getByText("cup")).toBeInTheDocument();
      expect(within(keywords).getByText("sink")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /generate prompt/i }));
      expect(await screen.findByText("Create a kitchen scene.")).toBeInTheDocument();
      expect(screen.queryByText(/learning_keywords/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/reason_zh/i)).not.toBeInTheDocument();

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith(
          "/api/course-planner/courses/course_001/spaces/space_home/chapters/chapter_kitchen/prompt-package",
          expect.objectContaining({ method: "POST" }),
        );
      });
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });
});

function plannerState() {
  return {
    courses: [{ id: "course_001", title_zh: "猫咪英语启蒙", app_language: "zh-CN", target_language: "en" }],
    spaces: [{ id: "space_home", course_id: "course_001", title_zh: "Home Life", target_language: "en", target_level: "A1", chapter_count: 1, storyline_mode: "parallel", space_type: "scene_category", notes: "", order: 1 }],
    chapters: [{ id: "chapter_kitchen", space_id: "space_home", order: 1, title_zh: "Kitchen", summary_zh: "Morning kitchen scene." }],
    scenes: [{ chapter_id: "chapter_kitchen", title_zh: "Kitchen", visual_brief_zh: "A bright kitchen.", image2_style: "storybook" }],
    keywords: [{ chapter_id: "chapter_kitchen", keywords: ["cup", "sink"] }],
    versions: [{ id: "version_001", chapter_id: "chapter_kitchen", index: 1, image_path: "versions/v001/image.png", status: "uploaded", created_at: "2026-06-27T10:00:00Z", updated_at: "2026-06-27T10:00:00Z" }],
    tasks: [],
  };
}
```

- [ ] **Step 2: Run workspace test to verify it fails**

Run:

```powershell
cd frontend
npm test -- --run tests/coursePlanner/chapter-workspace.test.tsx
```

Expected failure:

```text
Unable to find heading /chapter: kitchen/i
```

- [ ] **Step 3: Create scene card editor**

Create `frontend/src/features/coursePlanner/components/SceneCardEditor.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Save } from "lucide-react";

import type { SceneCard, SceneKeywords } from "../types";

type SceneCardEditorProps = {
  chapterId: string;
  scene: SceneCard | null;
  keywords: SceneKeywords | null;
  onSave: (scene: SceneCard, keywords: SceneKeywords) => Promise<void>;
};

export function SceneCardEditor({ chapterId, scene, keywords, onSave }: SceneCardEditorProps) {
  const [title, setTitle] = useState("");
  const [visualBrief, setVisualBrief] = useState("");
  const [imageStyle, setImageStyle] = useState("");
  const [keywordsText, setKeywordsText] = useState("");
  const parsedKeywords = parseKeywords(keywordsText);
  const canSave = title.trim() && visualBrief.trim() && imageStyle.trim();

  useEffect(() => {
    setTitle(scene?.title_zh ?? "");
    setVisualBrief(scene?.visual_brief_zh ?? "");
    setImageStyle(scene?.image2_style ?? "");
    setKeywordsText(keywords?.keywords.join(", ") ?? "");
  }, [chapterId, keywords, scene]);

  return (
    <section className="chapter-workspace-panel" aria-label="Scene Card">
      <header>
        <h2>Scene Card</h2>
      </header>
      <label>
        <span>Scene Title</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label>
        <span>Visual Brief</span>
        <textarea value={visualBrief} onChange={(event) => setVisualBrief(event.target.value)} />
      </label>
      <label>
        <span>Image2 Style</span>
        <input value={imageStyle} onChange={(event) => setImageStyle(event.target.value)} />
      </label>
      <label>
        <span>Detection Keywords</span>
        <textarea value={keywordsText} onChange={(event) => setKeywordsText(event.target.value)} />
      </label>
      <button
        type="button"
        disabled={!canSave}
        onClick={() => void onSave(toScene(chapterId, title, visualBrief, imageStyle), toKeywords(chapterId, parsedKeywords))}
      >
        <Save size={15} aria-hidden="true" />
        Save Scene
      </button>
    </section>
  );
}

function parseKeywords(value: string): string[] {
  return Array.from(new Set(value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean)));
}

function toScene(chapterId: string, title: string, visualBrief: string, imageStyle: string): SceneCard {
  return {
    chapter_id: chapterId,
    title_zh: title.trim(),
    visual_brief_zh: visualBrief.trim(),
    image2_style: imageStyle.trim(),
  };
}

function toKeywords(chapterId: string, keywords: string[]): SceneKeywords {
  return {
    chapter_id: chapterId,
    keywords,
  };
}
```

- [ ] **Step 4: Create detection keywords panel**

Create `frontend/src/features/coursePlanner/components/DetectionKeywordsEditor.tsx`:

```tsx
import type { SceneKeywords } from "../types";

type DetectionKeywordsEditorProps = {
  keywords: SceneKeywords | null;
};

export function DetectionKeywordsEditor({ keywords }: DetectionKeywordsEditorProps) {
  return (
    <section className="chapter-workspace-panel" aria-label="Detection Keywords">
      <header>
        <h2>Detection Keywords</h2>
      </header>
      <div className="course-planner-keywords">
        {(keywords?.keywords ?? []).map((keyword) => (
          <span key={keyword}>{keyword}</span>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Create prompt package panel**

Create `frontend/src/features/coursePlanner/components/PromptPackagePanel.tsx`:

```tsx
import { Clipboard, PackageOpen } from "lucide-react";

import type { PromptPackage } from "../types";

type PromptPackagePanelProps = {
  promptPackage: PromptPackage | null;
  onGenerate: () => Promise<PromptPackage | null>;
  onOpen: () => void;
};

export function PromptPackagePanel({ promptPackage, onGenerate, onOpen }: PromptPackagePanelProps) {
  return (
    <section className="chapter-workspace-panel" aria-label="Prompt Package">
      <header>
        <h2>Prompt Package</h2>
      </header>
      <div className="course-planner-actions">
        <button type="button" onClick={() => void onGenerate()}>
          <PackageOpen size={15} aria-hidden="true" />
          Generate Prompt
        </button>
        <button type="button" disabled={!promptPackage} onClick={() => promptPackage && void copyPrompt(promptPackage.prompt)}>
          <Clipboard size={15} aria-hidden="true" />
          Copy Prompt
        </button>
        <button type="button" disabled={!promptPackage} onClick={onOpen}>
          View Full
        </button>
      </div>
      {promptPackage ? <p>{promptPackage.prompt}</p> : <p className="course-planner-empty">No prompt package generated.</p>}
    </section>
  );
}

async function copyPrompt(prompt: string) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(prompt);
  }
}
```

- [ ] **Step 6: Create prompt modal**

Create `frontend/src/features/coursePlanner/components/PromptPackageModal.tsx`:

```tsx
import type { PromptPackage } from "../types";

type PromptPackageModalProps = {
  promptPackage: PromptPackage | null;
  isOpen: boolean;
  onClose: () => void;
};

export function PromptPackageModal({ promptPackage, isOpen, onClose }: PromptPackageModalProps) {
  if (!isOpen || !promptPackage) {
    return null;
  }

  return (
    <div className="course-planner-modal-backdrop">
      <section className="course-planner-modal" role="dialog" aria-modal="true" aria-label="Prompt Package">
        <header>
          <h2>Prompt Package</h2>
          <button type="button" onClick={onClose}>Close</button>
        </header>
        <label>
          <span>Full Prompt</span>
          <textarea readOnly value={promptPackage.prompt} />
        </label>
        <label>
          <span>Negative Constraints</span>
          <textarea readOnly value={promptPackage.negative_prompt} />
        </label>
        <div className="course-planner-keywords">
          {promptPackage.detection_keywords.map((keyword) => (
            <span key={keyword}>{keyword}</span>
          ))}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 7: Create image attempts panel**

Create `frontend/src/features/coursePlanner/components/ImageAttemptsPanel.tsx`:

```tsx
import type { ChangeEvent } from "react";
import { CheckCircle2, FileUp, LockKeyhole, Send } from "lucide-react";

import type { SceneVersion } from "../types";

type ImageAttemptsPanelProps = {
  selectedVersionId: string | null;
  versions: SceneVersion[];
  onSelectVersion: (versionId: string) => void;
  onUpload: (file: File) => Promise<void>;
  onReview: (versionId: string) => Promise<void>;
  onLock: (versionId: string) => Promise<void>;
  onImport: (versionId: string) => Promise<void>;
};

export function ImageAttemptsPanel({
  selectedVersionId,
  versions,
  onSelectVersion,
  onUpload,
  onReview,
  onLock,
  onImport,
}: ImageAttemptsPanelProps) {
  const selectedVersion = versions.find((version) => version.id === selectedVersionId) ?? versions[0] ?? null;

  return (
    <section id="attempts" className="image-attempts-panel" aria-label="Image Attempts">
      <header>
        <h2>Image Attempts</h2>
        <label className="course-planner-upload">
          <FileUp size={16} aria-hidden="true" />
          Upload Image2 Result
          <input accept="image/png,image/jpeg" type="file" onChange={(event) => void handleUpload(event, onUpload)} />
        </label>
      </header>
      <div className="image-attempt-list">
        {versions.map((version) => (
          <button
            type="button"
            className={version.id === selectedVersion?.id ? "is-active" : ""}
            key={version.id}
            onClick={() => onSelectVersion(version.id)}
          >
            <strong>{version.id}</strong>
            <span>{version.status}</span>
          </button>
        ))}
      </div>
      <div className="course-planner-actions">
        <button type="button" disabled={!selectedVersion} onClick={() => selectedVersion && void onReview(selectedVersion.id)}>
          <CheckCircle2 size={15} aria-hidden="true" />
          AI Review
        </button>
        <button type="button" disabled={!selectedVersion} onClick={() => selectedVersion && void onLock(selectedVersion.id)}>
          <LockKeyhole size={15} aria-hidden="true" />
          Lock
        </button>
        <button type="button" disabled={!selectedVersion || selectedVersion.status !== "locked"} onClick={() => selectedVersion && void onImport(selectedVersion.id)}>
          <Send size={15} aria-hidden="true" />
          Import to Pipeline
        </button>
      </div>
    </section>
  );
}

async function handleUpload(event: ChangeEvent<HTMLInputElement>, onUpload: (file: File) => Promise<void>) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (file) {
    await onUpload(file);
  }
}
```

- [ ] **Step 8: Implement ChapterWorkspacePage**

Replace `frontend/src/features/coursePlanner/pages/ChapterWorkspacePage.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";

import { TopAppBar } from "../../../app/components/TopAppBar";
import { DetectionKeywordsEditor } from "../components/DetectionKeywordsEditor";
import { ImageAttemptsPanel } from "../components/ImageAttemptsPanel";
import { PromptPackageModal } from "../components/PromptPackageModal";
import { PromptPackagePanel } from "../components/PromptPackagePanel";
import { SceneCardEditor } from "../components/SceneCardEditor";
import "../components/coursePlanner.css";
import { useCoursePlannerState } from "../hooks/useCoursePlannerState";

export function ChapterWorkspacePage() {
  const { chapterId = "" } = useParams();
  const planner = useCoursePlannerState();
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const chapter = planner.state.chapters.find((item) => item.id === chapterId) ?? null;
  const category = planner.state.spaces.find((item) => item.id === chapter?.space_id) ?? null;
  const scene = planner.state.scenes.find((item) => item.chapter_id === chapterId) ?? null;
  const keywords = planner.state.keywords.find((item) => item.chapter_id === chapterId) ?? null;
  const versions = useMemo(
    () => planner.state.versions.filter((version) => version.chapter_id === chapterId),
    [chapterId, planner.state.versions],
  );

  useEffect(() => {
    if (!chapter || !category) {
      return;
    }

    // WHY: 现有 Course Planner action 以 selectedRoute 作为后端路径来源；路由页必须把 URL 章节同步成唯一选择态，避免按钮打到默认章节。
    if (planner.selectedCourseId !== category.course_id) {
      planner.setSelectedCourseId(category.course_id);
    }
    if (planner.selectedSpaceId !== category.id) {
      planner.setSelectedSpaceId(category.id);
    }
    if (planner.selectedChapterId !== chapter.id) {
      planner.setSelectedChapterId(chapter.id);
    }
    if (planner.promptPackage && planner.promptPackage.chapter_id !== chapter.id) {
      planner.setPromptPackage(null);
    }
  }, [
    category,
    chapter,
    planner.promptPackage,
    planner.selectedChapterId,
    planner.selectedCourseId,
    planner.selectedSpaceId,
    planner.setPromptPackage,
    planner.setSelectedChapterId,
    planner.setSelectedCourseId,
    planner.setSelectedSpaceId,
  ]);

  return (
    <div className="app-shell course-planner-shell">
      <TopAppBar
        source={null}
        status={planner.status}
        title="Course Planner"
        showPipelineControls={false}
        primaryActionLabel="Refresh"
        primaryActionHelp="Reload Course Planner state"
        isPrimaryActionRunning={planner.busyAction === "load-state"}
        isPrimaryActionDisabled={planner.busyAction !== null}
        canStopCodexGeneration={false}
        isStoppingCodexGeneration={false}
        runs={[]}
        activeRunId={null}
        onUpload={() => {}}
        onPrimaryAction={() => void planner.refresh()}
        onStopCodexGeneration={() => {}}
        onSelectRun={() => {}}
        onDuplicateRun={() => {}}
        onDeleteRun={() => {}}
      />
      <main className="chapter-workspace-page">
        <header className="course-planner-page-header">
          <div>
            <Link to="/course-planner">Back to Scene Category</Link>
            <h1>Chapter: {chapter?.title_zh ?? chapterId}</h1>
            <p>{chapter?.summary_zh ?? "Chapter not found in Course Planner state."}</p>
          </div>
        </header>
        {chapter ? (
          <>
            <div className="chapter-workspace-grid">
              <SceneCardEditor
                chapterId={chapter.id}
                scene={scene}
                keywords={keywords}
                onSave={planner.saveScenePlan}
              />
              <DetectionKeywordsEditor keywords={keywords} />
              <PromptPackagePanel
                promptPackage={planner.promptPackage}
                onGenerate={planner.createPromptPackage}
                onOpen={() => setIsPromptModalOpen(true)}
              />
            </div>
            <ImageAttemptsPanel
              selectedVersionId={planner.selectedVersionId}
              versions={versions}
              onSelectVersion={planner.setSelectedVersionId}
              onUpload={planner.uploadSceneVersion}
              onReview={planner.reviewSceneVersion}
              onLock={planner.lockSceneVersion}
              onImport={planner.importSceneVersion}
            />
            <PromptPackageModal
              promptPackage={planner.promptPackage}
              isOpen={isPromptModalOpen}
              onClose={() => setIsPromptModalOpen(false)}
            />
          </>
        ) : (
          <p className="course-planner-empty">Select a valid chapter from the Scene Category Board.</p>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 9: Add workspace CSS**

Append focused workspace rules to `frontend/src/features/coursePlanner/components/coursePlanner.css`:

```css
.chapter-workspace-grid {
  display: grid;
  grid-template-columns: minmax(340px, 1fr) minmax(260px, 0.55fr) minmax(300px, 0.7fr);
  gap: 1px;
  background: #202b39;
}

.chapter-workspace-panel,
.image-attempts-panel {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: 0.62rem;
  padding: 0.82rem;
  background: #0b1119;
}

.chapter-workspace-panel header,
.image-attempts-panel header,
.course-planner-modal header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
}

.chapter-workspace-panel h2,
.image-attempts-panel h2,
.course-planner-modal h2 {
  margin: 0;
  color: #f3f7ff;
  font-size: 0.96rem;
}

.chapter-workspace-panel label,
.course-planner-modal label {
  display: grid;
  gap: 0.28rem;
}

.chapter-workspace-panel input,
.chapter-workspace-panel textarea,
.course-planner-modal textarea {
  width: 100%;
  min-width: 0;
  border: 1px solid #2c3a4e;
  border-radius: 6px;
  background: #0d1621;
  color: #edf4ff;
}

.chapter-workspace-panel input {
  height: 34px;
  padding: 0 0.55rem;
}

.chapter-workspace-panel textarea,
.course-planner-modal textarea {
  min-height: 90px;
  padding: 0.52rem;
  resize: vertical;
}

.image-attempt-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 0.42rem;
}

.image-attempt-list button {
  display: grid;
  justify-items: start;
  gap: 0.12rem;
  border-color: #263449;
  background: #0f1824;
}

.image-attempt-list button.is-active {
  border-color: #4089ff;
  background: #12243a;
}

.course-planner-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(3, 8, 14, 0.62);
}

.course-planner-modal {
  width: min(760px, calc(100vw - 2rem));
  display: grid;
  gap: 0.72rem;
  padding: 0.88rem;
  border: 1px solid #35465e;
  border-radius: 8px;
  background: #0e1722;
}

@media (max-width: 1100px) {
  .chapter-workspace-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 10: Run focused workspace test**

Run:

```powershell
cd frontend
npm test -- --run tests/coursePlanner/chapter-workspace.test.tsx
```

Expected:

```text
chapter-workspace.test.tsx passes
```

- [ ] **Step 11: Commit Task 3**

Run:

```powershell
git add frontend/src/features/coursePlanner/pages/ChapterWorkspacePage.tsx frontend/src/features/coursePlanner/components/SceneCardEditor.tsx frontend/src/features/coursePlanner/components/DetectionKeywordsEditor.tsx frontend/src/features/coursePlanner/components/PromptPackagePanel.tsx frontend/src/features/coursePlanner/components/PromptPackageModal.tsx frontend/src/features/coursePlanner/components/ImageAttemptsPanel.tsx frontend/src/features/coursePlanner/components/coursePlanner.css frontend/tests/coursePlanner/chapter-workspace.test.tsx
git commit -m "feat: add chapter workspace"
```

## Task 4: Cleanup, Regression Tests, And Final Verification

**Purpose:** Remove the wrong four-panel implementation and make sure the new route-based UI does not regress existing pipeline behavior.

**Files:**
- Remove: `frontend/src/features/coursePlanner/components/SpaceChapterModule.tsx`
- Remove: `frontend/src/features/coursePlanner/components/ChapterSceneDesignerModule.tsx`
- Remove: `frontend/src/features/coursePlanner/components/ImageAttemptReviewModule.tsx`
- Remove: `frontend/src/features/coursePlanner/components/PromptPackageDialog.tsx`
- Modify: `frontend/tests/coursePlanner/course-planner-flow.test.tsx`

- [ ] **Step 1: Remove old four-panel components**

Run:

```powershell
git rm frontend/src/features/coursePlanner/components/SpaceChapterModule.tsx frontend/src/features/coursePlanner/components/ChapterSceneDesignerModule.tsx frontend/src/features/coursePlanner/components/ImageAttemptReviewModule.tsx frontend/src/features/coursePlanner/components/PromptPackageDialog.tsx
```

- [ ] **Step 2: Rewrite Course Planner flow test**

Replace `frontend/tests/coursePlanner/course-planner-flow.test.tsx`:

```tsx
import {
  App,
  describe,
  expect,
  installFetchMock,
  it,
  jsonResponse,
  render,
  screen,
  userEvent,
  within,
} from "../app/appTestHarness";

describe("Course Planner workbench flow", () => {
  it("starts at scene category board and opens one chapter workspace", async () => {
    const user = userEvent.setup();
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/runs" && (!init || init.method === "GET")) {
        return jsonResponse({ runs: [] });
      }
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse({ source: null, elements: [], detectionVocabulary: [] });
      }
      if (input === "/api/course-planner/state" && (!init || init.method === "GET")) {
        return jsonResponse(plannerState());
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      window.history.pushState({}, "", "/course-planner");
      render(<App />);

      expect(await screen.findByRole("heading", { name: /scene category board/i })).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: /image attempt review & import/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("region", { name: /^prompt package$/i })).not.toBeInTheDocument();

      const chapterBoard = screen.getByRole("region", { name: /chapter board/i });
      await user.click(within(chapterBoard).getByRole("link", { name: /open designer/i }));

      expect(await screen.findByRole("heading", { name: /chapter: kitchen/i })).toBeInTheDocument();
      expect(screen.getByRole("region", { name: /prompt package/i })).toBeInTheDocument();
      expect(screen.getByRole("region", { name: /image attempts/i })).toBeInTheDocument();

      expect(screen.queryByText(/learning_keywords/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/priority/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/reason_zh/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/include_in_detection/i)).not.toBeInTheDocument();
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });
});

function plannerState() {
  return {
    courses: [{ id: "course_001", title_zh: "猫咪英语启蒙", app_language: "zh-CN", target_language: "en" }],
    spaces: [{ id: "space_home", course_id: "course_001", title_zh: "Home Life", target_language: "en", target_level: "A1", chapter_count: 1, storyline_mode: "parallel", space_type: "scene_category", notes: "", order: 1 }],
    chapters: [{ id: "chapter_kitchen", space_id: "space_home", order: 1, title_zh: "Kitchen", summary_zh: "Morning kitchen scene." }],
    scenes: [{ chapter_id: "chapter_kitchen", title_zh: "Kitchen", visual_brief_zh: "A bright kitchen.", image2_style: "storybook" }],
    keywords: [{ chapter_id: "chapter_kitchen", keywords: ["cup", "sink"] }],
    versions: [],
    tasks: [],
  };
}
```

- [ ] **Step 3: Search for stale layout imports and forbidden fields**

Run:

```powershell
Get-ChildItem frontend/src -Recurse -Include *.ts,*.tsx | Select-String -Pattern "SpaceChapterModule|ChapterSceneDesignerModule|ImageAttemptReviewModule|PromptPackageDialog|workbench-switcher|learning_keywords|priority|reason_zh|include_in_detection" -CaseSensitive
```

Expected:

```text
No production source matches.
```

Test files may include forbidden names only as negative assertions.

- [ ] **Step 4: Run final full verification**

Run:

```powershell
cd frontend
npm test -- --run tests/coursePlanner
npm test -- --run tests/app/app-flow-01.test.tsx
npm run build
cd ..
python -m pytest backend/tests/course_planner -q
```

Expected:

```text
Course Planner frontend tests pass
App flow 01 tests pass
Frontend build passes
Backend Course Planner tests pass
```

Allowed warnings:

```text
Vite chunk-size warning
Starlette TestClient/httpx deprecation warning
```

- [ ] **Step 5: Check line counts and diff hygiene**

Run:

```powershell
Get-ChildItem frontend/src/features/coursePlanner -Recurse -File | ForEach-Object { "$($_.FullName) $((Get-Content $_.FullName).Length)" }
git diff --check
git status --short
```

Expected:

```text
No touched source file exceeds 500 lines.
git diff --check has no whitespace errors.
Only intentional files are staged/modified.
```

- [ ] **Step 6: Commit Task 4**

Run:

```powershell
git add frontend/src frontend/tests/coursePlanner frontend/package.json frontend/package-lock.json
git commit -m "refactor: replace course planner four panel page"
```

## Final Manual Check

Start dev server:

```powershell
cd frontend
npm run dev -- --host 127.0.0.1 --port 5176
```

Open:

```text
http://127.0.0.1:5176/course-planner
```

Check:

- Product nav is beside the logo.
- Right action area contains page actions only.
- Course Planner opens at Scene Category Board.
- Scene Category cards are categories, not steps.
- Chapter cards are parallel work items.
- Opening a chapter shows one chapter workspace.
- Prompt Package is not a permanent bottom strip.
- Image Attempts is not a mandatory global step.
