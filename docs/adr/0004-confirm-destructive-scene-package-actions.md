# Confirm destructive scene package actions

Any scene-package action that deletes, removes, clears, or replaces user-authored data must require a second confirmation. This includes deleting uploaded images, removing chapter assets, clearing placements through base replacement, or unlinking assets from the current chapter; the extra friction is intentional because these actions can discard authoring work that is hard to reconstruct. The implementation should reuse the existing confirmation component or interaction pattern instead of introducing a bespoke confirmation UI.
