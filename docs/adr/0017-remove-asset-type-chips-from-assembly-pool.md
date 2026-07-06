# Remove asset type chips from the assembly pool

Status: accepted

The Assembly asset pool should not expose `All`, `Target`, `Prop`, or `Scene` category chips, and it should not expose a grid/list toggle. The current model only has target-object linkage and used/unused state; treating those as asset categories created misleading UI, especially because `Scene Asset` is the domain name for every placeable asset rather than a filter category. The pool uses one grid presentation until there is a real second browsing mode with distinct author value.

Asset cards have a primary action: unused cards add the asset to the assembly, while used cards select and locate the existing placement. Secondary operations such as upload, duplicate, and delete stay explicit controls.
