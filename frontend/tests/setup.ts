import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  // WHY: 全局卸载 React tree，避免跨测试文件运行时留下重复 DOM，旧测试不需要逐个维护 cleanup。
  cleanup();
});

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

if (!globalThis.CSS) {
  globalThis.CSS = {} as typeof CSS;
}

if (!globalThis.CSS.supports) {
  globalThis.CSS.supports = vi.fn(() => false);
}

if (!HTMLImageElement.prototype.decode) {
  HTMLImageElement.prototype.decode = vi.fn(async () => undefined);
}

if (!window.matchMedia) {
  window.matchMedia = (() => ({
    matches: false,
    media: "",
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  })) as typeof window.matchMedia;
}

HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  canvas: document.createElement("canvas"),
  save() {},
  restore() {},
  translate() {},
  rotate() {},
  scale() {},
  transform() {},
  setTransform() {},
  clearRect() {},
  fillRect() {},
  strokeRect() {},
  beginPath() {},
  closePath() {},
  moveTo() {},
  lineTo() {},
  arc() {},
  rect() {},
  clip() {},
  fill() {},
  stroke() {},
  drawImage() {},
  putImageData() {},
  createImageData() {
    return { data: new Uint8ClampedArray(4) };
  },
  getImageData() {
    return { data: new Uint8ClampedArray(4) };
  },
  measureText() {
    return { width: 0 };
  },
  fillText() {},
  createLinearGradient() {
    return { addColorStop() {} };
  },
  createRadialGradient() {
    return { addColorStop() {} };
  },
})) as typeof HTMLCanvasElement.prototype.getContext;

HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/png;base64,mock");

if (!("fonts" in document)) {
  const fonts = new Set<FontFace>() as FontFaceSet;
  Object.assign(fonts, {
    ready: Promise.resolve(fonts),
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
    check() {
      return true;
    },
    load: vi.fn(async () => []),
  });
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: fonts,
  });
}

if (!globalThis.FontFace) {
  globalThis.FontFace = class FontFace {
    family: string;

    source: string;

    status: "unloaded" | "loading" | "loaded" | "error" = "loaded";

    constructor(family: string, source: string) {
      this.family = family;
      this.source = source;
    }

    load() {
      return Promise.resolve(this);
    }
  } as typeof FontFace;
}

if (!globalThis.Path2D) {
  globalThis.Path2D = class Path2D {
    addPath() {}
    moveTo() {}
    lineTo() {}
    closePath() {}
    rect() {}
    arc() {}
  } as typeof Path2D;
}
