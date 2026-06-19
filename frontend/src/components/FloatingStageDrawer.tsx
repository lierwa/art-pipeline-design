import { CSSProperties, KeyboardEvent, PointerEvent, ReactNode, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

type FloatingStageDrawerProps = {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  defaultHeight?: number;
  minHeight?: number;
  maxHeight?: number;
  onClose?: () => void;
};

type ResizeDrag = {
  startClientY: number;
  startHeight: number;
};

type ClientYEvent = {
  clientY?: number;
  nativeEvent?: {
    clientY?: number;
  };
};

const DEFAULT_HEIGHT = 360;
const MIN_HEIGHT = 240;
const MAX_HEIGHT = 620;
const KEYBOARD_RESIZE_STEP = 24;

export function FloatingStageDrawer({
  title,
  children,
  actions,
  defaultHeight = DEFAULT_HEIGHT,
  minHeight = MIN_HEIGHT,
  maxHeight = MAX_HEIGHT,
  onClose,
}: FloatingStageDrawerProps) {
  const [height, setHeight] = useState(() => clamp(defaultHeight, minHeight, maxHeight));
  const resizeDragRef = useRef<ResizeDrag | null>(null);

  useEffect(() => {
    setHeight(clamp(defaultHeight, minHeight, maxHeight));
  }, [defaultHeight, minHeight, maxHeight]);

  function beginResize(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const clientY = readClientY(event);
    if (clientY === null) {
      return;
    }

    event.currentTarget.setPointerCapture?.(event.pointerId);
    resizeDragRef.current = {
      startClientY: clientY,
      startHeight: height,
    };
  }

  function updateResize(event: PointerEvent<HTMLDivElement>) {
    if (!resizeDragRef.current) {
      return;
    }
    const clientY = readClientY(event);
    if (clientY === null) {
      return;
    }

    // 底部浮层只维护自己的高度：上拖暴露更多分割细节，下拖把画布还给主体操作区。
    const delta = resizeDragRef.current.startClientY - clientY;
    setHeight(clamp(resizeDragRef.current.startHeight + delta, minHeight, maxHeight));
  }

  function endResize(event: PointerEvent<HTMLDivElement>) {
    resizeDragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function resizeByKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return;
    }
    event.preventDefault();
    const direction = event.key === "ArrowUp" ? 1 : -1;
    setHeight((currentHeight) => clamp(currentHeight + direction * KEYBOARD_RESIZE_STEP, minHeight, maxHeight));
  }

  return (
    <aside
      aria-label={title}
      className="floating-stage-drawer"
      role="dialog"
      style={{
        "--stage-drawer-height": `${height}px`,
      } as CSSProperties}
    >
      <div
        aria-label={`Resize ${title} drawer height`}
        aria-orientation="horizontal"
        aria-valuemax={maxHeight}
        aria-valuemin={minHeight}
        aria-valuenow={height}
        className="floating-stage-drawer-resize-handle"
        onKeyDown={resizeByKeyboard}
        onPointerCancel={endResize}
        onPointerDown={beginResize}
        onPointerMove={updateResize}
        onPointerUp={endResize}
        role="separator"
        tabIndex={0}
      />
      <div className="floating-stage-drawer-header">
        <div>
          <span>Stage workbench</span>
          <h2>{title}</h2>
        </div>
        <div className="floating-stage-drawer-actions">
          {actions}
          {onClose ? (
            <button
              aria-label={`Close ${title} drawer`}
              className="shared-icon-button"
              onClick={onClose}
              type="button"
            >
              <X aria-hidden="true" size={16} />
            </button>
          ) : null}
        </div>
      </div>
      <div className="floating-stage-drawer-body">{children}</div>
    </aside>
  );
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function readClientY(event: ClientYEvent): number | null {
  if (typeof event.clientY === "number" && Number.isFinite(event.clientY)) {
    return event.clientY;
  }
  if (typeof event.nativeEvent?.clientY === "number" && Number.isFinite(event.nativeEvent.clientY)) {
    return event.nativeEvent.clientY;
  }
  return null;
}
