import { describe, expect, it } from "vitest";

import {
  canRedoHistory,
  canUndoHistory,
  clearOperationHistory,
  createOperationHistory,
  dropLatestUndoOperation,
  recordOperation,
  stepOperationHistory,
} from "./operationHistory";

describe("operation history", () => {
  it("records operations, clears redo, and keeps the configured limit", () => {
    let history = createOperationHistory<string>(2);
    history = recordOperation(history, "first");
    history = recordOperation(history, "second");

    const undone = stepOperationHistory(history, "undo", "current");
    expect(undone.target).toBe("second");
    expect(undone.history.future).toEqual(["current"]);

    history = recordOperation(undone.history, "third");
    history = recordOperation(history, "fourth");

    expect(history.past).toEqual(["third", "fourth"]);
    expect(history.future).toEqual([]);
  });

  it("moves current snapshots between undo and redo stacks", () => {
    const history = recordOperation(
      recordOperation(createOperationHistory<string>(), "initial"),
      "accepted",
    );

    const undone = stepOperationHistory(history, "undo", "edited");
    expect(undone.target).toBe("accepted");
    expect(undone.history.past).toEqual(["initial"]);
    expect(undone.history.future).toEqual(["edited"]);

    const redone = stepOperationHistory(undone.history, "redo", "accepted");
    expect(redone.target).toBe("edited");
    expect(redone.history.past).toEqual(["initial", "accepted"]);
    expect(redone.history.future).toEqual([]);
  });

  it("leaves history unchanged when stepping an empty stack", () => {
    const history = createOperationHistory<string>();
    const undone = stepOperationHistory(history, "undo", "current");
    const redone = stepOperationHistory(history, "redo", "current");

    expect(undone.target).toBeNull();
    expect(undone.history).toBe(history);
    expect(redone.target).toBeNull();
    expect(redone.history).toBe(history);
  });

  it("clears history and exposes availability checks", () => {
    const history = recordOperation(createOperationHistory<string>(), "initial");

    expect(canUndoHistory(history)).toBe(true);
    expect(canRedoHistory(history)).toBe(false);

    const cleared = clearOperationHistory(history);
    expect(canUndoHistory(cleared)).toBe(false);
    expect(canRedoHistory(cleared)).toBe(false);
    expect(cleared.limit).toBe(history.limit);
  });

  it("drops the latest undo snapshot when an optimistic save is rolled back", () => {
    const history = recordOperation(
      recordOperation(createOperationHistory<string>(), "first"),
      "optimistic",
    );

    expect(dropLatestUndoOperation(history).past).toEqual(["first"]);
  });
});
