# Support direct Scene Asset upload

Scene Assets can come from either pipeline-harvested Complete Scene Images or direct single-object uploads. The pipeline remains the main path when Image2 produces useful complete scenes, but direct upload is a first-class path because authors may already have clean object art and should not be forced through a fake complete-image run.

**Considered Options**

- Require every Scene Asset to come from a pipeline run: keeps lineage uniform, but makes authors wrap existing object art in unnecessary workflow steps.
- Support pipeline harvest and direct upload: adds one more source type, but matches the real production need and keeps the Chapter Asset Pool focused on usable object images.
