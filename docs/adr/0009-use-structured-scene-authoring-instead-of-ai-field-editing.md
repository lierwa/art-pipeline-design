# Use structured scene authoring instead of AI field editing

Chapter Scene Studio should expose author-facing structured sections for core scene intent, cast assignments, target and avoid lists, references, spatial contract, and generation notes. AI-generated planning fields and prompt-builder internals may seed or project those sections, but they should not be the main editing surface because authors need to manage chapter facts, not maintain a hidden prompt schema.

**Considered Options**

- Keep editing AI planning fields directly: fast to wire, but exposes internal schema names and lets prompt text become a competing fact source.
- Use structured authoring sections: requires better UI and mapping, but keeps durable chapter facts understandable and reusable.
