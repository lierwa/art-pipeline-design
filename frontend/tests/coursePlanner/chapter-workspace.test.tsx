import "./assemblyEditorDependencyMocks";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  describe,
  expect,
  it,
  jsonResponse,
  screen,
  within,
} from "../app/appTestHarness";

import {
  renderChapterWorkspace,
  studioScenePackageFixture,
} from "./chapterWorkspaceTestHelpers";
import { sceneAsset } from "./chapterWorkspaceFixtures";

describe("Chapter Scene Studio navigation shell", () => {
  it("sizes the Chapter route from the parent app-shell row and reserves a local header row", () => {
    const layoutCss = readFileSync(
      path.join(process.cwd(), "src", "features", "coursePlanner", "components", "chapterStudioLayout.css"),
      "utf8",
    );
    const pageRule = layoutCss.match(/\.chapter-workspace-page\s*\{[^}]+}/)?.[0] ?? "";

    expect(pageRule).toContain("height: 100%");
    expect(pageRule).toContain("min-height: 0");
    expect(pageRule).toContain("grid-template-rows: auto minmax(0, 1fr)");
    expect(pageRule).not.toContain("min-height: 100vh");
  });

  it("keeps the two-column Chapter Studio width budget inside a 1280px viewport", () => {
    const layoutCss = readFileSync(
      path.join(process.cwd(), "src", "features", "coursePlanner", "components", "chapterStudioLayout.css"),
      "utf8",
    );
    const studioRule = cssRule(layoutCss, ".chapter-workspace-page .chapter-scene-studio");
    const mainRule = cssRule(layoutCss, ".chapter-workspace-page .chapter-studio-main");
    const columnMinimums = [...mainRule.matchAll(/minmax\((\d+)px,/g)].map((match) => Number(match[1]));
    const routePaddingRem = numberFromRule(cssRule(layoutCss, ".chapter-workspace-page"), /padding:\s*([\d.]+)rem/);
    const mainGapRem = numberFromRule(mainRule, /gap:\s*([\d.]+)rem/);
    const mainPaddingInlineRem = [...mainRule.matchAll(/padding:\s*[\d.]+rem\s+([\d.]+)rem\s+[\d.]+rem/g)]
      .map((match) => Number(match[1]))[0];

    expect(studioRule).toContain("grid-template-columns: 292px minmax(0, 1fr)");
    expect(columnMinimums).toHaveLength(2);
    expect(mainRule).toContain("grid-template-columns: minmax(");
    expect(columnMinimums[1]).toBeGreaterThanOrEqual(460);
    expect(292 + columnMinimums[0] + columnMinimums[1] + remPx(mainGapRem) + remPx(mainPaddingInlineRem * 2) + remPx(routePaddingRem * 2)).toBeLessThanOrEqual(1280);
  });

  it("wraps Complete Image row controls at mid width before the whole studio stacks", () => {
    const layoutCss = readFileSync(
      path.join(process.cwd(), "src", "features", "coursePlanner", "components", "chapterStudioLayout.css"),
      "utf8",
    );
    const midWidthRule = mediaRule(layoutCss, 1320);

    expect(midWidthRule).toContain(".chapter-workspace-page .chapter-complete-image-row");
    expect(midWidthRule).toContain("grid-template-columns: 82px minmax(0, 1fr)");
    expect(midWidthRule).toContain(".chapter-workspace-page .chapter-complete-image-actions");
    expect(midWidthRule).toContain("grid-column: 1 / -1");
  });

  it("keeps product navigation visible and adds local Chapter Studio context", async () => {
    const view = renderChapterWorkspace({
      scenePackage: studioScenePackageFixture(),
    });

    try {
      const banner = await screen.findByRole("banner");
      expect(within(banner).getByRole("heading", { name: "Course Planner" })).toBeInTheDocument();
      expect(within(banner).getByRole("navigation", { name: "Product areas" })).toBeInTheDocument();

      const workspace = await screen.findByRole("main");
      const backLink = within(workspace).getByRole("link", { name: "Back to board" });
      expect(backLink).toHaveAttribute("href", "/course-planner");
      expect(backLink).toHaveClass("course-planner-icon-link");
      expect(backLink).toHaveAttribute("title", "Back to board");
      expect(backLink).toHaveTextContent("");
      expect(within(workspace).queryByText(/^Back to board$/)).not.toBeInTheDocument();
      expect(within(workspace).getByText("室内家庭篇 / Chapter Scene Studio")).toBeInTheDocument();
      expect(within(workspace).getAllByRole("heading", { name: "早餐厨房" }).length).toBeGreaterThan(0);
      expect(within(workspace).getByText(/^(Idle|Loading)$/)).toBeInTheDocument();
    } finally {
      view.restore();
    }
  });

  it("uses one local Chapter header and keeps status in the page header zone", async () => {
    const readyScenePackage = studioScenePackageFixture({
      chapter_assets: [
        sceneAsset("chapter_asset_bowl", "Breakfast bowl", "bowl.png", { linkedTargetObjectId: "target_object_bowl" }),
        sceneAsset("chapter_asset_cloth", "Cleanup cloth", "cloth.png", { linkedTargetObjectId: "target_object_cloth" }),
      ],
      assembly: {
        ...studioScenePackageFixture().assembly,
        placements: [
          studioScenePackageFixture().assembly.placements[0],
          {
            id: "placement_cloth",
            asset_id: "chapter_asset_cloth",
            display_name: "Cleanup cloth",
            runtime_role: "target",
            transform: { cx: 0.62, cy: 0.54, w: 0.14, h: 0.14, rotation_deg: 0 },
            group_id: null,
            requires_placed: [],
          },
        ],
        layer_order: ["placement_bowl", "placement_cloth"],
      },
    });
    const view = renderChapterWorkspace({
      scenePackage: readyScenePackage,
    });

    try {
      await screen.findByRole("region", { name: "Assembly summary" });
      const workspace = await screen.findByRole("main");
      const pageHeader = within(workspace).getByRole("heading", { name: "早餐厨房" }).closest(".course-planner-page-header");
      expect(pageHeader).not.toBeNull();
      expect(within(workspace).getAllByRole("heading", { name: "早餐厨房" })).toHaveLength(1);
      expect(within(pageHeader as HTMLElement).getByText("Assembly ready")).toBeInTheDocument();
      expect(within(workspace).getAllByText("Assembly ready")).toHaveLength(1);
      expect(within(workspace).queryByText(/^Saved$/)).not.toBeInTheDocument();
    } finally {
      view.restore();
    }
  });

  it("keeps the product and local shells stable while the Chapter package is loading", async () => {
    let resolveScenePackage: ((response: Response) => void) | null = null;
    const view = renderChapterWorkspace({
      fetchScenePackage: () => new Promise<Response>((resolve) => {
        resolveScenePackage = resolve;
      }),
    });

    try {
      expect(await screen.findByRole("banner", { name: /course planner/i })).toBeInTheDocument();

      const workspace = await screen.findByRole("main");
      expect(within(workspace).getByRole("link", { name: "Back to board" })).toHaveAttribute("href", "/course-planner");
      expect(await within(workspace).findByRole("status", { name: /loading/i })).toBeInTheDocument();
      expect(within(workspace).queryByText(/^Loading$/)?.closest(".course-planner-page-header__actions")).toBeTruthy();
      expect(within(workspace).getByText("室内家庭篇 / Chapter Scene Studio")).toBeInTheDocument();
      expect(within(workspace).getByRole("heading", { name: "早餐厨房" })).toBeInTheDocument();
    } finally {
      resolveScenePackage?.(jsonResponse({ scenePackage: studioScenePackageFixture() }));
      view.restore();
    }
  });
});

function cssRule(stylesheet: string, selector: string): string {
  return stylesheet.match(new RegExp(`${escapeRegExp(selector)}\\s*\\{[^}]+}`))?.[0] ?? "";
}

function mediaRule(stylesheet: string, maxWidthPx: number): string {
  const start = stylesheet.indexOf(`@media (max-width: ${maxWidthPx}px)`);
  if (start === -1) {
    return "";
  }
  const next = stylesheet.indexOf("@media", start + 1);
  return stylesheet.slice(start, next === -1 ? undefined : next);
}

function numberFromRule(rule: string, pattern: RegExp): number {
  const value = rule.match(pattern)?.[1];
  if (!value) {
    throw new Error(`Could not read numeric CSS value from rule: ${rule}`);
  }
  return Number(value);
}

function remPx(value: number): number {
  return value * 16;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
