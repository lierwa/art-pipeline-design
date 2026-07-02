# Use canvas and tree libraries for assembly authoring

Assembly authoring should not implement its own selection, transform, grouping, z-order, or layer-tree engine. Use a mature open-source canvas editor library for the Assembly Canvas and reuse the existing tree-view pattern for the Assembly Layer Tree; the first design target is `tldraw` for canvas editing and `react-arborist` for layer/resource hierarchy because they cover image shapes, transforms, grouping, z-order operations, persistence hooks, and draggable hierarchical trees. The engine-agnostic Chapter Scene Assembly Manifest remains the runtime contract; any editor snapshot is only an authoring cache and must not become the Cocos/Flutter data protocol. Runtime manifest consumers receive flattened placement transforms and layer order; groups remain optional authoring metadata.

References:
- https://github.com/tldraw/tldraw
- https://tldraw.dev/sdk-features/groups
- https://tldraw.dev/examples/z-order
- https://tldraw.dev/docs/persistence
- https://react-arborist.netlify.app/
