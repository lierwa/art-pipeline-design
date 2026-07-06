import "./assemblyEditorDependencyMocks";
import {
  describe,
  expect,
  it,
  screen,
  within,
} from "../app/appTestHarness";

import {
  renderChapterWorkspace,
  studioScenePackageFixture,
} from "./chapterWorkspaceTestHelpers";

describe("Chapter Scene Studio navigation shell", () => {
  it("keeps product navigation visible and adds local Chapter Studio context", async () => {
    const view = renderChapterWorkspace({
      scenePackage: studioScenePackageFixture(),
    });

    try {
      const banner = await screen.findByRole("banner");
      expect(within(banner).getByRole("heading", { name: "Course Planner" })).toBeInTheDocument();
      expect(within(banner).getByRole("navigation", { name: "Product areas" })).toBeInTheDocument();

      const workspace = await screen.findByRole("main");
      expect(within(workspace).getByRole("link", { name: "Back to board" })).toHaveAttribute("href", "/course-planner");
      expect(within(workspace).getByText("室内家庭篇 / Chapter Scene Studio")).toBeInTheDocument();
      expect(within(workspace).getAllByRole("heading", { name: "早餐厨房" }).length).toBeGreaterThan(0);
      expect(within(workspace).getByText(/^(Idle|Loading)$/)).toBeInTheDocument();
    } finally {
      view.restore();
    }
  });
});
