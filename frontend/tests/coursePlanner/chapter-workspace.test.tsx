import "./assemblyEditorDependencyMocks";
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
  it("keeps product navigation visible and exposes the Prompt Generation workspace", async () => {
    const view = renderChapterWorkspace({
      scenePackage: studioScenePackageFixture(),
    });

    try {
      const banner = await screen.findByRole("banner");
      expect(within(banner).getByRole("heading", { name: "Course Planner" })).toBeInTheDocument();
      expect(within(banner).getByRole("navigation", { name: "Product areas" })).toBeInTheDocument();

      await screen.findByRole("region", { name: "Prompt Generation" });
      const workspace = await screen.findByRole("main");
      const backLink = within(workspace).getByRole("link", { name: "Back to board" });
      expect(backLink).toHaveAttribute("href", "/course-planner");
      expect(backLink).toHaveClass("course-planner-icon-link");
      expect(backLink).toHaveAttribute("title", "Back to board");
      expect(backLink).toHaveTextContent("");
      expect(within(workspace).queryByText(/^Back to board$/)).not.toBeInTheDocument();
      expect(within(workspace).getAllByRole("heading", { name: "早餐厨房" })).toHaveLength(1);
      const pageHeader = within(workspace).getByRole("heading", { name: "早餐厨房" })
        .closest(".course-planner-workspace-header");
      expect(within(pageHeader as HTMLElement).getByRole("status")).toHaveTextContent("Prompt ready");
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
      const pageHeader = within(workspace).getByRole("heading", { name: "早餐厨房" }).closest(".course-planner-workspace-header");
      expect(pageHeader).not.toBeNull();
      expect(within(workspace).getAllByRole("heading", { name: "早餐厨房" })).toHaveLength(1);
      expect(within(pageHeader as HTMLElement).getByRole("status")).toHaveTextContent("Prompt ready");
      expect(within(workspace).queryByText("Assembly ready")).not.toBeInTheDocument();
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
      expect(await within(workspace).findByRole("status")).toHaveTextContent("Loading");
      expect(within(workspace).getByText(/^Loading$/).closest(".course-planner-workspace-header__actions")).toBeTruthy();
      expect(within(workspace).getByRole("heading", { name: "早餐厨房" })).toBeInTheDocument();
    } finally {
      resolveScenePackage?.(jsonResponse({ scenePackage: studioScenePackageFixture() }));
      view.restore();
    }
  });
});
