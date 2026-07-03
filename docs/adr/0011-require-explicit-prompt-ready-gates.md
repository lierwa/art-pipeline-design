# Require explicit Prompt Ready gates

Prompt Ready requires confirmed Character IP selections, chapter cast actions, character references, target objects, avoid-object confirmation, a Scene Spatial Contract, and either style references or an explicit no-extra-style-reference decision. Empty values must distinguish "not handled yet" from "confirmed empty" so the Studio does not generate a Prompt Projection from accidental blanks.

**Considered Options**

- Treat missing optional fields as acceptable defaults: faster to move through the UI, but it hides missing author intent and lets bad prompts look ready.
- Require explicit readiness gates: adds small confirmation steps, but makes prompt generation depend on known chapter facts rather than ambiguous empty text.
