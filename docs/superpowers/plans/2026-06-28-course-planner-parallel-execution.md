# Course Planner Parallel Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development plus dispatching-parallel-agents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the remaining Course Planner hierarchy implementation in parallel waves, then merge, review, and verify as one product flow.

**Architecture:** Task 1 is complete and becomes the stable backend domain/store base. The remaining work is split by write ownership and dependency wave: backend API/AI, frontend contract/state, backend import lineage, page-level UI, shared styling, and final integration. No two workers in the same wave may edit the same source or test file.

**Tech Stack:** Python backend with pytest, TypeScript/React frontend with Vitest/Testing Library, existing Course Planner feature folder, existing Pipeline visual theme.

---

## Why This Replaces Sequential Execution

The previous plan is correct as a feature checklist, but not as a parallel execution plan. It assigns shared files such as `coursePlanner.css`, `course-planner-routing.test.tsx`, and `useCoursePlannerState.ts` to multiple sequential tasks. If those tasks are dispatched in parallel without new boundaries, workers will conflict and overwrite each other.

This document does not replace the spec or implementation requirements:

- Spec remains: `docs/superpowers/specs/2026-06-28-course-planner-scene-chapter-version-design.md`
- Detailed implementation plan remains: `docs/superpowers/plans/2026-06-28-course-planner-scene-hierarchy-implementation.md`
- This plan only changes execution order and write ownership for Tasks 2-8.

## Current Baseline

Task 1 is complete:

- `69b6e579 feat: add course planner scene hierarchy models`
- `73a612c9 fix: preserve course planner hierarchy invariants`
- `5f5673b5 fix: harden course planner hierarchy store`

Verified:

```powershell
python -m pytest backend/tests/course_planner/test_models.py backend/tests/course_planner/test_store.py
```

Expected baseline result:

```text
31 passed
```

## Parallel Safety Rules

- One worker owns one write set.
- Workers must not edit files outside their write set.
- Shared CSS is not owned by page workers. Styling is handled in Wave 3.
- Shared routing tests are not owned by page workers. Routing is handled in Wave 4.
- Page workers may add stable class names and accessible labels, but not broad visual styling.
- Workers must stage and commit only their owned files.
- Every worker must report old-patch disposition for files it touched.
- If a worker needs a file owned by another active worker, it returns `NEEDS_CONTEXT` instead of editing it.

## Wave 1: Independent Contract And Backend Work

Run these workers in parallel. They have disjoint write sets.

### Worker A: Backend API And AI Contracts

**Source plan coverage:** Task 2.

**Owns:**

- `backend/art_pipeline/course_planner/routes.py`
- `backend/art_pipeline/course_planner/ai_tasks.py`
- `backend/art_pipeline/course_planner/codex_json_provider.py`
- `backend/art_pipeline/course_planner/prompt_builder.py`
- `backend/tests/course_planner/test_routes.py`
- `backend/tests/course_planner/test_ai_tasks.py`
- `backend/tests/course_planner/test_codex_json_provider.py`
- `backend/tests/course_planner/test_prompt_builder.py`
- `backend/tests/course_planner/route_test_helpers.py`

**Must not edit:**

- `backend/art_pipeline/course_planner/models.py`
- `backend/art_pipeline/course_planner/store.py`
- `backend/art_pipeline/course_planner/store_hierarchy.py`
- Frontend files.

**Work:**

- Add routes for Scene Pack, Chapter candidates, Chapter list lock/order, Prompt Versions, Prompt Package, Image Attempts.
- Update AI task schemas to emit Chapter candidates and Prompt Versions using Task 1 models.
- Remove old `ChapterCandidate` / rejected planning flow if it conflicts with the new hierarchy.
- Preserve only useful Codex JSON provider behavior.

**Verification:**

```powershell
python -m pytest backend/tests/course_planner/test_routes.py backend/tests/course_planner/test_ai_tasks.py backend/tests/course_planner/test_codex_json_provider.py backend/tests/course_planner/test_prompt_builder.py -q
```

**Commit message:**

```text
feat: expose course planner hierarchy api
```

### Worker B: Frontend Contract, API Client, And State Skeleton

**Source plan coverage:** Task 3.

**Owns:**

- `frontend/src/features/coursePlanner/types.ts`
- `frontend/src/features/coursePlanner/api.ts`
- `frontend/src/features/coursePlanner/hooks/useCoursePlannerState.ts`
- `frontend/tests/coursePlanner/course-planner-api.test.ts`
- `frontend/tests/coursePlanner/course-planner-flow.test.tsx`

**Must not edit:**

- Page components.
- UI components.
- `frontend/src/features/coursePlanner/components/coursePlanner.css`
- Routing tests.

**Work:**

- Mirror the Task 1/Worker A contract in TypeScript.
- Add frontend API methods for Scene Pack, Chapter, Prompt Version, and Image Attempt operations.
- Build a single state source for active Scene Pack, candidates, Chapters, Prompt Versions, Image Attempts, selected Chapter, selected Prompt Version, and async status.
- Keep page rendering out of this worker.

**Verification:**

```powershell
npm --prefix frontend test -- --run tests/coursePlanner/course-planner-api.test.ts tests/coursePlanner/course-planner-flow.test.tsx
```

**Commit message:**

```text
feat: align course planner frontend state hierarchy
```

### Worker C: Backend Import Lineage

**Source plan coverage:** Backend half of Task 6.

**Owns:**

- `backend/art_pipeline/course_planner/import_to_pipeline.py`
- `backend/tests/course_planner/test_import_to_pipeline.py`

**Must not edit:**

- Routes.
- AI tasks.
- Frontend files.

**Work:**

- Import one Image Attempt into Pipeline while preserving lineage:

```text
Scene Pack -> Chapter -> Prompt Version -> Image Attempt -> Pipeline asset/run
```

- Add tests that fail if lineage is dropped.

**Verification:**

```powershell
python -m pytest backend/tests/course_planner/test_import_to_pipeline.py -q
```

**Commit message:**

```text
feat: preserve course planner import lineage
```

## Wave 1 Merge Gate

After Workers A, B, and C finish:

- [ ] Review each worker diff for file ownership violations.
- [ ] Run backend contract tests:

```powershell
python -m pytest backend/tests/course_planner/test_models.py backend/tests/course_planner/test_store.py backend/tests/course_planner/test_routes.py backend/tests/course_planner/test_ai_tasks.py backend/tests/course_planner/test_codex_json_provider.py backend/tests/course_planner/test_prompt_builder.py backend/tests/course_planner/test_import_to_pipeline.py -q
```

- [ ] Run frontend contract tests:

```powershell
npm --prefix frontend test -- --run tests/coursePlanner/course-planner-api.test.ts tests/coursePlanner/course-planner-flow.test.tsx
```

Wave 2 does not start until this gate passes or the controller resolves failures.

## Wave 2: Page-Level UI In Parallel

Run these workers in parallel only after Wave 1 merge gate passes. Page workers may consume shared frontend state/API, but must not edit it.

### Worker D: Page 01 Scene Pack / Chapter Board

**Source plan coverage:** Task 4 without shared CSS.

**Owns:**

- `frontend/src/features/coursePlanner/pages/SceneCategoryBoardPage.tsx`
- `frontend/src/features/coursePlanner/components/SceneCategoryList.tsx`
- `frontend/src/features/coursePlanner/components/PlanningBriefPanel.tsx`
- `frontend/src/features/coursePlanner/components/CandidateChapterBoard.tsx`
- `frontend/src/features/coursePlanner/components/SelectedChapterSequence.tsx`
- `frontend/tests/coursePlanner/scene-category-board.test.tsx`

**Must not edit:**

- `frontend/src/features/coursePlanner/components/coursePlanner.css`
- `frontend/src/features/coursePlanner/hooks/useCoursePlannerState.ts`
- `frontend/tests/coursePlanner/course-planner-routing.test.tsx`

**Work:**

- Build Page 01 with Scene Pack list, AI Chapter candidate pool, and one Chapter list.
- Remove Candidate `Reject`, Up/Down buttons, manual Chapter Count, Target Level, and selected/locked dual list behavior from this page.
- Use modal/drawer triggers for candidate and batch revision; page-level implementation can be lightweight if the state contract is wired.

**Verification:**

```powershell
npm --prefix frontend test -- --run tests/coursePlanner/scene-category-board.test.tsx
```

**Commit message:**

```text
feat: rebuild course planner scene chapter board
```

### Worker E: Page 02 Prompt Version Designer

**Source plan coverage:** Task 5 without shared CSS/routing.

**Owns:**

- `frontend/src/features/coursePlanner/pages/ChapterWorkspacePage.tsx`
- `frontend/src/features/coursePlanner/components/PromptPackagePanel.tsx`
- `frontend/src/features/coursePlanner/components/PromptPackageModal.tsx`
- `frontend/tests/coursePlanner/chapter-workspace.test.tsx`

**Must not edit:**

- `frontend/src/features/coursePlanner/components/coursePlanner.css`
- `frontend/tests/coursePlanner/course-planner-routing.test.tsx`
- `frontend/src/features/coursePlanner/hooks/useCoursePlannerState.ts`

**Work:**

- Make 02 a multi-Prompt-Version designer.
- Open with Chapter Seed context, not empty manual fields.
- Provide version list, scene director design, object planning, prompt preview, copy actions, and upload-generated-image trigger.
- Do not render the full 03 review page inside 02.

**Verification:**

```powershell
npm --prefix frontend test -- --run tests/coursePlanner/chapter-workspace.test.tsx
```

**Commit message:**

```text
feat: add prompt version designer
```

### Worker F: Page 03 Image Attempt Review UI

**Source plan coverage:** Frontend half of Task 6 without shared routing test.

**Owns:**

- `frontend/src/features/coursePlanner/pages/ImageAttemptReviewPage.tsx`
- `frontend/src/features/coursePlanner/components/ImageAttemptsPanel.tsx`
- `frontend/tests/coursePlanner/image-attempt-review.test.tsx`

**Must not edit:**

- `frontend/src/features/coursePlanner/components/coursePlanner.css`
- `frontend/tests/coursePlanner/course-planner-routing.test.tsx`
- Backend import files.

**Work:**

- Create the 03 page for one uploaded Image Attempt.
- Show attempt history, image preview placeholder/preview, AI review, human decision, and import controls.
- Preserve lineage display: Scene Pack, Chapter, Prompt Version, Image Attempt.
- Back action returns to the same Prompt Version.

**Verification:**

```powershell
npm --prefix frontend test -- --run tests/coursePlanner/image-attempt-review.test.tsx
```

**Commit message:**

```text
feat: add image attempt review page
```

## Wave 2 Merge Gate

After Workers D, E, and F finish:

- [ ] Review each diff for ownership violations.
- [ ] Resolve any TypeScript integration gaps in the controller, not by letting workers edit each other's files.
- [ ] Run page tests together:

```powershell
npm --prefix frontend test -- --run tests/coursePlanner/scene-category-board.test.tsx tests/coursePlanner/chapter-workspace.test.tsx tests/coursePlanner/image-attempt-review.test.tsx tests/coursePlanner/course-planner-flow.test.tsx
```

Wave 3 does not start until page-level tests pass together.

## Wave 3: Shared Styling And Interaction Polish

Run one worker only. This is intentionally not parallel because it owns shared CSS and cross-page visual consistency.

### Worker G: Shared Course Planner UI Polish

**Source plan coverage:** Task 7.

**Owns:**

- `frontend/src/features/coursePlanner/components/coursePlanner.css`
- Small visual-only edits to Course Planner components touched by Workers D-F.

**Must not edit:**

- Backend files.
- API/state contracts unless a compile error proves a typo.
- Route tests.

**Work:**

- Apply Pipeline-like blue-black theme density.
- Make controls show pointer/disabled states.
- Normalize icon button treatment for add/rename/delete/open/drag.
- Ensure async buttons have visible pending/disabled/error states.
- Remove visible old labels left by page workers.
- Check responsive stacking and text wrapping.

**Verification:**

```powershell
npm --prefix frontend test -- --run tests/coursePlanner/scene-category-board.test.tsx tests/coursePlanner/chapter-workspace.test.tsx tests/coursePlanner/image-attempt-review.test.tsx
npm --prefix frontend run build
```

**Commit message:**

```text
style: polish course planner hierarchy ui
```

## Wave 4: Routing And Unified Integration

Run one integration worker or the controller. This wave owns shared route tests and final cleanup.

### Worker H: Routing, Forbidden-Concept Audit, And Full Verification

**Source plan coverage:** Task 8 plus routing portion of Tasks 5-6.

**Owns:**

- `frontend/tests/coursePlanner/course-planner-routing.test.tsx`
- Minimal route registration files if route wiring is not already complete.
- Final cleanup edits across Course Planner files only when needed to fix integration failures.

**Work:**

- Verify 01 -> 02 -> upload -> 03 route flow.
- Verify 02 back returns to selected Scene Pack context.
- Verify 03 back returns to selected Prompt Version.
- Run forbidden-concept audit.
- Run backend Course Planner tests.
- Run frontend Course Planner tests.
- Run frontend build.

**Verification:**

```powershell
rg "Target Level|Chapter Count|Category ID|Reject|Selected Sequence|Locked Chapters|\\bUp\\b|\\bDown\\b" frontend/src/features/coursePlanner backend/art_pipeline/course_planner frontend/tests/coursePlanner backend/tests/course_planner
python -m pytest backend/tests/course_planner -q
npm --prefix frontend test -- --run tests/coursePlanner
npm --prefix frontend run build
git diff --check
```

Expected:

- Forbidden terms appear only in negative assertions or old docs outside reachable implementation.
- Backend Course Planner tests pass.
- Frontend Course Planner tests pass.
- Build passes.
- No whitespace errors.

**Commit message if cleanup is needed:**

```text
chore: verify course planner hierarchy rollout
```

## Review Strategy

For every worker:

- [ ] Implementer finishes and commits.
- [ ] Spec compliance reviewer checks only that worker's scope.
- [ ] Code quality reviewer checks only that worker's scope.
- [ ] Controller integrates the commit.

For every wave:

- [ ] Controller checks file ownership.
- [ ] Controller runs the wave verification commands.
- [ ] Controller fixes only integration glue that has no active owner.

Final review:

- [ ] Dispatch one final reviewer over all Course Planner backend/frontend changes.
- [ ] If approved, use finishing-a-development-branch.

## Parallel Dispatch Matrix

```text
Wave 1: A backend API/AI | B frontend contract/state | C backend import lineage
        parallel

Gate 1: backend + frontend contract tests

Wave 2: D Page 01 | E Page 02 | F Page 03
        parallel

Gate 2: page tests together

Wave 3: G shared styling/async polish
        single worker

Wave 4: H routing + full verification
        single worker/controller
```

## Why This Is Safe

- Backend API work and frontend contract work can proceed in parallel because both are pinned to the same spec and Task 1 models.
- Page workers are parallel only after the frontend state contract exists.
- Shared CSS and routing are deliberately not parallelized.
- Import lineage is independent from routes/UI after Task 1.
- Final verification remains centralized, so parallel work still converges through one test/build gate.
