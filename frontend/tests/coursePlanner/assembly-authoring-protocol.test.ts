import {
  describe,
  expect,
  it,
} from "../app/appTestHarness";

import {
  projectLayerOrderForHitTest,
  resolveLayerTreeMove,
  type LayerTreeMoveNode,
} from "../../src/features/authoring/layerTreeMoveModel";
import {
  reduceSelection,
  type SelectionState,
} from "../../src/features/authoring/selectionModel";

describe("assembly authoring shared protocols", () => {
  it("replaces selection with one primary id and anchor", () => {
    const selection = reduceSelection(emptySelection(), {
      type: "replace",
      id: "placement_bowl",
    });

    expect(selection).toEqual({
      selectedIds: ["placement_bowl"],
      primaryId: "placement_bowl",
      anchorId: "placement_bowl",
    });
  });

  it("toggles selected ids while keeping primary selection deterministic", () => {
    const initialSelection: SelectionState = {
      selectedIds: ["placement_bowl"],
      primaryId: "placement_bowl",
      anchorId: "placement_bowl",
    };

    const expandedSelection = reduceSelection(initialSelection, {
      type: "toggle",
      id: "placement_cup",
    });
    const reducedSelection = reduceSelection(expandedSelection, {
      type: "toggle",
      id: "placement_cup",
    });

    expect(expandedSelection).toEqual({
      selectedIds: ["placement_bowl", "placement_cup"],
      primaryId: "placement_cup",
      anchorId: "placement_bowl",
    });
    expect(reducedSelection).toEqual({
      selectedIds: ["placement_bowl"],
      primaryId: "placement_bowl",
      anchorId: "placement_bowl",
    });
  });

  it("selects an inclusive range from anchor to target in visible tree order", () => {
    const selection = reduceSelection(
      {
        selectedIds: ["placement_bowl"],
        primaryId: "placement_bowl",
        anchorId: "placement_bowl",
      },
      {
        type: "range",
        id: "placement_spoon",
        orderedIds: ["placement_cup", "placement_bowl", "placement_plate", "placement_spoon"],
      },
    );

    expect(selection).toEqual({
      selectedIds: ["placement_bowl", "placement_plate", "placement_spoon"],
      primaryId: "placement_spoon",
      anchorId: "placement_bowl",
    });
  });

  it("resolves root reorder and group insert from the react-arborist move protocol", () => {
    const tree: LayerTreeMoveNode[] = [
      placementNode("placement_bowl"),
      groupNode("group_breakfast", [
        placementNode("placement_cup"),
      ]),
      placementNode("placement_spoon"),
    ];

    expect(resolveLayerTreeMove(tree, {
      dragIds: ["placement_spoon"],
      parentId: null,
      index: 0,
    })).toEqual({
      dragId: "placement_spoon",
      sourceParentId: null,
      parentId: null,
      index: 0,
      siblingIds: ["placement_spoon", "placement_bowl", "group_breakfast"],
    });

    expect(resolveLayerTreeMove(tree, {
      dragIds: ["placement_bowl"],
      parentId: "group_breakfast",
      index: 1,
    })).toEqual({
      dragId: "placement_bowl",
      sourceParentId: null,
      parentId: "group_breakfast",
      index: 1,
      siblingIds: ["placement_cup", "placement_bowl"],
    });
  });

  it("rejects invalid nested group attempts at the shared move boundary", () => {
    const tree: LayerTreeMoveNode[] = [
      groupNode("group_breakfast", [
        placementNode("placement_cup"),
      ]),
      groupNode("group_props", [
        placementNode("placement_spoon"),
      ]),
    ];

    const move = resolveLayerTreeMove(tree, {
      dragIds: ["group_breakfast"],
      parentId: "group_props",
      index: 0,
      canDrop: ({ dragNode, parentNode }) => parentNode === null || dragNode.kind !== "group",
    });

    expect(move).toBeNull();
  });

  it("keeps layer_order[0] as frontmost for hit testing", () => {
    expect(projectLayerOrderForHitTest(["front", "middle", "back"])).toEqual([
      "front",
      "middle",
      "back",
    ]);
  });
});

function emptySelection(): SelectionState {
  return {
    selectedIds: [],
    primaryId: null,
    anchorId: null,
  };
}

function placementNode(id: string): LayerTreeMoveNode {
  return { id, kind: "placement" };
}

function groupNode(id: string, children: LayerTreeMoveNode[]): LayerTreeMoveNode {
  return { id, kind: "group", children };
}
