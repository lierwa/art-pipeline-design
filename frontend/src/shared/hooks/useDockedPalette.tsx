import { DndContext, useDraggable, type DragEndEvent } from "@dnd-kit/core";
import { useCallback, useRef, type CSSProperties, type HTMLAttributes, type MutableRefObject, type ReactNode } from "react";

export type PaletteSnapEdge = "top" | "right" | "bottom" | "left";
export type PaletteSnap = {
  edge: PaletteSnapEdge;
  offset: number;
};

type DockedPaletteOptions = {
  children: (props: DockedPaletteRenderProps) => ReactNode;
  frameSelector?: string;
  onDockChange?: (dock: PaletteSnap) => void;
};

type DockedPaletteRenderProps = {
  dragHandleProps: Omit<HTMLAttributes<HTMLElement>, "ref"> & { ref: (node: HTMLElement | null) => void };
  isDragging: boolean;
  paletteStyle?: CSSProperties;
  setPaletteNode: (node: HTMLElement | null) => void;
};

const draggableId = "segment-mask-edit-tools";
const PALETTE_SAFE_MARGIN = 16;
export const DEFAULT_PALETTE_SNAP: PaletteSnap = { edge: "right", offset: 96 };

export function DockedPaletteDndContext({
  children,
  frameSelector = ".segment-edge-preview-frame",
  onDockChange,
}: DockedPaletteOptions) {
  const paletteRef = useRef<HTMLElement | null>(null);
  const dragStartRectRef = useRef<DOMRect | null>(null);

  function handleDragStart() {
    dragStartRectRef.current = paletteRef.current?.getBoundingClientRect() ?? null;
  }

  function handleDragEnd(event: DragEndEvent) {
    const target = paletteRef.current;
    const startRect = dragStartRectRef.current;
    const frameRect = target?.closest(frameSelector)?.getBoundingClientRect();
    dragStartRectRef.current = null;
    if (!startRect || !frameRect) {
      return;
    }
    // WHY: dnd-kit 只负责拖拽生命周期；吸附规则保持成纯函数，方便测试并避免 UI 组件私自推导坐标协议。
    const centerX = startRect.left + startRect.width / 2 + event.delta.x;
    const centerY = startRect.top + startRect.height / 2 + event.delta.y;
    onDockChange?.(resolvePaletteSnap(frameRect, { width: startRect.width, height: startRect.height }, centerX, centerY));
  }

  return (
    <DndContext onDragEnd={handleDragEnd} onDragStart={handleDragStart}>
      <DockedPaletteDraggable paletteRef={paletteRef}>{children}</DockedPaletteDraggable>
    </DndContext>
  );
}

function DockedPaletteDraggable({
  children,
  paletteRef,
}: {
  children: (props: DockedPaletteRenderProps) => ReactNode;
  paletteRef: MutableRefObject<HTMLElement | null>;
}) {
  const { attributes, isDragging, listeners, setActivatorNodeRef, setNodeRef, transform } = useDraggable({
    id: draggableId,
  });
  const setPaletteNode = useCallback(
    (node: HTMLElement | null) => {
      paletteRef.current = node;
      setNodeRef(node);
    },
    [paletteRef, setNodeRef],
  );
  const paletteStyle = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <>
      {children({
        dragHandleProps: {
          ...attributes,
          ...listeners,
          ref: setActivatorNodeRef,
        },
        isDragging,
        paletteStyle,
        setPaletteNode,
      })}
    </>
  );
}

export function resolvePaletteSnap(
  rect: DOMRect,
  paletteSize: { width: number; height: number },
  clientX: number,
  clientY: number,
): PaletteSnap {
  const candidates: Array<{ edge: PaletteSnapEdge; distance: number }> = [
    { edge: "left", distance: Math.abs(clientX - rect.left) },
    { edge: "right", distance: Math.abs(rect.right - clientX) },
    { edge: "top", distance: Math.abs(clientY - rect.top) },
    { edge: "bottom", distance: Math.abs(rect.bottom - clientY) },
  ];
  const closest = candidates.reduce((best, candidate) => candidate.distance < best.distance ? candidate : best);
  if (closest.edge === "left" || closest.edge === "right") {
    return {
      edge: closest.edge,
      offset: clampOffset(rect.bottom - clientY - paletteSize.height / 2, rect.height - paletteSize.height),
    };
  }
  return {
    edge: closest.edge,
    offset: clampOffset(rect.right - clientX - paletteSize.width / 2, rect.width - paletteSize.width),
  };
}

function clampOffset(value: number, max: number): number {
  return Math.round(Math.min(Math.max(PALETTE_SAFE_MARGIN, value), Math.max(PALETTE_SAFE_MARGIN, max - PALETTE_SAFE_MARGIN)));
}
