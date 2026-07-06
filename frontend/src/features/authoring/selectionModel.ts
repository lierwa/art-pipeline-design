export type SelectionState = {
  selectedIds: string[];
  primaryId: string | null;
  anchorId: string | null;
};

export type SelectionAction =
  | { type: "clear" }
  | { type: "replace"; id: string }
  | { type: "toggle"; id: string }
  | { type: "range"; id: string; orderedIds: string[] };

export function reduceSelection(
  state: SelectionState,
  action: SelectionAction,
): SelectionState {
  if (action.type === "clear") {
    return {
      selectedIds: [],
      primaryId: null,
      anchorId: null,
    };
  }

  if (action.type === "replace") {
    return {
      selectedIds: [action.id],
      primaryId: action.id,
      anchorId: action.id,
    };
  }

  if (action.type === "toggle") {
    return toggleSelection(state, action.id);
  }

  return selectRange(state, action.id, action.orderedIds);
}

function toggleSelection(state: SelectionState, id: string): SelectionState {
  if (state.selectedIds.includes(id)) {
    const selectedIds = state.selectedIds.filter((selectedId) => selectedId !== id);
    const primaryId = selectedIds.includes(state.primaryId ?? "")
      ? state.primaryId
      : selectedIds[selectedIds.length - 1] ?? null;
    return {
      selectedIds,
      primaryId,
      anchorId: selectedIds.length > 0 ? state.anchorId : null,
    };
  }

  return {
    selectedIds: [...state.selectedIds, id],
    primaryId: id,
    anchorId: state.anchorId ?? id,
  };
}

function selectRange(
  state: SelectionState,
  targetId: string,
  orderedIds: string[],
): SelectionState {
  const anchorId = state.anchorId ?? state.primaryId ?? targetId;
  const anchorIndex = orderedIds.indexOf(anchorId);
  const targetIndex = orderedIds.indexOf(targetId);
  if (anchorIndex === -1 || targetIndex === -1) {
    return {
      selectedIds: [targetId],
      primaryId: targetId,
      anchorId: targetId,
    };
  }

  const startIndex = Math.min(anchorIndex, targetIndex);
  const endIndex = Math.max(anchorIndex, targetIndex);
  return {
    selectedIds: orderedIds.slice(startIndex, endIndex + 1),
    primaryId: targetId,
    anchorId,
  };
}
