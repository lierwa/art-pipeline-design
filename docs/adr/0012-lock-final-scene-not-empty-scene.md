# Lock the final scene, not the empty scene

Chapter production exists because a direct Image2 output is not reliable enough to be the final chapter asset. Empty Scene Images provide the background layer and assembly canvas context, but the locked chapter asset is the Final Chapter Scene produced from the Empty Scene Image plus placed Scene Assets.

**Considered Options**

- Lock an Empty Scene Image first: gives the assembly a stable background, but incorrectly makes one ingredient look like the chapter authority.
- Lock the composed Final Chapter Scene: matches the product goal and keeps Empty Scene Images as assembly ingredients rather than final assets.
