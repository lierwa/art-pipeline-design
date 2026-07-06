# Use shared art-pipeline authoring protocols for Course Planner assembly

Status: accepted

Course Planner Assembly authoring must reuse or extract the existing art-pipeline authoring protocols for canvas/list selection, drag ordering, and tree movement instead of maintaining a parallel simplified Assembly interaction model. The Assembly surface may keep a domain adapter that maps Chapter Scene Assembly placements, groups, and `layer_order` into shared canvas/tree inputs, but selection semantics, canvas/list synchronization, and move interpretation must stay shared with the main art-pipeline editor.

**Considered Options**

- Keep the current Assembly-specific `AssemblyLayerTree` and canvas selection handlers: fastest locally, but duplicates interaction rules already solved in the main editor and leaves multi-select, grouping, and layer ordering inconsistent.
- Reuse only low-level libraries such as `CanvasStage` and `react-arborist`: preserves visual similarity, but still forks the product interaction contract.
- Reuse or extract the main authoring protocols with an Assembly domain adapter: adds adapter work, but keeps one source of truth for editor behavior while preserving the Chapter Scene Assembly manifest as the runtime contract.

**Consequences**

- Assembly groups remain authoring metadata for selection, organization, and batch operations; runtime export continues to consume flattened `placements + layer_order`.
- The Chapter Asset Pool should prioritize verified pipeline run assets associated with the Chapter and materialize selected outputs into chapter-owned assets; direct upload remains a secondary source.
- Tests that protect hidden Course Planner navigation, flat-only layer trees, direct-upload-only assets, or single-selection Assembly behavior must be removed or rewritten instead of preserved as compatibility behavior.
- This decision refines ADR-0001, ADR-0013, and ADR-0016 by resolving their practical overlap: direct upload is supported, pipeline-derived assets are primary when verified, and shared art-pipeline interaction protocols are mandatory for Assembly authoring.
