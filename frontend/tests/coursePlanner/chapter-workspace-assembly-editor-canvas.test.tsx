import "./assemblyEditorDependencyMocks";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, vi } from "vitest";

import {
  cleanup,
  describe,
  expect,
  fireEvent,
  it,
  mockRect,
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from "../app/appTestHarness";
import { AssemblyEditorCanvas } from "../../src/features/coursePlanner/components/AssemblyEditorCanvas";
import { scenePackageMediaUrl } from "../../src/features/coursePlanner/scenePackageMedia";
import {
  sceneAsset,
  studioScenePackageFixture,
} from "./chapterWorkspaceFixtures";

import {
  AssemblyEditorHarness,
  emptyAssemblyManifest,
  mockScenePackageImages,
  scenePackageWithTwoPlacements,
  scenePackageWithTwoPlacementsConfig,
} from "./assemblyEditorHarness";
import { layerLabels } from "./assemblyEditorTestUtils";

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal("requestAnimationFrame", ((callback: FrameRequestCallback) => {
    callback(performance.now());
    return 1;
  }) as typeof requestAnimationFrame);
  vi.stubGlobal("cancelAnimationFrame", (() => undefined) as typeof cancelAnimationFrame);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});


describe("Chapter Scene Studio assembly canvas bridge", () => {
  it("renders a Canvas header with the selected Empty Scene dimensions", () => {
    const scenePackage = scenePackageWithCanvasSize(1024, 768);

    render(
      <AssemblyEditorCanvas
        draft={scenePackage.assembly}
        scenePackage={scenePackage}
        selectedPlacementId={null}
        onDraftChange={vi.fn()}
        onSelectPlacement={vi.fn()}
      />,
    );

    const canvasRegion = screen.getByRole("region", { name: "Assembly canvas" });
    expect(screen.queryByText(/Get a license for production/i)).not.toBeInTheDocument();
    expect(within(canvasRegion).getByRole("heading", { name: "Canvas" })).toBeInTheDocument();
    expect(within(canvasRegion).getByText("1024 x 768")).toBeInTheDocument();
    expect(within(canvasRegion).getByTestId("canvas-artboard")).toBeInTheDocument();
    expect(within(canvasRegion).getByTestId("canvas-drawing-surface")).toBeInTheDocument();
    expect(within(canvasRegion).getByRole("button", { name: "Fit canvas" })).toBeEnabled();
  });

  it("keeps the Assembly canvas body as the remaining-height editor region without fixed pixel sizing", () => {
    const scenePackage = scenePackageWithCanvasSize(1024, 768);

    render(
      <AssemblyEditorCanvas
        draft={scenePackage.assembly}
        scenePackage={scenePackage}
        selectedPlacementId={null}
        onDraftChange={vi.fn()}
        onSelectPlacement={vi.fn()}
      />,
    );

    const canvasRegion = screen.getByRole("region", { name: "Assembly canvas" });
    const canvasBody = within(canvasRegion).getByTestId("assembly-editor-canvas-body");

    expect(canvasRegion).toHaveStyle({ minHeight: "0px" });
    expect(canvasBody).toHaveStyle({ height: "100%" });
    expect(canvasBody).toHaveStyle({ minHeight: "0px" });
    expect(canvasBody.style.height).not.toMatch(/px$/);
  });

  it("removes rejected toolbar controls and keeps manual save icon-only", () => {
    const scenePackage = scenePackageWithCanvasSize(1024, 768);

    render(
      <AssemblyEditorCanvas
        canTriggerSave
        draft={scenePackage.assembly}
        scenePackage={scenePackage}
        selectedPlacementId={null}
        onDraftChange={vi.fn()}
        onSave={vi.fn(async () => undefined)}
        onSelectPlacement={vi.fn()}
      />,
    );

    const toolbar = within(screen.getByRole("region", { name: "Assembly canvas" }))
      .getByRole("toolbar", { name: "Canvas tools" });
    expect(within(toolbar).queryByRole("button", { name: "Save Assembly" })).not.toBeInTheDocument();
    expect(within(toolbar).queryByLabelText("Alignment controls")).not.toBeInTheDocument();
    expect(within(toolbar).queryByRole("button", { name: "Align left" })).not.toBeInTheDocument();
    expect(within(toolbar).queryByLabelText("Show boxes")).not.toBeInTheDocument();

    const saveButton = within(toolbar).getByRole("button", { name: /save/i });
    expect(saveButton).toHaveClass("shared-icon-button");
    expect(saveButton).not.toHaveClass("shared-icon-button-with-label");
  });

  it("keeps image content below the selected frame, labels, and edit affordances with standard cursors", () => {
    const stylesCss = readFileSync(path.join(process.cwd(), "src", "styles.css"), "utf8");

    expect(cssRule(stylesCss, ".canvas-object-image")).toContain("z-index: 1");
    expect(cssRule(stylesCss, ".overlay-box")).toContain("z-index: 2");
    expect(cssRule(stylesCss, ".overlay-label,\n.overlay-mask-placeholder")).toContain("z-index: 3");
    expect(cssRule(stylesCss, ".canvas-edit-region")).toContain("cursor: move");
    expect(cssRule(stylesCss, ".resize-handle-nw")).toContain("cursor: nwse-resize");
    expect(cssRule(stylesCss, ".resize-handle-ne")).toContain("cursor: nesw-resize");
    expect(cssRule(stylesCss, ".resize-handle-e")).toContain("cursor: ew-resize");
    expect(cssRule(stylesCss, ".resize-handle-s")).toContain("cursor: ns-resize");
    expect(cssRule(stylesCss, ".rotate-handle")).toContain("cursor: grab");
  });

  it("updates placement transform through shared canvas box editing", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    render(<AssemblyEditorHarness initialScenePackage={scenePackageWithTwoPlacements()} />);

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    await user.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));

    const properties = screen.getByRole("region", { name: "Placement properties" });
    expect(within(properties).getByLabelText("Position X")).toHaveDisplayValue("430");
    expect(within(properties).getByLabelText("Position Y")).toHaveDisplayValue("594");
    expect(within(properties).getByLabelText("Width")).toHaveDisplayValue("184");
    expect(within(properties).getByLabelText("Height")).toHaveDisplayValue("184");

    const editRegion = screen.getByTestId("canvas-edit-region-placement_bowl");
    fireEvent.keyDown(editRegion, { key: "ArrowRight", shiftKey: true });
    fireEvent.keyDown(editRegion, { key: "ArrowRight", shiftKey: true });
    fireEvent.keyDown(editRegion, { key: "ArrowDown", shiftKey: true });
    fireEvent.keyDown(editRegion, { key: "ArrowDown", shiftKey: true });

    expect(within(properties).getByLabelText("Position X")).toHaveDisplayValue("450");
    expect(within(properties).getByLabelText("Position Y")).toHaveDisplayValue("614");
    expect(within(properties).getByLabelText("Width")).toHaveDisplayValue("184");
    expect(within(properties).getByLabelText("Height")).toHaveDisplayValue("184");
  });

  it("supports Assembly undo, redo, save, and viewport shortcuts from the shared canvas keyboard model", async () => {
    mockScenePackageImages();
    const saveSpy = vi.fn();
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithTwoPlacements()}
        onSaveAssemblyManifest={saveSpy}
      />,
    );

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    fireEvent.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));
    const properties = screen.getByRole("region", { name: "Placement properties" });
    const editRegion = screen.getByTestId("canvas-edit-region-placement_bowl");
    fireEvent.keyDown(editRegion, { key: "ArrowRight", shiftKey: true });
    expect(within(properties).getByLabelText("Position X")).toHaveDisplayValue("440");

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(within(properties).getByLabelText("Position X")).toHaveDisplayValue("430");

    fireEvent.keyDown(window, { key: "Z", ctrlKey: true, shiftKey: true });
    expect(within(properties).getByLabelText("Position X")).toHaveDisplayValue("440");

    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
    expect(saveSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      placements: expect.arrayContaining([
        expect.objectContaining({
          id: "placement_bowl",
          transform: expect.objectContaining({ cx: 440 / 1024 }),
        }),
      ]),
    }));

    const canvasRegion = screen.getByRole("region", { name: "Assembly canvas" });
    const canvasToolbar = within(canvasRegion).getByRole("toolbar", { name: "Canvas tools" });
    fireEvent.keyDown(window, { code: "Space", key: " " });
    expect(within(canvasToolbar).getByRole("button", { name: "Pan canvas" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyUp(window, { code: "Space", key: " " });
    expect(within(canvasToolbar).getByRole("button", { name: "Pan canvas" })).toHaveAttribute("aria-pressed", "false");

    fireEvent.keyDown(window, { key: "r" });
    expect(within(canvasToolbar).getByRole("button", { name: "Pan canvas" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(window, { key: "q" });
    expect(within(canvasToolbar).getByRole("button", { name: "Select" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.keyDown(window, { key: "+" });
    expect(within(canvasToolbar).getByText("85%")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "-" });
    expect(within(canvasToolbar).getByText("80%")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "0" });
    expect(within(canvasToolbar).getByText("80%")).toBeInTheDocument();

    const artboard = within(canvasRegion).getByTestId("canvas-artboard");
    mockRect(artboard, { left: 0, top: 0, width: 1024, height: 1024 });
    fireEvent.contextMenu(within(canvasRegion).getByTestId("canvas-drawing-surface"), { clientX: 430, clientY: 594 });
    expect(await screen.findByRole("menu", { name: "Placement actions" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu", { name: "Placement actions" })).not.toBeInTheDocument());
  });

  it("renders readable Assembly labels and lets authors toggle placement names", async () => {
    mockScenePackageImages();
    const uuidAssetId = "40764843-f70d-48dd-9d6a-8475a3fff53d";
    const scenePackage = studioScenePackageFixture({
      chapter_assets: [
        sceneAsset(uuidAssetId, uuidAssetId, `${uuidAssetId}.png`, { linkedTargetObjectId: "target_object_bowl" }),
      ],
      assembly: {
        ...studioScenePackageFixture().assembly,
        placements: [
          {
            id: "placement_uuid",
            asset_id: uuidAssetId,
            display_name: uuidAssetId,
            runtime_role: "target",
            transform: { cx: 0.42, cy: 0.58, w: 0.18, h: 0.18, rotation_deg: 0 },
            group_id: null,
            requires_placed: [],
          },
        ],
        layer_order: ["placement_uuid"],
      },
    });

    render(<AssemblyEditorHarness initialScenePackage={scenePackage} />);

    const canvasRegion = screen.getByRole("region", { name: "Assembly canvas" });
    const toolbar = within(canvasRegion).getByRole("toolbar", { name: "Canvas tools" });
    expect(within(canvasRegion).getByTestId("overlay-label-placement_uuid")).toHaveTextContent("Unnamed target asset");
    expect(canvasRegion).not.toHaveTextContent(uuidAssetId);

    await userEvent.click(within(toolbar).getByRole("checkbox", { name: "Show names" }));
    expect(within(canvasRegion).queryByTestId("overlay-label-placement_uuid")).not.toBeInTheDocument();

    await userEvent.click(within(toolbar).getByRole("checkbox", { name: "Show names" }));
    expect(within(canvasRegion).getByTestId("overlay-label-placement_uuid")).toHaveTextContent("Unnamed target asset");
  });

  it("renders Assembly placement rotation on shared canvas overlays and edit controls", () => {
    const scenePackage = scenePackageWithTwoPlacementsConfig({
      placementOverrides: {
        placement_bowl: { transform: { rotation_deg: 30 } },
      },
    });

    render(
      <AssemblyEditorCanvas
        draft={scenePackage.assembly}
        scenePackage={scenePackage}
        selectedPlacementId="placement_bowl"
        onDraftChange={vi.fn()}
        onSelectPlacement={vi.fn()}
      />,
    );

    const overlayRegion = screen.getByTestId("overlay-region-placement_bowl");
    const editControls = screen.getByTestId("canvas-edit-region-placement_bowl").parentElement;
    expect(overlayRegion).toHaveStyle({ transform: "rotate(30deg)" });
    expect(editControls).toHaveStyle({ transform: "rotate(30deg)" });
  });

  it("renders placed chapter assets as full box content instead of selected-corner thumbnails", () => {
    const scenePackage = scenePackageWithTwoPlacements();

    render(
      <AssemblyEditorCanvas
        draft={scenePackage.assembly}
        scenePackage={scenePackage}
        selectedPlacementId="placement_bowl"
        onDraftChange={vi.fn()}
        onSelectPlacement={vi.fn()}
      />,
    );

    const overlayRegion = screen.getByTestId("overlay-region-placement_bowl");
    const objectImage = overlayRegion.querySelector<HTMLImageElement>(".canvas-object-image");
    expect(objectImage).not.toBeNull();
    expect(objectImage).toHaveAttribute(
      "src",
      scenePackageMediaUrl(scenePackage.chapter_id, "chapter_assets", "chapter_asset_bowl"),
    );
    expect(overlayRegion.querySelector(".overlay-thumb")).toBeNull();
    expect(screen.getByTestId("overlay-box-placement_bowl")).toBeVisible();
    expect(screen.getByTestId("canvas-edit-region-placement_bowl")).toHaveClass("canvas-edit-region");
    expect(screen.getByTestId("resize-handle-placement_bowl-nw")).toHaveClass("resize-handle-nw");
    expect(screen.getByTestId("rotate-handle-placement_bowl")).toHaveClass("rotate-handle");
  });

  it("rotates the selected placement from the canvas handle through the manifest draft", () => {
    const scenePackage = scenePackageWithTwoPlacements();
    const onDraftChange = vi.fn();

    render(
      <AssemblyEditorCanvas
        draft={scenePackage.assembly}
        scenePackage={scenePackage}
        selectedPlacementId="placement_bowl"
        onDraftChange={onDraftChange}
        onSelectPlacement={vi.fn()}
      />,
    );

    const canvasRegion = screen.getByRole("region", { name: "Assembly canvas" });
    const artboard = within(canvasRegion).getByTestId("canvas-artboard");
    mockRect(artboard, { left: 0, top: 0, width: 1024, height: 1024 });

    fireEvent.pointerDown(screen.getByTestId("rotate-handle-placement_bowl"), {
      clientX: 430,
      clientY: 300,
      pointerId: 1,
      button: 0,
      buttons: 1,
    });
    fireEvent.pointerMove(document, {
      clientX: 760,
      clientY: 594,
      pointerId: 1,
      buttons: 1,
    });
    fireEvent.pointerUp(document, { pointerId: 1 });

    expect(onDraftChange).toHaveBeenCalled();
    const savedDraft = onDraftChange.mock.calls.at(-1)?.[0];
    expect(savedDraft.placements.find((placement) => placement.id === "placement_bowl")?.transform.rotation_deg).not.toBe(0);
  });

  it("projects placements with the selected Empty Scene image size when draft size is absent", () => {
    const scenePackage = scenePackageWithCanvasSize(800, 600, null);

    render(
      <AssemblyEditorCanvas
        draft={scenePackage.assembly}
        scenePackage={scenePackage}
        selectedPlacementId="placement_bowl"
        onDraftChange={vi.fn()}
        onSelectPlacement={vi.fn()}
      />,
    );

    const overlayRegion = screen.getByTestId("overlay-region-placement_bowl");
    const editControls = screen.getByTestId("canvas-edit-region-placement_bowl").parentElement;
    expectPercentBoxStyle(overlayRegion, { left: 33, top: 49, width: 18, height: 18 });
    expectPercentBoxStyle(editControls, { left: 33, top: 49, width: 18, height: 18 });
  });

  it("hit-tests overlapping Assembly placements front-to-back for modified click and context menu", () => {
    const scenePackage = scenePackageWithOverlappingPlacements();
    const onSelectPlacement = vi.fn();

    render(
      <AssemblyEditorCanvas
        draft={scenePackage.assembly}
        scenePackage={scenePackage}
        selectedPlacementId={null}
        onDraftChange={vi.fn()}
        onSelectPlacement={onSelectPlacement}
      />,
    );

    const canvasRegion = screen.getByRole("region", { name: "Assembly canvas" });
    const artboard = within(canvasRegion).getByTestId("canvas-artboard");
    const drawingSurface = within(canvasRegion).getByTestId("canvas-drawing-surface");
    mockRect(artboard, { left: 0, top: 0, width: 1024, height: 1024 });

    fireEvent.mouseDown(drawingSurface, {
      clientX: 512,
      clientY: 512,
      button: 0,
      shiftKey: true,
    });

    expect(onSelectPlacement).toHaveBeenLastCalledWith("placement_bowl", "toggle");

    onSelectPlacement.mockClear();
    fireEvent.contextMenu(drawingSurface, {
      clientX: 512,
      clientY: 512,
    });

    expect(onSelectPlacement).toHaveBeenLastCalledWith("placement_bowl");
  });

  it("uses modifier clicks on the canvas to build an ordered multi-selection shared with layers", async () => {
    mockScenePackageImages();
    render(<AssemblyEditorHarness initialScenePackage={scenePackageWithTwoPlacements()} />);

    const canvasRegion = screen.getByRole("region", { name: "Assembly canvas" });
    const artboard = within(canvasRegion).getByTestId("canvas-artboard");
    const drawingSurface = within(canvasRegion).getByTestId("canvas-drawing-surface");
    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    mockRect(artboard, { left: 0, top: 0, width: 1024, height: 1024 });

    fireEvent.mouseDown(drawingSurface, { clientX: 430, clientY: 594, button: 0 });
    fireEvent.mouseDown(drawingSurface, { clientX: 635, clientY: 553, button: 0, shiftKey: true });

    await waitFor(() => {
      expect(within(layerTree).getByRole("button", { name: /Breakfast bowl target/, pressed: true })).toBeInTheDocument();
      expect(within(layerTree).getByRole("button", { name: /Cleanup cloth target/, pressed: true })).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Assembly editor status")).toHaveTextContent("2 selected");
  });

  it("marquee-selects multiple placements from the canvas drawing surface", async () => {
    mockScenePackageImages();
    render(<AssemblyEditorHarness initialScenePackage={scenePackageWithTwoPlacements()} />);

    const canvasRegion = screen.getByRole("region", { name: "Assembly canvas" });
    const artboard = within(canvasRegion).getByTestId("canvas-artboard");
    const drawingSurface = within(canvasRegion).getByTestId("canvas-drawing-surface");
    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    mockRect(artboard, { left: 0, top: 0, width: 1024, height: 1024 });

    fireEvent.mouseDown(drawingSurface, { clientX: 260, clientY: 400, button: 0 });
    fireEvent.mouseMove(drawingSurface, { clientX: 760, clientY: 740, button: 0 });
    fireEvent.mouseUp(drawingSurface, { clientX: 760, clientY: 740, button: 0 });

    await waitFor(() => {
      expect(within(layerTree).getByRole("button", { name: /Breakfast bowl target/, pressed: true })).toBeInTheDocument();
      expect(within(layerTree).getByRole("button", { name: /Cleanup cloth target/, pressed: true })).toBeInTheDocument();
    });
  });

  it("marquee-selects with source coordinates when the artboard is scaled and offset", async () => {
    mockScenePackageImages();
    render(<AssemblyEditorHarness initialScenePackage={scenePackageWithTwoPlacements()} />);

    const canvasRegion = screen.getByRole("region", { name: "Assembly canvas" });
    const artboard = within(canvasRegion).getByTestId("canvas-artboard");
    const drawingSurface = within(canvasRegion).getByTestId("canvas-drawing-surface");
    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    mockRect(artboard, { left: 120, top: 80, width: 512, height: 512 });

    fireEvent.mouseDown(drawingSurface, { clientX: 280, clientY: 315, button: 0 });
    fireEvent.mouseMove(drawingSurface, { clientX: 485, clientY: 430, button: 0 });
    fireEvent.mouseUp(drawingSurface, { clientX: 485, clientY: 430, button: 0 });

    await waitFor(() => {
      expect(within(layerTree).getByRole("button", { name: /Breakfast bowl target/, pressed: true })).toBeInTheDocument();
      expect(within(layerTree).getByRole("button", { name: /Cleanup cloth target/, pressed: true })).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Assembly editor status")).toHaveTextContent("2 selected");
  });

  it("renders the live marquee inside the transformed artboard while dragging", () => {
    mockScenePackageImages();
    render(<AssemblyEditorHarness initialScenePackage={scenePackageWithTwoPlacements()} />);

    const canvasRegion = screen.getByRole("region", { name: "Assembly canvas" });
    const artboard = within(canvasRegion).getByTestId("canvas-artboard");
    const drawingSurface = within(canvasRegion).getByTestId("canvas-drawing-surface");
    mockRect(artboard, { left: 120, top: 80, width: 512, height: 512 });

    fireEvent.mouseDown(drawingSurface, {
      clientX: 280,
      clientY: 315,
      button: 0,
    });
    fireEvent.mouseMove(drawingSurface, {
      clientX: 485,
      clientY: 430,
      buttons: 1,
    });

    const marquee = document.querySelector<HTMLElement>(".assembly-marquee");
    expect(marquee).toBeInTheDocument();
    expect(marquee?.parentElement).toBe(artboard);
    expect(marquee?.style.left).toBe("31.25%");
    expect(marquee?.style.top).toBe("45.8984375%");
    expect(marquee?.style.width).toBe("40.0390625%");
    expect(marquee?.style.height).toBe("22.4609375%");
  });

  it("drops an Asset Pool item at the pointer release point with 25 percent source-aspect sizing", async () => {
    mockScenePackageImages();
    render(<AssemblyEditorHarness initialScenePackage={scenePackageWithOnlyBowlPlacement()} />);

    const canvasRegion = screen.getByRole("region", { name: "Assembly canvas" });
    const artboard = within(canvasRegion).getByTestId("canvas-artboard");
    const drawingSurface = within(canvasRegion).getByTestId("canvas-drawing-surface");
    mockRect(artboard, { left: 0, top: 0, width: 1024, height: 1024 });
    const dataTransfer = createDataTransfer();

    fireEvent.dragStart(screen.getByRole("article", { name: "Add Cleanup cloth to Assembly" }), { dataTransfer });
    fireCanvasDragEvent(drawingSurface, "dragover", { clientX: 700, clientY: 300, dataTransfer });
    fireCanvasDragEvent(drawingSurface, "drop", { clientX: 700, clientY: 300, dataTransfer });

    const properties = screen.getByRole("region", { name: "Placement properties" });
    await waitFor(() => expect(properties).toHaveTextContent("Cleanup cloth"));
    expect(within(properties).getByLabelText("Position X")).toHaveDisplayValue("700");
    expect(within(properties).getByLabelText("Position Y")).toHaveDisplayValue("300");
    expect(within(properties).getByLabelText("Width")).toHaveDisplayValue("256");
    expect(within(properties).getByLabelText("Height")).toHaveDisplayValue("128");
  });

  it("click-add uses the viewport center and the 25 percent initial display policy", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    render(<AssemblyEditorHarness initialScenePackage={scenePackageWithOnlyBowlPlacement()} />);

    await user.click(
      within(screen.getByRole("article", { name: "Add Cleanup cloth to Assembly" }))
        .getByRole("button", { name: "Add to Assembly" }),
    );

    const properties = screen.getByRole("region", { name: "Placement properties" });
    await waitFor(() => expect(properties).toHaveTextContent("Cleanup cloth"));
    expect(within(properties).getByLabelText("Position X")).toHaveDisplayValue("512");
    expect(within(properties).getByLabelText("Position Y")).toHaveDisplayValue("512");
    expect(within(properties).getByLabelText("Width")).toHaveDisplayValue("256");
    expect(within(properties).getByLabelText("Height")).toHaveDisplayValue("128");
  });

  it("generated square assets are not placed at raw pixel size", async () => {
    mockGeneratedSquareScenePackageImages();
    render(<AssemblyEditorHarness initialScenePackage={scenePackageWithOnlyGeneratedAsset()} />);

    fireEvent.click(screen.getByRole("button", { name: "Add to Assembly" }));

    const properties = screen.getByRole("region", { name: "Placement properties" });
    await waitFor(() => expect(properties).toHaveTextContent("Generated square"));
    expect(within(properties).getByLabelText("Width")).toHaveDisplayValue("256");
    expect(within(properties).getByLabelText("Height")).toHaveDisplayValue("256");
  });

  it("supports select-all, group, ungroup, nudge, and confirmed Delete from canvas shortcuts", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    const saveSpy = vi.fn();
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithTwoPlacements()}
        onSaveAssemblyManifest={saveSpy}
      />,
    );

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    fireEvent.keyDown(window, { key: "a", ctrlKey: true });
    expect(screen.getByLabelText("Assembly editor status")).toHaveTextContent("2 selected");

    fireEvent.keyDown(window, { key: "ArrowRight", shiftKey: true });
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
    expect(saveSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      placements: expect.arrayContaining([
        expect.objectContaining({ id: "placement_bowl", transform: expect.objectContaining({ cx: 0.42 + 10 / 1024 }) }),
        expect.objectContaining({ id: "placement_cloth", transform: expect.objectContaining({ cx: 0.62 + 10 / 1024 }) }),
      ]),
    }));

    fireEvent.keyDown(window, { key: "g", ctrlKey: true });
    expect(within(layerTree).getByRole("button", { name: /Group 1 Group/, pressed: true })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "G", ctrlKey: true, shiftKey: true });
    expect(within(layerTree).queryByRole("button", { name: /Group 1 Group/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Assembly editor status")).toHaveTextContent("2 selected");

    fireEvent.keyDown(window, { key: "Delete" });
    expect(await screen.findByText("Delete selected placements?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm delete placements" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm delete placements" }));
    expect(within(layerTree).queryByRole("button", { name: /Breakfast bowl target/ })).not.toBeInTheDocument();
    expect(within(layerTree).queryByRole("button", { name: /Cleanup cloth target/ })).not.toBeInTheDocument();
  });

  it("keeps multi-selection without exposing alignment as an always-visible toolbar group", async () => {
    mockScenePackageImages();
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithTwoPlacementsConfig({
          placementOverrides: {
            placement_bowl: { transform: { w: 0.18, h: 0.12 } },
            placement_cloth: { transform: { w: 0.11, h: 0.16 } },
          },
        })}
      />,
    );

    fireEvent.keyDown(window, { key: "a", ctrlKey: true });
    const toolbar = within(screen.getByRole("region", { name: "Assembly canvas" }))
      .getByRole("toolbar", { name: "Canvas tools" });

    expect(screen.getByLabelText("Assembly editor status")).toHaveTextContent("2 selected");
    expect(within(toolbar).queryByLabelText("Alignment controls")).not.toBeInTheDocument();
    expect(within(toolbar).queryByRole("button", { name: "Align left" })).not.toBeInTheDocument();
  });

  it("auto-fits after Empty Scene changes even after a user zoom", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    const scenePackage = scenePackageWithAlternativeEmptyScene();
    const { rerender } = render(
      <AssemblyEditorCanvas
        draft={scenePackage.assembly}
        scenePackage={scenePackage}
        selectedPlacementId={null}
        onDraftChange={vi.fn()}
        onSelectPlacement={vi.fn()}
      />,
    );
    const canvasToolbar = within(screen.getByRole("region", { name: "Assembly canvas" }))
      .getByRole("toolbar", { name: "Canvas tools" });

    await user.click(within(canvasToolbar).getByRole("button", { name: "Zoom in" }));
    expect(within(canvasToolbar).getByText("85%")).toBeInTheDocument();

    rerender(
      <AssemblyEditorCanvas
        draft={{
          ...scenePackage.assembly,
          empty_scene_image_id: "empty_scene_002",
          empty_scene_size: { width: 1536, height: 1024 },
        }}
        scenePackage={scenePackage}
        selectedPlacementId={null}
        onDraftChange={vi.fn()}
        onSelectPlacement={vi.fn()}
      />,
    );

    await waitFor(() => expect(within(canvasToolbar).getByText("80%")).toBeInTheDocument());
    expect(within(canvasToolbar).queryByText("85%")).not.toBeInTheDocument();
  });

  it("undo and redo change manifest facts without restoring stale selection state", () => {
    mockScenePackageImages();
    render(<AssemblyEditorHarness initialScenePackage={scenePackageWithTwoPlacements()} />);

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    fireEvent.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));
    const properties = screen.getByRole("region", { name: "Placement properties" });
    fireEvent.change(within(properties).getByLabelText("Position X"), { target: { value: "450" } });

    fireEvent.click(within(layerTree).getByRole("button", { name: /Cleanup cloth target/ }));
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });

    expect(within(layerTree).getByRole("button", { name: /Cleanup cloth target/, pressed: true })).toBeInTheDocument();
    expect(within(layerTree).getByRole("button", { name: /Breakfast bowl target/, pressed: false })).toBeInTheDocument();
  });

  it("opens an Assembly placement menu on right-click and closes it from blank canvas context menu", async () => {
    mockScenePackageImages();
    render(<AssemblyEditorHarness initialScenePackage={scenePackageWithTwoPlacements()} />);

    const canvasRegion = screen.getByRole("region", { name: "Assembly canvas" });
    const artboard = within(canvasRegion).getByTestId("canvas-artboard");
    const drawingSurface = within(canvasRegion).getByTestId("canvas-drawing-surface");
    mockRect(artboard, { left: 0, top: 0, width: 1024, height: 1024 });

    fireEvent.contextMenu(drawingSurface, { clientX: 430, clientY: 594 });

    const menu = await screen.findByRole("menu", { name: "Placement actions" });
    expect(within(menu).getByRole("menuitem", { name: "Edit placement" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Move backward" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Send to back" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Remove placement" })).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: /Create child|Split|Click detect|Accept|Reject|Repair|Missing mask|Generate mask|Pipeline/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Breakfast bowl target/, pressed: true })).toBeInTheDocument();

    fireEvent.contextMenu(drawingSurface, { clientX: 20, clientY: 20 });

    await waitFor(() => expect(screen.queryByRole("menu", { name: "Placement actions" })).not.toBeInTheDocument());
  });

  it("requires confirmation before removing a placement from the context menu", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    render(<AssemblyEditorHarness initialScenePackage={scenePackageWithTwoPlacements()} />);

    const canvasRegion = screen.getByRole("region", { name: "Assembly canvas" });
    const artboard = within(canvasRegion).getByTestId("canvas-artboard");
    const drawingSurface = within(canvasRegion).getByTestId("canvas-drawing-surface");
    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    mockRect(artboard, { left: 0, top: 0, width: 1024, height: 1024 });

    fireEvent.contextMenu(drawingSurface, { clientX: 635, clientY: 553 });
    await user.click(await screen.findByRole("menuitem", { name: "Bring to front" }));

    expect(within(layerTree).getByRole("button", { name: /Cleanup cloth target/, pressed: true })).toBeInTheDocument();
    expect(layerLabels(layerTree)).toEqual(["Cleanup cloth", "Breakfast bowl"]);

    fireEvent.contextMenu(drawingSurface, { clientX: 635, clientY: 553 });
    await user.click(await screen.findByRole("menuitem", { name: "Remove placement" }));

    expect(await screen.findByText("Delete selected placement?")).toBeInTheDocument();
    expect(layerLabels(layerTree)).toContain("Cleanup cloth");

    await user.click(screen.getByRole("button", { name: "Confirm delete placement" }));

    expect(within(layerTree).queryByRole("button", { name: /Cleanup cloth target/ })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Placement properties" })).toHaveTextContent("No selection");
  });

  it("renders shared canvas toolbar controls wired to Assembly canvas controls", async () => {
    const scenePackage = scenePackageWithCanvasSize(1024, 768);
    const onEditorControlsChange = vi.fn();

    render(
      <AssemblyEditorCanvas
        draft={scenePackage.assembly}
        scenePackage={scenePackage}
        selectedPlacementId={null}
        onDraftChange={vi.fn()}
        onEditorControlsChange={onEditorControlsChange}
        onSelectPlacement={vi.fn()}
      />,
    );

    const canvasRegion = screen.getByRole("region", { name: "Assembly canvas" });
    const canvasToolbar = within(canvasRegion).getByRole("toolbar", { name: "Canvas tools" });
    expect(within(canvasToolbar).queryByRole("button", { name: "Zoom level unavailable" })).not.toBeInTheDocument();

    const zoomOutButton = within(canvasToolbar).getByRole("button", { name: "Zoom out" });
    const zoomInButton = within(canvasToolbar).getByRole("button", { name: "Zoom in" });
    const fitButton = within(canvasToolbar).getByRole("button", { name: "Fit canvas" });
    await waitFor(() => expect(zoomOutButton).toBeEnabled());

    await userEvent.click(zoomOutButton);
    await userEvent.click(zoomInButton);
    await userEvent.click(fitButton);

    expect(onEditorControlsChange).toHaveBeenLastCalledWith(expect.objectContaining({
      fit: expect.any(Function),
      pan: expect.any(Function),
      select: expect.any(Function),
      zoomIn: expect.any(Function),
      zoomOut: expect.any(Function),
    }));
  });

  it("clears published canvas controls when the selected Empty Scene is missing", async () => {
    const scenePackage = scenePackageWithCanvasSize(1024, 768);
    const onEditorControlsChange = vi.fn();
    const { rerender } = render(
      <AssemblyEditorCanvas
        draft={scenePackage.assembly}
        scenePackage={scenePackage}
        selectedPlacementId={null}
        onDraftChange={vi.fn()}
        onEditorControlsChange={onEditorControlsChange}
        onSelectPlacement={vi.fn()}
      />,
    );
    await waitFor(() => expect(onEditorControlsChange).toHaveBeenLastCalledWith(expect.any(Object)));
    onEditorControlsChange.mockClear();

    const missingEmptyScenePackage = {
      ...scenePackage,
      empty_scene_images: [],
      assembly: {
        ...scenePackage.assembly,
        empty_scene_image_id: "missing_empty_scene",
      },
    };
    rerender(
      <AssemblyEditorCanvas
        draft={missingEmptyScenePackage.assembly}
        scenePackage={missingEmptyScenePackage}
        selectedPlacementId={null}
        onDraftChange={vi.fn()}
        onEditorControlsChange={onEditorControlsChange}
        onSelectPlacement={vi.fn()}
      />,
    );

    expect(screen.getByRole("region", { name: "Assembly editor empty state" })).toBeInTheDocument();
    expect(screen.queryByRole("toolbar", { name: "Canvas tools" })).not.toBeInTheDocument();
    await waitFor(() => expect(onEditorControlsChange).toHaveBeenCalledWith(null));
  });

});

function scenePackageWithCanvasSize(
  width: number,
  height: number,
  draftSize: { width: number; height: number } | null = { width, height },
) {
  const scenePackage = studioScenePackageFixture();
  return studioScenePackageFixture({
    empty_scene_images: [
      {
        ...scenePackage.empty_scene_images[0],
        width,
        height,
      },
    ],
    assembly: {
      ...scenePackage.assembly,
      empty_scene_size: draftSize,
    },
  });
}

function cssRule(css: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`(?:^|\\n)${escapedSelector}\\s*\\{[^}]+}`))?.[0] ?? "";
}

function scenePackageWithAlternativeEmptyScene() {
  const scenePackage = scenePackageWithCanvasSize(1024, 1024);
  return {
    ...scenePackage,
    empty_scene_images: [
      scenePackage.empty_scene_images[0],
      {
        ...scenePackage.empty_scene_images[0],
        id: "empty_scene_002",
        original_filename: "empty-scene-wide.png",
        storage_path: "scene_package/empty_scene_002.png",
        width: 1536,
        height: 1024,
      },
    ],
  };
}

function scenePackageWithOverlappingPlacements() {
  const scenePackage = scenePackageWithTwoPlacements();
  return {
    ...scenePackage,
    assembly: {
      ...scenePackage.assembly,
      placements: scenePackage.assembly.placements.map((placement) => {
        if (placement.id === "placement_bowl") {
          return {
            ...placement,
            transform: { cx: 0.5, cy: 0.5, w: 0.5, h: 0.5, rotation_deg: 0 },
          };
        }
        return {
          ...placement,
          transform: { cx: 0.5, cy: 0.5, w: 0.2, h: 0.2, rotation_deg: 0 },
        };
      }),
      layer_order: ["placement_bowl", "placement_cloth"],
    },
  };
}

function scenePackageWithOnlyBowlPlacement() {
  const scenePackage = scenePackageWithTwoPlacements();
  return {
    ...scenePackage,
    assembly: {
      ...scenePackage.assembly,
      placements: scenePackage.assembly.placements.filter((placement) => placement.id === "placement_bowl"),
      layer_order: ["placement_bowl"],
    },
  };
}

function scenePackageWithOnlyGeneratedAsset() {
  const scenePackage = studioScenePackageFixture({
    chapter_assets: [
      sceneAsset("chapter_asset_generated_square", "Generated square", "generated-square.png", { linkedTargetObjectId: "target_object_bowl" }),
    ],
    assembly: emptyAssemblyManifest(),
  });
  return scenePackage;
}

function createDataTransfer() {
  const data = new Map<string, string>();
  return {
    dropEffect: "copy",
    effectAllowed: "all",
    getData: (type: string) => data.get(type) ?? "",
    setData: (type: string, value: string) => data.set(type, value),
    clearData: (type?: string) => {
      if (type) {
        data.delete(type);
      } else {
        data.clear();
      }
    },
    types: [],
  } as unknown as DataTransfer;
}

function fireCanvasDragEvent(
  target: HTMLElement,
  type: "dragover" | "drop",
  options: { clientX: number; clientY: number; dataTransfer: DataTransfer },
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clientX", { value: options.clientX });
  Object.defineProperty(event, "clientY", { value: options.clientY });
  Object.defineProperty(event, "dataTransfer", { value: options.dataTransfer });
  fireEvent(target, event);
}

function mockGeneratedSquareScenePackageImages() {
  class MockImage {
    onload: null | (() => void) = null;

    onerror: null | (() => void) = null;

    decode = vi.fn(async () => undefined);

    naturalWidth = 512;

    naturalHeight = 256;

    width = 512;

    height = 256;

    #src = "";

    set src(value: string) {
      this.#src = value;
      if (value.includes("empty_scene_images")) {
        this.naturalWidth = 1024;
        this.naturalHeight = 1024;
        this.width = 1024;
        this.height = 1024;
      }
      if (value.includes("chapter_asset_generated_square")) {
        this.naturalWidth = 1024;
        this.naturalHeight = 1024;
        this.width = 1024;
        this.height = 1024;
      }
      this.onload?.();
    }

    get src() {
      return this.#src;
    }
  }

  vi.stubGlobal("Image", MockImage as unknown as typeof Image);
}

function expectPercentBoxStyle(
  element: HTMLElement | null,
  expected: { left: number; top: number; width: number; height: number },
) {
  expect(element).not.toBeNull();
  expect(Number.parseFloat(element?.style.left ?? "")).toBeCloseTo(expected.left);
  expect(Number.parseFloat(element?.style.top ?? "")).toBeCloseTo(expected.top);
  expect(Number.parseFloat(element?.style.width ?? "")).toBeCloseTo(expected.width);
  expect(Number.parseFloat(element?.style.height ?? "")).toBeCloseTo(expected.height);
}
