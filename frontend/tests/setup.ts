import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

if (!URL.createObjectURL) {
  URL.createObjectURL = vi.fn(() => "blob:mock-preview");
}

if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = vi.fn();
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
