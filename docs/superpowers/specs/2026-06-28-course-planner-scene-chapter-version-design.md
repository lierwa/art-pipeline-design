# Course Planner Scene / Chapter / Version Design

Date: 2026-06-28

## Goal

Reframe Course Planner around the real production hierarchy:

```text
Scene Pack
└─ Chapter
   └─ Prompt Version
      └─ Image Attempt
```

The product is an AI-assisted scene planning workflow, not a CRUD form and not a language-level syllabus builder. The user manages scene packs and chapters, asks AI to generate scene-first prompt versions, copies those prompts into ChatGPT/Image2, then uploads generated images back for review and Pipeline import.

## Design Basis

This design follows common product patterns rather than inventing a custom workflow:

- Master-detail management for parent and child records: Scene Pack list drives Chapter list.
- Candidate-to-selected workflow for AI suggestions: AI proposes, user accepts or deletes.
- Versioned artifacts for creative prompts: a Chapter can have multiple Prompt Versions.
- Upload review queue for generated assets: each uploaded image becomes an Image Attempt.
- Explicit state transitions instead of hidden UI assumptions.

The visual direction should reuse the existing Pipeline blue-black theme and density. The supplied reference image is guidance for page structure and visual density, not a pixel-perfect template.

## Product Principles

- Scene-first planning is the source of truth.
- The system generates IDs; users never type IDs.
- Chapter count is derived from accepted chapters; users never type a target count.
- Target language, A1/A2/B1, and language-learning difficulty are outside this planning stage.
- The user should provide intent, feedback, and decisions, not manually maintain object lists.
- AI output is editable and versioned. A generated prompt is not final until the user adopts it.
- 03 only starts after a generated image is uploaded back to a specific Prompt Version.

## Current Patch Disposition

The current Course Planner implementation contains useful protocol and UI work, but the latest product structure is different. Before implementation, audit the current diff and classify changes as follows.

Keep or adapt:

- Route-level Course Planner entry.
- Existing backend ownership under `/api/course-planner`.
- Existing file-backed store pattern if it remains the local persistence layer.
- Existing AI task boundary if it can produce structured candidates and prompt versions.
- Existing upload/review concepts if they can be attached to Prompt Versions.
- Existing Pipeline theme tokens and component styling conventions.

Remove or rewrite:

- First-screen fields for `Category ID`, `Target Level`, and manual `Chapter Count`.
- Candidate `Reject` as a first-class action. Use delete/remove or AI revision instead.
- Fixed chapter quota behavior such as `6/6 selected`, automatic补位, or deficit warnings.
- Separate `Selected Sequence` and `Locked Chapters` lists. There is one Chapter list with lock/read-only state.
- Up/Down reorder buttons when drag handles exist.
- Permanent giant revision text areas and prompt inputs on the main page.
- Empty form-like Designer screens that ask the user to manually fill the whole scene plan.
- Designer pages that show Detection Keywords and Prompt Package as disconnected panels.
- Any test that protects the wrong hierarchy or manual backend-field form.

Do not preserve a wrong UI by adding more fallback flags. If a patch encodes the old hierarchy, rewrite it around the object model in this spec.

## Object Model

### Scene Pack

A Scene Pack is a high-level planning container such as `室内家庭篇`, `室外交通篇`, or `厨房专项`.

Fields:

```ts
ScenePack {
  id: string
  title: string
  intent: string
  notes?: string
  status: "draft" | "active" | "archived"
  chapterIds: string[]
}
```

Scene Pack operations:

- Create.
- Rename.
- Edit intent/notes.
- Archive/delete.
- Switch active Scene Pack.
- Generate more Chapter candidates.
- Revise the current candidate pool.

### Chapter

A Chapter is one daily visual scene under a Scene Pack, such as `厨房早餐打翻` or `客厅收拾玩具`.

Fields:

```ts
Chapter {
  id: string
  scenePackId: string
  title: string
  summary: string
  seed: ChapterSeed
  sortOrder: number
  status: "draft" | "designing" | "prompt_ready" | "has_attempts" | "imported"
  adoptedPromptVersionId?: string
}
```

Chapter operations:

- Accept from AI candidate pool.
- Edit seed before or after acceptance.
- Delete from Scene Pack.
- Drag reorder inside the Scene Pack.
- Lock/unlock list editing at Scene Pack level.
- Open Prompt Designer.

### Chapter Seed

`ChapterSeed` is the payload passed from 01 into 02. It is not a final prompt.

```ts
ChapterSeed {
  scenePackId: string
  scenePackTitle: string
  chapterId: string
  chapterTitle: string
  chapterIntent: string
  sceneDomain: string
  dailyMoment?: string
  eventSeed: string
  spatialSeed: string
  objectCoverageHint: string[]
  characterConceptHint: CharacterConceptHint
  styleNotes?: string
}
```

The seed gives AI enough context to generate coherent Prompt Versions. It prevents the 02 Designer from opening as an empty manual form.

### Character Concept Hint

The character system is not fully designed yet, so Course Planner must only use a concept-level reference.

```ts
CharacterConceptHint {
  castMode: "main_cast_and_supporting_cast"
  mainCastHint: string
  supportingCastHint?: string
  referenceAssetIds?: string[]
  constraints: string[]
}
```

For now, character planning can reference the supplied concept boards: main cast, supporting cast, profession outfits, daily props, expressions, and small actions. A Prompt Version may assign roles for the current scene, but it must not require a finalized character library.

### Prompt Version

A Prompt Version is one complete prompt plan for a Chapter. A Chapter can have multiple versions.

Fields:

```ts
PromptVersion {
  id: string
  chapterId: string
  versionLabel: string
  title: string
  status: "draft" | "prompt_ready" | "has_attempts" | "adopted" | "archived"
  sceneDirectorPlan: SceneDirectorPlan
  objectPlan: ObjectPlan
  promptPackage: PromptPackage
  sourceVersionId?: string
  imageAttemptIds: string[]
}
```

Prompt Version operations:

- Generate first version from Chapter Seed.
- Generate an additional version.
- AI revise current version with feedback.
- Local edit specific sections.
- Duplicate current version.
- Delete/archive version.
- Mark as adopted.
- Copy prompt.
- Upload generated image, creating an Image Attempt.

### Scene Director Plan

```ts
SceneDirectorPlan {
  storyEvent: string
  sceneComposition: string
  spatialStructure: string
  characterArrangement: string
  actionDesign: string
  styleAndConstraints: string
}
```

This is AI-generated from Chapter Seed and editable by the user. It is the center of 02.

### Object Plan

```ts
ObjectPlan {
  coreObjects: PlannedObject[]
  requiredObjects: PlannedObject[]
  recommendedObjects: PlannedObject[]
  avoidOrMoveObjects: PlannedObject[]
}

PlannedObject {
  name: string
  roleInScene: string
  placementHint?: string
  priority: "core" | "required" | "recommended" | "avoid"
}
```

This is visual object planning, not vocabulary teaching. Object priority controls prompt quality and later detection/import expectations.

### Prompt Package

```ts
PromptPackage {
  fullPrompt: string
  shortPrompt?: string
  negativeConstraints: string
  revisionPrompt?: string
}
```

Prompt Package is generated from the current Scene Director Plan and Object Plan. It is shown as preview in 02 and can open in a modal for full copy.

### Image Attempt

An Image Attempt is an uploaded image generated from one Prompt Version.

Fields:

```ts
ImageAttempt {
  id: string
  promptVersionId: string
  uploadedImageId: string
  status: "uploaded" | "ai_reviewed" | "accepted" | "not_accepted" | "imported"
  aiReview?: ImageAttemptReview
  humanDecision?: "accept" | "revise_version" | "keep_record" | "delete"
  pipelineImportId?: string
}
```

Image Attempt operations:

- Upload generated image from 02.
- Run AI review against the Prompt Version.
- Accept for import.
- Mark as not accepted when unsuitable.
- Keep as record.
- Delete.
- Import to Pipeline.

## Page 01: Scene Pack / Chapter Split

Route:

```text
/course-planner
```

Purpose:

- Manage Scene Packs.
- Generate and curate Chapter candidates for the selected Scene Pack.
- Maintain the accepted Chapter list and ordering.
- Open 02 for a specific Chapter.

Layout:

```text
┌────────────────┬──────────────────────────┬────────────────────────┐
│ Scene Packs     │ AI Chapter Candidates     │ Chapter List           │
│                │                          │                        │
│ 室内家庭篇      │ 厨房早餐打翻              │ 1  厨房早餐打翻         │
│ 室外交通篇      │ [接受] [编辑] [删除]      │    [open] [trash]      │
│ 厨房专项        │                          │ 2  客厅收拾玩具         │
│ [+ 新建]        │ [生成更多] [调整整批]     │ [锁定 Chapter 列表]    │
└────────────────┴──────────────────────────┴────────────────────────┘
```

### Left: Scene Pack List

Controls:

- Add icon button for creating a Scene Pack.
- Rename icon button for selected Scene Pack.
- Delete/archive icon button for selected Scene Pack.
- Scene rows are selectable and use pointer cursor.

Behavior:

- Switching Scene Pack updates candidate pool and Chapter list.
- Empty state shows a direct `新建 Scene Pack` action.
- The selected Scene Pack can show a compact intent summary.
- Do not show a permanent large prompt textarea.

### Middle: AI Chapter Candidate Pool

Candidate cards show:

- Title.
- Scene brief.
- Event seed.
- Spatial seed.
- Object coverage hint.
- Character concept hint if available.

Actions:

- `接受`: creates a Chapter from this candidate and adds it to the right list.
- `编辑`: opens a modal/drawer to edit the candidate seed or ask AI to revise this candidate.
- `删除`: removes the candidate from the pool.

Global actions:

- `生成候选`: first generation for the current Scene Pack.
- `生成更多`: append more candidates without a target count.
- `调整整批`: modal/drawer for whole-pool feedback.

Rules:

- No `Reject` action.
- No fixed target number.
- Deleting a candidate does not auto-generate a replacement.
- Accepted candidates are not overwritten by later AI revisions unless the user explicitly chooses full replan.

### Right: Chapter List

This is the only accepted Chapter list.

Row contents:

- Drag handle.
- Sort index.
- Chapter title.
- Short seed summary.
- `Open Designer` icon/button.
- Trash icon button.

Behavior:

- Drag reorder when list is editable.
- Trash removes the Chapter from the Scene Pack after confirmation if it has Prompt Versions or Image Attempts.
- `Lock Chapter List` toggles read-only ordering/deletion state.
- Lock does not create a second list.
- Locked rows still allow `Open Designer`.

## Page 02: Chapter Prompt Designer

Route:

```text
/course-planner/chapters/:chapterId
```

Purpose:

- Generate and manage multiple Prompt Versions for one Chapter.
- Let the user copy a complete prompt for ChatGPT/Image2.
- Let the user upload a generated image back to the current Prompt Version.

Layout:

```text
┌────────────────────────────────────────────────────────────────────┐
│ Back  Scene Pack / Chapter Title          Version status/actions    │
├──────────────────┬──────────────────────────────┬──────────────────┤
│ Prompt Versions   │ Scene Director Design         │ Prompt Preview   │
│                  │                              │                  │
│ V001 adopted      │ Story / Event                 │ Full Prompt      │
│ V002 draft        │ Space / Characters / Actions  │ Negative         │
│ [+ new version]   │ Object Planning               │ Copy / Upload    │
└──────────────────┴──────────────────────────────┴──────────────────┘
```

### Entry Context

When opened from 01, 02 loads the Chapter and its Chapter Seed.

If no Prompt Version exists:

- Show Chapter Seed summary.
- Primary action: `基于 Chapter Seed 生成第一个 Prompt 版本`.
- Do not show empty manual form fields as the main experience.

If versions exist:

- Select the adopted version if present.
- Otherwise select the most recent version.

### Left: Prompt Version List

Each version row shows:

- Version label.
- Version title.
- Status: Draft, Prompt Ready, Has Attempts, Adopted.
- Attempt count.

Actions:

- Generate new version.
- Duplicate current version.
- AI revise current version.
- Delete/archive version.
- Mark current version as adopted.

Rules:

- Version creation is not tied to fixed counts.
- Duplicating a version preserves source relationship.
- Deleting a version with Image Attempts should archive or require confirmation, not silently destroy history.

### Middle: Scene Director Design

Sections:

- Story event.
- Scene composition.
- Spatial structure.
- Main/supporting character arrangement.
- Action design.
- Style and constraints.
- Object planning.

Behavior:

- Default content is AI-generated from Chapter Seed.
- User can directly edit sections.
- User can open `AI 修改当前版本` modal with feedback.
- Each async action has visible running state and disabled duplicate submission.
- Unsaved edits must be visible before switching versions.

### Right: Prompt Preview

Shows:

- Full Prompt preview.
- Negative Constraints.
- Optional Short Prompt.

Actions:

- Generate/regenerate Prompt from current version design.
- Copy Full Prompt.
- Copy Negative Constraints.
- Open Prompt Package modal.
- Upload generated image.

Rules:

- `上传生成图` is attached to the currently selected Prompt Version.
- Uploading a generated image creates an Image Attempt and navigates to 03.
- 02 does not contain the full image review UI.

## Page 03: Image Attempt Review & Import

Route:

```text
/course-planner/chapters/:chapterId/versions/:versionId/attempts/:attemptId
```

Purpose:

- Review one generated image against the Prompt Version that produced it.
- Decide whether to import to Pipeline or return to 02 for revision.

Entry:

```text
02 current Prompt Version
→ 上传生成图
→ create Image Attempt
→ open 03
```

Layout:

```text
┌────────────────────────────────────────────────────────────────────┐
│ Back to Version   Scene / Chapter / Version breadcrumb             │
├──────────────────┬──────────────────────────────┬──────────────────┤
│ Attempt History   │ Image Preview                │ Review / Import  │
│                  │                              │                  │
│ Attempt 003       │ uploaded generated image      │ AI review        │
│ Attempt 002       │ zoom / fit controls           │ Human decision   │
│ Attempt 001       │                              │ Import config    │
└──────────────────┴──────────────────────────────┴──────────────────┘
```

Shows:

- Scene Pack title.
- Chapter title.
- Prompt Version label/title.
- Uploaded image.
- Prompt Package used for generation.
- AI review checklist.
- Human decision controls.
- Pipeline import configuration.

Actions:

- Run or rerun AI review.
- Accept for Pipeline import.
- Return to 02 and revise current version.
- Duplicate version and revise from this attempt.
- Keep record.
- Mark as not accepted.
- Delete attempt.

Rules:

- A Prompt Version can have multiple Image Attempts.
- Passing one attempt does not automatically make all attempts valid.
- Import action must preserve lineage: Scene Pack -> Chapter -> Prompt Version -> Image Attempt -> Pipeline asset/run.

## Async UX Requirements

Every async action must show visible state:

- Generate candidates.
- Revise candidate.
- Accept candidate.
- Reorder Chapter list.
- Lock/unlock Chapter list.
- Generate Prompt Version.
- Revise Prompt Version.
- Generate Prompt Package.
- Copy prompt success/failure.
- Upload image.
- Run AI review.
- Import to Pipeline.

Minimum behavior:

- Button label changes during work, for example `生成中...`.
- Duplicate submission is disabled.
- The active area shows progress or status text.
- Errors are shown near the action that failed.
- Long operations preserve current page context.
- All clickable controls use pointer cursor and disabled controls visibly look disabled.

## Navigation And Data Flow

Primary flow:

```text
Scene Pack selected
→ AI generates Chapter candidates
→ user accepts Chapters
→ user opens one Chapter
→ AI generates Prompt Version
→ user copies prompt
→ user uploads generated image to that Prompt Version
→ system creates Image Attempt
→ user reviews/imports in 03
```

Back navigation:

- 02 back returns to 01 with the same Scene Pack selected.
- 03 back returns to 02 with the same Prompt Version selected.
- 03 can also open the version list for sibling attempts.

Lineage must always be recoverable from any page.

## Empty States

No Scene Pack:

- Show `新建 Scene Pack` primary action.

Scene Pack without candidates:

- Show selected Scene Pack intent and `生成 Chapter 候选`.

Scene Pack without accepted Chapters:

- Explain that accepted candidates appear in the Chapter list.

Chapter without Prompt Versions:

- Show Chapter Seed summary and `生成第一个 Prompt 版本`.

Prompt Version without Prompt Package:

- Show `生成 Prompt`.

Prompt Version without Image Attempts:

- Show `复制 Prompt 后，在 ChatGPT/Image2 生成图片，再上传生成图`.

## Testing Requirements

Tests should protect product invariants, not implementation details.

Required coverage:

- Scene Pack CRUD updates the active Scene and scoped Chapter list.
- Candidate accept creates a Chapter with generated ID and no manual count.
- Candidate delete does not trigger automatic replacement.
- Chapter list has one source of truth before and after lock.
- Drag reorder persists order.
- Opening 02 passes Chapter Seed and does not show an empty manual Designer.
- A Chapter can create multiple Prompt Versions.
- Duplicating a Prompt Version preserves sourceVersionId.
- Uploading an image creates an Image Attempt under the selected Prompt Version.
- 03 can navigate back to the exact Prompt Version.
- Import preserves lineage to Pipeline.
- Async buttons show pending state and prevent duplicate submission.

Do not write tests that assert:

- `Target Level` exists.
- Manual `Chapter Count` exists.
- `Reject` exists as a candidate action.
- Separate selected and locked lists exist.
- Up/Down buttons are required for ordering.

## Acceptance Criteria

The redesign is acceptable when:

- The first Course Planner screen clearly supports multiple Scene Packs and scoped Chapter lists.
- The Chapter list is single, reorderable, and not duplicated by lock state.
- 02 opens with useful Chapter context and supports multiple Prompt Versions.
- 02's primary output is a copyable prompt package, not an uploaded image review.
- 03 can only be entered from a Prompt Version after image upload.
- Every interactive async action has visible progress, disabled duplicate submission, and contextual errors.
- The UI follows the Pipeline theme and the supplied reference layout density.
- The old backend-field form concepts are gone from the user-facing planning workflow.
