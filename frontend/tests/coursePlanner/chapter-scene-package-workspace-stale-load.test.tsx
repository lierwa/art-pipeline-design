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
  STUDIO_CHAPTER_ID,
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
    const promptGeneration = deferred<Response>();
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
      if (path.endsWith(`/chapters/${firstChapter.id}/scene-package/prompt-package/generate`) && init?.method === "POST") {
        return promptGeneration.promise;
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
        void firstChapterWorkspace.handlers.handleGeneratePrompt("Clarify the action.");
      });
      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
        `/api/course-planner/chapters/${firstChapter.id}/scene-package/prompt-package/generate`,
        expect.objectContaining({ method: "POST" }),
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

      await act(async () => {
        promptGeneration.resolve(jsonResponse({
          scenePackage: {
            ...firstScenePackage,
            current_prompt_package: {
              ...firstScenePackage.current_prompt_package!,
              complete_scene_prompt: "Late A prompt",
            },
          },
          task: { id: "task_late", status: "succeeded" },
        }));
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByTestId("loaded-scene-package")).not.toHaveTextContent(firstChapter.id);
      expect(screen.getByTestId("loaded-scene-package")).toHaveTextContent("loading");
    } finally {
      restoreFetch();
    }
  });

  it("coalesces duplicate prompt generation requests for the active chapter", async () => {
    const generation = deferred<Response>();
    const harness = renderPromptGenerationHarness(() => generation.promise);

    try {
      await waitFor(() => expect(screen.getByTestId("loaded-scene-package")).toHaveTextContent(STUDIO_CHAPTER_ID));
      const workspace = harness.workspace();

      let firstRequest: Promise<ChapterScenePackage | null> | null = null;
      let secondRequest: Promise<ChapterScenePackage | null> | null = null;
      act(() => {
        firstRequest = workspace.handlers.handleGeneratePrompt("");
        secondRequest = workspace.handlers.handleGeneratePrompt("ignored duplicate");
      });

      expect(firstRequest).toBe(secondRequest);
      await waitFor(() => expect(screen.getByTestId("prompt-generating")).toHaveTextContent("true"));
      expect(harness.generationCalls()).toBe(1);

      generation.resolve(jsonResponse({
        scenePackage: studioScenePackageFixture(),
        task: { id: "task_prompt", status: "succeeded" },
      }));
      await act(async () => {
        await firstRequest;
      });
      expect(screen.getByTestId("prompt-generating")).toHaveTextContent("false");
    } finally {
      harness.restore();
    }
  });

  it("preserves the last successful prompt package when generation fails", async () => {
    const harness = renderPromptGenerationHarness(() => new Response(
      JSON.stringify({ detail: "AI generation failed" }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    ));

    try {
      await waitFor(() => expect(screen.getByTestId("loaded-scene-package")).toHaveTextContent(STUDIO_CHAPTER_ID));
      const previousPrompt = screen.getByTestId("complete-prompt").textContent;

      await act(async () => {
        await harness.workspace().handlers.handleGeneratePrompt("Try again");
      });

      expect(screen.getByTestId("loaded-scene-package")).toHaveTextContent(STUDIO_CHAPTER_ID);
      expect(screen.getByTestId("complete-prompt")).toHaveTextContent(previousPrompt ?? "");
      expect(harness.generationCalls()).toBe(1);
    } finally {
      harness.restore();
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
    <>
      <div data-testid="loaded-scene-package">
        {workspace.scenePackage?.chapter_id ?? workspace.loadState}
      </div>
      <div data-testid="prompt-generating">{String(workspace.isGeneratingPrompt)}</div>
      <div data-testid="complete-prompt">
        {workspace.scenePackage?.current_prompt_package?.complete_scene_prompt ?? ""}
      </div>
    </>
  );
}

function renderPromptGenerationHarness(
  generate: () => Promise<Response> | Response,
) {
  const chapter = studioChapterFixture();
  const scenePack = studioScenePackFixture();
  const state = coursePlannerState({ chapter, scenePack });
  let latestWorkspace: ChapterWorkspaceSnapshot | null = null;
  let generationCallCount = 0;
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
    if (path.endsWith(`/chapters/${chapter.id}/scene-package`) && (!init || init.method === "GET")) {
      return jsonResponse({ scenePackage: studioScenePackageFixture() });
    }
    if (path.endsWith(`/chapters/${chapter.id}/scene-package/prompt-package/generate`) && init?.method === "POST") {
      generationCallCount += 1;
      return generate();
    }
    throw new Error(`Unexpected fetch call: ${path}`);
  });
  const rendered = render(
    <ChapterWorkspaceProbe
      chapterId={chapter.id}
      onWorkspace={(workspace) => {
        latestWorkspace = workspace;
      }}
    />,
  );

  return {
    generationCalls: () => generationCallCount,
    restore: () => {
      rendered.unmount();
      restoreFetch();
    },
    workspace: () => {
      if (!latestWorkspace) {
        throw new Error("Expected a loaded Chapter workspace.");
      }
      return latestWorkspace;
    },
  };
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
  const base = studioScenePackageFixture();
  return studioScenePackageFixture({
    chapter_id: chapterId,
    current_prompt_package: {
      ...base.current_prompt_package!,
      complete_scene_prompt: `Prompt for ${chapterId}`,
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
