# Codex Final Fidelity-First Cleanup Failure Record

Status: superseded and removed on 2026-06-26.

## What Failed

The attempted `fidelity_local` path promoted `source_crop + accepted_mask` cutouts directly into final assets. User verification showed this made the output worse: blurry crops, incomplete shapes, wrong perspective, and parent assets with visible holes.

This was not a valid production finalization strategy. It reused intermediate segmentation/reference pixels as if they were finished art.

## Code Disposition

- Removed the normal `fidelity_local` finalization path.
- Removed `backend/art_pipeline/codex_final_fidelity.py`.
- Removed `backend/tests/test_codex_final_fidelity.py`.
- Restored the invariant that normal Codex final jobs must produce a provider `codex_raw.png`, then pass postprocess and quality gates before promotion.
- Kept bounded parent repair plumbing only as a constrained compositing step after a real provider candidate, because it isolates changed pixels to removed-child holes.

## Guardrail Going Forward

Deterministic mask/crop artifacts may be used as diagnostic references, geometry measurements, or QA inputs. They must not become final assets unless a separate visual-quality workflow proves that output is production-ready.

The next valid plan must start from a minimal test harness that catches:

- provider bypass for normal assets;
- blurred or low-resolution final output;
- subject bbox drift such as a small plant landing in the upper-right corner;
- grouped asset order and perspective drift;
- parent repair no-op or visible holes.
