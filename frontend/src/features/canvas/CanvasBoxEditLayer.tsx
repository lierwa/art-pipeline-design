import type { KeyboardEvent, PointerEvent } from "react";

import type { SourceMetadata } from "../../domain/workspace";
import {
  RESIZE_HANDLES,
  type ResizeHandle,
  canvasObjectBoxToPercentStyle,
} from "./canvasStageGeometry";
import type { CanvasObjectView } from "../canvasObjects";

type CanvasBoxEditLayerProps = {
  canvasObjects: CanvasObjectView[];
  canRotateObjects: boolean;
  editingElementId: string | null;
  hasUnsavedBoxEdit: boolean;
  source: SourceMetadata;
  onBeginBoxMove: (event: PointerEvent<HTMLDivElement>, object: CanvasObjectView) => void;
  onBeginBoxResize: (
    event: PointerEvent<HTMLButtonElement>,
    object: CanvasObjectView,
    handle: ResizeHandle,
  ) => void;
  onBeginBoxRotate: (event: PointerEvent<HTMLButtonElement>, object: CanvasObjectView) => void;
  onCancelBoxEdit: () => void;
  onConfirmBoxEdit: () => void;
  onEditKeyDown: (event: KeyboardEvent<HTMLDivElement>, object: CanvasObjectView) => void;
  onOpenElementContextMenu: (elementId: string, position: { x: number; y: number }) => void;
  onResizeKeyDown: (
    event: KeyboardEvent<HTMLButtonElement>,
    object: CanvasObjectView,
    handle: ResizeHandle,
  ) => void;
  onSelectElement: (elementId: string) => void;
  onUpdateBoxEdit: (event: PointerEvent<HTMLElement>) => void;
  onEndBoxEdit: (event: PointerEvent<HTMLElement>) => void;
};

export function CanvasBoxEditLayer({
  canvasObjects,
  canRotateObjects,
  editingElementId,
  hasUnsavedBoxEdit,
  source,
  onBeginBoxMove,
  onBeginBoxResize,
  onBeginBoxRotate,
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
      {canvasObjects.map((object) => {
        if (editingElementId !== object.id) {
          return null;
        }

        return (
          <div
            key={`${object.id}-edit`}
            className="overlay-item overlay-item-edit-controls"
            style={canvasObjectBoxToPercentStyle(object.box, source)}
          >
            <div
              aria-label={`Edit ${object.displayName} box`}
              className="canvas-edit-region"
              data-canvas-edit-region="true"
              data-element-id={object.id}
              data-testid={`canvas-edit-region-${object.id}`}
              role="region"
              tabIndex={0}
              onKeyDown={(event) => onEditKeyDown(event, object)}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onSelectElement(object.id);
                onOpenElementContextMenu(object.id, { x: event.clientX, y: event.clientY });
              }}
              onPointerDown={(event) => onBeginBoxMove(event, object)}
              onPointerMove={onUpdateBoxEdit}
              onPointerUp={onEndBoxEdit}
              onPointerCancel={onEndBoxEdit}
            >
              {RESIZE_HANDLES.map((handle) => (
                <button
                  key={handle}
                  type="button"
                  aria-label={`Resize ${object.displayName} box ${handle}`}
                  className={`resize-handle resize-handle-${handle}`}
                  data-element-id={object.id}
                  data-resize-handle={handle}
                  data-testid={`resize-handle-${object.id}-${handle}`}
                  onKeyDown={(event) => onResizeKeyDown(event, object, handle)}
                  onPointerDown={(event) => onBeginBoxResize(event, object, handle)}
                  onPointerMove={onUpdateBoxEdit}
                  onPointerUp={onEndBoxEdit}
                  onPointerCancel={onEndBoxEdit}
                />
              ))}
              {canRotateObjects ? (
                <button
                  type="button"
                  aria-label={`Rotate ${object.displayName} placement`}
                  className="rotate-handle"
                  data-element-id={object.id}
                  data-rotate-handle="true"
                  data-testid={`rotate-handle-${object.id}`}
                  onPointerDown={(event) => onBeginBoxRotate(event, object)}
                  onPointerMove={onUpdateBoxEdit}
                  onPointerUp={onEndBoxEdit}
                  onPointerCancel={onEndBoxEdit}
                />
              ) : null}
            </div>
            {hasUnsavedBoxEdit ? (
              <div
                aria-label={`Confirm ${object.displayName} box edit`}
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
