# Chapter AI Prompt main-flow repair ledger

This file is the only progress ledger for the repair. Counts refer to new or rewritten behavioral scenarios, not the pre-existing regression suite.

## Target flow

```text
Select 1–2 Character IPs + select a Scene Style Reference
→ generate the full Prompt Package
→ view/copy Empty Scene and Complete Scene prompts
→ submit feedback and regenerate
→ freeze prompt/reference snapshots on image upload
→ Assembly / Lock Final
```

## Protected user data

Never overwrite, reset, stage, or commit these current-workspace paths:

- `scene_library/global_reference_library/character_ips/character_ip_6347f69c2b39/`
- `scene_library/global_reference_library/character_ips/character_ip_a8f9c881ebee/`
- `scene_library/global_reference_library/character_ips/character_ip_d7b371465c4e/`
- `scene_library/global_reference_library/scene_style_references/`
- `scene_library/scene_packs/scene_pack_3cff5bc75d25/chapters/chapter_f09ad1c29d5f/scene_package/package.json`

## Progress

```text
Gate: G7/7
Tests: 已通过 51/51
Baseline debt: 已清算 5/5
Current blocker: Windows + macOS Actions 待 push/PR；当前分支领先远端 7 个提交，本机无 gh，未将 CI 配置误报为已运行
```

| Gate | Status | Behavioral scenarios | Delivery |
|---|---|---:|---|
| G0 Design cleanup | complete | 0 | CONTEXT, ADR, obsolete-patch disposition, baseline-failure classification |
| G1 Schema v2 and migration | complete | 6 backend | v1 JSON boundary migration and legacy model removal |
| G2 Cast Selection | complete | 8 backend | atomic 0–2 selection and validation |
| G3 AI Prompt Generator | complete | 10 backend | strict output, task/route, deterministic target ids |
| G4 Snapshot and readiness | complete | 8 backend | lineage snapshots, invalidation, Assembly/Final gates |
| G5 Frontend API and hook | complete | 6 frontend | types, APIs, race-safe async state |
| G6 Chapter main UI | complete | 13 frontend | one Prompt Generation panel and new status contract |
| G7 Acceptance | in progress | 0 | full tests, build, screenshots, CI, diff cleanup |

## Baseline audit

- Backend focused baseline on 2026-07-14: `54/54` passed. The earlier `32/32` estimate is stale; there is no backend blocker.
- Frontend focused baseline: scene-package API `8/8` passed; Chapter Workspace `1/6` passed with five pre-existing failures.
- Failure 1 and 2 match retired CSS strings and will be replaced by behavior-level layout coverage and screenshot acceptance.
- Failure 3 requires a retired local subtitle and will be rewritten around the Prompt status contract.
- Failure 4 requires the known-wrong `Assembly ready` state while no valid prompt exists and will be rewritten.
- Failure 5 requires a legacy loading-role structure and will be rewritten to protect the stable shell plus `Generating`/`Prompt setup` state behavior.
- Implementation must not restore old headings, old CSS grid declarations, or the incorrect Assembly-ready wording to make these tests pass.

## Gate discipline

For G1–G6: add failing tests, confirm the intended failure, make the minimum implementation pass, run the focused Gate tests, run cumulative completed-Gate regression, update this ledger, and create one Gate-specific commit. Do not mix the next Gate into the current commit.

G6 has an additional UI reuse constraint: the Prompt Generation surface must compose the repository's existing Course Planner primitives and installed mature-library primitives for buttons, selectors/drawers, tabs, textarea, status, panels, and notifications. Do not hand-roll a parallel component system; any new React component must be a business composition with an explicit Chapter Prompt responsibility.

## Acceptance commands

```powershell
cd backend
python -m pytest tests/course_planner/test_scene_package_prompt_generation.py tests/course_planner/test_scene_package_routes_prompt.py tests/course_planner/test_scene_package_assembly_validation.py -q

cd ../frontend
npm test -- --run tests/coursePlanner/chapter-prompt-generation.test.tsx tests/coursePlanner/course-planner-scene-package-api.test.ts tests/coursePlanner/chapter-workspace.test.tsx
npm test -- --run tests/coursePlanner
npm run build

cd ..
git diff --check
```

Cross-platform acceptance requires Windows and macOS install/build coverage in CI. Local success alone must not be reported as dual-platform verification.

## G7 local acceptance evidence

- Backend Course Planner suite: `206/206` passed on Windows.
- Frontend Course Planner suite: `232/232` passed on Windows.
- Frontend production build: passed (`tsc -b && vite build`).
- Browser screenshot gate: passed; Chapter visual shows one reused Prompt Generation surface with current `Prompt ready` state.
- Patch hygiene: `git diff --check` passed; only the protected Scene Library user data remains outside the seven commits.
- Cross-platform workflow: `.github/workflows/frontend-cross-platform.yml` contains `windows-latest` and `macos-latest` install/build jobs. The branch has not been pushed or opened as a PR, so remote runs remain pending.
