import type { SelectedElementIds, WorkspaceState } from "./workspace";

export const DEFAULT_HISTORY_LIMIT = 50;

export type OperationHistory<T> = {
  past: T[];
  future: T[];
  limit: number;
};

export type HistoryDirection = "undo" | "redo";

export type HistoryStepResult<T> = {
  history: OperationHistory<T>;
  target: T | null;
};

export type WorkspaceHistorySnapshot = {
  state: WorkspaceState;
  selectedElementId: string | null;
  selectedElementIds: SelectedElementIds;
};

export function createOperationHistory<T>(
  limit: number = DEFAULT_HISTORY_LIMIT,
): OperationHistory<T> {
  return {
    past: [],
    future: [],
    limit,
  };
}

export function clearOperationHistory<T>(
  history: OperationHistory<T>,
): OperationHistory<T> {
  return {
    past: [],
    future: [],
    limit: history.limit,
  };
}

export function recordOperation<T>(
  history: OperationHistory<T>,
  snapshot: T,
): OperationHistory<T> {
  return {
    past: [...history.past, snapshot].slice(-history.limit),
    future: [],
    limit: history.limit,
  };
}

export function stepOperationHistory<T>(
  history: OperationHistory<T>,
  direction: HistoryDirection,
  currentSnapshot: T,
): HistoryStepResult<T> {
  const sourceStack = direction === "undo" ? history.past : history.future;
  const target = sourceStack[sourceStack.length - 1] ?? null;

  if (!target) {
    return { history, target: null };
  }

  if (direction === "undo") {
    return {
      target,
      history: {
        past: history.past.slice(0, -1),
        future: [...history.future, currentSnapshot].slice(-history.limit),
        limit: history.limit,
      },
    };
  }

  return {
    target,
    history: {
      past: [...history.past, currentSnapshot].slice(-history.limit),
      future: history.future.slice(0, -1),
      limit: history.limit,
    },
  };
}

export function dropLatestUndoOperation<T>(
  history: OperationHistory<T>,
): OperationHistory<T> {
  return {
    past: history.past.slice(0, -1),
    future: history.future,
    limit: history.limit,
  };
}

export function canUndoHistory<T>(history: OperationHistory<T>): boolean {
  return history.past.length > 0;
}

export function canRedoHistory<T>(history: OperationHistory<T>): boolean {
  return history.future.length > 0;
}
