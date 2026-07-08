import "./assemblyEditorDependencyMocks";
import {
  describe,
  expect,
  it,
  screen,
  userEvent,
  vi,
  waitFor,
  within,
} from "../app/appTestHarness";

import {
  renderChapterWorkspace,
  studioScenePackageFixture,
} from "./chapterWorkspaceTestHelpers";
import {
  buildLockedFinalScene,
  mockCanvasBlob,
  mockScenePackageImages,
  scenePackageWithTwoPlacements,
} from "./assemblyEditorHarness";

describe("Chapter Scene Studio library and run actions", () => {
  it("sends a complete scene image to pipeline through the import route", async () => {
    const user = userEvent.setup();
    const view = renderChapterWorkspace({
      scenePackage: studioScenePackageFixture(),
    });

    try {
      const sendButton = await screen.findByRole("button", { name: /Send to Pipeline/i });
      expect(sendButton).toBeEnabled();

      await user.click(sendButton);

      await waitFor(() => expect(sendButton).toBeDisabled());
      expect(screen.getAllByText("ready").length).toBeGreaterThan(0);
    } finally {
      view.restore();
    }
  });

  it("keeps chapter asset actions behind the Assembly editor entry point", async () => {
    const view = renderChapterWorkspace({
      scenePackage: studioScenePackageFixture({
        complete_images: [{
          ...studioScenePackageFixture().complete_images[0],
          pipeline_run_id: "run_complete_scene_001",
          pipeline_run_status: "ready",
        }],
      }),
    });

    try {
      await screen.findByRole("region", { name: "Assembly summary" });
      expect(screen.getByRole("link", { name: "Open Assembly Editor" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Upload Scene Asset" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Add from Run/i })).not.toBeInTheDocument();
    } finally {
      view.restore();
    }
  });

  it("confirms before deleting a Complete Scene Image", async () => {
    const user = userEvent.setup();
    let deletedCompleteImageId: string | null = null;
    const scenePackage = studioScenePackageFixture();
    const view = renderChapterWorkspace({
      scenePackage,
      deleteCompleteSceneImage: (_input, _init) => {
        deletedCompleteImageId = "complete_scene_001";
        return scenePackageResponse({
          ...scenePackage,
          complete_images: scenePackage.complete_images.map((image) => (
            image.id === "complete_scene_001" ? { ...image, status: "deleted" } : image
          )),
        });
      },
    });

    try {
      const completeImagesPanel = await screen.findByRole("region", { name: "Complete scene images" });
      await user.click(within(completeImagesPanel).getByRole("button", { name: "Delete Image" }));
      expect(deletedCompleteImageId).toBeNull();

      const dialog = await screen.findByRole("alertdialog", { name: "Delete complete-scene.png?" });
      expect(dialog).toHaveTextContent("chapter history only");
      await user.click(within(dialog).getByRole("button", { name: "Confirm delete image" }));

      await waitFor(() => expect(deletedCompleteImageId).toBe("complete_scene_001"));
    } finally {
      view.restore();
    }
  });

  it("opens Bind Character IP and Upload Reference inside the shared drawer and restores focus on close", async () => {
    const user = userEvent.setup();
    const view = renderChapterWorkspace({
      scenePackage: studioScenePackageFixture(),
    });

    try {
      const libraryPanel = await screen.findByRole("region", { name: "Library selection" });
      const bindButton = within(libraryPanel).getByRole("button", { name: "Bind Character IP" });
      const uploadButton = within(libraryPanel).getByRole("button", { name: "Upload Reference" });

      expect(libraryPanel.querySelector("details")).toBeNull();
      expect(screen.queryByRole("complementary", { name: "Bind Character IP" })).not.toBeInTheDocument();
      expect(screen.queryByRole("complementary", { name: "Upload Reference" })).not.toBeInTheDocument();

      await user.click(bindButton);

      const bindDrawer = await screen.findByRole("complementary", { name: "Bind Character IP" });
      expect(bindDrawer).toHaveClass("course-planner-drawer");
      expect(within(bindDrawer).getByRole("heading", { name: "Character IP" })).toBeInTheDocument();

      await user.click(within(bindDrawer).getByRole("button", { name: "Close" }));
      await waitFor(() => expect(screen.queryByRole("complementary", { name: "Bind Character IP" })).not.toBeInTheDocument());
      await waitFor(() => expect(bindButton).toHaveFocus());

      await user.click(uploadButton);

      const uploadDrawer = await screen.findByRole("complementary", { name: "Upload Reference" });
      expect(uploadDrawer).toHaveClass("course-planner-drawer");
      expect(within(uploadDrawer).getByRole("heading", { name: "Reference Images" })).toBeInTheDocument();

      await user.click(within(uploadDrawer).getByRole("button", { name: "Close" }));
      await waitFor(() => expect(screen.queryByRole("complementary", { name: "Upload Reference" })).not.toBeInTheDocument());
      await waitFor(() => expect(uploadButton).toHaveFocus());
    } finally {
      view.restore();
    }
  });

  it("confirms before replacing the selected Empty Scene when placements exist", async () => {
    const user = userEvent.setup();
    let selectedEmptySceneId: string | null = null;
    const scenePackage = studioScenePackageFixture({
      empty_scene_images: [
        studioScenePackageFixture().empty_scene_images[0],
        {
          ...studioScenePackageFixture().empty_scene_images[0],
          id: "empty_scene_002",
          original_filename: "alternate-empty.png",
          storage_path: "scene_package/empty_scene_002.png",
        },
      ],
    });
    const view = renderChapterWorkspace({
      scenePackage,
      selectEmptySceneImage: (_input, init) => {
        selectedEmptySceneId = JSON.parse(String(init?.body ?? "{}")).emptySceneImageId;
        return scenePackageResponse(scenePackage);
      },
    });

    try {
      const selectButtons = await screen.findAllByRole("button", { name: "Select as Empty Scene" });
      await user.click(selectButtons[1]);
      expect(selectedEmptySceneId).toBeNull();

      const dialog = await screen.findByRole("alertdialog", { name: "Replace Empty Scene" });
      expect(dialog).toHaveTextContent("Existing placements");
      await user.click(within(dialog).getByRole("button", { name: "Replace Empty Scene" }));

      await waitFor(() => expect(selectedEmptySceneId).toBe("empty_scene_002"));
    } finally {
      view.restore();
    }
  });

  it("confirms before replacing a locked Final Scene snapshot", async () => {
    const user = userEvent.setup();
    mockScenePackageImages();
    mockCanvasBlob();
    mockAssemblyExportCanvas();
    let lockCallCount = 0;
    const readyPackage = scenePackageWithTwoPlacements();
    const lockedScenePackage = {
      ...readyPackage,
      final_scene: buildLockedFinalScene(readyPackage),
    };
    const view = renderChapterWorkspace({
      scenePackage: lockedScenePackage,
      lockFinalScene: () => {
        lockCallCount += 1;
        return scenePackageResponse({
          ...lockedScenePackage,
          final_scene: {
            ...buildLockedFinalScene(lockedScenePackage, "chapter-scene-final-replacement.png"),
            id: "final_scene_002",
          },
        });
      },
    });

    try {
      const finalPanel = await screen.findByRole("region", { name: "Final scene" });
      await user.click(within(finalPanel).getByRole("button", { name: "Replace Final" }));
      expect(lockCallCount).toBe(0);

      const dialog = await screen.findByRole("alertdialog", { name: "Replace Final Scene" });
      expect(dialog).toHaveTextContent("overwrite the locked Final Scene snapshot");
      await user.click(within(dialog).getByRole("button", { name: "Replace Final" }));

      await waitFor(() => expect(lockCallCount).toBe(1));
    } finally {
      view.restore();
    }
  });

  it("uploads scene images without frontend-owned prompt snapshots", async () => {
    const user = userEvent.setup();
    const seenUploads = { empty: false, complete: false };
    const scenePackage = studioScenePackageFixture();
    const view = renderChapterWorkspace({
      scenePackage,
      uploadEmptySceneImage: (_input, init) => {
        const body = init?.body as FormData;
        expect(body.get("promptSnapshot")).toBeNull();
        expect(body.getAll("referenceImageIds")).toEqual(["reference_style_001"]);
        seenUploads.empty = true;
        return scenePackageResponse(scenePackage);
      },
      uploadCompleteSceneImage: (_input, init) => {
        const body = init?.body as FormData;
        expect(body.get("promptSnapshot")).toBeNull();
        expect(body.getAll("referenceImageIds")).toEqual(["reference_style_001"]);
        expect(body.get("generationNote")).toBe("");
        seenUploads.complete = true;
        return scenePackageResponse(scenePackage);
      },
    });

    try {
      const emptyPanel = await screen.findByRole("region", { name: "Empty scene images" });
      const completePanel = await screen.findByRole("region", { name: "Complete scene images" });
      const emptyInput = emptyPanel.querySelector<HTMLInputElement>('input[type="file"]');
      const completeInput = completePanel.querySelector<HTMLInputElement>('input[type="file"]');

      expect(emptyInput).toBeTruthy();
      expect(completeInput).toBeTruthy();
      await user.upload(emptyInput as HTMLInputElement, new File(["png"], "empty.png", { type: "image/png" }));
      await user.upload(completeInput as HTMLInputElement, new File(["png"], "complete.png", { type: "image/png" }));

      await waitFor(() => expect(seenUploads).toEqual({ empty: true, complete: true }));
    } finally {
      view.restore();
    }
  });
});

function mockAssemblyExportCanvas() {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({
    drawImage() {},
    save() {},
    restore() {},
    translate() {},
    rotate() {},
  }) as unknown as CanvasRenderingContext2D);
}

function scenePackageResponse(scenePackage: unknown): Response {
  return new Response(JSON.stringify({ scenePackage }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
