# Use chapter lists as prompt constraint authority

Target Object List, Avoid Object List, and Scene Spatial Contract are the durable authorities for prompt constraints in a Chapter Scene Package. Per-generation notes can nudge one external Image2 attempt, but the UI should not maintain a second long-lived Must Keep/Avoid list because that creates competing facts for the same chapter.

**Considered Options**

- Keep Prompt Tuning Must Keep/Avoid as independent fields: convenient for quick prompt editing, but it duplicates the preview's object and constraint facts.
- Use chapter-level lists and spatial contract as the authorities: requires clearer structured editing, but prevents prompt text from becoming a shadow data model.
