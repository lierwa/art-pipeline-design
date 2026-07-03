import {
  describe,
  expect,
  it,
  screen,
} from "../app/appTestHarness";

import {
  renderChapterWorkspace,
  studioScenePackageFixture,
} from "./chapterWorkspaceTestHelpers";

describe("Chapter Scene Studio", () => {
  it("renders the studio shell without legacy prompt-version controls", async () => {
    const view = renderChapterWorkspace({
      scenePackage: studioScenePackageFixture(),
    });

    try {
      expect(await screen.findByRole("heading", { name: "早餐厨房" })).toBeInTheDocument();
      expect(await screen.findByRole("button", { name: "Save Prompt Facts" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Prompt Facts" })).toBeInTheDocument();
      expect(screen.getAllByText("Empty Scene").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Images").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Assembly").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Final").length).toBeGreaterThan(0);
    } finally {
      view.restore();
    }
  });

  it("shows character and reference selection as explicit readiness gates", async () => {
    const view = renderChapterWorkspace({
      scenePackage: studioScenePackageFixture({
        prompt_confirmations: {
          avoid_objects_reviewed: false,
          style_reference_mode: "unreviewed",
        },
        cast_assignments: [],
        reference_selections: [],
      }),
    });

    try {
      expect(await screen.findByRole("heading", { name: "Library Selection" })).toBeInTheDocument();
      expect(screen.getAllByRole("heading", { name: "Character IP" }).length).toBeGreaterThan(0);
      expect(screen.getByRole("heading", { name: "Reference Library" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Avoid reviewed" })).toBeInTheDocument();
      expect(screen.getAllByText("Pending").length).toBeGreaterThan(0);
    } finally {
      view.restore();
    }
  });

  it("offers direct Scene Asset upload", async () => {
    const view = renderChapterWorkspace({
      scenePackage: studioScenePackageFixture(),
    });

    try {
      expect(await screen.findByRole("button", { name: "Upload Scene Asset" })).toBeEnabled();
    } finally {
      view.restore();
    }
  });

  it("locks final only from the final section after assembly is ready", async () => {
    const view = renderChapterWorkspace({
      scenePackage: studioScenePackageFixture({
        assembly: {
          ...studioScenePackageFixture().assembly,
          placements: [],
          updated_at: null,
        },
      }),
    });

    try {
      expect(await screen.findByRole("button", { name: "Lock Final" })).toBeDisabled();
      expect(screen.getByText("Pending")).toBeInTheDocument();
    } finally {
      view.restore();
    }
  });
});
