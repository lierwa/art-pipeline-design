# Course Planner Web UI Redesign

Date: 2026-06-27

## Goal

Redesign the Course Planner frontend from a single overloaded four-panel page into a route-based product area for scene category planning and per-chapter production.

The UI must reflect the real domain:

```text
Course
└─ Scene Category
   └─ Chapter[]
      ├─ Scene Card
      ├─ Detection Keywords
      ├─ Prompt Package
      ├─ Image Attempts
      └─ Import to Art Pipeline
```

This is not a linear wizard. Multiple chapters under the same scene category can be developed in parallel, and Image Attempt Review is optional until a generated image exists.

## Current Patch Disposition

The current frontend patch `f0ae366 feat: add course planner workbench` introduced useful protocol work but the UI structure is wrong.

Keep:

- `frontend/src/features/coursePlanner/api.ts`: real owner-scoped API client.
- `frontend/src/features/coursePlanner/types.ts`: real backend-aligned types.
- The useful state synchronization parts of `useCoursePlannerState`.

Rewrite or remove:

- `CoursePlannerShell` rendering all modules at once.
- `SpaceChapterModule` as a one-page sidebar form.
- `PromptPackageDialog` as a permanent bottom module.
- `ImageAttemptReviewModule` as a permanent right module.
- `coursePlanner.css` rules that encode the four-panel layout.
- Course Planner flow tests that assert four modules on one page.

Do not preserve the four-panel page by adding more conditionals or fallback states. It was based on a wrong information architecture.

## Product Navigation

Pipeline, Course Planner, and future Lesson Plan are route-level product areas. They must live beside the logo, not in the right action area.

```text
┌────────────────────────────────────────────────────────────────────┐
│ Logo  Pipeline  Course Planner  Lesson Plan              Actions   │
└────────────────────────────────────────────────────────────────────┘
```

Target routes:

```text
/pipeline
/course-planner
/course-planner/chapters/:chapterId
/lesson-plan
```

`/lesson-plan` can initially be a placeholder. It still belongs in the product navigation because the product will expand beyond art pipeline and course scene planning.

Use a mature frontend routing library for route state instead of hand-rolled path parsing. The exact package/version should be verified during implementation before lockfile changes.

## Course Planner Home

Route:

```text
/course-planner
```

Page name:

```text
Scene Category Board
```

Purpose:

- Manage scene categories under a course.
- Show chapters under the selected scene category.
- Make every chapter a parallel production work item.
- Provide clear entry points into chapter workspaces.

Layout:

```text
┌────────────────────────────────────────────────────────────────────┐
│ Course Planner / Scene Category Board                              │
│ Course: [selected course]        [New Scene Category] [Refresh]     │
├───────────────────────┬────────────────────────────────────────────┤
│ Scene Category List    │ Chapter Board                              │
│                       │                                            │
│ > Home Life            │ Kitchen                                    │
│   School               │ scene ready | 8 keywords | prompt ready    │
│   Restaurant           │ attempts 2 | import not done               │
│                       │ [Open Designer] [Attempts]                 │
│                       │                                            │
│                       │ Living Room                                │
│                       │ scene missing | 0 attempts                 │
│                       │ [Open Designer]                            │
└───────────────────────┴────────────────────────────────────────────┘
```

Terminology:

- UI says `Scene Category`.
- Current backend model `Space` maps to `Scene Category` in the frontend.
- Do not rename backend storage/schema in this redesign. A backend domain rename can be a separate migration later.

## Chapter Card

Each chapter card summarizes the production state of one concrete scene.

```text
Kitchen
summary: morning kitchen scene

Scene Card       ready
Keywords         8
Prompt Package   ready
Image Attempts   2
Pipeline Import  not imported

[Open Designer] [Attempts]
```

State derivation must use real data only:

- `scene ready`: `state.scenes` has the chapter id.
- `keywords`: count from `SceneKeywords.keywords`.
- `attempts`: count from `SceneVersion[]` for chapter id.
- `import/locked`: use existing version status where available.
- `prompt ready`: current generated prompt package if present; persistent prompt readiness can be added only when backend persists prompt packages.

No fake status, no demo status, and no learning-content fields.

## Chapter Workspace

Route:

```text
/course-planner/chapters/:chapterId
```

Purpose:

- Work on a single chapter.
- Edit scene card and detection keywords.
- Generate and copy the Image2 prompt package.
- Manage image attempts for that chapter.
- Import a locked image attempt into Art Pipeline when ready.

Layout:

```text
┌────────────────────────────────────────────────────────────────────┐
│ ← Back to Scene Category       Chapter: Kitchen                    │
│ scene ready / 8 keywords / 2 attempts                              │
├───────────────────────┬───────────────────────┬────────────────────┤
│ Scene Card             │ Detection Keywords     │ Prompt Package     │
│ title                  │ cup                    │ [Generate] [Copy]  │
│ visual brief           │ table                  │ [View Full]        │
│ image2 style           │ sink                   │                    │
│ [Save Scene]           │ ...                    │                    │
└───────────────────────┴───────────────────────┴────────────────────┘
├────────────────────────────────────────────────────────────────────┤
│ Image Attempts                                                     │
│ [Upload Image2 Result]                                             │
│ Attempt 003  reviewed / locked                                     │
│ Attempt 002  needs revision                                        │
│ Attempt 001  rejected                                              │
│ [AI Review] [Lock] [Import to Pipeline]                            │
└────────────────────────────────────────────────────────────────────┘
```

Image Attempts is a chapter sub-area, not a mandatory next step. A user can stop after generating a prompt and copy it to ChatGPT Image2.

## Prompt Package

Prompt Package is not a route-level page and not a permanent bottom module.

It belongs inside Chapter Workspace as a compact panel plus full modal.

Compact panel:

```text
Prompt Package
[Generate Prompt] [Copy Prompt] [View Full]
```

Full modal:

```text
Prompt Package
[Full Prompt] [Negative Constraints]

prompt
negative_prompt
detection_keywords
```

Only use fields supported by the backend:

- `prompt`
- `negative_prompt`
- `detection_keywords`

Do not add `learning_keywords`, `priority`, `reason_zh`, `include_in_detection`, lesson data, or vocabulary data.

## Error And Empty States

Use blocking states that explain the missing prerequisite without exposing unrelated full forms.

Examples:

```text
No course selected.
Create or select a course before creating scene categories.
```

```text
No scene category selected.
Select a scene category to view chapters.
```

```text
Scene card missing.
Open Designer to create a scene card and detection keywords.
```

These are not fallback business rules. They are UI states derived from real missing data.

## Component Structure

Target frontend structure:

```text
frontend/src/features/coursePlanner/
├─ api.ts
├─ types.ts
├─ hooks/
│  └─ useCoursePlannerState.ts
├─ pages/
│  ├─ SceneCategoryBoardPage.tsx
│  └─ ChapterWorkspacePage.tsx
├─ components/
│  ├─ SceneCategoryList.tsx
│  ├─ ChapterBoard.tsx
│  ├─ ChapterCard.tsx
│  ├─ SceneCardEditor.tsx
│  ├─ DetectionKeywordsEditor.tsx
│  ├─ PromptPackagePanel.tsx
│  ├─ PromptPackageModal.tsx
│  └─ ImageAttemptsPanel.tsx
└─ coursePlanner.css
```

Avoid adding abstract managers/coordinators. Split components by visible page responsibility and data boundary.

## Implementation Tasks

Keep this as four practical tasks, not a large set of tiny tasklets.

1. App routing and main navigation
   - Add route-level navigation beside the logo.
   - Route `/pipeline` to existing Art Pipeline.
   - Route `/course-planner` to Scene Category Board.
   - Route `/course-planner/chapters/:chapterId` to Chapter Workspace.
   - Add `/lesson-plan` placeholder.
   - Remove right-side workbench switcher.

2. Scene Category Board
   - Replace the current all-in-one Course Planner shell.
   - Show scene categories from backend `spaces`.
   - Show chapters for the selected scene category.
   - Render chapter cards with derived real status.
   - Support opening a chapter workspace.

3. Chapter Workspace
   - Move scene card, keywords, prompt package, and attempts into one per-chapter page.
   - Keep Prompt Package as panel/modal.
   - Keep Image Attempts optional and chapter-scoped.
   - Preserve real API actions: save scene, generate scene plan, build prompt, upload version, review, lock, import.

4. Tests and cleanup
   - Rewrite Course Planner flow tests around routes and chapter workspace.
   - Add main nav route tests.
   - Remove four-panel layout assertions and CSS.
   - Verify forbidden fields do not appear in Course Planner UI.
   - Run frontend tests/build and backend Course Planner tests.

## Verification Requirements

Minimum checks:

```text
cd frontend
npm test -- --run tests/coursePlanner
npm test -- --run tests/app/app-flow-01.test.tsx
npm run build
```

Backend regression:

```text
python -m pytest backend/tests/course_planner -q
```

Manual UI checks:

- Main nav appears beside logo.
- `/course-planner` starts at Scene Category Board.
- Chapter cards are the main work units.
- Opening a chapter shows only that chapter workspace.
- Prompt Package is not a permanent bottom strip.
- Image Attempts is not a mandatory global step.
