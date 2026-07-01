# Course Planner 01 and 02 UI Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair Course Planner 01 and 02 so Scene Pack, Chapter, Prompt Version, dialog, drawer, and preview interactions read as one coherent product workspace instead of flat AI-generated panels.

**Architecture:** Keep the existing data hierarchy: `Scene Pack -> Chapter -> Prompt Version -> Image Attempt`. Do not add a Scene entity and do not add backend APIs in this plan. The frontend gets one shared Course Planner chrome layer, item-scoped list actions, separated preview/edit surfaces, and a single derived readiness source for Prompt Version UI.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Testing Library, existing Radix alert-dialog/toast/tooltip, existing CSS file `frontend/src/features/coursePlanner/components/coursePlanner.css`, existing `browser:control-in-app-browser` skill for visual validation.

## Global Constraints

- Work in `/Users/guojunxi/Desktop/work/art-pipeline-design`.
- Do not scan `node_modules`.
- Do not add dependencies unless an existing package cannot cover the required behavior.
- Do not use browser native `prompt`, `confirm`, or `alert`.
- Do not alter the data hierarchy: no Chapter child Scene entity.
- Do not alter 03 Image Attempt Review in this plan.
- Do not commit unless the user explicitly asks.
- Keep modified runtime files at or below 500 lines. Split files that exceed the limit.
- Use item IDs for item actions. Do not let list actions depend on the selected item unless the button visually belongs to the selected detail header.
- Keep errors contextual: toast or inline banner, never full-page error panels or browser popups.
- Use `taste-skill` as an audit gate, not as a landing-page visual template. This is a dense product workspace, so use compact product UI patterns.
- Browser validation is required before claiming completion.

---

## Design Read and Taste Gate

Reading this as: existing dense product workspace for course/story prompt operators, with a restrained dark product UI language, leaning toward existing React/CSS components plus `taste-skill` anti-slop checks.

Dial values for this workspace:

- `DESIGN_VARIANCE: 4` because the UI must be predictable and operational.
- `MOTION_INTENSITY: 2` because motion should only communicate hover, active, drawer, and modal state.
- `VISUAL_DENSITY: 7` because this is a daily workbench, but the main preview must still be scannable.

Taste checks that apply:

- Layout must not be a pile of equal cards.
- Cards exist only for list items or meaningful preview groups.
- Dialogs are for short forms and confirmations.
- Drawers are for long edit/tune flows.
- Buttons must have clear ownership and readable contrast.
- Empty, loading, error, disabled, and pending states must be visible.
- No raw schema labels, `None` blocks, giant close buttons, or wide dead banners.
- Copy must be functional and specific.

Taste checks that do not apply:

- No landing-page hero composition.
- No generated decorative imagery.
- No Awwwards-style scroll animation.
- No large marketing typography.

## File Structure

Create:

- `frontend/src/features/coursePlanner/components/CoursePlannerChrome.tsx`
  - Owns shared page header, status badge, dialog shell, drawer shell, icon button, inline item actions.
- `frontend/src/features/coursePlanner/components/PromptVersionList.tsx`
  - Owns left Prompt Version list, radio adoption, item-scoped duplicate/revise/delete.
- `frontend/src/features/coursePlanner/components/PromptVersionPreview.tsx`
  - Owns middle scene-first read-only preview.
- `frontend/src/features/coursePlanner/components/PromptVersionEditDrawer.tsx`
  - Owns long edit/tune drawer fields and unsaved-close confirmation.
- `frontend/src/features/coursePlanner/domain/promptVersionUiState.ts`
  - Single authority for Prompt Version UI readiness.

Modify:

- `frontend/src/features/coursePlanner/pages/SceneCategoryBoardPage.tsx`
  - Use shared header and dialog shell. Remove selected-pack global actions.
- `frontend/src/features/coursePlanner/components/SceneCategoryList.tsx`
  - Move Scene Pack actions into each item.
- `frontend/src/features/coursePlanner/pages/ChapterWorkspacePage.tsx`
  - Use new list, preview, drawer, and derived readiness.
- `frontend/src/features/coursePlanner/components/PromptVersionDraftEditor.tsx`
  - Split responsibilities into new files, then either remove or reduce to orchestration under 500 lines.
- `frontend/src/features/coursePlanner/components/PromptPackagePanel.tsx`
  - Use derived readiness and legacy package guard.
- `frontend/src/features/coursePlanner/components/PromptPackageModal.tsx`
  - Use shared dialog shell.
- `frontend/src/features/coursePlanner/components/coursePlanner.css`
  - Consolidate shared primitives and remove obsolete selected/global action styles.
- `frontend/tests/coursePlanner/scene-category-board.test.tsx`
  - Protect 01 item-scoped actions, dialogs, and chapter list behavior.
- `frontend/tests/coursePlanner/chapter-workspace.test.tsx`
  - Protect 02 item-scoped actions, derived readiness, preview/edit separation, deletion fallback.
- `frontend/tests/coursePlanner/chapterWorkspaceTestHelpers.ts`
  - Add fixtures for missing cast, legacy prompt package, multiple prompt versions.

Do not modify:

- `backend/art_pipeline/course_planner/*` unless a test proves the current frontend cannot express the required state without a backend fix.
- `frontend/src/features/coursePlanner/pages/ImageAttemptReviewPage.tsx`.

## Task 1: Diff Audit and Regression Tests

**Files:**
- Modify: `frontend/tests/coursePlanner/scene-category-board.test.tsx`
- Modify: `frontend/tests/coursePlanner/chapter-workspace.test.tsx`
- Modify: `frontend/tests/coursePlanner/chapterWorkspaceTestHelpers.ts`

**Interfaces:**
- Consumes: existing route/page components and fetch mock helpers.
- Produces: failing tests that define the desired 01/02 interaction contract before implementation.

- [ ] **Step 1: Record current diff classification in the implementation notes**

Run:

```bash
git status --short
git diff --stat
```

Expected:

```text
Current Course Planner frontend and backend files are dirty.
Do not revert unrelated backend prompt-chain changes.
This plan only changes frontend UI unless a frontend test proves a backend contract gap.
```

- [ ] **Step 2: Add 01 tests for item-scoped Scene Pack actions**

Add or update tests in `frontend/tests/coursePlanner/scene-category-board.test.tsx`:

```tsx
it("renders Scene Pack actions inside each pack item and removes the selected-pack action panel", async () => {
  render(<SceneCategoryBoardPage />);

  const pack = await screen.findByRole("group", { name: /Scene Pack 室内家庭篇/ });
  expect(within(pack).getByRole("button", { name: /Edit/i })).toBeVisible();
  expect(within(pack).getByRole("button", { name: /Archive/i })).toBeVisible();
  expect(within(pack).getByRole("button", { name: /Delete/i })).toBeVisible();
  expect(screen.queryByText(/Selected pack/i)).not.toBeInTheDocument();
});
```

Expected initial result before implementation:

```text
FAIL because the old selected-pack action panel or unscoped actions are still visible.
```

- [ ] **Step 3: Add 01 tests for compact Edit Scene Pack dialog**

Add:

```tsx
it("uses the shared compact dialog for editing a Scene Pack", async () => {
  const user = userEvent.setup();
  render(<SceneCategoryBoardPage />);

  const pack = await screen.findByRole("group", { name: /Scene Pack 室内家庭篇/ });
  await user.click(within(pack).getByRole("button", { name: /Edit/i }));

  const dialog = screen.getByRole("dialog", { name: /Edit Scene Pack/i });
  expect(dialog).toHaveClass("course-planner-dialog");
  expect(within(dialog).getByRole("button", { name: /Close/i })).toHaveClass("course-planner-icon-button");
  expect(within(dialog).getByLabelText(/Scene Pack title/i)).toBeVisible();
  expect(within(dialog).getByLabelText(/Scene Pack intent/i)).toBeVisible();
  expect(within(dialog).getByRole("button", { name: /Cancel/i })).toBeVisible();
  expect(within(dialog).getByRole("button", { name: /Save Scene Pack/i })).toBeVisible();
});
```

Expected initial result before implementation:

```text
FAIL if the title still says Rename Scene Pack, the close control is oversized, or footer actions are not shared.
```

- [ ] **Step 4: Add 02 tests for item-scoped Prompt Version actions**

Add:

```tsx
it("keeps Duplicate, AI revise, and Delete scoped to the clicked Prompt Version item", async () => {
  const user = userEvent.setup();
  const duplicatePromptVersion = vi.fn(async () => jsonResponse({ promptVersion: promptVersion({ id: "prompt_version_copy" }) }));
  const revisePromptVersion = vi.fn(async () => jsonResponse({ promptVersion: promptVersion({ id: "prompt_version_revised" }) }));
  const deletePromptVersion = vi.fn(async () => jsonResponse({ promptVersion: promptVersion({ id: "prompt_version_002", status: "archived" }) }));

  installChapterWorkspaceFetchMock({
    state: coursePlannerState({
      promptVersions: [
        promptVersion({ id: "prompt_version_001", versionLabel: "V001", title: "早餐厨房构图" }),
        promptVersion({ id: "prompt_version_002", versionLabel: "V002", title: "早餐厨房变体" }),
      ],
      selectedPromptVersionId: "prompt_version_001",
    }),
    duplicatePromptVersion,
    createPromptVersion: revisePromptVersion,
    deletePromptVersion,
  });

  render(<ChapterWorkspacePage />);

  const v002 = await screen.findByRole("group", { name: /V002 早餐厨房变体/ });
  await user.click(within(v002).getByRole("button", { name: /Duplicate/i }));
  expect(duplicatePromptVersion).toHaveBeenCalledWith(
    expect.stringContaining("/prompt-versions/prompt_version_002/duplicate"),
    expect.objectContaining({ method: "POST" }),
  );

  await user.click(within(v002).getByRole("button", { name: /AI revise/i }));
  expect(await screen.findByRole("complementary", { name: /Revise V002/i })).toBeVisible();

  await user.click(within(v002).getByRole("button", { name: /Delete/i }));
  expect(deletePromptVersion).toHaveBeenCalledWith(
    expect.stringContaining("/prompt-versions/prompt_version_002"),
    expect.objectContaining({ method: "DELETE" }),
  );
});
```

Expected initial result before implementation:

```text
FAIL if actions still use selectedVersion instead of the clicked item id.
```

- [ ] **Step 5: Add 02 tests for preview/edit separation**

Add:

```tsx
it("shows a scene-first read-only preview and opens editing only in a drawer", async () => {
  const user = userEvent.setup();
  installChapterWorkspaceFetchMock({
    state: coursePlannerState({ promptVersions: [promptVersion()], selectedPromptVersionId: "prompt_version_001" }),
  });

  render(<ChapterWorkspacePage />);

  const preview = await screen.findByRole("region", { name: /Scene Intent Preview/i });
  expect(within(preview).queryByRole("textbox")).not.toBeInTheDocument();
  expect(within(preview).getByText(/核心画面/)).toBeVisible();
  expect(within(preview).getByText(/角色 IP/)).toBeVisible();
  expect(within(preview).getByText(/镜头与空间/)).toBeVisible();
  expect(within(preview).getByText(/可选词与约束/)).toBeVisible();
  expect(screen.queryByText(/^Scene Vocabulary$/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/^None$/)).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /Edit design/i }));
  expect(await screen.findByRole("complementary", { name: /Edit Prompt Version/i })).toBeVisible();
  expect(screen.getAllByRole("textbox").length).toBeGreaterThan(0);
});
```

Expected initial result before implementation:

```text
FAIL if the main preview still uses textarea fields or renders Scene Vocabulary as a large standalone panel.
```

- [ ] **Step 6: Add 02 tests for Needs tuning readiness**

Add:

```tsx
it("derives Needs tuning everywhere when cast bindings are missing", async () => {
  const noCast = promptVersion({ castBindings: [], status: "prompt_ready" });
  installChapterWorkspaceFetchMock({
    state: coursePlannerState({ promptVersions: [noCast], selectedPromptVersionId: "prompt_version_001" }),
  });

  render(<ChapterWorkspacePage />);

  expect(await screen.findByText(/Needs tuning/i)).toBeVisible();
  expect(screen.getByRole("status", { name: /Prompt tuning required/i })).toBeVisible();
  expect(screen.getByRole("button", { name: /Generate/i })).toBeDisabled();
  expect(screen.getByRole("button", { name: /Copy full prompt/i })).toBeDisabled();
  expect(screen.getByRole("button", { name: /Upload generated image/i })).toBeDisabled();
  expect(screen.queryByText(/小学生|孩子|家长|student|child|parent/i)).not.toBeInTheDocument();
});
```

Expected initial result before implementation:

```text
FAIL if backend prompt_ready still appears as ready without role IP, or old generic human-role copy leaks into the preview.
```

- [ ] **Step 7: Run focused tests and confirm they fail**

Run:

```bash
cd frontend
npm test -- --run tests/coursePlanner/scene-category-board.test.tsx tests/coursePlanner/chapter-workspace.test.tsx
```

Expected:

```text
At least the newly added tests fail.
Existing unrelated Course Planner tests may pass or fail based on current dirty state.
Do not implement until the new tests prove the current UI is wrong.
```

## Task 2: Shared Course Planner UI Primitives

**Files:**
- Create: `frontend/src/features/coursePlanner/components/CoursePlannerChrome.tsx`
- Modify: `frontend/src/features/coursePlanner/components/coursePlanner.css`
- Modify: `frontend/src/features/coursePlanner/components/PromptPackageModal.tsx`

**Interfaces:**
- Produces:
  - `CoursePlannerPageHeader(props)`
  - `CoursePlannerStatusBadge(props)`
  - `CoursePlannerDialog(props)`
  - `CoursePlannerDrawer(props)`
  - `InlineItemActions(props)`
- Consumes: existing CSS variables and existing React components.

- [ ] **Step 1: Create shared component file with stable interfaces**

Create `frontend/src/features/coursePlanner/components/CoursePlannerChrome.tsx` with these exported types:

```tsx
import type { ReactNode } from "react";

export type CoursePlannerStatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export type CoursePlannerStatusBadgeProps = {
  label: string;
  tone?: CoursePlannerStatusTone;
};

export type CoursePlannerPageHeaderProps = {
  backAction?: ReactNode;
  eyebrow?: string;
  title: string;
  description?: string | null;
  status?: ReactNode;
  actions?: ReactNode;
};

export type CoursePlannerDialogProps = {
  title: string;
  description?: string;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

export type CoursePlannerDrawerProps = {
  title: string;
  description?: string;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

export type InlineItemAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  icon?: ReactNode;
};

export type InlineItemActionsProps = {
  actions: InlineItemAction[];
  ariaLabel: string;
};
```

Implementation requirements:

- Header root uses class `course-planner-page-header`.
- Dialog panel uses class `course-planner-dialog` and `role="dialog"`.
- Drawer panel uses class `course-planner-drawer` and `role="complementary"`.
- Close button uses class `course-planner-icon-button`, label `Close`.
- Footer uses class `course-planner-dialog-footer` or `course-planner-drawer-footer`.
- Inline actions root uses class `course-planner-inline-actions`.

- [ ] **Step 2: Add CSS primitives**

Add CSS selectors:

```css
.course-planner-page-header {
  min-height: 96px;
  display: grid;
  grid-template-columns: minmax(160px, 1fr) minmax(280px, 2fr) minmax(160px, 1fr);
  align-items: center;
  gap: 24px;
  padding: 20px 24px;
  border-bottom: 1px solid var(--course-border-subtle);
}

.course-planner-page-header__center {
  min-width: 0;
}

.course-planner-page-header__title {
  margin: 0;
  font-size: 1.25rem;
  line-height: 1.15;
  font-weight: 700;
  text-wrap: balance;
}

.course-planner-page-header__description {
  margin: 6px 0 0;
  max-width: 68ch;
  color: var(--course-text-muted);
  line-height: 1.45;
}

.course-planner-status-badge {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--course-border-strong);
  font-size: 0.8rem;
  font-weight: 700;
  white-space: nowrap;
}

.course-planner-dialog,
.course-planner-drawer {
  background: var(--course-surface);
  border: 1px solid var(--course-border-strong);
  color: var(--course-text);
}

.course-planner-dialog-footer,
.course-planner-drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 16px;
  border-top: 1px solid var(--course-border-subtle);
}

.course-planner-inline-actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(104px, 1fr));
  gap: 8px;
}
```

Adjust selectors to match existing CSS token names. If a token is missing, add it once near the Course Planner token block.

- [ ] **Step 3: Update PromptPackageModal to use CoursePlannerDialog**

Replace custom modal shell with `CoursePlannerDialog`. The modal must keep:

- `View Prompt Package` entry behavior.
- Full prompt, short prompt, negative constraints, revision prompt sections.
- Compact close button.
- Footer with one right-aligned `Close` action.

- [ ] **Step 4: Run primitive smoke tests**

Run:

```bash
cd frontend
npm test -- --run tests/coursePlanner/chapter-workspace.test.tsx tests/coursePlanner/scene-category-board.test.tsx
```

Expected:

```text
Tests may still fail for page-specific behavior.
No TypeScript or render crash from the new shared primitives.
```

## Task 3: 01 Scene Pack and Chapter Board Interaction Cleanup

**Files:**
- Modify: `frontend/src/features/coursePlanner/pages/SceneCategoryBoardPage.tsx`
- Modify: `frontend/src/features/coursePlanner/components/SceneCategoryList.tsx`
- Modify: `frontend/src/features/coursePlanner/components/SelectedChapterSequence.tsx`
- Modify: `frontend/src/features/coursePlanner/components/coursePlanner.css`
- Modify: `frontend/tests/coursePlanner/scene-category-board.test.tsx`

**Interfaces:**
- Consumes: `CoursePlannerPageHeader`, `CoursePlannerDialog`, `CoursePlannerStatusBadge`, `InlineItemActions`.
- Produces: 01 board with item-owned Scene Pack actions and compact edit/create/delete flows.

- [ ] **Step 1: Replace board header**

In `SceneCategoryBoardPage.tsx`, render:

```tsx
<CoursePlannerPageHeader
  title="Scene Pack / Chapter Board"
  description={activeScenePack?.title ?? "Select a Scene Pack to start Chapter planning."}
  status={<CoursePlannerStatusBadge label={operationLabel} tone={operationTone} />}
/>
```

Requirements:

- `operationLabel` returns `Ready`, `Working`, or `Error`.
- Do not show raw lowercase `ready`, `working`, or `error`.
- Header must not exceed a normal toolbar height.

- [ ] **Step 2: Move Scene Pack actions into each item**

In `SceneCategoryList.tsx`, each pack must be an `article` or `li` with:

```tsx
<article role="group" aria-label={`Scene Pack ${pack.title}`} className="scene-pack-card">
  <button type="button" className="scene-pack-card__body" onClick={() => onSelect(pack.id)}>
    <span className="scene-pack-card__title">{pack.title}</span>
    <span className="scene-pack-card__intent">{pack.intent}</span>
    <span className="scene-pack-card__meta">{chapterCount} accepted Chapters · {pack.status}</span>
  </button>
  <InlineItemActions
    ariaLabel={`Scene Pack actions for ${pack.title}`}
    actions={[
      { label: "Edit", onClick: () => onEdit(pack) },
      { label: "Archive", onClick: () => onArchive(pack), disabled: pack.status === "archived" },
      { label: "Delete", onClick: () => onDelete(pack), destructive: true },
    ]}
  />
</article>
```

Requirements:

- Remove the separate selected pack panel.
- `Edit`, `Archive`, and `Delete` receive the clicked pack object.
- Pack body click only selects the pack.
- Actions must not trigger pack selection through event bubbling.

- [ ] **Step 3: Rename and compact the edit dialog**

In `SceneCategoryBoardPage.tsx`:

- Rename `Rename Scene Pack` to `Edit Scene Pack`.
- The edit dialog includes title, intent, and notes.
- The create dialog reuses the same shell.
- Footer is right-aligned `Cancel / Save Scene Pack`.
- Close is compact and does not look like a large content button.

The dialog body shape:

```tsx
<CoursePlannerDialog
  title={editorMode === "create" ? "Create Scene Pack" : "Edit Scene Pack"}
  description="Set the theme and intent used for Chapter candidate generation."
  isOpen={editorState !== null}
  onClose={closeScenePackEditor}
  footer={...}
>
  <label className="course-planner-field">
    <span>Scene Pack title</span>
    <input value={title} onChange={...} />
  </label>
  <label className="course-planner-field">
    <span>Scene Pack intent</span>
    <textarea rows={3} value={intent} onChange={...} />
  </label>
  <label className="course-planner-field">
    <span>Scene Pack notes</span>
    <textarea rows={4} value={notes} onChange={...} />
  </label>
</CoursePlannerDialog>
```

- [ ] **Step 4: Keep candidate pool and accepted list as distinct work areas**

Middle panel rules:

- Candidate pool displays generated candidates only.
- Candidate item actions are `Accept`, `Edit`, `Delete`.
- Batch actions stay near pool heading: `Generate`, `More`, `Revise batch`.
- Empty candidate state is one compact dashed block.

Right panel rules:

- Chapter List is the only accepted chapter list.
- Accepted item actions are `Open Designer` and `Delete`.
- `Lock Chapter List` is a right-panel command, not a second list.

- [ ] **Step 5: Remove obsolete CSS**

Delete or stop using:

- `.scene-pack-actions`
- `.selected-pack`
- any style that makes global selected actions appear as a large panel.

Keep or rewrite styles that protect:

- hover state
- focus state
- disabled state
- selected item state
- destructive action state

- [ ] **Step 6: Run 01 focused tests**

Run:

```bash
cd frontend
npm test -- --run tests/coursePlanner/scene-category-board.test.tsx
```

Expected:

```text
All SceneCategoryBoard tests pass.
No browser prompt, confirm, or alert usage appears in the tested flow.
```

## Task 4: 02 Prompt Version List, Adoption, and Delete Fallback

**Files:**
- Create: `frontend/src/features/coursePlanner/components/PromptVersionList.tsx`
- Create: `frontend/src/features/coursePlanner/domain/promptVersionUiState.ts`
- Modify: `frontend/src/features/coursePlanner/pages/ChapterWorkspacePage.tsx`
- Modify: `frontend/src/features/coursePlanner/components/coursePlanner.css`
- Modify: `frontend/tests/coursePlanner/chapter-workspace.test.tsx`
- Modify: `frontend/tests/coursePlanner/chapterWorkspaceTestHelpers.ts`

**Interfaces:**
- Produces:
  - `derivePromptVersionUiState(version: PromptVersion | null): PromptVersionUiState`
  - `PromptVersionList(props)`
- Consumes: existing chapter, prompt version, and API handlers from `ChapterWorkspacePage`.

- [ ] **Step 1: Create single derived UI state helper**

Create `frontend/src/features/coursePlanner/domain/promptVersionUiState.ts`:

```ts
import type { PromptVersion } from "../types";

export type PromptVersionUiStateKey =
  | "empty"
  | "needs_tuning"
  | "prompt_ready"
  | "adopted"
  | "archived"
  | "draft";

export type PromptVersionUiState = {
  key: PromptVersionUiStateKey;
  label: string;
  tone: "neutral" | "info" | "success" | "warning" | "danger";
  canGeneratePrompt: boolean;
  canCopyPrompt: boolean;
  canUploadImage: boolean;
  reason?: string;
};

export function hasCastBindings(version: PromptVersion | null): boolean {
  return Boolean(version?.castBindings && version.castBindings.length > 0);
}

export function isLegacyPromptPackage(version: PromptVersion | null): boolean {
  const fullPrompt = version?.promptPackage?.fullPrompt ?? "";
  return /Scene Director Plan:|Object Plan:|required_objects|core_objects/i.test(fullPrompt);
}

export function derivePromptVersionUiState(version: PromptVersion | null): PromptVersionUiState {
  if (!version) {
    return {
      key: "empty",
      label: "No version",
      tone: "neutral",
      canGeneratePrompt: false,
      canCopyPrompt: false,
      canUploadImage: false,
    };
  }
  if (version.status === "archived") {
    return {
      key: "archived",
      label: "Archived",
      tone: "neutral",
      canGeneratePrompt: false,
      canCopyPrompt: false,
      canUploadImage: false,
      reason: "Archived versions cannot generate or upload images.",
    };
  }
  if (!hasCastBindings(version)) {
    return {
      key: "needs_tuning",
      label: "Needs tuning",
      tone: "warning",
      canGeneratePrompt: false,
      canCopyPrompt: false,
      canUploadImage: false,
      reason: "Add role IP and reference images before generating the final Image2 prompt.",
    };
  }
  if (version.status === "adopted") {
    return {
      key: "adopted",
      label: "Adopted",
      tone: "success",
      canGeneratePrompt: true,
      canCopyPrompt: !isLegacyPromptPackage(version),
      canUploadImage: !isLegacyPromptPackage(version),
    };
  }
  if (version.status === "prompt_ready") {
    return {
      key: "prompt_ready",
      label: "Prompt ready",
      tone: "success",
      canGeneratePrompt: true,
      canCopyPrompt: !isLegacyPromptPackage(version),
      canUploadImage: !isLegacyPromptPackage(version),
    };
  }
  return {
    key: "draft",
    label: "Draft",
    tone: "info",
    canGeneratePrompt: true,
    canCopyPrompt: false,
    canUploadImage: false,
  };
}
```

Requirements:

- This file is the single frontend authority for readiness.
- No component should independently decide that `prompt_ready` is enough.

- [ ] **Step 2: Create PromptVersionList component**

Create `frontend/src/features/coursePlanner/components/PromptVersionList.tsx` with props:

```tsx
import type { PromptVersion } from "../types";

export type PromptVersionListProps = {
  versions: PromptVersion[];
  selectedVersionId: string | null;
  adoptedVersionId: string | null;
  pendingVersionId?: string | null;
  onSelectVersion: (versionId: string) => void;
  onAdoptVersion: (versionId: string) => void;
  onDuplicateVersion: (versionId: string) => void;
  onReviseVersion: (versionId: string) => void;
  onDeleteVersion: (versionId: string) => void;
  onCreateVersion: () => void;
};
```

Rendering requirements:

- `New` button lives in the list header.
- Each version item is `role="group"` with name `${version.versionLabel} ${version.title}`.
- Radio uses `aria-label={`Adopt ${version.versionLabel}`}`.
- Item body click selects that version.
- Actions are inside the item and call handlers with that item id.
- Adopted is shown next to version metadata, not inside an actions menu.

- [ ] **Step 3: Wire deletion fallback in ChapterWorkspacePage**

After successful delete:

- Remove deleted version from local state.
- If deleted version was selected, select:
  1. adopted remaining version,
  2. otherwise the nearest remaining version by list order,
  3. otherwise `null`.
- If no versions remain, middle and right panels show empty states.

Add helper inside `ChapterWorkspacePage.tsx` or a small domain helper:

```ts
function pickNextPromptVersionId(
  versions: PromptVersion[],
  deletedVersionId: string,
  adoptedVersionId: string | null,
): string | null {
  const remaining = versions.filter((version) => version.id !== deletedVersionId);
  if (remaining.length === 0) return null;
  const adopted = adoptedVersionId ? remaining.find((version) => version.id === adoptedVersionId) : null;
  if (adopted) return adopted.id;
  const deletedIndex = versions.findIndex((version) => version.id === deletedVersionId);
  const fallbackIndex = Math.min(Math.max(deletedIndex, 0), remaining.length - 1);
  return remaining[fallbackIndex]?.id ?? remaining[0]?.id ?? null;
}
```

- [ ] **Step 4: Confirm before deleting adopted version**

If `version.id === adoptedVersionId`, use the existing confirmation component or shared `CoursePlannerDialog`:

Dialog title:

```text
Delete adopted Prompt Version
```

Dialog body:

```text
Deleting this version leaves the Chapter without an adopted Prompt Version.
```

Footer:

```text
Cancel / Delete version
```

- [ ] **Step 5: Run list-focused tests**

Run:

```bash
cd frontend
npm test -- --run tests/coursePlanner/chapter-workspace.test.tsx
```

Expected:

```text
Prompt Version item action tests pass.
Adopted radio behaves as a single-choice state.
Deleting selected/adopted versions updates list, middle preview, and right prompt preview.
```

## Task 5: 02 Scene-First Preview and Drawer Editing

**Files:**
- Create: `frontend/src/features/coursePlanner/components/PromptVersionPreview.tsx`
- Create: `frontend/src/features/coursePlanner/components/PromptVersionEditDrawer.tsx`
- Modify: `frontend/src/features/coursePlanner/components/PromptVersionDraftEditor.tsx`
- Modify: `frontend/src/features/coursePlanner/pages/ChapterWorkspacePage.tsx`
- Modify: `frontend/src/features/coursePlanner/components/coursePlanner.css`
- Modify: `frontend/tests/coursePlanner/chapter-workspace.test.tsx`

**Interfaces:**
- Consumes: `PromptVersion`, `Chapter`, `derivePromptVersionUiState`, `CoursePlannerDrawer`.
- Produces: middle read-only scene-first preview and drawer-based editing/tuning.

- [ ] **Step 1: Create PromptVersionPreview props**

Create:

```tsx
import type { PromptVersion } from "../types";
import type { PromptVersionUiState } from "../domain/promptVersionUiState";

export type PromptVersionPreviewProps = {
  version: PromptVersion | null;
  uiState: PromptVersionUiState;
  onTunePrompt: () => void;
  onEditDesign: () => void;
};
```

Rendering rules:

- Root is `role="region"` and `aria-label="Scene Intent Preview"`.
- No textareas or inputs in this component.
- No `Scene Vocabulary` heading.
- No visible `None` for empty blocks.
- Missing cast bindings render one compact blocking banner:

```tsx
<div role="status" aria-label="Prompt tuning required" className="course-planner-blocking-banner">
  先录入角色 IP 和参考图，再生成最终 Image2 prompt。
</div>
```

Preview group labels:

- `核心画面`
- `角色 IP`
- `镜头与空间`
- `可选词与约束`

- [ ] **Step 2: Suppress invalid legacy generic role copy**

In preview:

- If `uiState.key === "needs_tuning"`, do not show old character copy containing generic human terms.
- Keep story event only if it does not include `小学生`, `孩子`, `家长`, `student`, `child`, or `parent`.
- Do not mutate the stored data in this task. Only hide invalid preview content and prompt the user to tune.

Add helper:

```ts
const GENERIC_HUMAN_ROLE_PATTERN = /小学生|孩子|家长|student|child|parent/i;

function canShowSceneText(uiState: PromptVersionUiState, text: string | null | undefined): boolean {
  if (!text) return false;
  if (uiState.key !== "needs_tuning") return true;
  return !GENERIC_HUMAN_ROLE_PATTERN.test(text);
}
```

- [ ] **Step 3: Render vocabulary as compact chips**

Rules:

- `narrativeAnchors` are story-critical anchors, not a full object layout.
- `optionalVocabularyCandidates` are optional words and must not read as required objects.
- `ambientFurnishingPolicy` is one sentence, hidden if empty.
- `avoidObjects` are compact chips.
- Do not project old `objectPlan` into the main preview as the source of truth.

Example:

```tsx
<section className="prompt-preview-section" aria-label="可选词与约束">
  <PreviewChipGroup label="叙事锚点" items={version.sceneVocabulary?.narrativeAnchors ?? []} />
  <PreviewChipGroup label="可选词池" items={version.sceneVocabulary?.optionalVocabularyCandidates ?? []} />
  {version.sceneVocabulary?.ambientFurnishingPolicy ? (
    <PreviewFact label="环境补足策略" value={version.sceneVocabulary.ambientFurnishingPolicy} />
  ) : null}
  <PreviewChipGroup label="禁止项" items={version.sceneVocabulary?.avoidObjects ?? []} tone="danger" />
</section>
```

- [ ] **Step 4: Create PromptVersionEditDrawer**

Props:

```tsx
import type { PromptVersion } from "../types";

export type PromptVersionEditDrawerMode = "design" | "tune" | "revise";

export type PromptVersionEditDrawerProps = {
  mode: PromptVersionEditDrawerMode;
  version: PromptVersion | null;
  isOpen: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSave: (patch: Partial<PromptVersion>) => void;
  onSubmitRevision?: (feedback: string) => void;
};
```

Drawer group rules:

- `design` mode groups:
  - Story
  - Composition and space
  - Characters and action
  - Vocabulary and constraints
- `tune` mode groups:
  - Role IP bindings
  - Reference images
  - Style anchor
  - Prompt constraints
- `revise` mode:
  - Title format: `Revise V002 / 清晨客厅整理`
  - One feedback textarea
  - Submit button label: `Submit AI revise`

Unsaved close:

- Keep a draft snapshot when drawer opens.
- If current draft differs from snapshot, open confirmation dialog.
- Confirmation text:

```text
Discard unsaved changes?
```

Footer:

```text
Cancel / Discard changes
```

- [ ] **Step 5: Reduce PromptVersionDraftEditor**

After moving preview and drawer code:

- `PromptVersionDraftEditor.tsx` either becomes a small orchestration component or is removed from active imports.
- Runtime file line count must be at or below 500.
- If it remains, it owns only draft state conversion and calls `PromptVersionPreview` and `PromptVersionEditDrawer`.

Run:

```bash
wc -l frontend/src/features/coursePlanner/components/PromptVersionDraftEditor.tsx frontend/src/features/coursePlanner/components/PromptVersionPreview.tsx frontend/src/features/coursePlanner/components/PromptVersionEditDrawer.tsx
```

Expected:

```text
Each runtime file is 500 lines or fewer.
```

- [ ] **Step 6: Run preview and drawer tests**

Run:

```bash
cd frontend
npm test -- --run tests/coursePlanner/chapter-workspace.test.tsx
```

Expected:

```text
Preview/edit separation tests pass.
Needs tuning tests pass.
No main preview textbox exists.
```

## Task 6: Right Prompt Preview, Legacy Guard, and Shared Readiness

**Files:**
- Modify: `frontend/src/features/coursePlanner/components/PromptPackagePanel.tsx`
- Modify: `frontend/src/features/coursePlanner/components/PromptPackageModal.tsx`
- Modify: `frontend/src/features/coursePlanner/pages/ChapterWorkspacePage.tsx`
- Modify: `frontend/tests/coursePlanner/chapter-workspace.test.tsx`

**Interfaces:**
- Consumes: `derivePromptVersionUiState`.
- Produces: right prompt preview that cannot generate, copy, or upload when tuning is missing or package is legacy.

- [ ] **Step 1: Use derived readiness in PromptPackagePanel**

`PromptPackagePanel` receives or computes:

```ts
const uiState = derivePromptVersionUiState(selectedPromptVersion);
```

Disable:

- Generate when `!uiState.canGeneratePrompt`.
- Copy when `!uiState.canCopyPrompt`.
- Upload when `!uiState.canUploadImage`.

When `uiState.key === "needs_tuning"` show:

```text
先录入角色 IP 和参考图，再生成最终 Image2 prompt。
```

When package is legacy show:

```text
旧版 Prompt Package 使用内部 schema 标签，请重新生成。
```

- [ ] **Step 2: Block legacy copy and upload**

If `isLegacyPromptPackage(version)` is true:

- Hide full prompt text from preview.
- Disable copy.
- Disable upload.
- Keep `Generate/Refresh Prompt` enabled if cast bindings exist.

- [ ] **Step 3: Sync header, list, middle, and right status**

In `ChapterWorkspacePage.tsx`:

- Page header status uses selected version `uiState` when a version is selected.
- Version item status uses the same `uiState`.
- Middle preview uses the same `uiState`.
- Right prompt preview uses the same `uiState`.

Do not duplicate readiness logic in multiple files.

- [ ] **Step 4: Run prompt preview tests**

Run:

```bash
cd frontend
npm test -- --run tests/coursePlanner/chapter-workspace.test.tsx
```

Expected:

```text
Needs tuning disables generate/copy/upload.
Legacy package disables copy/upload and displays regeneration message.
Readiness labels match across page header, list, preview, and right panel.
```

## Task 7: Visual QA, Taste Audit, and Final Verification

**Files:**
- Modify only if browser QA finds a concrete visual issue:
  - `frontend/src/features/coursePlanner/components/coursePlanner.css`
  - relevant component file under `frontend/src/features/coursePlanner/`

**Interfaces:**
- Consumes: completed Task 1-6 implementation.
- Produces: verified screenshots and final pass/fail audit.

- [ ] **Step 1: Run full frontend Course Planner tests**

Run:

```bash
cd frontend
npm test -- --run tests/coursePlanner
```

Expected:

```text
All Course Planner tests pass.
```

- [ ] **Step 2: Run frontend build**

Run:

```bash
cd frontend
npm run build
```

Expected:

```text
tsc and Vite build complete successfully.
Only existing chunk-size warnings are acceptable.
No CSS syntax warning is acceptable.
```

- [ ] **Step 3: Check runtime file sizes**

Run:

```bash
wc -l frontend/src/features/coursePlanner/components/*.tsx frontend/src/features/coursePlanner/pages/*.tsx frontend/src/features/coursePlanner/domain/*.ts
```

Expected:

```text
No modified runtime file exceeds 500 lines.
If an unmodified existing file exceeds 500 lines, do not expand it further.
```

- [ ] **Step 4: Start local dev server**

Run:

```bash
cd frontend
npm run dev -- --host 127.0.0.1
```

Expected:

```text
Vite prints a local URL, usually http://127.0.0.1:5173/.
If port 5173 is busy, use the Vite-provided port.
Keep this terminal session open until browser QA is complete.
```

- [ ] **Step 5: Browser validation for 01**

Use `browser:control-in-app-browser` to open the Vite URL at the Course Planner route.

Validate desktop viewport around `1440x900`:

- Header height is compact and not a giant empty band.
- Left Scene Pack list has no `Selected pack` action panel.
- Each Scene Pack item owns `Edit / Archive / Delete`.
- Create/Edit Scene Pack dialog is compact.
- Close control is small.
- Footer actions are right aligned.
- Candidate pool and Chapter List are visually distinct.
- No browser-native dialog appears.
- No giant error panel appears for normal empty states.

Validate narrow viewport around `390x844`:

- Header content wraps without overlap.
- Columns collapse into a usable single-column or stacked layout.
- Item action buttons do not wrap into unreadable text.
- Dialog fits the viewport and scrolls internally if needed.

- [ ] **Step 6: Browser validation for 02**

Use the same browser session to open a Chapter Designer route.

Validate desktop viewport around `1440x900`:

- Left Prompt Version items own radio, duplicate, AI revise, delete.
- There is no global `Version actions` panel.
- Adopted behaves visually like a single-choice state.
- Middle preview has no textarea.
- Middle preview has exactly these main information groups: `核心画面`, `角色 IP`, `镜头与空间`, `可选词与约束`.
- Missing role IP shows one compact blocking banner.
- No `Scene Vocabulary` large panel appears.
- No `None` empty card appears.
- Right prompt preview uses the same readiness as the header and list.
- `Needs tuning` disables generate, copy, and upload.
- Tune/Edit/AI revise drawers are readable and not oversized.

Validate narrow viewport around `390x844`:

- The left list, middle preview, and right prompt preview stack without horizontal overflow.
- Drawer covers a sane width and has a compact close control.
- Long text does not overlap adjacent controls.
- Buttons remain one-line where possible. If a Chinese label wraps, the button height must remain stable and readable.

- [ ] **Step 7: Apply taste-skill audit**

Write a short audit note in the final implementation report with these exact rows:

```text
Taste audit:
- Information hierarchy: pass/fail
- Action ownership: pass/fail
- Preview/edit separation: pass/fail
- Dialog/drawer fit: pass/fail
- Empty/error/disabled states: pass/fail
- Button contrast and wrapping: pass/fail
- Card restraint: pass/fail
- Legacy schema leakage: pass/fail
- Generic human role leakage: pass/fail
- Mobile collapse: pass/fail
```

If any row is `fail`, fix it before claiming completion.

- [ ] **Step 8: Capture evidence**

Use the browser tool screenshots in the implementation notes or final response. If local file saving is available, save screenshots under:

```text
artifacts/course-planner-ui/01-board-desktop.png
artifacts/course-planner-ui/01-board-mobile.png
artifacts/course-planner-ui/02-workspace-desktop.png
artifacts/course-planner-ui/02-workspace-mobile.png
```

If local file saving is not available from the browser tool, attach the screenshots in the thread and describe the viewport for each screenshot.

- [ ] **Step 9: Final command set**

Run:

```bash
cd frontend
npm test -- --run tests/coursePlanner
npm run build
```

If backend files were touched during execution, also run:

```bash
backend/.venv/bin/python -m pytest backend/tests/course_planner -q
```

Expected:

```text
Frontend tests pass.
Frontend build passes.
Backend Course Planner tests pass only if backend was touched.
```

## Self-Review

Spec coverage:

- 01 Scene Pack list actions are item-scoped in Task 3.
- 01 create/edit/delete dialogs are compact and shared in Task 3.
- 01 candidate pool and Chapter List are distinct in Task 3.
- 02 Prompt Version item actions and adoption are item-scoped in Task 4.
- 02 delete fallback is handled in Task 4.
- 02 preview/edit separation is handled in Task 5.
- 02 scene-first vocabulary and role IP handling are handled in Task 5.
- Prompt Preview readiness and legacy package guard are handled in Task 6.
- Browser screenshot validation and taste audit are handled in Task 7.
- File size cleanup is handled in Task 5 and Task 7.

Placeholder scan:

- No placeholder markers.
- No vague "handle errors" steps without the expected UI behavior.
- No references to unknown APIs.

Type consistency:

- `derivePromptVersionUiState` is the single readiness helper.
- `PromptVersionList` receives item-id handlers.
- `PromptVersionPreview` is read-only.
- `PromptVersionEditDrawer` owns editing and tuning.

## Execution Handoff

Plan complete. Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, then review and browser-check between tasks.
2. **Inline Execution** - Execute tasks in this session using `superpowers:executing-plans`, with checkpoints after Task 3 and Task 6.

## Implementation Report

Task 7 completed on 2026-06-29.

Patch disposition:

- Deleted/replaced the selected Scene Pack action panel with item-owned Scene Pack actions.
- Deleted/replaced the global Prompt Version action panel with item-owned Duplicate / AI Revise / Delete.
- Rewrote the 02 preview/edit split: default view is read-only; edit and tune live in drawer flows.
- Preserved real invariants from earlier fixes: no native prompt/confirm, item actions pass item ids, async pending disables duplicate submission, legacy prompt packages are blocked from copy/upload, and missing character IP blocks final Image2 prompt generation.
- Added a shared readiness source for Prompt Version UI and a shared guard for generic human-role text while a version still needs tuning.

Browser evidence:

- `artifacts/course-planner-ui/01-board-desktop.png` at 1440x900.
- `artifacts/course-planner-ui/01-board-mobile.png` at 390x844.
- `artifacts/course-planner-ui/02-workspace-desktop.png` at 1440x900.
- `artifacts/course-planner-ui/02-workspace-mobile.png` at 390x844.

Browser checks:

- 01 desktop/mobile: no `Selected pack` panel, Scene Pack actions are inside each item, no horizontal overflow.
- 02 desktop/mobile: no global `Version actions`, no textarea in the main preview, no `Scene Vocabulary` large panel, no `None` empty block, no horizontal overflow.
- 02 Needs tuning state: header, list, middle preview, and right Prompt Preview share the same readiness; generate/copy/upload are disabled.
- 02 generic human-role guard: `小学生/孩子/家长/student/child/parent` are not exposed as valid Prompt Version content while role IP is missing.

Taste audit:

- Information hierarchy: pass
- Action ownership: pass
- Preview/edit separation: pass
- Dialog/drawer fit: pass
- Empty/error/disabled states: pass
- Button contrast and wrapping: pass
- Card restraint: pass
- Legacy schema leakage: pass
- Generic human role leakage: pass
- Mobile collapse: pass

Verification:

- `npm test -- --run tests/coursePlanner`: pass, 6 files / 40 tests.
- `npm run build`: pass, Vite chunk-size warning only.
- `backend/.venv/bin/python -m pytest backend/tests/course_planner -q`: pass, 73 tests, 1 existing Starlette/httpx deprecation warning.
