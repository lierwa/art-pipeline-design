# Codex Final Minimal Quality Harness

Status: active baseline after removing the failed `fidelity_local` path.

## Purpose

This harness prevents another bad generation-flow rewrite from silently promoting intermediate artifacts as final art.

## Tests Already Enforced

- `backend/tests/test_codex_final_finalize.py::test_generate_codex_final_asset_requires_provider_raw_output_for_normal_asset`
  - Normal final generation must call the provider.
  - The final output must come from `codex_raw.png` through postprocess, not from local mask/crop reuse.

- `backend/tests/test_codex_final_task_near_copy.py::test_codex_final_batch_defers_near_copy_validation_to_ingest`
  - Batch generation must queue Codex jobs and defer candidate validation to ingest.
  - A rough near-copy cannot be marked succeeded before a provider candidate exists.

- `backend/tests/test_codex_final_task_api.py::test_codex_final_batch_prepares_agent_jobs_without_running_provider`
  - Task preparation creates manifest and handoff files.
  - The backend does not call the provider directly during controller-backed batch generation.

- `backend/tests/test_workspace_generate_workflow_api.py::test_stage_generate_prepares_agent_jobs_without_codex_provider`
  - The Generate stage creates queued Codex jobs instead of fake local success.

- `backend/tests/test_workspace_generate_workflow_api.py::test_stage_generate_launches_codex_controllers_for_run`
  - The real stage/generate route still launches controllers after queue preparation.

## Next Visual Harness

The next change must add an offline visual harness before any prompt/layout rewrite:

- run the seven user-visible regression assets as a fixed fixture set;
- save source crop, mask cutout, raw candidate, final PNG, and quality report into one contact sheet;
- fail if final alpha bbox center drifts beyond the mask center threshold;
- fail if candidate visible area is an extreme outlier;
- fail if grouped assets lose mask components or reorder component centroids;
- fail if final image is lower resolution than the accepted mask crop;
- fail if parent repair leaves unchanged hole pixels.

## Non-Goal

This harness does not claim the current prompt produces good art. It only prevents a broken shortcut from being accepted as success again.
