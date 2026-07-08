import "./assemblyEditorDependencyMocks";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, vi } from "vitest";

import {
  cleanup,
  describe,
  expect,
  fireEvent,
  it,
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from "../app/appTestHarness";
import { AssemblyWorkspacePanel } from "../../src/features/coursePlanner/components/AssemblyWorkspacePanel";
import { studioScenePackageFixture } from "./chapterWorkspaceFixtures";
import { AssemblyEditorHarness, mockScenePackageImages, scenePackageWithTwoPlacements } from "./assemblyEditorHarness";

beforeEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  vi.stubGlobal("requestAnimationFrame", ((callback: FrameRequestCallback) => {
    callback(performance.now());
    return 1;
  }) as typeof requestAnimationFrame);
  vi.stubGlobal("cancelAnimationFrame", (() => undefined) as typeof cancelAnimationFrame);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Assembly editor navigation shell", () => {
  it("sizes the Assembly route from the parent app-shell row instead of the full viewport", () => {
    const shellCss = readFileSync(
      path.join(process.cwd(), "src", "features", "coursePlanner", "components", "assemblyEditorShell.css"),
      "utf8",
    );
    const workspaceCss = readFileSync(
      path.join(process.cwd(), "src", "features", "coursePlanner", "components", "assemblyWorkspace.css"),
      "utf8",
    );

    for (const css of [shellCss, workspaceCss]) {
      const pageRule = css.match(/\.chapter-assembly-editor-page\s*\{[^}]+}/)?.[0] ?? "";
      expect(pageRule).toContain("height: 100%");
      expect(pageRule).toContain("min-height: 0");
      expect(pageRule).not.toContain("height: 100vh");
    }

    const routePageRule = shellCss.match(/\.chapter-assembly-editor-page\s*\{[^}]+}/)?.[0] ?? "";
    expect(routePageRule).toContain("grid-template-rows: auto minmax(0, 1fr)");

    const productShellRule = shellCss.match(/\.assembly-product-shell\s*\{[^}]+}/)?.[0] ?? "";
    expect(productShellRule).toContain("grid-template-rows: auto minmax(0, 1fr) 44px");
  });

  it("keeps the inspector rail split into fixed properties and scrollable layers", () => {
    const workspaceCss = readFileSync(
      path.join(process.cwd(), "src", "features", "coursePlanner", "components", "assemblyWorkspace.css"),
      "utf8",
    );
    const rightRailCss = readFileSync(
      path.join(process.cwd(), "src", "features", "coursePlanner", "components", "assemblyRightRail.css"),
      "utf8",
    );

    const inspectorRule = workspaceCss.match(
      /\.assembly-editor-inspector-column\s*\{[^}]*grid-template-rows:[^}]+}/,
    )?.[0] ?? "";
    expect(inspectorRule).toContain("grid-template-rows: clamp(320px, 38%, 440px) minmax(0, 1fr)");
    expect(inspectorRule).toContain("overflow: hidden");

    const propertiesRule = rightRailCss.match(/\.assembly-placement-properties-panel\s*\{[^}]+}/)?.[0] ?? "";
    expect(propertiesRule).toContain("height: 100%");
    expect(propertiesRule).toContain("overflow: hidden");

    const layersBodyRule = rightRailCss.match(/\.assembly-placement-list-panel > \.asset-tree-body\s*\{[^}]+}/)?.[0] ?? "";
    expect(layersBodyRule).toContain("overflow-x: hidden");
    expect(layersBodyRule).toContain("overflow-y: auto");

    expect(rightRailCss).toContain(".assembly-layer-native-tree");
    expect(rightRailCss).toContain(".assembly-layer-drop-zone");
    expect(rightRailCss).toContain(".assembly-layer-drop-zone.is-over::before");
    expect(rightRailCss).toContain(".assembly-layer-drag-overlay");
    const rowRule = rightRailCss.match(/\.assembly-layer-item \.asset-tree-row\s*\{[^}]+}/)?.[0] ?? "";
    expect(rowRule).toContain("grid-template-columns: minmax(0, 1fr) max-content");
    const depthRule = rightRailCss.match(/\.assembly-layer-item \.asset-tree-row-depth\s*\{[^}]+}/)?.[0] ?? "";
    expect(depthRule).toContain("padding-left: var(--assembly-layer-depth-offset, 0)");
    const selectRule = rightRailCss.match(/\.assembly-layer-row-select\s*\{[^}]+}/)?.[0] ?? "";
    expect(selectRule).toContain("grid-template-columns: 24px minmax(0, 1fr)");
    expect(selectRule).toContain("width: 100%");
    const nameRule = rightRailCss.match(/\.assembly-layer-name\s*\{[^}]+}/)?.[0] ?? "";
    expect(nameRule).toContain("display: block");
    expect(nameRule).toContain("width: 100%");
    const actionsRule = rightRailCss.match(/\.assembly-layer-row-actions\s*\{[^}]+}/)?.[0] ?? "";
    expect(actionsRule).not.toContain("\n  width: 52px;");
    expect(actionsRule).toContain("min-width: max-content");
    expect(actionsRule).toContain("flex: 0 0 auto");
    expect(actionsRule).toContain("overflow: hidden");
    expect(actionsRule).toContain("justify-content: flex-end");
  });

  it("renders local Assembly header and Back to Chapter context", async () => {
    mockScenePackageImages();
    render(
      <MemoryRouter>
        <AssemblyWorkspacePanel
          backTo="/course-planner/chapters/chapter_breakfast_kitchen"
          chapterTitle="Chapter 02 - Breakfast Time"
          onDeleteChapterAsset={vi.fn(async () => null)}
          onDuplicateChapterAsset={vi.fn(async () => null)}
          onListGeneratedAssets={vi.fn(async () => [])}
          onMaterializeGeneratedAsset={vi.fn(async () => null)}
          onSaveAssembly={vi.fn(async () => null)}
          onUploadDirectAsset={vi.fn(async () => null)}
          scenePackage={studioScenePackageFixture()}
        />
      </MemoryRouter>,
    );

    const workspace = await screen.findByRole("region", { name: "Assembly workspace" });
    expect(within(workspace).getByRole("link", { name: "Back to Chapter" })).toHaveAttribute(
      "href",
      "/course-planner/chapters/chapter_breakfast_kitchen",
    );
    expect(within(workspace).getByText("Assembly")).toBeInTheDocument();
    expect(within(workspace).getByText("Chapter 02 - Breakfast Time")).toBeInTheDocument();
  });

  it("renders Assembly under its product top bar with a resizable three-panel editor", async () => {
    mockScenePackageImages();
    render(
      <MemoryRouter>
        <AssemblyWorkspacePanel
          backTo="/course-planner/chapters/chapter_breakfast_kitchen"
          chapterTitle="Chapter 02 - Breakfast Time"
          onDeleteChapterAsset={vi.fn(async () => null)}
          onDuplicateChapterAsset={vi.fn(async () => null)}
          onListGeneratedAssets={vi.fn(async () => [])}
          onMaterializeGeneratedAsset={vi.fn(async () => null)}
          onSaveAssembly={vi.fn(async () => null)}
          onUploadDirectAsset={vi.fn(async () => null)}
          scenePackage={studioScenePackageFixture()}
        />
      </MemoryRouter>,
    );

    const workspace = await screen.findByRole("region", { name: "Assembly workspace" });
    const topbar = within(workspace).getByRole("banner", { name: "Assembly editor top bar" });
    const editorLayout = within(workspace).getByTestId("assembly-editor-layout");

    expect(topbar.compareDocumentPosition(editorLayout) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(editorLayout).toHaveAttribute("data-panel-group");
    expect(editorLayout).toHaveClass("assembly-editor-layout");
    expect(editorLayout).toHaveStyle({ height: "100%" });
    expect(within(editorLayout).getAllByTestId(/assembly-editor-(assets|canvas|inspector)-panel/)).toHaveLength(3);
    expect(within(editorLayout).getAllByRole("separator", { name: /Resize .* rail/ })).toHaveLength(2);
  });

  it("persists rail widths only in local UI storage and never in the Assembly save manifest", async () => {
    mockScenePackageImages();
    const saveSpy = vi.fn();
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithTwoPlacements()}
        onSaveAssemblyManifest={saveSpy}
      />,
    );

    const editorLayout = await screen.findByTestId("assembly-editor-layout");
    expect(within(editorLayout).getByRole("separator", { name: "Resize assets rail" })).toBeInTheDocument();
    const properties = screen.getByRole("region", { name: "Placement properties" });
    fireEvent.change(within(properties).getByLabelText("Position X"), { target: { value: "450" } });
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });

    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem("course-planner:assembly-editor:panel-layout")).toBeTruthy();
    expect(JSON.stringify(saveSpy.mock.calls[0]?.[0])).not.toMatch(/panel|rail|layout/i);
  });

  it("opens generated Chapter Assets as a fixed overlay without resizing the editor panel grid", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    render(
      <AssemblyEditorHarness
        generatedAssets={[{
          complete_scene_image_id: "complete_scene_001",
          pipeline_run_id: "pipeline_run_001",
          run_asset_id: "asset_generated_bowl",
          display_name: "Generated bowl",
          state: "ready",
          width: 512,
          height: 512,
          unavailable_reason: null,
          chapter_asset_id: null,
        }]}
        initialScenePackage={scenePackageWithTwoPlacements()}
      />,
    );

    const editorLayout = await screen.findByTestId("assembly-editor-layout");
    const panelCountBeforeOpen = within(editorLayout).getAllByTestId(/assembly-editor-(assets|canvas|inspector)-panel/).length;
    await user.click(screen.getByRole("button", { name: "Import generated assets" }));

    const drawer = await screen.findByRole("complementary", { name: "Generated Chapter Assets" });
    expect(drawer.closest(".course-planner-drawer-overlay")).toBeInTheDocument();
    expect(drawer.closest(".assembly-editor-layout")).toBeNull();
    expect(within(editorLayout).getAllByTestId(/assembly-editor-(assets|canvas|inspector)-panel/)).toHaveLength(panelCountBeforeOpen);
  });
});
