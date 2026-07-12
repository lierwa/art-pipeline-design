import { useState } from "react";

import {
  describe,
  expect,
  it,
  render,
  screen,
  userEvent,
  vi,
  within,
} from "../app/appTestHarness";

import { CoursePlannerDrawer } from "../../src/features/coursePlanner/components/CoursePlannerChrome";

describe("CoursePlannerDrawer", () => {
  it("keeps a controlled input focused when the parent rebuilds onClose", async () => {
    const user = userEvent.setup();
    render(<DrawerHarness />);

    await user.click(screen.getByRole("button", { name: "打开资料库" }));
    const drawer = await screen.findByRole("dialog", { name: "资料库" });
    const input = within(drawer).getByRole("textbox", { name: "名称" });
    await user.click(input);
    await user.type(input, "团团");

    expect(input).toHaveValue("团团");
    expect(input).toHaveFocus();
  });

  it("traps modal focus, closes once from Escape, and restores the trigger focus", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<DrawerHarness onClose={onClose} />);

    const trigger = screen.getByRole("button", { name: "打开资料库" });
    await user.click(trigger);
    const drawer = await screen.findByRole("dialog", { name: "资料库" });
    expect(drawer).toContainElement(document.activeElement as HTMLElement);
    expect(drawer).toHaveFocus();

    for (let index = 0; index < 4; index += 1) {
      await user.tab();
      expect(drawer).toContainElement(document.activeElement as HTMLElement);
    }

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "资料库" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes once from the modal backdrop", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<DrawerHarness onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "打开资料库" }));
    const backdrop = document.querySelector(".course-planner-drawer-backdrop");
    expect(backdrop).not.toBeNull();
    await user.click(backdrop as HTMLElement);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "资料库" })).not.toBeInTheDocument();
  });

  it("keeps a non-modal drawer beside the page without a backdrop", () => {
    render(
      <main className="assembly-page-grid" data-testid="page-grid">
        <p>Assembly canvas</p>
        <CoursePlannerDrawer title="Generated Chapter Assets" isOpen onClose={() => {}} modal={false}>
          <button type="button">Add asset</button>
        </CoursePlannerDrawer>
      </main>,
    );

    expect(screen.getByRole("dialog", { name: "Generated Chapter Assets" })).toBeInTheDocument();
    expect(document.querySelector(".course-planner-drawer-backdrop")).toBeNull();
    expect(screen.getByTestId("page-grid")).toHaveClass("assembly-page-grid");
    expect(screen.getByText("Assembly canvas")).toBeInTheDocument();
  });

  it("allows page interaction without dismissing a non-modal drawer", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <>
        <button type="button">Assembly canvas</button>
        <CoursePlannerDrawer title="Generated Chapter Assets" isOpen onClose={onClose} modal={false}>
          <button type="button">Add asset</button>
        </CoursePlannerDrawer>
      </>,
    );

    await user.click(screen.getByRole("button", { name: "Assembly canvas" }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Generated Chapter Assets" })).toBeInTheDocument();
  });
});

function DrawerHarness({ onClose = () => {} }: { onClose?: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>打开资料库</button>
      <CoursePlannerDrawer
        title="资料库"
        isOpen={isOpen}
        modal
        onClose={() => {
          onClose();
          setIsOpen(false);
        }}
      >
        <label>
          名称
          <input value={name} onChange={(event) => setName(event.currentTarget.value)} />
        </label>
        <button type="button">次要操作</button>
      </CoursePlannerDrawer>
    </>
  );
}
