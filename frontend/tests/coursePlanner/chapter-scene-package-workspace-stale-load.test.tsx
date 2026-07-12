import { useEffect } from "react";
import { act } from "@testing-library/react";
import { afterEach } from "vitest";

import {
  cleanup,
  describe,
  expect,
  installFetchMock,
  it,
  jsonResponse,
  render,
  screen,
  vi,
  waitFor,
} from "../app/appTestHarness";
import { useChapterScenePackageWorkspace } from "../../src/features/coursePlanner/hooks/useChapterScenePackageWorkspace";
import type { ChapterScenePackage } from "../../src/features/coursePlanner/types";
import {
  characterIpFixture,
  coursePlannerState,
  referenceImageFixture,
  studioChapterFixture,
  studioScenePackageFixture,
  studioScenePackFixture,
} from "./chapterWorkspaceTestHelpers";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Chapter scene-package workspace stale load guard", () => {
  it("hides the loaded scene-package immediately when navigating to another chapter", async () => {
    const firstChapter = studioChapterFixture();
    const secondChapter = studioChapterFixture({
      id: "chapter_evening_living_room",
      title: "晚间客厅",
      sortOrder: 2,
    });
    const scenePack = studioScenePackFixture({
      chapterIds: [firstChapter.id, secondChapter.id],
    });
    const state = {
      ...coursePlannerState({ chapter: firstChapter, scenePack }),
      chaptersByScenePackId: {
        [scenePack.id]: [firstChapter, secondChapter],
      },
    };
    const secondLoad = deferred<Response>();
    const firstScenePackage = scenePackageFor(firstChapter.id);
    const restoreFetch = installFetchMock(async (input, init) => {
      const path = String(input);
      if (path === "/api/course-planner/state" && (!init || init.method === "GET")) {
        return jsonResponse(state);
      }
      if (path === "/api/course-planner/character-ips" && (!init || init.method === "GET")) {
        return jsonResponse({ characterIps: [characterIpFixture()] });
      }
      if (path === "/api/course-planner/scene-style-references" && (!init || init.method === "GET")) {
        return jsonResponse({ sceneStyleReferences: [referenceImageFixture()] });
      }
      if (path.endsWith(`/chapters/${firstChapter.id}/scene-package`) && (!init || init.method === "GET")) {
        return jsonResponse({ scenePackage: firstScenePackage });
      }
      if (path.endsWith(`/chapters/${secondChapter.id}/scene-package`) && (!init || init.method === "GET")) {
        return secondLoad.promise;
      }
      throw new Error(`Unexpected fetch call: ${path}`);
    });

    try {
      const view = render(<ChapterWorkspaceProbe chapterId={firstChapter.id} />);

      await waitFor(() => expect(screen.getByTestId("loaded-scene-package")).toHaveTextContent(firstChapter.id));

      view.rerender(<ChapterWorkspaceProbe chapterId={secondChapter.id} />);

      expect(screen.getByTestId("loaded-scene-package")).not.toHaveTextContent(firstChapter.id);
      expect(screen.getByTestId("loaded-scene-package")).toHaveTextContent("loading");
    } finally {
      restoreFetch();
    }
  });

  it("keeps an older scene-package load from replacing the latest chapter data", async () => {
    const firstChapter = studioChapterFixture();
    const secondChapter = studioChapterFixture({
      id: "chapter_evening_living_room",
      title: "晚间客厅",
      sortOrder: 2,
    });
    const scenePack = studioScenePackFixture({
      chapterIds: [firstChapter.id, secondChapter.id],
    });
    const state = {
      ...coursePlannerState({ chapter: firstChapter, scenePack }),
      chaptersByScenePackId: {
        [scenePack.id]: [firstChapter, secondChapter],
      },
    };
    const firstLoad = deferred<Response>();
    const secondLoad = deferred<Response>();
    const firstScenePackage = scenePackageFor(firstChapter.id);
    const secondScenePackage = scenePackageFor(secondChapter.id);
    const restoreFetch = installFetchMock(async (input, init) => {
      const path = String(input);
      if (path === "/api/course-planner/state" && (!init || init.method === "GET")) {
        return jsonResponse(state);
      }
      if (path === "/api/course-planner/character-ips" && (!init || init.method === "GET")) {
        return jsonResponse({ characterIps: [characterIpFixture()] });
      }
      if (path === "/api/course-planner/scene-style-references" && (!init || init.method === "GET")) {
        return jsonResponse({ sceneStyleReferences: [referenceImageFixture()] });
      }
      if (path.endsWith(`/chapters/${firstChapter.id}/scene-package`) && (!init || init.method === "GET")) {
        return firstLoad.promise;
      }
      if (path.endsWith(`/chapters/${secondChapter.id}/scene-package`) && (!init || init.method === "GET")) {
        return secondLoad.promise;
      }
      throw new Error(`Unexpected fetch call: ${path}`);
    });

    try {
      const view = render(<ChapterWorkspaceProbe chapterId={firstChapter.id} />);

      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
        `/api/course-planner/chapters/${firstChapter.id}/scene-package`,
        { method: "GET" },
      ));

      view.rerender(<ChapterWorkspaceProbe chapterId={secondChapter.id} />);
      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
        `/api/course-planner/chapters/${secondChapter.id}/scene-package`,
        { method: "GET" },
      ));

      await resolveScenePackage(secondLoad, secondScenePackage);
      expect(screen.getByTestId("loaded-scene-package")).toHaveTextContent(secondChapter.id);

      await resolveScenePackage(firstLoad, firstScenePackage);
      expect(screen.getByTestId("loaded-scene-package")).toHaveTextContent(secondChapter.id);
    } finally {
      restoreFetch();
    }
  });

  it("keeps a mutation result from an inactive chapter from replacing current workspace data", async () => {
    const firstChapter = studioChapterFixture();
    const secondChapter = studioChapterFixture({
      id: "chapter_evening_living_room",
      title: "晚间客厅",
      sortOrder: 2,
    });
    const scenePack = studioScenePackFixture({
      chapterIds: [firstChapter.id, secondChapter.id],
    });
    const state = {
      ...coursePlannerState({ chapter: firstChapter, scenePack }),
      chaptersByScenePackId: {
        [scenePack.id]: [firstChapter, secondChapter],
      },
    };
    const firstScenePackage = scenePackageFor(firstChapter.id);
    const secondLoad = deferred<Response>();
    const promptMutation = deferred<Response>();
    let latestWorkspace: ChapterWorkspaceSnapshot | null = null;
    const restoreFetch = installFetchMock(async (input, init) => {
      const path = String(input);
      if (path === "/api/course-planner/state" && (!init || init.method === "GET")) {
        return jsonResponse(state);
      }
      if (path === "/api/course-planner/character-ips" && (!init || init.method === "GET")) {
        return jsonResponse({ characterIps: [characterIpFixture()] });
      }
      if (path === "/api/course-planner/scene-style-references" && (!init || init.method === "GET")) {
        return jsonResponse({ sceneStyleReferences: [referenceImageFixture()] });
      }
      if (path.endsWith(`/chapters/${firstChapter.id}/scene-package`) && (!init || init.method === "GET")) {
        return jsonResponse({ scenePackage: firstScenePackage });
      }
      if (path.endsWith(`/chapters/${secondChapter.id}/scene-package`) && (!init || init.method === "GET")) {
        return secondLoad.promise;
      }
      if (path.endsWith(`/chapters/${firstChapter.id}/scene-package/prompt`) && init?.method === "PATCH") {
        return promptMutation.promise;
      }
      throw new Error(`Unexpected fetch call: ${path}`);
    });

    try {
      const view = render(
        <ChapterWorkspaceProbe
          chapterId={firstChapter.id}
          onWorkspace={(workspace) => {
            latestWorkspace = workspace;
          }}
        />,
      );

      await waitFor(() => expect(screen.getByTestId("loaded-scene-package")).toHaveTextContent(firstChapter.id));
      const firstChapterWorkspace = latestWorkspace;
      if (!firstChapterWorkspace) {
        throw new Error("Expected workspace snapshot after first chapter load.");
      }

      void act(() => {
        void firstChapterWorkspace.handlers.handleUpdatePrompt({ promptText: "Late A prompt" });
      });
      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
        `/api/course-planner/chapters/${firstChapter.id}/scene-package/prompt`,
        expect.objectContaining({ method: "PATCH" }),
      ));

      view.rerender(
        <ChapterWorkspaceProbe
          chapterId={secondChapter.id}
          onWorkspace={(workspace) => {
            latestWorkspace = workspace;
          }}
        />,
      );
      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
        `/api/course-planner/chapters/${secondChapter.id}/scene-package`,
        { method: "GET" },
      ));

      await resolveScenePackage(promptMutation, {
        ...firstScenePackage,
        prompt: {
          ...firstScenePackage.prompt,
          prompt_text: "Late A prompt",
        },
      });

      expect(screen.getByTestId("loaded-scene-package")).not.toHaveTextContent(firstChapter.id);
      expect(screen.getByTestId("loaded-scene-package")).toHaveTextContent("loading");
    } finally {
      restoreFetch();
    }
  });
});

type ChapterWorkspaceSnapshot = ReturnType<typeof useChapterScenePackageWorkspace>;

function ChapterWorkspaceProbe({
  chapterId,
  onWorkspace,
}: {
  chapterId: string;
  onWorkspace?: (workspace: ChapterWorkspaceSnapshot) => void;
}) {
  const workspace = useChapterScenePackageWorkspace(chapterId);

  useEffect(() => {
    onWorkspace?.(workspace);
  }, [onWorkspace, workspace]);

  return (
    <div data-testid="loaded-scene-package">
      {workspace.scenePackage?.chapter_id ?? workspace.loadState}
    </div>
  );
}

async function resolveScenePackage(
  load: Deferred<Response>,
  scenePackage: ChapterScenePackage,
) {
  await act(async () => {
    load.resolve(jsonResponse({ scenePackage }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

function scenePackageFor(chapterId: string) {
  return studioScenePackageFixture({
    chapter_id: chapterId,
    prompt: {
      ...studioScenePackageFixture().prompt,
      prompt_text: `Prompt for ${chapterId}`,
    },
  });
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
