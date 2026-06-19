# Sticker Asset Pipeline Parallel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development plus superpowers:dispatching-parallel-agents. Execute by wave. A wave may run multiple workers in parallel only when their write scopes are disjoint. Each worker must commit its own changes and report changed files, tests, commit hash, and concerns.

**Goal:** Implement the sticker-game asset workflow: editable detection vocabulary, click-detect, SAM2-style edge masks, Codex repair task orchestration, and export gating for completed sticker assets.

**Architecture:** Keep Detect, Segment, Repair, and Export as separate product stages and code boundaries. Backend providers expose contracts; frontend components render stage-specific controls. Integration happens only after backend contracts and UI building blocks exist.

**Tech Stack:** FastAPI, Pydantic, Pillow, pytest, React 18, TypeScript, Vite, Vitest, Testing Library, existing Grounding DINO provider, SAM2-compatible provider contract.

---

## Current Baseline

Work branch: `codex/sticker-asset-pipeline`

Completed baseline commit:

```text
4971ca5 feat: add sticker workflow state
```

Task 1 is already done. Do not redo it. The baseline now includes:

- `WorkspaceState.detectionVocabulary`
- element fields `assetRole`, `removeFromParent`, `segmentationStatus`, `repairStatus`, `exportStatus`
- `backend/art_pipeline/vocabulary.py`
- `bucket` and `basin` in the default vocabulary

Baseline verification already observed:

- Backend full suite: `97 passed`
- Frontend full suite after dependency install: `76 passed`
- Script tests: `13 passed`

The remaining implementation must start from commit `4971ca5` or newer.

## Parallelization Rules

- Do not run two workers that edit the same file in the same wave.
- Workers are not alone in the codebase; they must not revert other changes.
- Workers must not scan or read `node_modules`.
- New backend tests go under `backend/tests/`.
- New frontend tests go under `frontend/tests/`.
- Backend routes are integration chokepoints; if two tasks need `api.py`, group them in one backend worker or run them in separate waves.
- Frontend `App.tsx` is an integration chokepoint; component workers should avoid wiring into `App.tsx` unless their wave explicitly owns integration.

## Wave 1: Parallel Foundations

Run these workers in parallel.

### Worker A: Backend Detect Contracts

**Owns:**

- `backend/art_pipeline/api.py`
- `backend/art_pipeline/click_detect.py`
- `backend/tests/test_detection_vocabulary_api.py`
- `backend/tests/test_click_detect_api.py`

**Goal:** Implement Task 2 and Task 3 together because both touch `api.py`.

**Required behavior:**

- Add `POST /api/workspace/detection-vocabulary`.
- Normalize and persist vocabulary using `normalize_detection_vocabulary`.
- Make `/api/workspace/detect` use `state.detectionVocabulary`.
- Add `sam2_provider` injection to `create_app`.
- Add `POST /api/workspace/click-detect`.
- Convert non-empty SAM2 mask bounds into a `click_detected` candidate.

**Tests to write and run:**

```bash
cd backend
python -m pytest tests/test_detection_vocabulary_api.py tests/test_click_detect_api.py -q
python -m pytest tests/test_detection_api.py -q
```

**Commit message:**

```bash
git commit -m "feat: add detection vocabulary and click detect APIs"
```

### Worker B: Frontend Detect Building Blocks

**Owns:**

- `frontend/src/workspace.ts`
- `frontend/src/components/DetectionVocabularyPanel.tsx`
- `frontend/src/components/CanvasToolbar.tsx`
- `frontend/src/components/CanvasStage.tsx`
- `frontend/tests/detection-workflow.test.tsx`

**Goal:** Implement the frontend pieces of Task 6 without final `App.tsx` integration.

**Required behavior:**

- Add frontend types for `AssetRole`, `SegmentationStatus`, `RepairStatus`, `ExportStatus`.
- Extend `CanvasTool` with `"click-detect"`.
- Default new fields in `normalizeWorkspaceState`.
- Create `DetectionVocabularyPanel`.
- Add `Click detect` toolbar control.
- Make `CanvasStage` emit source coordinates through `onClickDetectPoint` when the click-detect tool is active.
- Do not wire network calls in `App.tsx` in this wave.

**Tests to write and run:**

```bash
cd frontend
npm test -- --run tests/detection-workflow.test.tsx
```

**Commit message:**

```bash
git commit -m "feat: add detection UI building blocks"
```

### Worker C: Segment UI Building Blocks

**Owns:**

- `frontend/src/components/FloatingStageDrawer.tsx`
- `frontend/src/components/SegmentEdgeBoard.tsx`
- `frontend/src/components/PipelineRail.tsx`
- `frontend/src/styles.css`
- `frontend/tests/segment-workbench.test.tsx`

**Goal:** Implement Task 7 component and rail foundations without final `App.tsx` integration.

**Required behavior:**

- Create a resizable floating drawer component that overlays the canvas region.
- Create `SegmentEdgeBoard` with `Source crop`, `SAM2 edge mask`, `Transparent sticker`, `Suggest mask`, and `Accept mask`.
- Change `PipelineRail` to exactly five stages: Upload, Detect, Segment, Repair, Export.
- Ensure only one `.pipeline-stage.is-active` can exist.

**Tests to write and run:**

```bash
cd frontend
npm test -- --run tests/segment-workbench.test.tsx
```

**Commit message:**

```bash
git commit -m "feat: add segment workbench components"
```

## Wave 1 Review And Merge Gate

After all Wave 1 workers finish:

1. Review Worker A for backend contract correctness.
2. Review Worker B and C for component-only scope and no `App.tsx` wiring.
3. Merge or cherry-pick Worker A, B, C in this order.
4. Run:

```bash
cd backend
python -m pytest tests/test_detection_vocabulary_api.py tests/test_click_detect_api.py tests/test_detection_api.py -q

cd ../frontend
npm test -- --run tests/detection-workflow.test.tsx tests/segment-workbench.test.tsx
```

Proceed only if this gate is green.

## Wave 2: Parallel Backend Segment/Repair And Frontend Role UI

Run these workers in parallel after Wave 1 is merged.

### Worker D: Backend Segment, Repair, Export

**Owns:**

- `backend/art_pipeline/api.py`
- `backend/art_pipeline/segment_assets.py`
- `backend/art_pipeline/repair_tasks.py`
- `backend/art_pipeline/exporter.py`
- `backend/tests/test_segment_api.py`
- `backend/tests/test_sticker_repair_export.py`

**Goal:** Implement Tasks 4 and 5 together because both touch backend stage orchestration.

**Required behavior:**

- Add `POST /api/workspace/elements/{id}/segment/suggest`.
- Add `POST /api/workspace/elements/{id}/segment/accept`.
- Write `sam2_edge` source crop, mask, and transparent asset.
- Add parent removal repair contract generation using removable child masks.
- Add a Chinese WHY comment before parent repair branching.
- Enforce export gating for `embedded_keep`, `skip`, unrepaired parents, and unaccepted masks.

**Tests to write and run:**

```bash
cd backend
python -m pytest tests/test_segment_api.py tests/test_sticker_repair_export.py -q
python -m pytest tests/test_workspace_api.py -q
```

**Commit message:**

```bash
git commit -m "feat: add segment repair export backend"
```

### Worker E: Role Editing UI And API

**Owns:**

- `backend/art_pipeline/api.py`
- `backend/tests/test_element_role_api.py`
- `frontend/src/components/InspectorPanel.tsx`
- `frontend/tests/role-editor.test.tsx`

**Goal:** Implement Task 8. This worker overlaps `api.py` with Worker D, so it must work on an isolated branch/workspace and expect orchestrator merge conflict resolution.

**Required behavior:**

- Extend element patch API to accept `assetRole` and `removeFromParent`.
- Validate `removeFromParent` points to an existing element when supplied.
- Add inspector role select with `sticker`, `parent`, `removable_child`, `embedded_keep`, `skip`.
- Show parent selector only for `removable_child`.
- Add a Chinese WHY comment because role controls repair contracts and export gating.

**Tests to write and run:**

```bash
cd backend
python -m pytest tests/test_element_role_api.py -q

cd ../frontend
npm test -- --run tests/role-editor.test.tsx
```

**Commit message:**

```bash
git commit -m "feat: add asset role editor"
```

## Wave 2 Review And Merge Gate

After Wave 2 workers finish:

1. Merge Worker D first.
2. Merge Worker E second and resolve `api.py` conflicts intentionally.
3. Run:

```bash
cd backend
python -m pytest tests/test_segment_api.py tests/test_sticker_repair_export.py tests/test_element_role_api.py tests/test_workspace_api.py -q

cd ../frontend
npm test -- --run tests/role-editor.test.tsx
```

Proceed only if this gate is green.

## Wave 3: App Integration

Run this worker alone.

### Worker F: App Wiring And End-To-End UI Flow

**Owns:**

- `frontend/src/App.tsx`
- `frontend/src/workspace.ts`
- `frontend/src/styles.css`
- frontend tests needed for integrated behavior

**Goal:** Wire Wave 1 and Wave 2 pieces into the actual workbench.

**Required behavior:**

- Render `DetectionVocabularyPanel` after upload/source is present.
- Wire save vocabulary to `/api/workspace/detection-vocabulary`.
- Wire click-detect point to `/api/workspace/click-detect`.
- Render `FloatingStageDrawer` over the central canvas.
- Wire `SegmentEdgeBoard` suggest/accept actions to segment endpoints.
- Preserve existing manual bbox, split, merge, repair, and export workflows.
- Keep `bbox_alpha` available only as debug/fallback behavior, not primary UI copy.

**Tests to write and run:**

```bash
cd frontend
npm test -- --run tests/app-sticker-workflow.test.tsx
npm test -- --run
npm run build
```

**Commit message:**

```bash
git commit -m "feat: wire sticker asset workbench"
```

## Wave 4: Final Verification And Docs

Run this worker alone.

### Worker G: Final Verification And README

**Owns:**

- `README.md`
- final verification only

**Required behavior:**

- Document:

```text
Upload -> Detection Vocabulary -> Detect / Click Detect -> Segment Edge QA -> Repair -> Export
```

- State that `bbox_alpha` is a debug fallback and not a qualified sticker output.
- Run full verification.

**Commands:**

```bash
cd backend
python -m pytest tests -q

cd ../frontend
npm test -- --run
npm run build

cd ..
npm run test:scripts
```

**Commit message:**

```bash
git commit -m "docs: describe sticker asset workflow"
```

## Final Review

After Wave 4:

1. Run final full verification again from the integration worktree.
2. Dispatch one final code-review subagent over the whole diff.
3. Use `superpowers:finishing-a-development-branch`.

## Dependency Summary

```text
Task 1 done
├─ Wave 1A Backend Detect Contracts
├─ Wave 1B Frontend Detect Building Blocks
└─ Wave 1C Segment UI Building Blocks

Wave 1 merged
├─ Wave 2D Backend Segment/Repair/Export
└─ Wave 2E Role Editing UI/API

Wave 2 merged
└─ Wave 3F App Integration

Wave 3 merged
└─ Wave 4G Docs + Final Verification
```
