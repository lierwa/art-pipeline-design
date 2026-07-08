import "./assemblyEditorDependencyMocks";
import { readFileSync } from "node:fs";
import path from "node:path";
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
  it("keeps the product TopAppBar on the Course Planner board route", async () => {
    const restoreFetch = installCoursePlannerRoutingFetchMock(coursePlannerState());

    try {
      window.history.pushState({}, "", "/course-planner");
      render(<App />);

      const banner = await screen.findByRole("banner");
      expect(within(banner).getByRole("heading", { name: "Course Planner" })).toBeInTheDocument();
      expect(within(banner).getByRole("navigation", { name: /product areas/i })).toBeInTheDocument();
      expect(await screen.findByRole("heading", { name: "Scene Pack / Chapter Board" })).toBeInTheDocument();
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });

  it("keeps the product TopAppBar on the Chapter Studio route with local board context", async () => {
    const restoreFetch = installCoursePlannerRoutingFetchMock(
      coursePlannerState({ chapter: studioChapterFixture({ status: "imported" }) }),
    );

    try {
      window.history.pushState({}, "", "/course-planner/chapters/chapter_breakfast_kitchen");
      render(<App />);

      const banner = await screen.findByRole("banner");
      expect(within(banner).getByRole("heading", { name: "Course Planner" })).toBeInTheDocument();
      const workspace = await screen.findByRole("main");
      expect(within(workspace).getByRole("link", { name: "Back to board" })).toHaveAttribute("href", "/course-planner");
      expect(within(workspace).getByText("室内家庭篇 / Chapter Scene Studio")).toBeInTheDocument();
      expect(within(workspace).getAllByRole("heading", { name: "早餐厨房" }).length).toBeGreaterThan(0);
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });

  it("keeps the product TopAppBar on the loaded Assembly Editor route with local Chapter context", async () => {
    const restoreFetch = installCoursePlannerRoutingFetchMock(
      coursePlannerState({ chapter: studioChapterFixture({ status: "imported" }) }),
    );

    try {
      window.history.pushState({}, "", "/course-planner/chapters/chapter_breakfast_kitchen/assembly");
      render(<App />);

      const banner = await screen.findByRole("banner");
      expect(within(banner).getByRole("heading", { name: "Course Planner" })).toBeInTheDocument();
      const workspace = await screen.findByRole("region", { name: "Assembly workspace" });
      expect(within(workspace).getByRole("link", { name: "Back to Chapter" })).toHaveAttribute(
        "href",
        "/course-planner/chapters/chapter_breakfast_kitchen",
      );
      expect(within(workspace).getByText("Assembly")).toBeInTheDocument();
      expect(within(workspace).getByText("早餐厨房")).toBeInTheDocument();
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });

  it("sizes the loaded Assembly Editor through the real product shell without the unused app footer row", async () => {
    const restoreFetch = installCoursePlannerRoutingFetchMock(
      coursePlannerState({ chapter: studioChapterFixture({ status: "imported" }) }),
    );

    try {
      window.history.pushState({}, "", "/course-planner/chapters/chapter_breakfast_kitchen/assembly");
      render(<App />);

      const banner = await screen.findByRole("banner");
      const workspace = await screen.findByRole("region", { name: "Assembly workspace" });
      const shell = banner.closest(".app-shell");
      expect(shell).toHaveClass("course-planner-shell");
      expect(shell?.children[0]).toBe(banner);
      expect(shell?.children[1]).toContainElement(workspace);

      const appCss = readFileSync(path.join(process.cwd(), "src", "styles.css"), "utf8");
      const shellRule = appCss.match(/\.course-planner-shell\s*\{[^}]+}/)?.[0] ?? "";
      expect(shellRule).toContain("grid-template-rows: 56px minmax(0, 1fr)");
      expect(shellRule).not.toContain("44px");
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });

  it("keeps Assembly local Chapter context while the Assembly route is loading", async () => {
    let resolveScenePackage: ((response: Response) => void) | null = null;
    const restoreFetch = installCoursePlannerRoutingFetchMock(
      coursePlannerState({ chapter: studioChapterFixture({ status: "imported" }) }),
      {
        fetchScenePackage: () => new Promise<Response>((resolve) => {
          resolveScenePackage = resolve;
        }),
      },
    );

    try {
      window.history.pushState({}, "", "/course-planner/chapters/chapter_breakfast_kitchen/assembly");
      render(<App />);

      const banner = await screen.findByRole("banner", { name: /course planner/i });
      expect(within(banner).getByRole("heading", { name: "Course Planner" })).toBeInTheDocument();
      const workspace = await screen.findByRole("main");
      expect(within(workspace).getByRole("link", { name: "Back to Chapter" })).toHaveAttribute(
        "href",
        "/course-planner/chapters/chapter_breakfast_kitchen",
      );
      expect(await within(workspace).findByRole("status", { name: /loading/i })).toBeInTheDocument();
      expect(within(workspace).queryByText(/^Loading$/)?.closest(".course-planner-page-header__actions")).toBeTruthy();
      expect(within(workspace).getByText("Assembly")).toBeInTheDocument();
      expect(within(workspace).getByText("早餐厨房")).toBeInTheDocument();
    } finally {
      resolveScenePackage?.(jsonResponse({ scenePackage: studioScenePackageFixture() }));
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });

  it("keeps Assembly local Chapter context when the Assembly route load fails", async () => {
    const restoreFetch = installCoursePlannerRoutingFetchMock(
      coursePlannerState({ chapter: studioChapterFixture({ status: "imported" }) }),
      {
        fetchScenePackage: () => jsonResponse({ message: "Scene package unavailable" }, 500),
      },
    );

    try {
      window.history.pushState({}, "", "/course-planner/chapters/chapter_breakfast_kitchen/assembly");
      render(<App />);

      const workspace = await screen.findByRole("main");
      expect(await within(workspace).findByText("Load failed")).toBeInTheDocument();
      expect(within(workspace).getByRole("link", { name: "Back to Chapter" })).toHaveAttribute(
        "href",
        "/course-planner/chapters/chapter_breakfast_kitchen",
      );
      expect(within(workspace).getByText("Assembly")).toBeInTheDocument();
      expect(within(workspace).getByText("早餐厨房")).toBeInTheDocument();
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });

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
      expect(within(workspace).getAllByRole("heading", { name: "早餐厨房" }).length).toBeGreaterThan(0);
      expect(within(workspace).queryByText(/attempt/i)).not.toBeInTheDocument();
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });
});

function installCoursePlannerRoutingFetchMock(
  state: CoursePlannerState,
  options: {
    fetchScenePackage?: (input: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>;
  } = {},
) {
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
      return options.fetchScenePackage?.(input, init) ?? jsonResponse({ scenePackage });
    }
    throw new Error(`Unexpected fetch call: ${path}`);
  });
}
