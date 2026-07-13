import { vi } from "vitest";

// WHY: jsdom 没有 PointerEvent，而生产端 dnd-kit 依赖 PointerSensor；在依赖加载前补齐
// 最小浏览器协议，确保 Assembly 拖放测试走真实组件事件而不是自制业务入口。
if (!window.PointerEvent) {
  class TestPointerEvent extends MouseEvent {
    readonly isPrimary: boolean;
    readonly pointerId: number;
    readonly pointerType: string;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.isPrimary = init.isPrimary ?? false;
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? "";
    }
  }
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: TestPointerEvent,
  });
}

vi.mock("react-arborist", async () => {
  const React = await import("react");

  type TreeNodeData = {
    id: string;
    name?: string;
    kind?: "group" | "placement";
    children?: TreeNodeData[];
  };

  type MockNode = {
    id: string;
    data: TreeNodeData;
    isLeaf: boolean;
    isInternal: boolean;
    isOpen: boolean;
    isSelected: boolean;
    childIndex: number;
    parent: MockNode | null;
    toggle: () => void;
    isDragging: boolean;
    willReceiveDrop: boolean;
  };

  function buildNodes(
    data: TreeNodeData[],
    selection: string[] | string | null | undefined,
    parent: MockNode | null = null,
    depth = 0,
  ): Array<{ node: MockNode; depth: number }> {
    const selectedIds = new Set(Array.isArray(selection) ? selection : selection ? [selection] : []);
    return data.flatMap((item, index) => {
      const node: MockNode = {
        id: item.id,
        data: item,
        isLeaf: !Array.isArray(item.children) || item.children.length === 0,
        isInternal: Array.isArray(item.children) && item.children.length > 0,
        isOpen: true,
        isSelected: selectedIds.has(item.id),
        childIndex: index,
        parent,
        toggle: () => undefined,
        isDragging: false,
        willReceiveDrop: false,
      };
      return [
        { node, depth },
        ...(item.children ? buildNodes(item.children, selection, node, depth + 1) : []),
      ];
    });
  }

  const Tree = React.forwardRef(function Tree({
    className,
    children,
    data,
    onMove,
    selection,
  }: {
    className?: string;
    children: (props: {
      node: MockNode;
      style: React.CSSProperties;
      dragHandle: () => void;
      tree: { selectedIds: Set<string> };
    }) => React.ReactNode;
    data: TreeNodeData[];
    onMove?: (args: { dragIds: string[]; parentId: string | null; index: number }) => void;
    selection?: string[] | string | null;
  }, ref: React.ForwardedRef<{ open: (id: string) => void; scrollTo: (id: string) => void }>) {
    const flatNodes = buildNodes(data, selection);
    const selectedIds = new Set(Array.isArray(selection) ? selection : selection ? [selection] : []);

    React.useImperativeHandle(ref, () => ({
      open: () => undefined,
      scrollTo: () => undefined,
    }), []);

    (globalThis as typeof globalThis & {
      __mockArboristMove?: (args: { dragIds: string[]; parentId: string | null; index: number }) => void;
    }).__mockArboristMove = onMove;

    return (
      <div className={className} data-testid="mock-arborist-tree">
        {flatNodes.map(({ node, depth }) => (
          <div key={node.id} data-depth={depth}>
            {children({
              node,
              style: { paddingLeft: `${depth * 16}px` },
              dragHandle: () => undefined,
              tree: { selectedIds },
            })}
          </div>
        ))}
      </div>
    );
  });

  return { Tree };
});

vi.mock("@dnd-kit/core", async () => {
  const React = await import("react");
  type DndRecord = { id: string; data: { current: unknown } };
  type DndHandlers = {
    onDragEnd?: (event: { active: DndRecord; over: DndRecord | null }) => void;
    onDragOver?: (event: { active: DndRecord; over: DndRecord | null }) => void;
    onDragStart?: (event: { active: DndRecord }) => void;
  };
  const droppables = new Map<string, { data: unknown; node: HTMLElement | null }>();
  let active: DndRecord | null = null;
  let pending: DndRecord | null = null;
  let handlers: DndHandlers = {};

  function DndContext({ children, ...nextHandlers }: DndHandlers & { children: React.ReactNode }) {
    handlers = nextHandlers;
    React.useEffect(() => {
      function startDrag() {
        if (!pending || active) {
          return;
        }
        active = pending;
        handlers.onDragStart?.({ active });
      }
      function finishDrag(event: PointerEvent) {
        if (!active) {
          pending = null;
          return;
        }
        const overEntry = [...droppables.entries()].find(([, entry]) => {
          const rect = entry.node?.getBoundingClientRect();
          return Boolean(rect
            && event.clientX >= rect.left
            && event.clientX <= rect.right
            && event.clientY >= rect.top
            && event.clientY <= rect.bottom);
        });
        const over = overEntry
          ? { id: overEntry[0], data: { current: overEntry[1].data } }
          : null;
        handlers.onDragOver?.({ active, over });
        handlers.onDragEnd?.({ active, over });
        active = null;
        pending = null;
      }
      document.addEventListener("pointermove", startDrag);
      document.addEventListener("pointerup", finishDrag);
      return () => {
        document.removeEventListener("pointermove", startDrag);
        document.removeEventListener("pointerup", finishDrag);
        active = null;
        pending = null;
        droppables.clear();
      };
    }, []);
    return <>{children}</>;
  }

  function useDraggable({ id, data }: { id: string; data: unknown }) {
    return {
      attributes: {},
      isDragging: active?.id === id,
      listeners: {
        onPointerDown: () => {
          pending = { id, data: { current: data } };
        },
      },
      setNodeRef: () => undefined,
    };
  }

  function useDroppable({ id, data }: { id: string; data: unknown }) {
    return {
      isOver: false,
      setNodeRef: (node: HTMLElement | null) => {
        droppables.set(id, { data, node });
      },
    };
  }

  return {
    closestCenter: () => [],
    DndContext,
    DragOverlay: () => null,
    PointerSensor: function PointerSensor() {},
    pointerWithin: () => [],
    useDraggable,
    useDroppable,
    useSensor: () => ({}),
    useSensors: () => [],
  };
});
