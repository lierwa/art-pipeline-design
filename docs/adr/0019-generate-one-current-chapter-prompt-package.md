# Generate one current Chapter Prompt Package

## Status

Accepted. This decision supersedes the author-edited prompt facts and readiness decisions in ADR 0008, ADR 0009, and ADR 0011. Those files remain as historical records; their runtime model and UI are retired.

## Context

The previous Chapter Scene Package stored role labels, action intent, editable prompt text, readiness confirmations, target/avoid lists, and a Prompt Projection as peer facts. This created multiple authorities for the same scene direction and made it possible for the UI, Assembly, and uploaded-image lineage to disagree.

The required workflow is selection-first: choose one or two existing Character IPs and one Scene Style Reference, then ask the existing synchronous AI task boundary to generate a coherent Empty Scene Prompt and Complete Scene Prompt together. Users refine the result through feedback and regeneration rather than editing projected text.

## Decision

- `ChapterScenePackage` uses schema version 2 and stores an atomic `selected_character_ip_ids` list with a maximum of two entries.
- Prompt generation requires one or two selected characters and a Scene Style Reference. Saved drafts may select zero characters.
- `GeneratedChapterPromptPackage` is the single current authority for both prompt strings, the spatial contract, character actions, target objects, avoid objects, generation feedback, reference snapshot, and generation timestamp.
- The AI output is validated with strict Pydantic models at the provider boundary. FastAPI request bodies also use Pydantic models, so invalid cardinality and extra protocol fields fail before persistence.
- Generation reuses `CodexJsonProvider` and `run_ai_task`; no queue, version manager, registry, or new dependency is introduced.
- Stable Target Object ids are derived deterministically from the generated target labels so Assembly coverage does not churn across equivalent regenerations.
- Empty/Complete uploads and Lock Final freeze the relevant prompt and reference snapshot. Local uploads without a generated prompt remain allowed and are marked as having no prompt lineage; Lock Final requires a current, valid package.
- A change to selected characters, their current Model Sheets, Scene Style Reference, current Empty Scene Image, or global reference images invalidates the current package.
- The UI exposes one Prompt Generation panel with selection, generation state, read-only prompt tabs, copy, feedback, and regeneration. It removes Role, Action, Prompt Facts, and Save Prompt Facts surfaces.

## Existing patch disposition

- Delete: `ChapterCastAssignment`, `role_label`, `action_intent`, `ChapterScenePrompt`, `PromptReadinessConfirmation`, Prompt Projection helpers/routes, per-character bind/remove routes, and their obsolete tests.
- Rewrite: package migration, readiness/status derivation, upload snapshots, Lock Final validation, frontend API/hook state, and Chapter Workspace tests.
- Keep: Chapter Seed, global Character IP and Scene Style libraries, Assembly manifest/placements/groups, media records, Chapter Assets, and immutable Final Scene snapshots. Their facts are not duplicated; they consume the v2 package contract.

## Basis

- Pydantic v2 recommends validation through typed models and `model_validate`, with model configuration such as `extra="forbid"` for strict boundaries: <https://docs.pydantic.dev/latest/concepts/models/>
- FastAPI's official request-body pattern uses Pydantic models for JSON parsing, validation, and schema generation: <https://fastapi.tiangolo.com/tutorial/body/>
- React documents effect cleanup/ignored results to prevent earlier async responses from overwriting state for a newer identity: <https://react.dev/reference/react/useEffect#fetching-data-with-effects>
- UUID v5 is the standard name-based deterministic identifier mechanism defined by RFC 9562 and exposed by Python's standard library: <https://docs.python.org/3/library/uuid.html#uuid.uuid5>

## Trade-offs

One current package is intentionally simpler than prompt version management. Historical reproducibility lives only where it matters—on uploaded media and published Final Scene snapshots. Regeneration replaces the editable current package, while AI failure leaves the last successful package untouched.
