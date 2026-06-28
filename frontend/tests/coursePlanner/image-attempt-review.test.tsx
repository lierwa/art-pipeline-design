import { MemoryRouter, Route, Routes } from "react-router";
import { vi } from "vitest";

import {
  describe,
  expect,
  it,
  render,
  screen,
  userEvent,
  within,
} from "../app/appTestHarness";

import { ImageAttemptReviewPage } from "../../src/features/coursePlanner/pages/ImageAttemptReviewPage";
import type { CoursePlannerController } from "../../src/features/coursePlanner/hooks/useCoursePlannerState";
import type { Chapter, CoursePlannerState, ImageAttempt, PromptVersion, ScenePack } from "../../src/features/coursePlanner/types";

const mockUseCoursePlannerState = vi.hoisted(() => vi.fn<() => CoursePlannerController>());

vi.mock("../../src/features/coursePlanner/hooks/useCoursePlannerState", () => ({
  useCoursePlannerState: () => mockUseCoursePlannerState(),
}));

describe("Image Attempt Review Page", () => {
  it("shows lineage, attempt history, preview, and AI review details", () => {
    mockUseCoursePlannerState.mockReturnValue(controller());

    renderReviewPage();

    expect(screen.getByRole("heading", { name: "Image Attempt Review" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Image attempt lineage" })).toHaveTextContent(
      "室内家庭篇早餐厨房V002 - morning counterattempt_002",
    );

    const history = screen.getByRole("region", { name: "Attempt history" });
    expect(within(history).getByRole("link", { name: /Attempt 002 ai_reviewed/i })).toHaveAttribute(
      "href",
      "/course-planner/chapters/chapter_breakfast_kitchen/versions/version_breakfast_002/attempts/attempt_002",
    );
    expect(within(history).getByRole("link", { name: /Attempt 001 uploaded/i })).toBeInTheDocument();

    const preview = screen.getByRole("region", { name: "Uploaded image preview" });
    expect(within(preview).getByRole("img", { name: "Uploaded image for attempt_002" })).toHaveAttribute(
      "src",
      "/assets/generated/breakfast-002.png",
    );
    expect(within(preview).getByRole("button", { name: "Fit" })).toBeInTheDocument();
    expect(within(preview).getByRole("button", { name: "Zoom 150%" })).toBeInTheDocument();

    const review = screen.getByRole("region", { name: "Review and import controls" });
    expect(within(review).getByText("Composition matches the prompt with clear kitchen objects.")).toBeInTheDocument();
    expect(within(review).getByText("杯子、冰箱、麦片盒都可见")).toBeInTheDocument();
    expect(within(review).getByText("孩子手部遮挡杯子边缘")).toBeInTheDocument();
    expect(within(review).getByText("accept")).toBeInTheDocument();
  });

  it("runs review/import actions and persists human decisions", async () => {
    const user = userEvent.setup();
    const planner = controller();
    mockUseCoursePlannerState.mockReturnValue(planner);

    renderReviewPage();

    const review = screen.getByRole("region", { name: "Review and import controls" });
    await user.click(within(review).getByRole("button", { name: "Rerun AI Review" }));
    expect(planner.reviewImageAttempt).toHaveBeenCalledWith("attempt_002");

    await user.click(within(review).getByRole("button", { name: "Accept / Import to Pipeline" }));
    expect(planner.importImageAttempt).toHaveBeenCalledWith("attempt_002");

    await user.click(within(review).getByRole("button", { name: "Mark Not Accepted" }));
    expect(planner.updateImageAttempt).toHaveBeenCalledWith("attempt_002", {
      status: "not_accepted",
      humanDecision: "revise_version",
    });

    await user.click(within(review).getByRole("button", { name: "Keep Record" }));
    expect(planner.updateImageAttempt).toHaveBeenCalledWith("attempt_002", {
      humanDecision: "keep_record",
    });

    await user.click(within(review).getByRole("button", { name: "Delete Attempt" }));
    expect(planner.updateImageAttempt).toHaveBeenCalledWith("attempt_002", {
      status: "not_accepted",
      humanDecision: "delete",
    });
  });

  it("shows persisted decisions from attempt state without local placeholders", async () => {
    const user = userEvent.setup();
    mockUseCoursePlannerState.mockReturnValue(
      controller({
        attempts: [
          attempt("attempt_001", "/assets/generated/breakfast-001.png", "uploaded"),
          {
            ...attempt("attempt_002", "/assets/generated/breakfast-002.png", "not_accepted"),
            humanDecision: "delete",
          },
        ],
      }),
    );

    renderReviewPage();

    const review = screen.getByRole("region", { name: "Review and import controls" });
    expect(within(review).getByText("Human decision: delete")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: /Attempt 001 uploaded/i }));

    expect(screen.getByRole("img", { name: "Uploaded image for attempt_001" })).toBeInTheDocument();
    expect(screen.queryByText("Human decision: delete")).not.toBeInTheDocument();
  });

  it("returns to the same prompt version context", () => {
    mockUseCoursePlannerState.mockReturnValue(controller());

    renderReviewPage();

    expect(screen.getByRole("link", { name: "Back to Version" })).toHaveAttribute(
      "href",
      "/course-planner/chapters/chapter_breakfast_kitchen?versionId=version_breakfast_002",
    );
  });

  it("shows a placeholder when the uploaded image id is not previewable", () => {
    mockUseCoursePlannerState.mockReturnValue(
      controller({
        attempts: [
          {
            ...attempt("attempt_002", "opaque_upload_asset_id", "ai_reviewed"),
            aiReview: null,
          },
        ],
      }),
    );

    renderReviewPage();

    const preview = screen.getByRole("region", { name: "Uploaded image preview" });
    expect(within(preview).getByText("Image preview unavailable")).toBeInTheDocument();
    expect(within(preview).getByText("opaque_upload_asset_id")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run AI Review" })).toBeInTheDocument();
  });

  it("maps persisted uploaded image ids to the Course Planner upload preview endpoint", () => {
    mockUseCoursePlannerState.mockReturnValue(
      controller({
        attempts: [
          attempt(
            "attempt_002",
            "uploads/course_planner/version_breakfast_002/generated.png",
            "uploaded",
          ),
        ],
      }),
    );

    renderReviewPage();

    expect(screen.getByRole("img", { name: "Uploaded image for attempt_002" })).toHaveAttribute(
      "src",
      "/api/course-planner/uploads/uploads/course_planner/version_breakfast_002/generated.png",
    );
  });
});

function renderReviewPage() {
  render(
    <MemoryRouter initialEntries={["/course-planner/chapters/chapter_breakfast_kitchen/versions/version_breakfast_002/attempts/attempt_002"]}>
      <Routes>
        <Route
          path="/course-planner/chapters/:chapterId/versions/:versionId/attempts/:attemptId"
          element={<ImageAttemptReviewPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

type ControllerOptions = {
  attempts?: ImageAttempt[];
};

function controller(options: ControllerOptions = {}): CoursePlannerController {
  const state = coursePlannerState(options);
  return {
    ...state,
    activeScenePack: state.scenePacks[0],
    candidatesForActiveScenePack: [],
    chaptersForActiveScenePack: [chapter()],
    imageAttemptsForSelectedPromptVersion: options.attempts ?? attempts(),
    promptVersionsForSelectedChapter: [promptVersion()],
    selectedChapter: chapter(),
    selectedPromptVersion: promptVersion(),
    state,
    createScenePack: vi.fn(),
    updateScenePack: vi.fn(),
    deleteScenePack: vi.fn(),
    generateChapterCandidates: vi.fn(),
    reviseChapterCandidates: vi.fn(),
    deleteChapterCandidate: vi.fn(),
    acceptChapterCandidate: vi.fn(),
    reorderChapters: vi.fn(),
    setChapterListLocked: vi.fn(),
    deleteChapter: vi.fn(),
    listPromptVersions: vi.fn(),
    createPromptVersion: vi.fn(),
    duplicatePromptVersion: vi.fn(),
    updatePromptVersion: vi.fn(),
    deletePromptVersion: vi.fn(),
    generatePromptPackage: vi.fn(),
    listImageAttempts: vi.fn(),
    createImageAttempt: vi.fn(),
    reviewImageAttempt: vi.fn(),
    importImageAttempt: vi.fn(),
    updateImageAttempt: vi.fn(),
    refresh: vi.fn(),
    setActiveScenePackId: vi.fn(),
    setSelectedChapterId: vi.fn(),
    setSelectedPromptVersionId: vi.fn(),
  } as unknown as CoursePlannerController;
}

function coursePlannerState(options: ControllerOptions): CoursePlannerState {
  return {
    scenePacks: [scenePack()],
    activeScenePackId: "pack_home",
    candidatesByScenePackId: {},
    chaptersByScenePackId: { pack_home: [chapter()] },
    promptVersionsByChapterId: { chapter_breakfast_kitchen: [promptVersion()] },
    imageAttemptsByVersionId: { version_breakfast_002: options.attempts ?? attempts() },
    selectedChapterId: "chapter_breakfast_kitchen",
    selectedPromptVersionId: "version_breakfast_002",
    asyncStatus: {},
    tasks: [],
  };
}

function scenePack(): ScenePack {
  return {
    id: "pack_home",
    title: "室内家庭篇",
    intent: "家庭高频视觉场景。",
    status: "active",
    chapterIds: ["chapter_breakfast_kitchen"],
  };
}

function chapter(): Chapter {
  return {
    id: "chapter_breakfast_kitchen",
    scenePackId: "pack_home",
    title: "早餐厨房",
    summary: "厨房餐台和冰箱前的早晨动线",
    seed: {
      scenePackId: "pack_home",
      scenePackTitle: "室内家庭篇",
      chapterId: "chapter_breakfast_kitchen",
      chapterTitle: "早餐厨房",
      chapterIntent: "厨房餐台和冰箱前的早晨动线",
      sceneDomain: "indoor-home",
      dailyMoment: "morning",
      eventSeed: "找牛奶、拿杯子、准备早餐",
      spatialSeed: "冰箱、杯子、麦片盒",
      objectCoverageHint: ["冰箱", "杯子", "麦片盒"],
      characterConceptHint: {
        castMode: "main_cast_and_supporting_cast",
        mainCastHint: "孩子",
        supportingCastHint: "家长",
        constraints: ["保持家庭主角一致"],
      },
    },
    sortOrder: 1,
    status: "has_attempts",
    adoptedPromptVersionId: "version_breakfast_002",
  };
}

function promptVersion(): PromptVersion {
  return {
    id: "version_breakfast_002",
    chapterId: "chapter_breakfast_kitchen",
    versionLabel: "V002",
    title: "morning counter",
    status: "has_attempts",
    sceneDirectorPlan: {
      storyEvent: "孩子拿杯子准备早餐",
      sceneComposition: "中景厨房餐台",
      spatialStructure: "冰箱在左，餐台在右",
      characterArrangement: "孩子靠近餐台，家长在背景",
      actionDesign: "拿杯子并看向麦片盒",
      styleAndConstraints: "clean storybook image",
    },
    objectPlan: {
      coreObjects: [{ name: "杯子", roleInScene: "早餐动作核心", priority: "core" }],
      requiredObjects: [{ name: "冰箱", roleInScene: "空间锚点", priority: "required" }],
      recommendedObjects: [{ name: "麦片盒", roleInScene: "早餐语境", priority: "recommended" }],
      avoidOrMoveObjects: [],
    },
    promptPackage: {
      fullPrompt: "Create a breakfast kitchen scene with a child holding a cup near the counter.",
      negativeConstraints: "No text, no extra hands.",
      shortPrompt: "Breakfast kitchen with cup.",
    },
    sourceVersionId: "version_breakfast_001",
    imageAttemptIds: ["attempt_001", "attempt_002"],
  };
}

function attempts(): ImageAttempt[] {
  return [
    attempt("attempt_001", "/assets/generated/breakfast-001.png", "uploaded"),
    {
      ...attempt("attempt_002", "/assets/generated/breakfast-002.png", "ai_reviewed"),
      aiReview: {
        summary: "Composition matches the prompt with clear kitchen objects.",
        strengths: ["杯子、冰箱、麦片盒都可见"],
        issues: ["孩子手部遮挡杯子边缘"],
        recommendation: "accept",
      },
    },
  ];
}

function attempt(id: string, uploadedImageId: string, status: ImageAttempt["status"]): ImageAttempt {
  return {
    id,
    promptVersionId: "version_breakfast_002",
    uploadedImageId,
    status,
    aiReview: null,
    humanDecision: null,
    pipelineImportId: null,
  };
}
