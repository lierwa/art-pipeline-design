import { vi } from "vitest";

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
