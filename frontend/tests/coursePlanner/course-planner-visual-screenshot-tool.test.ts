import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "../app/appTestHarness";

describe("Course Planner visual screenshot tool", () => {
  it("includes macOS app-bundle Chromium candidates for the browser visual gate", async () => {
    const { chromiumExecutableCandidates } = await import("../../tools/course-planner-browser-candidates.mjs");

    const candidates = chromiumExecutableCandidates({
      env: { HOME: "/Users/course-planner" },
      platform: "darwin",
    });

    expect(candidates).toContain("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
    expect(candidates).toContain("/Users/course-planner/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
    expect(candidates).toContain("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge");
  });

  it("captures Task 10 Assembly normal and drawer-open visual references", () => {
    const script = readFileSync(
      path.join(process.cwd(), "tools", "capture-course-planner-screenshots.mjs"),
      "utf8",
    );
    const harness = readFileSync(
      path.join(process.cwd(), "tools", "course-planner-visual-harness.tsx"),
      "utf8",
    );

    expect(script).toContain("assembly-drawer-overlay-1920x1080.png");
    expect(script).toContain("view=assembly-drawer");
    expect(script).toContain("course-planner-assembly-editor-normal-reference.png");
    expect(script).toContain("course-planner-assembly-generated-assets-drawer-overlay-on-current-reference.png");
    expect(script).toContain("textContent.includes('Prompt Generation')");
    expect(script).not.toContain("textContent.includes('Prompt Facts')");
    expect(script).not.toContain("placement-editor-reference-imagegen.png");
    expect(harness).toContain("[aria-label='Import generated assets']");
  });

  it("captures the global reference library list, create, edit, and style states", () => {
    const script = readFileSync(
      path.join(process.cwd(), "tools", "capture-course-planner-screenshots.mjs"),
      "utf8",
    );
    const harness = readFileSync(
      path.join(process.cwd(), "tools", "course-planner-visual-harness.tsx"),
      "utf8",
    );

    expect(script).toContain("global-reference-library-drawer-1920x1080.png");
    expect(script).toContain("global-reference-library-create-character-1920x1080.png");
    expect(script).toContain("global-reference-library-edit-character-1920x1080.png");
    expect(script).toContain("global-reference-library-scene-style-1920x1080.png");
    expect(harness).toContain('"library-create"');
    expect(harness).toContain('"library-edit"');
    expect(harness).toContain('"library-style"');
  });
});
