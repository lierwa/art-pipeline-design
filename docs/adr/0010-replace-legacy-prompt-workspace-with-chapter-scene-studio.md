# Remove legacy prompt workspace in favor of Chapter Scene Studio

The Course Planner chapter workspace should remove the legacy prompt/image authoring flow instead of patching it or exposing it as a compatibility surface. Every visible button, event, route, state field, test fixture, and runtime code path in the chapter workspace must justify itself against the current Chapter Scene Studio workflow: Chapter Scene Package facts, Prompt Projections, Empty Scene Images, Complete Scene Images, pipeline runs, Chapter Assets, and assembly. If a piece exists only for an obsolete workflow or a speculative compatibility story, remove it rather than hiding it.

**Considered Options**

- Patch the existing Tune Prompt and Edit Design drawers: smaller short-term change, but it keeps character identity, references, object constraints, and prompt internals tangled in text fields.
- Keep a read-only legacy surface: preserves old inspection paths, but leaves a user-visible maintenance burden for a retired workflow and invites future work to keep depending on it.
- Replace the authoring surface with Chapter Scene Studio and remove old entry points: larger migration, but it keeps the system clean and makes every exposed action belong to the durable chapter-scene package model.
