# Use Character IP library for reusable character identity

Character identity is owned by a shared Character IP Library, not by per-chapter prompt text. A Chapter Cast Assignment selects a Character IP and adds only the scene-local role and action intent, because Image2 prompts need stable visual reference facts for recurring characters while chapters still need freedom to stage those characters differently.

**Considered Options**

- Per-chapter free-text character entry: easier to build, but it makes names such as "Tuantuan" meaningless to the system unless every chapter repeats the same identity facts and reference images.
- Shared Character IP Library: adds a catalog surface, but gives recurring characters one authoritative identity source across chapters.
