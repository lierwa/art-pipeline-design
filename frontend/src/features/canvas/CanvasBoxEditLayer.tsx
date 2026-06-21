import type { KeyboardEvent, PointerEvent } from "react";

import type { SourceMetadata, WorkspaceElement } from "../../domain/workspace";
import {
  RESIZE_HANDLES,
  type ResizeHandle,
  boxToPercentStyle,
} from "./canvasStageGeometry";

type CanvasBoxEditLayerProps = {
  editingElementId: string | null;
  hasUnsavedBoxEdit: boolean;
  overlayElements: WorkspaceElement[];
  source: SourceMetadata;
  onBeginBoxMove: (event: PointerEvent<HTMLDivElement>, element: WorkspaceElement) => void;
  onBeginBoxResize: (
    event: PointerEvent<HTMLButtonElement>,
    element: WorkspaceElement,
    handle: ResizeHandle,
  ) => void;
  onCancelBoxEdit: () => void;
  onConfirmBoxEdit: () => void;
  onEditKeyDown: (event: KeyboardEvent<HTMLDivElement>, element: WorkspaceElement) => void;
  onOpenElementContextMenu: (elementId: string, position: { x: number; y: number }) => void;
  onResizeKeyDown: (
    event: KeyboardEvent<HTMLButtonElement>,
    element: WorkspaceElement,
    handle: ResizeHandle,
  ) => void;
  onSelectElement: (elementId: string) => void;
  onUpdateBoxEdit: (event: PointerEvent<HTMLElement>) => void;
  onEndBoxEdit: (event: PointerEvent<HTMLElement>) => void;
};

export function CanvasBoxEditLayer({
  editingElementId,
  hasUnsavedBoxEdit,
  overlayElements,
  source,
  onBeginBoxMove,
  onBeginBoxResize,
  onCancelBoxEdit,
  onConfirmBoxEdit,
  onEditKeyDown,
  onEndBoxEdit,
  onOpenElementContextMenu,
  onResizeKeyDown,
  onSelectElement,
  onUpdateBoxEdit,
}: CanvasBoxEditLayerProps) {
  return (
    <div className="canvas-interaction-layer">
      {overlayElements.map((element) => {
        if (editingElementId !== element.id) {
          return null;
        }

        return (
          <div
            key={`${element.id}-edit`}
            className="overlay-item overlay-item-edit-controls"
            style={boxToPercentStyle(element.bbox, source)}
          >
            <div
              aria-label={`Edit ${element.name} box`}
              className="canvas-edit-region"
              data-canvas-edit-region="true"
              data-element-id={element.id}
              data-testid={`canvas-edit-region-${element.id}`}
              role="region"
              tabIndex={0}
              onKeyDown={(event) => onEditKeyDown(event, element)}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onSelectElement(element.id);
                onOpenElementContextMenu(element.id, { x: event.clientX, y: event.clientY });
              }}
              onPointerDown={(event) => onBeginBoxMove(event, element)}
              onPointerMove={onUpdateBoxEdit}
              onPointerUp={onEndBoxEdit}
              onPointerCancel={onEndBoxEdit}
            >
              {RESIZE_HANDLES.map((handle) => (
                <button
                  key={handle}
                  type="button"
                  aria-label={`Resize ${element.name} box ${handle}`}
                  className={`resize-handle resize-handle-${handle}`}
                  data-element-id={element.id}
                  data-resize-handle={handle}
                  data-testid={`resize-handle-${element.id}-${handle}`}
                  onKeyDown={(event) => onResizeKeyDown(event, element, handle)}
                  onPointerDown={(event) => onBeginBoxResize(event, element, handle)}
                  onPointerMove={onUpdateBoxEdit}
                  onPointerUp={onEndBoxEdit}
                  onPointerCancel={onEndBoxEdit}
                />
              ))}
            </div>
            {hasUnsavedBoxEdit ? (
              <div
                aria-label={`Confirm ${element.name} box edit`}
                className="box-edit-confirmation"
                role="group"
                onPointerDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <span>Box changed</span>
                <button type="button" onClick={onConfirmBoxEdit}>
                  Apply box edit
                </button>
                <button type="button" onClick={onCancelBoxEdit}>
                  Cancel box edit
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
