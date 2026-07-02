# Materialize chapter assets from run assets

Pipeline runs produce multi-step asset outputs, but Chapter Scene Assemblies are course authoring artifacts that must remain stable after runs are retried, cleaned up, or archived. When a Pipeline Run Asset is added to a chapter, the chapter materializes its own asset copy and keeps lineage back to the run asset instead of treating the run directory as the asset authority. Added chapter assets do not auto-sync when their source run asset changes; authors must explicitly replace a chapter asset from its source if they want the newer output.
