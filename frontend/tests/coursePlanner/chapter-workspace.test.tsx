import "./assemblyEditorDependencyMocks";
import {
  describe,
  expect,
  it,
  screen,
  vi,
  within,
} from "../app/appTestHarness";

import {
  renderChapterWorkspace,
  studioScenePackageFixture,
} from "./chapterWorkspaceTestHelpers";
import { exportAssemblyPreviewFile } from "../../src/features/coursePlanner/assembly/assemblyExport";

describe("Chapter Scene Studio", () => {
  it("renders the studio shell without legacy authoring controls", async () => {
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

  it("keeps Prompt pending until all prompt readiness facts are present", async () => {
    const view = renderChapterWorkspace({
      scenePackage: studioScenePackageFixture({
        prompt: {
          ...studioScenePackageFixture().prompt,
          scene_spatial_contract: "",
        },
      }),
    });

    try {
      const progressRail = await screen.findByLabelText("Studio progress");
      const promptStep = within(progressRail).getByText("Prompt").closest("li");
      expect(promptStep).toBeTruthy();
      expect(within(promptStep as HTMLElement).getByText("pending")).toBeInTheDocument();
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
      expect(await screen.findByRole("button", { name: "Lock Final" })).toBeInTheDocument();
      expect(screen.getByText("Pending")).toBeInTheDocument();
    } finally {
      view.restore();
    }
  });

  it("uploads a rendered PNG file when locking the final scene from a ready assembly", async () => {
    const originalImage = global.Image;
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    const originalToBlob = HTMLCanvasElement.prototype.toBlob;
    const drawImage = vi.fn();

    class MockImage {
      onload: null | (() => void) = null;
      onerror: null | ((error?: unknown) => void) = null;
      decode = vi.fn(async () => undefined);
      width = 1024;
      height = 1024;
      srcValue = "";

      set src(value: string) {
        this.srcValue = value;
        queueMicrotask(() => this.onload?.());
      }
    }

    global.Image = MockImage as unknown as typeof Image;
    HTMLCanvasElement.prototype.getContext = vi.fn(function (...args: Parameters<typeof originalGetContext>) {
      const context = originalGetContext.call(this, ...args);
      if (!context) {
        return context;
      }
      return {
        ...context,
        drawImage,
      };
    }) as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toBlob = vi.fn((callback: BlobCallback) => {
      callback(new Blob(["png"], { type: "image/png" }));
    });

    const scenePackage = studioScenePackageFixture({
      empty_scene_images: [
        {
          ...studioScenePackageFixture().empty_scene_images[0],
          id: "empty_scene_001",
          width: 800,
          height: 600,
        },
      ],
      chapter_assets: [
        ...studioScenePackageFixture().chapter_assets,
        {
          ...studioScenePackageFixture().chapter_assets[0],
          id: "chapter_asset_cup",
          display_name: "Cup",
          original_filename: "cup.png",
          storage_path: "scene_package/chapter_asset_cup.png",
        },
      ],
      assembly: {
        ...studioScenePackageFixture().assembly,
        placements: [
          ...studioScenePackageFixture().assembly.placements,
          {
            id: "placement_cup",
            asset_id: "chapter_asset_cup",
            display_name: "Cup",
            runtime_role: "target",
            transform: { cx: 0.64, cy: 0.42, w: 0.12, h: 0.16, rotation_deg: 18 },
            group_id: null,
            requires_placed: [],
          },
        ],
        layer_order: ["placement_cup", "placement_bowl"],
      },
    });

    try {
      const file = await exportAssemblyPreviewFile(scenePackage, scenePackage.assembly);

      expect(file.name).toBe("chapter-scene-final.png");
      expect(file.type).toBe("image/png");
      expect(drawImage).toHaveBeenCalledTimes(3);
      expect(drawImage.mock.calls.map(([image]) => (image as { srcValue: string }).srcValue)).toEqual([
        "/api/course-planner/chapters/chapter_breakfast_kitchen/scene-package/media/empty_scene_images/empty_scene_001",
        "/api/course-planner/chapters/chapter_breakfast_kitchen/scene-package/media/chapter_assets/chapter_asset_bowl",
        "/api/course-planner/chapters/chapter_breakfast_kitchen/scene-package/media/chapter_assets/chapter_asset_cup",
      ]);
    } finally {
      global.Image = originalImage;
      HTMLCanvasElement.prototype.getContext = originalGetContext;
      HTMLCanvasElement.prototype.toBlob = originalToBlob;
    }
  });

});
