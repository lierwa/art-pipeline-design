import { act } from "react";
import { fireEvent, within } from "@testing-library/react";

export function pipelineStage(rail: HTMLElement, name: string): HTMLElement {
  const stageLabel = within(rail).getByText(name);
  const stage = stageLabel.closest(".pipeline-stage");
  if (!(stage instanceof HTMLElement)) {
    throw new Error(`Pipeline stage "${name}" was not rendered as a stage item.`);
  }
  return stage;
}

export function dispatchDrawerPointerEvent(
  element: Element,
  type: "pointerdown" | "pointermove" | "pointerup",
  clientY: number,
  pointerId: number,
) {
  act(() => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientY });
    Object.defineProperty(event, "pointerId", { value: pointerId });
    fireEvent(element, event);
  });
}
