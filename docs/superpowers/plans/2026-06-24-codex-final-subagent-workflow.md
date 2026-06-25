# Codex Final Subagent Workflow Plan

> Required execution style: use `superpowers:subagent-driven-development` task by task, with independent spec and quality review before moving on.

## Goal

Replace backend-driven parallel `codex cli` final generation with a Codex desktop subagent workflow.

Backend owns deterministic state, manifests, prompts, visual briefs, raw-output ingestion, post-processing, and task updates. Codex parent/subagents own only expensive image generation and return selected raw image paths plus QA notes.

## Architecture Decisions

- Backend must not spawn subagents; Codex desktop is the agent execution layer.
- Generate-stage backend task changes from “run Codex” to “prepare jobs and wait for agent raw output”.
- Existing task statuses remain compatible: waiting jobs use `running` plus the message `Waiting for Codex agent raw image.`
- `CodexCliAssetProvider` stays as a low-level compatibility/test seam, but batch stage orchestration must not call it.
- Visual brief is a machine-readable task map, not a prompt restatement: it must show source crop, rough cutout, accepted mask contour, target bounds, and child exclude/fill regions.

## Backend Contracts

Task artifacts:

- `tasks/<task_id>/codex-final-jobs.json`
- `tasks/<task_id>/codex-final-agent-handoff.md`

Job states:

- `ready_for_agent`
- `agent_running`
- `raw_ready`
- `finalized`
- `failed`
- `skipped`

Ingest endpoint:

```http
POST /api/workspace/tasks/{task_id}/codex-final/jobs/{element_id}/ingest
```

Request:

```json
{
  "selectedSourcePath": "/absolute/path/to/$CODEX_HOME/generated_images/.../ig_*.png",
  "qaNote": "Candidate preserves angle and removes excluded child.",
  "codexThreadId": "<thread id if visible>"
}
```

## Task Checklist

- [x] Task 1: add `codex_final_jobs.py` manifest models, path helpers, atomic read/write tests.
- [x] Tasks 2-3: add visual brief rendering, prompt/input-role authority, prepare/finalize split, and manifest job reconstruction.
- [x] Task 4: replace backend parallel Codex batch with agent-prepared jobs and handoff manifest.
- [ ] Task 5: add ingest route that finalizes one job from subagent raw output and updates task/manifest/state.
- [ ] Task 6: surface waiting state and manifest/handoff/brief metadata in frontend task/generate UI.
- [ ] Task 7: run full backend/frontend verification, commit, and push.

## Task 5 Acceptance

- Successful ingest finalizes one job, writes `generation.json`, updates `state.json`, marks the item `succeeded`, and returns `{ task, state, job, generation }`.
- Unknown task id returns 404.
- Unknown element id returns 404.
- Missing selected source path returns 400.
- Finalization failure marks only that item failed, updates manifest job to `failed`, and keeps sibling items running.
- Task becomes `succeeded` when all items are succeeded or skipped.

## Task 6 Acceptance

- A running Codex final task item with manifest artifacts displays as waiting for agent output.
- Expanded task details show Manifest, Agent handoff, Brief image, Prompt, and Raw output paths.
- Generate review metadata shows Brief image, Manifest, and Agent handoff when present.

## Verification Gates

Backend:

```bash
.venv/bin/python -m pytest backend/tests/test_codex_final_task_api.py backend/tests/test_workspace_generate_workflow_api.py backend/tests/test_workspace_tasks_api.py backend/tests/test_workspace_workflow_api.py backend/tests/test_codex_final_jobs.py backend/tests/test_codex_final_assets.py backend/tests/test_codex_final_brief.py backend/tests/test_codex_final_finalize.py backend/tests/test_codex_final_task_near_copy.py -q
```

Frontend:

```bash
cd frontend
npm test -- --run tests/app-workspace-tasks.test.tsx tests/generate-stage-ui.test.tsx
npm run build
```
