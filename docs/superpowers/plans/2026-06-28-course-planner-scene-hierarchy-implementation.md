# Course Planner Scene Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Course Planner around `Scene Pack -> Chapter -> Prompt Version -> Image Attempt` with correct CRUD boundaries, page flow, and async UX.

**Architecture:** Keep the existing Course Planner backend module, file-backed store, frontend feature folder, route-level product entry, and Pipeline visual theme. Replace the wrong UI/data assumptions with a single authoritative hierarchy: Scene Pack owns Chapters, Chapter owns Prompt Versions, Prompt Version owns Image Attempts. Apply TDD only to complex state, persistence, routing, and lineage invariants; use direct implementation plus focused verification for simple UI cleanup.

**Tech Stack:** Python backend with pytest, TypeScript/React frontend with Vitest/Testing Library, existing Course Planner API/store patterns, existing CSS theme.

---

## Task Classification Rule

Use this split throughout implementation:

- **Complex tasks:** data model changes, store migrations, API contracts, cross-page state flow, version/attempt lineage, import-to-pipeline behavior. These require a failing test first, minimal implementation, then verification.
- **Simple tasks:** visual layout cleanup, labels, icon buttons, cursor states, disabled styles, empty-state copy, replacing duplicate controls, modal placement. These do not need a separate red/green cycle per tiny item. Implement them in one scoped pass, then run the relevant component/integration tests and a manual browser check.

Do not create one task per button. Do not dispatch a subagent for every CSS or wording change. Keep task count low and tied to business invariants.

## Current Patch Audit Requirement

Before editing implementation files, audit current diff and classify old Course Planner changes:

```powershell
git status --short
git diff -- backend/art_pipeline/course_planner frontend/src/features/coursePlanner backend/tests/course_planner frontend/tests/coursePlanner
```

Use these decisions:

- Keep useful API/provider/store work only if it supports the new hierarchy.
- Rewrite UI that encodes `Category ID`, `Target Level`, manual `Chapter Count`, candidate `Reject`, selected/locked dual lists, or empty Designer forms.
- Delete tests that protect the wrong behavior, then replace them with tests from this plan.
- Do not stack compatibility fallbacks on top of wrong concepts.

## File Map

Backend files:

- Modify: `backend/art_pipeline/course_planner/models.py`
  - Owns Pydantic/domain models for Scene Pack, Chapter Seed, Prompt Version, Image Attempt, and planning candidates.
- Modify: `backend/art_pipeline/course_planner/store.py`
  - Owns persistence, generated IDs, ordering, version duplication, attempt creation, and migration from existing local data.
- Modify: `backend/art_pipeline/course_planner/routes.py`
  - Owns HTTP API routes for Scene Packs, Chapters, Prompt Versions, Image Attempts.
- Modify: `backend/art_pipeline/course_planner/ai_tasks.py`
  - Owns AI task payloads and schemas for candidate generation, candidate revision, prompt version generation, prompt package generation, and image review.
- Modify: `backend/art_pipeline/course_planner/codex_json_provider.py`
  - Owns Codex JSON task execution if payload schemas change.
- Modify: `backend/art_pipeline/course_planner/prompt_builder.py`
  - Owns deterministic prompt package generation from `SceneDirectorPlan` and `ObjectPlan`.
- Modify: `backend/art_pipeline/course_planner/import_to_pipeline.py`
  - Owns import lineage from Image Attempt to Pipeline.

Backend tests:

- Modify: `backend/tests/course_planner/test_models.py`
- Modify: `backend/tests/course_planner/test_store.py`
- Modify: `backend/tests/course_planner/test_routes.py`
- Modify: `backend/tests/course_planner/test_ai_tasks.py`
- Modify: `backend/tests/course_planner/test_prompt_builder.py`
- Modify: `backend/tests/course_planner/test_import_to_pipeline.py`
- Modify: `backend/tests/course_planner/route_test_helpers.py`

Frontend files:

- Modify: `frontend/src/features/coursePlanner/types.ts`
  - Mirrors backend response/request contracts.
- Modify: `frontend/src/features/coursePlanner/api.ts`
  - Owns typed API calls.
- Modify: `frontend/src/features/coursePlanner/hooks/useCoursePlannerState.ts`
  - Owns page state, active Scene Pack, selected Chapter, selected Prompt Version, and async status map.
- Modify: `frontend/src/features/coursePlanner/pages/SceneCategoryBoardPage.tsx`
  - Page 01: Scene Pack list, candidate pool, one Chapter list.
- Modify: `frontend/src/features/coursePlanner/pages/ChapterWorkspacePage.tsx`
  - Page 02 and route handoff to Page 03 if currently shared.
- Create or modify: `frontend/src/features/coursePlanner/pages/ImageAttemptReviewPage.tsx`
  - Page 03 if a dedicated page file does not exist.
- Modify: `frontend/src/features/coursePlanner/components/CandidateChapterBoard.tsx`
- Modify: `frontend/src/features/coursePlanner/components/PlanningBriefPanel.tsx`
- Modify: `frontend/src/features/coursePlanner/components/SelectedChapterSequence.tsx`
- Modify: `frontend/src/features/coursePlanner/components/SceneCategoryList.tsx`
- Modify: `frontend/src/features/coursePlanner/components/PromptPackagePanel.tsx`
- Modify: `frontend/src/features/coursePlanner/components/PromptPackageModal.tsx`
- Modify: `frontend/src/features/coursePlanner/components/ImageAttemptsPanel.tsx`
- Modify: `frontend/src/features/coursePlanner/components/coursePlanner.css`

Frontend tests:

- Modify: `frontend/tests/coursePlanner/course-planner-api.test.ts`
- Modify: `frontend/tests/coursePlanner/course-planner-flow.test.tsx`
- Modify: `frontend/tests/coursePlanner/course-planner-routing.test.tsx`
- Modify: `frontend/tests/coursePlanner/scene-category-board.test.tsx`
- Modify: `frontend/tests/coursePlanner/chapter-workspace.test.tsx`
- Create: `frontend/tests/coursePlanner/image-attempt-review.test.tsx`

---

## Task 1: Backend Domain Hierarchy

**Type:** Complex, TDD required.

**Purpose:** Make the backend understand `Scene Pack -> Chapter -> Prompt Version -> Image Attempt` as real persisted objects.

**Files:**

- Modify: `backend/art_pipeline/course_planner/models.py`
- Modify: `backend/art_pipeline/course_planner/store.py`
- Modify: `backend/tests/course_planner/test_models.py`
- Modify: `backend/tests/course_planner/test_store.py`

- [ ] **Step 1: Write model tests for the new hierarchy**

Add tests that assert generated IDs are system-owned, chapter count is derived, and a Chapter Seed is not a final prompt.

```python
def test_scene_pack_chapter_prompt_version_attempt_hierarchy_round_trips():
    pack = make_scene_pack(title="室内家庭篇", intent="覆盖家庭日常空间")
    chapter = make_chapter(
        scene_pack_id=pack.id,
        title="厨房早餐打翻",
        summary="早餐准备时牛奶被打翻，家人一起处理。",
    )
    version = make_prompt_version(
        chapter_id=chapter.id,
        title="温馨厨房早餐版",
    )
    attempt = make_image_attempt(prompt_version_id=version.id, uploaded_image_id="img_001")

    assert chapter.scene_pack_id == pack.id
    assert version.chapter_id == chapter.id
    assert attempt.prompt_version_id == version.id
    assert pack.chapter_ids == []
    assert not hasattr(pack, "target_level")
    assert not hasattr(pack, "chapter_count")
```

```python
def test_chapter_seed_contains_context_without_final_prompt():
    seed = make_chapter_seed(
        chapter_title="厨房早餐打翻",
        event_seed="孩子不小心打翻牛奶，家长拿纸巾处理。",
        spatial_seed="厨房台面、餐桌、水槽、冰箱和地面活动区。",
        object_coverage_hint=["milk", "cup", "plate", "tissue"],
    )

    assert seed.chapter_title == "厨房早餐打翻"
    assert seed.object_coverage_hint == ["milk", "cup", "plate", "tissue"]
    assert not hasattr(seed, "full_prompt")
```

- [ ] **Step 2: Run model tests and verify failure**

Run:

```powershell
python -m pytest backend/tests/course_planner/test_models.py -q
```

Expected: fail because the new model helpers/types do not exist or existing models do not expose the hierarchy.

- [ ] **Step 3: Implement minimal backend models**

In `backend/art_pipeline/course_planner/models.py`, add or adapt typed models with these exact concepts:

```python
class CharacterConceptHint(BaseModel):
    cast_mode: Literal["main_cast_and_supporting_cast"] = "main_cast_and_supporting_cast"
    main_cast_hint: str
    supporting_cast_hint: str | None = None
    reference_asset_ids: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)


class ChapterSeed(BaseModel):
    scene_pack_id: str
    scene_pack_title: str
    chapter_id: str
    chapter_title: str
    chapter_intent: str
    scene_domain: str
    daily_moment: str | None = None
    event_seed: str
    spatial_seed: str
    object_coverage_hint: list[str] = Field(default_factory=list)
    character_concept_hint: CharacterConceptHint
    style_notes: str | None = None


class SceneDirectorPlan(BaseModel):
    story_event: str
    scene_composition: str
    spatial_structure: str
    character_arrangement: str
    action_design: str
    style_and_constraints: str


class PlannedObject(BaseModel):
    name: str
    role_in_scene: str
    placement_hint: str | None = None
    priority: Literal["core", "required", "recommended", "avoid"]


class ObjectPlan(BaseModel):
    core_objects: list[PlannedObject] = Field(default_factory=list)
    required_objects: list[PlannedObject] = Field(default_factory=list)
    recommended_objects: list[PlannedObject] = Field(default_factory=list)
    avoid_or_move_objects: list[PlannedObject] = Field(default_factory=list)


class PromptPackage(BaseModel):
    full_prompt: str
    short_prompt: str | None = None
    negative_constraints: str
    revision_prompt: str | None = None
```

Use existing project naming and Pydantic version conventions. Add Chinese comments only where the model preserves a non-obvious boundary, for example why `ChapterSeed` does not contain a final prompt.

- [ ] **Step 4: Write store tests for scoped ownership and derived counts**

Add tests:

```python
def test_scene_pack_chapter_list_is_single_source_of_truth(tmp_path):
    store = make_store(tmp_path)
    pack = store.create_scene_pack(title="室内家庭篇", intent="家庭日常空间")
    chapter = store.create_chapter_from_seed(
        scene_pack_id=pack.id,
        seed=make_chapter_seed(scene_pack_id=pack.id, scene_pack_title=pack.title),
    )

    loaded = store.get_scene_pack(pack.id)
    assert loaded.chapter_ids == [chapter.id]
    assert store.list_chapters(pack.id)[0].id == chapter.id
    assert len(store.list_chapters(pack.id)) == 1
```

```python
def test_prompt_version_and_attempt_lineage_is_preserved(tmp_path):
    store = make_store(tmp_path)
    pack = store.create_scene_pack(title="室内家庭篇", intent="家庭日常空间")
    chapter = store.create_chapter_from_seed(
        scene_pack_id=pack.id,
        seed=make_chapter_seed(scene_pack_id=pack.id, scene_pack_title=pack.title),
    )
    version = store.create_prompt_version(chapter.id, make_prompt_version_payload())
    attempt = store.create_image_attempt(version.id, uploaded_image_id="img_001")

    assert store.get_prompt_version(version.id).chapter_id == chapter.id
    assert store.get_image_attempt(attempt.id).prompt_version_id == version.id
```

- [ ] **Step 5: Run store tests and verify failure**

Run:

```powershell
python -m pytest backend/tests/course_planner/test_store.py -q
```

Expected: fail on missing methods or wrong lineage.

- [ ] **Step 6: Implement store operations**

Implement only the operations needed by tests and pages:

- `create_scene_pack`
- `update_scene_pack`
- `archive_scene_pack` or `delete_scene_pack`
- `list_scene_packs`
- `create_chapter_from_seed`
- `list_chapters(scene_pack_id)`
- `reorder_chapters(scene_pack_id, chapter_ids)`
- `lock_chapter_list(scene_pack_id, locked)`
- `create_prompt_version(chapter_id, payload)`
- `duplicate_prompt_version(version_id)`
- `list_prompt_versions(chapter_id)`
- `set_adopted_prompt_version(chapter_id, version_id)`
- `create_image_attempt(prompt_version_id, uploaded_image_id)`
- `list_image_attempts(prompt_version_id)`

Do not add generic manager/registry layers. Keep the file-backed store as the single persistence boundary.

- [ ] **Step 7: Verify backend model/store**

Run:

```powershell
python -m pytest backend/tests/course_planner/test_models.py backend/tests/course_planner/test_store.py -q
```

Expected: pass.

- [ ] **Step 8: Commit**

```powershell
git add backend/art_pipeline/course_planner/models.py backend/art_pipeline/course_planner/store.py backend/tests/course_planner/test_models.py backend/tests/course_planner/test_store.py
git commit -m "feat: add course planner scene hierarchy models"
```

---

## Task 2: Backend API And AI Task Contracts

**Type:** Complex, TDD required.

**Purpose:** Expose the hierarchy through API routes and make AI tasks produce candidates and Prompt Versions rather than old scene-category CRUD output.

**Files:**

- Modify: `backend/art_pipeline/course_planner/routes.py`
- Modify: `backend/art_pipeline/course_planner/ai_tasks.py`
- Modify: `backend/art_pipeline/course_planner/codex_json_provider.py`
- Modify: `backend/art_pipeline/course_planner/prompt_builder.py`
- Modify: `backend/tests/course_planner/test_routes.py`
- Modify: `backend/tests/course_planner/test_ai_tasks.py`
- Modify: `backend/tests/course_planner/test_prompt_builder.py`
- Modify: `backend/tests/course_planner/route_test_helpers.py`

- [ ] **Step 1: Write route tests for Scene Pack and Chapter candidate flow**

Add route tests for:

- Create/list/update/delete Scene Pack.
- Generate candidates for selected Scene Pack.
- Accept candidate into one Chapter list.
- Delete candidate without replacement.
- Lock list without creating a second list.

Example assertions:

```python
def test_accept_candidate_creates_chapter_without_manual_count(client):
    pack = create_scene_pack(client, title="室内家庭篇")
    candidate = generate_candidate_fixture(pack["id"], title="厨房早餐打翻")

    response = client.post(
        f"/api/course-planner/scene-packs/{pack['id']}/chapters",
        json={"candidate": candidate},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["scene_pack_id"] == pack["id"]
    assert body["title"] == "厨房早餐打翻"
    assert "chapter_count" not in body
    assert "target_level" not in body
```

- [ ] **Step 2: Write route tests for Prompt Version and Image Attempt flow**

Add route tests:

```python
def test_upload_image_attempt_is_scoped_to_prompt_version(client):
    chapter = create_chapter_fixture(client, title="厨房早餐打翻")
    version = create_prompt_version_fixture(client, chapter["id"])

    response = client.post(
        f"/api/course-planner/prompt-versions/{version['id']}/image-attempts",
        json={"uploaded_image_id": "img_001"},
    )

    assert response.status_code == 201
    assert response.json()["prompt_version_id"] == version["id"]
```

- [ ] **Step 3: Run route tests and verify failure**

Run:

```powershell
python -m pytest backend/tests/course_planner/test_routes.py -q
```

Expected: fail on missing new endpoints or response shapes.

- [ ] **Step 4: Implement route endpoints**

Add route handlers under the existing `/api/course-planner` ownership. Use current project route style.

Required endpoints:

```text
GET    /api/course-planner/scene-packs
POST   /api/course-planner/scene-packs
PATCH  /api/course-planner/scene-packs/{scene_pack_id}
DELETE /api/course-planner/scene-packs/{scene_pack_id}

POST   /api/course-planner/scene-packs/{scene_pack_id}/candidate-batches
POST   /api/course-planner/scene-packs/{scene_pack_id}/candidate-revisions
DELETE /api/course-planner/candidates/{candidate_id}

GET    /api/course-planner/scene-packs/{scene_pack_id}/chapters
POST   /api/course-planner/scene-packs/{scene_pack_id}/chapters
PATCH  /api/course-planner/scene-packs/{scene_pack_id}/chapter-order
PATCH  /api/course-planner/scene-packs/{scene_pack_id}/chapter-list-lock
DELETE /api/course-planner/chapters/{chapter_id}

GET    /api/course-planner/chapters/{chapter_id}/prompt-versions
POST   /api/course-planner/chapters/{chapter_id}/prompt-versions
POST   /api/course-planner/prompt-versions/{version_id}/duplicate
PATCH  /api/course-planner/prompt-versions/{version_id}
DELETE /api/course-planner/prompt-versions/{version_id}
POST   /api/course-planner/prompt-versions/{version_id}/prompt-package

POST   /api/course-planner/prompt-versions/{version_id}/image-attempts
GET    /api/course-planner/prompt-versions/{version_id}/image-attempts
POST   /api/course-planner/image-attempts/{attempt_id}/review
POST   /api/course-planner/image-attempts/{attempt_id}/import
```

Do not expose target level or manual chapter count.

- [ ] **Step 5: Write AI task tests**

Add tests asserting candidate and prompt-version schema:

```python
def test_generate_candidates_returns_chapter_seed_fields():
    result = run_candidate_generation_fixture(intent="室内家庭篇")
    candidate = result.candidates[0]

    assert candidate.title
    assert candidate.event_seed
    assert candidate.spatial_seed
    assert candidate.object_coverage_hint
    assert candidate.character_concept_hint.cast_mode == "main_cast_and_supporting_cast"
    assert not hasattr(candidate, "target_level")
```

```python
def test_generate_prompt_version_uses_chapter_seed_not_language_level():
    result = run_prompt_version_generation_fixture(make_chapter_seed())

    assert result.scene_director_plan.story_event
    assert result.object_plan.core_objects
    assert result.prompt_package.full_prompt
    assert "A1" not in result.prompt_package.full_prompt
```

- [ ] **Step 6: Implement AI task schema changes**

Update AI prompts/task payloads to produce:

- Chapter candidates with `event_seed`, `spatial_seed`, `object_coverage_hint`, `character_concept_hint`.
- Prompt Versions with `scene_director_plan`, `object_plan`, `prompt_package`.
- Image review with checklist tied to Prompt Version.

Keep prompt text focused on scene planning. Do not include meta-prompt clauses about "not using A1/A2" unless needed as a schema constraint; the user-facing goal is scene planning, not arguing with old mistakes.

- [ ] **Step 7: Verify backend API/AI contracts**

Run:

```powershell
python -m pytest backend/tests/course_planner/test_routes.py backend/tests/course_planner/test_ai_tasks.py backend/tests/course_planner/test_prompt_builder.py -q
```

Expected: pass.

- [ ] **Step 8: Commit**

```powershell
git add backend/art_pipeline/course_planner/routes.py backend/art_pipeline/course_planner/ai_tasks.py backend/art_pipeline/course_planner/codex_json_provider.py backend/art_pipeline/course_planner/prompt_builder.py backend/tests/course_planner/test_routes.py backend/tests/course_planner/test_ai_tasks.py backend/tests/course_planner/test_prompt_builder.py backend/tests/course_planner/route_test_helpers.py
git commit -m "feat: expose course planner hierarchy api"
```

---

## Task 3: Frontend Types, API Client, And State Flow

**Type:** Complex, TDD required.

**Purpose:** Make frontend state match backend hierarchy and prevent UI pages from inventing their own source of truth.

**Files:**

- Modify: `frontend/src/features/coursePlanner/types.ts`
- Modify: `frontend/src/features/coursePlanner/api.ts`
- Modify: `frontend/src/features/coursePlanner/hooks/useCoursePlannerState.ts`
- Modify: `frontend/tests/coursePlanner/course-planner-api.test.ts`
- Modify: `frontend/tests/coursePlanner/course-planner-flow.test.tsx`

- [ ] **Step 1: Write API client tests for new contracts**

Add tests that assert request paths and response typing for:

- Scene Pack CRUD.
- Candidate generation and delete.
- Accept candidate into Chapter.
- Reorder and lock Chapter list.
- Prompt Version creation/duplication/adoption.
- Image Attempt creation.

Example:

```ts
it("creates an image attempt under the selected prompt version", async () => {
  server.use(
    http.post("/api/course-planner/prompt-versions/version-001/image-attempts", async ({ request }) => {
      const body = await request.json();
      expect(body).toEqual({ uploadedImageId: "img_001" });
      return HttpResponse.json({
        id: "attempt-001",
        promptVersionId: "version-001",
        uploadedImageId: "img_001",
        status: "uploaded",
      }, { status: 201 });
    }),
  );

  await expect(api.createImageAttempt("version-001", { uploadedImageId: "img_001" }))
    .resolves.toMatchObject({ id: "attempt-001", promptVersionId: "version-001" });
});
```

- [ ] **Step 2: Run API tests and verify failure**

Run:

```powershell
npm --prefix frontend test -- --run tests/coursePlanner/course-planner-api.test.ts
```

Expected: fail on missing client methods/types.

- [ ] **Step 3: Implement frontend types and API methods**

Add TypeScript types mirroring backend names in camelCase:

```ts
export interface ScenePack {
  id: string;
  title: string;
  intent: string;
  notes?: string;
  status: "draft" | "active" | "archived";
  chapterIds: string[];
  chapterListLocked?: boolean;
}

export interface ChapterSeed {
  scenePackId: string;
  scenePackTitle: string;
  chapterId: string;
  chapterTitle: string;
  chapterIntent: string;
  sceneDomain: string;
  dailyMoment?: string;
  eventSeed: string;
  spatialSeed: string;
  objectCoverageHint: string[];
  characterConceptHint: CharacterConceptHint;
  styleNotes?: string;
}
```

Add API functions whose names match the hierarchy:

```ts
listScenePacks()
createScenePack(input)
updateScenePack(scenePackId, input)
deleteScenePack(scenePackId)
generateChapterCandidates(scenePackId, input)
deleteChapterCandidate(candidateId)
acceptChapterCandidate(scenePackId, candidate)
reorderChapters(scenePackId, chapterIds)
setChapterListLocked(scenePackId, locked)
listPromptVersions(chapterId)
createPromptVersion(chapterId, input)
duplicatePromptVersion(versionId)
updatePromptVersion(versionId, input)
deletePromptVersion(versionId)
generatePromptPackage(versionId)
createImageAttempt(versionId, input)
reviewImageAttempt(attemptId)
importImageAttempt(attemptId, input)
```

- [ ] **Step 4: Write state-flow tests**

Add tests for:

- Active Scene Pack scopes candidates and Chapter list.
- Accepting a candidate updates one Chapter list.
- Lock state disables list editing but does not create a second list.
- Opening a Chapter loads Prompt Versions.
- Uploading image from selected Prompt Version navigates to attempt route.

- [ ] **Step 5: Implement state flow**

In `useCoursePlannerState.ts`, keep one authoritative state shape:

```ts
interface CoursePlannerState {
  scenePacks: ScenePack[];
  activeScenePackId: string | null;
  candidatesByScenePackId: Record<string, ChapterCandidate[]>;
  chaptersByScenePackId: Record<string, Chapter[]>;
  promptVersionsByChapterId: Record<string, PromptVersion[]>;
  imageAttemptsByVersionId: Record<string, ImageAttempt[]>;
  selectedChapterId: string | null;
  selectedPromptVersionId: string | null;
  asyncStatus: Record<string, AsyncOperationState>;
}
```

Use operation keys like `generateCandidates:${scenePackId}` and `uploadAttempt:${versionId}` so buttons can show local pending state without blocking the whole product.

- [ ] **Step 6: Verify frontend state/API**

Run:

```powershell
npm --prefix frontend test -- --run tests/coursePlanner/course-planner-api.test.ts tests/coursePlanner/course-planner-flow.test.tsx
```

Expected: pass.

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/features/coursePlanner/types.ts frontend/src/features/coursePlanner/api.ts frontend/src/features/coursePlanner/hooks/useCoursePlannerState.ts frontend/tests/coursePlanner/course-planner-api.test.ts frontend/tests/coursePlanner/course-planner-flow.test.tsx
git commit -m "feat: align course planner frontend state hierarchy"
```

---

## Task 4: Page 01 Scene Pack And Chapter Split UI

**Type:** Mixed. TDD for interaction invariants; direct implementation for layout, labels, icons, and styling.

**Purpose:** Replace the current first screen with Scene Pack list, AI candidate pool, and one accepted Chapter list.

**Files:**

- Modify: `frontend/src/features/coursePlanner/pages/SceneCategoryBoardPage.tsx`
- Modify: `frontend/src/features/coursePlanner/components/SceneCategoryList.tsx`
- Modify: `frontend/src/features/coursePlanner/components/PlanningBriefPanel.tsx`
- Modify: `frontend/src/features/coursePlanner/components/CandidateChapterBoard.tsx`
- Modify: `frontend/src/features/coursePlanner/components/SelectedChapterSequence.tsx`
- Modify: `frontend/src/features/coursePlanner/components/coursePlanner.css`
- Modify: `frontend/tests/coursePlanner/scene-category-board.test.tsx`

- [ ] **Step 1: Write focused tests for Page 01 invariants**

Add tests:

```ts
it("shows scene packs, candidate pool, and one chapter list", async () => {
  renderCoursePlannerRoute("/course-planner");

  expect(await screen.findByRole("heading", { name: /Scene Packs|场景篇章/ })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /AI Chapter Candidates|Chapter 候选/ })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /Chapter List|Chapter 列表/ })).toBeInTheDocument();
  expect(screen.queryByText(/Target Level/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/Chapter Count/i)).not.toBeInTheDocument();
});
```

```ts
it("does not render reject, up/down, or a second locked list", async () => {
  renderCoursePlannerRoute("/course-planner");

  expect(await screen.findByText("厨房早餐打翻")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /reject|拒绝/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^up$/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^down$/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: /Locked Chapters/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run Page 01 tests and verify failure**

Run:

```powershell
npm --prefix frontend test -- --run tests/coursePlanner/scene-category-board.test.tsx
```

Expected: fail while old UI remains.

- [ ] **Step 3: Implement Page 01 structure**

Implement the three-column page:

```text
Left: Scene Pack list
Middle: AI Chapter candidate pool
Right: one Chapter list
```

Direct UI implementation rules:

- Use icon buttons for add/rename/delete/trash/open where practical.
- Candidate actions are `接受`, `编辑`, `删除`.
- `编辑` opens a modal or drawer, not a permanent giant textarea.
- `调整整批` opens a modal or drawer.
- Chapter list uses drag handle UI and trash icon; do not render Up/Down buttons.
- Lock changes list read-only state only; do not render a locked copy.

- [ ] **Step 4: Implement async state display**

For Page 01 actions, bind `asyncStatus` to:

- Generate candidates.
- Generate more.
- Revise batch.
- Accept candidate.
- Delete candidate.
- Reorder chapters.
- Lock/unlock list.

Minimum UI:

- Pending button label.
- Disabled duplicate action.
- Local error near the panel that failed.
- Pointer cursor for enabled interactive controls.

- [ ] **Step 5: Verify Page 01**

Run:

```powershell
npm --prefix frontend test -- --run tests/coursePlanner/scene-category-board.test.tsx tests/coursePlanner/course-planner-flow.test.tsx
```

Expected: pass.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/features/coursePlanner/pages/SceneCategoryBoardPage.tsx frontend/src/features/coursePlanner/components/SceneCategoryList.tsx frontend/src/features/coursePlanner/components/PlanningBriefPanel.tsx frontend/src/features/coursePlanner/components/CandidateChapterBoard.tsx frontend/src/features/coursePlanner/components/SelectedChapterSequence.tsx frontend/src/features/coursePlanner/components/coursePlanner.css frontend/tests/coursePlanner/scene-category-board.test.tsx frontend/tests/coursePlanner/course-planner-flow.test.tsx
git commit -m "feat: rebuild course planner scene chapter board"
```

---

## Task 5: Page 02 Prompt Version Designer

**Type:** Mixed. TDD for version/data flow; direct implementation for layout and visual polish.

**Purpose:** Make 02 a multi-version prompt design page, not an empty manual scene-card form.

**Files:**

- Modify: `frontend/src/features/coursePlanner/pages/ChapterWorkspacePage.tsx`
- Modify: `frontend/src/features/coursePlanner/components/PromptPackagePanel.tsx`
- Modify: `frontend/src/features/coursePlanner/components/PromptPackageModal.tsx`
- Modify: `frontend/src/features/coursePlanner/components/coursePlanner.css`
- Modify: `frontend/tests/coursePlanner/chapter-workspace.test.tsx`

- [ ] **Step 1: Write tests for 02 entry context and version list**

Add tests:

```ts
it("opens with chapter seed context instead of empty designer fields", async () => {
  renderCoursePlannerRoute("/course-planner/chapters/chapter-kitchen");

  expect(await screen.findByText("厨房早餐打翻")).toBeInTheDocument();
  expect(screen.getByText(/早餐准备时牛奶被打翻/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /生成第一个 Prompt 版本/ })).toBeInTheDocument();
});
```

```ts
it("supports multiple prompt versions for one chapter", async () => {
  renderCoursePlannerRoute("/course-planner/chapters/chapter-kitchen");

  expect(await screen.findByText(/Version 001|V001/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /复制当前版本/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /AI 修改当前版本/ })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run 02 tests and verify failure**

Run:

```powershell
npm --prefix frontend test -- --run tests/coursePlanner/chapter-workspace.test.tsx
```

Expected: fail while the old empty Designer structure remains.

- [ ] **Step 3: Implement 02 layout**

Use this structure:

```text
Top: Back, Scene Pack / Chapter title, selected version status
Left: Prompt Version list
Middle: Scene Director Design and Object Plan
Right: Prompt Preview, copy actions, upload generated image
```

Version list actions:

- Generate first/new version.
- Duplicate current version.
- AI revise current version.
- Delete/archive version.
- Mark adopted.

Scene Director sections:

- Story event.
- Scene composition.
- Spatial structure.
- Character arrangement.
- Action design.
- Style and constraints.
- Object planning.

Prompt preview actions:

- Generate prompt package.
- Copy full prompt.
- Copy negative constraints.
- Open prompt modal.
- Upload generated image.

- [ ] **Step 4: Implement upload-to-03 handoff**

When user uploads generated image from the selected Prompt Version:

1. Call `createImageAttempt(selectedPromptVersionId, { uploadedImageId })`.
2. Store returned attempt under that version.
3. Navigate to `/course-planner/chapters/:chapterId/versions/:versionId/attempts/:attemptId`.

Do not show the full image review UI in 02.

- [ ] **Step 5: Verify 02**

Run:

```powershell
npm --prefix frontend test -- --run tests/coursePlanner/chapter-workspace.test.tsx tests/coursePlanner/course-planner-routing.test.tsx
```

Expected: pass.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/features/coursePlanner/pages/ChapterWorkspacePage.tsx frontend/src/features/coursePlanner/components/PromptPackagePanel.tsx frontend/src/features/coursePlanner/components/PromptPackageModal.tsx frontend/src/features/coursePlanner/components/coursePlanner.css frontend/tests/coursePlanner/chapter-workspace.test.tsx frontend/tests/coursePlanner/course-planner-routing.test.tsx
git commit -m "feat: add prompt version designer"
```

---

## Task 6: Page 03 Image Attempt Review And Import

**Type:** Complex, TDD required.

**Purpose:** Create the review/import page for one uploaded image attempt and preserve lineage to Pipeline.

**Files:**

- Create or modify: `frontend/src/features/coursePlanner/pages/ImageAttemptReviewPage.tsx`
- Modify: `frontend/src/features/coursePlanner/components/ImageAttemptsPanel.tsx`
- Modify: `frontend/src/features/coursePlanner/components/coursePlanner.css`
- Create: `frontend/tests/coursePlanner/image-attempt-review.test.tsx`
- Modify: `frontend/tests/coursePlanner/course-planner-routing.test.tsx`
- Modify: `backend/art_pipeline/course_planner/import_to_pipeline.py`
- Modify: `backend/tests/course_planner/test_import_to_pipeline.py`

- [ ] **Step 1: Write frontend route tests for 03**

Add:

```ts
it("shows image attempt lineage and back navigation to the exact prompt version", async () => {
  renderCoursePlannerRoute("/course-planner/chapters/chapter-kitchen/versions/version-001/attempts/attempt-001");

  expect(await screen.findByText("室内家庭篇")).toBeInTheDocument();
  expect(screen.getByText("厨房早餐打翻")).toBeInTheDocument();
  expect(screen.getByText(/Version 001|V001/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /回到版本|Back to Version/ })).toBeInTheDocument();
});
```

- [ ] **Step 2: Write backend import lineage test**

Add:

```python
def test_import_image_attempt_preserves_course_planner_lineage(tmp_path):
    store = make_store(tmp_path)
    attempt = make_attempt_with_lineage(store)

    result = import_image_attempt_to_pipeline(store=store, attempt_id=attempt.id)

    assert result.source["scene_pack_id"] == attempt.scene_pack_id
    assert result.source["chapter_id"] == attempt.chapter_id
    assert result.source["prompt_version_id"] == attempt.prompt_version_id
    assert result.source["image_attempt_id"] == attempt.id
```

- [ ] **Step 3: Run 03/import tests and verify failure**

Run:

```powershell
npm --prefix frontend test -- --run tests/coursePlanner/image-attempt-review.test.tsx tests/coursePlanner/course-planner-routing.test.tsx
python -m pytest backend/tests/course_planner/test_import_to_pipeline.py -q
```

Expected: fail on missing page/import lineage.

- [ ] **Step 4: Implement 03 page**

Page structure:

```text
Left: Attempt history for current Prompt Version
Middle: Image preview with fit/zoom controls
Right: AI review, human decision, import config
```

Actions:

- Run/rerun AI review.
- Accept for import.
- Mark as not accepted.
- Keep record.
- Delete attempt.
- Return to 02.
- Duplicate version and revise from attempt.

- [ ] **Step 5: Implement import lineage**

In `import_to_pipeline.py`, ensure imported Pipeline data stores source lineage:

```python
source = {
    "source_type": "course_planner_image_attempt",
    "scene_pack_id": scene_pack.id,
    "chapter_id": chapter.id,
    "prompt_version_id": prompt_version.id,
    "image_attempt_id": attempt.id,
}
```

- [ ] **Step 6: Verify 03/import**

Run:

```powershell
npm --prefix frontend test -- --run tests/coursePlanner/image-attempt-review.test.tsx tests/coursePlanner/course-planner-routing.test.tsx
python -m pytest backend/tests/course_planner/test_import_to_pipeline.py -q
```

Expected: pass.

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/features/coursePlanner/pages/ImageAttemptReviewPage.tsx frontend/src/features/coursePlanner/components/ImageAttemptsPanel.tsx frontend/src/features/coursePlanner/components/coursePlanner.css frontend/tests/coursePlanner/image-attempt-review.test.tsx frontend/tests/coursePlanner/course-planner-routing.test.tsx backend/art_pipeline/course_planner/import_to_pipeline.py backend/tests/course_planner/test_import_to_pipeline.py
git commit -m "feat: add image attempt review flow"
```

---

## Task 7: Simple UI Cleanup And Interaction Polish

**Type:** Simple, no per-control TDD. Implement directly, then verify with targeted tests and browser check.

**Purpose:** Remove old UI clutter and make every visible interaction feel like a real web application.

**Files:**

- Modify: `frontend/src/features/coursePlanner/components/coursePlanner.css`
- Modify: affected Course Planner components from Tasks 4-6.

- [ ] **Step 1: Remove wrong labels and controls**

Delete user-facing occurrences of:

- `Category ID`
- `Target Level`
- Manual `Chapter Count`
- Candidate `Reject`
- `Selected Sequence` plus separate `Locked Chapters` dual-list language
- `Up` / `Down` reorder buttons

Allowed wording:

- `Scene Pack`
- `Chapter 候选`
- `Chapter 列表`
- `Prompt Version`
- `上传生成图`
- `Image Attempt`

- [ ] **Step 2: Normalize buttons and cursors**

Apply:

- Icon buttons for add, rename, delete/trash, open designer, drag handle.
- Text buttons for explicit commands such as `生成候选`, `生成 Prompt`, `上传生成图`.
- `cursor: pointer` for enabled clickable controls.
- `cursor: not-allowed` plus visible opacity/contrast change for disabled controls.

- [ ] **Step 3: Normalize async feedback**

For every async action, show:

- Pending label.
- Disabled duplicate submit.
- Contextual error region.
- Success toast or inline confirmation for copy/upload/import.

- [ ] **Step 4: Validate responsive layout**

Use existing responsive CSS patterns. Check:

- Desktop three-column layout does not overflow at common widths.
- Narrow viewport stacks panels without text overlap.
- Long Chinese titles wrap cleanly.
- Buttons do not wrap into broken two-line command labels unless intentionally compacted.

- [ ] **Step 5: Verify UI cleanup**

Run:

```powershell
npm --prefix frontend test -- --run tests/coursePlanner
npm --prefix frontend run build
```

Expected: Course Planner tests pass; build passes.

- [ ] **Step 6: Browser check**

Start or use the dev server and manually check:

```text
/course-planner
/course-planner/chapters/<chapterId>
/course-planner/chapters/<chapterId>/versions/<versionId>/attempts/<attemptId>
```

Confirm:

- Page 01 has Scene Pack list, candidate pool, one Chapter list.
- Page 02 has Prompt Version list, design plan, prompt preview.
- Page 03 has attempt history, image preview, review/import.
- Async buttons visibly change state.
- `Open Designer` never leads to `Chapter not found` for accepted Chapters.

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/features/coursePlanner
git commit -m "style: polish course planner hierarchy ui"
```

---

## Task 8: Final Integration Verification And Patch Cleanup

**Type:** Simple verification and cleanup, no new feature TDD.

**Purpose:** Prove the implementation matches the spec and clear old incorrect patch residue.

**Files:**

- Review all modified Course Planner files.
- Modify docs only if implementation creates a meaningful contract note.

- [ ] **Step 1: Audit for forbidden concepts**

Run:

```powershell
rg "Target Level|Chapter Count|Category ID|Reject|Selected Sequence|Locked Chapters|\\bUp\\b|\\bDown\\b" frontend/src/features/coursePlanner backend/art_pipeline/course_planner frontend/tests/coursePlanner backend/tests/course_planner
```

Expected:

- No user-facing implementation of forbidden concepts.
- Test references only appear in negative assertions if still useful.

- [ ] **Step 2: Run backend Course Planner tests**

Run:

```powershell
python -m pytest backend/tests/course_planner -q
```

Expected: pass.

- [ ] **Step 3: Run frontend Course Planner tests**

Run:

```powershell
npm --prefix frontend test -- --run tests/coursePlanner
```

Expected: pass.

- [ ] **Step 4: Run frontend build**

Run:

```powershell
npm --prefix frontend run build
```

Expected: pass. Existing bundle-size warnings are acceptable if unchanged and unrelated.

- [ ] **Step 5: Final diff review**

Run:

```powershell
git diff --stat
git diff --check
```

Expected:

- Diff only contains Course Planner and intentional tests/docs.
- No whitespace errors.
- No old wrong UI left in reachable code.

- [ ] **Step 6: Commit final cleanup if needed**

If Step 5 required cleanup:

```powershell
git add backend/art_pipeline/course_planner backend/tests/course_planner frontend/src/features/coursePlanner frontend/tests/coursePlanner docs
git commit -m "chore: clean up course planner hierarchy rollout"
```

If no cleanup is needed, do not create an empty commit.

## Self-Review

Spec coverage:

- Scene Pack CRUD: Task 1, Task 2, Task 4.
- Chapter candidate accept/edit/delete and one Chapter list: Task 2, Task 4.
- No fixed chapter count, no target level, no candidate reject: Task 1, Task 4, Task 8.
- Chapter Seed to Prompt Version flow: Task 1, Task 3, Task 5.
- Multiple Prompt Versions per Chapter: Task 1, Task 3, Task 5.
- Upload generated image from 02 into 03: Task 2, Task 3, Task 5, Task 6.
- Image Attempt review/import lineage: Task 6.
- Async UX and cursor/button quality: Task 4, Task 5, Task 6, Task 7.
- Testing invariants: Tasks 1-6 and Task 8.

Placeholder scan:

- No placeholder markers or vague cleanup tasks.
- Simple tasks are intentionally grouped and verified rather than TDD-sliced per control.

Type consistency:

- Plan uses `ScenePack`, `Chapter`, `ChapterSeed`, `PromptVersion`, `ImageAttempt`, `SceneDirectorPlan`, `ObjectPlan`, and `PromptPackage` consistently with the spec.
