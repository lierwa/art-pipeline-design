import "./assemblyEditorDependencyMocks";
import type { CoursePlannerState } from "../../src/features/coursePlanner/types";
import {
  App,
  describe,
  expect,
  installFetchMock,
  it,
  jsonResponse,
  render,
  screen,
  userEvent,
  within,
} from "../app/appTestHarness";
import {
  characterIpFixture,
  coursePlannerState,
  referenceImageFixture,
  studioChapterFixture,
  studioScenePackageFixture,
} from "./chapterWorkspaceTestHelpers";

describe("Course Planner route navigation", () => {
  it("shows product navigation beside the logo and routes between product areas", async () => {
    const user = userEvent.setup();
    const restoreFetch = installCoursePlannerRoutingFetchMock(coursePlannerState());

    try {
      window.history.pushState({}, "", "/pipeline");
      render(<App />);

      const banner = await screen.findByRole("banner");
      const productNav = within(banner).getByRole("navigation", { name: /product areas/i });
      expect(within(productNav).getByRole("link", { name: /pipeline/i })).toHaveAttribute("href", "/pipeline");
      expect(within(productNav).getByRole("link", { name: /course planner/i })).toHaveAttribute("href", "/course-planner");
      expect(within(productNav).getByRole("link", { name: /lesson plan/i })).toHaveAttribute("href", "/lesson-plan");

      await user.click(within(productNav).getByRole("link", { name: /course planner/i }));
      expect(await screen.findByRole("heading", { name: "Scene Pack / Chapter Board" })).toBeInTheDocument();

      await user.click(within(productNav).getByRole("link", { name: /lesson plan/i }));
      expect(await screen.findByRole("heading", { name: /lesson plan/i })).toBeInTheDocument();
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });

  it("routes 01 board to 02 chapter scene studio", async () => {
    const restoreFetch = installCoursePlannerRoutingFetchMock(
      coursePlannerState({ chapter: studioChapterFixture({ status: "imported" }) }),
    );

    try {
      window.history.pushState({}, "", "/course-planner");
      const boardView = render(<App />);

      expect(await screen.findByRole("heading", { name: "Scene Pack / Chapter Board" })).toBeInTheDocument();
      boardView.unmount();
      window.history.pushState({}, "", "/course-planner/chapters/chapter_breakfast_kitchen");
      render(<App />);

      expect(window.location.pathname).toBe("/course-planner/chapters/chapter_breakfast_kitchen");
      const workspace = await screen.findByRole("main");
      expect(within(workspace).getByRole("heading", { name: "早餐厨房" })).toBeInTheDocument();
      expect(within(workspace).getByText("Prompt")).toBeInTheDocument();
      expect(within(workspace).queryByText(/attempt/i)).not.toBeInTheDocument();
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });
});

function installCoursePlannerRoutingFetchMock(state: CoursePlannerState) {
  const scenePackage = studioScenePackageFixture();

  return installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path === "/api/workspace/runs" && (!init || init.method === "GET")) {
      return jsonResponse({ runs: [] });
    }
    if (path === "/api/workspace/state" && (!init || init.method === "GET")) {
      return jsonResponse({ source: null, elements: [], detectionVocabulary: [] });
    }
    if (path === "/api/course-planner/state" && (!init || init.method === "GET")) {
      return jsonResponse(state);
    }
    if (path === "/api/course-planner/character-ips" && (!init || init.method === "GET")) {
      return jsonResponse({ characterIps: [characterIpFixture()] });
    }
    if (path === "/api/course-planner/reference-library/images" && (!init || init.method === "GET")) {
      return jsonResponse({ referenceImages: [referenceImageFixture()] });
    }
    if (path.endsWith(`/chapters/${scenePackage.chapter_id}/scene-package`) && (!init || init.method === "GET")) {
      return jsonResponse({ scenePackage });
    }
    throw new Error(`Unexpected fetch call: ${path}`);
  });
}
