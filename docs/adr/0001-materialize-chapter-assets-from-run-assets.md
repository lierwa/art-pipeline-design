# Defer chapter asset materialization from run assets

Pipeline runs produce multi-step asset outputs, but the current Chapter Scene Studio does not yet have a real run-asset picker that can verify which generated asset is being selected. The product must not ask authors to hand-enter run asset ids or create fake lineage. Until that picker exists, Chapter Assets are direct uploads only.

When a verified Run Asset picker is added later, adding a Pipeline Run Asset should materialize a chapter-owned asset copy and keep lineage back to the verified source instead of treating the run directory as the asset authority. Added chapter assets should not auto-sync when their source run asset changes; authors must explicitly replace a chapter asset from its source if they want the newer output.
