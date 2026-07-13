# Domain Glossary

## Scene Category

A planning-level grouping that contains multiple chapters under a shared setting or intent. It is not the final playable scene artifact for a chapter.
_Avoid_: Scene, when referring to a chapter's final image package.

## Chapter Scene Package

The chapter-owned image package for one playable scene. It includes the selected Character IP ids, one Scene Style Reference selection, the current Generated Chapter Prompt Package, Empty Scene Images, Complete Scene Images, Chapter Asset Pool, Chapter Scene Assembly, and Final Chapter Scene. It is a child resource of its Chapter, not a global package.

## Generated Chapter Prompt Package

The current AI-generated, read-only pair of Empty Scene Prompt and Complete Scene Prompt plus their spatial contract, selected-character directions, target/avoid objects, generation feedback, and reference snapshot. A chapter keeps only one current prompt package; uploaded images and the Final Chapter Scene preserve immutable lineage snapshots.

## Empty Scene Prompt

The generated prompt for the room shell, layout, camera, style, and negative constraints. It excludes characters and detachable target objects so the result can serve as the Chapter Scene Assembly background.

## Complete Scene Prompt

The generated prompt that includes exactly the selected Character IPs, their AI-authored actions, target objects, spatial relationships, style constraints, and the current Empty Scene Image when one exists.

## Character IP

A globally reusable character identity defined by a name and one Character Model Sheet. It is selected into chapter work; it is not defined from scratch inside a Chapter Scene Prompt.

## Character Model Sheet

The single authoritative image for one Character IP, showing multiple views of that same character in one image. Individual views are not separate authoritative reference assets.
_Avoid_: Character reference gallery, per-view reference set.

## Character IP Library

The shared catalog of Character IPs available across all Scene Categories and Chapters. It owns each character's name and Character Model Sheet.

## Chapter Cast Selection

The chapter-specific atomic selection of zero to two Character IP ids. Zero characters is a valid saved draft; prompt generation requires one or two. Role labels and action intent are not authored here: the AI generates one action for each selected character in the current Generated Chapter Prompt Package.

## Scene Style Reference

A globally reusable named image that provides the visual style reference when a Chapter generates its prompt package. It is visual input for generation, not a text-based style profile or ruleset.
_Avoid_: Scene Style Profile, Style Rules, generic Reference Image.

## Scene Style Reference Library

The shared catalog of Scene Style References available across all Scene Categories and Chapters. Each entry owns only its name and one reference image.

## Chapter Scene Style Selection

The Chapter-specific selection of one Scene Style Reference for its prompt package. The Chapter references the global asset instead of copying or redefining it.

## Prompt Ready

The state where the current Generated Chapter Prompt Package still matches the Chapter Seed, selected Character IPs and their current Model Sheets, selected Scene Style Reference, current Empty Scene Image, and global reference images used to generate it. Changing any of those inputs makes the package stale and requires regeneration.

## Prompt Lineage

The immutable prompt text and reference snapshot captured when an Empty Scene Image, Complete Scene Image, or Final Chapter Scene is created. A locally prepared upload may explicitly have no prompt lineage, but Lock Final requires a current valid Generated Chapter Prompt Package.

## Target Object List

The AI-generated list of detachable objects the Complete Scene Images should include and the Chapter Scene Assembly must cover or explicitly exempt. The current Generated Chapter Prompt Package is its single authority; Assembly consumes the package-level projection rather than maintaining another target list.

## Avoid Object List

The AI-generated list of objects, hazards, or visual patterns that should not appear. The current Generated Chapter Prompt Package is its single authority.

## Generation Feedback

Optional user feedback passed back to the AI when regenerating the entire prompt package. Prompts remain read-only; feedback requests a coherent replacement instead of editing one projected string in place.

## Chapter Scene Package Progress

The chapter-facing progress state derived from its Chapter Scene Package. It is the chapter's primary production status.

## Chapter Scene Studio

The chapter-facing workspace for authoring a Chapter Scene Package. It keeps one stable workspace shape while the package moves from prompt setup through source-image processing, asset relationship management, assembly, and final scene locking.

## Chapter Scene Assembly

A chapter-level scene definition composed from one Empty Scene Image and a pool of reusable Scene Assets. A chapter owns one current Chapter Scene Assembly; future scene upgrades are outside the current domain model. The assembly is the authority for where assets belong in the playable scene, including each asset's intended position and visual stacking order.

## Assembly Authoring Surface

The editor surface used to author Scene Asset Placements for a Chapter Scene Assembly. It follows the art-pipeline canvas interaction model directly; third-party editor document models are implementation details and must not define the product interaction vocabulary.
_Avoid_: tldraw canvas, placement editor shell.

## Chapter Scene Assembly Manifest

The engine-agnostic data contract for a Chapter Scene Assembly. It records the Empty Scene Image, placed Scene Assets, groups, spatial transforms, and visual order so runtimes such as Cocos or Flutter can recreate the playable scene without depending on the authoring editor's internal document format.

## Assembly Group

An author-created group of placed scene assets inside a Chapter Scene Assembly. Groups are used to select, move, and organize multiple placements together.

## Assembly Layer Tree

The tree panel for placed scene assets and Assembly Groups in a Chapter Scene Assembly. It controls hierarchy, grouping, and visual order for the assembly.

## Empty Scene Image

The chapter's background scene image without the movable target objects that will be assembled later. It is the background layer and coordinate reference for Chapter Scene Assembly, but it is not the final locked chapter asset by itself.

## Empty Scene Image Candidate

A candidate Empty Scene Image produced or uploaded before one is selected for the Chapter Scene Assembly. In the current workflow, the image may be created in ChatGPT/Image2 and uploaded back into the system with a prompt and reference snapshot.

## Final Chapter Scene

The chapter's final published visual asset produced from a Chapter Scene Assembly snapshot. It is the composed result of the Empty Scene Image plus placed Scene Assets, not a raw Image2 output or an Empty Scene Image by itself.

## Lock Final

The action that publishes the current Chapter Scene Assembly as a Final Chapter Scene snapshot. It does not make the assembly editor immutable; later edits happen in the assembly draft and require another Lock Final action to replace the current published final.

## Scene Asset

A reusable object image available to the chapter's asset pool for placement in the Chapter Scene Assembly. A Scene Asset may be harvested from a Complete Scene Image through a pipeline run or uploaded directly when the author already has a clean single-object image.

## Direct Scene Asset Upload

An author-supplied single-object image added directly to the Chapter Asset Pool without first passing through a Complete Scene Image and pipeline run. It is a first-class source for Scene Assets, not a debug shortcut.

## Chapter Asset Pool

The set of Scene Assets currently materialized into a chapter and available for the chapter's assembly canvas. Chapter assets keep lineage to their source Pipeline Run Assets or direct upload source, but they are owned by the chapter once added.

## Chapter Asset Card

An asset-pool item with a primary click action. Clicking an unused card adds it to the Chapter Scene Assembly; clicking a used card selects and locates its existing Scene Asset Placement.
_Avoid_: display-only asset card.

## Chapter Asset Pool Filter

The asset pool supports search and used/unused status, but it does not expose type-category chips or view-mode toggles. Target-object linkage is coverage metadata for readiness, not a browsing taxonomy; the pool uses a single grid presentation for browsing.
_Avoid_: Target asset filter, Prop asset filter, Scene asset filter, list mode.

## Pipeline Run Asset

An asset produced by a pipeline run. A pipeline run can produce multiple assets over several steps, and those assets are managed separately from the Chapter Asset Pool until their relationship to the current chapter is authored.

## Run Asset Relationship Panel

The chapter-facing panel that manages the relationship between Pipeline Run Assets and the current Chapter Asset Pool. A Pipeline Run Asset has at most one added relationship to the current chapter.

The panel only manages pipeline runs associated with the current Chapter Scene Package in the first version.

## Complete Scene Image

A full scene image generated or uploaded as source material for harvesting Scene Assets and visual ideas. It should preserve the chapter's spatial contract and include useful target objects, but it is not the final chapter asset.

Each Complete Scene Image is processed through its own pipeline run when assets are harvested from it.

## Variation Prompt

A free-text instruction added when producing another Complete Scene Image. It nudges visual differences between attempts without becoming a structured placement, region, or object-rule model.

## Scene Spatial Contract

The chapter-level visual contract for room shell, camera angle, wall-floor relationship, scale language, and weak-or-no-shadow lighting. It keeps Empty Scene Images, generated source images, and the Chapter Scene Assembly compatible without making any raw generated image the final authority.

## Scene Asset Placement

The authored placement of a Scene Asset inside the Chapter Scene Assembly. It records the asset's position, size, rotation, and stacking order as the domain truth used to judge whether gameplay placement is correct. Placement zones and orientation rules are not current domain rules; an asset belongs wherever the authored Chapter Scene Assembly places it.

## Target Object Exemption

An explicit author decision that a Target Object will not appear in the current Chapter Scene Assembly. It prevents missing target objects from being mistaken for completed assembly work.
