# Domain Glossary

## Scene Category

A planning-level grouping that contains multiple chapters under a shared setting or intent. It is not the final playable scene artifact for a chapter.
_Avoid_: Scene, when referring to a chapter's final image package.

## Chapter Scene Package

The chapter-owned image package for one playable scene. It includes the Chapter Scene Prompt, reference selections, Empty Scene Images, Complete Scene Images, Chapter Asset Pool, Chapter Scene Assembly, and Final Chapter Scene. It is a child resource of its Chapter, not a global package.

## Chapter Scene Prompt

The prompt generated or authored for a chapter and used with visual references to produce scene images in ChatGPT/Image2. The prompt is an input to image creation, not the final scene package.

## Prompt Projection

A copy-ready text rendering derived from Chapter Scene Package facts such as Character IP selections, references, target objects, avoid objects, Generation Notes, and the Scene Spatial Contract. It is not a separate authoring source for those facts.

## Character IP

A reusable character identity with stable visual and personality invariants. It is selected into chapter work; it is not defined from scratch inside a single Chapter Scene Prompt.

## Character IP Library

The shared catalog of Character IPs available across chapters. The library owns the identity facts for characters such as names, visual invariants, personality cues, and character reference images.

## Chapter Cast Assignment

The chapter-specific assignment of a Character IP to a role and action intent inside a Chapter Scene Package. It may add scene-local direction, but it must reference a Character IP rather than restating the character identity as free text.

## Reference Image

A reusable image asset used as visual evidence for character identity, style, or scene composition. A Reference Image can be selected into a Chapter Scene Package, but its asset facts are not authored inside prompt text.

## Reference Library

The shared catalog of Reference Images available to course-planning work. It owns reusable visual assets such as Character IP references, style references, and scene references.

## Chapter Reference Selection

The chapter-specific selection of Reference Images used by a Chapter Scene Package. It records which library images participate in the current chapter prompt and what role each image plays for that chapter.

## Prompt Ready

The state where a Chapter Scene Prompt has enough confirmed chapter facts to project a copy-ready external ChatGPT/Image2 prompt. Prompt Ready is independent from whether any generated image has been uploaded, and empty selections only count as ready when the author has explicitly confirmed that nothing is needed for that area.

## Confirmed Empty Selection

An author-confirmed decision that a normally optional list, such as avoid objects or extra style references, should be empty for the current chapter. It is different from an unreviewed blank value.

## Target Object List

The author-editable list of objects the Complete Scene Images should try to include for a chapter. It is the chapter's authority for desired object coverage and may be initialized from chapter planning data, but the Chapter Scene Package owns the current list.

## Avoid Object List

The author-editable list of objects, hazards, or visual patterns that should not appear in Complete Scene Images for a chapter. It is the chapter's authority for object-level exclusions.

## Generation Note

A short, optional instruction for one external ChatGPT/Image2 generation attempt. It can emphasize or nudge the next result, but it is not the authority for target objects, avoid objects, Character IP identity, references, or the Scene Spatial Contract.

## Chapter Scene Package Progress

The chapter-facing progress state derived from its Chapter Scene Package. It replaces Prompt Version progress as the chapter's primary production status.

## Chapter Scene Studio

The chapter-facing workspace for authoring a Chapter Scene Package. It keeps one stable workspace shape while the package moves from prompt setup through source-image processing, asset relationship management, assembly, and final scene locking.

## Chapter Scene Assembly

A chapter-level scene definition composed from one Empty Scene Image and a pool of reusable Scene Assets. A chapter owns one current Chapter Scene Assembly; future scene upgrades are outside the current domain model. The assembly is the authority for where assets belong in the playable scene, including each asset's intended position and visual stacking order.

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
