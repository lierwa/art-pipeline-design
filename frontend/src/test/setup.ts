import "@testing-library/jest-dom/vitest";

if (!URL.createObjectURL) {
  URL.createObjectURL = vi.fn(() => "blob:mock-preview");
}

if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = vi.fn();
}
