import { vi } from "vitest";
import type { AssemblyEditorShapeLike } from "../../src/features/coursePlanner/components/AssemblyEditorCanvas";

vi.mock("tldraw", async () => {
  const React = await import("react");
  type MockShape = AssemblyEditorShapeLike & { type?: string };
  type MockAsset = { id: string; props?: { src?: string } };

  function upsertById<T extends { id: string }>(items: T[], nextItems: T[]) {
    const nextById = new Map(items.map((item) => [item.id, item]));
    nextItems.forEach((item) => nextById.set(item.id, item));
    return Array.from(nextById.values());
  }

  function createEditor() {
    let assets: MockAsset[] = [];
    let shapes: MockShape[] = [];
    const selectedShapeIds = new Set<string>();

    return {
      createAssets: vi.fn((nextAssets: MockAsset[]) => {
        assets = upsertById(assets, nextAssets);
      }),
      createShapes: vi.fn((nextShapes: MockShape[]) => {
        shapes = upsertById(shapes, nextShapes);
      }),
      deleteAssets: vi.fn((assetIds: string[]) => {
        const deleted = new Set(assetIds.map(String));
        assets = assets.filter((asset) => !deleted.has(String(asset.id)));
      }),
      deleteShapes: vi.fn((shapeIds: string[]) => {
        const deleted = new Set(shapeIds.map(String));
        shapes = shapes.filter((shape) => !deleted.has(String(shape.id)));
        shapeIds.forEach((shapeId) => selectedShapeIds.delete(String(shapeId)));
      }),
      getAssets: vi.fn(() => assets),
      getCurrentPageShapes: vi.fn(() => shapes),
      getCurrentPageShapesSorted: vi.fn(() => shapes),
      getSelectedShapeIds: vi.fn(() => selectedShapeIds),
      getSelectedShapes: vi.fn(() => shapes.filter((shape) => selectedShapeIds.has(String(shape.id)))),
      redo: vi.fn(),
      run: vi.fn((callback: () => void) => callback()),
      select: vi.fn((shapeId: string) => {
        selectedShapeIds.clear();
        selectedShapeIds.add(String(shapeId));
      }),
      selectNone: vi.fn(() => {
        selectedShapeIds.clear();
      }),
      setCurrentTool: vi.fn(),
      undo: vi.fn(),
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      zoomToBounds: vi.fn(),
    };
  }

  const EditorContext = React.createContext<ReturnType<typeof createEditor> | null>(null);

  function Tldraw({
    children,
    onMount,
  }: {
    children?: React.ReactNode;
    onMount?: (editor: ReturnType<typeof createEditor>) => void;
  }) {
    const editor = React.useMemo(() => createEditor(), []);

    React.useLayoutEffect(() => {
      onMount?.(editor);
    }, [editor, onMount]);

    return (
      <EditorContext.Provider value={editor}>
        <div data-testid="mock-tldraw-root">{children}</div>
      </EditorContext.Provider>
    );
  }

  function useEditor() {
    const editor = React.useContext(EditorContext);
    if (!editor) {
      throw new Error("Mock Tldraw editor context missing.");
    }
    return editor;
  }

  function useReactor(_name: string, _callback: () => void, _deps: React.DependencyList) {
    // WHY: Course Planner 测试验证自家 manifest/selection 协议，不让第三方
    // editor 的响应式循环和 cdn asset 加载成为页面级测试的事实来源。
    return undefined;
  }

  return {
    Tldraw,
    useEditor,
    useReactor,
  };
});

vi.mock("react-arborist", async () => {
  const React = await import("react");

  type TreeNodeData = {
    id: string;
    name: string;
    kind: "group" | "placement";
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
      };
      return [
        { node, depth },
        ...(item.children ? buildNodes(item.children, selection, node, depth + 1) : []),
      ];
    });
  }

  function Tree({
    children,
    data,
    onMove,
    selection,
  }: {
    children: (props: {
      node: MockNode;
      style: React.CSSProperties;
      dragHandle: () => void;
      tree: { selectedIds: Set<string> };
    }) => React.ReactNode;
    data: TreeNodeData[];
    onMove?: (input: { dragIds: string[]; parentId: string | null; index: number }) => void;
    selection?: string[] | string | null;
  }) {
    const flatNodes = buildNodes(data, selection);
    const selectedIds = new Set(Array.isArray(selection) ? selection : selection ? [selection] : []);

    return (
      <div data-testid="mock-arborist-tree">
        {flatNodes.map(({ node, depth }) => (
          <div key={node.id} data-depth={depth}>
            {children({
              node,
              style: { paddingLeft: `${depth * 16}px` },
              dragHandle: () => undefined,
              tree: { selectedIds },
            })}
            {onMove ? (
              <button
                type="button"
                aria-label={`Move ${node.data.name} to top`}
                onClick={() => onMove({
                  dragIds: [node.id],
                  parentId: node.parent?.id ?? null,
                  index: 0,
                })}
              >
                move
              </button>
            ) : null}
          </div>
        ))}
      </div>
    );
  }

  return { Tree };
});
