# Task 1 Report: Backend Domain Models For Chapter Scene Studio

## Scope completed

- Updated `backend/art_pipeline/course_planner/scene_package_models.py`
- Updated `backend/art_pipeline/course_planner/models.py`
- Updated `backend/tests/course_planner/test_scene_package_models.py`
- Updated `backend/tests/course_planner/test_models.py`

This task stayed inside the Task 1 file boundary. I did not edit frontend, routes, media store, or store lifecycle files.

## TDD log

### RED

I rewrote the focused model tests first, then ran:

```bash
cd backend
uv run --python 3.12 --extra dev pytest tests/course_planner/test_scene_package_models.py -q
```

The run failed during collection with:

- `ImportError: cannot import name 'CharacterIpProfile' from 'art_pipeline.course_planner.models'`

After adding the shared library models, the next red failure surfaced the old scene-package imports that still happen during package initialization:

- `ImportError: cannot import name 'ChapterSceneReference' from 'art_pipeline.course_planner.scene_package_models'`

That confirmed the new contract was not yet implemented and that package import still traverses old store modules.

### GREEN

After replacing the domain model surface and tightening the tests around the new contract, I reran the focused verification:

```bash
cd backend
uv run --python 3.12 --extra dev pytest tests/course_planner/test_scene_package_models.py tests/course_planner/test_models.py -q
```

Result:

- `34 passed in 0.32s`

## What changed

### 1. Shared library models in `models.py`

Added:

- `ReferenceLibraryImage`
- `CharacterIpProfile`

These provide the reusable character/reference-library authority required by the new chapter scene workflow.

### 2. Replaced the scene package domain model surface

Reworked `scene_package_models.py` from the old:

- `locked_base_candidate_id`
- `base_candidate_id`
- `references`
- `base_candidates`

to the new chapter-scene-studio contract centered on:

- `current_empty_scene_image_id`
- `empty_scene_image_id`
- `empty_scene_images`
- `cast_assignments`
- `reference_selections`
- `avoid_objects`
- `final_scene`

Added/updated models:

- `ChapterScenePrompt`
- `PromptReadinessConfirmation`
- `ChapterCastAssignment`
- `ChapterReferenceSelection`
- `ImageReferenceSnapshot`
- `EmptySceneImage`
- `CompleteSceneImage`
- `ChapterAssetLineage`
- `FinalChapterScene`
- `ChapterScenePackage`

### 3. Prompt readiness logic now checks confirmed facts

`is_prompt_ready(package)` now requires:

- non-empty `prompt_text`
- at least one cast assignment with character id, action intent, and reference ids
- at least one target object
- avoid-object review confirmation
- non-empty spatial contract
- either a selected style reference or `style_reference_mode == "confirmed_empty"`

### 4. Prompt projection renamed to the new domain vocabulary

Added:

- `build_empty_scene_prompt(package, libraries=None)`
- `build_complete_prompt(package, libraries=None)`

The projection now uses the new prompt facts and can optionally project character/reference-library facts into the prompt text.

### 5. Assembly validation now uses empty-scene authority

Replaced the old locked-base validator with `_empty_scene_reference_errors(package)`, so placement manifests must match `current_empty_scene_image_id` when placements exist.

### 6. Lineage validation distinguishes direct upload vs pipeline asset

`ChapterAssetLineage` now validates:

- `direct_upload` cannot include run-asset fields
- `pipeline_run_asset` must include `source_run_id` and `source_run_asset_id`

## Focused test coverage now locks down

- clean default chapter-scene-studio package state
- prompt readiness positive path
- prompt readiness negative path
- optional `empty_scene_image_id` on complete images
- direct-upload lineage vs run-asset lineage
- prompt projection with confirmed facts
- assembly validation for:
  - empty-scene mismatch
  - missing layer-order coverage
  - missing dependency ids
  - dependency cycles
  - unavailable assets
- shared library model defaults

## Notable implementation choice

I kept a very narrow compatibility shim inside `scene_package_models.py`:

- `ChapterSceneReference = ChapterReferenceSelection`
- `EmptyBaseSceneCandidate = EmptySceneImage`
- `build_base_prompt = build_empty_scene_prompt`

Reason:

- `art_pipeline.course_planner.__init__` still imports store modules, and those modules still import the old names during Task 1 test collection.
- This shim is intentionally import-only compatibility so focused model tests can validate the new domain model without editing Task 2 files early.
- Later Task 2/3 work should delete these aliases once store/route imports move to the new contract.

## Concerns / follow-up for later tasks

- Broader route/store flows were not updated in Task 1 and may still fail until later tasks replace the old scene-package contract end to end.
- The import compatibility aliases should be removed after Task 2 migrates the store/route layer to the new empty-scene naming.

## Task Reviewer Findings Requiring Fix

Critical:
- Remove compatibility aliases that re-expose `ChapterSceneReference`, `EmptyBaseSceneCandidate`, and `build_base_prompt` from `scene_package_models.py`.

Important:
- Prompt projection cannot fall back to raw character/reference ids. Character/reference prompt text must require library records and fail loudly when a selected id is missing.
- Media-bearing models must reuse existing media/storage-path validation helpers where that applies to model data, especially storage paths.

Minor:
- Restore manifest validator tests for duplicate `layer_order` entries and unknown group placement references.

## Reviewer rejection fix

### Fix summary

- Removed the Task 1 compatibility aliases from `scene_package_models.py` and switched `backend/art_pipeline/course_planner/__init__.py` to lazy-load `CoursePlannerStore`, so model imports no longer depend on legacy store names during package import.
- Tightened prompt projection to require library payloads whenever cast assignments or reference selections participate in projection, and now raise `ScenePackageValidationError` when a selected character or reference id is missing from the library authority.
- Extracted the shared relative-POSIX storage-path validation rules into `backend/art_pipeline/course_planner/media_storage_paths.py`, reused them in `scene_package_media.py`, and applied the same authority to media-bearing models in `models.py` and `scene_package_models.py`.
- Restored focused model coverage for duplicate `layer_order`, unknown group placement references, missing-library prompt projection, missing selected-library ids, and invalid media storage paths.

### Tests run and results

- `cd /Users/guojunxi/Desktop/work/art-pipeline-design/backend && uv run --python 3.12 --extra dev pytest tests/course_planner/test_scene_package_models.py tests/course_planner/test_models.py -q`
  - Result: `43 passed in 0.15s`
- `git diff --check`
  - Result: no output

### Regex gate result

- `rg -n "EmptyBaseSceneCandidate|ChapterSceneReference|build_base_prompt|locked_base|base_candidate|base_candidates" backend/art_pipeline/course_planner/scene_package_models.py backend/tests/course_planner/test_scene_package_models.py`
  - Result: no output

### Files changed

- `backend/art_pipeline/course_planner/__init__.py`
- `backend/art_pipeline/course_planner/media_storage_paths.py`
- `backend/art_pipeline/course_planner/models.py`
- `backend/art_pipeline/course_planner/scene_package_media.py`
- `backend/art_pipeline/course_planner/scene_package_models.py`
- `backend/tests/course_planner/test_models.py`
- `backend/tests/course_planner/test_scene_package_models.py`

## Task 1 Re-review Findings Requiring Fix

Critical:
- `scene_package_media.py` still maps `references` / `base_candidates` even though the new `ChapterScenePackage` exposes `reference_selections` / `empty_scene_images`. Remove old media kind names from the touched runtime helper and make it match the new model surface.

Important:
- `scene_package_models.py` and `test_scene_package_models.py` exceed the repo `文件 ≤ 500 行` hard constraint. Split cohesive logic/tests without changing the public model interface.

## Task 1 Second Re-review Fix

### Fix summary

- Removed legacy scene-package media kind aliases from `backend/art_pipeline/course_planner/scene_package_media.py`; the helper now addresses `empty_scene_images`, `complete_images`, `chapter_assets`, `assets`, and `final_scene` only.
- Split prompt readiness and prompt projection into `backend/art_pipeline/course_planner/scene_package_prompt_projection.py`, then re-exported `is_prompt_ready`, `build_empty_scene_prompt`, and `build_complete_prompt` from `scene_package_models.py` to preserve the public import surface.
- Split assembly helpers into `backend/art_pipeline/course_planner/scene_package_assembly_validation.py`, then re-exported `frontmost_layer_id` and `validate_assembly_manifest` from `scene_package_models.py`.
- Split the oversized backend tests into focused contract, prompt-projection, and assembly-validation files, with shared factories in `backend/tests/course_planner/scene_package_model_helpers.py`.

### Tests run and results

- `cd /Users/guojunxi/Desktop/work/art-pipeline-design/backend && uv run --python 3.12 --extra dev pytest tests/course_planner/test_scene_package_models.py tests/course_planner/test_scene_package_prompt_projection.py tests/course_planner/test_scene_package_assembly_validation.py tests/course_planner/test_models.py -q`
  - Result: `48 passed in 0.22s`
- `git diff --check`
  - Result: no output

### File line counts

- `217 backend/art_pipeline/course_planner/scene_package_models.py`
- `176 backend/art_pipeline/course_planner/scene_package_prompt_projection.py`
- `194 backend/art_pipeline/course_planner/scene_package_assembly_validation.py`
- `242 backend/tests/course_planner/test_scene_package_models.py`
- `110 backend/tests/course_planner/test_scene_package_prompt_projection.py`
- `110 backend/tests/course_planner/test_scene_package_assembly_validation.py`
- `257 backend/tests/course_planner/scene_package_model_helpers.py`

### Regex gate result

- `rg -n "references|base_candidates|base-candidates|locked_base|base_candidate|EmptyBaseSceneCandidate|ChapterSceneReference|build_base_prompt" backend/art_pipeline/course_planner/scene_package_models.py backend/art_pipeline/course_planner/scene_package_media.py backend/tests/course_planner/test_scene_package_models.py backend/tests/course_planner/test_scene_package_prompt_projection.py backend/tests/course_planner/test_scene_package_assembly_validation.py`
  - Result: no output

### Files changed

- `backend/art_pipeline/course_planner/scene_package_media.py`
- `backend/art_pipeline/course_planner/scene_package_models.py`
- `backend/art_pipeline/course_planner/scene_package_prompt_projection.py`
- `backend/art_pipeline/course_planner/scene_package_assembly_validation.py`
- `backend/tests/course_planner/test_scene_package_models.py`
- `backend/tests/course_planner/test_scene_package_prompt_projection.py`
- `backend/tests/course_planner/test_scene_package_assembly_validation.py`
- `backend/tests/course_planner/scene_package_model_helpers.py`
