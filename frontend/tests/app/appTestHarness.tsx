import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router";
import { vi } from "vitest";

import { App as RawApp } from "../../src/App";
import { normalizeWorkspaceState, type WorkspaceState } from "../../src/domain/workspace";

vi.mock("@yaireo/tagify/react", async () => ({
  default: (await import("../helpers/tagifyMock")).MockTagify,
}));

export * from "./appFixtures";

export function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function installFetchMock(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(handler) as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

export function mockElementRect(element: Element, rect: { left: number; top: number; width: number; height: number }) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    x: rect.left,
    y: rect.top,
    top: rect.top,
    left: rect.left,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    width: rect.width,
    height: rect.height,
    toJSON() {
      return {};
    },
  });
}

export function persistedWorkspaceState(state: unknown): WorkspaceState {
  // WHY: 持久化契约断言复用 workspace normalizer，避免测试 fixture 变成第二套默认字段来源。
  return normalizeWorkspaceState(state as WorkspaceState);
}

export function setCanvasRect(surface: HTMLElement) {
  vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 600,
    bottom: 450,
    width: 600,
    height: 450,
    toJSON() {
      return {};
    },
  });
}

export function mockRect(element: Element, rect: { left: number; top: number; width: number; height: number }) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    x: rect.left,
    y: rect.top,
    top: rect.top,
    left: rect.left,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    width: rect.width,
    height: rect.height,
    toJSON() {
      return {};
    },
  });
}

export async function drawRectangle(surface: HTMLElement, start: { x: number; y: number }, end: { x: number; y: number }) {
  setCanvasRect(surface);
  fireEvent.mouseDown(surface, { clientX: start.x, clientY: start.y, button: 0 });
  fireEvent.mouseMove(surface, { clientX: end.x, clientY: end.y, button: 0 });
  fireEvent.mouseUp(surface, { clientX: end.x, clientY: end.y, button: 0 });
}

export function openAssetContextMenu(point: { x: number; y: number } = { x: 100, y: 120 }) {
  setCanvasRect(screen.getByTestId("canvas-artboard"));
  fireEvent.contextMenu(screen.getByTestId("canvas-drawing-surface"), {
    clientX: point.x,
    clientY: point.y,
  });
  return screen.getByRole("menu", { name: /asset context menu/i });
}

export function assetSelectButton(name: RegExp) {
  return screen.getByRole("button", { name });
}

export function pipelineStage(pipelineRail: HTMLElement, name: string) {
  const stage = within(pipelineRail).getByText(name).closest("li");
  if (!stage) {
    throw new Error(`Pipeline stage ${name} did not render as a list item.`);
  }
  return stage;
}

export function toggleAssetSelection(name: RegExp) {
  fireEvent.click(assetSelectButton(name), { shiftKey: true });
}

export async function confirmMergeDialog(user: ReturnType<typeof userEvent.setup>, label: string) {
  const dialog = await screen.findByRole("dialog", { name: /name merged asset/i });
  const input = within(dialog).getByRole("textbox", { name: /merged asset name/i });
  await user.clear(input);
  await user.type(input, label);
  await user.click(within(dialog).getByRole("button", { name: /create merged asset/i }));
}

export { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
export { describe, expect, it, vi } from "vitest";

export function App() {
  return (
    <BrowserRouter>
      <RawApp />
    </BrowserRouter>
  );
}
