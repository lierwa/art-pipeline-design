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
  vi,
  waitFor,
  within,
} from "../app/appTestHarness";
import { coursePlannerState } from "./chapterWorkspaceTestHelpers";

import { GlobalReferenceLibraryDrawer } from "../../src/features/coursePlanner/components/GlobalReferenceLibraryDrawer";

describe("GlobalReferenceLibraryDrawer", () => {
  it("opens from the Scene secondary header without replacing the board", async () => {
    const user = userEvent.setup();
    const restoreFetch = installFetchMock(async (input, init) => {
      const path = String(input);
      if (path === "/api/workspace/runs") return jsonResponse({ runs: [] });
      if (path === "/api/workspace/state") return jsonResponse({ source: null, elements: [], detectionVocabulary: [] });
      if (path === "/api/course-planner/state") return jsonResponse(coursePlannerState());
      if (path === "/api/course-planner/character-ips") return jsonResponse({ characterIps: [characterFixture()] });
      if (path === "/api/course-planner/scene-style-references") return jsonResponse({ sceneStyleReferences: [styleFixture()] });
      throw new Error(`Unexpected request: ${path} ${init?.method ?? "GET"}`);
    });
    try {
      window.history.pushState({}, "", "/course-planner");
      render(<App />);
      const board = await screen.findByRole("main");
      const libraryEntry = await screen.findByRole("button", { name: "资料库" });
      expect(libraryEntry).toHaveClass("shared-icon-button", "shared-icon-button-with-label");
      await user.click(libraryEntry);

      expect(await screen.findByRole("dialog", { name: "资料库" })).toBeInTheDocument();
      expect(board).toBeInTheDocument();
      expect(board.querySelector('[aria-label="Scene Pack list"]')).not.toBeNull();
    } finally {
      restoreFetch();
      window.history.pushState({}, "", "/");
    }
  });

  it("shows only the two approved libraries and one complete image per card", async () => {
    const user = userEvent.setup();
    const restoreFetch = installLibraryFetchMock();
    try {
      render(<GlobalReferenceLibraryDrawer isOpen onClose={() => {}} />);

      const drawer = await screen.findByRole("dialog", { name: "资料库" });
      await within(drawer).findByRole("img", { name: "团团角色设定图" });
      expect(within(drawer).getAllByRole("tab")).toHaveLength(2);
      expect(within(drawer).getByRole("tab", { name: "角色 IP" })).toBeInTheDocument();
      expect(within(drawer).getByRole("tab", { name: "场景风格" })).toBeInTheDocument();
      expect(within(drawer).getByRole("img", { name: "团团角色设定图" })).toHaveAttribute(
        "src",
        "/api/course-planner/character-ips/character_ip_001/model-sheet",
      );
      expect(within(drawer).getAllByRole("img")).toHaveLength(1);
      expect(drawer).not.toHaveTextContent(/搜索|筛选|标签|状态|引用次数/);

      const characterTab = within(drawer).getByRole("tab", { name: "角色 IP" });
      await user.click(characterTab);
      await user.keyboard("{ArrowRight}");
      expect(within(drawer).getByRole("tab", { name: "场景风格" })).toHaveAttribute("data-state", "active");
      await user.keyboard("{ArrowLeft}");
      expect(characterTab).toHaveAttribute("data-state", "active");

      await user.click(within(drawer).getByRole("tab", { name: "场景风格" }));
      expect(within(drawer).getByRole("img", { name: "暖色绘本室内场景风格参考图" })).toBeInTheDocument();
      expect(within(drawer).getAllByRole("img")).toHaveLength(1);
    } finally {
      restoreFetch();
    }
  });

  it("keeps the minimal create form intact after a failed save so it can retry", async () => {
    const user = userEvent.setup();
    let createAttempts = 0;
    const restoreFetch = installLibraryFetchMock(async (input, init) => {
      if (String(input).endsWith("/character-ips") && init?.method === "POST") {
        createAttempts += 1;
        return createAttempts === 1
          ? jsonResponse({ detail: "temporary failure" }, 500)
          : jsonResponse({ characterIp: characterFixture({ id: "character_ip_002", display_name: "妈妈" }) });
      }
      return null;
    });
    try {
      render(<GlobalReferenceLibraryDrawer isOpen onClose={() => {}} />);
      const drawer = await screen.findByRole("dialog", { name: "资料库" });
      await user.click(within(drawer).getByRole("button", { name: "创建角色 IP" }));

      expect(within(drawer).getAllByRole("textbox")).toHaveLength(1);
      expect(within(drawer).getAllByLabelText("角色设定图")).toHaveLength(1);
      expect(within(drawer).queryByLabelText(/性格|设定文字|标签|备注/)).not.toBeInTheDocument();
      await user.type(within(drawer).getByLabelText("名称"), "妈妈");
      await user.upload(
        within(drawer).getByLabelText("角色设定图"),
        new File(["png"], "mama-sheet.png", { type: "image/png" }),
      );
      const submit = within(drawer).getByRole("button", { name: "创建" });
      await user.click(submit);

      expect(await within(drawer).findByRole("alert")).toHaveTextContent("temporary failure");
      expect(within(drawer).getByLabelText("名称")).toHaveValue("妈妈");
      expect(within(drawer).getByLabelText("角色设定图")).toHaveProperty("files.length", 1);
      await user.click(submit);
      await waitFor(() => expect(createAttempts).toBe(2));
      expect(await within(drawer).findByText("妈妈")).toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("asks before discarding a dirty editor and keeps editing when cancelled", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const restoreFetch = installLibraryFetchMock();
    try {
      render(<GlobalReferenceLibraryDrawer isOpen onClose={onClose} />);
      const drawer = await screen.findByRole("dialog", { name: "资料库" });
      await user.click(within(drawer).getByRole("button", { name: "创建角色 IP" }));
      await user.type(within(drawer).getByLabelText("名称"), "团团新设定");

      await user.click(within(drawer).getByRole("button", { name: "关闭创建角色 IP" }));
      const confirmation = await screen.findByRole("alertdialog", { name: "放弃未保存修改？" });
      await user.click(within(confirmation).getByRole("button", { name: "继续编辑" }));
      expect(within(drawer).getByLabelText("名称")).toHaveValue("团团新设定");
      expect(onClose).not.toHaveBeenCalled();

      await user.click(within(drawer).getByRole("button", { name: "关闭创建角色 IP" }));
      await user.click(within(await screen.findByRole("alertdialog", { name: "放弃未保存修改？" }))
        .getByRole("button", { name: "放弃修改" }));
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      restoreFetch();
    }
  });

  it("keeps referenced records in edit mode and explains how many Chapters use them", async () => {
    const user = userEvent.setup();
    const restoreFetch = installLibraryFetchMock((input, init) => {
      if (String(input).includes("/character-ips/character_ip_001") && init?.method === "DELETE") {
        return jsonResponse({
          detail: { code: "library_item_in_use", referencedChapterCount: 2 },
        }, 409);
      }
      return null;
    });
    try {
      render(<GlobalReferenceLibraryDrawer isOpen onClose={() => {}} />);
      const drawer = await screen.findByRole("dialog", { name: "资料库" });
      await within(drawer).findByRole("img", { name: "团团角色设定图" });
      await user.click(within(drawer).getByRole("button", { name: "编辑" }));
      await user.click(within(drawer).getByRole("button", { name: "删除" }));
      const dialog = await screen.findByRole("alertdialog", { name: "删除角色 IP？" });
      await user.click(within(dialog).getByRole("button", { name: "确认删除" }));

      expect(await within(drawer).findByRole("alert")).toHaveTextContent("正在被 2 个 Chapter 使用");
      expect(within(drawer).getByLabelText("名称")).toHaveValue("团团");
    } finally {
      restoreFetch();
    }
  });
});

function installLibraryFetchMock(
  override?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response | null> | Response | null,
) {
  return installFetchMock(async (input, init) => {
    const overridden = await override?.(input, init);
    if (overridden) {
      return overridden;
    }
    const path = String(input);
    if (path.endsWith("/character-ips") && (!init || init.method === "GET")) {
      return jsonResponse({ characterIps: [characterFixture()] });
    }
    if (path.endsWith("/scene-style-references") && (!init || init.method === "GET")) {
      return jsonResponse({ sceneStyleReferences: [styleFixture()] });
    }
    throw new Error(`Unexpected request: ${path} ${init?.method ?? "GET"}`);
  });
}

function characterFixture(overrides = {}) {
  return {
    id: "character_ip_001",
    display_name: "团团",
    current_model_sheet_id: "character_model_sheet_001",
    created_at: "2026-07-11T12:00:00Z",
    updated_at: null,
    ...overrides,
  };
}

function styleFixture() {
  return {
    id: "scene_style_001",
    display_name: "暖色绘本室内",
    current_image_id: "scene_style_image_001",
    created_at: "2026-07-11T12:00:00Z",
    updated_at: null,
  };
}
