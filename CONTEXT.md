# Domain Glossary

## Scene Category

A planning-level grouping that contains multiple chapters under a shared setting or intent. It is not the final playable scene artifact for a chapter.
_Avoid_: Scene, when referring to a chapter's final image package.

## Chapter Scene Package

The chapter-owned image package for one playable scene. It includes the Chapter Scene Prompt, locked Empty Base Scene, Complete Scene Images, Chapter Asset Pool, and Chapter Scene Assembly. It is a child resource of its Chapter, not a global package.

## Chapter Scene Prompt

The prompt generated or authored for a chapter and used with visual references to produce scene images in ChatGPT/Image2. The prompt is an input to image creation, not the final scene package.

## Prompt Ready

The state where a Chapter Scene Prompt and its reference list are ready to copy for external ChatGPT/Image2 image creation. Prompt Ready is independent from whether any generated image has been uploaded.

## Target Object List

The author-editable list of objects the Complete Scene Images should try to include for a chapter. It may be initialized from chapter planning data, but the Chapter Scene Package owns the current list.

## Chapter Scene Package Progress

The chapter-facing progress state derived from its Chapter Scene Package. It replaces Prompt Version progress as the chapter's primary production status.

## Chapter Scene Studio

The chapter-facing workspace for authoring a Chapter Scene Package. It keeps one stable workspace shape while the package moves from base-scene setup to asset relationship management and final assembly.

## Chapter Scene Assembly

A chapter-level final scene definition composed from one accepted empty base scene and a pool of reusable scene assets. A chapter owns one current Chapter Scene Assembly; future scene upgrades are outside the current domain model. The assembly is the authority for where assets belong in the playable scene, including each asset's intended position and visual stacking order.

## Chapter Scene Assembly Manifest

The engine-agnostic data contract for a Chapter Scene Assembly. It records the Empty Base Scene, placed Scene Assets, groups, spatial transforms, and visual order so runtimes such as Cocos or Flutter can recreate the playable scene without depending on the authoring editor's internal document format.

## Assembly Group

An author-created group of placed scene assets inside a Chapter Scene Assembly. Groups are used to select, move, and organize multiple placements together.

## Assembly Layer Tree

The tree panel for placed scene assets and Assembly Groups in a Chapter Scene Assembly. It controls hierarchy, grouping, and visual order for the assembly.

## Empty Base Scene

The chapter's manually locked current background scene without the interactive movable assets that learners are expected to place. It must preserve the chapter's spatial structure and art style while leaving target areas clear enough for asset placement. It can be explicitly replaced, but the current Empty Base Scene is always the required reference for Complete Scene Images.

## Empty Base Scene Candidate

A candidate background image produced from the Chapter Scene Prompt and visual references before manual selection as the chapter's Empty Base Scene. In the current workflow, the image may be created in ChatGPT/Image2 and uploaded back into the system with a prompt and reference snapshot.

## Scene Asset

A reusable object available to the chapter's asset pool for placement in the Chapter Scene Assembly. How the asset is extracted, regenerated, or materialized belongs to the independent art pipeline boundary.

## Chapter Asset Pool

The set of Scene Assets currently materialized into a chapter and available for the chapter's assembly canvas. Chapter assets keep lineage to their source Pipeline Run Assets, but they are owned by the chapter once added.

## Pipeline Run Asset

An asset produced by a pipeline run. A pipeline run can produce multiple assets over several steps, and those assets are managed separately from the Chapter Asset Pool until their relationship to the current chapter is authored.

## Run Asset Relationship Panel

The chapter-facing panel that manages the relationship between Pipeline Run Assets and the current Chapter Asset Pool. A Pipeline Run Asset has at most one added relationship to the current chapter.

The panel only manages pipeline runs associated with the current Chapter Scene Package in the first version.

## Complete Scene Image

A full scene image produced after the Empty Base Scene is locked, using that base scene plus the Chapter Scene Prompt and visual references. It adds as many target Scene Assets as practical while preserving the same room geometry, camera, scale, outline style, and low-shadow lighting. In the current workflow, the image may be created in ChatGPT/Image2 and uploaded back into the system with a prompt, reference, and variation snapshot.

Each Complete Scene Image is processed through its own pipeline run when assets are harvested from it.

## Variation Prompt

A free-text instruction added when producing another Complete Scene Image from the same Empty Base Scene. It nudges visual differences between attempts without becoming a structured placement, region, or object-rule model.

## Scene Spatial Contract

The chapter-level visual contract anchored by the locked Empty Base Scene. Complete Scene Images must preserve the same room shell, camera angle, wall-floor relationship, scale language, and weak-or-no-shadow lighting so extracted Scene Assets can be assembled back into the same playable scene.

## Scene Asset Placement

The authored placement of a Scene Asset inside the Empty Base Scene. It records the asset's position, size, rotation, and stacking order as the domain truth used to judge whether gameplay placement is correct. Placement zones and orientation rules are not current domain rules; an asset belongs wherever the authored Chapter Scene Assembly places it.
