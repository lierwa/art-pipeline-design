# Reuse art-pipeline canvas for assembly authoring

Status: accepted

Assembly authoring must directly reuse the existing art-pipeline canvas interaction implementation for resource listing, selection, pan, zoom, drag, resize, layer/list selection, and properties synchronization. `tldraw` is removed from the Assembly main interaction path because it created a second editor fact source and encouraged a partial shell around incomplete interactions; the Chapter Scene Assembly Manifest remains the domain contract.

The Assembly canvas should also reuse the visual structure and styling conventions of the art-pipeline main canvas: `canvas-panel`, `canvas-stage`, `canvas-artboard`, viewport pan/zoom shell, overlay boxes, handles, and toolbar density. It must not keep the tldraw container, tldraw watermark, tldraw zoom controls, or tldraw selection chrome.

The shared canvas toolbar should move only as far as a lightweight capability configuration, not a full plugin framework. Common actions such as select, pan, zoom, fit, undo, and redo are shared; scene-specific actions are supplied by each surface. If the extraction cost is too high for the first pass, Assembly may use a thin wrapper that reuses the same state and visual primitives, but it must not duplicate the interaction state machine.

Assembly keeps the base right-click interaction pattern from the art-pipeline canvas, but its context menu only exposes Assembly actions such as editing, renaming, layer order changes, duplication, and removal. Pipeline-only actions such as child creation, splitting, accept/reject, repair, masking, or generation must not appear in the Assembly authoring surface.

The right-side placement list is a replacement for the failed Assembly Layers panel, not an incremental cleanup of its buttons. It must provide canvas/list selection synchronization and z-order control over the manifest `layer_order`; it must not inherit the existing add/copy/up/down/delete/eye/lock/more toolbar UI unless those actions are reintroduced as real Assembly commands.

The right rail places the selected placement properties above the placement list, but the list remains the dominant region. Properties take roughly 35% of the rail and expose only high-frequency editing fields such as name, role, position, size, and rotation; the placement/layer list takes roughly 65% and owns z-order work. Low-frequency details such as target-object coverage and dependencies should not expand the primary properties area by default.
