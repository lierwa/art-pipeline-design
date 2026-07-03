import {
  describe,
  expect,
  it,
  screen,
  userEvent,
  vi,
  waitFor,
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

  it("uploads a rendered PNG file when locking the final scene from a ready assembly", async () => {
    const user = userEvent.setup();
    const originalImage = global.Image;
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    const originalToBlob = HTMLCanvasElement.prototype.toBlob;
    const uploadedFiles: File[] = [];
    const drawImage = vi.fn();
    const fillRect = vi.fn();
    const fillText = vi.fn();
    const save = vi.fn();
    const restore = vi.fn();
    const translate = vi.fn();
    const rotate = vi.fn();

    class MockImage {
      onload: null | (() => void) = null;
      onerror: null | ((error?: unknown) => void) = null;
      width = 1024;
      height = 1024;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }

    global.Image = MockImage as unknown as typeof Image;
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      drawImage,
      fillRect,
      fillText,
      save,
      restore,
      translate,
      rotate,
    })) as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toBlob = vi.fn((callback: BlobCallback) => {
      callback(new Blob(["png"], { type: "image/png" }));
    });

    const view = renderChapterWorkspace({
      scenePackage: studioScenePackageFixture({
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
          layer_order: ["placement_bowl", "placement_cup"],
        },
      }),
      lockFinalScene: async (_input, init) => {
        const body = init?.body;
        expect(body).toBeInstanceOf(FormData);
        const file = (body as FormData).get("file");
        expect(file).toBeInstanceOf(File);
        uploadedFiles.push(file as File);
        return new Response(JSON.stringify({ scenePackage: studioScenePackageFixture() }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    });

    try {
      await user.click(await screen.findByRole("button", { name: "Lock Final" }));

      await waitFor(() => expect(uploadedFiles).toHaveLength(1));
      expect(uploadedFiles[0]?.name).toBe("chapter-scene-final.png");
      expect(uploadedFiles[0]?.type).toBe("image/png");
      expect(drawImage).toHaveBeenCalledTimes(3);
    } finally {
      global.Image = originalImage;
      HTMLCanvasElement.prototype.getContext = originalGetContext;
      HTMLCanvasElement.prototype.toBlob = originalToBlob;
      view.restore();
    }
  });

  it("preserves persisted placements and selected empty scene size when saving assembly", async () => {
    const user = userEvent.setup();
    let savedManifest: unknown = null;
    const selectedEmptyScene = {
      ...studioScenePackageFixture().empty_scene_images[0],
      id: "empty_scene_002",
      original_filename: "alt-empty-scene.png",
      storage_path: "scene_package/empty_scene_002.png",
      width: 1440,
      height: 900,
    };
    const view = renderChapterWorkspace({
      scenePackage: studioScenePackageFixture({
        current_empty_scene_image_id: "empty_scene_002",
        empty_scene_images: [
          studioScenePackageFixture().empty_scene_images[0],
          selectedEmptyScene,
        ],
        assembly: {
          ...studioScenePackageFixture().assembly,
          empty_scene_image_id: "empty_scene_002",
          empty_scene_size: { width: 1440, height: 900 },
          placements: [
            {
              ...studioScenePackageFixture().assembly.placements[0],
              id: "placement_preserved_fixture",
            },
          ],
          layer_order: ["placement_preserved_fixture"],
        },
      }),
      saveAssembly: async (_input, init) => {
        savedManifest = JSON.parse(String(init?.body ?? "{}"));
        return new Response(JSON.stringify({ scenePackage: studioScenePackageFixture() }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    });

    try {
      await user.click(await screen.findByRole("button", { name: "Save Assembly" }));

      await waitFor(() => expect(savedManifest).not.toBeNull());
      expect(savedManifest).toMatchObject({
        empty_scene_image_id: "empty_scene_002",
        empty_scene_size: { width: 1440, height: 900 },
        placements: [{ id: "placement_preserved_fixture" }],
        layer_order: ["placement_preserved_fixture"],
      });
    } finally {
      view.restore();
    }
  });
});
